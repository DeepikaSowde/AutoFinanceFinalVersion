// src/routes/vehicles.js

import { Router } from "express";

import {
  cancelVehicleSale,
  completeVehicleSale,
  getVehicleById,
  getVehicleEvents,
  getVehicleStatusCounts,
  getVehicles,
  getVehiclesByStatus,
  moveVehicleToPendingSale,
  previewForeclosure,
  releaseVehicle,
  seizeVehicle,
  settleVehicleSale,
  updateSeizureDetails,
} from "../services/vehicleRepository.js";
import { assertChassisAcceptable } from "../services/chassis.js";
import { duplicateRegNoMessage, findLiveVehicleWithRegNo, regNoError } from "../services/vehicleInfo.js";
import { findVehiclesByRegNo } from "../services/existingRecords.js";
import { requirePermission } from "../middleware/requireAuth.js";
import { asyncHandler } from "../util/asyncHandler.js";

export const vehiclesRouter = Router();

vehiclesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { status } = req.query;

    res.json(
      status ? await getVehiclesByStatus(String(status).toUpperCase()) : await getVehicles()
    );
  })
);

// New Loan asks this when the vehicle number is entered / Next is clicked: is
// the number valid, and not already on another customer's live vehicle?
// ?regNo=...&customerId=... (a re-loan's own customer is not a duplicate).
// The same rules run again when the loan is saved.
// Also says whether the vehicle is already known:
//   existing.kind = "own"      the re-loan customer's own vehicle (its saved
//                              details are returned; the loan is added to it)
//                   "previous" financed before for someone else, now sold or
//                              its loans ended (allowed; a new record is made)
vehiclesRouter.get(
  "/registration-check",
  asyncHandler(async (req, res) => {
    const regNo = String(req.query.regNo || "");
    const customerId = req.query.customerId ? String(req.query.customerId) : null;
    const formatError = regNoError(regNo);
    if (formatError) return res.json({ ok: false, error: formatError, existing: null });

    const found = await findLiveVehicleWithRegNo(regNo, { exceptCustomerId: customerId });
    if (found) return res.json({ ok: false, error: duplicateRegNoMessage(found), existing: null });

    const vehicles = await findVehiclesByRegNo(regNo);
    const own = customerId ? vehicles.find((v) => v.customerId === customerId) : null;
    if (own) {
      return res.json({ ok: true, error: "", existing: { kind: "own", vehicleId: own.vehicleId, status: own.status, details: own.details } });
    }
    const previous = vehicles[0];
    res.json({
      ok: true,
      error: "",
      existing: previous
        ? { kind: "previous", vehicleId: previous.vehicleId, customerId: previous.customerId, customerName: previous.customerName, status: previous.status }
        : null,
    });
  })
);

// New Loan asks this when the user clicks Next, so a bad or already used
// chassis number is shown on the form instead of failing at submit. The same
// rules run again when the loan is saved.
vehiclesRouter.get(
  "/chassis-check",
  asyncHandler(async (req, res) => {
    try {
      await assertChassisAcceptable(req.query.chassis, req.query.year);
      res.json({ ok: true, error: "" });
    } catch (error) {
      if (!error.statusCode || error.statusCode >= 500) throw error;
      res.json({ ok: false, error: error.message });
    }
  })
);

vehiclesRouter.get(
  "/counts",
  asyncHandler(async (req, res) => {
    res.json(await getVehicleStatusCounts());
  })
);

vehiclesRouter.get(
  "/:vehicleId",
  asyncHandler(async (req, res) => {
    const vehicle = await getVehicleById(req.params.vehicleId);

    if (!vehicle) {
      return res.status(404).json({ error: "Vehicle not found." });
    }

    res.json(vehicle);
  })
);

vehiclesRouter.get(
  "/:vehicleId/events",
  asyncHandler(async (req, res) => {
    res.json(await getVehicleEvents(req.params.vehicleId));
  })
);

const action = (handler) =>
  asyncHandler(async (req, res) => {
    res.json(await handler(req));
  });

vehiclesRouter.post(
  "/:vehicleId/seize",
  requirePermission("vehicles.edit"),
  action((req) => seizeVehicle(req.params.vehicleId, req.body || {}, req.user.username))
);

vehiclesRouter.put(
  "/:vehicleId/seizure",
  requirePermission("vehicles.edit"),
  action((req) => updateSeizureDetails(req.params.vehicleId, req.body || {}, req.user.username))
);

vehiclesRouter.post(
  "/:vehicleId/release",
  requirePermission("vehicles.edit"),
  action((req) => releaseVehicle(req.params.vehicleId, req.body || {}, req.user.username))
);

vehiclesRouter.post(
  "/:vehicleId/pending-sale",
  requirePermission("vehicles.edit"),
  action((req) => moveVehicleToPendingSale(req.params.vehicleId, req.body || {}, req.user.username))
);

vehiclesRouter.post(
  "/:vehicleId/complete-sale",
  requirePermission("vehicles.edit"),
  action((req) => completeVehicleSale(req.params.vehicleId, req.body || {}, req.user.username))
);

// Query: salePrice, saleDate, vehicleExpenses (optional). Nothing is saved.
vehiclesRouter.get(
  "/:vehicleId/foreclosure-preview",
  action((req) => previewForeclosure(req.params.vehicleId, req.query || {}))
);

// Body: { decision: recovery | waiver | payout | retained | breakeven, amount, notes, paymentMode }.
vehiclesRouter.post(
  "/:vehicleId/settlement",
  requirePermission("vehicles.edit"),
  action((req) => settleVehicleSale(req.params.vehicleId, req.body || {}, req.user.username))
);

vehiclesRouter.post(
  "/:vehicleId/cancel-sale",
  requirePermission("vehicles.edit"),
  action((req) =>
    cancelVehicleSale(req.params.vehicleId, req.body?.reason || "", req.user.username)
  )
);
