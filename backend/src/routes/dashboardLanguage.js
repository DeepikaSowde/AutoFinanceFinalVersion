// src/routes/dashboardLanguage.js
//
// The Dashboard's English | தமிழ் switch. Anyone signed in can read the
// approved Tamil text and read or change their own language choice.

import { Router } from "express";

import {
  getDashboardLanguage,
  getTamilTranslations,
  saveDashboardLanguage,
} from "../services/translationRepository.js";
import { asyncHandler } from "../util/asyncHandler.js";

export const dashboardLanguageRouter = Router();

// { sheets: { sheet: { english: tamil } } }
dashboardLanguageRouter.get(
  "/translations",
  asyncHandler(async (req, res) => {
    res.json({ sheets: await getTamilTranslations() });
  })
);

// { language: "en" | "ta" }
dashboardLanguageRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json({ language: await getDashboardLanguage(req.user.userId) });
  })
);

dashboardLanguageRouter.put(
  "/",
  asyncHandler(async (req, res) => {
    res.json({ language: await saveDashboardLanguage(req.user.userId, req.body?.language) });
  })
);
