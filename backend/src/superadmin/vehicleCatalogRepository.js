// src/superadmin/vehicleCatalogRepository.js
//
// The super admin's side of the vehicle catalog (migration 028): the master
// list every lender sees â€” categories, subcategories, brands and models â€” and
// the brands/models lenders added for themselves, which can be moved into the
// master list.
//
// Nothing is deleted: an entry is switched off (active = false) so it stops
// appearing in New Loan. Renaming changes the list only; loans already saved
// keep the text they were saved with (vehicles store plain text).
// Every change writes an audit log entry in the same transaction.

import { query, withTransaction } from "../db/connection.js";
import { writeAudit } from "./audit.js";
import * as v from "./validate.js";

const NAME_MAX = 80;

const name = (value, label) => v.text(value, label, { required: true, max: NAME_MAX });
const flag = (value, label) => {
  if (typeof value !== "boolean") throw v.badRequest(`${label} must be true or false.`);
  return value;
};

/* ---------- read ---------- */

export const getMasterCatalog = async () => {
  const [categories, subcategories, makes, models, lenderMakes, lenderModels] = await Promise.all([
    query("SELECT id, name, sort_order, active FROM vehicle_categories ORDER BY sort_order, name"),
    query("SELECT id, category_id, name, sort_order, active FROM vehicle_subcategories ORDER BY sort_order, name"),
    query("SELECT id, name, active FROM vehicle_makes WHERE tenant_id IS NULL ORDER BY lower(name)"),
    query(
      `SELECT id, make_id, category_id, subcategory_id, name, is_ev, discontinued, active, sort_order
         FROM vehicle_models WHERE tenant_id IS NULL ORDER BY sort_order, name`
    ),
    query(
      `SELECT m.id, m.name, m.tenant_id, t.name AS tenant_name, m.created_by, m.created_at
         FROM vehicle_makes m JOIN tenants t ON t.id = m.tenant_id
        WHERE m.tenant_id IS NOT NULL ORDER BY m.created_at DESC`
    ),
    query(
      `SELECT m.id, m.name, m.tenant_id, t.name AS tenant_name, m.make_id, k.name AS make_name,
              k.tenant_id IS NOT NULL AS make_is_lenders, m.category_id, m.subcategory_id,
              m.is_ev, m.created_by, m.created_at,
              EXISTS (
                SELECT 1 FROM vehicle_models x
                  JOIN vehicle_makes xk ON xk.id = x.make_id
                 WHERE x.tenant_id IS NULL AND x.category_id = m.category_id
                   AND lower(xk.name) = lower(k.name) AND lower(x.name) = lower(m.name)
              ) AS in_master
         FROM vehicle_models m
         JOIN tenants t ON t.id = m.tenant_id
         JOIN vehicle_makes k ON k.id = m.make_id
        WHERE m.tenant_id IS NOT NULL
        ORDER BY m.created_at DESC`
    ),
  ]);

  const modelCount = (key, id) => models.rows.filter((row) => row[key] === id).length;

  return {
    categories: categories.rows.map((row) => ({
      id: row.id,
      name: row.name,
      active: row.active,
      modelCount: modelCount("category_id", row.id),
      subcategories: subcategories.rows
        .filter((sub) => sub.category_id === row.id)
        .map((sub) => ({ id: sub.id, name: sub.name, active: sub.active, modelCount: modelCount("subcategory_id", sub.id) })),
    })),
    makes: makes.rows.map((row) => ({ id: row.id, name: row.name, active: row.active, modelCount: modelCount("make_id", row.id) })),
    models: models.rows.map((row) => ({
      id: row.id,
      makeId: row.make_id,
      categoryId: row.category_id,
      subcategoryId: row.subcategory_id,
      name: row.name,
      isEv: row.is_ev,
      discontinued: row.discontinued,
      active: row.active,
    })),
    lenderAdded: {
      makes: lenderMakes.rows.map((row) => ({
        id: row.id,
        name: row.name,
        tenantId: row.tenant_id,
        tenantName: row.tenant_name,
        createdBy: row.created_by,
        createdAt: new Date(row.created_at).toISOString(),
      })),
      models: lenderModels.rows.map((row) => ({
        id: row.id,
        name: row.name,
        tenantId: row.tenant_id,
        tenantName: row.tenant_name,
        makeName: row.make_name,
        makeIsLenders: row.make_is_lenders,
        categoryId: row.category_id,
        subcategoryId: row.subcategory_id,
        isEv: row.is_ev,
        inMaster: row.in_master,
        createdBy: row.created_by,
        createdAt: new Date(row.created_at).toISOString(),
      })),
    },
  };
};

