// src/db/migrate.js
//
// Numbered, run-once migrations. schema.sql (run on every start) stays the
// base schema; changes that must happen exactly once — new tables with seed
// rows, back-filling a column — go in backend/migrations/NNN_name.sql.
// Each file runs in its own transaction and is recorded in
// schema_migrations, so it never runs twice. A lock stops two server
// instances applying the same migration at once.
//
//   npm run migrate        apply pending migrations and exit
//   (the server also applies them on start, after schema.sql)

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { pool, withTransaction } from "./connection.js";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "migrations");

const migrationFiles = () =>
  readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^\d{3}_[\w-]+\.sql$/.test(name))
    .sort();

export const runMigrations = async ({ log = console.log } = {}) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const applied = [];

  for (const file of migrationFiles()) {
    const version = file.replace(/\.sql$/, "");

    const ran = await withTransaction(async (client) => {
      // Serialises migrations across instances for this transaction.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('schema_migrations'))");

      const done = await client.query("SELECT 1 FROM schema_migrations WHERE version = $1", [version]);

      if (done.rows.length) {
        return false;
      }

      await client.query(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);

      return true;
    });

    if (ran) {
      applied.push(version);
      log(`Applied migration ${version}`);
    }
  }

  return applied;
};

// `node src/db/migrate.js` (npm run migrate) applies pending migrations and exits.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { initialiseSchema } = await import("./connection.js");

  try {
    await initialiseSchema();
    const applied = await runMigrations();
    console.log(applied.length ? `${applied.length} migration(s) applied.` : "No pending migrations.");
  } catch (error) {
    console.error("Migration failed:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
