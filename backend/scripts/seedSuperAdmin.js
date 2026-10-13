// scripts/seedSuperAdmin.js
//
// Creates the first super admin from SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD
// (and optional SUPERADMIN_NAME). Safe to re-run: an existing account with
// that email is left as it is, password included.
//
//   npm run seed:superadmin
//
// The API also runs this on start when the variables are set.

import { fileURLToPath } from "node:url";

import { pool, query } from "../src/db/connection.js";
import { createPasswordRecord } from "../src/services/auth.js";

const MIN_PASSWORD_LENGTH = 12;

export const seedSuperAdmin = async ({ log = console.log } = {}) => {
  const email = String(process.env.SUPERADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.SUPERADMIN_PASSWORD || "");
  const name = String(process.env.SUPERADMIN_NAME || "Super Admin").trim();

  if (!email || !password) {
    return { created: false, reason: "SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD are not set." };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("SUPERADMIN_EMAIL is not a valid email address.");
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`SUPERADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const { salt, hash } = createPasswordRecord(password);

  const result = await query(
    `INSERT INTO super_admins (name, email, password_hash, password_salt)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    [name, email, hash, salt]
  );

  if (result.rows.length) {
    log(`Created super admin ${email}.`);
    return { created: true };
  }

  return { created: false, reason: `A super admin with email ${email} already exists.` };
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const outcome = await seedSuperAdmin();
    if (!outcome.created) console.log(outcome.reason);
  } catch (error) {
    console.error("Could not create the super admin:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
