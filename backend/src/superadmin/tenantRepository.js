// src/superadmin/tenantRepository.js
//
// Tenants (lenders) as the super admin sees them: subscription, effective
// features, usage this month, their admin user, and payments. Every change
// runs in a transaction together with its audit log entry.

import { randomInt } from "node:crypto";

import { query, withTransaction } from "../db/connection.js";
import { createPasswordRecord } from "../services/auth.js";
import { currentUsageMonth } from "../services/tenantAccess.js";
import { writeAudit } from "./audit.js";
import * as v from "./validate.js";

// "Today" for subscriptions is the lenders' calendar day.
export const TODAY_SQL = "(now() AT TIME ZONE 'Asia/Kolkata')::date";

// Suspended wins; otherwise a tenant past valid_until + grace_days counts as
// expired. Inside the grace days it is still active (its app shows a banner).
export const EFFECTIVE_STATUS_SQL = `CASE
  WHEN tenants.status = 'suspended' THEN 'suspended'
  WHEN tenants.status = 'expired' OR tenants.valid_until + tenants.grace_days < ${TODAY_SQL} THEN 'expired'
  ELSE 'active' END`;

// Past valid_until but within the grace days (and not suspended / marked expired).
export const IN_GRACE_SQL = `(tenants.status = 'active' AND tenants.valid_until < ${TODAY_SQL}
  AND tenants.valid_until + tenants.grace_days >= ${TODAY_SQL})`;

const SELECT_TENANTS = `
  SELECT tenants.*, ${EFFECTIVE_STATUS_SQL} AS effective_status,
         (tenants.valid_until - ${TODAY_SQL}) AS days_left,
         ${IN_GRACE_SQL} AS in_grace,
         to_char(tenants.valid_until + tenants.grace_days, 'YYYY-MM-DD') AS grace_ends_on,
         plans.code AS plan_code, plans.name AS plan_name
  FROM tenants JOIN plans ON plans.id = tenants.plan_id`;

/* ---------- features, limits, usage ---------- */

// Plan features + per-tenant overrides, and the plan's monthly limits, for
// a set of tenants in three queries.
const loadEntitlements = async (tenantRows) => {
  const planIds = [...new Set(tenantRows.map((row) => row.plan_id))];
  const tenantIds = tenantRows.map((row) => row.id);
  if (!tenantIds.length) return new Map();

  const [features, limits, overrides, usage] = await Promise.all([
    query("SELECT plan_id, feature_key FROM plan_features WHERE plan_id = ANY($1)", [planIds]),
    query("SELECT plan_id, feature_key, monthly_limit FROM plan_limits WHERE plan_id = ANY($1)", [planIds]),
    query("SELECT tenant_id, feature_key, enabled FROM tenant_feature_overrides WHERE tenant_id = ANY($1)", [tenantIds]),
    query("SELECT tenant_id, feature_key, count FROM usage_counters WHERE tenant_id = ANY($1) AND month = $2", [
      tenantIds,
      currentUsageMonth(),
    ]),
  ]);

  const result = new Map();

  for (const row of tenantRows) {
    const planFeatures = features.rows.filter((f) => f.plan_id === row.plan_id).map((f) => f.feature_key);
    const tenantOverrides = Object.fromEntries(
      overrides.rows.filter((o) => o.tenant_id === row.id).map((o) => [o.feature_key, o.enabled])
    );
    const effective = new Set(planFeatures);
    for (const [key, enabled] of Object.entries(tenantOverrides)) {
      if (enabled) effective.add(key);
      else effective.delete(key);
    }
    const planLimits = Object.fromEntries(
      limits.rows.filter((l) => l.plan_id === row.plan_id).map((l) => [l.feature_key, l.monthly_limit])
    );
    const usageNow = Object.fromEntries(
      v.LIMITED_FEATURES.map((key) => [
        key,
        {
          enabled: effective.has(key),
          used: usage.rows.find((u) => u.tenant_id === row.id && u.feature_key === key)?.count ?? 0,
          limit: effective.has(key) ? planLimits[key] ?? null : 0,
        },
      ])
    );

    result.set(row.id, {
      planFeatures: planFeatures.sort(),
      overrides: tenantOverrides,
      features: [...effective].sort(),
      limits: planLimits,
      usage: usageNow,
    });
  }

  return result;
};

