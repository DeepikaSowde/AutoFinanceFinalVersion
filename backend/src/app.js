// src/app.js

import express from "express";
import cors from "cors";

import { requireAuth } from "./middleware/requireAuth.js";
import { loadTenant } from "./middleware/tenant.js";
import { authRouter } from "./routes/auth.js";
import { customersRouter } from "./routes/customers.js";
import { loansRouter } from "./routes/loans.js";
import { vehiclesRouter } from "./routes/vehicles.js";
import { collectionsRouter } from "./routes/collections.js";
import { draftsRouter } from "./routes/drafts.js";
import { guarantorReferralsRouter } from "./routes/guarantorReferrals.js";
import { superadminRouter } from "./superadmin/routes.js";
import {
  categoriesRouter,
  expensesRouter,
  incomesRouter,
  investorsRouter,
  referralsRouter,
  reloanRouter,
  remindersRouter,
} from "./routes/finance.js";

// Browser origins allowed to call /api/superadmin (the separate admin app),
// comma-separated. The lender API keeps its open CORS policy.
const adminOrigins = () =>
  (process.env.ADMIN_APP_ORIGIN || "http://localhost:5174")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

export const createApp = () => {
  const app = express();

  // Behind Render / a load balancer: req.ip is the client, for rate limiting.
  app.set("trust proxy", 1);

  app.use(express.json({ limit: "15mb" }));

  // Super admin API: its own sign-in, and only the admin app may call it
  // from a browser. Mounted before the lender CORS so that never applies here.
  app.use("/api/superadmin", cors({ origin: adminOrigins() }), superadminRouter);

  app.use(cors());

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRouter);

  // Everything below needs a valid session and an active lender (tenant);
  // loadTenant also scopes every query in the request to that lender.
  app.use("/api/customers", requireAuth, loadTenant, customersRouter);
  app.use("/api/loans", requireAuth, loadTenant, loansRouter);
  app.use("/api/vehicles", requireAuth, loadTenant, vehiclesRouter);
  app.use("/api/collections", requireAuth, loadTenant, collectionsRouter);
  app.use("/api/drafts", requireAuth, loadTenant, draftsRouter);
  app.use("/api/guarantor-referrals", requireAuth, loadTenant, guarantorReferralsRouter);
  app.use("/api/investors", requireAuth, loadTenant, investorsRouter);
  app.use("/api/expenses", requireAuth, loadTenant, expensesRouter);
  app.use("/api/incomes", requireAuth, loadTenant, incomesRouter);
  app.use("/api/referrals", requireAuth, loadTenant, referralsRouter);
  app.use("/api/reminders", requireAuth, loadTenant, remindersRouter);
  app.use("/api/categories", requireAuth, loadTenant, categoriesRouter);
  app.use("/api/reloan", requireAuth, loadTenant, reloanRouter);

  app.use((req, res) => {
    res.status(404).json({ error: "Not found." });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    // A unique-constraint violation (e.g. two requests racing to fund the
    // same loan) is a conflict the client can act on, not a server fault.
    if (error.code === "23505") {
      return res.status(409).json({ error: "This record already exists." });
    }

    const status = error.statusCode || 500;

    if (status >= 500) {
      console.error(error);
    }

    res.status(status).json({
      error: status >= 500 ? "Internal server error." : error.message,
    });
  });

  return app;
};
