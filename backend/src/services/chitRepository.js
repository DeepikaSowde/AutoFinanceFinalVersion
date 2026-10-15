// src/services/chitRepository.js
//
// Chit investments: companies, their chit schemes, and the money paid into
// ("Chit Paid") or received from ("Chit Income") a scheme. A transaction books
// its expense or income in the same database transaction, so it shows in the
// Ledger / Income / Expense views exactly once. Every query is tenant-scoped.

import { query, withTransaction } from "../db/connection.js";
import { currentTenantId } from "../db/tenantContext.js";
import { insertExpense } from "./expenseRepository.js";
import { insertIncome } from "./incomeRepository.js";

const roundMoney = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round((number + Number.EPSILON) * 100) / 100 : 0;
};
const pad = (number, length = 4) => String(number).padStart(length, "0");
const iso = (value) => (value ? new Date(value).toISOString() : "");
const httpError = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

export const CHIT_CATEGORY = "Chit Investment";
const TYPES = ["Chit Paid", "Chit Income"];

/* ---------- shapes the Chit Investment page reads ---------- */

const mapScheme = (row) => {
  const totalValue = Number(row.total_value);
  const totalPayments = Number(row.total_payments);
  const perPayment = Number(row.payment_amount);
  const monthly = row.payment_frequency === "Monthly";
  return {
    id: row.id,
    name: row.name,
    totalValue,
    chitValue: totalValue,
    paymentFrequency: row.payment_frequency,
    totalPayments,
    durationMonths: monthly ? totalPayments : Math.ceil(totalPayments / 4),
    amountPerPayment: perPayment,
    monthlyInstallment: monthly ? perPayment : Math.round(perPayment * 4),
    createdAt: iso(row.created_at),
  };
};

const mapTransaction = (row) => ({
  id: row.id,
  type: row.type,
  category: row.type === "Chit Paid" ? "Expense" : "Income",
  companyId: row.company_id,
  companyName: row.company_name,
  chitId: row.scheme_id,
  chitName: row.scheme_name,
  amount: Number(row.amount),
  date: row.txn_date,
  paymentType: row.payment_mode,
  expenseId: row.expense_id || "",
  incomeId: row.income_id || "",
  createdAt: iso(row.created_at),
});

/* ---------- reads ---------- */

export const getChitCompanies = async () => {
  const tenantId = currentTenantId();
  const [companies, schemes] = await Promise.all([
    query("SELECT * FROM chit_companies WHERE tenant_id = $1 ORDER BY pk", [tenantId]),
    query("SELECT * FROM chit_schemes WHERE tenant_id = $1 ORDER BY pk", [tenantId]),
  ]);
  return companies.rows.map((c) => ({
    id: c.id,
    name: c.name,
    createdAt: iso(c.created_at),
    chits: schemes.rows.filter((s) => s.company_pk === c.pk).map(mapScheme),
  }));
};

const SELECT_TRANSACTIONS = `
  SELECT t.*, s.id AS scheme_id, s.name AS scheme_name, c.id AS company_id, c.name AS company_name
  FROM chit_transactions t
  JOIN chit_schemes s ON s.pk = t.scheme_pk
  JOIN chit_companies c ON c.pk = s.company_pk`;

export const getChitTransactions = async () => {
  const result = await query(`${SELECT_TRANSACTIONS} WHERE t.tenant_id = $1 ORDER BY t.txn_date DESC, t.pk DESC`, [
    currentTenantId(),
  ]);
  return result.rows.map(mapTransaction);
};

/* ---------- writes ---------- */

// Validates scheme rows exactly as the page does, before anything is written.
const cleanSchemes = (chits) => {
  if (!Array.isArray(chits) || chits.length === 0) throw httpError("Add at least one chit scheme.");
  return chits.map((ch, i) => {
    const name = String(ch?.name || "").trim();
    const totalValue = roundMoney(ch?.totalValue);
    const totalPayments = Math.trunc(Number(ch?.totalPayments));
    if (!name) throw httpError(`Please enter a Scheme Name for Chit #${i + 1}.`);
    if (!(totalValue > 0)) throw httpError(`Please enter a valid Total Value greater than 0 for Chit #${i + 1}.`);
    if (!(totalPayments > 0)) throw httpError(`Please enter a valid Total Number of Payments greater than 0 for Chit #${i + 1}.`);
    return {
      name,
      totalValue,
      totalPayments,
      paymentFrequency: ch?.paymentFrequency === "Weekly" ? "Weekly" : "Monthly",
      paymentAmount: Math.round((totalValue / totalPayments) * 100) / 100,
    };
  });
};

