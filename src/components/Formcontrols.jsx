import React, { useRef, useState, useEffect } from 'react'
import { useTranslation } from "react-i18next";

/* ---------- helpers ---------- */
export const formatINR = (n) =>
  n === '' || n === null || n === undefined || isNaN(Number(n))
    ? '—'
    : `₹ ${Math.round(Number(n)).toLocaleString('en-IN')}`

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
    <header className="flex flex-wrap items-center justify-between gap-2 bg-emerald-50 px-3.5 py-2 sm:px-4 sm:py-2.5">
      <h3 className="text-xs font-semibold text-emerald-900 sm:text-sm">{title}</h3>
      {right}
    </header>
    <div className="p-3 sm:p-3.5">{children}</div>
  </section>
)

export const Field = ({ label, required, hint, children, className = '' }) => (
  <div className={className}>
    {label && (
      <label className="mb-1 block text-xs font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
    )}
    {children}
    {hint && <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>}
  </div>
)

export const InfoNote = ({ children }) => (
  <div className="flex items-start gap-2 rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs text-slate-600">
    <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" />
    <span>{children}</span>
  </div>
)

/* ---------- inputs ---------- */
export const inputCls =
  'h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#006052] focus:outline-none focus:ring-1 focus:ring-[#006052]/30 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 transition-colors'

export const Input = ({ className = '', ...props }) => <input className={`${inputCls} ${className}`} {...props} />

export const Textarea = ({ className = '', rows = 2, ...props }) => (
  <textarea rows={rows} className={`w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#006052] focus:outline-none focus:ring-1 focus:ring-[#006052]/30 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 resize-y transition-colors ${className}`} {...props} />
)

export const Select = ({
  placeholder,
  options = [],
  translationKey,
  className = "",
  ...props
}) => {
  const { t } = useTranslation();

  return (
    <div className="relative">
      <select
        className={`${inputCls} appearance-none pr-9 ${className}`}
        {...props}
      >
        {placeholder && (
          <option value="">
            {placeholder}
          </option>
        )}

        {options.map((option) => (
          <option key={option} value={option}>
            {translationKey
              ? t(`${translationKey}.${option}`, {
                  defaultValue: option,
                })
              : option}
          </option>
        ))}
      </select>

      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
    </div>
  );
};
/** Input with a fixed prefix (₹) or suffix (%, Days, Amount) */
export const AdornedInput = ({ prefix, suffix, disabled, className = '', ...props }) => (
  <div className={`flex h-9 items-center rounded-md border border-slate-300 bg-white focus-within:border-[#006052] focus-within:ring-1 focus-within:ring-[#006052]/30 transition-colors ${disabled ? 'bg-slate-50' : ''} ${className}`}>
    {prefix && <span className="pl-2.5 text-xs sm:text-sm text-slate-500 shrink-0">{prefix}</span>}
    <input disabled={disabled} className="h-full w-full min-w-0 bg-transparent px-2.5 py-1 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed disabled:text-slate-400" {...props} />
    {suffix && <span className="border-l border-slate-200 px-2.5 py-1 text-xs sm:text-sm text-slate-500 shrink-0">{suffix}</span>}
  </div>
)

export const PhoneInput = ({ code, mobile, onCodeChange, onMobileChange, className = '' }) => {
  const { t } = useTranslation()

  return (
  <div className={`flex items-center gap-1.5 ${className}`}>
    <div className="relative w-14 shrink-0">
      <select
        value={code}
        onChange={(e) => onCodeChange(e.target.value)}
        className="h-9 w-full appearance-none rounded-md border border-slate-300 bg-white pl-2 pr-5 text-xs sm:text-sm font-medium text-slate-800 focus:border-[#006052] focus:outline-none focus:ring-1 focus:ring-[#006052]/30"
      >
        <option value="+91">+91</option>
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
    </div>
    <input
      type="tel"
      inputMode="numeric"
      maxLength={10}
      value={mobile}
      onChange={(e) => onMobileChange(e.target.value.replace(/\D/g, ''))}
      placeholder={t('common.enterMobileNumber')}
      className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2.5 text-xs sm:text-sm font-mono tracking-wider text-slate-800 placeholder:text-slate-400 placeholder:tracking-normal focus:border-[#006052] focus:outline-none focus:ring-1 focus:ring-[#006052]/30"
    />
  </div>
  )
}

export const RadioGroup = ({
  name,
  options = [],
  value,
  onChange,
  translationKey,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-4">
      {options.map((option) => (
        <label
          key={option}
          className="flex items-center gap-2 text-xs text-slate-700"
        >
          <input
            type="radio"
            name={name}
            value={option}
            checked={value === option}
            onChange={() => onChange(option)}
          />

          <span>
            {translationKey
              ? t(`${translationKey}.${option}`, {
                  defaultValue: option,
                })
              : option}
          </span>
        </label>
      ))}
    </div>
  );
};



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
export const PhotoUpload = ({ title, hint, file, onFile, defaultPreviewUrl, alt = '' }) => {
  const ref = useRef(null)
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    setImgError(false)
  }, [file, defaultPreviewUrl])

  // Supports:
  // 1. Newly selected File object
  // 2. Base64 object restored from localStorage
  // 3. Direct string (data URI or URL)
  const getPreviewUrl = () => {
    if (!file) return null

    // Restored from localStorage
    if (file.data) {
      return file.data
    }

    // Newly selected browser File
    if (file instanceof File) {
      return URL.createObjectURL(file)
    }

    // Direct string
    if (typeof file === 'string' && file.trim()) {
      return file.trim()
    }

    return null
  }

  const previewUrl = getPreviewUrl()
  const displaySrc = !imgError ? (previewUrl || defaultPreviewUrl) : null

  return (
    <div>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg"
        hidden
        onChange={(e) =>
          onFile(e.target.files?.[0] || null)
        }
      />

      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="flex min-h-[140px] w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-emerald-400 bg-white p-4 text-center hover:bg-emerald-50 transition-colors cursor-pointer group"
      >
        {displaySrc ? (
          <div className="flex flex-col items-center gap-2">
            <img
              src={displaySrc}
              alt={alt || title || "Vehicle Preview"}
              onError={() => setImgError(true)}
              className="max-h-32 rounded object-contain shadow-2xs group-hover:scale-105 transition-transform"
            />
            <span className="text-[11px] text-slate-500 font-medium">
              {previewUrl ? 'Uploaded photo (click to change)' : 'Auto-selected model image (click to upload custom photo)'}
            </span>
          </div>
        ) : (
          <>
            <CameraIcon className="h-7 w-7 text-slate-700" />

            <span className="text-sm font-medium text-slate-800">
              {title}
            </span>

            <span className="text-xs text-slate-500">
              {hint}
            </span>
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