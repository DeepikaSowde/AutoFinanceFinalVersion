// New Loan -> Vehicle -> Vehicle Information: the rules for each field.
// Keep in step with backend/src/services/vehicleInfo.js.
//
//   Vehicle Number   required; Indian registration (TN 09 AB 1234, BH series)
//   Vehicle Type     required; one of the catalog's vehicle types
//   Brand, Model     required (catalog choice, or typed under "Other")
//   Variant          optional; max 60
//   Colour, Fuel Type, Ownership Type   required; one of the listed options
//   Manufacturing Year  required; 1980 .. this year
//   Vehicle Amount   required; ₹10,000 .. ₹5,00,00,000, up to 2 decimals
//
// Each validator returns '' when the value is fine, otherwise the message.

import { COLOURS, FUEL_TYPES, VEHICLE_OWNERSHIP_TYPES } from '../../Options'

export const VEHICLE_RULES = {
  earliestYear: 1980,
  minAmount: 10000,
  maxAmount: 50000000, // ₹5 crore
  // Indian state / UT codes used on number plates.
  stateCodes: [
    'AN', 'AP', 'AR', 'AS', 'BR', 'CG', 'CH', 'DD', 'DL', 'DN', 'GA', 'GJ', 'HP', 'HR', 'JH', 'JK',
    'KA', 'KL', 'LA', 'LD', 'MH', 'ML', 'MN', 'MP', 'MZ', 'NL', 'OD', 'OR', 'PB', 'PY', 'RJ', 'SK',
    'TG', 'TN', 'TR', 'TS', 'UA', 'UK', 'UP', 'WB',
  ],
}

// This year back to the earliest allowed, newest first.
export const manufacturingYears = (thisYear = new Date().getFullYear()) =>
  Array.from({ length: thisYear - VEHICLE_RULES.earliestYear + 1 }, (_, i) => String(thisYear - i))

/* ---------- Vehicle Number ---------- */

// Upper case without spaces / hyphens / dots: "tn 09-ab 1234" -> "TN09AB1234".
export const compactRegNo = (value) => String(value ?? '').toUpperCase().replace(/[\s.-]+/g, '')

// Standard plates: state (2 letters) + RTO (1-2 digits) + series (0-3
// letters) + number (1-4 digits). Bharat series: YY BH 1234 AB.
const STANDARD = /^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{1,4})$/
const BHARAT = /^(\d{2})(BH)(\d{4})([A-Z]{1,2})$/

// "TN09AB1234" -> "TN 09 AB 1234"; left as typed (upper case) if not valid.
export const formatRegNo = (value) => {
  const compact = compactRegNo(value)
  let m = compact.match(BHARAT)
  if (m) return `${m[1]} ${m[2]} ${m[3]} ${m[4]}`
  m = compact.match(STANDARD)
  if (m) return [m[1], m[2], m[3], m[4]].filter(Boolean).join(' ')
  return String(value ?? '').toUpperCase().trim()
}

export const validateRegNo = (value) => {
  const raw = String(value ?? '').trim()
  if (!raw) return 'Please enter the vehicle number.'
  if (/[^A-Za-z0-9 .-]/.test(raw)) return 'Vehicle number can only have letters, digits and spaces.'
  const compact = compactRegNo(raw)
  const bh = compact.match(BHARAT)
  if (bh) return /^0+$/.test(bh[3]) ? 'Please enter a valid vehicle number, e.g. TN 09 AB 1234.' : ''
  const m = compact.match(STANDARD)
  if (!m) return 'Please enter a valid vehicle number, e.g. TN 09 AB 1234.'
  if (!VEHICLE_RULES.stateCodes.includes(m[1])) return `"${m[1]}" is not a valid Indian state code.`
  if (/^0+$/.test(m[2])) return 'The RTO code in the vehicle number is not valid.'
  if (/^0+$/.test(m[4])) return 'Please enter a valid vehicle number, e.g. TN 09 AB 1234.'
  return ''
}

/* ---------- the other fields ---------- */

const oneOf = (value, list, message) => (list.includes(String(value ?? '')) ? '' : message)
const required = (value, message) => (String(value ?? '').trim() ? '' : message)

export const validateManufacturingYear = (value, thisYear = new Date().getFullYear()) => {
  const s = String(value ?? '').trim()
  if (!s) return 'Please select the manufacturing year.'
  const year = Number(s)
  if (!/^\d{4}$/.test(s) || year < VEHICLE_RULES.earliestYear) return `Manufacturing year must be ${VEHICLE_RULES.earliestYear} or later.`
  if (year > thisYear) return "Manufacturing year can't be in the future."
  return ''
}

// Digits with at most one '.' and 2 decimals, as typed into the amount box.
export const cleanAmountInput = (value) => {
  const s = String(value ?? '').replace(/[^\d.]/g, '')
  const [whole, ...rest] = s.split('.')
  const decimals = rest.join('').slice(0, 2)
  return rest.length ? `${whole}.${decimals}` : whole
}

const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`

export const validateVehicleAmount = (value) => {
  const s = String(value ?? '').trim()
  if (!s) return 'Please enter the vehicle amount.'
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return 'Please enter a valid amount (numbers only, up to 2 decimals).'
  const n = Number(s)
  if (!(n > 0)) return 'Vehicle amount must be more than zero.'
  if (n < VEHICLE_RULES.minAmount) return `Vehicle amount must be at least ${inr(VEHICLE_RULES.minAmount)}.`
  if (n > VEHICLE_RULES.maxAmount) return `Vehicle amount cannot be more than ${inr(VEHICLE_RULES.maxAmount)}.`
  return ''
}

// "125000.5" -> "1,25,000.50" for display when the box is not being edited.
export const formatAmount = (value) => {
  const s = String(value ?? '').trim()
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return s
  const n = Number(s)
  return n.toLocaleString('en-IN', { minimumFractionDigits: s.includes('.') ? 2 : 0, maximumFractionDigits: 2 })
}

/* ---------- the whole section ---------- */

// `vehicleTypes` = the catalog's vehicle types (when loaded).
export const validateVehicleInfo = (vehicle = {}, { vehicleTypes = null } = {}) => ({
  regNo: validateRegNo(vehicle.regNo),
  type: !String(vehicle.type ?? '').trim()
    ? 'Please select the vehicle type.'
    : vehicleTypes && !vehicleTypes.some((t) => t.toLowerCase() === String(vehicle.type).toLowerCase())
      ? 'Please select a vehicle type from the list.'
      : '',
  brand: required(vehicle.brand, 'Please select or enter the brand.'),
  model: required(vehicle.model, 'Please select or enter the model.'),
  variant: String(vehicle.variant ?? '').trim().length > 60 ? 'Variant must be at most 60 characters.' : '',
  colour: oneOf(vehicle.colour, COLOURS, 'Please select the colour.'),
  fuelType: oneOf(vehicle.fuelType, FUEL_TYPES, 'Please select the fuel type.'),
  year: validateManufacturingYear(vehicle.year),
  ownershipType: oneOf(vehicle.ownershipType, VEHICLE_OWNERSHIP_TYPES, 'Please select the ownership type.'),
  amount: validateVehicleAmount(vehicle.amount),
})

export const vehicleInfoHasErrors = (errors = {}) => Object.values(errors).some(Boolean)
