// src/routes/penalties.js
//
// Late-payment penalties on the company-wide Penalty & Grace rules: read the
// rules and every due / acted-on penalty, change the rules (admin), and
// freeze, unfreeze, cancel or collect a loan's instalment penalties.

import { Router } from "express";
import {
  cancelPenalties,
  collectPenalties,
  freezePenalties,
  getPenalties,
  getPenaltySettings,
  savePenaltySettings,
  unfreezePenalties,
} from "../services/penaltyRepository.js";
import { requirePermission, requireRole } from "../middleware/requireAuth.js";
import { asyncHandler } from "../util/asyncHandler.js";

export const penaltiesRouter = Router();

const actor = (req) => req.user?.name || req.user?.username || "";

// Penalties show on loan, customer and collection screens.
const canView = requirePermission("collections.view", "loans.view", "customers.view", "dashboard.view");

penaltiesRouter.get(
  "/",
  canView,
  asyncHandler(async (req, res) => {
    res.json(await getPenalties({ loanId: req.query.loanId ? String(req.query.loanId) : null }));
  })
);

penaltiesRouter.get(
  "/settings",
  canView,
  asyncHandler(async (req, res) => {
    res.json(await getPenaltySettings());
  })
);

penaltiesRouter.put(
  "/settings",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    res.json(await savePenaltySettings(req.body || {}, actor(req)));
  })
);

// Body: { installmentNumbers: [..] } (+ reason for cancel).
const action = (fn) =>
  asyncHandler(async (req, res) => {
    res.json(await fn(req.params.loanId, req.body || {}, actor(req)));
  });

penaltiesRouter.post("/loans/:loanId/freeze", requirePermission("collections.add"), action(freezePenalties));
penaltiesRouter.post("/loans/:loanId/unfreeze", requirePermission("collections.add"), action(unfreezePenalties));
penaltiesRouter.post("/loans/:loanId/cancel", requirePermission("collections.approve"), action(cancelPenalties));

// Body: { installmentNumbers, amount, collectionDate, paymentMode, transactionRef, clientRef }.
penaltiesRouter.post(
  "/loans/:loanId/collect",
  requirePermission("collections.add"),
  asyncHandler(async (req, res) => {
    const result = await collectPenalties(req.params.loanId, req.body || {}, actor(req));
    res.status(result.duplicate ? 200 : 201).json(result);
  })
);
