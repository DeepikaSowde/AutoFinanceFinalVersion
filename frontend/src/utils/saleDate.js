// Mark as Sold: the sale forecloses the loan, so the Sale Date must be a real
// date, today or earlier, and not before the vehicle was seized or the loan
// was taken. Keep in step with backend/src/services/saleDate.js.

const isDate = (s) => {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return false
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]
}

const shown = (s) =>
  new Date(`${s}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })

const day = (value) => String(value ?? '').trim().slice(0, 10)

// → '' when valid, otherwise the message to show.
export const validateSaleDate = (value, { today, seizureDate, loanDate } = {}) => {
  const s = String(value ?? '').trim()
  if (!s) return 'Sale date is required.'
  if (!isDate(s)) return 'Please enter a valid Sale Date.'
  if (today && s > today) return "Sale Date can't be in the future."
  const seized = day(seizureDate)
  if (isDate(seized) && s < seized) return `Sale Date can't be earlier than the seizure date (${shown(seized)}).`
  const taken = day(loanDate)
  if (isDate(taken) && s < taken) return `Sale Date can't be earlier than the loan date (${shown(taken)}).`
  return ''
}
