// src/services/auth.js
//
// Replaces the frontend's hardcoded DEMO_USERS array and plaintext
// password comparison. Passwords are scrypt-hashed (node:crypto — no extra
// dependency) and sessions are opaque bearer tokens stored in the database.

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import { query } from "../db/connection.js";
import { DEFAULT_STAFF_PERMISSIONS, normalizePermissions } from "./permissions.js";

const SESSION_TTL_HOURS = 12;

const hashPassword = (password, salt) =>
  scryptSync(password, salt, 64).toString("hex");

const createPasswordRecord = (password) => {
  const salt = randomBytes(16).toString("hex");

  return { salt, hash: hashPassword(password, salt) };
};

const verifyPassword = (password, salt, expectedHash) => {
  const actual = Buffer.from(hashPassword(password, salt), "hex");
  const expected = Buffer.from(expectedHash, "hex");

  if (actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(actual, expected);
};

/*
 * The frontend shipped with two demo logins (admin/admin123,
 * staff/staff123). Seeding them keeps the existing login screen working
 * while moving the credential check server-side against hashed values.
 */
const SEED_USERS = [
  { id: "ADMIN-001", username: "admin", password: "admin123", name: "Admin", role: "admin" },
  { id: "STAFF-001", username: "staff", password: "staff123", name: "Ravi", role: "staff" },
];

export const seedUsers = async () => {
  const existing = await query("SELECT COUNT(*)::int AS count FROM users");

  if (existing.rows[0].count > 0) {
    return;
  }

  for (const user of SEED_USERS) {
    const { salt, hash } = createPasswordRecord(user.password);

    await query(
      `INSERT INTO users (id, username, password_hash, password_salt, name, role, permissions)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (username) DO NOTHING`,
      [
        user.id,
        user.username,
        hash,
        salt,
        user.name,
        user.role,
        user.role === "staff" ? DEFAULT_STAFF_PERMISSIONS : {},
      ]
    );
  }
};

// Admins carry no permission map: they are allowed everything.
const permissionsFor = (row) =>
  row.role === "staff" ? normalizePermissions(row.permissions) : {};

const toPublicUser = (row) => ({
  userId: row.id,
  username: row.username,
  name: row.name,
  role: row.role,
  permissions: permissionsFor(row),
});

export const login = async (username, password) => {
  const cleanUsername = String(username || "").trim();

  const result = await query("SELECT * FROM users WHERE username = $1", [cleanUsername]);
  const row = result.rows[0];

  if (!row || !verifyPassword(String(password || ""), row.password_salt, row.password_hash)) {
    return null;
  }

  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_HOURS * 60 * 60 * 1000);

  await query(
    "INSERT INTO sessions (token, user_pk, expires_at) VALUES ($1, $2, $3)",
    [token, row.pk, expiresAt.toISOString()]
  );

  return {
    token,
    user: { ...toPublicUser(row), loginAt: now.toISOString() },
  };
};

export const logout = async (token) => {
  await query("DELETE FROM sessions WHERE token = $1", [token]);
};

/* =========================================================
   USER MANAGEMENT (admin-only)
========================================================= */

const pad = (number, length = 3) => String(number).padStart(length, "0");

const MIN_PASSWORD_LENGTH = 6;

const httpError = (message, statusCode = 400) => {
  const error = new Error(message);

  error.statusCode = statusCode;

  return error;
};

