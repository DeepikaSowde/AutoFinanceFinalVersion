// src/superadmin/planRepository.js
//
// Subscription plans: the product they belong to (Auto Finance or General
// Finance), price, the features they include and monthly limits. A plan's
// features must be ones its product offers.

import { query, withTransaction } from "../db/connection.js";
import { writeAudit } from "./audit.js";
import * as v from "./validate.js";

export const getPlans = async ({ product = "" } = {}) => {
  const [plans, features, limits, counts] = await Promise.all([
    product
      ? query("SELECT * FROM plans WHERE product = $1 ORDER BY price_monthly ASC, id ASC", [product])
      : query("SELECT * FROM plans ORDER BY product ASC, price_monthly ASC, id ASC"),
    query("SELECT plan_id, feature_key FROM plan_features ORDER BY feature_key"),
    query("SELECT plan_id, feature_key, monthly_limit FROM plan_limits"),
    query("SELECT plan_id, COUNT(*)::int AS n FROM tenants GROUP BY plan_id"),
  ]);

  return plans.rows.map((plan) => ({
    id: plan.id,
    code: plan.code,
    name: plan.name,
    product: plan.product,
    priceMonthly: plan.price_monthly,
    isActive: plan.is_active,
    features: features.rows.filter((f) => f.plan_id === plan.id).map((f) => f.feature_key),
    limits: Object.fromEntries(limits.rows.filter((l) => l.plan_id === plan.id).map((l) => [l.feature_key, l.monthly_limit])),
    tenantCount: counts.rows.find((c) => c.plan_id === plan.id)?.n ?? 0,
  }));
};

const parseFeatures = (input, product) => {
  if (!Array.isArray(input)) throw v.badRequest("features must be a list.");
  return [...new Set(input.map((key) => v.productFeature(product, v.oneOf(key, "Feature", v.FEATURE_KEYS))))];
};

const parseLimits = (input) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw v.badRequest("limits must be an object of feature: monthly limit.");
  return Object.fromEntries(
    Object.entries(input)
      .filter(([, value]) => value !== null && value !== "")
      .map(([key, value]) => [v.oneOf(key, "Limited feature", v.LIMITED_FEATURES), v.wholeNumber(value, `${key} monthly limit`, { min: 0, max: 1_000_000 })])
  );
};

const checkLimits = (limits, features) => {
  for (const key of Object.keys(limits)) {
    if (!features.includes(key)) throw v.badRequest(`Add ${key} to the plan's features before setting its limit.`);
  }
};

const writeFeaturesAndLimits = async (client, planId, features, limits) => {
  if (features) {
    await client.query("DELETE FROM plan_features WHERE plan_id = $1", [planId]);
    for (const key of features) await client.query("INSERT INTO plan_features (plan_id, feature_key) VALUES ($1, $2)", [planId, key]);
    // A limit for a feature the plan no longer has is meaningless.
    await client.query("DELETE FROM plan_limits WHERE plan_id = $1 AND NOT (feature_key = ANY($2))", [planId, features]);
  }
  if (limits) {
    await client.query("DELETE FROM plan_limits WHERE plan_id = $1", [planId]);
    for (const [key, limit] of Object.entries(limits)) {
      await client.query("INSERT INTO plan_limits (plan_id, feature_key, monthly_limit) VALUES ($1, $2, $3)", [planId, key, limit]);
    }
  }
};

// Code for a new plan, e.g. "gf_gold"; a number is added if it is taken.
const codeFor = async (client, product, name) => {
  const base = `${product === "general_finance" ? "gf" : "af"}_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "plan"}`.slice(0, 40);
  for (let n = 1; ; n += 1) {
    const code = n === 1 ? base : `${base}_${n}`;
    if (!(await client.query("SELECT 1 FROM plans WHERE code = $1", [code])).rows.length) return code;
  }
};

export const createPlan = async (input, actor) => {
  const product = v.oneOf(input.product, "Product", v.PRODUCTS);
  const name = v.text(input.name, "Plan name", { required: true, max: 60 });
  const priceMonthly = v.money(input.priceMonthly ?? 0, "Monthly price");
  const features = parseFeatures(input.features ?? ["web_app"], product);
  const limits = input.limits !== undefined ? parseLimits(input.limits) : {};
  checkLimits(limits, features);

  const planId = await withTransaction(async (client) => {
    const duplicate = await client.query("SELECT 1 FROM plans WHERE product = $1 AND lower(name) = lower($2)", [product, name]);
    if (duplicate.rows.length) throw v.conflict(`There is already a ${name} plan for this product.`);

    const code = await codeFor(client, product, name);
    const inserted = await client.query(
      "INSERT INTO plans (code, name, price_monthly, product) VALUES ($1, $2, $3, $4) RETURNING id",
      [code, name, priceMonthly, product]
    );
    const id = inserted.rows[0].id;
    await writeFeaturesAndLimits(client, id, features, limits);
    await writeAudit(client, { actorId: actor.id, action: "plan.created", details: { planId: id, code, product, name, priceMonthly, features, limits } });
    return id;
  });

  return (await getPlans()).find((plan) => plan.id === planId);
};

/*
 * Updates price / name / active flag, and replaces the feature list and the
 * monthly limits when given. A plan's product never changes (its tenants
 * belong to that product).
 */
export const updatePlan = async (planId, input, actor) => {
  if (input.product !== undefined) throw v.badRequest("A plan's product cannot be changed. Create a plan under the other product instead.");

  const changes = {};
  if (input.name !== undefined) changes.name = v.text(input.name, "Plan name", { required: true, max: 60 });
  if (input.priceMonthly !== undefined) changes.price_monthly = v.money(input.priceMonthly, "Monthly price");
  if (input.isActive !== undefined) {
    if (typeof input.isActive !== "boolean") throw v.badRequest("isActive must be true or false.");
    changes.is_active = input.isActive;
  }

  const before = (await getPlans()).find((plan) => plan.id === planId);
  if (!before) throw v.notFound("Plan not found.");

  const features = input.features !== undefined ? parseFeatures(input.features, before.product) : null;
  const limits = input.limits !== undefined ? parseLimits(input.limits) : null;

  if (!Object.keys(changes).length && !features && !limits) throw v.badRequest("Nothing to update.");
  checkLimits(limits ?? {}, features ?? before.features);

  await withTransaction(async (client) => {
    if (changes.name) {
      const duplicate = await client.query("SELECT 1 FROM plans WHERE product = $1 AND lower(name) = lower($2) AND id <> $3", [before.product, changes.name, planId]);
      if (duplicate.rows.length) throw v.conflict(`There is already a ${changes.name} plan for this product.`);
    }

    const columns = Object.keys(changes);
    if (columns.length) {
      await client.query(`UPDATE plans SET ${columns.map((c, i) => `${c} = $${i + 2}`).join(", ")} WHERE id = $1`, [planId, ...columns.map((c) => changes[c])]);
    }
    await writeFeaturesAndLimits(client, planId, features, limits);

    await writeAudit(client, {
      actorId: actor.id,
      action: "plan.updated",
      details: {
        planId,
        plan: before.code,
        product: before.product,
        from: { name: before.name, priceMonthly: before.priceMonthly, isActive: before.isActive, features: before.features, limits: before.limits },
        changes: { ...input },
      },
    });
  });

  return (await getPlans()).find((plan) => plan.id === planId);
};
