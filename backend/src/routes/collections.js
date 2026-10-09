// src/routes/collections.js

import { Router } from "express";

import {
  approveCollection,
  createCollection,
  getCollectionById,
  getCollections,
  rejectCollection,
  reverseCollection,
} from "../services/collectionRepository.js";
import { requirePermission } from "../middleware/requireAuth.js";
import { asyncHandler } from "../util/asyncHandler.js";

export const collectionsRouter = Router();

collectionsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { status } = req.query;
    const collections = await getCollections();

    res.json(status ? collections.filter((item) => item.status === status) : collections);
  })
);

collectionsRouter.get(
  "/:collectionId",
  asyncHandler(async (req, res) => {
    const collection = await getCollectionById(req.params.collectionId);

    if (!collection) {
      return res.status(404).json({ error: "Collection not found." });
    }

    res.json(collection);
  })
);

// Recording a payment posts it to the loan immediately (no approval step).
// approve / reject only apply to collections left Pending from before that;
// reverse (collections.approve) undoes a posted payment.
collectionsRouter.post(
  "/",
  requirePermission("collections.add"),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createCollection(req.body || {}, req.user));
  })
);

collectionsRouter.post(
  "/:collectionId/approve",
  requirePermission("collections.approve"),
  asyncHandler(async (req, res) => {
    res.json(await approveCollection(req.params.collectionId, req.user));
  })
);

collectionsRouter.post(
  "/:collectionId/reject",
  requirePermission("collections.approve"),
  asyncHandler(async (req, res) => {
    res.json(
      await rejectCollection(req.params.collectionId, {
        remarks: req.body?.remarks || "",
        rejectedBy: req.user,
      })
    );
  })
);

collectionsRouter.post(
  "/:collectionId/reverse",
  requirePermission("collections.approve"),
  asyncHandler(async (req, res) => {
    res.json(
      await reverseCollection(req.params.collectionId, {
        reason: req.body?.reason || "",
        reversedBy: req.user,
      })
    );
  })
);
