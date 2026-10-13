// src/services/guarantorReferralRepository.js
//
// The Guarantor / Referral register. Documents (Aadhaar and any additional
// ones) are kept in full so they can be viewed; list reads leave the file
// contents out, and a single record read includes them.

import { query, withTransaction } from "../db/connection.js";
import { currentTenantId } from "../db/tenantContext.js";

const pad = (number, length = 5) => String(number).padStart(length, "0");

const iso = (value) => (value ? new Date(value).toISOString() : "");

const httpError = (message, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });

// Largest document accepted, as a data URL (roughly 2 MB of file).
const MAX_DOCUMENT_CHARS = 2_800_000;

// A file as the forms send it: { name, size, type, data: "data:..." }.
const cleanFile = (file) => {
  if (!file || typeof file !== "object") return null;

  const data = typeof file.data === "string" && file.data.startsWith("data:") ? file.data : "";

  if (data.length > MAX_DOCUMENT_CHARS) {
    throw httpError(`"${file.name || "Document"}" is too large. Keep each document under 2 MB.`);
  }

  return { name: String(file.name || ""), size: file.size ?? "", type: String(file.type || ""), data };
};

const withoutData = (file) => (file ? { ...file, data: "" } : null);

const mapRecord = (row, { includeFiles }) => {
  const aadhaarFile = row.aadhaar_file ?? null;
  const additionalDocs = Array.isArray(row.additional_docs) ? row.additional_docs : [];

  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    address: row.address || "",
    area: row.area || "",
    landmark: row.landmark || "",
    pincode: row.pincode || "",
    aadhaarNumber: row.aadhaar_number || "",
    aadhaarFile: includeFiles ? aadhaarFile : withoutData(aadhaarFile),
    additionalDocs: additionalDocs.map((doc) => ({
      ...doc,
      file: includeFiles ? doc.file : withoutData(doc.file),
    })),
    createdBy: row.created_by || "",
    createdAt: iso(row.created_at),
  };
};

export const getGuarantorReferrals = async () => {
  const result = await query("SELECT * FROM guarantor_referrals WHERE tenant_id = $1 ORDER BY pk DESC", [currentTenantId()]);

  return result.rows.map((row) => mapRecord(row, { includeFiles: false }));
};

export const getGuarantorReferralById = async (id) => {
  const result = await query("SELECT * FROM guarantor_referrals WHERE id = $1 AND tenant_id = $2", [id, currentTenantId()]);

  return result.rows[0] ? mapRecord(result.rows[0], { includeFiles: true }) : null;
};

export const createGuarantorReferral = async (input = {}, user) => {
  const fullName = String(input.fullName || "").trim();
  const phone = String(input.phone || "").replace(/\D/g, "");
  const aadhaarNumber = String(input.aadhaarNumber || "").replace(/\D/g, "");

  if (!fullName) throw httpError("Full name is required.");
  if (phone.length < 10) throw httpError("Enter a valid phone number.");
  if (aadhaarNumber && aadhaarNumber.length !== 12) throw httpError("Aadhaar number must be 12 digits.");

  const additionalDocs = (Array.isArray(input.additionalDocs) ? input.additionalDocs : [])
    .filter((doc) => doc?.file)
    .map((doc, index) => ({
      id: String(doc.id || `doc_${index + 1}`),
      title: String(doc.title || "Document").trim() || "Document",
      file: cleanFile(doc.file),
    }));

  const newId = await withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO guarantor_referrals
        (id, full_name, phone, address, area, landmark, pincode, aadhaar_number,
         aadhaar_file, additional_docs, created_by, tenant_id)
       VALUES ('', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING pk`,
      [
        fullName,
        phone,
        String(input.address || "").trim(),
        String(input.area || "").trim(),
        String(input.landmark || "").trim(),
        String(input.pincode || "").trim(),
        aadhaarNumber,
        JSON.stringify(cleanFile(input.aadhaarFile)),
        JSON.stringify(additionalDocs),
        user?.name || "",
        currentTenantId(),
      ]
    );

    const pk = result.rows[0].pk;
    const id = `GR-${pad(pk)}`;

    await client.query("UPDATE guarantor_referrals SET id = $1 WHERE pk = $2", [id, pk]);

    return id;
  });

  return getGuarantorReferralById(newId);
};
