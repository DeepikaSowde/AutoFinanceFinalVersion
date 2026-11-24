// src/services/customerDetails.js
//
// Customer Details rules (New Loan -> Customer step). Keep in step with
// frontend/src/utils/customerDetails.js. Mobile number and Application Date
// have their own files (mobile.js, applicationDate.js).
//
//   name      required; letters of any script, spaces and . ' -; max 100
//   address   required; must contain a letter or digit; max 500
//   pincode   optional; 6 digits, not starting with 0
//   area, landmark  optional; max 150

const NAME_MAX = 100;
const ADDRESS_MAX = 500;
const LOCALITY_MAX = 150;

const NAME_CHARS = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export const cleanName = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
const cleanText = (value) => String(value ?? "").trim();

export const customerNameError = (value) => {
  const name = cleanName(value);
  if (!name) return "Please enter the customer name.";
  if (name.length > NAME_MAX) return `Customer name must be at most ${NAME_MAX} characters.`;
  if (!NAME_CHARS.test(name)) return "Customer name can only have letters, spaces, and . ' -";
  return "";
};

export const addressError = (value) => {
  const address = cleanText(value);
  if (!address) return "Please enter the address.";
  if (address.length > ADDRESS_MAX) return `Address must be at most ${ADDRESS_MAX} characters.`;
  if (CONTROL_CHARS.test(address)) return "Address has characters that are not allowed.";
  if (!HAS_LETTER_OR_DIGIT.test(address)) return "Please enter a valid address.";
  return "";
};

export const pincodeError = (value) => {
  const pincode = cleanText(value);
  if (!pincode) return "";
  return /^[1-9]\d{5}$/.test(pincode) ? "" : "Please enter a valid 6-digit pincode.";
};

const localityError = (value, label) => {
  const text = cleanText(value);
  if (text.length > LOCALITY_MAX) return `${label} must be at most ${LOCALITY_MAX} characters.`;
  if (CONTROL_CHARS.test(text)) return `${label} has characters that are not allowed.`;
  return "";
};

const CHECKS = {
  name: customerNameError,
  address: addressError,
  pincode: pincodeError,
  area: (value) => localityError(value, "Area / Locality"),
  landmark: (value) => localityError(value, "Landmark"),
};

const fail = (message) => {
  throw Object.assign(new Error(message), { statusCode: 400 });
};

// The personal details with names/addresses trimmed (name spaces collapsed).
const tidy = (personal) => {
  const out = { ...personal };
  if (out.name !== undefined) out.name = cleanName(out.name);
  for (const key of ["address", "area", "landmark", "pincode"]) {
    if (out[key] !== undefined) out[key] = cleanText(out[key]);
  }
  return out;
};

// A new customer: every rule applies. Returns the tidied personal details.
export const checkNewCustomerDetails = (personal = {}) => {
  const clean = tidy(personal);
  for (const [field, check] of Object.entries(CHECKS)) {
    const message = check(clean[field]);
    if (message) fail(message);
  }
  return clean;
};

// An edit: only fields that are sent and differ from what is saved are
// checked, so customers saved before these rules can still be edited.
export const checkChangedCustomerDetails = (personal, existing = {}) => {
  if (!personal) return personal;
  const clean = tidy(personal);
  for (const [field, check] of Object.entries(CHECKS)) {
    if (clean[field] === undefined) continue;
    if (clean[field] === cleanText(existing[field])) continue;
    const message = check(clean[field]);
    if (message) fail(message);
  }
  return clean;
};
