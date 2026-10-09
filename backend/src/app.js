// src/app.js

import express from "express";
import cors from "cors";

import { requireAuth } from "./middleware/requireAuth.js";
import { authRouter } from "./routes/auth.js";
import { customersRouter } from "./routes/customers.js";
import { loansRouter } from "./routes/loans.js";
import { vehiclesRouter } from "./routes/vehicles.js";
import { collectionsRouter } from "./routes/collections.js";
import {
  categoriesRouter,
  expensesRouter,
  incomesRouter,
  investorsRouter,
  referralsRouter,
  reloanRouter,
  remindersRouter,
} from "./routes/finance.js";

export const createApp = () => {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "5mb" }));

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRouter);

  // Everything below needs a valid session.
  app.use("/api/customers", requireAuth, customersRouter);
  app.use("/api/loans", requireAuth, loansRouter);
  app.use("/api/vehicles", requireAuth, vehiclesRouter);
  app.use("/api/collections", requireAuth, collectionsRouter);
  app.use("/api/investors", requireAuth, investorsRouter);
  app.use("/api/expenses", requireAuth, expensesRouter);
  app.use("/api/incomes", requireAuth, incomesRouter);
  app.use("/api/referrals", requireAuth, referralsRouter);
  app.use("/api/reminders", requireAuth, remindersRouter);
  app.use("/api/categories", requireAuth, categoriesRouter);
  app.use("/api/reloan", requireAuth, reloanRouter);

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
