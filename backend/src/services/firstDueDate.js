// src/services/firstDueDate.js
//
// First Due Date: required, a real calendar date, on or after the Loan Date
// (the loan's Application Date; today in India when none is sent). Keep in
// step with frontend/src/utils/firstDueDate.js.

import { assertValidApplicationDate, indiaToday } from "./applicationDate.js";

const isDate = (s) => {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
};

const shown = (s) =>
  new Date(`${s}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

export const firstDueDateError = (value, loanDate) => {
  const s = String(value ?? "").trim();
  if (!s) return "Please select the First Due Date.";
  if (!isDate(s)) return "Please enter a valid First Due Date.";
  if (s < loanDate) return `First Due Date can't be earlier than the Loan Date (${shown(loanDate)}).`;
  return "";
};

// Throws a 400 the API returns as { error }. A blank Loan Date means today.
export const assertValidFirstDueDate = (value, loanDate) => {
  assertValidApplicationDate(loanDate);
  const error = firstDueDateError(value, String(loanDate ?? "").trim() || indiaToday());
  if (error) throw Object.assign(new Error(error), { statusCode: 400 });
};
