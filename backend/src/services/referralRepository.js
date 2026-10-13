// src/services/referralRepository.js
//
// Referral commissions owed to agents / dealers / people in the Guarantor /
// Referral register. Paying one also books a matching "Referral Commission"
// expense in the same transaction, so it shows up in All Expenses and the
// ledger exactly once.

import { query, withTransaction } from "../db/connection.js";
import { currentTenantId } from "../db/tenantContext.js";
import { insertExpense } from "./expenseRepository.js";

const roundMoney = (value) => {
  const number = Number(value);

  return Number.isFinite(number) ? Math.round((number + Number.EPSILON) * 100) / 100 : 0;
};

const pad = (number, length = 4) => String(number).padStart(length, "0");

const iso = (value) => (value ? new Date(value).toISOString() : "");

const today = () => new Date().toISOString().slice(0, 10);

const httpError = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

// Commission rows with the ids of the register person, customer and loan
// they belong to.
const SELECT_REFERRALS = `
  SELECT rc.*, gr.id AS person_id, c.id AS customer_id, l.id AS loan_id
  FROM referral_commissions rc
  LEFT JOIN guarantor_referrals gr ON gr.pk = rc.person_pk
  LEFT JOIN customers c ON c.pk = rc.customer_pk
  LEFT JOIN loans l ON l.pk = rc.loan_pk`;

export const mapReferral = (row) => ({
  id: row.id,
  agentName: row.agent_name,
  agentType: row.agent_type || "Agent",
  agentPhone: row.agent_phone || "",
  personId: row.person_id || "",
  customerId: row.customer_id || "",
  customerName: row.customer_name || "",
  loanId: row.loan_id || row.loan_number || "",
  loanNumber: row.loan_number || "",
  loanAmount: row.loan_amount ?? null,
  percentage: row.percentage ?? null,
  amount: row.amount,
  status: row.status,
  commissionDate: row.commission_date || "",
  paidDate: row.paid_date || "",
  paymentMode: row.payment_mode || "",
  remarks: row.remarks || "",
  expenseId: row.expense_id || "",
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
});

export const getReferrals = async ({ personPk } = {}) => {
  const params = [currentTenantId()];
  let where = "WHERE rc.tenant_id = $1";

  if (personPk) {
    params.push(personPk);
    where += " AND rc.person_pk = $2";
  }

  const result = await query(
    `${SELECT_REFERRALS} ${where} ORDER BY rc.commission_date DESC NULLS LAST, rc.pk DESC`,
    params
  );

  return result.rows.map(mapReferral);
};

export const getReferralById = async (referralId) => {
  const result = await query(`${SELECT_REFERRALS} WHERE rc.id = $1 AND rc.tenant_id = $2`, [
    referralId,
    currentTenantId(),
  ]);

  return result.rows[0] ? mapReferral(result.rows[0]) : null;
};

// Books the expense for a commission being paid and returns its id.
const bookCommissionExpense = (client, commission, { paidDate, paymentMode, notes }) =>
  insertExpense(client, {
    amount: commission.amount,
    status: "Paid",
    category: "Referral Commission",
    expenseDate: paidDate,
    paymentMode,
    vendor: commission.agentName,
    reference: commission.loanNumber || commission.id,
    description:
      notes ||
      `Referral commission - ${commission.agentName}${commission.customerName ? ` (${commission.customerName})` : ""}`,
    referralId: commission.id,
    referrerName: commission.agentName,
    personId: commission.personId || "",
    customerId: commission.customerId || "",
    customerName: commission.customerName || "",
    loanId: commission.loanNumber || "",
    commissionId: commission.id,
    isReferralCommission: true,
  });

/*
 * Inserts a commission on the caller's transaction. When `paid` is set the
 * expense is booked with it. Returns the new commission id.
 *
 * links: { personPk, personId, customerPk, customerId, loanPk } — optional
 * references to the register person, customer and loan.
 */
