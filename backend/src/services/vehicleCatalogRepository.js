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

import { query } from "../db/connection.js";
import { currentTenantId } from "../db/tenantContext.js";

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

  const dropHidden = ({ hidden: _hidden, ...rest }) => rest;

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
