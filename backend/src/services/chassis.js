// src/services/chassis.js
//
// Chassis Number (VIN) rules. Keep in step with frontend/src/utils/chassis.js.
//
// Vehicles made from 2000 on carry the standard 17-character VIN: letters A-Z
// and digits 0-9, never I, O or Q. Older vehicles (manufacturing year before
// 2000) were stamped before that standard, so their RC may show a shorter
// chassis number: 5 to 17 letters or digits. Anything else is rejected.

import { query } from "../db/connection.js";
import { currentTenantId } from "../db/tenantContext.js";

export const VIN_LENGTH = 17;
export const LEGACY_BEFORE_YEAR = 2000;
export const LEGACY_MIN_LENGTH = 5;

export const normalizeChassis = (value) => String(value ?? "").trim().toUpperCase();

export const isLegacyYear = (year) => {
  const n = Number(String(year ?? "").trim());
  return Number.isInteger(n) && n > 0 && n < LEGACY_BEFORE_YEAR;
};

const BAD_STANDARD = "Invalid Chassis Number. Letters I, O and Q and special characters are not allowed.";

// → { value, error }; error is "" when the number is acceptable.
export const validateChassis = (raw, year) => {
  const value = normalizeChassis(raw);

  if (!value) return { value, error: "Chassis Number is required." };

  if (isLegacyYear(year)) {
    if (/[^A-Z0-9]/.test(value)) {
      return { value, error: "Invalid Chassis Number. Special characters and spaces are not allowed." };
    }
    if (value.length < LEGACY_MIN_LENGTH) {
      return {
        value,
        error: `Chassis Number must contain ${LEGACY_MIN_LENGTH} to ${VIN_LENGTH} characters for vehicles manufactured before ${LEGACY_BEFORE_YEAR}.`,
      };
    }
    if (value.length > VIN_LENGTH) return { value, error: "Chassis Number cannot exceed 17 characters." };
    return { value, error: "" };
  }

  if (/[^A-Z0-9]/.test(value) || /[IOQ]/.test(value)) return { value, error: BAD_STANDARD };
  if (value.length < VIN_LENGTH) return { value, error: "Chassis Number must contain exactly 17 characters." };
  if (value.length > VIN_LENGTH) return { value, error: "Chassis Number cannot exceed 17 characters." };
  return { value, error: "" };
};

// The vehicle that already carries this chassis number, if it is still live:
// not sold, and not one whose every loan has ended. Looked up within the
// signed-in tenant only. `exceptVehiclePk` leaves out the vehicle being edited.
export const findLiveVehicleWithChassis = async (chassis, { exceptVehiclePk = null, db = { query } } = {}) => {
  const value = normalizeChassis(chassis);
  if (!value) return null;

  const result = await db.query(
    `SELECT v.id AS vehicle_id, rc.registration_number, c.id AS customer_id
       FROM rc_details rc
       JOIN vehicles v ON v.pk = rc.vehicle_pk
       JOIN customers c ON c.pk = v.customer_pk
      WHERE c.tenant_id = $1
        AND UPPER(BTRIM(rc.chassis_number)) = $2
        AND v.status <> 'SOLD'
        AND ($3::int IS NULL OR v.pk <> $3)
        AND (
          NOT EXISTS (SELECT 1 FROM loans l WHERE l.vehicle_pk = v.pk)
          OR EXISTS (
            SELECT 1 FROM loans l
             WHERE l.vehicle_pk = v.pk AND l.status NOT IN ('Closed', 'Foreclosed', 'Midway Closed')
          )
        )
      LIMIT 1`,
    [currentTenantId(), value, exceptVehiclePk]
  );

  return result.rows[0] || null;
};

export const duplicateChassisMessage = (found) =>
  `A vehicle with this Chassis Number is already registered${found?.registration_number ? ` (${found.registration_number})` : ""}.`;

// Throws a 400 the API returns as { error } when the chassis number is
// invalid or already in use by a live vehicle.
export const assertChassisAcceptable = async (raw, year, options = {}) => {
  const { value, error } = validateChassis(raw, year);
  if (error) throw Object.assign(new Error(error), { statusCode: 400 });

  const found = await findLiveVehicleWithChassis(value, options);
  if (found) throw Object.assign(new Error(duplicateChassisMessage(found)), { statusCode: 409 });

  return value;
};
