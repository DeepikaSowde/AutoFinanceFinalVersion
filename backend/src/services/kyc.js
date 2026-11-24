// src/services/kyc.js
//
// KYC rules on the server. Keep in step with frontend/src/utils/kyc.js.
//   Aadhaar         optional; 12 digits, not starting 0/1, Verhoeff check digit
//   Driving Licence optional; state code + RTO + year + serial (DL_RULES)
//   KYC files       PDF / JPG / JPEG / PNG, 1 byte .. 2 MB; content checked
//                   when it is sent (first bytes must match the type)
// Error messages never contain the Aadhaar number itself.

const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
const verhoeffValid = (digits) => {
  let c = 0;
  const reversed = digits.split("").reverse();
  for (let i = 0; i < reversed.length; i++) c = VERHOEFF_D[c][VERHOEFF_P[i % 8][Number(reversed[i])]];
  return c === 0;
};

export const normalizeAadhaar = (value) => String(value ?? "").replace(/\s+/g, "");

export const aadhaarError = (value) => {
  const digits = normalizeAadhaar(value);
  if (!digits) return "";
  return /^[2-9]\d{11}$/.test(digits) && verhoeffValid(digits) ? "" : "Please enter a valid 12-digit Aadhaar number.";
};

export const DL_RULES = {
  stateCodes: [
    "AN", "AP", "AR", "AS", "BR", "CG", "CH", "DD", "DL", "DN", "GA", "GJ", "HP", "HR", "JH", "JK",
    "KA", "KL", "LA", "LD", "MH", "ML", "MN", "MP", "MZ", "NL", "OD", "OR", "PB", "PY", "RJ", "SK",
    "TG", "TN", "TR", "TS", "UA", "UK", "UP", "WB",
  ],
  rtoDigits: 2,
  serialDigits: 7,
  earliestYear: 1950,
};

const indiaYear = () => Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric" }).format(new Date()));

export const normalizeDrivingLicence = (value) => String(value ?? "").toUpperCase().replace(/[\s-]+/g, "");

export const drivingLicenceError = (value, rules = DL_RULES, thisYear = indiaYear()) => {
  const dl = normalizeDrivingLicence(value);
  if (!dl) return "";
  const match = dl.match(new RegExp(`^([A-Z]{2})(\\d{${rules.rtoDigits}})(\\d{4})(\\d{${rules.serialDigits}})$`));
  if (!match) return "Please enter a valid Driving Licence number, e.g. TN2220180009876.";
  const [, state, rto, year, serial] = match;
  if (!rules.stateCodes.includes(state)) return `"${state}" is not a valid Indian state code for a Driving Licence.`;
  if (/^0+$/.test(rto)) return "The RTO code in the Driving Licence number is not valid.";
  if (Number(year) < rules.earliestYear || Number(year) > thisYear) return "The year of issue in the Driving Licence number is not valid.";
  if (/^0+$/.test(serial)) return "The serial number in the Driving Licence number is not valid.";
  return "";
};

/* ---------- files ---------- */

export const KYC_FILE_POLICY = {
  maxBytes: 2 * 1024 * 1024,
  types: { pdf: ["application/pdf"], jpg: ["image/jpeg"], jpeg: ["image/jpeg"], png: ["image/png"] },
};

