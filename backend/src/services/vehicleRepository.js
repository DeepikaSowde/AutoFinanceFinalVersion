// src/services/vehicleRepository.js
//
// Vehicle lifecycle: ACTIVE -> SEIZED -> (RELEASED | PENDING_SALE -> SOLD).
// The transition guards mirror the rules the frontend used to enforce,
// now applied server-side where they cannot be bypassed.

import { query, withTransaction } from "../db/connection.js";
import { buildCustomerRecord, buildLoan, mapVehicle } from "./customerRepository.js";

export const VEHICLE_STATUS = {
  ACTIVE: "ACTIVE",
  SEIZED: "SEIZED",
  PENDING_SALE: "PENDING_SALE",
  RELEASED: "RELEASED",
  SOLD: "SOLD",
};

const pad = (number, length = 4) => String(number).padStart(length, "0");

const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const nowIso = () => new Date().toISOString();

class TransitionError extends Error {
  constructor(message, statusCode = 409) {
    super(message);
    this.name = "TransitionError";
    this.statusCode = statusCode;
  }
}

const getVehicleRow = async (vehicleId) => {
  const result = await query("SELECT * FROM vehicles WHERE id = $1", [vehicleId]);

  return result.rows[0];
};

const getLoanRowForVehicle = async (vehiclePk) => {
  const result = await query(
    "SELECT * FROM loans WHERE vehicle_pk = $1 ORDER BY is_primary DESC, pk ASC LIMIT 1",
    [vehiclePk]
  );

  return result.rows[0];
};

/*
 * Vehicle view enriched with the customer/loan context the vehicle pages
 * display alongside it.
 */
const decorateVehicle = async (vehicleRow) => {
  const [customerResult, loanRow, rcResult] = await Promise.all([
    query("SELECT * FROM customers WHERE pk = $1", [vehicleRow.customer_pk]),
    getLoanRowForVehicle(vehicleRow.pk),
    query("SELECT * FROM rc_details WHERE vehicle_pk = $1", [vehicleRow.pk]),
  ]);

  const customerRow = customerResult.rows[0];
  const loan = loanRow ? await buildLoan(loanRow) : {};
  const personal = customerRow?.personal ?? {};

  return {
    ...mapVehicle(vehicleRow),
    registrationNumber: rcResult.rows[0]?.registration_number || "",
    customerId: customerRow?.id || "",
    customerNumber: customerRow?.customer_number || "",
    customerName: personal.name || "",
    mobileNumber: personal.mobileNumber || "",
    loan,
    loanId: loan?.id || "",
    loanNumber: loan?.loanNumber || "",
    outstandingAmount: loan?.outstandingAmount ?? 0,
  };
};

export const getVehicles = async () => {
  const result = await query("SELECT * FROM vehicles ORDER BY pk ASC");

  return Promise.all(result.rows.map(decorateVehicle));
};

export const getVehicleById = async (vehicleId) => {
  const row = await getVehicleRow(vehicleId);

  return row ? decorateVehicle(row) : null;
};

export const getVehiclesByStatus = async (status) => {
  const result = await query("SELECT * FROM vehicles WHERE status = $1 ORDER BY pk ASC", [status]);

  return Promise.all(result.rows.map(decorateVehicle));
};

export const getVehicleEvents = async (vehicleId) => {
  const row = await getVehicleRow(vehicleId);

  if (!row) {
    return [];
  }

  const result = await query(
    "SELECT * FROM vehicle_events WHERE vehicle_pk = $1 ORDER BY pk ASC",
    [row.pk]
  );

  return result.rows.map((event) => ({
    id: event.id,
    vehicleId,
    type: event.event_type,
    fromStatus: event.from_status,
    toStatus: event.to_status,
    performedBy: event.performed_by || "",
    createdAt: new Date(event.created_at).toISOString(),
    ...(event.details ?? {}),
  }));
};

const recordEvent = async (client, { vehiclePk, type, fromStatus, toStatus, details, performedBy }) => {
  const result = await client.query(
    `INSERT INTO vehicle_events
      (id, vehicle_pk, event_type, from_status, to_status, details, performed_by)
     VALUES ('', $1, $2, $3, $4, $5, $6)
     RETURNING pk`,
    [vehiclePk, type, fromStatus, toStatus, JSON.stringify(details || {}), performedBy || ""]
  );

  const pk = result.rows[0].pk;

  await client.query("UPDATE vehicle_events SET id = $1 WHERE pk = $2", [`VEV-${pad(pk, 5)}`, pk]);
};

const requireVehicle = async (vehicleId) => {
  const row = await getVehicleRow(vehicleId);

  if (!row) {
    throw new TransitionError("Vehicle not found.", 404);
  }

  return row;
};

/*
 * Shared transition machinery: check the current status is allowed to
 * move, write the new status plus its detail column, and append a history
 * event — all in one transaction.
 */
