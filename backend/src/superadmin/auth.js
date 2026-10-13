// src/superadmin/auth.js
//
// Super admin (product owner) sign-in. Sessions live in
// super_admin_sessions, separate from lender `sessions`: a lender token is
// never found here and a super admin token is never found by the lender
// requireAuth, so neither works on the other's routes.

import { randomBytes } from "node:crypto";

import { query } from "../db/connection.js";
import { verifyPassword } from "../services/auth.js";
import { asyncHandler } from "../util/asyncHandler.js";

const SESSION_TTL_HOURS = 12;

const toPublicSuperAdmin = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: "superadmin",
});

export const loginSuperAdmin = async (email, password) => {
  const result = await query("SELECT * FROM super_admins WHERE email = $1", [
    String(email || "").trim().toLowerCase(),
  ]);
  const row = result.rows[0];

  if (!row || !verifyPassword(String(password || ""), row.password_salt, row.password_hash)) {
    return null;
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);

  await query("INSERT INTO super_admin_sessions (token, super_admin_id, expires_at) VALUES ($1, $2, $3)", [
    token,
    row.id,
    expiresAt.toISOString(),
  ]);

  return { token, superAdmin: toPublicSuperAdmin(row), expiresAt: expiresAt.toISOString() };
};

export const logoutSuperAdmin = (token) => query("DELETE FROM super_admin_sessions WHERE token = $1", [token]);

const readToken = (req) => {
  const header = req.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
};

export const requireSuperAdmin = asyncHandler(async (req, res, next) => {
  const token = readToken(req);

  if (token) {
    const result = await query(
      `SELECT super_admins.*, super_admin_sessions.expires_at
       FROM super_admin_sessions
       JOIN super_admins ON super_admins.id = super_admin_sessions.super_admin_id
       WHERE super_admin_sessions.token = $1`,
      [token]
    );
    const row = result.rows[0];

    if (row && new Date(row.expires_at) > new Date()) {
      req.superAdmin = toPublicSuperAdmin(row);
      req.superAdminToken = token;
      return next();
    }

    if (row) await logoutSuperAdmin(token);
  }

  res.status(401).json({ error: "Super admin sign-in required." });
});
