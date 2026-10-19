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
import { loadTenant } from "../middleware/tenant.js";
import { getTenantAccess, subscriptionState } from "../services/tenantAccess.js";
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

    if (session.blocked) {
      return res.status(403).json({ error: session.blocked.message, code: session.blocked.code });
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

// Works even when the lender is suspended or expired, so the app can say why.
authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenant = await getTenantAccess(req.user.tenantId);

    res.json({
      user: req.user,
      tenant: tenant
        ? {
            name: tenant.name,
            product: tenant.product,
            status: tenant.blocked ? (tenant.status === "suspended" ? "suspended" : "expired") : tenant.status,
            valid_until: tenant.validUntil,
            // For the renewal banner: daysLeft, graceDays, graceEndsOn, inGrace.
            subscription: subscriptionState(tenant),
          }
        : null,
      supportContact: String(process.env.SUPPORT_CONTACT || "").trim(),
      features: tenant?.features ?? [],
    });
  })
);

/* =========================================================
   USER MANAGEMENT (admin-only)
========================================================= */

authRouter.get(
  "/users",
  requireAuth,
  loadTenant,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    res.json(await getUsers());
  })
);

authRouter.post(
  "/users",
  requireAuth,
  loadTenant,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createUser(req.body || {}));
  })
);

authRouter.put(
  "/users/:userId",
  requireAuth,
  loadTenant,
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
  loadTenant,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    if (!(await deleteUser(req.params.userId, req.user.userId))) {
      return res.status(404).json({ error: "User not found." });
    }

    res.status(204).send();
  })
);