export const insertCommission = async (client, commission, links = {}) => {
  const agentName = String(commission.agentName || "").trim();
  const amount = roundMoney(commission.amount);

  if (!agentName) throw httpError("Referrer name is required.");
  if (!(amount > 0)) throw httpError("Commission amount must be greater than zero.");

  const commissionDate = commission.commissionDate || today();
  const paid = commission.paid ? { paidDate: commission.paidDate || commissionDate, paymentMode: commission.paymentMode || "Cash" } : null;

  const result = await client.query(
    `INSERT INTO referral_commissions
      (id, agent_name, agent_type, agent_phone, customer_name, loan_number, amount, status,
       commission_date, remarks, person_pk, customer_pk, loan_pk, percentage, loan_amount, tenant_id)
     VALUES ('', $1, $2, $3, $4, $5, $6, 'Pending', $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING pk`,
    [
      agentName,
      ["Agent", "Dealer", "Referral"].includes(commission.agentType) ? commission.agentType : "Agent",
      String(commission.agentPhone || "").trim(),
      commission.customerName || "",
      commission.loanNumber || "",
      amount,
      commissionDate,
      commission.remarks || "",
      links.personPk || null,
      links.customerPk || null,
      links.loanPk || null,
      Number(commission.percentage) > 0 ? Number(commission.percentage) : null,
      Number(commission.loanAmount) > 0 ? roundMoney(commission.loanAmount) : null,
      currentTenantId(),
    ]
  );

  const pk = result.rows[0].pk;
  const id = `REF-${pad(pk)}`;

  await client.query("UPDATE referral_commissions SET id = $1 WHERE pk = $2", [id, pk]);

  if (paid) {
    const expenseId = await bookCommissionExpense(
      client,
      {
        id,
        amount,
        agentName,
        customerName: commission.customerName,
        loanNumber: commission.loanNumber,
        personId: links.personId,
        customerId: links.customerId,
      },
      { ...paid, notes: commission.remarks }
    );

    await client.query(
      `UPDATE referral_commissions
       SET status = 'Paid', paid_date = $2, payment_mode = $3, expense_id = $4, updated_at = now()
       WHERE pk = $1`,
      [pk, paid.paidDate, paid.paymentMode, expenseId]
    );
  }

  return id;
};

export const addReferral = async (referral = {}) => {
  const referralId = await withTransaction((client) =>
    insertCommission(client, { ...referral, paid: false })
  );

  return getReferralById(referralId);
};

export const markReferralPaid = async (referralId, payment = {}) => {
  const found = await withTransaction(async (client) => {
    // Lock the row so two clicks cannot book the expense twice.
    const locked = await client.query(
      "SELECT pk, status FROM referral_commissions WHERE id = $1 AND tenant_id = $2 FOR UPDATE",
      [referralId, currentTenantId()]
    );

    if (!locked.rows[0]) return false;
    if (locked.rows[0].status === "Paid") return true;

    const existing = await getReferralById(referralId);
    const paidDate = payment.paidDate || today();
    const paymentMode = payment.paymentMode || "Cash";

    const expenseId = await bookCommissionExpense(client, existing, {
      paidDate,
      paymentMode,
      notes: payment.notes,
    });

    await client.query(
      `UPDATE referral_commissions
       SET status = 'Paid', paid_date = $2, payment_mode = $3, expense_id = $4,
           remarks = COALESCE(NULLIF($5, ''), remarks), updated_at = now()
       WHERE pk = $1`,
      [locked.rows[0].pk, paidDate, paymentMode, expenseId, payment.notes || ""]
    );

    return true;
  });

  return found ? getReferralById(referralId) : null;
};

export const deleteReferral = async (referralId) => {
  const result = await query("DELETE FROM referral_commissions WHERE id = $1 AND tenant_id = $2", [referralId, currentTenantId()]);

  return result.rowCount > 0;
};
