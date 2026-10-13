// src/services/draftRepository.js
//
// Unfinished New Loan applications. The form is stored as-is except for
// uploaded document contents: like submitted loans, only a document's name,
// type and size are kept. The vehicle photo is the exception and is kept in
// full (it is already compressed by the browser).

import { query, withTransaction } from "../db/connection.js";
import { currentTenantId } from "../db/tenantContext.js";

const pad = (number, length = 4) => String(number).padStart(length, "0");

const iso = (value) => (value ? new Date(value).toISOString() : "");

const httpError = (message, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });

// Uploads in the form look like { name, type, size, data: "data:..." }.
const isUpload = (value) =>
  value && typeof value === "object" && typeof value.data === "string" && value.data.startsWith("data:");

const stripUploads = (value, path = "") => {
  if (Array.isArray(value)) {
    return value.map((item, index) => stripUploads(item, `${path}[${index}]`));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (isUpload(value)) {
    return path === "vehicle.photo" ? value : { name: value.name || "", type: value.type || "", size: value.size || 0, data: "" };
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, stripUploads(item, path ? `${path}.${key}` : key)])
  );
};

const mapSummary = (row) => ({
  id: row.id,
  customerName: row.customer_name || "",
  mobileNumber: row.mobile_number || "",
  createdBy: row.created_by || "",
  updatedBy: row.updated_by || "",
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
});

const mapDraft = (row) => ({ ...mapSummary(row), form: row.form ?? {} });

const columnsFrom = (form = {}) => ({
  form: JSON.stringify(stripUploads(form)),
  customerName: String(form.customer?.name || "").trim(),
  mobileNumber: String(form.customer?.mobile || "").trim(),
});

const requireForm = (form) => {
  if (!form || typeof form !== "object" || !form.customer) {
    throw httpError("A New Loan form is required.");
  }
};

export const getDrafts = async () => {
  const result = await query("SELECT * FROM loan_drafts WHERE tenant_id = $1 ORDER BY updated_at DESC", [currentTenantId()]);

  return result.rows.map(mapSummary);
};

export const getDraftById = async (draftId) => {
  const result = await query("SELECT * FROM loan_drafts WHERE id = $1 AND tenant_id = $2", [draftId, currentTenantId()]);

  return result.rows[0] ? mapDraft(result.rows[0]) : null;
};

export const createDraft = async (form, user) => {
  requireForm(form);
  const values = columnsFrom(form);

  const draftId = await withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO loan_drafts (id, form, customer_name, mobile_number, created_by, updated_by, tenant_id)
       VALUES ('', $1, $2, $3, $4, $4, $5)
       RETURNING pk`,
      [values.form, values.customerName, values.mobileNumber, user?.name || "", currentTenantId()]
    );

    const pk = result.rows[0].pk;
    const id = `DRF-${pad(pk)}`;

    await client.query("UPDATE loan_drafts SET id = $1 WHERE pk = $2", [id, pk]);

    return id;
  });

  return getDraftById(draftId);
};

export const updateDraft = async (draftId, form, user) => {
  requireForm(form);
  const values = columnsFrom(form);

  const result = await query(
    `UPDATE loan_drafts
     SET form = $2, customer_name = $3, mobile_number = $4, updated_by = $5, updated_at = now()
     WHERE id = $1 AND tenant_id = $6`,
    [draftId, values.form, values.customerName, values.mobileNumber, user?.name || "", currentTenantId()]
  );

  return result.rowCount ? getDraftById(draftId) : null;
};

export const deleteDraft = async (draftId) => {
  const result = await query("DELETE FROM loan_drafts WHERE id = $1 AND tenant_id = $2", [draftId, currentTenantId()]);

  return result.rowCount > 0;
};
