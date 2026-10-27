// src/services/auth.js
//
// Replaces the frontend's hardcoded DEMO_USERS array and plaintext
// password comparison. Passwords are scrypt-hashed (node:crypto — no extra
// dependency) and sessions are opaque bearer tokens stored in the database.

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import { query } from "../db/connection.js";
import { currentTenantId } from "../db/tenantContext.js";
import { getTenantAccess } from "./tenantAccess.js";
import {
  DEFAULT_STAFF_PERMISSIONS,
  normalizePermissions,
  normalizeStaffPages,
  permissionsFromPages,
} from "./permissions.js";

const SESSION_TTL_HOURS = 12;

const hashPassword = (password, salt) =>
  scryptSync(password, salt, 64).toString("hex");

export const createPasswordRecord = (password) => {
  const salt = randomBytes(16).toString("hex");

  return { salt, hash: hashPassword(password, salt) };
};

export const verifyPassword = (password, salt, expectedHash) => {
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
      `INSERT INTO users (id, username, password_hash, password_salt, name, role, permissions, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, (SELECT min(id) FROM tenants))
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
  phone: row.phone || "",
  role: row.role,
  status: row.status || "Active",
  permissions: permissionsFor(row),
  tenantId: row.tenant_id,
});

/*
 * Signs in with a username or the 10-digit mobile number on the account.
 * Usernames are unique; a mobile number is unique within a lender, so when
 * the same number exists at two lenders the password decides which account.
 * An Inactive account is refused ({ inactive: true }).
 */
export const login = async (identifier, password) => {
  const clean = String(identifier || "").trim();
  const digits = clean.replace(/\D/g, "");
  const secret = String(password || "");

  let candidates = (await query("SELECT * FROM users WHERE lower(username) = lower($1)", [clean])).rows;

  if (!candidates.length && digits.length === 10) {
    candidates = (
      await query("SELECT * FROM users WHERE right(regexp_replace(phone, '\\D', '', 'g'), 10) = $1", [digits])
    ).rows;
  }

  const row = candidates.find((candidate) => verifyPassword(secret, candidate.password_salt, candidate.password_hash));

  if (!row) {
    return null;
  }

  if (row.status === "Inactive") {
    return { inactive: true };
  }

  const tenant = await getTenantAccess(row.tenant_id);

  if (!tenant || tenant.blocked) {
    return { blocked: tenant?.blocked ?? { code: "TENANT_NOT_FOUND", message: "Your account is not linked to a lender." } };
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

const countActiveAdmins = async (exceptUserId = null) => {
  const result = await query(
    `SELECT COUNT(*)::int AS count FROM users
      WHERE role = 'admin' AND status = 'Active' AND tenant_id = $1 AND ($2::text IS NULL OR id <> $2)`,
    [currentTenantId(), exceptUserId]
  );

  return result.rows[0].count;
};

// The lender's first admin account: its role and status cannot be changed
// and it cannot be removed, so the lender always has a way in.
const primaryAdminPk = async () => {
  const result = await query("SELECT MIN(pk) AS pk FROM users WHERE role = 'admin' AND tenant_id = $1", [
    currentTenantId(),
  ]);

  return result.rows[0].pk;
};

const toManagedUser = (row, primaryPk) => ({
  id: row.id,
  username: row.username,
  name: row.name,
  phone: row.phone || "",
  address: row.address || "",
  role: row.role,
  status: row.status || "Active",
  isPrimaryAdmin: row.pk === primaryPk,
  permissions: permissionsFor(row),
  createdAt: row.created_at,
});

export const getUsers = async () => {
  const [result, primaryPk] = await Promise.all([
    query("SELECT * FROM users WHERE tenant_id = $1 ORDER BY created_at ASC", [currentTenantId()]),
    primaryAdminPk(),
  ]);

  return result.rows.map((row) => toManagedUser(row, primaryPk));
};

const managedUser = async (row) => toManagedUser(row, await primaryAdminPk());

/* ---------- staff role: page permissions ---------- */

const STAFF_PAGES_KEY = "staff_page_permissions";

// Roles & Permissions: which pages staff can open (one switch per page).
export const getStaffPagePermissions = async () => {
  const result = await query("SELECT value FROM app_settings WHERE tenant_id = $1 AND key = $2", [
    currentTenantId(),
    STAFF_PAGES_KEY,
  ]);

  return normalizeStaffPages(result.rows[0]?.value);
};

// Saves the staff page switches and applies them to every staff account
// (their next request uses the new access).
export const saveStaffPagePermissions = async (pages = {}) => {
  const clean = normalizeStaffPages(pages);

  await query(
    `INSERT INTO app_settings (tenant_id, key, value) VALUES ($1, $2, $3)
     ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value`,
    [currentTenantId(), STAFF_PAGES_KEY, JSON.stringify(clean)]
  );
  await query("UPDATE users SET permissions = $1 WHERE role = 'staff' AND tenant_id = $2", [
    permissionsFromPages(clean),
    currentTenantId(),
  ]);

  return clean;
};

/* ---------- users ---------- */

const cleanPhone = (phone) => {
  const digits = String(phone || "").replace(/[\s\-+]/g, "");

  if (digits && !/^\d{10}$/.test(digits)) {
    throw httpError("Please enter a valid 10-digit mobile number.");
  }

  return digits;
};

const checkPhoneFree = async (phone, exceptUserId = null) => {
  if (!phone) return;

  const result = await query(
    `SELECT 1 FROM users WHERE tenant_id = $1 AND phone = $2 AND ($3::text IS NULL OR id <> $3)`,
    [currentTenantId(), phone, exceptUserId]
  );

  if (result.rows.length) {
    throw httpError("Another user already has this mobile number.", 409);
  }
};

const roleOf = (role) => (String(role || "").toLowerCase() === "staff" ? "staff" : "admin");
const statusOf = (status) => (String(status || "").toLowerCase() === "inactive" ? "Inactive" : "Active");

// Usernames are unique across lenders; staff added by mobile number get one
// made from it (they can sign in with either).
const freeUsername = async (base) => {
  const stem = String(base || "user").toLowerCase().replace(/[^a-z0-9]+/g, "") || "user";

  for (let n = 1; ; n += 1) {
    const candidate = n === 1 ? stem : `${stem}${n}`;
    const taken = await query("SELECT 1 FROM users WHERE lower(username) = $1", [candidate]);

    if (!taken.rows.length) return candidate;
  }
};

export const createUser = async ({ username, password, name, role, permissions, phone, address, status } = {}) => {
  const cleanName = String(name || "").trim();
  const cleanRole = roleOf(role);
  const mobile = cleanPhone(phone);

  if (!password || !cleanName) {
    throw httpError("Name and password are required.");
  }

  checkPasswordLength(password);
  await checkPhoneFree(mobile);

  let cleanUsername = String(username || "").trim().toLowerCase();

  if (cleanUsername) {
    const existing = await query("SELECT pk FROM users WHERE lower(username) = $1", [cleanUsername]);

    if (existing.rows.length > 0) {
      throw httpError("That username is already taken.", 409);
    }
  } else {
    cleanUsername = await freeUsername(mobile ? `u${mobile}` : cleanName);
  }

  // A new staff account gets the staff role's page access unless a
  // permission map is given.
  const cleanPermissions =
    cleanRole === "staff"
      ? permissions === undefined
        ? permissionsFromPages(await getStaffPagePermissions())
        : normalizePermissions(permissions)
      : {};

  const { salt, hash } = createPasswordRecord(String(password));

  // MAX(pk), not COUNT(*): after a delete, a count-based id can collide
  // with one that already exists.
  const pkResult = await query("SELECT COALESCE(MAX(pk), 0)::int AS max FROM users");
  const id = `${cleanRole.toUpperCase()}-${pad(pkResult.rows[0].max + 1)}`;

  const saved = await query(
    `INSERT INTO users (id, username, password_hash, password_salt, name, role, permissions, tenant_id, phone, address, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      id,
      cleanUsername,
      hash,
      salt,
      cleanName,
      cleanRole,
      cleanPermissions,
      currentTenantId(),
      mobile,
      String(address || "").trim(),
      statusOf(status),
    ]
  );

  return managedUser(saved.rows[0]);
};

