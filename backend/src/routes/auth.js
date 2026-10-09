// src/routes/auth.js

import { Router } from "express";

import {
  createUser,
  deleteUser,
  getUsers,
  login,
  logout,
  updateUser,
} from "../services/auth.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import { asyncHandler } from "../util/asyncHandler.js";

export const authRouter = Router();

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};

    const session = await login(username, password);

    if (!session) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    res.json(session);
  })
);

authRouter.post(
  "/logout",
  requireAuth,
  asyncHandler(async (req, res) => {
    const header = req.get("authorization") || "";

    await logout(header.startsWith("Bearer ") ? header.slice(7).trim() : "");

    res.status(204).send();
  })
);

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

/* =========================================================
   USER MANAGEMENT (admin-only)
========================================================= */

authRouter.get(
  "/users",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    res.json(await getUsers());
  })
);

authRouter.post(
  "/users",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createUser(req.body || {}));
  })
);

authRouter.put(
  "/users/:userId",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const user = await updateUser(req.params.userId, req.body || {}, req.user.userId);

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    res.json(user);
  })
);

authRouter.delete(
  "/users/:userId",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    if (!(await deleteUser(req.params.userId, req.user.userId))) {
      return res.status(404).json({ error: "User not found." });
    }

    res.status(204).send();
  })
);
