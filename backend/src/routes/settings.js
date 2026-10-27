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
