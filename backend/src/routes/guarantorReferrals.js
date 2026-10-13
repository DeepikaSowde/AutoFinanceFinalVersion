// src/routes/guarantorReferrals.js
//
// The Guarantor / Referral register. Readable by anyone who can see
// customers or create loans (New Loan picks guarantors from it); adding to
// it needs customer or loan "add" access.

import { Router } from "express";

import {
  createGuarantorReferral,
  getGuarantorReferralById,
  getGuarantorReferrals,
} from "../services/guarantorReferralRepository.js";
import { requirePermission } from "../middleware/requireAuth.js";
import { asyncHandler } from "../util/asyncHandler.js";

export const guarantorReferralsRouter = Router();

const readers = requirePermission("customers.view", "loans.add");

guarantorReferralsRouter.get(
  "/",
  readers,
  asyncHandler(async (req, res) => {
    res.json(await getGuarantorReferrals());
  })
);

guarantorReferralsRouter.get(
  "/:id",
  readers,
  asyncHandler(async (req, res) => {
    const record = await getGuarantorReferralById(req.params.id);

    if (!record) {
      return res.status(404).json({ error: "Guarantor / referral not found." });
    }

    res.json(record);
  })
);

guarantorReferralsRouter.post(
  "/",
  requirePermission("customers.add", "loans.add"),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createGuarantorReferral(req.body || {}, req.user));
  })
);
