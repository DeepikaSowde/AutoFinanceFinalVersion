// src/routes/loans.js

import { Router } from "express";

import { getLoans } from "../services/customerRepository.js";
import { getCollectionsForLoan } from "../services/collectionRepository.js";
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
