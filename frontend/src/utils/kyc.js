// KYC & Identity Documents (New Loan -> Customer step): Aadhaar and Indian
// Driving Licence number rules, Aadhaar masking, and the upload policy for
// KYC files. Keep in step with backend/src/services/kyc.js.
//
// Both numbers are optional (no approved policy makes them mandatory); they
// are only checked when filled in.

/* ---------- Aadhaar ---------- */

// Verhoeff check-digit tables (UIDAI's checksum for Aadhaar numbers).
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]
const verhoeffValid = (digits) => {
  let c = 0
  const reversed = digits.split('').reverse()
  for (let i = 0; i < reversed.length; i++) c = VERHOEFF_D[c][VERHOEFF_P[i % 8][Number(reversed[i])]]
  return c === 0
}

// Spaces (e.g. "3837 9374 2974") are allowed while typing and removed.
export const normalizeAadhaar = (value) => String(value ?? '').replace(/\s+/g, '')

export const AADHAAR_ERROR = 'Please enter a valid 12-digit Aadhaar number.'

export const validateAadhaar = (value) => {
  const digits = normalizeAadhaar(value)
  if (!digits) return ''
  // 12 digits; Aadhaar never starts with 0 or 1; the last digit is a
  // Verhoeff check digit (catches typos and made-up numbers like 000000000000).
  if (!/^[2-9]\d{11}$/.test(digits) || !verhoeffValid(digits)) return AADHAAR_ERROR
  return ''
}

// "XXXX XXXX 2974" — only the last 4 digits are ever shown once entered.
export const maskAadhaar = (value) => {
  const digits = normalizeAadhaar(value).replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length < 4) return 'X'.repeat(digits.length)
  const last4 = digits.slice(-4)
  return `${'X'.repeat(Math.max(digits.length - 4, 0))}${last4}`.replace(/(.{4})(?=.)/g, '$1 ')
}

/* ---------- Indian Driving Licence ---------- */

// The rules are data, so they can be adjusted without touching the check.
// Format: state code + RTO code + year of issue + serial, e.g. TN22 2018 0009876.
export const DL_RULES = {
  stateCodes: [
    'AN', 'AP', 'AR', 'AS', 'BR', 'CG', 'CH', 'DD', 'DL', 'DN', 'GA', 'GJ', 'HP', 'HR', 'JH', 'JK',
    'KA', 'KL', 'LA', 'LD', 'MH', 'ML', 'MN', 'MP', 'MZ', 'NL', 'OD', 'OR', 'PB', 'PY', 'RJ', 'SK',
    'TG', 'TN', 'TR', 'TS', 'UA', 'UK', 'UP', 'WB',
  ],
  rtoDigits: 2, // RTO code 01-99
  serialDigits: 7, // licence serial, not all zeros
  earliestYear: 1950,
}

export const DL_EXAMPLE = 'TN2220180009876'

// Upper case, spaces and hyphens removed ("tn-22 2018 0009876" -> "TN2220180009876").
export const normalizeDrivingLicence = (value) => String(value ?? '').toUpperCase().replace(/[\s-]+/g, '')

export const validateDrivingLicence = (value, rules = DL_RULES, thisYear = new Date().getFullYear()) => {
  const dl = normalizeDrivingLicence(value)
  if (!dl) return ''
  const pattern = new RegExp(`^([A-Z]{2})(\\d{${rules.rtoDigits}})(\\d{4})(\\d{${rules.serialDigits}})$`)
  const match = dl.match(pattern)
  if (!match) return `Please enter a valid Driving Licence number, e.g. ${DL_EXAMPLE}.`
  const [, state, rto, year, serial] = match
  if (!rules.stateCodes.includes(state)) return `"${state}" is not a valid Indian state code for a Driving Licence.`
  if (/^0+$/.test(rto)) return 'The RTO code in the Driving Licence number is not valid.'
  if (Number(year) < rules.earliestYear || Number(year) > thisYear) return 'The year of issue in the Driving Licence number is not valid.'
  if (/^0+$/.test(serial)) return 'The serial number in the Driving Licence number is not valid.'
  return ''
}

/* ---------- KYC file uploads ---------- */

export const KYC_FILE_POLICY = {
  maxBytes: 2 * 1024 * 1024,
  // extension -> allowed MIME types
  types: {
    pdf: ['application/pdf'],
    jpg: ['image/jpeg'],
    jpeg: ['image/jpeg'],
    png: ['image/png'],
  },
}

export const KYC_FILE_HINT = 'PDF, JPG, JPEG or PNG · max 2 MB'
export const KYC_FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png'

const extensionOf = (name) => (String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || ''

const startsWith = (bytes, signature) => signature.every((byte, index) => bytes[index] === byte)

// What the file really is, from its first bytes (not its name).
const SIGNATURES = [
  { kind: 'pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  { kind: 'jpeg', bytes: [0xff, 0xd8, 0xff] },
  { kind: 'png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { kind: 'executable', bytes: [0x4d, 0x5a] }, // MZ (Windows .exe/.dll)
  { kind: 'executable', bytes: [0x7f, 0x45, 0x4c, 0x46] }, // ELF
]
export const sniffKind = (bytes) => SIGNATURES.find((s) => startsWith(bytes, s.bytes))?.kind || 'unknown'

const kindForExtension = (ext) => (ext === 'jpg' || ext === 'jpeg' ? 'jpeg' : ext)

// Checks only the name / type / size (also used for files restored from a draft).
export const validateKycFileMeta = (file) => fileMetaError(file, KYC_FILE_POLICY, 'PDF, JPG, JPEG or PNG')

const readAsArrayBuffer = (file, onProgress) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100))
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('The file could not be read.'))
    reader.readAsArrayBuffer(file)
  })

