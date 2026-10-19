// src/superadmin/dashboard.js
//
// The super admin overview: tenant counts by state and plan, who expires in
// the next 30 days, and this month's WhatsApp / VAHAN usage against the
// limits of the tenants that have those features.

import { query } from "../db/connection.js";
import { currentUsageMonth } from "../services/tenantAccess.js";
import { EFFECTIVE_STATUS_SQL, IN_GRACE_SQL, TODAY_SQL, loadEntitlements } from "./tenantRepository.js";
import { LIMITED_FEATURES, PRODUCTS } from "./validate.js";

export const getDashboard = async () => {
  const tenants = (
    await query(
      `SELECT tenants.*, ${EFFECTIVE_STATUS_SQL} AS effective_status,
              (tenants.valid_until - ${TODAY_SQL}) AS days_left,
              ${IN_GRACE_SQL} AS in_grace,
              to_char(tenants.valid_until + tenants.grace_days, 'YYYY-MM-DD') AS grace_ends_on,
              plans.code AS plan_code, plans.name AS plan_name
       FROM tenants JOIN plans ON plans.id = tenants.plan_id`
    )
  ).rows;

  const active = tenants.filter((t) => t.effective_status === "active");
  const expiringSoon = active
    .filter((t) => t.days_left !== null && t.days_left <= 30)
    .sort((a, b) => a.days_left - b.days_left)
    .map((t) => ({
      id: t.id,
      name: t.name,
      product: t.product,
      plan: { id: t.plan_id, code: t.plan_code, name: t.plan_name },
      validUntil: t.valid_until,
      daysLeft: t.days_left,
      // Already past valid_until, still working on its grace days.
      inGrace: Boolean(t.in_grace),
      graceEndsOn: t.grace_ends_on,
    }));

  const perPlan = {};
  const perProduct = Object.fromEntries(PRODUCTS.map((product) => [product, { tenants: 0, active: 0 }]));
  for (const t of tenants) {
    perPlan[t.plan_code] ??= { planId: t.plan_id, name: t.plan_name, product: t.product, count: 0 };
    perPlan[t.plan_code].count += 1;
    perProduct[t.product].tenants += 1;
    if (t.effective_status === "active") perProduct[t.product].active += 1;
  }

  // Usage vs capacity, over active tenants that have each feature.
  const entitlements = await loadEntitlements(active);
  const usage = Object.fromEntries(
    LIMITED_FEATURES.map((key) => {
      let used = 0;
      let limit = 0;
      let tenantsWithFeature = 0;
      for (const t of active) {
        const u = entitlements.get(t.id)?.usage[key];
        if (!u?.enabled) continue;
        tenantsWithFeature += 1;
        used += u.used;
        limit += u.limit ?? 0;
      }
      return [key, { used, limit, tenants: tenantsWithFeature }];
    })
  );

  return {
    month: currentUsageMonth(),
    totals: {
      tenants: tenants.length,
      active: active.length,
      expiringIn30Days: expiringSoon.length,
      suspendedOrExpired: tenants.filter((t) => t.effective_status !== "active").length,
      suspended: tenants.filter((t) => t.effective_status === "suspended").length,
      expired: tenants.filter((t) => t.effective_status === "expired").length,
    },
    perPlan,
    perProduct,
    usage,
    expiringSoon,
  };
};
