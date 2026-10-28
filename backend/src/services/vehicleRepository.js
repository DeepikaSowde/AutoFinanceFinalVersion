// src/services/vehicleRepository.js
//
// Vehicle lifecycle: ACTIVE -> SEIZED -> (RELEASED | PENDING_SALE -> SOLD),
// then the settlement with the customer once sold (foreclosureRepository).
// The transition guards mirror the rules the frontend used to enforce,
// now applied server-side where they cannot be bypassed.

import { query, withTransaction } from "../db/connection.js";
import { currentTenantId, runWithTenant } from "../db/tenantContext.js";
import { buildCustomerRecord, buildLoan, mapVehicle } from "./customerRepository.js";
import {
  applySettlement,
  computeForeclosure,
  initialSettlement,
  recordedVehicleExpenses,
} from "./foreclosureRepository.js";

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
  const result = await query("SELECT * FROM vehicles WHERE id = $1 AND tenant_id = $2", [vehicleId, currentTenantId()]);

  return result.rows[0];
};

// The loan a vehicle is held against. A re-loan on the same vehicle leaves
// the earlier loan closed, so the open (or foreclosed) one wins, newest first.
const LOAN_FOR_VEHICLE_SQL = `
  SELECT * FROM loans WHERE vehicle_pk = $1
   ORDER BY CASE WHEN status IN ('Closed', 'Midway Closed') THEN 1 ELSE 0 END, pk DESC
   LIMIT 1`;

const getLoanRowForVehicle = async (vehiclePk, db = { query }) => {
  const result = await db.query(LOAN_FOR_VEHICLE_SQL, [vehiclePk]);

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
  const result = await query("SELECT * FROM vehicles WHERE tenant_id = $1 ORDER BY pk ASC", [currentTenantId()]);

  return Promise.all(result.rows.map(decorateVehicle));
};

export const getVehicleById = async (vehicleId) => {
  const row = await getVehicleRow(vehicleId);

  return row ? decorateVehicle(row) : null;
};

