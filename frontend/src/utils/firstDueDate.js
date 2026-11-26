// First Due Date: required, a real calendar date, on or after the Loan Date
// (the Application Date on the Customer step). An older loan may be entered, so
// the date is compared with the Loan Date, not with today. Keep in step with
// backend/src/services/firstDueDate.js.

const isDate = (s) => {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return false
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]
}

const shown = (s) =>
  new Date(`${s}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })

export const INVALID_FIRST_DUE_DATE = 'Please enter a valid First Due Date.'

// → '' when valid, otherwise the message to show.
export const validateFirstDueDate = (value, loanDate) => {
  const s = String(value ?? '').trim()
  if (!s) return 'Please select the First Due Date.'
  if (!isDate(s)) return INVALID_FIRST_DUE_DATE
  const from = String(loanDate ?? '').trim()
  if (isDate(from) && s < from) return `First Due Date can't be earlier than the Loan Date (${shown(from)}).`
  return ''
}