/* ---------- helpers ---------- */

const one = async (client, sql, params, notFoundMessage) => {
  const row = (await client.query(sql, params)).rows[0];
  if (!row) throw v.notFound(notFoundMessage);
  return row;
};

const audit = (client, actor, action, details) => writeAudit(client, { actorId: actor.id, action, details });

// Builds "SET a = $2, b = $3" for the given column -> value changes.
const updateRow = (client, table, id, changes) => {
  const columns = Object.keys(changes);
  return client.query(
    `UPDATE ${table} SET ${columns.map((c, i) => `${c} = $${i + 2}`).join(", ")}, updated_at = now() WHERE id = $1`,
    [id, ...columns.map((c) => changes[c])]
  );
};

const nameAndActive = (input, label) => {
  const changes = {};
  if (input.name !== undefined) changes.name = name(input.name, label);
  if (input.active !== undefined) changes.active = flag(input.active, "active");
  if (!Object.keys(changes).length) throw v.badRequest("Nothing to update.");
  return changes;
};

/* ---------- categories ---------- */

export const createCategory = async (input, actor) => {
  const categoryName = name(input.name, "Category name");
  return withTransaction(async (client) => {
    if ((await client.query("SELECT 1 FROM vehicle_categories WHERE lower(name) = lower($1)", [categoryName])).rows.length) {
      throw v.conflict(`A category named "${categoryName}" already exists.`);
    }
    const sortOrder = (await client.query("SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM vehicle_categories")).rows[0].n;
    const { id } = (
      await client.query("INSERT INTO vehicle_categories (name, sort_order) VALUES ($1, $2) RETURNING id", [categoryName, sortOrder])
    ).rows[0];
    await audit(client, actor, "vehicle_catalog.category_created", { id, name: categoryName });
    return { id };
  });
};

export const updateCategory = async (id, input, actor) => {
  const changes = nameAndActive(input, "Category name");
  return withTransaction(async (client) => {
    const before = await one(client, "SELECT * FROM vehicle_categories WHERE id = $1", [id], "Category not found.");
    if (changes.name && (await client.query("SELECT 1 FROM vehicle_categories WHERE lower(name) = lower($1) AND id <> $2", [changes.name, id])).rows.length) {
      throw v.conflict(`A category named "${changes.name}" already exists.`);
    }
    await updateRow(client, "vehicle_categories", id, changes);
    await audit(client, actor, "vehicle_catalog.category_updated", { id, name: before.name, changes });
    return { id };
  });
};

/* ---------- subcategories ---------- */

export const createSubcategory = async (input, actor) => {
  const categoryId = v.id(input.categoryId, "Category");
  const subName = name(input.name, "Subcategory name");
  return withTransaction(async (client) => {
    const category = await one(client, "SELECT * FROM vehicle_categories WHERE id = $1", [categoryId], "Category not found.");
    if ((await client.query("SELECT 1 FROM vehicle_subcategories WHERE category_id = $1 AND lower(name) = lower($2)", [categoryId, subName])).rows.length) {
      throw v.conflict(`${category.name} already has a ${subName} subcategory.`);
    }
    const sortOrder = (
      await client.query("SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM vehicle_subcategories WHERE category_id = $1", [categoryId])
    ).rows[0].n;
    const { id } = (
      await client.query("INSERT INTO vehicle_subcategories (category_id, name, sort_order) VALUES ($1, $2, $3) RETURNING id", [
        categoryId,
        subName,
        sortOrder,
      ])
    ).rows[0];
    await audit(client, actor, "vehicle_catalog.subcategory_created", { id, category: category.name, name: subName });
    return { id };
  });
};

export const updateSubcategory = async (id, input, actor) => {
  const changes = nameAndActive(input, "Subcategory name");
  return withTransaction(async (client) => {
    const before = await one(
      client,
      `SELECT s.*, c.name AS category_name FROM vehicle_subcategories s JOIN vehicle_categories c ON c.id = s.category_id WHERE s.id = $1`,
      [id],
      "Subcategory not found."
    );
    if (
      changes.name &&
      (await client.query("SELECT 1 FROM vehicle_subcategories WHERE category_id = $1 AND lower(name) = lower($2) AND id <> $3", [
        before.category_id,
        changes.name,
        id,
      ])).rows.length
    ) {
      throw v.conflict(`${before.category_name} already has a ${changes.name} subcategory.`);
    }
    await updateRow(client, "vehicle_subcategories", id, changes);
    await audit(client, actor, "vehicle_catalog.subcategory_updated", { id, category: before.category_name, name: before.name, changes });
    return { id };
  });
};

/* ---------- brands ---------- */

