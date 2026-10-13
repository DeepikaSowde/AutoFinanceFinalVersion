// src/superadmin/planRepository.js
//
// Subscription plans: price, the features they include and monthly limits.

import { query, withTransaction } from "../db/connection.js";
import { writeAudit } from "./audit.js";
import * as v from "./validate.js";

export const getPlans = async () => {
  const [plans, features, limits, counts] = await Promise.all([
    query("SELECT * FROM plans ORDER BY price_monthly ASC, id ASC"),
    query("SELECT plan_id, feature_key FROM plan_features ORDER BY feature_key"),
    query("SELECT plan_id, feature_key, monthly_limit FROM plan_limits"),
    query("SELECT plan_id, COUNT(*)::int AS n FROM tenants GROUP BY plan_id"),
  ]);

  return plans.rows.map((plan) => ({
    id: plan.id,
    code: plan.code,
    name: plan.name,
    priceMonthly: plan.price_monthly,
    isActive: plan.is_active,
    features: features.rows.filter((f) => f.plan_id === plan.id).map((f) => f.feature_key),
    limits: Object.fromEntries(limits.rows.filter((l) => l.plan_id === plan.id).map((l) => [l.feature_key, l.monthly_limit])),
    tenantCount: counts.rows.find((c) => c.plan_id === plan.id)?.n ?? 0,
  }));
};

/*
 * Updates price / name / active flag, and replaces the feature list and the
 * monthly limits when given. A limit only makes sense for a feature the plan
 * includes.
 */
export const updatePlan = async (planId, input, actor) => {
  const changes = {};
  if (input.name !== undefined) changes.name = v.text(input.name, "Plan name", { required: true, max: 60 });
  if (input.priceMonthly !== undefined) changes.price_monthly = v.money(input.priceMonthly, "Monthly price");
  if (input.isActive !== undefined) {
    if (typeof input.isActive !== "boolean") throw v.badRequest("isActive must be true or false.");
    changes.is_active = input.isActive;
  }

  let features = null;
  if (input.features !== undefined) {
    if (!Array.isArray(input.features)) throw v.badRequest("features must be a list.");
    features = [...new Set(input.features.map((key) => v.oneOf(key, "Feature", v.FEATURE_KEYS)))];
  }

  let limits = null;
  if (input.limits !== undefined) {
    if (!input.limits || typeof input.limits !== "object" || Array.isArray(input.limits)) throw v.badRequest("limits must be an object of feature: monthly limit.");
    limits = Object.fromEntries(
      Object.entries(input.limits)
        .filter(([, value]) => value !== null && value !== "")
        .map(([key, value]) => [v.oneOf(key, "Limited feature", v.LIMITED_FEATURES), v.wholeNumber(value, `${key} monthly limit`, { min: 0, max: 1_000_000 })])
    );
  }

  if (!Object.keys(changes).length && !features && !limits) throw v.badRequest("Nothing to update.");

  await withTransaction(async (client) => {
    const before = (await getPlans()).find((plan) => plan.id === planId);
    if (!before) throw v.notFound("Plan not found.");

    const finalFeatures = features ?? before.features;
    for (const key of Object.keys(limits ?? {})) {
      if (!finalFeatures.includes(key)) throw v.badRequest(`Add ${key} to the plan's features before setting its limit.`);
    }

    const columns = Object.keys(changes);
    if (columns.length) {
      await client.query(`UPDATE plans SET ${columns.map((c, i) => `${c} = $${i + 2}`).join(", ")} WHERE id = $1`, [planId, ...columns.map((c) => changes[c])]);
    }
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

    await writeAudit(client, {
      actorId: actor.id,
      action: "plan.updated",
      details: {
        planId,
        plan: before.code,
        from: { name: before.name, priceMonthly: before.priceMonthly, isActive: before.isActive, features: before.features, limits: before.limits },
        changes: { ...input },
      },
    });
  });

  return (await getPlans()).find((plan) => plan.id === planId);
};
