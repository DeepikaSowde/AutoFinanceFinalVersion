// src/services/incomeRepository.js
//
// Manual, non-loan income (referrals, misc revenue, etc). Mirrors
// expenseRepository.js — same shape, same jsonb overflow for anything
// beyond the columns that get filtered/summed.

import { query, withTransaction } from "../db/connection.js";
import { currentTenantId } from "../db/tenantContext.js";

const roundMoney = (value) => {
  const number = Number(value);

  return Number.isFinite(number) ? Math.round((number + Number.EPSILON) * 100) / 100 : 0;
};

const pad = (number, length = 4) => String(number).padStart(length, "0");

const iso = (value) => (value ? new Date(value).toISOString() : "");

const KNOWN_FIELDS = new Set([
  "id",
  "amount",
  "status",
  "category",
  "subCategory",
  "incomeDate",
  "date",
  "paymentMode",
  "receivedFrom",
  "reference",
  "description",
  "remarks",
  "createdBy",
  "recordedBy",
  "createdAt",
  "updatedAt",
]);

const extraFields = (income) =>
  Object.fromEntries(Object.entries(income).filter(([key]) => !KNOWN_FIELDS.has(key)));

const mapIncome = (row) => ({
  ...(row.details ?? {}),
  id: row.id,
  amount: row.amount,
  status: row.status,
  category: row.category || "",
  subCategory: row.sub_category || "",
  incomeDate: row.income_date || "",
  date: row.income_date || "",
  paymentMode: row.payment_mode || "",
  receivedFrom: row.received_from || "",
  reference: row.reference || "",
  description: row.description || "",
  remarks: row.remarks || "",
  createdBy: row.created_by || "",
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
});

const toValues = (income) => [
  roundMoney(income.amount),
  income.status || "Received",
  income.category || "",
  income.subCategory || "",
  income.incomeDate || income.date || new Date().toISOString(),
  income.paymentMode || "",
  income.receivedFrom || "",
  income.reference || "",
  income.description || "",
  income.remarks || "",
  JSON.stringify(extraFields(income)),
  income.createdBy || income.recordedBy || "",
];

/*
 * Document charge collected on a loan, recorded as income (it is neither
 * principal nor interest). One row per loan with a fixed id, INC-DOC-<loan id>,
 * written on the caller's transaction so saving the same loan again updates it
 * instead of adding another, and a charge set back to 0 removes it.
 */
export const syncDocumentChargeIncome = async (client, loanPk) => {
  const found = await client.query(
    `SELECT l.id, l.charges, l.collection, l.created_at, c.id AS customer_id, c.personal
     FROM loans l JOIN customers c ON c.pk = l.customer_pk
     WHERE l.pk = $1 AND l.tenant_id = $2`,
    [loanPk, currentTenantId()]
  );
  const loan = found.rows[0];

  if (!loan) return;

  const incomeId = `INC-DOC-${loan.id}`;
  const amount = roundMoney(loan.charges?.documentCharge);

  if (!(amount > 0)) {
    await client.query("DELETE FROM incomes WHERE id = $1 AND tenant_id = $2", [incomeId, currentTenantId()]);
    return;
  }

  const customerName = loan.personal?.name || "Customer";
  const date = new Date(loan.created_at).toISOString().slice(0, 10);

  await client.query(
    `INSERT INTO incomes
      (id, amount, status, category, income_date, payment_mode, received_from, reference,
       description, remarks, details, created_by, tenant_id)
     VALUES ($1, $2, 'Received', 'Document Charge', $3, $4, $5, $6, 'Document charge', $7, $8, 'system', $9)
     ON CONFLICT (id) DO UPDATE SET
       amount = EXCLUDED.amount, received_from = EXCLUDED.received_from,
       remarks = EXCLUDED.remarks, details = EXCLUDED.details, updated_at = now()`,
    [
      incomeId,
      amount,
      date,
      loan.collection?.paymentMode || "Cash",
      customerName,
      loan.id,
      `Document charge collected for loan ${loan.id} (${customerName})`,
      JSON.stringify({
        loanId: loan.id,
        customerId: loan.customer_id,
        customerName,
        isDocumentCharge: true,
      }),
      currentTenantId(),
    ]
  );
};

// Removes the document-charge income of loans that are being deleted.
export const deleteDocumentChargeIncomes = (client, loanIds = []) =>
  loanIds.length
    ? client.query("DELETE FROM incomes WHERE id = ANY($1::text[]) AND tenant_id = $2", [
        loanIds.map((id) => `INC-DOC-${id}`),
        currentTenantId(),
      ])
    : null;

export const getIncomes = async () => {
  const result = await query("SELECT * FROM incomes WHERE tenant_id = $1 ORDER BY pk DESC", [currentTenantId()]);

  return result.rows.map(mapIncome);
};

export const getIncomeById = async (incomeId) => {
  const result = await query("SELECT * FROM incomes WHERE id = $1 AND tenant_id = $2", [incomeId, currentTenantId()]);

  return result.rows[0] ? mapIncome(result.rows[0]) : null;
};

const invalid = (message) => Object.assign(new Error(message), { statusCode: 400 });

const validate = (income) => {
  if (!(roundMoney(income.amount) > 0)) {
    throw invalid("Amount must be greater than zero.");
  }

  if (!String(income.category || "").trim()) {
    throw invalid("Category is required.");
  }
};

export const addIncome = async (income = {}) => {
  validate(income);

  const incomeId = await withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO incomes
        (id, amount, status, category, sub_category, income_date, payment_mode, received_from,
         reference, description, remarks, details, created_by, tenant_id)
       VALUES ('', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING pk`,
      [...toValues(income), currentTenantId()]
    );

    const pk = result.rows[0].pk;
    const id = `INC-${pad(pk)}`;

    await client.query("UPDATE incomes SET id = $1 WHERE pk = $2", [id, pk]);

    return id;
  });

  return getIncomeById(incomeId);
};

export const updateIncome = async (incomeId, updates = {}) => {
  const existing = await getIncomeById(incomeId);

  if (!existing) {
    return null;
  }

  await query(
    `UPDATE incomes SET
      amount = $2, status = $3, category = $4, sub_category = $5, income_date = $6,
      payment_mode = $7, received_from = $8, reference = $9, description = $10,
      remarks = $11, details = $12, created_by = $13, updated_at = now()
     WHERE id = $1 AND tenant_id = $14`,
    [incomeId, ...toValues({ ...existing, ...updates }), currentTenantId()]
  );

  return getIncomeById(incomeId);
};

export const deleteIncome = async (incomeId) => {
  const result = await query("DELETE FROM incomes WHERE id = $1 AND tenant_id = $2", [incomeId, currentTenantId()]);

  return result.rowCount > 0;
};
