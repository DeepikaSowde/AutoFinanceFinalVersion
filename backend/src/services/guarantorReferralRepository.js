// src/services/guarantorReferralRepository.js
//
// The Guarantor / Referral register. Documents (Aadhaar and any additional
// ones) are kept in full so they can be viewed; list reads leave the file
// contents out, and a single record read includes them. Every record comes
// with the loans the person guaranteed or referred and their commissions.

import { query, withTransaction } from "../db/connection.js";
import { currentTenantId } from "../db/tenantContext.js";
import { getReferrals, insertCommission } from "./referralRepository.js";

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

/* ---------- loans each person guaranteed or referred ---------- */

// Last ten digits, so "+91 98765-43210" and "9876543210" are the same number.
const normalizePhone = (value) => String(value || "").replace(/\D/g, "").slice(-10);

const PHONE_SQL = (column) => `right(regexp_replace(coalesce(${column}, ''), '\\D', '', 'g'), 10)`;

// Links recorded from New Loan, plus guarantors entered on a customer before
// links existed (matched to the register by the id it was picked with, or by
// phone number).
const loadRelationships = async (personPk) => {
  const params = [currentTenantId()];
  const onePerson = personPk ? (params.push(personPk), "AND gr.pk = $2") : "";

  const [links, legacy] = await Promise.all([
    query(
      `SELECT gr.pk AS person_pk, l.pk AS link_pk, l.link_type, l.associated_at,
              c.id AS customer_id, c.personal->>'name' AS customer_name, ln.id AS loan_id
       FROM guarantor_referral_links l
       JOIN guarantor_referrals gr ON gr.pk = l.person_pk
       LEFT JOIN customers c ON c.pk = l.customer_pk
       LEFT JOIN loans ln ON ln.pk = l.loan_pk
       WHERE l.tenant_id = $1 ${onePerson}
       ORDER BY l.associated_at ASC, l.pk ASC`,
      params
    ),
    query(
      `SELECT gr.pk AS person_pk, c.id AS customer_id, c.personal->>'name' AS customer_name,
              ln.id AS loan_id, ln.created_at AS associated_at
       FROM guarantors g
       JOIN customers c ON c.pk = g.customer_pk
       JOIN loans ln ON ln.customer_pk = c.pk
       JOIN guarantor_referrals gr ON gr.tenant_id = c.tenant_id
        AND (gr.id = g.personal->>'guarantorId'
             OR (length(${PHONE_SQL("g.personal->>'mobileNumber'")}) = 10
                 AND ${PHONE_SQL("g.personal->>'mobileNumber'")} = ${PHONE_SQL("gr.phone")}))
       WHERE g.has_guarantor AND c.tenant_id = $1 ${onePerson}
       ORDER BY ln.created_at ASC`,
      params
    ),
  ]);

  const byPerson = new Map();
  const add = (row, type, id) => {
    const list = byPerson.get(row.person_pk) || [];
    if (list.some((rel) => rel.type === type && rel.loanId === row.loan_id)) return;
    list.push({
      id,
      type,
      customerId: row.customer_id || "",
      customerName: row.customer_name || "",
      loanId: row.loan_id || "",
      associatedDate: iso(row.associated_at),
    });
    byPerson.set(row.person_pk, list);
  };

  links.rows.forEach((row) => add(row, row.link_type, `LINK-${row.link_pk}`));
  legacy.rows.forEach((row) => add(row, "Guarantor", `CUST-${row.customer_id}-${row.loan_id}`));

  return byPerson;
};

const loadCommissions = async (personPk) => {
  const byPerson = new Map();

  (await getReferrals(personPk ? { personPk } : {})).forEach((commission) => {
    if (commission.personId) byPerson.set(commission.personId, [...(byPerson.get(commission.personId) || []), commission]);
  });

  return byPerson;
};

const withHistory = (row, { includeFiles }, relationships, commissions) => {
  const commissionsOf = commissions.get(row.id) || [];

  return {
    ...mapRecord(row, { includeFiles }),
    relationships: (relationships.get(row.pk) || []).map((rel) => {
      const commission = rel.type === "Referral" ? commissionsOf.find((c) => c.loanId === rel.loanId) : null;
      return commission
        ? {
            ...rel,
            commissionId: commission.id,
            commissionAmount: Number(commission.amount) || 0,
            commissionPercentage: Number(commission.percentage) || 0,
            commissionStatus: commission.status,
          }
        : rel;
    }),
    commissions: commissionsOf,
  };
};

export const getGuarantorReferrals = async () => {
  const [result, relationships, commissions] = await Promise.all([
    query("SELECT * FROM guarantor_referrals WHERE tenant_id = $1 ORDER BY pk DESC", [currentTenantId()]),
    loadRelationships(),
    loadCommissions(),
  ]);

  return result.rows.map((row) => withHistory(row, { includeFiles: false }, relationships, commissions));
};

