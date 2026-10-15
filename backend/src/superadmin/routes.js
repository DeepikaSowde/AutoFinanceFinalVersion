// src/superadmin/routes.js
//
// /api/superadmin — the product owner's API for managing lenders (tenants),
// plans and subscription payments. Signed in separately from lenders; see
// auth.js. Every change writes an audit log entry.

import { Router } from "express";

import { asyncHandler } from "../util/asyncHandler.js";
import { getAuditLogs } from "./audit.js";
import { loginSuperAdmin, logoutSuperAdmin, requireSuperAdmin } from "./auth.js";
import { getDashboard } from "./dashboard.js";
import { createPlan, getPlans, updatePlan } from "./planRepository.js";
import { loginRateLimit, recordLoginFailure, recordLoginSuccess } from "./rateLimit.js";
import * as tenants from "./tenantRepository.js";
import * as v from "./validate.js";

export const superadminRouter = Router();

/* ---------- sign-in ---------- */

superadminRouter.post(
  "/auth/login",
  loginRateLimit,
  asyncHandler(async (req, res) => {
    const email = v.email(req.body?.email, "Email", { required: true });
    const password = v.text(req.body?.password, "Password", { required: true, max: 200 });

    const session = await loginSuperAdmin(email, password);

    if (!session) {
      recordLoginFailure(req);
      return res.status(401).json({ error: "Invalid email or password." });
    }

    recordLoginSuccess(req);
    res.json(session);
  })
);

// Everything below needs a super admin session.
superadminRouter.use(requireSuperAdmin);

superadminRouter.post(
  "/auth/logout",
  asyncHandler(async (req, res) => {
    await logoutSuperAdmin(req.superAdminToken);
    res.status(204).send();
  })
);

superadminRouter.get("/auth/me", (req, res) => res.json({ superAdmin: req.superAdmin }));

/* ---------- helpers ---------- */

const tenantId = (req) => v.id(req.params.id, "Tenant id");

const paging = (req, { defaultSize = 20, maxSize = 100 } = {}) => ({
  page: req.query.page ? v.wholeNumber(req.query.page, "page", { min: 1, max: 100_000 }) : 1,
  pageSize: req.query.pageSize ? v.wholeNumber(req.query.pageSize, "pageSize", { min: 1, max: maxSize }) : defaultSize,
});

/* ---------- dashboard ---------- */

superadminRouter.get("/dashboard", asyncHandler(async (req, res) => res.json(await getDashboard())));

/* ---------- tenants ---------- */

superadminRouter.get(
  "/tenants",
  asyncHandler(async (req, res) => {
    res.json(
      await tenants.listTenants({
        search: v.text(req.query.search, "search", { max: 100 }),
        product: req.query.product ? v.oneOf(req.query.product, "product", v.PRODUCTS) : "",
        planId: req.query.planId ? v.id(req.query.planId, "planId") : null,
        status: req.query.status ? v.oneOf(req.query.status, "status", v.TENANT_STATUSES) : "",
        ...paging(req),
      })
    );
  })
);

superadminRouter.post("/tenants", asyncHandler(async (req, res) => res.status(201).json(await tenants.createTenant(req.body || {}, req.superAdmin))));

superadminRouter.get("/tenants/:id", asyncHandler(async (req, res) => res.json(await tenants.getTenant(tenantId(req)))));

superadminRouter.patch("/tenants/:id", asyncHandler(async (req, res) => res.json(await tenants.updateTenant(tenantId(req), req.body || {}, req.superAdmin))));

superadminRouter.post(
  "/tenants/:id/create-admin",
  asyncHandler(async (req, res) => res.status(201).json(await tenants.createTenantAdmin(tenantId(req), req.body || {}, req.superAdmin)))
);

superadminRouter.post(
  "/tenants/:id/admin/reset-password",
  asyncHandler(async (req, res) => res.json(await tenants.resetTenantAdminPassword(tenantId(req), req.body || {}, req.superAdmin)))
);

superadminRouter.patch("/tenants/:id/plan", asyncHandler(async (req, res) => res.json(await tenants.changePlan(tenantId(req), req.body?.planId, req.superAdmin))));

superadminRouter.patch("/tenants/:id/status", asyncHandler(async (req, res) => res.json(await tenants.changeStatus(tenantId(req), req.body?.status, req.superAdmin))));

superadminRouter.patch("/tenants/:id/extend", asyncHandler(async (req, res) => res.json(await tenants.extendTenant(tenantId(req), req.body || {}, req.superAdmin))));

superadminRouter.put("/tenants/:id/features", asyncHandler(async (req, res) => res.json(await tenants.setFeatures(tenantId(req), req.body?.features, req.superAdmin))));

superadminRouter.get(
  "/tenants/:id/usage",
  asyncHandler(async (req, res) => {
    const month = req.query.month ? String(req.query.month) : undefined;
    if (month && !/^\d{4}-\d{2}$/.test(month)) throw v.badRequest("month must be YYYY-MM.");
    res.json(await tenants.getUsage(tenantId(req), month));
  })
);

superadminRouter.post(
  "/tenants/:id/payments",
  asyncHandler(async (req, res) => res.status(201).json(await tenants.recordPayment(tenantId(req), req.body || {}, req.superAdmin)))
);

superadminRouter.get("/tenants/:id/payments", asyncHandler(async (req, res) => res.json(await tenants.listPayments(tenantId(req)))));

/* ---------- plans ---------- */

superadminRouter.get(
  "/plans",
  asyncHandler(async (req, res) => res.json(await getPlans({ product: req.query.product ? v.oneOf(req.query.product, "product", v.PRODUCTS) : "" })))
);

superadminRouter.post("/plans", asyncHandler(async (req, res) => res.status(201).json(await createPlan(req.body || {}, req.superAdmin))));

superadminRouter.put("/plans/:id", asyncHandler(async (req, res) => res.json(await updatePlan(v.id(req.params.id, "Plan id"), req.body || {}, req.superAdmin))));

/* ---------- audit log ---------- */

superadminRouter.get(
  "/audit-logs",
  asyncHandler(async (req, res) => {
    res.json(
      await getAuditLogs({
        tenantId: req.query.tenantId ? v.id(req.query.tenantId, "tenantId") : null,
        ...paging(req, { defaultSize: 50, maxSize: 200 }),
      })
    );
  })
);

superadminRouter.use((req, res) => res.status(404).json({ error: "Not found." }));
