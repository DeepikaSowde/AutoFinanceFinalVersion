// src/services/mobile.js
//
// Indian mobile number: 10 digits, the first one 6-9 (so 0000000000,
// 1111111111, 5555555555 and 1234567890 are rejected). Keep in step with
// frontend/src/utils/mobile.js.

export const MOBILE_ERROR = "Please enter a valid 10-digit mobile number.";

const INDIAN_MOBILE = /^[6-9]\d{9}$/;

export const isValidMobile = (value) => INDIAN_MOBILE.test(String(value ?? "").trim());

// Throws a 400 the API returns as { error } when the number is not valid.
export const assertValidMobile = (value) => {
  if (!isValidMobile(value)) throw Object.assign(new Error(MOBILE_ERROR), { statusCode: 400 });
};