export const getGuarantorReferralById = async (id) => {
  const result = await query("SELECT * FROM guarantor_referrals WHERE id = $1 AND tenant_id = $2", [id, currentTenantId()]);
  const row = result.rows[0];

  if (!row) return null;

  const [relationships, commissions] = await Promise.all([loadRelationships(row.pk), loadCommissions(row.pk)]);

  return withHistory(row, { includeFiles: true }, relationships, commissions);
};

/* ---------- adding people ---------- */

const cleanDocs = (docs) =>
  (Array.isArray(docs) ? docs : [])
    .filter((doc) => doc?.file)
    .map((doc, index) => ({
      id: String(doc.id || `doc_${index + 1}`),
      title: String(doc.title || "Document").trim() || "Document",
      file: cleanFile(doc.file),
    }));

const cleanPerson = (input = {}) => {
  const fullName = String(input.fullName || input.name || "").trim();
  // Kept as the 10-digit mobile number, without a country code.
  const phone = normalizePhone(input.phone || input.mobile);
  const aadhaarNumber = String(input.aadhaarNumber || input.aadhaarNo || "").replace(/\D/g, "");

  if (aadhaarNumber && aadhaarNumber.length !== 12) throw httpError("Aadhaar number must be 12 digits.");

  return {
    fullName,
    phone,
    address: String(input.address || "").trim(),
    area: String(input.area || "").trim(),
    landmark: String(input.landmark || "").trim(),
    pincode: String(input.pincode || "").trim(),
    aadhaarNumber,
    aadhaarFile: cleanFile(input.aadhaarFile),
    additionalDocs: cleanDocs(input.additionalDocs),
  };
};

const insertPerson = async (client, person, user) => {
  if (!person.fullName) throw httpError("Full name is required.");
  if (person.phone.length < 10) throw httpError("Enter a valid phone number.");

  const result = await client.query(
    `INSERT INTO guarantor_referrals
      (id, full_name, phone, address, area, landmark, pincode, aadhaar_number,
       aadhaar_file, additional_docs, created_by, tenant_id)
     VALUES ('', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING pk`,
    [
      person.fullName,
      person.phone,
      person.address,
      person.area,
      person.landmark,
      person.pincode,
      person.aadhaarNumber,
      JSON.stringify(person.aadhaarFile),
      JSON.stringify(person.additionalDocs),
      user?.name || "",
      currentTenantId(),
    ]
  );

  const pk = result.rows[0].pk;
  const id = `GR-${pad(pk)}`;

  await client.query("UPDATE guarantor_referrals SET id = $1 WHERE pk = $2", [id, pk]);

  return { pk, id };
};

export const createGuarantorReferral = async (input = {}, user) => {
  const person = cleanPerson(input);
  const { id } = await withTransaction((client) => insertPerson(client, person, user));

  return getGuarantorReferralById(id);
};

/*
 * The register person a loan form refers to: the record it was picked from
 * (by id), else the same phone number, else the same Aadhaar, else the same
 * name when no phone was given.
 */
const findPerson = async (client, input, person) => {
  const tenantId = currentTenantId();
  const pickedId = String(input.referralId || input.guarantorId || input.id || "").trim();
  const attempts = [];

  if (pickedId) attempts.push(["id = $2", pickedId]);
  if (normalizePhone(person.phone).length === 10) attempts.push([`${PHONE_SQL("phone")} = $2`, normalizePhone(person.phone)]);
  if (person.aadhaarNumber.length === 12) attempts.push(["aadhaar_number = $2", person.aadhaarNumber]);
  if (person.fullName && !person.phone) attempts.push(["lower(trim(full_name)) = lower($2)", person.fullName]);

  for (const [condition, value] of attempts) {
    const result = await client.query(
      `SELECT * FROM guarantor_referrals WHERE tenant_id = $1 AND ${condition} ORDER BY pk ASC LIMIT 1 FOR UPDATE`,
      [tenantId, value]
    );
    if (result.rows[0]) return result.rows[0];
  }

  return null;
};

// Fills in details the loan form added; keeps what is on file otherwise.
const mergePerson = async (client, row, person) => {
  await client.query(
    `UPDATE guarantor_referrals SET
       address = COALESCE(NULLIF($2, ''), address),
       area = COALESCE(NULLIF($3, ''), area),
       landmark = COALESCE(NULLIF($4, ''), landmark),
       pincode = COALESCE(NULLIF($5, ''), pincode),
       aadhaar_number = COALESCE(NULLIF($6, ''), aadhaar_number),
       aadhaar_file = COALESCE($7::jsonb, aadhaar_file),
       additional_docs = COALESCE($8::jsonb, additional_docs)
     WHERE pk = $1`,
    [
      row.pk,
      person.address,
      person.area,
      person.landmark,
      person.pincode,
      person.aadhaarNumber,
      person.aadhaarFile?.data ? JSON.stringify(person.aadhaarFile) : null,
      person.additionalDocs.some((doc) => doc.file?.data) ? JSON.stringify(person.additionalDocs) : null,
    ]
  );
};