const insertSchemes = async (client, companyPk, schemes) => {
  for (const s of schemes) {
    const r = await client.query(
      `INSERT INTO chit_schemes
        (id, tenant_id, company_pk, name, total_value, payment_frequency, total_payments, payment_amount)
       VALUES ('', $1, $2, $3, $4, $5, $6, $7) RETURNING pk`,
      [currentTenantId(), companyPk, s.name, s.totalValue, s.paymentFrequency, s.totalPayments, s.paymentAmount]
    );
    await client.query("UPDATE chit_schemes SET id = $1 WHERE pk = $2", [`CHS-${pad(r.rows[0].pk)}`, r.rows[0].pk]);
  }
};

/** A new company with its first schemes. */
export const createChitCompany = async ({ name, chits } = {}, createdBy) => {
  const companyName = String(name || "").trim();
  if (!companyName) throw httpError("Please enter the company name.");
  const schemes = cleanSchemes(chits);

  await withTransaction(async (client) => {
    const dup = await client.query(
      "SELECT 1 FROM chit_companies WHERE tenant_id = $1 AND lower(name) = lower($2)",
      [currentTenantId(), companyName]
    );
    if (dup.rowCount) throw httpError(`A company named "${companyName}" already exists — add the schemes to it instead.`, 409);

    const r = await client.query(
      "INSERT INTO chit_companies (id, tenant_id, name, created_by) VALUES ('', $1, $2, $3) RETURNING pk",
      [currentTenantId(), companyName, createdBy || null]
    );
    const pk = r.rows[0].pk;
    await client.query("UPDATE chit_companies SET id = $1 WHERE pk = $2", [`CHC-${pad(pk)}`, pk]);
    await insertSchemes(client, pk, schemes);
  });

  return getChitCompanies();
};

/** More schemes for an existing company; its earlier schemes are untouched. */
export const addChitSchemes = async (companyId, chits) => {
  const schemes = cleanSchemes(chits);
  const found = await withTransaction(async (client) => {
    const c = await client.query("SELECT pk FROM chit_companies WHERE id = $1 AND tenant_id = $2", [
      companyId,
      currentTenantId(),
    ]);
    if (!c.rows[0]) return false;
    await insertSchemes(client, c.rows[0].pk, schemes);
    return true;
  });
  return found ? getChitCompanies() : null;
};

/**
 * A chit payment or receipt, with its expense ("Chit Paid") or income
 * ("Chit Income") booked in the same transaction.
 */
export const createChitTransaction = async ({ type, chitId, amount, date, paymentType } = {}, createdBy) => {
  if (!TYPES.includes(type)) throw httpError("Transaction type must be Chit Paid or Chit Income.");
  const value = roundMoney(amount);
  if (!(value > 0)) throw httpError("Please enter an amount greater than 0.");
  const txnDate = String(date || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
  const mode = String(paymentType || "Cash").trim() || "Cash";

  const id = await withTransaction(async (client) => {
    const s = await client.query(
      `SELECT s.pk, s.id, s.name, c.id AS company_id, c.name AS company_name
       FROM chit_schemes s JOIN chit_companies c ON c.pk = s.company_pk
       WHERE s.id = $1 AND s.tenant_id = $2`,
      [chitId, currentTenantId()]
    );
    const scheme = s.rows[0];
    if (!scheme) throw httpError("Chit scheme not found.", 404);

    const r = await client.query(
      `INSERT INTO chit_transactions (id, tenant_id, scheme_pk, type, amount, txn_date, payment_mode, created_by)
       VALUES ('', $1, $2, $3, $4, $5, $6, $7) RETURNING pk`,
      [currentTenantId(), scheme.pk, type, value, txnDate, mode, createdBy || null]
    );
    const pk = r.rows[0].pk;
    const txId = `CHT-${pad(pk)}`;

    const link = {
      chitTxId: txId,
      companyId: scheme.company_id,
      companyName: scheme.company_name,
      chitId: scheme.id,
      chitName: scheme.name,
    };
    let expenseId = null;
    let incomeId = null;
    if (type === "Chit Paid") {
      expenseId = await insertExpense(client, {
        amount: value,
        status: "Paid",
        category: CHIT_CATEGORY,
        expenseDate: txnDate,
        paymentMode: mode,
        vendor: scheme.company_name,
        reference: txId,
        remarks: `Chit Paid: ${scheme.company_name} (${scheme.name})`,
        ...link,
        isChitPayment: true,
      });
    } else {
      incomeId = await insertIncome(client, {
        amount: value,
        status: "Received",
        category: CHIT_CATEGORY,
        incomeDate: txnDate,
        paymentMode: mode,
        receivedFrom: scheme.company_name,
        reference: txId,
        remarks: `Chit Income: ${scheme.company_name} (${scheme.name})`,
        ...link,
        isChitIncome: true,
      });
    }

    await client.query("UPDATE chit_transactions SET id = $1, expense_id = $2, income_id = $3 WHERE pk = $4", [
      txId,
      expenseId,
      incomeId,
      pk,
    ]);
    return txId;
  });

  const result = await query(`${SELECT_TRANSACTIONS} WHERE t.id = $1 AND t.tenant_id = $2`, [id, currentTenantId()]);
  return mapTransaction(result.rows[0]);
};
