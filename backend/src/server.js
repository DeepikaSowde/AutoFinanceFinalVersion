// src/server.js

import "dotenv/config";

import { createApp } from "./app.js";
import { initialiseSchema, pool } from "./db/connection.js";
import { runMigrations } from "./db/migrate.js";
import { seedSuperAdmin } from "../scripts/seedSuperAdmin.js";
import { seedUsers } from "./services/auth.js";
import { rebuildMissingForeclosures } from "./services/vehicleRepository.js";

const port = process.env.PORT || 4000;

const start = async () => {
  // Tables and seed users must exist before the first request lands.
  await initialiseSchema();
  // Run-once changes (backend/migrations), after the base schema.
  await runMigrations();
  // Foreclosure breakdown for vehicles sold before it was saved with a sale.
  await rebuildMissingForeclosures().catch((error) =>
    console.error("Could not rebuild earlier foreclosures:", error.message)
  );
  // Demo users on an empty database, in the first tenant.
  await seedUsers();
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
