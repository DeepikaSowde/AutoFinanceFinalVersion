// New Loan -> Guarantor & Referral: the rules for each form.
//
// Which forms are checked depends on the chosen option (both / guarantor /
// referral / none). A Guarantor and a Referral each need every contact field
// and the Aadhaar document; a Referral also needs Commission (%), more than 0
// and at most 100. Its amount is always calculated from the loan amount.
//
// Number, address and file rules are the same ones the Customer step uses.

import { validateMobile } from './mobile'
import { validateAadhaar, validateKycFileMeta, needsReattach } from './kyc'
import { validateAddress, validateLocality, validatePincode } from './customerDetails'

const CONTACT_FIELDS = ['fullName', 'mobile', 'aadhaar', 'pincode', 'address', 'area', 'landmark', 'aadhaarFile']

export const REQUIRED_FIELDS = {
  guarantor: CONTACT_FIELDS,
  referral: [...CONTACT_FIELDS, 'commission'],
}

export const MAX_COMMISSION_PERCENT = 100

const REQUIRED_MESSAGES = {
  fullName: 'Please enter the full name.',
  mobile: 'Please enter the mobile number.',
  aadhaar: 'Please enter the Aadhaar number.',
  pincode: 'Please enter the pincode.',
  address: 'Please enter the address.',
  area: 'Please enter the area / locality.',
  landmark: 'Please enter the landmark.',
  aadhaarFile: 'Please upload the Aadhaar document.',
  commission: 'Please enter the commission percentage.',
}

/* ---------- referral commission ---------- */

export const commissionError = (value) => {
  const typed = String(value ?? '').trim()
  if (!typed) return REQUIRED_MESSAGES.commission
  if (/^-/.test(typed)) return 'Commission must be more than 0%.'
  // digits with an optional decimal part (up to the 4 places that are stored)
  if (!/^(\d+(\.\d{0,4})?|\.\d{1,4})$/.test(typed)) {
    return /^\d*\.\d{5,}$/.test(typed) ? 'Use at most 4 decimal places.' : 'Enter a number, e.g. 2 or 1.5.'
  }
  if (!(Number(typed) > 0)) return 'Commission must be more than 0%.'
  if (Number(typed) > MAX_COMMISSION_PERCENT) return `Commission cannot be more than ${MAX_COMMISSION_PERCENT}%.`
  return ''
}

// Loan amount x percentage / 100, to the nearest rupee (half a rupee rounds
// up); '' until both are valid. Worked in whole numbers so that, for example,
// 100.5 is never read as 100.49999.
export const commissionAmountFor = (principal, percentage) => {
  const amount = Number(principal)
  if (commissionError(percentage) || !(amount > 0) || !Number.isFinite(amount)) return ''
  return String(Math.round(Math.round(amount * Number(percentage) * 10000) / 1000000))
}

// The forms that must be valid for a relationship option.
export const formsFor = (option) =>
  option === 'both' ? ['guarantor', 'referral'] : option === 'guarantor' || option === 'referral' ? [option] : []

const text = (value) => String(value ?? '').trim()

const valuesOf = (person = {}) => ({
  fullName: text(person.fullName || person.name),
  mobile: text(person.phone || person.mobile),
  aadhaar: text(person.aadhaarNumber || person.aadhaarNo),
  pincode: text(person.pincode),
  address: text(person.address),
  area: text(person.area),
  landmark: text(person.landmark),
})

// An attached document: still has its content (a reopened draft keeps only
// the name), is a PDF / JPG / PNG, and is at most 2 MB.
export const documentError = (file) => {
  if (needsReattach(file)) return 'Please attach this document again.'
  const [, type = '', content = ''] = String(file?.data || '').match(/^data:([^;,]*)[^,]*,(.*)$/s) || []
  const size = Math.floor((content.length * 3) / 4) - (content.endsWith('==') ? 2 : content.endsWith('=') ? 1 : 0)
  // The name may be missing on an old record; the content's type still counts.
  const name = file?.name || `document.${type === 'application/pdf' ? 'pdf' : type === 'image/png' ? 'png' : 'jpg'}`
  const extension = (name.toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1]
  const typeAllowed = ['application/pdf', 'image/jpeg', 'image/png'].includes(type)
  if (!typeAllowed && ['pdf', 'jpg', 'jpeg', 'png'].includes(extension)) {
    return 'This file type is not allowed. Use PDF, JPG, JPEG or PNG.'
  }
  return validateKycFileMeta({ name, type: '', size })
}

const formatError = {
  fullName: () => '',
  mobile: validateMobile,
  aadhaar: validateAadhaar,
  pincode: validatePincode,
  address: validateAddress,
  area: (value) => validateLocality(value, 'Area / Locality'),
  landmark: (value) => validateLocality(value, 'Landmark'),
}

// → { fullName, mobile, ..., aadhaarFile, docs: { [docId]: message } }, with
// '' for a field that is fine; a referral also has commission and
// commissionAmount, which needs the loan amount (`principal`).
export const validatePerson = (person = {}, type = 'guarantor', { principal = 0 } = {}) => {
  const required = REQUIRED_FIELDS[type]
  const values = valuesOf(person)
  const errors = {}
  for (const [field, value] of Object.entries(values)) {
    if (!value) errors[field] = required.includes(field) ? REQUIRED_MESSAGES[field] : ''
    else errors[field] = formatError[field](value)
  }
  if (person?.aadhaarFile) errors.aadhaarFile = documentError(person.aadhaarFile)
  else errors.aadhaarFile = required.includes('aadhaarFile') ? REQUIRED_MESSAGES.aadhaarFile : ''

  // Additional documents are optional; an untouched row is ignored.
  errors.docs = {}
  for (const doc of Array.isArray(person?.additionalDocs) ? person.additionalDocs : []) {
    if (doc.file) errors.docs[doc.id] = documentError(doc.file)
    else errors.docs[doc.id] = text(doc.title) ? 'Upload this document, or remove the entry.' : ''
  }

  if (type === 'referral') {
    errors.commission = commissionError(person?.commissionPercentage)
    const amount = commissionAmountFor(principal, person?.commissionPercentage)
    errors.commissionAmount = errors.commission
      ? ''
      : !(Number(principal) > 0)
      ? 'Enter the Loan Amount to calculate the commission.'
      : Number(amount) > 0
      ? ''
      : 'The commission works out to ₹0. Enter a higher percentage.'
  }
  return errors
}

export const personHasErrors = ({ docs = {}, ...fields } = {}) =>
  Object.values(fields).some(Boolean) || Object.values(docs).some(Boolean)

// Only the messages to show: all of them once the form has been checked
// (shown['*']), otherwise those of the fields the user has left.
export const shownPersonErrors = (errors, shown = {}) => {
  if (shown['*']) return errors
  // The calculated amount's message goes with the percentage it comes from.
  const visible = Object.fromEntries(
    Object.entries(errors).filter(([field]) => shown[field === 'commissionAmount' ? 'commission' : field])
  )
  return { ...visible, docs: {} }
}

// Anything typed or attached (defaults such as +91 or Cash don't count).
export const hasPersonData = (person = {}) =>
  Object.values(valuesOf(person)).some(Boolean) ||
  Boolean(person.aadhaarFile) ||
  Boolean(person.additionalDocs?.length) ||
  Boolean(text(person.commissionPercentage) || Number(person.commissionAmount) > 0 || person.payCommission)
