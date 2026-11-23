// src/services/vehicleCatalogRepository.js
//
// The vehicle catalog a lender's New Loan form offers:
// Category -> Subcategory -> Brand -> Model (migration 028).
//
//   master rows (tenant_id NULL)  - the super admin's list, seen by every lender
//   lender rows (tenant_id = me)  - brands/models this lender added for itself
//   vehicle_catalog_hidden        - what this lender's admin switched off
//
// Hiding a category, subcategory or brand hides every model under it.
// Loans still store plain text (vehicles.vehicle_type / brand / model), so the
// catalog only shapes the choices; it never rewrites existing records.

import { query, withTransaction } from "../db/connection.js";
import { currentTenantId } from "../db/tenantContext.js";
import * as v from "../superadmin/validate.js";

const byOrder = (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

// The current lender's catalog. With includeHidden every entry is returned
// with a `hidden` flag (for the lender admin's settings screen); without it
// hidden entries are left out (what staff see in New Loan). Inactive master
// rows are always left out.
export const getVehicleCatalog = async ({ includeHidden = false } = {}) => {
  const tenantId = currentTenantId();

  const [categories, subcategories, makes, models, hidden] = await Promise.all([
    query("SELECT id, name, sort_order FROM vehicle_categories WHERE active"),
    query("SELECT id, category_id, name, sort_order FROM vehicle_subcategories WHERE active"),
    query(
      `SELECT id, name, tenant_id FROM vehicle_makes
        WHERE active AND (tenant_id IS NULL OR tenant_id = $1)`,
      [tenantId]
    ),
    query(
      `SELECT id, make_id, category_id, subcategory_id, name, is_ev, discontinued, sort_order, tenant_id
         FROM vehicle_models
        WHERE active AND (tenant_id IS NULL OR tenant_id = $1)`,
      [tenantId]
    ),
    query("SELECT kind, ref_id FROM vehicle_catalog_hidden WHERE tenant_id = $1", [tenantId]),
  ]);

  const hiddenIds = { category: new Set(), subcategory: new Set(), make: new Set(), model: new Set() };
  for (const row of hidden.rows) hiddenIds[row.kind]?.add(row.ref_id);

  const categoryList = categories.rows
    .map((row) => ({ id: row.id, name: row.name, sortOrder: row.sort_order, hidden: hiddenIds.category.has(row.id) }))
    .sort(byOrder);
  const categoryIds = new Set(categoryList.map((row) => row.id));

  const subcategoryList = subcategories.rows
    .filter((row) => categoryIds.has(row.category_id))
    .map((row) => ({
      id: row.id,
      categoryId: row.category_id,
      name: row.name,
      sortOrder: row.sort_order,
      hidden: hiddenIds.subcategory.has(row.id) || hiddenIds.category.has(row.category_id),
      // switched off itself (not just through its category)
      hiddenSelf: hiddenIds.subcategory.has(row.id),
    }))
    .sort(byOrder);
  const subcategoryById = new Map(subcategoryList.map((row) => [row.id, row]));

  const makeList = makes.rows
    .map((row) => ({ id: row.id, name: row.name, custom: row.tenant_id !== null, hidden: hiddenIds.make.has(row.id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const makeById = new Map(makeList.map((row) => [row.id, row]));

  const modelList = models.rows
    .filter((row) => categoryIds.has(row.category_id) && makeById.has(row.make_id))
    // a subcategory switched off by the super admin takes its models with it
    .filter((row) => row.subcategory_id === null || subcategoryById.has(row.subcategory_id))
    .map((row) => ({
      id: row.id,
      makeId: row.make_id,
      categoryId: row.category_id,
      subcategoryId: row.subcategory_id,
      name: row.name,
      isEv: row.is_ev,
      discontinued: row.discontinued,
      custom: row.tenant_id !== null,
      sortOrder: row.sort_order,
      hidden:
        hiddenIds.model.has(row.id) ||
        hiddenIds.make.has(row.make_id) ||
        hiddenIds.category.has(row.category_id) ||
        Boolean(row.subcategory_id && subcategoryById.get(row.subcategory_id).hidden),
      hiddenSelf: hiddenIds.model.has(row.id),
    }))
    .sort(byOrder);

  const strip = ({ sortOrder, ...rest }) => rest;

  if (includeHidden) {
    return {
      categories: categoryList.map((category) => ({
        ...strip(category),
        subcategories: subcategoryList.filter((sub) => sub.categoryId === category.id).map(strip),
      })),
      makes: makeList,
      models: modelList.map(strip),
    };
  }

  const visibleModels = modelList.filter((model) => !model.hidden);
  // A brand is offered when it has a visible model, or is the lender's own
  // brand (so a brand added before its first model still shows).
  const makesWithModels = new Set(visibleModels.map((model) => model.makeId));
  const visibleMakes = makeList.filter((make) => !make.hidden && (makesWithModels.has(make.id) || make.custom));

  const dropHidden = ({ hidden: _hidden, hiddenSelf: _hiddenSelf, ...rest }) => rest;

  return {
    categories: categoryList
      .filter((category) => !category.hidden)
      .map((category) => ({
        ...dropHidden(strip(category)),
        subcategories: subcategoryList
          .filter((sub) => sub.categoryId === category.id && !sub.hidden)
          .map((sub) => dropHidden(strip(sub))),
      })),
    makes: visibleMakes.map(dropHidden),
    models: visibleModels.map((model) => dropHidden(strip(model))),
  };
};

/* =========================================================
   LENDER ADMIN: Settings -> Vehicle Catalog
   Switch entries off/on for this lender's staff, and add the
   lender's own brands/models (seen by this lender only).
========================================================= */

const KIND_TABLES = {
  category: "vehicle_categories",
  subcategory: "vehicle_subcategories",
  make: "vehicle_makes",
  model: "vehicle_models",
};

const NAME_MAX = 80;
const cleanName = (value, label) => v.text(value, label, { required: true, max: NAME_MAX });
const optionalId = (value, label) => (value === null || value === undefined || value === "" ? null : v.id(value, label));

// An entry this lender can see: master rows, or its own brands/models.
const visibleRow = async (client, kind, id, tenantId) => {
  const table = KIND_TABLES[kind];
  const ownable = kind === "make" || kind === "model";
  const row = (
    await client.query(
      `SELECT * FROM ${table} WHERE id = $1 ${ownable ? "AND (tenant_id IS NULL OR tenant_id = $2)" : ""}`,
      ownable ? [id, tenantId] : [id]
    )
  ).rows[0];
  if (!row) throw v.notFound("That catalog entry was not found.");
  return row;
};

// { kind: "category" | "subcategory" | "make" | "model", id, hidden: true/false },
// or { items: [ ...those ] } to change several at once (e.g. every model of
// one brand in one category).
export const setCatalogEntryHidden = async (input = {}, actorName = "") => {
  const raw = Array.isArray(input.items) ? input.items : [input];
  if (!raw.length || raw.length > 1000) throw v.badRequest("Send 1 to 1000 entries.");
  const items = raw.map((item) => {
    if (typeof item?.hidden !== "boolean") throw v.badRequest("hidden must be true or false.");
    return { kind: v.oneOf(item.kind, "kind", Object.keys(KIND_TABLES)), id: v.id(item.id, "id"), hidden: item.hidden };
  });
  const tenantId = currentTenantId();

  await withTransaction(async (client) => {
    for (const { kind, id, hidden } of items) {
      await visibleRow(client, kind, id, tenantId);
      if (hidden) {
        await client.query(
          `INSERT INTO vehicle_catalog_hidden (tenant_id, kind, ref_id, hidden_by) VALUES ($1, $2, $3, $4)
           ON CONFLICT (tenant_id, kind, ref_id) DO NOTHING`,
          [tenantId, kind, id, actorName || null]
        );
      } else {
        await client.query("DELETE FROM vehicle_catalog_hidden WHERE tenant_id = $1 AND kind = $2 AND ref_id = $3", [tenantId, kind, id]);
      }
    }
  });
  return getVehicleCatalog({ includeHidden: true });
};

// The category and (optional) subcategory, checked to belong together.
const placement = async (client, categoryId, subcategoryId) => {
  const category = (await client.query("SELECT * FROM vehicle_categories WHERE id = $1 AND active", [categoryId])).rows[0];
  if (!category) throw v.notFound("Category not found.");
  if (subcategoryId) {
    const sub = (await client.query("SELECT * FROM vehicle_subcategories WHERE id = $1 AND active", [subcategoryId])).rows[0];
    if (!sub) throw v.notFound("Subcategory not found.");
    if (sub.category_id !== categoryId) throw v.badRequest(`${sub.name} is not a ${category.name} subcategory.`);
  }
  return category;
};

// A model already in this lender's list (master or own) with this brand + model name.
const assertNotListed = async (client, { tenantId, makeName, categoryId, modelName, exceptId = 0, categoryName }) => {
  const found = (
    await client.query(
      `SELECT m.id, m.tenant_id, m.name, k.name AS make_name,
              EXISTS (SELECT 1 FROM vehicle_catalog_hidden h WHERE h.tenant_id = $1 AND h.kind = 'model' AND h.ref_id = m.id) AS hidden
         FROM vehicle_models m JOIN vehicle_makes k ON k.id = m.make_id
        WHERE (m.tenant_id IS NULL OR m.tenant_id = $1) AND m.active
          AND m.category_id = $2 AND lower(k.name) = lower($3) AND lower(m.name) = lower($4) AND m.id <> $5`,
      [tenantId, categoryId, makeName, modelName, exceptId]
    )
  ).rows[0];
  if (!found) return;
  const label = `${found.make_name} ${found.name}`;
  if (found.tenant_id === null && found.hidden) {
    throw v.conflict(`${label} is already in the ${categoryName} list but switched off. Switch it on instead.`);
  }
  throw v.conflict(`${label} is already in the ${categoryName} list.`);
};

// The brand for a new model: an existing master/own brand by id, or by name
// (a master brand of that name is used; otherwise this lender's own brand,
// created if needed).
const brandFor = async (client, tenantId, { makeId, brandName }, actorName) => {
  if (makeId) return visibleRow(client, "make", makeId, tenantId);
  const wanted = cleanName(brandName, "Brand name");
  const existing = (
    await client.query(
      `SELECT * FROM vehicle_makes WHERE lower(name) = lower($1) AND (tenant_id IS NULL OR tenant_id = $2)
        ORDER BY tenant_id NULLS FIRST LIMIT 1`,
      [wanted, tenantId]
    )
  ).rows[0];
  if (existing) return existing;
  return (
    await client.query("INSERT INTO vehicle_makes (tenant_id, name, created_by) VALUES ($1, $2, $3) RETURNING *", [
      tenantId,
      wanted,
      actorName || null,
    ])
  ).rows[0];
};

// { categoryId, subcategoryId?, makeId? | brandName?, name, isEv? }
export const addOwnModel = async (input = {}, actorName = "") => {
  const tenantId = currentTenantId();
  const categoryId = v.id(input.categoryId, "Category");
  const subcategoryId = optionalId(input.subcategoryId, "Subcategory");
  const makeId = optionalId(input.makeId, "Brand");
  const modelName = cleanName(input.name, "Model name");
  if (input.isEv !== undefined && typeof input.isEv !== "boolean") throw v.badRequest("isEv must be true or false.");
  if (!makeId && !String(input.brandName || "").trim()) throw v.badRequest("Pick a brand or type a new brand name.");

  await withTransaction(async (client) => {
    const category = await placement(client, categoryId, subcategoryId);
    const make = await brandFor(client, tenantId, { makeId, brandName: input.brandName }, actorName);
    await assertNotListed(client, { tenantId, makeName: make.name, categoryId, modelName, categoryName: category.name });
    await client.query(
      `INSERT INTO vehicle_models (tenant_id, make_id, category_id, subcategory_id, name, is_ev, created_by, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1000000)`,
      [tenantId, make.id, categoryId, subcategoryId, modelName, Boolean(input.isEv), actorName || null]
    );
  });
  return getVehicleCatalog({ includeHidden: true });
};

const ownModel = async (client, id, tenantId) => {
  const row = (
    await client.query(
      `SELECT m.*, k.name AS make_name FROM vehicle_models m JOIN vehicle_makes k ON k.id = m.make_id
        WHERE m.id = $1 AND m.tenant_id = $2`,
      [id, tenantId]
    )
  ).rows[0];
  if (!row) throw v.notFound("Only models your company added can be changed here.");
  return row;
};

// { name?, subcategoryId?, isEv? } on a model this lender added.
export const updateOwnModel = async (id, input = {}) => {
  const tenantId = currentTenantId();
  const modelId = v.id(id, "Model");
  const changes = {};
  if (input.name !== undefined) changes.name = cleanName(input.name, "Model name");
  if (input.subcategoryId !== undefined) changes.subcategory_id = optionalId(input.subcategoryId, "Subcategory");
  if (input.isEv !== undefined) {
    if (typeof input.isEv !== "boolean") throw v.badRequest("isEv must be true or false.");
    changes.is_ev = input.isEv;
  }
  if (!Object.keys(changes).length) throw v.badRequest("Nothing to update.");

  await withTransaction(async (client) => {
    const before = await ownModel(client, modelId, tenantId);
    const subcategoryId = "subcategory_id" in changes ? changes.subcategory_id : before.subcategory_id;
    const category = await placement(client, before.category_id, subcategoryId);
    if (changes.name) {
      await assertNotListed(client, {
        tenantId,
        makeName: before.make_name,
        categoryId: before.category_id,
        modelName: changes.name,
        exceptId: modelId,
        categoryName: category.name,
      });
    }
    const columns = Object.keys(changes);
    await client.query(
      `UPDATE vehicle_models SET ${columns.map((c, i) => `${c} = $${i + 2}`).join(", ")}, updated_at = now() WHERE id = $1`,
      [modelId, ...columns.map((c) => changes[c])]
    );
  });
  return getVehicleCatalog({ includeHidden: true });
};

// Removes a model this lender added (loans keep their saved text), and the
// lender's own brand once it has no models left.
export const deleteOwnModel = async (id) => {
  const tenantId = currentTenantId();
  const modelId = v.id(id, "Model");
  await withTransaction(async (client) => {
    const before = await ownModel(client, modelId, tenantId);
    await client.query("DELETE FROM vehicle_models WHERE id = $1", [modelId]);
    await client.query("DELETE FROM vehicle_catalog_hidden WHERE tenant_id = $1 AND kind = 'model' AND ref_id = $2", [tenantId, modelId]);
    const make = (await client.query("SELECT tenant_id FROM vehicle_makes WHERE id = $1", [before.make_id])).rows[0];
    if (make && Number(make.tenant_id) === Number(tenantId)) {
      const left = await client.query("SELECT 1 FROM vehicle_models WHERE make_id = $1 LIMIT 1", [before.make_id]);
      if (!left.rows.length) {
        await client.query("DELETE FROM vehicle_makes WHERE id = $1", [before.make_id]);
        await client.query("DELETE FROM vehicle_catalog_hidden WHERE tenant_id = $1 AND kind = 'make' AND ref_id = $2", [tenantId, before.make_id]);
      }
    }
  });
  return getVehicleCatalog({ includeHidden: true });
};