/**
 * Edits name, mobile, address, role, status, permissions and (optionally)
 * password. Fields left out of the payload keep their current value.
 */
export const updateUser = async (userId, updates = {}, requestingUserId) => {
  const result = await query("SELECT * FROM users WHERE id = $1 AND tenant_id = $2", [userId, currentTenantId()]);
  const row = result.rows[0];

  if (!row) {
    return null;
  }

  const name = updates.name === undefined ? row.name : String(updates.name || "").trim();

  if (!name) {
    throw httpError("Name is required.");
  }

  const role = updates.role === undefined ? row.role : roleOf(updates.role);
  const status = updates.status === undefined ? row.status : statusOf(updates.status);
  const phone = updates.phone === undefined ? row.phone : cleanPhone(updates.phone);
  const address = updates.address === undefined ? row.address : String(updates.address || "").trim();
  const isPrimary = row.pk === (await primaryAdminPk());

  if (isPrimary && (role !== row.role || status !== row.status)) {
    throw httpError("The primary admin's role and status cannot be changed.");
  }

  if (userId === requestingUserId && role !== row.role) {
    throw httpError("You can't change the role of your own account.");
  }

  if (userId === requestingUserId && status === "Inactive") {
    throw httpError("You can't deactivate your own account.");
  }

  const losingAdmin = row.role === "admin" && row.status === "Active" && (role !== "admin" || status !== "Active");

  if (losingAdmin && (await countActiveAdmins(userId)) < 1) {
    throw httpError("At least one active admin account must remain.");
  }

  if (phone !== row.phone) {
    await checkPhoneFree(phone, userId);
  }

  // A staff account follows the staff role's page access unless a
  // permission map is given.
  const permissions =
    role !== "staff"
      ? {}
      : updates.permissions !== undefined
        ? normalizePermissions(updates.permissions)
        : row.role === "staff"
          ? normalizePermissions(row.permissions)
          : permissionsFromPages(await getStaffPagePermissions());

  let salt = row.password_salt;
  let hash = row.password_hash;

  if (updates.password) {
    checkPasswordLength(updates.password);
    ({ salt, hash } = createPasswordRecord(String(updates.password)));
  }

  const saved = await query(
    `UPDATE users
     SET name = $2, role = $3, permissions = $4, password_salt = $5, password_hash = $6,
         phone = $8, address = $9, status = $10
     WHERE id = $1 AND tenant_id = $7
     RETURNING *`,
    [userId, name, role, permissions, salt, hash, currentTenantId(), phone, address, status]
  );

  // A reset password or a deactivated account ends that user's sessions.
  if ((updates.password && userId !== requestingUserId) || (status === "Inactive" && row.status !== "Inactive")) {
    await query("DELETE FROM sessions WHERE user_pk = $1", [row.pk]);
  }

  return managedUser(saved.rows[0]);
};

export const deleteUser = async (userId, requestingUserId) => {
  if (userId === requestingUserId) {
    throw httpError("You can't remove your own account while signed in.");
  }

  const target = await query("SELECT * FROM users WHERE id = $1 AND tenant_id = $2", [userId, currentTenantId()]);
  const row = target.rows[0];

  if (!row) {
    return false;
  }

  if (row.pk === (await primaryAdminPk())) {
    throw httpError("The primary admin account cannot be removed.");
  }

  if (row.role === "admin" && row.status === "Active" && (await countActiveAdmins(userId)) < 1) {
    throw httpError("At least one active admin account must remain.");
  }

  const result = await query("DELETE FROM users WHERE id = $1 AND tenant_id = $2", [userId, currentTenantId()]);

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

  if (new Date(row.expires_at) < new Date() || row.status === "Inactive") {
    await logout(token);
    return null;
  }

  return toPublicUser(row);
};