const mapTenant = (row, entitlements) => ({
  id: row.id,
  name: row.name,
  ownerName: row.owner_name || "",
  phone: row.phone || "",
  email: row.email || "",
  product: row.product,
  plan: { id: row.plan_id, code: row.plan_code, name: row.plan_name },
  status: row.status,
  effectiveStatus: row.effective_status,
  validUntil: row.valid_until,
  daysLeft: row.days_left,
  graceDays: row.grace_days,
  graceEndsOn: row.grace_ends_on,
  inGrace: Boolean(row.in_grace),
  createdAt: new Date(row.created_at).toISOString(),
  ...(entitlements || {}),
});

const getTenantRow = async (tenantId, client = null) => {
  const run = client ? client.query.bind(client) : query;
  const result = await run(`${SELECT_TENANTS} WHERE tenants.id = $1`, [tenantId]);
  if (!result.rows[0]) throw v.notFound("Tenant not found.");
  return result.rows[0];
};

/* ---------- reads ---------- */

export const listTenants = async ({ search = "", product = "", planId = null, status = "", page = 1, pageSize = 20 } = {}) => {
  const conditions = [];
  const params = [];

  if (search) {
    params.push(`%${search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
    conditions.push(
      `(tenants.name ILIKE $${params.length} OR tenants.owner_name ILIKE $${params.length} OR tenants.email ILIKE $${params.length} OR tenants.phone ILIKE $${params.length})`
    );
  }
  if (product) {
    params.push(product);
    conditions.push(`tenants.product = $${params.length}`);
  }
  if (planId) {
    params.push(planId);
    conditions.push(`tenants.plan_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`${EFFECTIVE_STATUS_SQL} = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const total = (await query(`SELECT COUNT(*)::int AS n FROM tenants ${where}`, params)).rows[0].n;

  params.push(pageSize, (page - 1) * pageSize);
  const rows = (
    await query(`${SELECT_TENANTS} ${where} ORDER BY tenants.name ASC, tenants.id ASC LIMIT $${params.length - 1} OFFSET $${params.length}`, params)
  ).rows;
  const entitlements = await loadEntitlements(rows);

  return { items: rows.map((row) => mapTenant(row, entitlements.get(row.id))), total, page, pageSize };
};

const mapAdminUser = (row) => ({
  id: row.id,
  name: row.name,
  username: row.username,
  role: row.role,
  createdAt: new Date(row.created_at).toISOString(),
});

export const getTenant = async (tenantId) => {
  const row = await getTenantRow(tenantId);
  const entitlements = (await loadEntitlements([row])).get(row.id);
  const [admins, userCount] = await Promise.all([
    query("SELECT id, name, username, role, created_at FROM users WHERE tenant_id = $1 AND role = 'admin' ORDER BY pk ASC", [row.id]),
    query("SELECT COUNT(*)::int AS n FROM users WHERE tenant_id = $1", [row.id]),
  ]);

  return { ...mapTenant(row, entitlements), admins: admins.rows.map(mapAdminUser), userCount: userCount.rows[0].n };
};

export const getUsage = async (tenantId, month = currentUsageMonth()) => {
  const row = await getTenantRow(tenantId);
  const entitlements = (await loadEntitlements([row])).get(row.id);
  const counters = await query("SELECT feature_key, count FROM usage_counters WHERE tenant_id = $1 AND month = $2", [row.id, month]);

  return {
    month,
    features: Object.fromEntries(
      v.LIMITED_FEATURES.map((key) => [
        key,
        {
          enabled: entitlements.features.includes(key),
          used: counters.rows.find((c) => c.feature_key === key)?.count ?? 0,
          limit: entitlements.features.includes(key) ? entitlements.limits[key] ?? null : 0,
        },
      ])
    ),
  };
};

/* ---------- changes (each with its audit entry) ---------- */

const requireActivePlan = async (client, planId) => {
  const plan = (await client.query("SELECT id, code, name, product, is_active FROM plans WHERE id = $1", [planId])).rows[0];
  if (!plan) throw v.badRequest("That plan does not exist.");
  if (!plan.is_active) throw v.badRequest(`The ${plan.name} plan is not active.`);
  return plan;
};

export const createTenant = async (input, actor) => {
  const name = v.text(input.name, "Lender name", { required: true });
  const ownerName = v.text(input.ownerName, "Owner name");
  const phone = v.phone(input.phone);
  const email = v.email(input.email);
  const product = v.oneOf(input.product, "Product", v.PRODUCTS);
  const planId = v.id(input.planId, "Plan");
  const validUntil = v.date(input.validUntil, "Valid until");

  const tenantId = await withTransaction(async (client) => {
    const plan = await requireActivePlan(client, planId);
    if (plan.product !== product) throw v.badRequest(`The ${plan.name} plan is not a plan of this product.`);
    const inserted = await client.query(
      `INSERT INTO tenants (name, owner_name, phone, email, product, plan_id, status, valid_until)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', COALESCE($7::date, (${TODAY_SQL} + INTERVAL '1 month')::date))
       RETURNING id, valid_until`,
      [name, ownerName, phone, email, product, plan.id, validUntil]
    );
    const created = inserted.rows[0];
    await writeAudit(client, {
      actorId: actor.id,
      action: "tenant.created",
      tenantId: created.id,
      details: { name, product, plan: plan.code, validUntil: created.valid_until },
    });
    return created.id;
  });

  return getTenant(tenantId);
};

export const updateTenant = async (tenantId, input, actor) => {
  const changes = {};
  if (input.name !== undefined) changes.name = v.text(input.name, "Lender name", { required: true });
  if (input.ownerName !== undefined) changes.owner_name = v.text(input.ownerName, "Owner name");
  if (input.phone !== undefined) changes.phone = v.phone(input.phone);
  if (input.email !== undefined) changes.email = v.email(input.email);
  if (input.graceDays !== undefined) changes.grace_days = v.wholeNumber(input.graceDays, "Grace days", { min: 0, max: 90 });
  if (!Object.keys(changes).length) throw v.badRequest("Nothing to update.");

  await withTransaction(async (client) => {
    const before = await getTenantRow(tenantId, client);
    const columns = Object.keys(changes);
    await client.query(
      `UPDATE tenants SET ${columns.map((column, i) => `${column} = $${i + 2}`).join(", ")} WHERE id = $1`,
      [tenantId, ...columns.map((column) => changes[column])]
    );
    await writeAudit(client, {
      actorId: actor.id,
      action: "tenant.updated",
      tenantId,
      details: Object.fromEntries(columns.map((column) => [column, { from: before[column], to: changes[column] }])),
    });
  });

  return getTenant(tenantId);
};

export const changePlan = async (tenantId, planId, actor) => {
  const id = v.id(planId, "Plan");

  await withTransaction(async (client) => {
    const before = await getTenantRow(tenantId, client);
    const plan = await requireActivePlan(client, id);
    if (plan.product !== before.product) throw v.badRequest(`The ${plan.name} plan belongs to the other product. Pick one of this tenant's product plans.`);
    if (plan.id === before.plan_id) return;
    await client.query("UPDATE tenants SET plan_id = $2 WHERE id = $1", [tenantId, plan.id]);
    await writeAudit(client, { actorId: actor.id, action: "tenant.plan_changed", tenantId, details: { from: before.plan_code, to: plan.code } });
  });

  return getTenant(tenantId);
};