const extensionOf = (name) => (String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || "";

const SIGNATURES = {
  pdf: [0x25, 0x50, 0x44, 0x46, 0x2d],
  jpeg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};

// "data:...;base64,xxxx" or plain base64 -> bytes (null if not base64).
const bytesOf = (data) => {
  const base64 = String(data).replace(/^data:[^,]*,/, "");
  if (!/^[A-Za-z0-9+/=\s]*$/.test(base64)) return null;
  return Buffer.from(base64, "base64");
};

// One uploaded file's details: { fileName, fileType, fileSize, fileData? }.
export const kycFileError = (upload = {}) => {
  const ext = extensionOf(upload.fileName);
  const allowed = KYC_FILE_POLICY.types[ext];
  if (!allowed) return "This file type is not allowed. Use PDF, JPG, JPEG or PNG.";
  if (upload.fileType && !allowed.includes(String(upload.fileType).toLowerCase())) return "The file type does not match its extension.";
  const size = Number(upload.fileSize);
  if (!size) return "The file is empty (0 bytes).";
  if (size > KYC_FILE_POLICY.maxBytes) return "The file is larger than 2 MB.";
  if (upload.fileData) {
    const bytes = bytesOf(upload.fileData);
    const signature = SIGNATURES[ext === "jpg" ? "jpeg" : ext];
    if (!bytes || !bytes.length) return "The file is empty (0 bytes).";
    if (bytes.length > KYC_FILE_POLICY.maxBytes) return "The file is larger than 2 MB.";
    if (!signature.every((byte, i) => bytes[i] === byte)) return "The file's content does not match its type.";
  }
  return "";
};

const fail = (message) => {
  throw Object.assign(new Error(message), { statusCode: 400 });
};

// The customer's KYC numbers, normalised (Aadhaar without spaces, licence
// upper case without spaces/hyphens). Only fields that are present are touched.
const tidyKyc = (kyc) => {
  const out = { ...kyc };
  if (out.aadhaarNumber !== undefined) out.aadhaarNumber = normalizeAadhaar(out.aadhaarNumber);
  if (out.drivingLicenceNumber !== undefined) out.drivingLicenceNumber = normalizeDrivingLicence(out.drivingLicenceNumber);
  return out;
};

const UPLOAD_LABELS = { aadhaar: "Aadhaar", drivingLicence: "Driving Licence", pan: "PAN", voterId: "Voter ID" };

const uploadKey = (upload) => `${upload.type || ""}|${upload.fileName || ""}|${Number(upload.fileSize) || 0}`;

// `known` = files already saved on the record (not re-checked on an edit).
const checkUploads = (uploads, known = new Set()) => {
  for (const upload of Array.isArray(uploads) ? uploads : []) {
    if (!upload || !upload.fileName) continue;
    if (known.has(uploadKey(upload))) continue;
    const error = kycFileError(upload);
    if (error) fail(`${upload.title || UPLOAD_LABELS[upload.type] || "Document"}: ${error}`);
  }
};

// New customer: numbers that are filled in must be valid; every file checked.
export const checkNewCustomerKyc = (customer = {}) => {
  const kyc = tidyKyc(customer.kyc || {});
  const message = aadhaarError(kyc.aadhaarNumber) || drivingLicenceError(kyc.drivingLicenceNumber);
  if (message) fail(message);
  checkUploads(customer.documents?.uploads);
  return { ...customer, kyc };
};

// Edit: only numbers that change are checked (older records stay editable);
// files sent are checked.
export const checkChangedCustomerKyc = (customer, existing = {}) => {
  if (!customer) return customer;
  const out = { ...customer };
  if (customer.kyc) {
    const kyc = tidyKyc(customer.kyc);
    const before = existing.kyc || {};
    if (kyc.aadhaarNumber !== undefined && kyc.aadhaarNumber !== normalizeAadhaar(before.aadhaarNumber)) {
      const message = aadhaarError(kyc.aadhaarNumber);
      if (message) fail(message);
    }
    if (kyc.drivingLicenceNumber !== undefined && kyc.drivingLicenceNumber !== normalizeDrivingLicence(before.drivingLicenceNumber)) {
      const message = drivingLicenceError(kyc.drivingLicenceNumber);
      if (message) fail(message);
    }
    out.kyc = kyc;
  }
  checkUploads(customer.documents?.uploads, knownUploads(existing));
  return out;
};

const knownUploads = (existing = {}) =>
  new Set((Array.isArray(existing.documents?.uploads) ? existing.documents.uploads : []).map(uploadKey));

// Run on the raw request before file contents are stripped, so a file that
// is sent with its content gets the content check too. `existing` = the saved
// customer on an edit.
export const assertKycUploadContent = (body = {}, existing = {}) => {
  checkUploads(body.customer?.documents?.uploads, knownUploads(existing));
};
