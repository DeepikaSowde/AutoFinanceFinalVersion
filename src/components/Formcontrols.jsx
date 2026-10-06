import React, { useRef } from 'react'

/* ---------- helpers ---------- */
export const formatINR = (n) =>
  n === '' || n === null || n === undefined || isNaN(Number(n))
    ? '—'
    : `₹ ${Number(n).toLocaleString('en-IN')}`

export const formatDate = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

/* ---------- icons (inline SVG, no extra dependency) ---------- */
const Svg = ({ children, className = 'h-4 w-4', ...p }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} {...p}>
    {children}
  </svg>
)
export const ChevronDown = (p) => <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>
export const UploadIcon = (p) => <Svg {...p}><path d="M12 16V4m0 0-4 4m4-4 4 4M4 20h16" /></Svg>
export const CheckCircle = ({ className = 'h-4 w-4' }) => (
  <svg viewBox="0 0 24 24" className={className}><circle cx="12" cy="12" r="11" fill="currentColor" /><path d="m7 12.5 3.2 3.2L17 9" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
)
export const InfoIcon = (p) => <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4m0-4h.01" /></Svg>
export const CameraIcon = (p) => <Svg {...p}><path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="3.5" /></Svg>
export const ArrowRight = (p) => <Svg {...p}><path d="M5 12h14m-6-6 6 6-6 6" /></Svg>
export const ArrowLeft = (p) => <Svg {...p}><path d="M19 12H5m6-6-6 6 6 6" /></Svg>
export const PlusIcon = (p) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
export const RefreshIcon = (p) => <Svg {...p}><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16m0 0v5m0-5h5M3 12A9 9 0 0 1 18.5 5.8L21 8m0 0V3m0 5h-5" /></Svg>
export const CalendarIcon = (p) => <Svg {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4m8-4v4" /></Svg>
export const ClockIcon = (p) => <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="M12 7v5l3 2" /></Svg>

/* ---------- layout ---------- */
export const SectionCard = ({ title, right, children, className = '' }) => (
  <section className={`overflow-hidden rounded-lg border border-emerald-100 bg-white ${className}`}>
    <header className="flex flex-wrap items-center justify-between gap-2 bg-emerald-50 px-4 py-3">
      <h3 className="text-sm font-semibold text-emerald-900 sm:text-base">{title}</h3>
      {right}
    </header>
    <div className="p-4">{children}</div>
  </section>
)

export const Field = ({ label, required, hint, children, className = '' }) => (
  <div className={className}>
    {label && (
      <label className="mb-1 block text-xs font-medium text-slate-700 sm:text-sm">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
    )}
    {children}
    {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
  </div>
)

export const InfoNote = ({ children }) => (
  <div className="flex items-start gap-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-slate-600">
    <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
    <span>{children}</span>
  </div>
)

/* ---------- inputs ---------- */
export const inputCls =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400'

export const Input = ({ className = '', ...props }) => <input className={`${inputCls} ${className}`} {...props} />

export const Textarea = ({ className = '', ...props }) => (
  <textarea rows={3} className={`${inputCls} resize-y ${className}`} {...props} />
)

export const Select = ({ placeholder, options = [], className = '', ...props }) => (
  <div className="relative">
    <select className={`${inputCls} appearance-none pr-9 ${className}`} {...props}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
  </div>
)

/** Input with a fixed prefix (₹) or suffix (%, Days, Amount) */
export const AdornedInput = ({ prefix, suffix, disabled, ...props }) => (
  <div className={`flex items-center rounded-md border border-slate-300 bg-white focus-within:border-emerald-600 focus-within:ring-1 focus-within:ring-emerald-600 ${disabled ? 'bg-slate-50' : ''}`}>
    {prefix && <span className="pl-3 text-sm text-slate-500">{prefix}</span>}
    <input disabled={disabled} className="w-full min-w-0 bg-transparent px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed disabled:text-slate-400" {...props} />
    {suffix && <span className="border-l border-slate-200 px-3 py-2 text-sm text-slate-500">{suffix}</span>}
  </div>
)

export const PhoneInput = ({ code, mobile, onCodeChange, onMobileChange }) => (
  <div className="flex">
    <div className="relative w-20 shrink-0">
      <select
        value={code}
        onChange={(e) => onCodeChange(e.target.value)}
        className={`${inputCls} appearance-none rounded-r-none pr-6`}
      >
        <option value="+91">+91</option>
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
    </div>
    <input
      type="tel"
      inputMode="numeric"
      maxLength={10}
      value={mobile}
      onChange={(e) => onMobileChange(e.target.value.replace(/\D/g, ''))}
      placeholder="Enter 10-digit mobile number"
      className={`${inputCls} rounded-l-none border-l-0`}
    />
  </div>
)

export const RadioGroup = ({ name, options, value, onChange, disabled, className = 'flex flex-wrap gap-x-6 gap-y-2' }) => (
  <div className={className}>
    {options.map((o) => (
      <label key={o} className={`flex items-center gap-2 text-sm ${disabled ? 'text-slate-400' : 'cursor-pointer text-slate-700'}`}>
        <input
          type="radio"
          name={name}
          value={o}
          checked={value === o}
          disabled={disabled}
          onChange={() => onChange(o)}
          className="h-4 w-4 accent-emerald-700"
        />
        {o}
      </label>
    ))}
  </div>
)

/** Button that opens a file picker; shows "Uploaded" tick below when a file exists */
export const UploadButton = ({ label, file, onFile, accept = 'image/*,.pdf', disabled, icon: Icon = UploadIcon }) => {
  const ref = useRef(null)
  return (
    <div>
      <input
        ref={ref}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => onFile(e.target.files?.[0] || null)}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => ref.current?.click()}
        className="flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:border-emerald-600 hover:text-emerald-800 disabled:cursor-not-allowed disabled:text-slate-400 sm:text-sm"
      >
        <Icon className="h-4 w-4" />
        {label}
      </button>
      {file && (
        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-700">
          <CheckCircle className="h-3.5 w-3.5" /> Uploaded
        </p>
      )}
    </div>
  )
}

/** Dashed photo upload box (vehicle / guarantor photo) */
export const PhotoUpload = ({ title, hint, file, onFile }) => {
  const ref = useRef(null)
  return (
    <div>
      <input ref={ref} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => onFile(e.target.files?.[0] || null)} />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="flex min-h-[140px] w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-emerald-400 bg-white p-4 text-center hover:bg-emerald-50"
      >
        {file ? (
          <img src={URL.createObjectURL(file)} alt="" className="max-h-32 rounded object-contain" />
        ) : (
          <>
            <CameraIcon className="h-7 w-7 text-slate-700" />
            <span className="text-sm font-medium text-slate-800">{title}</span>
            <span className="text-xs text-slate-500">{hint}</span>
          </>
        )}
      </button>
    </div>
  )
}

/** Button used for "View Schedule", "Fetch Vehicle Details", etc. */
export const OutlineButton = ({ children, className = '', ...props }) => (
  <button
    type="button"
    className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-emerald-700 bg-white px-4 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-50 sm:text-sm ${className}`}
    {...props}
  >
    {children}
  </button>
)