const transition = async ({
  vehicleId,
  allowedFrom,
  toStatus,
  eventType,
  details,
  performedBy,
  detailColumn,
  detailValue,
  onCommit,
  errorMessage,
}) => {
  const vehicleRow = await requireVehicle(vehicleId);

  if (!allowedFrom.includes(vehicleRow.status)) {
    throw new TransitionError(errorMessage);
  }

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE vehicles SET status = $2, ${detailColumn} = $3, updated_at = now() WHERE pk = $1`,
      [vehicleRow.pk, toStatus, JSON.stringify(detailValue)]
    );

    await recordEvent(client, {
      vehiclePk: vehicleRow.pk,
      type: eventType,
      fromStatus: vehicleRow.status,
      toStatus,
      details,
      performedBy,
    });

    if (onCommit) {
      await onCommit(client);
    }
  });

  return getVehicleById(vehicleId);
};

export const seizeVehicle = (vehicleId, details = {}, performedBy) => {
  const now = nowIso();

  return transition({
    vehicleId,
    allowedFrom: [VEHICLE_STATUS.ACTIVE],
    toStatus: VEHICLE_STATUS.SEIZED,
    eventType: "SEIZURE",
    details,
    performedBy,
    detailColumn: "seizure",
    detailValue: {
      ...details,
      seizureDate: details.seizureDate || now,
      seizedBy: performedBy || details.seizedBy || "",
      updatedAt: now,
    },
    errorMessage: "Only an active vehicle can be seized.",
  });
};

export const releaseVehicle = (vehicleId, details = {}, performedBy) => {
  const now = nowIso();

  return transition({
    vehicleId,
    allowedFrom: [VEHICLE_STATUS.SEIZED],
    toStatus: VEHICLE_STATUS.RELEASED,
    eventType: "RELEASE",
    details,
    performedBy,
    detailColumn: "release",
    detailValue: {
      ...details,
      releaseDate: details.releaseDate || now,
      releasedBy: performedBy || details.releasedBy || "",
      updatedAt: now,
    },
    errorMessage: "Only a seized vehicle can be released.",
  });
};

export const moveVehicleToPendingSale = (vehicleId, details = {}, performedBy) => {
  const now = nowIso();

  return transition({
    vehicleId,
    allowedFrom: [VEHICLE_STATUS.SEIZED],
    toStatus: VEHICLE_STATUS.PENDING_SALE,
    eventType: "PENDING_SALE",
    details,
    performedBy,
    detailColumn: "sale",
    detailValue: {
      ...details,
      saleStatus: "PENDING_SALE",
      initiatedAt: details.initiatedAt || now,
      updatedAt: now,
    },
    errorMessage: "Only a seized vehicle can be moved to pending sale.",
  });
};

export const cancelVehicleSale = async (vehicleId, reason = "", performedBy) => {
  const now = nowIso();
  const vehicleRow = await requireVehicle(vehicleId);

  return transition({
    vehicleId,
    allowedFrom: [VEHICLE_STATUS.PENDING_SALE],
    toStatus: VEHICLE_STATUS.SEIZED,
    eventType: "SALE_CANCELLED",
    details: { reason },
    performedBy,
    detailColumn: "sale",
    detailValue: {
      ...(vehicleRow.sale ?? {}),
      saleStatus: "CANCELLED",
      cancellationReason: reason,
      cancelledAt: now,
      updatedAt: now,
    },
    errorMessage: "Only a pending-sale vehicle can have its sale cancelled.",
  });
};

/*
 * Completing a sale also forecloses the linked loan. Recovery figures are
 * computed from the loan's real outstanding, not a client-supplied one.
 */
export const completeVehicleSale = async (vehicleId, details = {}, performedBy) => {
  const now = nowIso();
  const vehicleRow = await requireVehicle(vehicleId);
  const loanRow = await getLoanRowForVehicle(vehicleRow.pk);
  const loan = loanRow ? await buildLoan(loanRow) : null;

  const salePrice = roundMoney(details.salePrice || 0);
  const saleExpenses = roundMoney(details.saleExpenses || 0);
  const outstandingAmount = roundMoney(loan?.outstandingAmount ?? 0);
  const netSaleProceeds = roundMoney(Math.max(salePrice - saleExpenses, 0));
  const deficiency = roundMoney(Math.max(outstandingAmount - netSaleProceeds, 0));
  const surplus = roundMoney(Math.max(netSaleProceeds - outstandingAmount, 0));

  return transition({
    vehicleId,
    allowedFrom: [VEHICLE_STATUS.PENDING_SALE],
    toStatus: VEHICLE_STATUS.SOLD,
    eventType: "SALE",
    details: { ...details, salePrice, saleExpenses, netSaleProceeds, deficiency, surplus },
    performedBy,
    detailColumn: "sale",
    detailValue: {
      ...(vehicleRow.sale ?? {}),
      ...details,
      saleStatus: "SOLD",
      salePrice,
      saleExpenses,
      outstandingAmount,
      netSaleProceeds,
      deficiency,
      surplus,
      soldAt: details.soldAt || now,
      soldBy: performedBy || details.soldBy || "",
      updatedAt: now,
    },
    onCommit: async (client) => {
      if (!loanRow) {
        return;
      }

      await client.query(
        `UPDATE loans SET
          status = 'Foreclosed', foreclosure_status = 'Foreclosed',
          foreclosed_at = now(), foreclosure_reason = $2, updated_at = now()
         WHERE pk = $1`,
        [loanRow.pk, "Vehicle sold"]
      );
    },
    errorMessage: "Only a vehicle pending sale can be marked as sold.",
  });
};

export const getVehicleStatusCounts = async () => {
  const result = await query("SELECT status, COUNT(*)::int AS count FROM vehicles GROUP BY status");

  const counts = { total: 0, active: 0, seized: 0, pendingSale: 0, released: 0, sold: 0 };

  const keys = {
    ACTIVE: "active",
    SEIZED: "seized",
    PENDING_SALE: "pendingSale",
    RELEASED: "released",
    SOLD: "sold",
  };

  for (const row of result.rows) {
    counts.total += row.count;
    counts[keys[row.status]] = row.count;
  }

  return counts;
};

export const getCustomerForVehicle = async (vehicleId) => {
  const vehicleRow = await getVehicleRow(vehicleId);

  if (!vehicleRow) {
    return null;
  }

  const result = await query("SELECT * FROM customers WHERE pk = $1", [vehicleRow.customer_pk]);

  return result.rows[0] ? buildCustomerRecord(result.rows[0]) : null;
};

export { TransitionError };