const assertMakeNameFree = async (client, makeName, exceptId = 0) => {
  if ((await client.query("SELECT 1 FROM vehicle_makes WHERE tenant_id IS NULL AND lower(name) = lower($1) AND id <> $2", [makeName, exceptId])).rows.length) {
    throw v.conflict(`A brand named "${makeName}" already exists.`);
  }
};

export const createMake = async (input, actor) => {
  const makeName = name(input.name, "Brand name");
  return withTransaction(async (client) => {
    await assertMakeNameFree(client, makeName);
    const { id } = (
      await client.query("INSERT INTO vehicle_makes (name, created_by) VALUES ($1, $2) RETURNING id", [makeName, actor.name || actor.email || null])
    ).rows[0];
    await audit(client, actor, "vehicle_catalog.brand_created", { id, name: makeName });
    return { id };
  });
};

export const updateMake = async (id, input, actor) => {
  const changes = nameAndActive(input, "Brand name");
  return withTransaction(async (client) => {
    const before = await one(client, "SELECT * FROM vehicle_makes WHERE id = $1 AND tenant_id IS NULL", [id], "Brand not found.");
    if (changes.name) await assertMakeNameFree(client, changes.name, id);
    await updateRow(client, "vehicle_makes", id, changes);
    await audit(client, actor, "vehicle_catalog.brand_updated", { id, name: before.name, changes });
    return { id };
  });
};

/* ---------- models ---------- */

// Checks brand / category / subcategory ids and that the subcategory is in the category.
const modelPlacement = async (client, { makeId, categoryId, subcategoryId }) => {
  const make = await one(client, "SELECT * FROM vehicle_makes WHERE id = $1 AND tenant_id IS NULL", [makeId], "Brand not found.");
  const category = await one(client, "SELECT * FROM vehicle_categories WHERE id = $1", [categoryId], "Category not found.");
  let subcategory = null;
  if (subcategoryId) {
    subcategory = (await client.query("SELECT * FROM vehicle_subcategories WHERE id = $1", [subcategoryId])).rows[0];
    if (!subcategory) throw v.notFound("Subcategory not found.");
    if (subcategory.category_id !== categoryId) throw v.badRequest(`${subcategory.name} is not a ${category.name} subcategory.`);
  }
  return { make, category, subcategory };
};

const assertModelNameFree = async (client, { makeId, categoryId, modelName, exceptId = 0, makeName, categoryName }) => {
  const taken = await client.query(
    `SELECT 1 FROM vehicle_models WHERE tenant_id IS NULL AND make_id = $1 AND category_id = $2 AND lower(name) = lower($3) AND id <> $4`,
    [makeId, categoryId, modelName, exceptId]
  );
  if (taken.rows.length) throw v.conflict(`${makeName} ${modelName} is already in ${categoryName}.`);
};

const optionalId = (value, label) => (value === null || value === undefined || value === "" ? null : v.id(value, label));

