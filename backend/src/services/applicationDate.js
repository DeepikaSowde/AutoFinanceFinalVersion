// src/services/applicationDate.js
//
// Loan Application Date: a real calendar date (YYYY-MM-DD), today or earlier —
// staff may enter an older loan, never a future one. "Today" is India's date
// (the business runs on Asia/Kolkata, like the penalty day counts), not the
// server's, which may be UTC. Keep in step with frontend/src/utils/applicationDate.js.

export const indiaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

export const applicationDateError = (value) => {
  const s = String(value ?? "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  if (!d || d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) {
    return "Please enter a valid Application Date.";
  }
  if (s > indiaToday()) return "Application Date can't be in the future.";
  if (s < "2000-01-01") return "Application Date must be in the year 2000 or later.";
  return "";
};

// Throws a 400 the API returns as { error } when the date is not valid.
// A blank date is left alone (older clients didn't always send one).
export const assertValidApplicationDate = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") return;
  const error = applicationDateError(value);
  if (error) throw Object.assign(new Error(error), { statusCode: 400 });
};
