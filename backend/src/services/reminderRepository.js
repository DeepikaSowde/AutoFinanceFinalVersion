// src/services/reminderRepository.js
//
// Reminders from the Reminders page. The page treats a reminder as a
// free-form record, so anything beyond the columns that get filtered
// travels in the details jsonb column (same approach as expenses).
//
// Custom reminders (kind "custom") are scheduled from Create Reminder: a
// title, priority and date/time for a customer and optionally one of their
// loans. Their status is Scheduled, Completed or Cancelled and
// next_reminder_date holds the schedule date. Older records without a kind
// are per-loan follow-up logs.

import { query, withTransaction } from "../db/connection.js";
import { currentTenantId } from "../db/tenantContext.js";
import { getCustomerById } from "./customerRepository.js";

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

const httpError = (status, message) => Object.assign(new Error(message), { statusCode: status });

const CUSTOM_STATUSES = new Set(["Scheduled", "Completed", "Cancelled"]);
const PRIORITIES = new Set(["High", "Medium", "Low"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const text = (value) => String(value ?? "").trim();

/*
 * Checks a custom reminder and fills in what the server owns: the customer's
 * name, the status, and next_reminder_date = scheduleDate. The customer must
 * exist and the loan, when given, must be one of theirs.
 */
const checkCustomReminder = async (reminder) => {
  const title = text(reminder.title);
  const scheduleDate = text(reminder.scheduleDate);
  const customerId = text(reminder.customerId);
  const loanId = text(reminder.loanId);
  const status = text(reminder.status) || "Scheduled";

  if (!customerId) throw httpError(400, "Please select a customer.");
  if (!title) throw httpError(400, "Please provide a reminder title.");
  if (!DATE.test(scheduleDate) || Number.isNaN(Date.parse(scheduleDate))) {
    throw httpError(400, "Please select a schedule date.");
  }
  if (!CUSTOM_STATUSES.has(status)) throw httpError(400, "Unknown reminder status.");

  const record = await getCustomerById(customerId);
  if (!record) throw httpError(400, "Customer not found.");

  if (loanId) {
    const loans = [record.loan, ...(record.loans || [])].filter(Boolean);
    if (!loans.some((loan) => loan.id === loanId)) {
      throw httpError(400, "That loan does not belong to this customer.");
    }
  }

  return {
    ...reminder,
    kind: "custom",
    customerId,
    customerName: text(record.customer?.personal?.name) || text(reminder.customerName),
    loanId,
    title,
    reminderType: text(reminder.reminderType) || "Payment Follow-up",
    message: text(reminder.message),
    priority: PRIORITIES.has(reminder.priority) ? reminder.priority : "Medium",
    scheduleDate,
    scheduleTime: text(reminder.scheduleTime) || "10:00 AM",
    repeat: text(reminder.repeat) || "Does Not Repeat",
    notes: text(reminder.notes),
    status,
    nextReminderDate: scheduleDate,
  };
};

export const getReminders = async () => {
  const result = await query("SELECT * FROM reminders WHERE tenant_id = $1 ORDER BY created_at DESC, pk DESC", [currentTenantId()]);

  return result.rows.map(mapReminder);
};

export const getReminderById = async (reminderId) => {
  const result = await query("SELECT * FROM reminders WHERE id = $1 AND tenant_id = $2", [reminderId, currentTenantId()]);

  return result.rows[0] ? mapReminder(result.rows[0]) : null;
};

export const addReminder = async (input = {}) => {
  const reminder = input.kind === "custom" ? await checkCustomReminder(input) : input;
  const reminderId = await withTransaction(async (client) => {
    const createdAt = reminder.createdAt ? new Date(reminder.createdAt) : new Date();

    const result = await client.query(
      `INSERT INTO reminders
        (id, loan_id, loan_number, customer_id, status, next_reminder_date, details, created_at, tenant_id)
       VALUES ('', $1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING pk`,
      [...toValues(reminder), Number.isNaN(createdAt.getTime()) ? new Date() : createdAt, currentTenantId()]
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

  const merged = { ...existing, ...updates, id: reminderId, createdAt: existing.createdAt };
  const next = existing.kind === "custom" ? await checkCustomReminder({ ...merged, kind: "custom" }) : merged;

  await query(
    `UPDATE reminders SET
      loan_id = $2, loan_number = $3, customer_id = $4, status = $5,
      next_reminder_date = $6, details = $7, updated_at = now()
     WHERE id = $1 AND tenant_id = $8`,
    [reminderId, ...toValues(next), currentTenantId()]
  );

  return getReminderById(reminderId);
};

export const deleteReminder = async (reminderId) => {
  const result = await query("DELETE FROM reminders WHERE id = $1 AND tenant_id = $2", [reminderId, currentTenantId()]);

  return result.rowCount > 0;
};
