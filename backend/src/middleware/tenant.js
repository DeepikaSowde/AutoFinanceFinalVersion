// src/middleware/tenant.js
//
// Tenant (lender) enforcement for the lender-facing API. Runs after
// requireAuth:
//
//   loadTenant                 loads the user's tenant, plan and features,
//                              refuses suspended / expired tenants, and
//                              scopes every query in the request to it
//   requireFeature(key)        403 unless the tenant's features include key
//   checkUsageLimit(key)       counts one use this month; 429 over the limit

import { runWithTenant } from "../db/tenantContext.js";
import { consumeUsage, getTenantAccess } from "../services/tenantAccess.js";
import { asyncHandler } from "../util/asyncHandler.js";

export const loadTenant = asyncHandler(async (req, res, next) => {
  const tenant = await getTenantAccess(req.user?.tenantId);

  if (!tenant || tenant.blocked) {
    const reason = tenant?.blocked ?? { code: "TENANT_NOT_FOUND", message: "Your account is not linked to a lender." };
    return res.status(403).json({ error: reason.message, code: reason.code });
  }

  req.tenant = tenant;

  // Everything after this (routes, repositories) runs with this tenant.
  runWithTenant(tenant.id, next);
});

export const requireFeature = (featureKey) => (req, res, next) => {
  if (!req.tenant?.features.includes(featureKey)) {
    return res.status(403).json({ error: "Upgrade your plan to use this feature", code: "FEATURE_NOT_IN_PLAN", feature: featureKey });
  }

  next();
};

export const checkUsageLimit = (featureKey) =>
  asyncHandler(async (req, res, next) => {
    const usage = await consumeUsage(req.tenant.id, featureKey, req.tenant.limits[featureKey]);

    if (!usage.allowed) {
      return res.status(429).json({
        error: `Monthly limit reached for this feature (${usage.limit} this month). It resets on the 1st, or upgrade your plan.`,
        code: "USAGE_LIMIT_REACHED",
        feature: featureKey,
        used: usage.used,
        limit: usage.limit,
      });
    }

    next();
  });
