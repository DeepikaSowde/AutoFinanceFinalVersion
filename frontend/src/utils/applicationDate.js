// Loan Application Date: today or an earlier date (an older loan may be
// entered), never a future one. Keep in step with
// backend/src/services/applicationDate.js.

// Today on the user's own clock, "YYYY-MM-DD" — local, not toISOString()
// (UTC), which in India is still "yesterday" before 5:30 AM.
export const localToday = () => new Date().toLocaleDateString('en-CA')

// Guards against a mistyped year (e.g. 0202) in the date box.
export const EARLIEST_APPLICATION_DATE = '2000-01-01'

// → '' when valid, otherwise the message to show.
export const validateApplicationDate = (value) => {
  const s = String(value ?? '').trim()
  if (!s) return 'Please select the Application Date.'
  const d = new Date(`${s}T00:00:00`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(d) || d.toLocaleDateString('en-CA') !== s) return 'Please enter a valid Application Date.'
  if (s > localToday()) return "Application Date can't be in the future."
  if (s < EARLIEST_APPLICATION_DATE) return 'Application Date must be in the year 2000 or later.'
  return ''
}
