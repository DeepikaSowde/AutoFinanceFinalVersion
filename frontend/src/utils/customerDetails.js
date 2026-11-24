// New Loan -> Customer Details: the rules for each field. Keep in step with
// backend/src/services/customerDetails.js.
//
//   Customer Name   required; letters of any script (Tamil included), spaces,
//                   and . ' - (initials, "D'Souza", "Mary-Ann"); max 100
//   Mobile Number   required; see utils/mobile.js (10 digits, starts 6-9)
//   Application Date  required; today or earlier, not before 2000
//   Pincode         optional; 6 digits, not starting with 0
//   Address         required; must contain a letter or digit; max 500
//   Area / Landmark optional; max 150
//
// Each validator returns '' when the value is fine, otherwise the message.

import { validateMobile } from './mobile'
import { validateApplicationDate } from './applicationDate'

export const NAME_MAX = 100
export const ADDRESS_MAX = 500
export const LOCALITY_MAX = 150

// Letters/marks of any script, spaces and . ' - only, with at least one letter.
const NAME_CHARS = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u
// Control characters other than tab / line breaks.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/

// Trimmed, with runs of spaces inside collapsed to one.
export const cleanName = (value) => String(value ?? '').trim().replace(/\s+/g, ' ')
export const cleanText = (value) => String(value ?? '').trim()

export const validateCustomerName = (value) => {
  const name = cleanName(value)
  if (!name) return 'Please enter the customer name.'
  if (name.length > NAME_MAX) return `Customer name must be at most ${NAME_MAX} characters.`
  if (!NAME_CHARS.test(name)) return "Customer name can only have letters, spaces, and . ' -"
  return ''
}

export const validateAddress = (value) => {
  const address = cleanText(value)
  if (!address) return 'Please enter the address.'
  if (address.length > ADDRESS_MAX) return `Address must be at most ${ADDRESS_MAX} characters.`
  if (CONTROL_CHARS.test(address)) return 'Address has characters that are not allowed.'
  if (!HAS_LETTER_OR_DIGIT.test(address)) return 'Please enter a valid address.'
  return ''
}

export const validatePincode = (value) => {
  const pincode = cleanText(value)
  if (!pincode) return ''
  if (!/^[1-9]\d{5}$/.test(pincode)) return 'Please enter a valid 6-digit pincode.'
  return ''
}

// Area / Locality and Landmark: optional.
export const validateLocality = (value, label) => {
  const text = cleanText(value)
  if (text.length > LOCALITY_MAX) return `${label} must be at most ${LOCALITY_MAX} characters.`
  if (CONTROL_CHARS.test(text)) return `${label} has characters that are not allowed.`
  return ''
}

// Every Customer Details field -> its message ('' when fine). A re-loan keeps
// the existing customer's name, mobile and address as they are, so those are
// not checked for it.
export const validateCustomerDetails = (customer = {}, { isReLoan = false } = {}) => ({
  name: isReLoan ? '' : validateCustomerName(customer.name),
  mobile: isReLoan ? '' : validateMobile(customer.mobile),
  applicationDate: validateApplicationDate(customer.applicationDate),
  pincode: isReLoan ? '' : validatePincode(customer.pincode),
  address: isReLoan ? '' : validateAddress(customer.address),
  area: isReLoan ? '' : validateLocality(customer.area, 'Area / Locality'),
  landmark: isReLoan ? '' : validateLocality(customer.landmark, 'Landmark'),
})

export const hasErrors = (errors) => Object.values(errors).some(Boolean)

// The message for one field, used to re-check it while it is being fixed.
export const validateCustomerField = (field, value) => {
  switch (field) {
    case 'name': return validateCustomerName(value)
    case 'mobile': return validateMobile(value)
    case 'applicationDate': return validateApplicationDate(value)
    case 'pincode': return validatePincode(value)
    case 'address': return validateAddress(value)
    case 'area': return validateLocality(value, 'Area / Locality')
    case 'landmark': return validateLocality(value, 'Landmark')
    default: return ''
  }
}
