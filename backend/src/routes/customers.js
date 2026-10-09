// src/routes/customers.js

import { Router } from "express";

import {
  addLoanForCustomer,
  createCustomer,
  deleteCustomer,
  getCustomerById,
  getCustomers,
  updateCustomer,
} from "../services/customerRepository.js";
import { sanitizeCustomerPayload } from "../services/sanitize.js";
import { hasPermission } from "../services/permissions.js";
import { requirePermission } from "../middleware/requireAuth.js";
import { asyncHandler } from "../util/asyncHandler.js";

export const customersRouter = Router();

// Customer records carry the loans, so they are read by nearly every
// screen (collections, reminders, vehicles, search) and stay readable to
// any signed-in user.

customersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await getCustomers());
  })
);

customersRouter.get(
  "/:customerId",
  asyncHandler(async (req, res) => {
    const customer = await getCustomerById(req.params.customerId);

    if (!customer) {
      return res.status(404).json({ error: "Customer not found." });
    }

    res.json(customer);
  })
);

// New Loan onboarding creates the customer together with the first loan.
customersRouter.post(
  "/",
  requirePermission("customers.add", "loans.add"),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createCustomer(sanitizeCustomerPayload(req.body)));
  })
);

customersRouter.put(
  "/:customerId",
  requirePermission("customers.edit", "loans.edit"),
  asyncHandler(async (req, res) => {
    const customer = await updateCustomer(req.params.customerId, sanitizeCustomerPayload(req.body));

    if (!customer) {
      return res.status(404).json({ error: "Customer not found." });
    }

    res.json(customer);
  })
);

// Onboarding rolls back a customer it just created when funding the loan
// fails; that is the only delete someone with New Loan but no customer
// delete permission may make.
const ONBOARDING_ROLLBACK_WINDOW_MS = 10 * 60 * 1000;

customersRouter.delete(
  "/:customerId",
  requirePermission("customers.delete", "loans.add"),
  asyncHandler(async (req, res) => {
    if (!hasPermission(req.user, "customers", "delete")) {
      const record = await getCustomerById(req.params.customerId);
      const createdAt = Date.parse(record?.customer?.createdAt || "");

      if (!record || !(Date.now() - createdAt < ONBOARDING_ROLLBACK_WINDOW_MS)) {
        return res.status(403).json({ error: "You do not have permission for this action." });
      }
    }

    if (!(await deleteCustomer(req.params.customerId))) {
      return res.status(404).json({ error: "Customer not found." });
    }

    res.status(204).send();
  })
);

// Additional loan for an existing customer (the re-loan path).
customersRouter.post(
  "/:customerId/loans",
  requirePermission("loans.add", "reloan.add"),
  asyncHandler(async (req, res) => {
    const customer = await addLoanForCustomer(req.params.customerId, req.body || {});

    if (!customer) {
      return res.status(404).json({ error: "Customer not found." });
    }

    res.status(201).json(customer);
  })
);
