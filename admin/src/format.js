// Display helpers. Dates from the API are "YYYY-MM-DD" (lender calendar
// days); they are shown without any timezone conversion.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const formatDate = (value) => {
  if (!value) return '—'
  const [y, m, d] = String(value).slice(0, 10).split('-')
  if (!y || !m || !d) return '—'
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`
}

export const formatDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—'

export const formatMoney = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

export const daysLeftText = (days) => {
  if (days === null || days === undefined) return '—'
  if (days < 0) return `${-days} day${days === -1 ? '' : 's'} ago`
  if (days === 0) return 'Today'
  return `${days} day${days === 1 ? '' : 's'}`
}

// Today in India as YYYY-MM-DD, and simple date arithmetic on that form.
export const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())

export const addMonths = (dateText, months) => {
  const [y, m, d] = dateText.split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, lastDay))
  return target.toISOString().slice(0, 10)
}

export const addDays = (dateText, days) => {
  const [y, m, d] = dateText.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export const FEATURE_LABELS = {
  web_app: 'Web app',
  mobile_app: 'Mobile app',
  whatsapp_reminders: 'WhatsApp reminders',
  vahan_lookup: 'VAHAN vehicle info',
}

export const PAYMENT_METHOD_LABELS = {
  upi: 'UPI',
  bank_transfer: 'Bank transfer',
  cheque: 'Cheque',
  cash: 'Cash',
  razorpay: 'Razorpay',
}

const ACTION_LABELS = {
  'tenant.created': 'Tenant created',
  'tenant.updated': 'Details edited',
  'tenant.plan_changed': 'Plan changed',
  'tenant.status_changed': 'Status changed',
  'tenant.extended': 'Subscription extended',
  'tenant.features_changed': 'Features changed',
  'tenant.admin_created': 'Admin user created',
  'tenant.admin_password_reset': 'Admin password reset',
  'payment.recorded': 'Payment recorded',
  'plan.updated': 'Plan updated',
}

export const actionLabel = (action) => ACTION_LABELS[action] || action

// One readable line for an audit entry's details.
export const auditSummary = (log) => {
  const d = log.details || {}
  switch (log.action) {
    case 'tenant.created':
      return `${d.name} on ${d.plan}, valid until ${formatDate(d.validUntil)}`
    case 'tenant.plan_changed':
    case 'tenant.status_changed':
      return `${d.from} → ${d.to}`
    case 'tenant.extended':
      return `Valid until ${formatDate(d.from)} → ${formatDate(d.to)}`
    case 'payment.recorded':
      return `${formatMoney(d.amount)} by ${PAYMENT_METHOD_LABELS[d.method] || d.method}; valid until ${formatDate(d.validUntil?.to)}`
    case 'tenant.features_changed':
      return Object.entries(d.requested || {})
        .map(([key, on]) => `${FEATURE_LABELS[key] || key} ${on ? 'on' : 'off'}`)
        .join(', ')
    case 'tenant.admin_created':
    case 'tenant.admin_password_reset':
      return d.username || ''
    case 'tenant.updated':
      return Object.keys(d).map((key) => key.replace('_', ' ')).join(', ')
    case 'plan.updated': {
      const parts = []
      const c = d.changes || {}
      if (c.priceMonthly !== undefined && c.priceMonthly !== d.from?.priceMonthly) parts.push(`price ${formatMoney(d.from?.priceMonthly)} → ${formatMoney(c.priceMonthly)}`)
      if (c.features) parts.push(`features: ${c.features.map((key) => FEATURE_LABELS[key] || key).join(', ')}`)
      if (c.limits) parts.push(`limits: ${Object.entries(c.limits).map(([key, n]) => `${FEATURE_LABELS[key] || key} ${n}`).join(', ')}`)
      if (c.isActive !== undefined) parts.push(c.isActive ? 'activated' : 'deactivated')
      return `${d.plan}: ${parts.join('; ') || 'no change'}`
    }
    default:
      return ''
  }
}
