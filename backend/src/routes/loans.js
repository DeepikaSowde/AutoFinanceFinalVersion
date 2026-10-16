// src/routes/loans.js

import { Router } from "express";

import { getLoans } from "../services/customerRepository.js";
import { closeLoanMidway, getCollectionsForLoan } from "../services/collectionRepository.js";
import { requirePermission } from "../middleware/requireAuth.js";
import { asyncHandler } from "../util/asyncHandler.js";

export const loansRouter = Router();

loansRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await getLoans());
  })
);

loansRouter.get(
  "/:loanId",
  asyncHandler(async (req, res) => {
    const loan = (await getLoans()).find((item) => item.id === req.params.loanId);

    if (!loan) {
      return res.status(404).json({ error: "Loan not found." });
    }

    res.json(loan);
  })
);

loansRouter.get(
  "/:loanId/collections",
  asyncHandler(async (req, res) => {
    res.json(await getCollectionsForLoan(req.params.loanId));
  })
);

// Midway closure: settle the loan early. Body: interestInstalments (how many
// of the next unpaid instalments' interest to charge; the rest is waived),
// paymentDate, paymentMode, transactionId, remarks, clientRef.
loansRouter.post(
  "/:loanId/midway-closure",
  requirePermission("collections.add"),
  asyncHandler(async (req, res) => {
    const { collection, duplicate } = await closeLoanMidway(req.params.loanId, req.body || {}, req.user);
    res.status(duplicate ? 200 : 201).json(collection);
  })
);
