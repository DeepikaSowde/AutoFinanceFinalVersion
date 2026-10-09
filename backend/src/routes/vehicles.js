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
  releaseVehicle,
  seizeVehicle,
} from "../services/vehicleRepository.js";
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

vehiclesRouter.post(
  "/:vehicleId/cancel-sale",
  requirePermission("vehicles.edit"),
  action((req) =>
    cancelVehicleSale(req.params.vehicleId, req.body?.reason || "", req.user.username)
  )
);