const checkPasswordLength = (password) => {
  if (String(password).length < MIN_PASSWORD_LENGTH) {
    throw httpError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
};

const countAdmins = async () => {
  const result = await query("SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin'");

  return result.rows[0].count;
};

const toManagedUser = (row) => ({
  id: row.id,
  username: row.username,
  name: row.name,
  role: row.role,
  permissions: permissionsFor(row),
  createdAt: row.created_at,
});

export const getUsers = async () => {
  const result = await query("SELECT * FROM users ORDER BY created_at ASC");

  return result.rows.map(toManagedUser);
};

export const createUser = async ({ username, password, name, role, permissions } = {}) => {
  const cleanUsername = String(username || "").trim().toLowerCase();
  const cleanName = String(name || "").trim();
  const cleanRole = role === "staff" ? "staff" : "admin";
  const cleanPermissions =
    cleanRole === "staff"
      ? normalizePermissions(permissions === undefined ? DEFAULT_STAFF_PERMISSIONS : permissions)
      : {};

  if (!cleanUsername || !password || !cleanName) {
    throw httpError("Username, password and name are required.");
  }

  checkPasswordLength(password);

  const existing = await query("SELECT pk FROM users WHERE username = $1", [cleanUsername]);

  if (existing.rows.length > 0) {
    throw httpError("That username is already taken.", 409);
  }

  const { salt, hash } = createPasswordRecord(String(password));

  // MAX(pk), not COUNT(*): after a delete, a count-based id can collide
  // with one that already exists.
  const pkResult = await query("SELECT COALESCE(MAX(pk), 0)::int AS max FROM users");
  const id = `${cleanRole.toUpperCase()}-${pad(pkResult.rows[0].max + 1)}`;

  const saved = await query(
    `INSERT INTO users (id, username, password_hash, password_salt, name, role, permissions)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [id, cleanUsername, hash, salt, cleanName, cleanRole, cleanPermissions]
  );

  return toManagedUser(saved.rows[0]);
};

/**
 * Edits name, role, permissions and (optionally) password. Fields left
 * out of the payload keep their current value.
 */
export const updateUser = async (userId, updates = {}, requestingUserId) => {
  const result = await query("SELECT * FROM users WHERE id = $1", [userId]);
  const row = result.rows[0];

  if (!row) {
    return null;
  }

  const name = updates.name === undefined ? row.name : String(updates.name || "").trim();

  if (!name) {
    throw httpError("Name is required.");
  }

  const role =
    updates.role === undefined ? row.role : updates.role === "staff" ? "staff" : "admin";

  if (row.role === "admin" && role === "staff") {
    if (userId === requestingUserId) {
      throw httpError("You can't remove admin access from your own account.");
    }

    if ((await countAdmins()) <= 1) {
      throw httpError("At least one admin account must remain.");
    }
  }

  const permissions =
    role === "staff"
      ? normalizePermissions(
          updates.permissions === undefined ? row.permissions : updates.permissions
        )
      : {};

  let salt = row.password_salt;
  let hash = row.password_hash;

  if (updates.password) {
    checkPasswordLength(updates.password);
    ({ salt, hash } = createPasswordRecord(String(updates.password)));
  }

  const saved = await query(
    `UPDATE users
     SET name = $2, role = $3, permissions = $4, password_salt = $5, password_hash = $6
     WHERE id = $1
     RETURNING *`,
    [userId, name, role, permissions, salt, hash]
  );

  // A reset password signs that user out of every other session.
  if (updates.password && userId !== requestingUserId) {
    await query("DELETE FROM sessions WHERE user_pk = $1", [row.pk]);
  }

  return toManagedUser(saved.rows[0]);
};

export const deleteUser = async (userId, requestingUserId) => {
  if (userId === requestingUserId) {
    throw httpError("You can't remove your own account while signed in.");
  }

  const target = await query("SELECT * FROM users WHERE id = $1", [userId]);

  if (!target.rows[0]) {
    return false;
  }

  if (target.rows[0].role === "admin" && (await countAdmins()) <= 1) {
    throw httpError("At least one admin account must remain.");
  }

  const result = await query("DELETE FROM users WHERE id = $1", [userId]);

  return result.rowCount > 0;
};

export const getUserForToken = async (token) => {
  if (!token) {
    return null;
  }

  const result = await query(
    `SELECT users.*, sessions.expires_at
     FROM sessions
     JOIN users ON users.pk = sessions.user_pk
     WHERE sessions.token = $1`,
    [token]
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  if (new Date(row.expires_at) < new Date()) {
    await logout(token);
    return null;
  }

  return toPublicUser(row);
};