const findLoan = async (client, customerId, loanId) => {
  const result = await client.query(
    `SELECT l.pk AS loan_pk, l.id AS loan_id, l.loan_number, l.loan_amount,
            c.pk AS customer_pk, c.id AS customer_id, c.personal->>'name' AS customer_name
     FROM loans l JOIN customers c ON c.pk = l.customer_pk
     WHERE l.id = $1 AND l.tenant_id = $2`,
    [loanId, currentTenantId()]
  );
  const loan = result.rows[0];

  if (!loan || (customerId && loan.customer_id !== customerId)) throw httpError("Loan not found.", 404);

  return loan;
};

const commissionAmountOf = (commission, loanAmount) => {
  const amount = Number(commission.amount) || 0;
  const percentage = Number(commission.percentage) || 0;

  if (amount > 0) return amount;
  if (percentage > 0 && Number(loanAmount) > 0) return Math.round((Number(loanAmount) * percentage) / 100);
  return 0;
};

/*
 * Records that a person guaranteed or referred a loan, adding them to the
 * register first if they are new. For a referral, also records the
 * commission (and its expense, when paid now). One transaction; calling it
 * again for the same person, loan and role changes nothing.
 *
 * input: { person, type: "Guarantor" | "Referral", customerId, loanId,
 *          commission: { amount, percentage, pay, paymentMode } }
 */
export const linkPersonToLoan = async (input = {}, user) => {
  const type = input.type === "Referral" ? "Referral" : input.type === "Guarantor" ? "Guarantor" : null;

  if (!type) throw httpError('type must be "Guarantor" or "Referral".');
  if (!input.loanId) throw httpError("loanId is required.");

  const person = cleanPerson(input.person || {});

  const personId = await withTransaction(async (client) => {
    const loan = await findLoan(client, input.customerId, input.loanId);
    let row = await findPerson(client, input.person || {}, person);
    let ref;

    if (row) {
      await mergePerson(client, row, person);
      ref = { pk: row.pk, id: row.id };
    } else {
      ref = await insertPerson(client, person, user);
    }

    await client.query(
      `INSERT INTO guarantor_referral_links (tenant_id, person_pk, link_type, customer_pk, loan_pk)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (person_pk, link_type, loan_pk) DO NOTHING`,
      [currentTenantId(), ref.pk, type, loan.customer_pk, loan.loan_pk]
    );

    if (type === "Referral") {
      const commission = input.commission || {};
      const amount = commissionAmountOf(commission, loan.loan_amount);
      const already = await client.query(
        "SELECT 1 FROM referral_commissions WHERE tenant_id = $1 AND person_pk = $2 AND loan_pk = $3",
        [currentTenantId(), ref.pk, loan.loan_pk]
      );

      if (amount > 0 && !already.rows[0]) {
        await insertCommission(
          client,
          {
            agentName: row?.full_name || person.fullName,
            agentType: "Referral",
            agentPhone: row?.phone || person.phone,
            customerName: loan.customer_name,
            loanNumber: loan.loan_id,
            loanAmount: loan.loan_amount,
            percentage: commission.percentage,
            amount,
            paid: commission.pay === true,
            paymentMode: commission.paymentMode,
            remarks: commission.pay === true
              ? `Referral commission paid on loan creation (${commission.paymentMode || "Cash"}) for loan ${loan.loan_id}`
              : `Referral commission for loan ${loan.loan_id}`,
          },
          { personPk: ref.pk, personId: ref.id, customerPk: loan.customer_pk, customerId: loan.customer_id, loanPk: loan.loan_pk }
        );
      }
    }

    return ref.id;
  });

  return getGuarantorReferralById(personId);
};

/*
 * A further commission for a person, from their page in the register. It is
 * booked as paid, with its expense, on the given date. The loan is optional.
 */
export const addPersonCommission = async (personId, input = {}) => {
  await withTransaction(async (client) => {
    const found = await client.query("SELECT * FROM guarantor_referrals WHERE id = $1 AND tenant_id = $2", [
      personId,
      currentTenantId(),
    ]);
    const row = found.rows[0];

    if (!row) throw httpError("Guarantor / referral not found.", 404);

    const loan = input.loanId ? await findLoan(client, input.customerId, input.loanId) : null;

    await insertCommission(
      client,
      {
        agentName: row.full_name,
        agentType: "Referral",
        agentPhone: row.phone,
        customerName: loan?.customer_name || input.customerName || "",
        loanNumber: loan?.loan_id || "",
        loanAmount: loan?.loan_amount,
        amount: input.amount,
        commissionDate: input.date,
        paid: true,
        paidDate: input.date,
        paymentMode: input.paymentMode || "Cash",
        remarks: input.notes || "",
      },
      {
        personPk: row.pk,
        personId: row.id,
        customerPk: loan?.customer_pk,
        customerId: loan?.customer_id,
        loanPk: loan?.loan_pk,
      }
    );
  });

  return getGuarantorReferralById(personId);
};
