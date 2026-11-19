// Chassis Number (VIN) rules. Keep in step with backend/src/services/chassis.js.
//
// Vehicles made from 2000 on carry the standard 17-character VIN: letters A-Z
// and digits 0-9, never I, O or Q. Older vehicles (manufacturing year before
// 2000) were stamped before that standard, so their RC may show a shorter
// chassis number: 5 to 17 letters or digits. Anything else is rejected.

export const VIN_LENGTH = 17
export const LEGACY_BEFORE_YEAR = 2000
export const LEGACY_MIN_LENGTH = 5

const STANDARD_VIN = /^[A-HJ-NPR-Z0-9]{17}$/

// Trim and upper-case; the value that is stored and compared.
export const normalizeChassis = (value) => String(value ?? '').trim().toUpperCase()

export const isLegacyYear = (year) => {
  const n = Number(String(year ?? '').trim())
  return Number.isInteger(n) && n > 0 && n < LEGACY_BEFORE_YEAR
}

// → { value, error }; error is '' when the number is acceptable.
export const validateChassis = (raw, year) => {
  const value = normalizeChassis(raw)
  const legacy = isLegacyYear(year)

  if (!value) return { value, error: 'Chassis Number is required.' }

  if (legacy) {
    if (/[^A-Z0-9]/.test(value)) {
      return { value, error: 'Invalid Chassis Number. Special characters and spaces are not allowed.' }
    }
    if (value.length < LEGACY_MIN_LENGTH) {
      return {
        value,
        error: `Chassis Number must contain ${LEGACY_MIN_LENGTH} to ${VIN_LENGTH} characters for vehicles manufactured before ${LEGACY_BEFORE_YEAR}.`,
      }
    }
    if (value.length > VIN_LENGTH) return { value, error: 'Chassis Number cannot exceed 17 characters.' }
    return { value, error: '' }
  }

  if (/[^A-Z0-9]/.test(value) || /[IOQ]/.test(value)) {
    return { value, error: 'Invalid Chassis Number. Letters I, O and Q and special characters are not allowed.' }
  }
  if (value.length < VIN_LENGTH) return { value, error: 'Chassis Number must contain exactly 17 characters.' }
  if (value.length > VIN_LENGTH) return { value, error: 'Chassis Number cannot exceed 17 characters.' }
  return STANDARD_VIN.test(value) ? { value, error: '' } : { value, error: 'Invalid Chassis Number. Letters I, O and Q and special characters are not allowed.' }
}
