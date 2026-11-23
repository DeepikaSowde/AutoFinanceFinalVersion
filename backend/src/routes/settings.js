// src/routes/settings.js
//
// Company-wide settings pages under Settings (one value per lender). Anyone
// signed in can read them — the screens that apply them need them — and only
// an admin can change them.

import { Router } from "express";
import { getForeclosureSettings, saveForeclosureSettings } from "../services/foreclosureRepository.js";
import {
  getPaymentAllocationSettings,
  savePaymentAllocationSettings,
} from "../services/paymentAllocationSettings.js";
import { getReLoanPolicy, saveReLoanPolicy } from "../services/reloanPolicy.js";
import {
  addOwnModel,
  deleteOwnModel,
  getVehicleCatalog,
  setCatalogEntryHidden,
  updateOwnModel,
} from "../services/vehicleCatalogRepository.js";
import { requireRole } from "../middleware/requireAuth.js";
import { asyncHandler } from "../util/asyncHandler.js";

export const settingsRouter = Router();

const actor = (req) => req.user?.name || req.user?.username || "";

// Settings -> Foreclosure & Vehicle Sale.
settingsRouter.get(
  "/foreclosure",
  asyncHandler(async (req, res) => {
    res.json(await getForeclosureSettings());
  })
);

settingsRouter.put(
  "/foreclosure",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    res.json(await saveForeclosureSettings(req.body || {}, actor(req)));
  })
);

// Settings -> Re-Loan: { policy: "zero_outstanding" | "allow_with_outstanding" }.
settingsRouter.get(
  "/reloan",
  asyncHandler(async (req, res) => {
    res.json(await getReLoanPolicy());
  })
);

settingsRouter.put(
  "/reloan",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    res.json(await saveReLoanPolicy(req.body || {}, actor(req)));
  })
);

// Vehicle catalog (Category -> Subcategory -> Brand -> Model) for New Loan:
// the master list minus what this lender hid, plus its own brands/models.
// ?all=1 (admin only) returns every entry with a `hidden` flag instead.
settingsRouter.get(
  "/vehicle-catalog",
  asyncHandler(async (req, res) => {
    const includeHidden = req.query.all === "1";
    if (includeHidden && req.user?.role !== "admin") {
      return res.status(403).json({ error: "Only an admin can view hidden catalog entries." });
    }
    res.json(await getVehicleCatalog({ includeHidden }));
  })
);

// Settings -> Vehicle Catalog (admin): what this lender's staff see. Each
// returns the catalog with hidden flags (as ?all=1).
// { kind: "category" | "subcategory" | "make" | "model", id, hidden }
settingsRouter.put(
  "/vehicle-catalog/hidden",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    res.json(await setCatalogEntryHidden(req.body || {}, actor(req)));
  })
);

// The lender's own models: { categoryId, subcategoryId?, makeId? | brandName?, name, isEv? }
settingsRouter.post(
  "/vehicle-catalog/models",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    res.status(201).json(await addOwnModel(req.body || {}, actor(req)));
  })
);

settingsRouter.patch(
  "/vehicle-catalog/models/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    res.json(await updateOwnModel(req.params.id, req.body || {}));
  })
);

settingsRouter.delete(
  "/vehicle-catalog/models/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    res.json(await deleteOwnModel(req.params.id));
  })
);

// Settings -> Payment Allocation: { allocationOrder: ["Interest", "Principal"] | ["Principal", "Interest"] }.
settingsRouter.get(
  "/payment-allocation",
  asyncHandler(async (req, res) => {
    res.json(await getPaymentAllocationSettings());
  })
);

settingsRouter.put(
  "/payment-allocation",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    res.json(await savePaymentAllocationSettings(req.body || {}, actor(req)));
  })
);