export const getVehiclesByStatus = async (status) => {
  const result = await query("SELECT * FROM vehicles WHERE status = $1 AND tenant_id = $2 ORDER BY pk ASC", [status, currentTenantId()]);

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

const SELLABLE = [VEHICLE_STATUS.PENDING_SALE, VEHICLE_STATUS.SEIZED];

// The foreclosure cost and profit / loss of selling the vehicle on the
// figures given (salePrice, saleDate, vehicleExpenses), without saving
// anything — the Mark as Sold form shows it as the figures are typed.
export const previewForeclosure = async (vehicleId, details = {}) => {
  const vehicleRow = await requireVehicle(vehicleId);
  const loanRow = await getLoanRowForVehicle(vehicleRow.pk);
  const loan = loanRow ? await buildLoan(loanRow) : null;

  return computeForeclosure({ query }, {
    vehicleRow,
    loan,
    salePrice: details.salePrice,
    saleDate: details.saleDate,
    vehicleExpenses: details.vehicleExpenses,
  });
};

/*
 * Completing a sale also forecloses the linked loan. The foreclosure cost is
 * worked out here from the loan's real outstanding and the Foreclosure
 * settings, not taken from the client, and saved with the sale; the
 * settlement with the customer starts Pending (or Settled at break-even).
 *
 * saleExpenses is the vehicle's total expenses for the foreclosure cost.
 * Vehicle Expense rows already booked against it are in the expense list, so
 * the sale itself only books what is above them (additionalSaleExpenses), and
 * the cash it brings in is the price less that.
 */
export const completeVehicleSale = async (vehicleId, details = {}, performedBy) => {
  const now = nowIso();
  const vehicleRow = await requireVehicle(vehicleId);

  if (!SELLABLE.includes(vehicleRow.status)) {
    throw new TransitionError("Only a seized vehicle (or one pending sale) can be marked as sold.");
  }

  const loanRow = await getLoanRowForVehicle(vehicleRow.pk);
  const loan = loanRow ? await buildLoan(loanRow) : null;

  const salePrice = roundMoney(details.salePrice || 0);
  if (!(salePrice > 0)) {
    throw new TransitionError("A sale amount greater than zero is required.", 400);
  }
  const saleDate = String(details.soldAt || now).slice(0, 10);
  const recorded = await recordedVehicleExpenses({ query }, vehicleRow.id);
  const saleExpenses =
    details.saleExpenses === undefined || details.saleExpenses === null || details.saleExpenses === ""
      ? recorded
      : roundMoney(Math.max(0, Number(details.saleExpenses) || 0));
  const additionalSaleExpenses = roundMoney(Math.max(0, saleExpenses - recorded));
  const outstandingAmount = roundMoney(loan?.outstandingAmount ?? 0);
  const netSaleProceeds = roundMoney(Math.max(salePrice - additionalSaleExpenses, 0));

  const finalizedCalculation = await computeForeclosure({ query }, {
    vehicleRow,
    loan,
    salePrice,
    saleDate,
    vehicleExpenses: saleExpenses,
  });
  const deficiency = finalizedCalculation.shortfall;
  const surplus = Math.max(0, finalizedCalculation.profitLoss);

  return transition({
    vehicleId,
    // The Vehicles screen sells straight from Seized; Pending Sale is optional.
    allowedFrom: SELLABLE,
    toStatus: VEHICLE_STATUS.SOLD,
    eventType: "SALE",
    details: {
      ...details,
      salePrice,
      saleExpenses,
      netSaleProceeds,
      deficiency,
      surplus,
      totalForeclosureCost: finalizedCalculation.totalForeclosureCost,
      profitLoss: finalizedCalculation.profitLoss,
      isProfit: finalizedCalculation.isProfit,
    },
    performedBy,
    detailColumn: "sale",
    detailValue: {
      ...(vehicleRow.sale ?? {}),
      ...details,
      saleStatus: "SOLD",
      salePrice,
      saleExpenses,
      recordedVehicleExpenses: recorded,
      additionalSaleExpenses,
      outstandingAmount,
      netSaleProceeds,
      deficiency,
      surplus,
      finalizedCalculation,
      settlement: initialSettlement(finalizedCalculation, now),
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
    errorMessage: "Only a seized vehicle (or one pending sale) can be marked as sold.",
  });
};

/*
 * Records the settlement with the customer after a sale (collect or waive a
 * shortfall, pay out or retain a profit), books the money that moves, and
 * keeps the decision in the vehicle's history. The vehicle row is locked so
 * two decisions cannot race.
 */
export const settleVehicleSale = async (vehicleId, body = {}, performedBy) => {
  await requireVehicle(vehicleId);

  await withTransaction(async (client) => {
    const locked = await client.query("SELECT * FROM vehicles WHERE id = $1 AND tenant_id = $2 FOR UPDATE", [
      vehicleId,
      currentTenantId(),
    ]);
    const vehicleRow = locked.rows[0];

    if (vehicleRow.status !== VEHICLE_STATUS.SOLD) {
      throw new TransitionError("Only a sold vehicle has a settlement to record.");
    }

    const [loanResult, customerResult, rcResult] = await Promise.all([
      client.query(LOAN_FOR_VEHICLE_SQL, [vehicleRow.pk]),
      client.query("SELECT personal FROM customers WHERE pk = $1", [vehicleRow.customer_pk]),
      client.query("SELECT registration_number FROM rc_details WHERE vehicle_pk = $1", [vehicleRow.pk]),
    ]);

    const { sale, event } = await applySettlement(client, {
      vehicleRow,
      loanId: loanResult.rows[0]?.id || "",
      regNo: rcResult.rows[0]?.registration_number || "",
      customerName: customerResult.rows[0]?.personal?.name || "",
      body,
      performedBy,
    });

    await client.query("UPDATE vehicles SET sale = $2, updated_at = now() WHERE pk = $1", [
      vehicleRow.pk,
      JSON.stringify(sale),
    ]);

    await recordEvent(client, {
      vehiclePk: vehicleRow.pk,
      type: "SETTLEMENT",
      fromStatus: VEHICLE_STATUS.SOLD,
      toStatus: VEHICLE_STATUS.SOLD,
      details: event,
      performedBy,
    });
  });

  return getVehicleById(vehicleId);
};

/*
 * Corrects the seizure details (date, reason, where it is kept, ...) while
 * the vehicle is still held. The status does not change; the edit is kept
 * in the vehicle's history.
 */
export const updateSeizureDetails = async (vehicleId, details = {}, performedBy) => {
  const vehicleRow = await requireVehicle(vehicleId);

  if (![VEHICLE_STATUS.SEIZED, VEHICLE_STATUS.PENDING_SALE].includes(vehicleRow.status)) {
    throw new TransitionError("Seizure details can only be changed while the vehicle is seized.");
  }

  const seizure = { ...(vehicleRow.seizure ?? {}), ...details, updatedAt: nowIso() };

  await withTransaction(async (client) => {
    await client.query("UPDATE vehicles SET seizure = $2, updated_at = now() WHERE pk = $1", [
      vehicleRow.pk,
      JSON.stringify(seizure),
    ]);

    await recordEvent(client, {
      vehiclePk: vehicleRow.pk,
      type: "SEIZURE_UPDATED",
      fromStatus: vehicleRow.status,
      toStatus: vehicleRow.status,
      details,
      performedBy,
    });
  });

  return getVehicleById(vehicleId);
};

export const getVehicleStatusCounts = async () => {
  const result = await query("SELECT status, COUNT(*)::int AS count FROM vehicles WHERE tenant_id = $1 GROUP BY status", [currentTenantId()]);

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

/*
 * Vehicles sold before the foreclosure breakdown was saved with a sale have
 * nothing to settle against. This rebuilds it once from the sale's own
 * figures (price, date, the expenses entered then) and the loan it
 * foreclosed, on the current Foreclosure and Penalty settings, with
 * penalties as they stood on the sale date. The settlement starts Pending.
 * The cash the sale already put in the Ledger (net proceeds, expenses) is
 * left exactly as it was. Runs on every start; a vehicle that has its
 * breakdown is never touched again.
 */
const rebuildForeclosure = (vehiclePk) =>
  withTransaction(async (client) => {
    const locked = await client.query("SELECT * FROM vehicles WHERE pk = $1 FOR UPDATE", [vehiclePk]);
    const vehicleRow = locked.rows[0];
    const sale = vehicleRow?.sale;
    if (vehicleRow?.status !== VEHICLE_STATUS.SOLD || !sale || sale.finalizedCalculation) return false;

    const loanRow = await getLoanRowForVehicle(vehicleRow.pk, client);
    const loan = loanRow ? await buildLoan(loanRow) : null;
    const saleExpenses = roundMoney(Math.max(0, Number(sale.saleExpenses) || 0));
    const now = nowIso();

    const finalizedCalculation = await computeForeclosure(client, {
      vehicleRow,
      loan,
      salePrice: Number(sale.salePrice) || 0,
      saleDate: String(sale.soldAt || sale.saleDate || vehicleRow.updated_at.toISOString()).slice(0, 10),
      vehicleExpenses: saleExpenses,
      beforeForeclosure: true,
    });

    const next = {
      ...sale,
      // Booked as one sale cost back then; no expense rows were linked to the vehicle.
      recordedVehicleExpenses: sale.recordedVehicleExpenses ?? 0,
      additionalSaleExpenses: sale.additionalSaleExpenses ?? saleExpenses,
      finalizedCalculation,
      settlement: sale.settlement ?? initialSettlement(finalizedCalculation, now),
      foreclosureRebuiltAt: now,
      updatedAt: now,
    };

    await client.query("UPDATE vehicles SET sale = $2, updated_at = now() WHERE pk = $1", [
      vehicleRow.pk,
      JSON.stringify(next),
    ]);
    return true;
  });

export const rebuildMissingForeclosures = async ({ log = console.log } = {}) => {
  const pending = await query(
    `SELECT pk, tenant_id FROM vehicles
      WHERE status = 'SOLD' AND sale IS NOT NULL AND NOT (sale ? 'finalizedCalculation')
      ORDER BY pk`
  );
  let rebuilt = 0;

  for (const { pk, tenant_id: tenantId } of pending.rows) {
    if (!tenantId) continue;

    // One vehicle failing is logged and skipped; it is tried again next start.
    const done = await runWithTenant(tenantId, () => rebuildForeclosure(pk)).catch((error) => {
      log(`Could not rebuild the foreclosure breakdown for vehicle #${pk}: ${error.message}`);
      return false;
    });

    if (done) rebuilt += 1;
  }

  if (rebuilt) log(`Rebuilt the foreclosure breakdown for ${rebuilt} vehicle(s) sold earlier`);
  return rebuilt;
};

export { TransitionError };
