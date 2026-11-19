// Indian mobile number: 10 digits, the first one 6-9 (so 0000000000,
// 1111111111, 5555555555 and 1234567890 are rejected). Keep in step with
// backend/src/services/mobile.js.

export const MOBILE_ERROR = 'Please enter a valid 10-digit mobile number.'

const INDIAN_MOBILE = /^[6-9]\d{9}$/

// → '' when valid, otherwise the message to show.
export const validateMobile = (value) => (INDIAN_MOBILE.test(String(value ?? '').trim()) ? '' : MOBILE_ERROR)
