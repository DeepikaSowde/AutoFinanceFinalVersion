// Small shared UI pieces: white cards on slate-200 borders, teal-700
// primary buttons, and the plan / status badges.

export const Card = ({ title, action, children, className = '', id }) => (
  <section id={id} className={`rounded-xl border border-slate-200 bg-white ${className}`}>
    {(title || action) && (
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
        {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
        {action}
      </header>
    )}
    <div className="p-5">{children}</div>
  </section>
)

const BUTTON_STYLES = {
  primary: 'bg-teal-700 text-white hover:bg-teal-800 focus-visible:outline-teal-700',
  secondary: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 focus-visible:outline-slate-500',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600',
  ghost: 'text-teal-800 hover:bg-teal-50 focus-visible:outline-teal-700',
}

export const Button = ({ variant = 'primary', className = '', type = 'button', busy = false, children, ...props }) => (
  <button
    type={type}
    disabled={busy || props.disabled}
    className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${BUTTON_STYLES[variant]} ${className}`}
    {...props}
  >
    {busy ? 'Working…' : children}
  </button>
)

const BADGE_STYLES = {
  premium: 'bg-violet-100 text-violet-800 ring-violet-200',
  basic: 'bg-slate-100 text-slate-700 ring-slate-200',
  active: 'bg-green-100 text-green-800 ring-green-200',
  suspended: 'bg-red-100 text-red-800 ring-red-200',
  expired: 'bg-amber-100 text-amber-900 ring-amber-200',
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
}

export const Badge = ({ tone = 'neutral', children }) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${BADGE_STYLES[tone] || BADGE_STYLES.neutral}`}>
    {children}
  </span>
)

export const PlanBadge = ({ plan }) => <Badge tone={plan?.code === 'premium' ? 'premium' : plan?.code === 'basic' ? 'basic' : 'neutral'}>{plan?.name || '—'}</Badge>

const STATUS_LABELS = { active: 'Active', suspended: 'Suspended', expired: 'Expired' }

export const StatusBadge = ({ status }) => <Badge tone={status}>{STATUS_LABELS[status] || status}</Badge>

export const Field = ({ label, id, hint, children }) => (
  <div className="space-y-1.5">
    <label htmlFor={id} className="block text-sm font-medium text-slate-700">
      {label}
    </label>
    {children}
    {hint && <p className="text-xs text-slate-500">{hint}</p>}
  </div>
)

export const ProgressBar = ({ label, used = 0, limit, id }) => {
  const unlimited = limit === null || limit === undefined
  const off = limit === 0 && !unlimited
  const percent = unlimited || off ? 0 : Math.min(100, Math.round((used / limit) * 100))
  const tone = percent >= 100 ? 'bg-red-600' : percent >= 80 ? 'bg-amber-500' : 'bg-teal-700'
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
        <span id={id} className="font-medium text-slate-800">{label}</span>
        <span className="tabular-nums text-slate-600">
          {off ? 'Not in plan' : unlimited ? `${used.toLocaleString('en-IN')} used · no limit` : `${used.toLocaleString('en-IN')} / ${limit.toLocaleString('en-IN')}`}
        </span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-labelledby={id}
        aria-valuemin={0}
        aria-valuemax={unlimited || off ? undefined : limit}
        aria-valuenow={used}
      >
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

export const Alert = ({ tone = 'error', children, onClose }) => {
  const styles = {
    error: 'border-red-200 bg-red-50 text-red-800',
    success: 'border-green-200 bg-green-50 text-green-800',
    info: 'border-teal-200 bg-teal-50 text-teal-900',
  }
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${styles[tone]}`}>
      <div className="min-w-0">{children}</div>
      {onClose && (
        <button type="button" onClick={onClose} className="shrink-0 font-semibold underline-offset-2 hover:underline">
          Dismiss
        </button>
      )}
    </div>
  )
}

export const PageHeader = ({ title, subtitle, actions }) => (
  <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </div>
)

// Horizontal scroll on small screens instead of squashing columns.
export const Table = ({ children, minWidth = 720 }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left text-sm" style={{ minWidth }}>
      {children}
    </table>
  </div>
)

export const Th = ({ children, className = '' }) => (
  <th scope="col" className={`whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-600 ${className}`}>
    {children}
  </th>
)

export const Td = ({ children, className = '', ...props }) => (
  <td className={`border-b border-slate-100 px-4 py-3 align-middle ${className}`} {...props}>
    {children}
  </td>
)
