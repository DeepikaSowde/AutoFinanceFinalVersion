// src/server.js

import "dotenv/config";

import { createApp } from "./app.js";
import { initialiseSchema, pool } from "./db/connection.js";
import { runMigrations } from "./db/migrate.js";
import { seedSuperAdmin } from "../scripts/seedSuperAdmin.js";
import { seedUsers } from "./services/auth.js";

const port = process.env.PORT || 4000;

const start = async () => {
  // Tables and seed users must exist before the first request lands.
  await initialiseSchema();
  await seedUsers();
  // Run-once changes (backend/migrations), after the base schema and the
  // seed users so back-fills include them.
  await runMigrations();
  // Creates the first super admin when SUPERADMIN_EMAIL/PASSWORD are set.
  await seedSuperAdmin();

  createApp().listen(port, () => {
    console.log(`Auto Finance API listening on http://localhost:${port}`);
  });
};

start().catch(async (error) => {
  console.error("Failed to start the API:", error.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