export const createModel = async (input, actor) => {
  const makeId = v.id(input.makeId, "Brand");
  const categoryId = v.id(input.categoryId, "Category");
  const subcategoryId = optionalId(input.subcategoryId, "Subcategory");
  const modelName = name(input.name, "Model name");
  const isEv = input.isEv === undefined ? false : flag(input.isEv, "isEv");
  const discontinued = input.discontinued === undefined ? false : flag(input.discontinued, "discontinued");

  return withTransaction(async (client) => {
    const { make, category, subcategory } = await modelPlacement(client, { makeId, categoryId, subcategoryId });
    await assertModelNameFree(client, { makeId, categoryId, modelName, makeName: make.name, categoryName: category.name });
    const sortOrder = (await client.query("SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM vehicle_models")).rows[0].n;
    const { id } = (
      await client.query(
        `INSERT INTO vehicle_models (make_id, category_id, subcategory_id, name, is_ev, discontinued, sort_order, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [makeId, categoryId, subcategoryId, modelName, isEv, discontinued, sortOrder, actor.name || actor.email || null]
      )
    ).rows[0];
    await audit(client, actor, "vehicle_catalog.model_created", {
      id,
      brand: make.name,
      name: modelName,
      category: category.name,
      subcategory: subcategory?.name || null,
      isEv,
      discontinued,
    });
    return { id };
  });
};

export const updateModel = async (id, input, actor) => {
  const changes = {};
  if (input.name !== undefined) changes.name = name(input.name, "Model name");
  if (input.makeId !== undefined) changes.make_id = v.id(input.makeId, "Brand");
  if (input.categoryId !== undefined) changes.category_id = v.id(input.categoryId, "Category");
  if (input.subcategoryId !== undefined) changes.subcategory_id = optionalId(input.subcategoryId, "Subcategory");
  if (input.isEv !== undefined) changes.is_ev = flag(input.isEv, "isEv");
  if (input.discontinued !== undefined) changes.discontinued = flag(input.discontinued, "discontinued");
  if (input.active !== undefined) changes.active = flag(input.active, "active");
  if (!Object.keys(changes).length) throw v.badRequest("Nothing to update.");

  return withTransaction(async (client) => {
    const before = await one(client, "SELECT * FROM vehicle_models WHERE id = $1 AND tenant_id IS NULL", [id], "Model not found.");
    const after = { ...before, ...changes };
    // Moving to another category drops a subcategory that belonged to the old one.
    if (changes.category_id !== undefined && changes.subcategory_id === undefined && changes.category_id !== before.category_id) {
      after.subcategory_id = null;
      changes.subcategory_id = null;
    }
    const { make, category } = await modelPlacement(client, {
      makeId: after.make_id,
      categoryId: after.category_id,
      subcategoryId: after.subcategory_id,
    });
    if (changes.name || changes.make_id || changes.category_id) {
      await assertModelNameFree(client, {
        makeId: after.make_id,
        categoryId: after.category_id,
        modelName: after.name,
        exceptId: id,
        makeName: make.name,
        categoryName: category.name,
      });
    }
    await updateRow(client, "vehicle_models", id, changes);
    // Only what actually changed (the form sends every field).
    const changed = Object.fromEntries(Object.entries(changes).filter(([column, value]) => before[column] !== value));
    await audit(client, actor, "vehicle_catalog.model_updated", { id, brand: make.name, name: before.name, changes: changed });
    return { id };
  });
};

/* ---------- lender-added models -> master list ---------- */

// Copies a model a lender added into the master list (under a master brand
// of the same name, created if needed), then removes the lender's own copy
// â€” and the lender's own brand once it has no models left â€” so the lender
// sees the master entry instead of a duplicate.
export const promoteLenderModel = async (id, input, actor) => {
  return withTransaction(async (client) => {
    const model = await one(
      client,
      `SELECT m.*, k.name AS make_name, k.tenant_id AS make_tenant_id, t.name AS tenant_name
         FROM vehicle_models m JOIN vehicle_makes k ON k.id = m.make_id JOIN tenants t ON t.id = m.tenant_id
        WHERE m.id = $1 AND m.tenant_id IS NOT NULL`,
      [id],
      "Lender-added model not found."
    );
    const subcategoryId = input.subcategoryId !== undefined ? optionalId(input.subcategoryId, "Subcategory") : model.subcategory_id;

    let make = (await client.query("SELECT * FROM vehicle_makes WHERE tenant_id IS NULL AND lower(name) = lower($1)", [model.make_name])).rows[0];
    let makeCreated = false;
    if (!make) {
      make = (
        await client.query("INSERT INTO vehicle_makes (name, created_by) VALUES ($1, $2) RETURNING *", [model.make_name, actor.name || actor.email || null])
      ).rows[0];
      makeCreated = true;
    }

    const existing = (
      await client.query(
        "SELECT id FROM vehicle_models WHERE tenant_id IS NULL AND make_id = $1 AND category_id = $2 AND lower(name) = lower($3)",
        [make.id, model.category_id, model.name]
      )
    ).rows[0];

    let masterId = existing?.id;
    if (!existing) {
      await modelPlacement(client, { makeId: make.id, categoryId: model.category_id, subcategoryId });
      const sortOrder = (await client.query("SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM vehicle_models")).rows[0].n;
      masterId = (
        await client.query(
          `INSERT INTO vehicle_models (make_id, category_id, subcategory_id, name, is_ev, sort_order, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [make.id, model.category_id, subcategoryId, model.name, model.is_ev, sortOrder, actor.name || actor.email || null]
        )
      ).rows[0].id;
    }

    await client.query("DELETE FROM vehicle_models WHERE id = $1", [id]);
    if (model.make_tenant_id) {
      const left = await client.query("SELECT 1 FROM vehicle_models WHERE make_id = $1 LIMIT 1", [model.make_id]);
      if (!left.rows.length) await client.query("DELETE FROM vehicle_makes WHERE id = $1", [model.make_id]);
    }

    await writeAudit(client, {
      actorId: actor.id,
      action: "vehicle_catalog.model_promoted",
      tenantId: model.tenant_id,
      details: { brand: model.make_name, name: model.name, masterModelId: masterId, alreadyInMaster: Boolean(existing), brandCreated: makeCreated },
    });
    return { id: masterId, alreadyInMaster: Boolean(existing) };
  });
};