export const changeStatus = async (tenantId, status, actor) => {
  const next = v.oneOf(status, "Status", v.TENANT_STATUSES);

  await withTransaction(async (client) => {
    const before = await getTenantRow(tenantId, client);
    if (before.status === next) return;
    await client.query("UPDATE tenants SET status = $2 WHERE id = $1", [tenantId, next]);
    await writeAudit(client, { actorId: actor.id, action: "tenant.status_changed", tenantId, details: { from: before.status, to: next } });
  });

  return getTenant(tenantId);
};

/*
 * Extends the subscription by whole months from the later of today and the
 * current valid_until (so an expired tenant gets the full period), or sets
 * an exact date. An "expired" status becomes active; "suspended" stays.
 */
export const extendTenant = async (tenantId, input, actor) => {
  const months = input.months !== undefined && input.months !== null ? v.wholeNumber(input.months, "Months", { min: 1, max: 60 }) : null;
  const exact = v.date(input.validUntil, "Valid until");
  if (!months && !exact) throw v.badRequest("Give months to extend by, or a valid-until date.");

  await withTransaction(async (client) => {
    const before = await getTenantRow(tenantId, client);
    const updated = await client.query(
      `UPDATE tenants SET
         valid_until = COALESCE($3::date, (GREATEST(COALESCE(valid_until, ${TODAY_SQL}), ${TODAY_SQL}) + make_interval(months => $2::int))::date),
         status = CASE WHEN status = 'expired' THEN 'active' ELSE status END
       WHERE id = $1
       RETURNING valid_until, status`,
      [tenantId, months ?? 0, exact]
    );
    await writeAudit(client, {
      actorId: actor.id,
      action: "tenant.extended",
      tenantId,
      details: { from: before.valid_until, to: updated.rows[0].valid_until, months, status: updated.rows[0].status },
    });
  });

  return getTenant(tenantId);
};

