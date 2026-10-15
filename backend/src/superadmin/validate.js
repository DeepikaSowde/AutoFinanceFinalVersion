// src/superadmin/validate.js
//
// Small input checks for the super admin API. Each throws a 400 with a
// message the admin app can show next to the form.

// Each product offers its own set of features; a plan or tenant override can
// only use its product's.
export const PRODUCTS = ["auto_finance", "general_finance"];
export const PRODUCT_FEATURES = {
  auto_finance: ["web_app", "mobile_app", "whatsapp_reminders", "vahan_lookup"],
  general_finance: ["web_app", "mobile_app", "whatsapp_reminders", "field_collection"],
};
export const FEATURE_KEYS = [...new Set(Object.values(PRODUCT_FEATURES).flat())];
export const LIMITED_FEATURES = ["whatsapp_reminders", "vahan_lookup"];

export const productFeature = (product, key) => {
  if (!PRODUCT_FEATURES[product]?.includes(key)) {
    throw badRequest(`${key} is not a ${product === "general_finance" ? "General Finance" : "Auto Finance"} feature.`);
  }
  return key;
};
export const TENANT_STATUSES = ["active", "suspended", "expired"];
export const PAYMENT_METHODS = ["upi", "bank_transfer", "cheque", "cash", "razorpay"];

export const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });
export const notFound = (message) => Object.assign(new Error(message), { statusCode: 404 });
export const conflict = (message) => Object.assign(new Error(message), { statusCode: 409 });

export const text = (value, label, { required = false, max = 200 } = {}) => {
  const clean = value === undefined || value === null ? "" : String(value).trim();
  if (required && !clean) throw badRequest(`${label} is required.`);
  if (clean.length > max) throw badRequest(`${label} must be at most ${max} characters.`);
  return clean;
};

export const email = (value, label = "Email", { required = false } = {}) => {
  const clean = text(value, label, { required, max: 254 }).toLowerCase();
  if (clean && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw badRequest(`${label} is not a valid email address.`);
  return clean;
};

export const phone = (value, label = "Phone", { required = false } = {}) => {
  const clean = text(value, label, { required, max: 20 }).replace(/[\s-]/g, "");
  if (clean && !/^\+?\d{10,15}$/.test(clean)) throw badRequest(`${label} must be 10–15 digits.`);
  return clean;
};

export const date = (value, label, { required = false } = {}) => {
  const clean = text(value, label, { required, max: 10 });
  if (!clean) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean) || Number.isNaN(Date.parse(`${clean}T00:00:00Z`))) {
    throw badRequest(`${label} must be a date (YYYY-MM-DD).`);
  }
  return clean;
};

export const money = (value, label, { min = 0, allowZero = true } = {}) => {
  const number = Number(value);
  if (value === "" || value === null || value === undefined || !Number.isFinite(number)) throw badRequest(`${label} must be a number.`);
  if (number < min || (!allowZero && number === 0)) throw badRequest(`${label} must be greater than ${allowZero ? "or equal to " : ""}${min}.`);
  return Math.round(number * 100) / 100;
};

export const wholeNumber = (value, label, { min = 0, max = 10_000_000 } = {}) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw badRequest(`${label} must be a whole number from ${min} to ${max}.`);
  return number;
};

export const oneOf = (value, label, allowed) => {
  if (!allowed.includes(value)) throw badRequest(`${label} must be one of: ${allowed.join(", ")}.`);
  return value;
};

export const id = (value, label = "id") => wholeNumber(value, label, { min: 1, max: 2_147_483_647 });
