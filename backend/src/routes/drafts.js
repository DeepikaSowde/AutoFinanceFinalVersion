// src/routes/drafts.js
//
// Saved New Loan applications. Anyone who may create a loan may save,
// resume and discard drafts.

import { Router } from "express";

import {
  createDraft,
  deleteDraft,
  getDraftById,
  getDrafts,
  updateDraft,
} from "../services/draftRepository.js";
import { requirePermission } from "../middleware/requireAuth.js";
import { asyncHandler } from "../util/asyncHandler.js";

export const draftsRouter = Router();

draftsRouter.use(requirePermission("loans.add"));

draftsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await getDrafts());
  })
);

draftsRouter.get(
  "/:draftId",
  asyncHandler(async (req, res) => {
    const draft = await getDraftById(req.params.draftId);

    if (!draft) {
      return res.status(404).json({ error: "Draft not found." });
    }

    res.json(draft);
  })
);

draftsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    res.status(201).json(await createDraft(req.body?.form, req.user));
  })
);

draftsRouter.put(
  "/:draftId",
  asyncHandler(async (req, res) => {
    const draft = await updateDraft(req.params.draftId, req.body?.form, req.user);

    if (!draft) {
      return res.status(404).json({ error: "Draft not found." });
    }

    res.json(draft);
  })
);

draftsRouter.delete(
  "/:draftId",
  asyncHandler(async (req, res) => {
    if (!(await deleteDraft(req.params.draftId))) {
      return res.status(404).json({ error: "Draft not found." });
    }

    res.status(204).send();
  })
);