const imageDecodes = (blob) =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img.naturalWidth > 0 && img.naturalHeight > 0)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(false)
    }
    img.src = url
  })

const toHex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')

const toDataUrl = (bytes, mime) => {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return `data:${mime};base64,${btoa(binary)}`
}

// Vehicle photo (optional): images only, larger limit (it is compressed
// before saving).
export const VEHICLE_PHOTO_POLICY = {
  maxBytes: 5 * 1024 * 1024,
  types: {
    jpg: ['image/jpeg'],
    jpeg: ['image/jpeg'],
    png: ['image/png'],
  },
}
export const VEHICLE_PHOTO_HINT = 'JPG, JPEG or PNG · max 5 MB'
export const VEHICLE_PHOTO_ACCEPT = '.jpg,.jpeg,.png,image/jpeg,image/png'

const fileMetaError = ({ name, type, size }, policy, allowedText) => {
  const ext = extensionOf(name)
  const allowed = policy.types[ext]
  if (!allowed) return `This file type is not allowed. Use ${allowedText}.`
  if (type && !allowed.includes(String(type).toLowerCase())) return 'The file type does not match its extension.'
  if (!Number(size)) return 'The file is empty (0 bytes).'
  if (Number(size) > policy.maxBytes) return `The file is larger than ${Math.round(policy.maxBytes / (1024 * 1024))} MB.`
  return ''
}

export const checkVehiclePhoto = (file, options) =>
  checkUploadFile(file, options, VEHICLE_PHOTO_POLICY, 'JPG, JPEG or PNG')

// Full check of a picked KYC file: name, size, real content (first bytes),
// executables, and that an image/PDF is not cut off or corrupted.
// Resolves { error } or { file: { name, type, size, data, sha256 } }.
export const checkKycFile = (file, options) =>
  checkUploadFile(file, options, KYC_FILE_POLICY, 'PDF, JPG, JPEG or PNG')

const checkUploadFile = async (file, { onProgress } = {}, policy, allowedText) => {
  if (!file) return { error: 'No file was selected.' }
  const metaError = fileMetaError(file, policy, allowedText)
  if (metaError) return { error: metaError }

  let buffer
  try {
    buffer = await readAsArrayBuffer(file, onProgress)
  } catch (error) {
    return { error: error.message }
  }
  const bytes = new Uint8Array(buffer)
  if (!bytes.length) return { error: 'The file is empty (0 bytes).' }

  const kind = sniffKind(bytes)
  if (kind === 'executable') return { error: 'Program files are not allowed. Upload a PDF or an image.' }
  if (kind !== kindForExtension(extensionOf(file.name))) {
    return { error: "The file's content does not match its type. It may be renamed or corrupted." }
  }

  const mime = policy.types[extensionOf(file.name)][0]
  if (kind === 'pdf') {
    const tail = new TextDecoder('latin1').decode(bytes.subarray(Math.max(0, bytes.length - 2048)))
    if (!tail.includes('%%EOF')) return { error: 'The PDF looks incomplete or corrupted.' }
  } else if (!(await imageDecodes(new Blob([bytes], { type: mime })))) {
    return { error: 'The image could not be opened. It may be corrupted.' }
  }

  let sha256
  try {
    sha256 = toHex(await crypto.subtle.digest('SHA-256', buffer))
  } catch {
    sha256 = `${file.name}:${file.size}` // no Web Crypto (e.g. plain http): name+size instead
  }

  return {
    file: { name: file.name, type: mime, size: file.size, data: toDataUrl(bytes, mime), sha256 },
  }
}

// "245.3 KB" / "1.4 MB"
export const formatFileSize = (size) => {
  const bytes = Number(size)
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`
}

/* ---------- the whole KYC section ---------- */

// A file restored from a saved draft/loan has its name but no content
// (documents are not stored yet), so it has to be attached again.
export const needsReattach = (file) => Boolean(file && !file.data)

// → { aadhaarNo, dlNo, docs: { [docId]: { title, file } } } with '' for fine.
export const validateKyc = (customer = {}) => {
  const docs = {}
  for (const doc of Array.isArray(customer.additionalDocs) ? customer.additionalDocs : []) {
    const title = String(doc.title || '').trim()
    docs[doc.id] = {
      title: doc.file && !title ? 'Enter the document type (e.g. PAN Card).' : '',
      file: title && !doc.file ? 'Upload this document, or remove the entry.' : '',
    }
  }
  return {
    aadhaarNo: validateAadhaar(customer.aadhaarNo),
    dlNo: validateDrivingLicence(customer.dlNo),
    docs,
  }
}

export const kycHasErrors = (errors = {}) =>
  Boolean(errors.aadhaarNo || errors.dlNo || Object.values(errors.docs || {}).some((d) => d.title || d.file))
