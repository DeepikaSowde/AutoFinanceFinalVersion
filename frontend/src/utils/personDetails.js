// New Loan -> Guarantor & Referral: the rules for each form.
//
// Which forms are checked depends on the chosen option (both / guarantor /
// referral / none). A Guarantor needs every field and the Aadhaar document.
// A Referral needs only Full Name and Mobile Number (what the register
// requires); its other fields are optional and checked when filled in.
//
// Number, address and file rules are the same ones the Customer step uses.

import { validateMobile } from './mobile'
import { validateAadhaar, validateKycFileMeta, needsReattach } from './kyc'
import { validateAddress, validateLocality, validatePincode } from './customerDetails'

export const REQUIRED_FIELDS = {
  guarantor: ['fullName', 'mobile', 'aadhaar', 'pincode', 'address', 'area', 'landmark', 'aadhaarFile'],
  referral: ['fullName', 'mobile'],
}

const REQUIRED_MESSAGES = {
  fullName: 'Please enter the full name.',
  mobile: 'Please enter the mobile number.',
  aadhaar: 'Please enter the Aadhaar number.',
  pincode: 'Please enter the pincode.',
  address: 'Please enter the address.',
  area: 'Please enter the area / locality.',
  landmark: 'Please enter the landmark.',
  aadhaarFile: 'Please upload the Aadhaar document.',
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
// '' for a field that is fine.
export const validatePerson = (person = {}, type = 'guarantor') => {
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
  return errors
}

export const personHasErrors = ({ docs = {}, ...fields } = {}) =>
  Object.values(fields).some(Boolean) || Object.values(docs).some(Boolean)

// Only the messages to show: all of them once the form has been checked
// (shown['*']), otherwise those of the fields the user has left.
export const shownPersonErrors = (errors, shown = {}) => {
  if (shown['*']) return errors
  const visible = Object.fromEntries(Object.entries(errors).filter(([field]) => shown[field]))
  return { ...visible, docs: {} }
}

// Anything typed or attached (defaults such as +91 or Cash don't count).
export const hasPersonData = (person = {}) =>
  Object.values(valuesOf(person)).some(Boolean) ||
  Boolean(person.aadhaarFile) ||
  Boolean(person.additionalDocs?.length) ||
  Boolean(text(person.commissionPercentage) || Number(person.commissionAmount) > 0 || person.payCommission)
