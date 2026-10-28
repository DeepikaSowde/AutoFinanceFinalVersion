/**
 * MotoLend Custom Reminders, backed by the API (/api/reminders).
 *
 * The server keeps every custom reminder (kind "custom") and checks the
 * customer and loan it is for. This module keeps the last copy loaded so
 * getCustomReminders() answers immediately during render, fires
 * REMINDERS_UPDATE_EVENT whenever a fresh copy arrives, and sends creates,
 * status changes and deletes to the server before refreshing the copy.
 */

import { apiDelete, apiGet, apiPost, apiPut } from '../services/api';

export const REMINDERS_UPDATE_EVENT = 'motoLend_custom_reminders_updated';

let remindersCache = [];

const notify = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(REMINDERS_UPDATE_EVENT));
};

/** Reloads the custom reminders from the server. */
export const loadCustomReminders = async () => {
  const reminders = await apiGet('/reminders');
  remindersCache = (Array.isArray(reminders) ? reminders : []).filter((r) => r.kind === 'custom');
  notify();
  return remindersCache;
};

/**
 * The custom reminders (last loaded copy).
 */
export const getCustomReminders = () => remindersCache;

/**
 * Evaluates the real-time status of a custom reminder.
 * Possible statuses:
 * - 'Completed'
 * - 'Cancelled'
 * - 'Overdue' (scheduled date & time have passed and reminder remains incomplete)
 * - 'Scheduled' (future scheduled date & time)
 * - 'Pending' (requires attention)
 */
export const evaluateCustomReminderStatus = (reminder) => {
  if (!reminder) return 'Pending';
  if (reminder.status === 'Completed') return 'Completed';
  if (reminder.status === 'Cancelled') return 'Cancelled';

  // Compare schedule date & time with now
  try {
    const scheduleDate = reminder.scheduleDate; // format: YYYY-MM-DD
    const scheduleTime = reminder.scheduleTime || '23:59'; // format: HH:mm or HH:mm AM/PM

    if (!scheduleDate) return reminder.status || 'Pending';

    // Parse time components
    let hours = 0;
    let minutes = 0;
    const timeStr = String(scheduleTime).trim();

    if (/^\d{1,2}:\d{2}\s*(am|pm)?$/i.test(timeStr)) {
      const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
      if (match) {
        hours = parseInt(match[1], 10);
        minutes = parseInt(match[2], 10);
        const meridian = match[3] ? match[3].toLowerCase() : null;
        if (meridian === 'pm' && hours < 12) hours += 12;
        if (meridian === 'am' && hours === 12) hours = 0;
      }
    }

    const [year, month, day] = scheduleDate.split('-').map(Number);
    const scheduledDateTime = new Date(year, month - 1, day, hours, minutes, 0).getTime();
    const now = Date.now();

    if (scheduledDateTime < now) {
      return 'Overdue';
    }
    return 'Scheduled';
  } catch {
    return reminder.status || 'Pending';
  }
};

/**
 * Saves a new custom reminder. Resolves to the saved reminder.
 */
export const saveCustomReminder = async (reminderData) => {
  if (!reminderData) throw new Error('Reminder data is required');

  const customerId = String(reminderData.customerId || '').trim();
  const title = String(reminderData.title || '').trim();
  const scheduleDate = String(reminderData.scheduleDate || '').trim();

  if (!customerId) {
    throw new Error('Please select a customer.');
  }
  if (!title) {
    throw new Error('Please provide a reminder title.');
  }
  if (!scheduleDate) {
    throw new Error('Please select a schedule date.');
  }

  const saved = await apiPost('/reminders', {
    kind: 'custom',
    customerId,
    customerName: String(reminderData.customerName || '').trim(),
    loanId: reminderData.loanId ? String(reminderData.loanId).trim() : '',
    title,
    reminderType: reminderData.reminderType || 'Payment Follow-up',
    message: String(reminderData.message || '').trim(),
    priority: reminderData.priority || 'Medium', // 'High' | 'Medium' | 'Low'
    scheduleDate,
    scheduleTime: reminderData.scheduleTime || '10:00 AM',
    repeat: reminderData.repeat || 'Does Not Repeat',
    notes: String(reminderData.notes || '').trim(),
    status: reminderData.status || 'Scheduled',
  });
  await loadCustomReminders();
  return saved;
};

/**
 * Updates an existing custom reminder's status or properties. Resolves to the updated reminder.
 */
export const updateCustomReminder = async (id, updates = {}) => {
  if (!id) return null;
  const updated = await apiPut(`/reminders/${encodeURIComponent(id)}`, updates);
  await loadCustomReminders();
  return updated;
};

/**
 * Deletes a custom reminder by ID.
 */
export const deleteCustomReminder = async (id) => {
  if (!id) return;
  await apiDelete(`/reminders/${encodeURIComponent(id)}`);
  await loadCustomReminders();
};