/*
 * `features` is the state wanted for each feature ({ vahan_lookup: true }).
 * Only differences from the plan are stored as overrides; a feature set back
 * to the plan's default loses its override.
 */
export const setFeatures = async (tenantId, features, actor) => {
  if (!features || typeof features !== "object" || Array.isArray(features)) throw v.badRequest("features must be an object of feature: true/false.");
  for (const [key, value] of Object.entries(features)) {
    v.oneOf(key, "Feature", v.FEATURE_KEYS);
    if (typeof value !== "boolean") throw v.badRequest(`${key} must be true or false.`);
  }

  await withTransaction(async (client) => {
    const row = await getTenantRow(tenantId, client);
    for (const key of Object.keys(features)) v.productFeature(row.product, key);
    const planFeatures = new Set(
      (await client.query("SELECT feature_key FROM plan_features WHERE plan_id = $1", [row.plan_id])).rows.map((f) => f.feature_key)
    );
    const before = Object.fromEntries(
      (await client.query("SELECT feature_key, enabled FROM tenant_feature_overrides WHERE tenant_id = $1", [tenantId])).rows.map((o) => [o.feature_key, o.enabled])
    );

    const after = { ...before };
    for (const [key, enabled] of Object.entries(features)) {
      if (enabled === planFeatures.has(key)) delete after[key];
      else after[key] = enabled;
    }

    await client.query("DELETE FROM tenant_feature_overrides WHERE tenant_id = $1", [tenantId]);
    for (const [key, enabled] of Object.entries(after)) {
      await client.query("INSERT INTO tenant_feature_overrides (tenant_id, feature_key, enabled) VALUES ($1, $2, $3)", [tenantId, key, enabled]);
    }
    await writeAudit(client, { actorId: actor.id, action: "tenant.features_changed", tenantId, details: { requested: features, overrides: { from: before, to: after } } });
  });

  return getTenant(tenantId);
};

/* ---------- the lender's admin user ---------- */

// Readable temporary password: no 0/O/1/l/I.
const temporaryPassword = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 10 }, () => alphabet[randomInt(alphabet.length)]).join("");
};

export const createTenantAdmin = async (tenantId, input, actor) => {
  const name = v.text(input.name, "Name", { required: true });
  const email = v.email(input.email, "Email", { required: true });
  const username = (v.text(input.username, "Username", { max: 80 }) || email).toLowerCase();
  const password = temporaryPassword();

  const user = await withTransaction(async (client) => {
    await getTenantRow(tenantId, client);
    const existingAdmin = await client.query("SELECT 1 FROM users WHERE tenant_id = $1 AND role = 'admin' LIMIT 1", [tenantId]);
    if (existingAdmin.rows.length) throw v.conflict("This lender already has an admin user. Reset their password instead.");
    if ((await client.query("SELECT 1 FROM users WHERE username = $1", [username])).rows.length) {
      throw v.conflict("That username (email) is already in use.");
    }

    const { salt, hash } = createPasswordRecord(password);
    const next = (await client.query("SELECT COALESCE(MAX(pk), 0)::int + 1 AS n FROM users")).rows[0].n;
    const inserted = await client.query(
      `INSERT INTO users (id, username, password_hash, password_salt, name, role, permissions, tenant_id)
       VALUES ($1, $2, $3, $4, $5, 'admin', '{}', $6)
       RETURNING id, name, username, role, created_at`,
      [`ADMIN-${String(next).padStart(3, "0")}`, username, hash, salt, name, tenantId]
    );
    await writeAudit(client, { actorId: actor.id, action: "tenant.admin_created", tenantId, details: { userId: inserted.rows[0].id, username } });
    return inserted.rows[0];
  });

  // The temporary password is shown once, here; only its hash is stored.
  return { user: mapAdminUser(user), temporaryPassword: password };
};

export const resetTenantAdminPassword = async (tenantId, input, actor) => {
  const password = temporaryPassword();

  const user = await withTransaction(async (client) => {
    await getTenantRow(tenantId, client);
    const target = input.userId
      ? await client.query("SELECT * FROM users WHERE id = $1 AND tenant_id = $2 AND role = 'admin'", [String(input.userId), tenantId])
      : await client.query("SELECT * FROM users WHERE tenant_id = $1 AND role = 'admin' ORDER BY pk ASC LIMIT 1", [tenantId]);
    const row = target.rows[0];
    if (!row) throw v.notFound("This lender has no admin user yet. Create one first.");

    const { salt, hash } = createPasswordRecord(password);
    await client.query("UPDATE users SET password_hash = $2, password_salt = $3 WHERE pk = $1", [row.pk, hash, salt]);
    // Signs them out everywhere, so only the new password works.
    await client.query("DELETE FROM sessions WHERE user_pk = $1", [row.pk]);
    await writeAudit(client, { actorId: actor.id, action: "tenant.admin_password_reset", tenantId, details: { userId: row.id, username: row.username } });
    return row;
  });

  return { user: mapAdminUser(user), temporaryPassword: password };
};

