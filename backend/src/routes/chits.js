// src/routes/chits.js
//
// Chit investments: companies with their schemes, and Chit Paid / Chit Income
// transactions (each books its expense or income in the same transaction).

import { Router } from "express";
import {
  addChitSchemes,
  createChitCompany,
  createChitTransaction,
  getChitCompanies,
  getChitTransactions,
} from "../services/chitRepository.js";
import { requirePermission } from "../middleware/requireAuth.js";
import { asyncHandler } from "../util/asyncHandler.js";

export const chitsRouter = Router();

const actor = (req) => req.user?.name || req.user?.username || "";

chitsRouter.get(
  "/companies",
  requirePermission("expense.view", "income.view"),
  asyncHandler(async (req, res) => {
    res.json(await getChitCompanies());
  })
);

chitsRouter.post(
  "/companies",
  requirePermission("expense.add", "income.add"),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createChitCompany(req.body || {}, actor(req)));
  })
);

chitsRouter.post(
  "/companies/:companyId/schemes",
  requirePermission("expense.add", "income.add"),
  asyncHandler(async (req, res) => {
    const companies = await addChitSchemes(req.params.companyId, req.body?.chits);
    if (!companies) return res.status(404).json({ error: "Chit company not found." });
    res.status(201).json(companies);
  })
);

chitsRouter.get(
  "/transactions",
  requirePermission("expense.view", "income.view"),
  asyncHandler(async (req, res) => {
    res.json(await getChitTransactions());
  })
);

chitsRouter.post(
  "/transactions",
  requirePermission("expense.add", "income.add"),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createChitTransaction(req.body || {}, actor(req)));
  })
);
