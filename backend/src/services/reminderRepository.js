// src/services/reminderRepository.js
//
// Payment reminders from the Reminders page. The page treats a reminder
// as a free-form record, so anything beyond the columns that get filtered
// travels in the details jsonb column (same approach as expenses).

import { query, withTransaction } from "../db/connection.js";

const pad = (number, length = 4) => String(number).padStart(length, "0");

const iso = (value) => (value ? new Date(value).toISOString() : "");

const KNOWN_FIELDS = new Set([
  "id",
  "loanId",
  "loanNumber",
  "customerId",
  "status",
  "nextReminderDate",
  "createdAt",
  "updatedAt",
]);

const extraFields = (reminder) =>
  Object.fromEntries(Object.entries(reminder).filter(([key]) => !KNOWN_FIELDS.has(key)));

const mapReminder = (row) => ({
  ...(row.details ?? {}),
  id: row.id,
  loanId: row.loan_id || "",
  loanNumber: row.loan_number || "",
  customerId: row.customer_id || "",
  status: row.status,
  nextReminderDate: row.next_reminder_date || "",
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
});

const toValues = (reminder) => [
  reminder.loanId || "",
  reminder.loanNumber || "",
  reminder.customerId || "",
  reminder.status || "Active",
  reminder.nextReminderDate || "",
  JSON.stringify(extraFields(reminder)),
];

export const getReminders = async () => {
  const result = await query("SELECT * FROM reminders ORDER BY created_at DESC, pk DESC");

  return result.rows.map(mapReminder);
};

export const getReminderById = async (reminderId) => {
  const result = await query("SELECT * FROM reminders WHERE id = $1", [reminderId]);

  return result.rows[0] ? mapReminder(result.rows[0]) : null;
};

export const addReminder = async (reminder = {}) => {
  const reminderId = await withTransaction(async (client) => {
    const createdAt = reminder.createdAt ? new Date(reminder.createdAt) : new Date();

    const result = await client.query(
      `INSERT INTO reminders
        (id, loan_id, loan_number, customer_id, status, next_reminder_date, details, created_at)
       VALUES ('', $1, $2, $3, $4, $5, $6, $7)
       RETURNING pk`,
      [...toValues(reminder), Number.isNaN(createdAt.getTime()) ? new Date() : createdAt]
    );

    const pk = result.rows[0].pk;
    const id = `REM-${pad(pk)}`;

    await client.query("UPDATE reminders SET id = $1 WHERE pk = $2", [id, pk]);

    return id;
  });

  return getReminderById(reminderId);
};

export const updateReminder = async (reminderId, updates = {}) => {
  const existing = await getReminderById(reminderId);

  if (!existing) {
    return null;
  }

  await query(
    `UPDATE reminders SET
      loan_id = $2, loan_number = $3, customer_id = $4, status = $5,
      next_reminder_date = $6, details = $7, updated_at = now()
     WHERE id = $1`,
    [reminderId, ...toValues({ ...existing, ...updates })]
  );

  return getReminderById(reminderId);
};
