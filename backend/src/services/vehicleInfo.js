// src/services/vehicleInfo.js
//
// Vehicle Information rules on the server (New Loan -> Vehicle). Keep in step
// with frontend/src/utils/vehicleInfo.js (and the option lists in
// frontend/Options.js).

import { query } from "../db/connection.js";
import { currentTenantId } from "../db/tenantContext.js";

export const VEHICLE_RULES = {
  earliestYear: 1980,
  minAmount: 10000,
  maxAmount: 50000000,
  stateCodes: [
    "AN", "AP", "AR", "AS", "BR", "CG", "CH", "DD", "DL", "DN", "GA", "GJ", "HP", "HR", "JH", "JK",
    "KA", "KL", "LA", "LD", "MH", "ML", "MN", "MP", "MZ", "NL", "OD", "OR", "PB", "PY", "RJ", "SK",
    "TG", "TN", "TR", "TS", "UA", "UK", "UP", "WB",
  ],
  colours: ["Black", "White", "Grey", "Red", "Blue", "Silver", "Other"],
  fuelTypes: ["Petrol", "Diesel", "Electric", "CNG"],
  ownershipTypes: ["New", "Second-hand", "Third-hand"],
};

export const compactRegNo = (value) => String(value ?? "").toUpperCase().replace(/[\s.-]+/g, "");

const STANDARD = /^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{1,4})$/;
const BHARAT = /^(\d{2})(BH)(\d{4})([A-Z]{1,2})$/;

export const formatRegNo = (value) => {
  const compact = compactRegNo(value);
  let m = compact.match(BHARAT);
  if (m) return `${m[1]} ${m[2]} ${m[3]} ${m[4]}`;
  m = compact.match(STANDARD);
  if (m) return [m[1], m[2], m[3], m[4]].filter(Boolean).join(" ");
  return String(value ?? "").toUpperCase().trim();
};

export const regNoError = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "Please enter the vehicle number.";
  if (/[^A-Za-z0-9 .-]/.test(raw)) return "Vehicle number can only have letters, digits and spaces.";
  const compact = compactRegNo(raw);
  const bh = compact.match(BHARAT);
  if (bh) return /^0+$/.test(bh[3]) ? "Please enter a valid vehicle number, e.g. TN 09 AB 1234." : "";
  const m = compact.match(STANDARD);
  if (!m) return "Please enter a valid vehicle number, e.g. TN 09 AB 1234.";
  if (!VEHICLE_RULES.stateCodes.includes(m[1])) return `"${m[1]}" is not a valid Indian state code.`;
  if (/^0+$/.test(m[2])) return "The RTO code in the vehicle number is not valid.";
  if (/^0+$/.test(m[4])) return "Please enter a valid vehicle number, e.g. TN 09 AB 1234.";
  return "";
};

const indiaYear = () => Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric" }).format(new Date()));

export const yearError = (value, thisYear = indiaYear()) => {
  const s = String(value ?? "").trim();
  if (!s) return "Please select the manufacturing year.";
  const year = Number(s);
  if (!/^\d{4}$/.test(s) || year < VEHICLE_RULES.earliestYear) return `Manufacturing year must be ${VEHICLE_RULES.earliestYear} or later.`;
  if (year > thisYear) return "Manufacturing year can't be in the future.";
  return "";
};

const inr = (n) => `₹${Number(n).toLocaleString("en-IN")}`;

export const amountError = (value) => {
  const s = String(value ?? "").trim();
  if (!s) return "Please enter the vehicle amount.";
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return "Please enter a valid amount (numbers only, up to 2 decimals).";
  const n = Number(s);
  if (!(n > 0)) return "Vehicle amount must be more than zero.";
  if (n < VEHICLE_RULES.minAmount) return `Vehicle amount must be at least ${inr(VEHICLE_RULES.minAmount)}.`;
  if (n > VEHICLE_RULES.maxAmount) return `Vehicle amount cannot be more than ${inr(VEHICLE_RULES.maxAmount)}.`;
  return "";
};

const fail = (message, statusCode = 400) => {
  throw Object.assign(new Error(message), { statusCode });
};

