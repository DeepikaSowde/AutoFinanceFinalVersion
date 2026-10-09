// src/middleware/requireAuth.js

import { getUserForToken } from "../services/auth.js";
import { hasPermission } from "../services/permissions.js";
import { asyncHandler } from "../util/asyncHandler.js";

const readToken = (req) => {
  const header = req.get("authorization") || "";

  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
};

export const requireAuth = asyncHandler(async (req, res, next) => {
  const user = await getUserForToken(readToken(req));

  if (!user) {
    return res.status(401).json({ error: "Authentication required." });
  }

  req.user = user;
  next();
});

export const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required." });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have access to this action." });
    }

    next();
  };

/**
 * Allows the request when the user holds ANY of the listed permissions,
 * written as "module.action" (e.g. "collections.approve"). Admins always
 * pass. Several are accepted because some data backs more than one screen
 * (the ledger reads expenses, onboarding funds a loan from the investor
 * pool, and so on).
 */
export const requirePermission =
  (...permissions) =>
  (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const allowed = permissions.some((permission) => {
      const [module, action] = permission.split(".");

      return hasPermission(req.user, module, action);
    });

    if (!allowed) {
      return res.status(403).json({ error: "You do not have permission for this action." });
    }

    next();
  };
