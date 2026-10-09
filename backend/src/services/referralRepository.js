// src/services/referralRepository.js
//
// Referral commissions owed to agents / dealers. Marking one paid also
// books a matching expense so it shows up in All Expenses and the ledger.

import { query, withTransaction } from "../db/connection.js";
import { addExpense } from "./expenseRepository.js";

const roundMoney = (value) => {
  const number = Number(value);

  return Number.isFinite(number) ? Math.round((number + Number.EPSILON) * 100) / 100 : 0;
};

const pad = (number, length = 4) => String(number).padStart(length, "0");

const iso = (value) => (value ? new Date(value).toISOString() : "");

const today = () => new Date().toISOString().slice(0, 10);

const mapReferral = (row) => ({
  id: row.id,
  agentName: row.agent_name,
  agentType: row.agent_type || "Agent",
  customerName: row.customer_name || "",
  loanNumber: row.loan_number || "",
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

export const getReferrals = async () => {
  const result = await query(
    "SELECT * FROM referral_commissions ORDER BY commission_date DESC NULLS LAST, pk DESC"
  );

  return result.rows.map(mapReferral);
};

export const getReferralById = async (referralId) => {
  const result = await query("SELECT * FROM referral_commissions WHERE id = $1", [referralId]);

  return result.rows[0] ? mapReferral(result.rows[0]) : null;
};

export const addReferral = async (referral = {}) => {
  const agentName = String(referral.agentName || "").trim();

  if (!agentName) {
    const error = new Error("Agent name is required.");
    error.statusCode = 400;
    throw error;
  }

  if (!(Number(referral.amount) > 0)) {
    const error = new Error("Commission amount must be greater than zero.");
    error.statusCode = 400;
    throw error;
  }

  const referralId = await withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO referral_commissions
        (id, agent_name, agent_type, customer_name, loan_number, amount, status,
         commission_date, remarks)
       VALUES ('', $1, $2, $3, $4, $5, 'Pending', $6, $7)
       RETURNING pk`,
      [
        agentName,
        referral.agentType === "Dealer" ? "Dealer" : "Agent",
        referral.customerName || "",
        referral.loanNumber || "",
        roundMoney(referral.amount),
        referral.commissionDate || today(),
        referral.remarks || "",
      ]
    );

    const pk = result.rows[0].pk;
    const id = `REF-${pad(pk)}`;

    await client.query("UPDATE referral_commissions SET id = $1 WHERE pk = $2", [id, pk]);

    return id;
  });

  return getReferralById(referralId);
};

export const markReferralPaid = async (referralId, payment = {}) => {
  const existing = await getReferralById(referralId);

  if (!existing) {
    return null;
  }

  if (existing.status === "Paid") {
    return existing;
  }

  const paidDate = payment.paidDate || today();
  const paymentMode = payment.paymentMode || "Cash";

  const expense = await addExpense({
    amount: existing.amount,
    status: "Paid",
    category: "Referral Commission",
    expenseDate: paidDate,
    paymentMode,
    vendor: existing.agentName,
    reference: existing.loanNumber || existing.id,
    description: `Referral commission - ${existing.agentName}${
      existing.customerName ? ` (${existing.customerName})` : ""
    }`,
    referralId: existing.id,
  });

  await query(
    `UPDATE referral_commissions
     SET status = 'Paid', paid_date = $2, payment_mode = $3, expense_id = $4, updated_at = now()
     WHERE id = $1`,
    [referralId, paidDate, paymentMode, expense.id]
  );

  return getReferralById(referralId);
};

export const deleteReferral = async (referralId) => {
  const result = await query("DELETE FROM referral_commissions WHERE id = $1", [referralId]);

  return result.rowCount > 0;
};