const activeVehicleTypes = async (db) =>
  (await db.query("SELECT lower(name) AS name FROM vehicle_categories WHERE active")).rows.map((r) => r.name);

// Field checks for a vehicle (API shape: vehicleType, brand, model, variant,
// colour, fuelType, manufacturingYear, ownershipType, vehicleValue) and its
// registration number. `only` = the fields to check (all when omitted).
const FIELDS = ["registrationNumber", "vehicleType", "brand", "model", "variant", "colour", "fuelType", "manufacturingYear", "ownershipType", "vehicleValue"];

export const checkVehicleFields = async (vehicle = {}, rc = {}, { only = FIELDS, db = { query } } = {}) => {
  const want = new Set(only);
  const value = (key) => (key === "registrationNumber" ? rc.registrationNumber : vehicle[key]);
  const checks = {
    registrationNumber: () => regNoError(value("registrationNumber")),
    vehicleType: async () => {
      const type = String(value("vehicleType") ?? "").trim();
      if (!type) return "Please select the vehicle type.";
      return (await activeVehicleTypes(db)).includes(type.toLowerCase()) ? "" : "Please select a vehicle type from the list.";
    },
    brand: () => (String(value("brand") ?? "").trim() ? "" : "Please select or enter the brand."),
    model: () => (String(value("model") ?? "").trim() ? "" : "Please select or enter the model."),
    variant: () => (String(value("variant") ?? "").trim().length > 60 ? "Variant must be at most 60 characters." : ""),
    colour: () => (VEHICLE_RULES.colours.includes(String(value("colour") ?? "")) ? "" : "Please select the colour."),
    fuelType: () => (VEHICLE_RULES.fuelTypes.includes(String(value("fuelType") ?? "")) ? "" : "Please select the fuel type."),
    manufacturingYear: () => yearError(value("manufacturingYear")),
    ownershipType: () => (VEHICLE_RULES.ownershipTypes.includes(String(value("ownershipType") ?? "")) ? "" : "Please select the ownership type."),
    vehicleValue: () => amountError(value("vehicleValue")),
  };
  for (const field of FIELDS) {
    if (!want.has(field)) continue;
    const message = await checks[field]();
    if (message) fail(message);
  }
};

// A live vehicle (not sold, loan not ended) of this tenant with the same
// registration number, other than the given customer's own vehicles.
export const findLiveVehicleWithRegNo = async (regNo, { exceptCustomerId = null, exceptVehiclePk = null, db = { query } } = {}) => {
  const compact = compactRegNo(regNo);
  if (!compact) return null;
  const result = await db.query(
    `SELECT v.id AS vehicle_id, c.id AS customer_id, c.personal->>'name' AS customer_name
       FROM rc_details rc
       JOIN vehicles v ON v.pk = rc.vehicle_pk
       JOIN customers c ON c.pk = v.customer_pk
      WHERE c.tenant_id = $1
        AND UPPER(regexp_replace(rc.registration_number, '[\\s.-]', '', 'g')) = $2
        AND v.status <> 'SOLD'
        AND ($3::text IS NULL OR c.id <> $3)
        AND ($4::int IS NULL OR v.pk <> $4)
        AND (
          NOT EXISTS (SELECT 1 FROM loans l WHERE l.vehicle_pk = v.pk)
          OR EXISTS (
            SELECT 1 FROM loans l
             WHERE l.vehicle_pk = v.pk AND l.status NOT IN ('Closed', 'Foreclosed', 'Midway Closed')
          )
        )
      LIMIT 1`,
    [currentTenantId(), compact, exceptCustomerId, exceptVehiclePk]
  );
  return result.rows[0] || null;
};

export const duplicateRegNoMessage = (found) =>
  `Vehicle number is already registered to another customer${found?.customer_id ? ` (${found.customer_id})` : ""} with an active loan.`;

export const assertRegNoAvailable = async (regNo, options = {}) => {
  const found = await findLiveVehicleWithRegNo(regNo, options);
  if (found) fail(duplicateRegNoMessage(found), 409);
};
