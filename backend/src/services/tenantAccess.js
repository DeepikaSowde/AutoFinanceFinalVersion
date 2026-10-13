// src/services/tenantAccess.js
//
// What a tenant may do right now: its subscription state, the features its
// plan gives (adjusted by per-tenant overrides) and the monthly limits.
// Access is decided by feature keys, never by plan names.

import { query } from "../db/connection.js";

// Calendar month in India, where the lenders are, as 'YYYY-MM'.
export const currentUsageMonth = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" })
    .format(date)
    .slice(0, 7);

const todayInIndia = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

const toDateString = (value) => {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  // node-postgres returns DATE as a local-midnight Date.
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

/*
 * Why a tenant is locked out, or null when it may use the app. A tenant is
 * blocked when suspended, marked expired, or past its valid_until date.
 */
export const blockReason = (tenant) => {
  if (!tenant) {
    return { code: "TENANT_NOT_FOUND", message: "Your account is not linked to a lender. Contact support." };
  }

  if (tenant.status === "suspended") {
    return {
      code: "TENANT_SUSPENDED",
      message: "Your MotoLend account is suspended. Contact MotoLend support to restore access.",
    };
  }

  if (tenant.status === "expired" || (tenant.validUntil && tenant.validUntil < todayInIndia())) {
    return {
      code: "SUBSCRIPTION_EXPIRED",
      message: "Your MotoLend subscription has expired. Renew it to continue using the app.",
    };
  }

  return null;
};

export const getTenantAccess = async (tenantId) => {
  if (!tenantId) return null;

  const tenantResult = await query(
    `SELECT tenants.*, plans.code AS plan_code, plans.name AS plan_name
     FROM tenants JOIN plans ON plans.id = tenants.plan_id
     WHERE tenants.id = $1`,
    [tenantId]
  );
  const row = tenantResult.rows[0];

  if (!row) return null;

  const [featureResult, overrideResult, limitResult] = await Promise.all([
    query("SELECT feature_key FROM plan_features WHERE plan_id = $1", [row.plan_id]),
    query("SELECT feature_key, enabled FROM tenant_feature_overrides WHERE tenant_id = $1", [row.id]),
    query("SELECT feature_key, monthly_limit FROM plan_limits WHERE plan_id = $1", [row.plan_id]),
  ]);

  const features = new Set(featureResult.rows.map((feature) => feature.feature_key));

  for (const override of overrideResult.rows) {
    if (override.enabled) features.add(override.feature_key);
    else features.delete(override.feature_key);
  }

  const tenant = {
    id: row.id,
    name: row.name,
    status: row.status,
    validUntil: toDateString(row.valid_until),
    plan: { id: row.plan_id, code: row.plan_code, name: row.plan_name },
    features: [...features].sort(),
    limits: Object.fromEntries(limitResult.rows.map((limit) => [limit.feature_key, limit.monthly_limit])),
  };

  return { ...tenant, blocked: blockReason(tenant) };
};

/*
 * Counts one use of a limited feature this month. The increment only happens
 * when it stays within the limit, in a single statement, so two requests
 * racing for the last unit cannot both get it. A feature with no limit row
 * is unlimited. Returns { allowed, used, limit }.
 */
export const consumeUsage = async (tenantId, featureKey, limit) => {
  const month = currentUsageMonth();

  if (limit === undefined || limit === null) {
    const result = await query(
      `INSERT INTO usage_counters (tenant_id, feature_key, month, count) VALUES ($1, $2, $3, 1)
       ON CONFLICT (tenant_id, feature_key, month) DO UPDATE SET count = usage_counters.count + 1
       RETURNING count`,
      [tenantId, featureKey, month]
    );
    return { allowed: true, used: result.rows[0].count, limit: null };
  }

  const result = await query(
    `INSERT INTO usage_counters (tenant_id, feature_key, month, count)
     SELECT $1, $2, $3, 1 WHERE $4::int > 0
     ON CONFLICT (tenant_id, feature_key, month) DO UPDATE
       SET count = usage_counters.count + 1
       WHERE usage_counters.count < $4::int
     RETURNING count`,
    [tenantId, featureKey, month, limit]
  );

  if (result.rows.length) {
    return { allowed: true, used: result.rows[0].count, limit };
  }

  const current = await query(
    "SELECT count FROM usage_counters WHERE tenant_id = $1 AND feature_key = $2 AND month = $3",
    [tenantId, featureKey, month]
  );

  return { allowed: false, used: current.rows[0]?.count ?? 0, limit };
};
