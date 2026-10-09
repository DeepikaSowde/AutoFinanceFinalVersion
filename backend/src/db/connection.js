// src/db/connection.js
//
// PostgreSQL connection pool. Point DATABASE_URL at your database
// (e.g. a Neon connection string) in backend/.env.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Pool, types } = pg;

/*
 * node-postgres returns NUMERIC as a string to avoid precision loss on
 * values larger than a JS number can hold. Money here is well inside
 * that range and the app expects numbers, so parse it.
 */
types.setTypeParser(types.builtins.NUMERIC, (value) =>
  value === null ? null : Number(value)
);

const __dirname = dirname(fileURLToPath(import.meta.url));

const rawConnectionString = process.env.DATABASE_URL;

if (!rawConnectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy backend/.env.example to backend/.env and add your PostgreSQL connection string."
  );
}

const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(rawConnectionString);

/*
 * Hosted Postgres (Neon and friends) gets full certificate verification
 * and SCRAM channel binding. Neon hands out `sslmode=require`, which
 * node-postgres flags as ambiguous, so it is made explicit here rather than
 * silently weakened.
 */
const buildConnectionString = () => {
  if (isLocal) {
    return rawConnectionString;
  }

  const url = new URL(rawConnectionString);
  url.searchParams.set("sslmode", "verify-full");
  url.searchParams.delete("channel_binding");

  return url.toString();
};

export const pool = new Pool({
  connectionString: buildConnectionString(),
  ssl: isLocal ? false : { rejectUnauthorized: true },
  enableChannelBinding: !isLocal,
  max: Number(process.env.DATABASE_POOL_MAX) || 10,
});

pool.on("error", (error) => {
  console.error("Unexpected database pool error:", error);
});

export const query = (text, params) => pool.query(text, params);

/**
 * Runs a function inside a transaction on a single dedicated client, so
 * BEGIN/COMMIT cannot interleave with other requests sharing the pool.
 */
export const withTransaction = async (run) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await run(client);

    await client.query("COMMIT");

    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const initialiseSchema = async () => {
  const schema = readFileSync(join(__dirname, "schema.sql"), "utf8");

  await pool.query(schema);
};
