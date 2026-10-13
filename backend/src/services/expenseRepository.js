// src/services/expenseRepository.js
//
// Business overhead, unrelated to any customer or loan. The UI treats an
// expense as a free-form record, so anything beyond the fields that get
// filtered and summed travels in the details jsonb column.

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
  "expenseDate",
  "date",
  "paymentMode",
  "paidBy",
  "vendor",
  "reference",
  "description",
  "remarks",
  "createdBy",
  "recordedBy",
  "createdAt",
  "updatedAt",
]);

const extraFields = (expense) =>
  Object.fromEntries(Object.entries(expense).filter(([key]) => !KNOWN_FIELDS.has(key)));

const mapExpense = (row) => ({
  ...(row.details ?? {}),
  id: row.id,
  amount: row.amount,
  status: row.status,
  category: row.category || "",
  subCategory: row.sub_category || "",
  expenseDate: row.expense_date || "",
  date: row.expense_date || "",
  paymentMode: row.payment_mode || "",
  paidBy: row.paid_by || "",
  vendor: row.vendor || "",
  reference: row.reference || "",
  description: row.description || "",
  remarks: row.remarks || "",
  createdBy: row.created_by || "",
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
});

const toValues = (expense) => [
  roundMoney(expense.amount),
  expense.status || "Pending",
  expense.category || "",
  expense.subCategory || "",
  expense.expenseDate || expense.date || new Date().toISOString(),
  expense.paymentMode || "",
  expense.paidBy || "",
  expense.vendor || "",
  expense.reference || "",
  expense.description || "",
  expense.remarks || "",
  JSON.stringify(extraFields(expense)),
  expense.createdBy || expense.recordedBy || "",
];

export const getExpenses = async () => {
  const result = await query("SELECT * FROM expenses WHERE tenant_id = $1 ORDER BY pk DESC", [currentTenantId()]);

  return result.rows.map(mapExpense);
};

export const getExpenseById = async (expenseId) => {
  const result = await query("SELECT * FROM expenses WHERE id = $1 AND tenant_id = $2", [expenseId, currentTenantId()]);

  return result.rows[0] ? mapExpense(result.rows[0]) : null;
};

const invalid = (message) => Object.assign(new Error(message), { statusCode: 400 });

const validate = (expense) => {
  if (!(roundMoney(expense.amount) > 0)) {
    throw invalid("Amount must be greater than zero.");
  }

  if (!String(expense.category || "").trim()) {
    throw invalid("Category is required.");
  }
};

// Inserts an expense on the caller's transaction and returns its id, so other
// records (a paid referral commission) can be booked together with it.
export const insertExpense = async (client, expense = {}) => {
  validate(expense);

  const result = await client.query(
    `INSERT INTO expenses
      (id, amount, status, category, sub_category, expense_date, payment_mode, paid_by,
       vendor, reference, description, remarks, details, created_by, tenant_id)
     VALUES ('', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING pk`,
    [...toValues(expense), currentTenantId()]
  );

  const pk = result.rows[0].pk;
  const id = `EXP-${pad(pk)}`;

  await client.query("UPDATE expenses SET id = $1 WHERE pk = $2", [id, pk]);

  return id;
};

export const addExpense = async (expense = {}) => {
  validate(expense);

  const expenseId = await withTransaction((client) => insertExpense(client, expense));

  return getExpenseById(expenseId);
};

export const updateExpense = async (expenseId, updates = {}) => {
  const existing = await getExpenseById(expenseId);

  if (!existing) {
    return null;
  }

  await query(
    `UPDATE expenses SET
      amount = $2, status = $3, category = $4, sub_category = $5, expense_date = $6,
      payment_mode = $7, paid_by = $8, vendor = $9, reference = $10, description = $11,
      remarks = $12, details = $13, created_by = $14, updated_at = now()
     WHERE id = $1 AND tenant_id = $15`,
    [expenseId, ...toValues({ ...existing, ...updates }), currentTenantId()]
  );

  return getExpenseById(expenseId);
};

export const deleteExpense = async (expenseId) => {
  const result = await query("DELETE FROM expenses WHERE id = $1 AND tenant_id = $2", [expenseId, currentTenantId()]);

  return result.rowCount > 0;
};
