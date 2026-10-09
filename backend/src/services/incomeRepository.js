// src/services/incomeRepository.js
//
// Manual, non-loan income (referrals, misc revenue, etc). Mirrors
// expenseRepository.js — same shape, same jsonb overflow for anything
// beyond the columns that get filtered/summed.

import { query, withTransaction } from "../db/connection.js";

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

export const getIncomes = async () => {
  const result = await query("SELECT * FROM incomes ORDER BY pk DESC");

  return result.rows.map(mapIncome);
};

export const getIncomeById = async (incomeId) => {
  const result = await query("SELECT * FROM incomes WHERE id = $1", [incomeId]);

  return result.rows[0] ? mapIncome(result.rows[0]) : null;
};

export const addIncome = async (income = {}) => {
  const incomeId = await withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO incomes
        (id, amount, status, category, sub_category, income_date, payment_mode, received_from,
         reference, description, remarks, details, created_by)
       VALUES ('', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING pk`,
      toValues(income)
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
     WHERE id = $1`,
    [incomeId, ...toValues({ ...existing, ...updates })]
  );

  return getIncomeById(incomeId);
};

export const deleteIncome = async (incomeId) => {
  const result = await query("DELETE FROM incomes WHERE id = $1", [incomeId]);

  return result.rowCount > 0;
};