/* ---------- payments ---------- */

const mapPayment = (row) => ({
  id: row.id,
  tenantId: row.tenant_id,
  amount: row.amount,
  method: row.method,
  referenceNo: row.reference_no || "",
  paidOn: row.paid_on,
  periodFrom: row.period_from,
  periodTo: row.period_to,
  invoiceNo: row.invoice_no || "",
  gatewayPaymentId: row.gateway_payment_id || null,
  notes: row.notes || "",
  recordedBy: row.recorded_by_name ? { id: row.recorded_by, name: row.recorded_by_name } : null,
  createdAt: new Date(row.created_at).toISOString(),
});

/*
 * Records a payment, moves valid_until to the end of the paid period (never
 * earlier than it already is), makes the tenant active and writes the audit
 * entry — all or nothing.
 */
export const recordPayment = async (tenantId, input, actor) => {
  const amount = v.money(input.amount, "Amount", { min: 0, allowZero: false });
  const method = v.oneOf(input.method, "Payment method", v.PAYMENT_METHODS);
  const referenceNo = v.text(input.referenceNo, "Reference no.", { max: 100 });
  const paidOn = v.date(input.paidOn, "Paid on", { required: true });
  const periodFrom = v.date(input.periodFrom, "Period from", { required: true });
  const periodTo = v.date(input.periodTo, "Period to", { required: true });
  const invoiceNo = v.text(input.invoiceNo, "Invoice no.", { max: 50 });
  const notes = v.text(input.notes, "Notes", { max: 1000 });
  if (periodTo < periodFrom) throw v.badRequest("Period to must be on or after period from.");

  const result = await withTransaction(async (client) => {
    await client.query("SELECT id FROM tenants WHERE id = $1 FOR UPDATE", [tenantId]);
    const before = await getTenantRow(tenantId, client);

    if (invoiceNo && (await client.query("SELECT 1 FROM payments WHERE invoice_no = $1", [invoiceNo])).rows.length) {
      throw v.conflict("That invoice number is already used.");
    }

    const inserted = await client.query(
      `INSERT INTO payments (tenant_id, amount, method, reference_no, paid_on, period_from, period_to, invoice_no, notes, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [tenantId, amount, method, referenceNo, paidOn, periodFrom, periodTo, invoiceNo || null, notes, actor.id]
    );
    const paymentId = inserted.rows[0].id;

    // MotoLend invoice number when none was given: MLI-<year>-<id>.
    if (!invoiceNo) {
      await client.query("UPDATE payments SET invoice_no = $2 WHERE id = $1", [paymentId, `MLI-${paidOn.slice(0, 4)}-${String(paymentId).padStart(5, "0")}`]);
    }

    const updated = await client.query(
      `UPDATE tenants SET valid_until = GREATEST(COALESCE(valid_until, $2::date), $2::date), status = 'active'
       WHERE id = $1 RETURNING valid_until, status`,
      [tenantId, periodTo]
    );
    await writeAudit(client, {
      actorId: actor.id,
      action: "payment.recorded",
      tenantId,
      details: {
        paymentId,
        amount,
        method,
        period: { from: periodFrom, to: periodTo },
        validUntil: { from: before.valid_until, to: updated.rows[0].valid_until },
        status: { from: before.status, to: updated.rows[0].status },
      },
    });
    return paymentId;
  });

  const payment = await query(
    `SELECT payments.*, super_admins.name AS recorded_by_name FROM payments
     LEFT JOIN super_admins ON super_admins.id = payments.recorded_by WHERE payments.id = $1`,
    [result]
  );
  return { payment: mapPayment(payment.rows[0]), tenant: await getTenant(tenantId) };
};

export const listPayments = async (tenantId) => {
  await getTenantRow(tenantId);
  const result = await query(
    `SELECT payments.*, super_admins.name AS recorded_by_name FROM payments
     LEFT JOIN super_admins ON super_admins.id = payments.recorded_by
     WHERE payments.tenant_id = $1 ORDER BY payments.paid_on DESC, payments.id DESC`,
    [tenantId]
  );
  return result.rows.map(mapPayment);
};

export { loadEntitlements };
