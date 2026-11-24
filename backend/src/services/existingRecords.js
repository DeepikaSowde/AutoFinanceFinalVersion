// src/services/existingRecords.js
//
// Finding customers and vehicles that already exist, so New Loan can say so
// instead of silently creating duplicates or attaching a loan to the wrong
// person. All lookups stay within the signed-in tenant.
//
//   customer identity  = same mobile number, or same Aadhaar number
//   vehicle identity   = same registration number (spaces/hyphens ignored)

import { query } from "../db/connection.js";
import { currentTenantId } from "../db/tenantContext.js";
import { compactRegNo } from "./vehicleInfo.js";

const ENDED = "('Closed', 'Foreclosed', 'Midway Closed')";

// Customers with this mobile or Aadhaar (digits only compared).
export const findCustomersByIdentity = async ({ mobile = "", aadhaar = "", exceptCustomerId = null } = {}) => {
  const mobileDigits = String(mobile || "").replace(/\D/g, "");
  const aadhaarDigits = String(aadhaar || "").replace(/\D/g, "");
  if (mobileDigits.length !== 10 && aadhaarDigits.length !== 12) return [];

  const result = await query(
    `SELECT c.id, c.personal->>'name' AS name,
            regexp_replace(COALESCE(c.personal->>'mobileNumber', ''), '\\D', '', 'g') AS mobile,
            regexp_replace(COALESCE(c.kyc->>'aadhaarNumber', ''), '\\D', '', 'g') AS aadhaar,
            (SELECT COUNT(*)::int FROM loans l WHERE l.customer_pk = c.pk AND l.status NOT IN ${ENDED}) AS active_loans
       FROM customers c
      WHERE c.tenant_id = $1
        AND ($4::text IS NULL OR c.id <> $4)
        AND (
          ($2 <> '' AND regexp_replace(COALESCE(c.personal->>'mobileNumber', ''), '\\D', '', 'g') = $2)
          OR ($3 <> '' AND regexp_replace(COALESCE(c.kyc->>'aadhaarNumber', ''), '\\D', '', 'g') = $3)
        )
      ORDER BY c.pk`,
    [currentTenantId(), mobileDigits.length === 10 ? mobileDigits : "", aadhaarDigits.length === 12 ? aadhaarDigits : "", exceptCustomerId]
  );

  return result.rows.map((row) => ({
    customerId: row.id,
    name: row.name || "",
    matchedBy: mobileDigits.length === 10 && row.mobile === mobileDigits ? "mobile" : "aadhaar",
    activeLoans: row.active_loans,
  }));
};

export const existingCustomerMessage = (found) =>
  `An existing customer, ${found.name || "unnamed"} (${found.customerId}), already has this ${
    found.matchedBy === "mobile" ? "mobile number" : "Aadhaar number"
  }. Start a Re-Loan for them, or confirm this is a different customer.`;

// Every vehicle of this tenant with this registration number, newest first,
// with its customer and whether it is still live (not sold, loan not ended).
export const findVehiclesByRegNo = async (regNo) => {
  const compact = compactRegNo(regNo);
  if (!compact) return [];
  const result = await query(
    `SELECT v.id AS vehicle_id, v.status, v.vehicle_type, v.subcategory, v.brand, v.model, v.variant, v.colour,
            v.manufacturing_year, v.fuel_type, v.vehicle_value, v.ownership_type,
            rc.registration_number, rc.chassis_number, rc.engine_number,
            c.id AS customer_id, c.personal->>'name' AS customer_name,
            (v.status <> 'SOLD' AND (
               NOT EXISTS (SELECT 1 FROM loans l WHERE l.vehicle_pk = v.pk)
               OR EXISTS (SELECT 1 FROM loans l WHERE l.vehicle_pk = v.pk AND l.status NOT IN ${ENDED})
            )) AS live
       FROM rc_details rc
       JOIN vehicles v ON v.pk = rc.vehicle_pk
       JOIN customers c ON c.pk = v.customer_pk
      WHERE c.tenant_id = $1
        AND UPPER(regexp_replace(rc.registration_number, '[\\s.-]', '', 'g')) = $2
      ORDER BY v.pk DESC`,
    [currentTenantId(), compact]
  );
  return result.rows.map((row) => ({
    vehicleId: row.vehicle_id,
    customerId: row.customer_id,
    customerName: row.customer_name || "",
    status: row.status,
    live: row.live,
    registrationNumber: row.registration_number,
    details: {
      type: row.vehicle_type || "",
      subcategory: row.subcategory || "",
      brand: row.brand || "",
      model: row.model || "",
      variant: row.variant || "",
      colour: row.colour || "",
      year: row.manufacturing_year || "",
      fuelType: row.fuel_type || "",
      amount: row.vehicle_value ? String(Number(row.vehicle_value)) : "",
      ownershipType: row.ownership_type || "",
      chassisNo: row.chassis_number || "",
      engineNo: row.engine_number || "",
    },
  }));
};
