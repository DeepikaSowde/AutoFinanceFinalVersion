// src/services/categoryRepository.js
//
// User-managed category lists for the income/expense forms. Deliberately
// separate from whatever categories already exist on past records, so a
// category can be created before anything uses it.

import { query } from "../db/connection.js";
import { currentTenantId } from "../db/tenantContext.js";

const pad = (number, length = 4) => String(number).padStart(length, "0");

const mapCategory = (row) => ({
  id: row.id,
  type: row.type,
  name: row.name,
  createdAt: row.created_at,
});

const ALLOWED_TYPES = new Set(["income", "expense"]);

const assertType = (type) => {
  if (!ALLOWED_TYPES.has(type)) {
    const error = new Error('Category type must be "income" or "expense".');

    error.statusCode = 400;

    throw error;
  }
};

export const getCategories = async (type) => {
  if (type) {
    assertType(type);

    const result = await query(
      "SELECT * FROM categories WHERE type = $1 AND tenant_id = $2 ORDER BY name ASC",
      [type, currentTenantId()]
    );

    return result.rows.map(mapCategory);
  }

  const result = await query("SELECT * FROM categories WHERE tenant_id = $1 ORDER BY type ASC, name ASC", [currentTenantId()]);

  return result.rows.map(mapCategory);
};

export const addCategory = async (type, name) => {
  assertType(type);

  const cleanName = String(name || "").trim();

  if (!cleanName) {
    const error = new Error("Category name is required.");

    error.statusCode = 400;

    throw error;
  }

  const result = await query(
    `INSERT INTO categories (id, type, name, tenant_id)
     VALUES ('', $1, $2, $3)
     ON CONFLICT (tenant_id, type, name) DO UPDATE SET name = categories.name
     RETURNING pk, id, type, name, created_at`,
    [type, cleanName, currentTenantId()]
  );

  const row = result.rows[0];

  if (!row.id) {
    const id = `CAT-${pad(row.pk)}`;

    await query("UPDATE categories SET id = $1 WHERE pk = $2", [id, row.pk]);

    return { id, type: row.type, name: row.name, createdAt: row.created_at };
  }

  return mapCategory(row);
};

export const deleteCategory = async (categoryId) => {
  const result = await query("DELETE FROM categories WHERE id = $1 AND tenant_id = $2", [categoryId, currentTenantId()]);

  return result.rowCount > 0;
};
