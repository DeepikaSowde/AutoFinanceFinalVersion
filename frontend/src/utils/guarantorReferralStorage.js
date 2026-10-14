/**
 * motoLend Guarantor & Referral register — shared state for the pages that
 * use it, backed by the API.
 *
 * The register lives in the database. This module keeps the last copy
 * loaded from the API so lookups (by mobile number, the Fetch popup) answer
 * immediately, and fires UPDATE_EVENT_NAME whenever a fresh copy arrives.
 * Writes go to the API and then refresh the copy.
 *
 * Records in the copy come without document contents; use
 * loadGuarantorReferralRecord(id) to get one with its documents.
 */

import { DATA_CHANGED_EVENT, apiGet, apiPost, apiPut } from "../services/api";

export const UPDATE_EVENT_NAME = "motoLendGuarantorReferralsUpdated";

/**
 * Normalizes phone numbers by stripping all non-digit characters
 * and returning the standard 10-digit mobile number.
 * Handles spaces, dashes, leading 0, and country code (+91).
 */
export const normalizePhone = (phone) => {
  if (!phone) return "";
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits;
};

/* ---------- the loaded copy ---------- */

let records = [];
let loading = null;
let loadedOnce = false;

const announce = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(UPDATE_EVENT_NAME));
  }
};

/**
 * Reloads the register from the API. Resolves with the records; concurrent
 * calls share one request.
 */
export const refreshGuarantorReferralRecords = () => {
  if (!loading) {
    loading = apiGet("/guarantor-referrals")
      .then((list) => {
        records = Array.isArray(list) ? list : [];
        loadedOnce = true;
        announce();
        return records;
      })
      .finally(() => {
        loading = null;
      });
  }
  return loading;
};

// Any save anywhere in the app may have touched the register.
if (typeof window !== "undefined") {
  window.addEventListener(DATA_CHANGED_EVENT, () => {
    if (loadedOnce) refreshGuarantorReferralRecords().catch(() => {});
  });
}

/**
 * The register as last loaded. The first call starts loading it; listeners
 * of UPDATE_EVENT_NAME hear when it arrives.
 */
export const getGuarantorReferralRecords = () => {
  if (!loadedOnce && !loading) {
    refreshGuarantorReferralRecords().catch((error) => {
      console.error("Failed to load guarantor/referral records:", error);
    });
  }
  return records;
};

/** One record with its documents, relationships and commissions. */
export const loadGuarantorReferralRecord = (id) => apiGet(`/guarantor-referrals/${id}`);

/** Adds a person to the register; the server assigns the GR-xxxxx id. */
export const createGuarantorReferralRecord = async (record) => {
  const created = await apiPost("/guarantor-referrals", record);
  await refreshGuarantorReferralRecords().catch(() => {});
  return created;
};

/**
 * Finds all matching records by normalized mobile number.
 * Returns an array of matches to handle potential duplicates/ambiguities cleanly.
 */
export const findRecordsByMobile = (mobile) => {
  const targetClean = normalizePhone(mobile);
  if (!targetClean || targetClean.length < 10) return [];

  return getGuarantorReferralRecords().filter((r) => normalizePhone(r.phone) === targetClean);
};

/* ---------- loans and commissions ---------- */

/**
 * Records that a person guaranteed or referred a loan (adding them to the
 * register if new) and, for a referral, its commission — booked as an
 * expense when paid now. Resolves with the person's record.
 *
 * @param {Object} params
 * @param {Object} params.person - The person form details
 * @param {"Guarantor"|"Referral"} params.type - Relationship type
 * @param {string} params.customerId - Saved customer ID
 * @param {string} params.loanId - Saved loan ID
 */
export const recordPersonRelationship = async ({
  person,
  type = "Guarantor",
  customerId,
  loanId,
  commissionAmount,
  commissionPercentage,
  payCommission,
  paymentMode,
}) => {
  if (!person) return null;

  const rawName = (person.fullName || person.name || "").trim();
  const rawPhone = person.phone || person.mobile || "";
  if (!rawName && !normalizePhone(rawPhone)) return null;

  const isReferral = type === "Referral";
  const pick = (value, fallback) => (value !== undefined && value !== null && value !== "" ? value : fallback);

  const saved = await apiPost("/guarantor-referrals/link", {
    type,
    customerId,
    loanId,
    person: {
      id: person.referralId || person.guarantorId || person.id || "",
      fullName: rawName,
      phone: rawPhone,
      address: person.address || "",
      area: person.area || "",
      landmark: person.landmark || "",
      pincode: person.pincode || "",
      aadhaarNumber: person.aadhaarNumber || person.aadhaarNo || "",
      aadhaarFile: person.aadhaarFile || null,
      additionalDocs: Array.isArray(person.additionalDocs) ? person.additionalDocs : [],
    },
    commission: isReferral
      ? {
          amount: Number(pick(commissionAmount, person.commissionAmount)) || 0,
          percentage: Number(pick(commissionPercentage, person.commissionPercentage)) || 0,
          pay: payCommission === true || person.payCommission === true,
          paymentMode: paymentMode || person.paymentMode || "Cash",
        }
      : undefined,
  });

  await refreshGuarantorReferralRecords().catch(() => {});
  return saved;
};

/**
 * Pays a pending referral commission; the server books the expense.
 */
export const markReferralCommissionPaid = async ({ commissionId, paidDate, paymentMode, notes }) => {
  const paid = await apiPost(`/referrals/${commissionId}/pay`, {
    paidDate: paidDate || new Date().toISOString().slice(0, 10),
    paymentMode: paymentMode || "Cash",
    notes: notes || "",
  });
  await refreshGuarantorReferralRecords().catch(() => {});
  return paid;
};

/**
 * Adds a further commission for a person from their page in the register,
 * paid on the given date with a linked expense.
 */
export const addReferralCommission = async ({ personId, customerId, customerName, loanId, amount, date, notes, paymentMode }) => {
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error("Invalid commission amount. Must be greater than 0.");
  }

  const hasLoan = loanId && loanId !== "—";
  const saved = await apiPost(`/guarantor-referrals/${personId}/commissions`, {
    amount: numAmount,
    date: date ? String(date).slice(0, 10) : new Date().toISOString().slice(0, 10),
    notes: notes || "",
    paymentMode: paymentMode || "Cash",
    loanId: hasLoan ? loanId : "",
    customerId: hasLoan && customerId !== "—" ? customerId : "",
    customerName: customerName || "",
  });

  await refreshGuarantorReferralRecords().catch(() => {});
  return saved;
};

/**
 * Changes a referral commission's percentage. The server recalculates the
 * amount (loan amount x % / 100 unless `commissionAmount` is given), keeps the
 * payment history, and if it was already paid updates its existing expense —
 * never a duplicate. `loanId` finds the commission when no id is passed.
 */
export const updateReferralCommissionRate = async ({ commissionId, loanId, percentage, commissionAmount, notes }) => {
  let id = commissionId;
  if (!id && loanId && loanId !== "—") {
    for (const r of records) {
      const match = (r.commissions || []).find((c) => c.loanId === loanId);
      if (match) { id = match.id; break; }
    }
  }
  if (!id) throw new Error("Commission not found for this loan.");

  const updated = await apiPut(`/referrals/${id}/rate`, {
    percentage: Number(percentage) || 0,
    ...(Number(commissionAmount) > 0 ? { commissionAmount: Number(commissionAmount) } : {}),
    ...(notes !== undefined ? { notes } : {}),
  });
  await refreshGuarantorReferralRecords().catch(() => {});
  return toCommissionView(updated);
};

/**
 * Document charges are recorded as income by the server when a loan is saved
 * (one entry per loan, updated on edit — see incomeRepository on the backend),
 * so there is nothing to sync from the browser. Kept so callers need no change.
 */
export const syncDocumentChargeIncome = () => null;
export const reconcileLoanDocumentCharges = () => {};

/** A commission from the API, in the shape the register pages show. */
export const toCommissionView = (c) => ({
  id: c.id,
  referralId: c.personId || "",
  referralName: c.agentName || "",
  referralPhone: c.agentPhone || "",
  customerId: c.customerId || "—",
  customerName: c.customerName || "—",
  loanId: c.loanId || "—",
  loanAmount: Number(c.loanAmount) || 0,
  percentage: Number(c.percentage) || 0,
  amount: Number(c.amount) || 0,
  commissionAmount: Number(c.amount) || 0,
  status: c.status,
  paidDate: c.paidDate || null,
  paymentMode: c.paymentMode || null,
  expenseId: c.expenseId || "",
  notes: c.remarks || "",
  date: c.paidDate || c.commissionDate || c.createdAt,
  createdAt: c.createdAt || c.commissionDate,
});

/**
 * Retrieves all commission records associated with a referral person,
 * newest first.
 */
export const getRecordCommissions = (record) => {
  if (!record || !Array.isArray(record.commissions)) return [];

  return record.commissions
    .map(toCommissionView)
    .sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
};

/**
 * The loans a person guaranteed or referred, as recorded by the server.
 */
export const getRecordRelationships = (record) => {
  if (!record || !Array.isArray(record.relationships)) return [];

  return record.relationships.map((rel) => ({
    ...rel,
    customerId: rel.customerId || "—",
    customerName: rel.customerName || "Customer",
    loanId: rel.loanId || "—",
  }));
};

/**
 * Generates the next sequential ID in the format GR-00001 — only a preview;
 * the server assigns the real id when the record is saved.
 */
export const generateNextGuarantorId = (existingRecords = []) => {
  let maxNum = 0;
  if (Array.isArray(existingRecords)) {
    existingRecords.forEach((r) => {
      const match = r && r.id ? String(r.id).match(/GR-(\d+)/i) : null;
      if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10) || 0);
    });
  }
  return `GR-${String(maxNum + 1).padStart(5, "0")}`;
};

/**
 * Everything the person-details popup shows for one register person, built
 * from the record the server returned (its relationships, commissions and
 * documents) — same output as the Simplify version:
 * - guarantorList / referralList / bothList: one row per customer-loan pair
 *   (a pair where they are both guarantor and referrer also appears in Both);
 * - referral rows carry the commission %, amount and Paid/Pending, or
 *   "Not Configured" when none was set (never a false "₹0 Pending");
 * - kpis: distinct linked customers, and counts as guarantor / referral;
 * - documents: the person's shared documents, de-duplicated.
 */
export const getPersonDetailsSummary = (record) => {
  if (!record) {
    return {
      guarantorList: [],
      referralList: [],
      bothList: [],
      kpis: { linkedCustomers: 0, asGuarantor: 0, asReferral: 0 },
      documents: [],
    };
  }

  const relationships = getRecordRelationships(record);
  const commissions = getRecordCommissions(record);

  // Group by customer-loan pair.
  const loanPairs = new Map();
  const pairFor = (custId, loanId, fallbackKey, seed) => {
    const key = loanId && loanId !== "—" ? `${custId}___${loanId}` : `${custId}___${fallbackKey}`;
    if (!loanPairs.has(key)) {
      loanPairs.set(key, {
        customerId: custId,
        customerName: seed.customerName || "Customer",
        loanId,
        associatedDate: seed.associatedDate || null,
        isGuarantor: false,
        isReferral: false,
        relReferral: null,
      });
    }
    const pair = loanPairs.get(key);
    if (!pair.associatedDate && seed.associatedDate) pair.associatedDate = seed.associatedDate;
    return pair;
  };

  relationships.forEach((rel, i) => {
    const pair = pairFor(rel.customerId, rel.loanId, rel.id || `rel-${i}`, rel);
    if (rel.type === "Guarantor" || rel.type === "Both") pair.isGuarantor = true;
    if (rel.type === "Referral" || rel.type === "Both") {
      pair.isReferral = true;
      pair.relReferral = rel;
    }
  });

  // A commission for a loan with no recorded relationship still counts as a referral.
  commissions.forEach((c) => {
    const pair = pairFor(c.customerId, c.loanId, `comm-${c.id}`, {
      customerName: c.customerName,
      associatedDate: c.paidDate || c.createdAt,
    });
    pair.isReferral = true;
  });

  const resolveCommission = (pair) => {
    const comm = commissions.find(
      (c) =>
        (pair.loanId && pair.loanId !== "—" && c.loanId === pair.loanId) ||
        (pair.customerId && pair.customerId !== "—" && c.customerId === pair.customerId)
    );
    const rel = pair.relReferral;

    const num = (v) => (v === undefined || v === null || v === "" || isNaN(Number(v)) ? null : Number(v));
    let percentage = comm ? num(comm.percentage) : null;
    let amount = comm ? num(comm.commissionAmount ?? comm.amount) : null;
    let status = comm && (comm.status === "Paid" || comm.status === "Pending") ? comm.status : null;

    if (rel) {
      if (percentage === null) percentage = num(rel.commissionPercentage);
      if (amount === null) amount = num(rel.commissionAmount);
      if (!status && (rel.commissionStatus === "Paid" || rel.commissionStatus === "Pending")) status = rel.commissionStatus;
    }

    if ((amount === null || amount <= 0) && percentage !== null && percentage > 0) {
      const principal = Number(comm?.loanAmount || 0);
      if (principal > 0) amount = Math.round((principal * percentage) / 100);
    }

    const isConfigured = (percentage !== null && percentage > 0) || (amount !== null && amount > 0) || status === "Paid";
    if (!isConfigured) {
      return { isConfigured: false, percentage: null, percentageDisplay: "Not Configured", amount: null, amountDisplay: "—", status: "Not Configured" };
    }
    return {
      isConfigured: true,
      percentage,
      percentageDisplay: percentage !== null && percentage > 0 ? `${percentage}%` : "—",
      amount,
      amountDisplay: amount !== null && amount > 0 ? `₹${amount.toLocaleString("en-IN")}` : "—",
      status: status === "Paid" ? "Paid" : "Pending",
    };
  };

  const guarantorList = [];
  const referralList = [];
  const bothList = [];

  loanPairs.forEach((pair, key) => {
    const base = { customerId: pair.customerId, customerName: pair.customerName, loanId: pair.loanId, associatedDate: pair.associatedDate };
    if (pair.isGuarantor) guarantorList.push({ id: `g-${key}`, ...base, type: "Guarantor" });
    if (pair.isReferral) {
      const comm = resolveCommission(pair);
      referralList.push({
        id: `r-${key}`,
        ...base,
        type: "Referral",
        commissionPercentage: comm.percentage,
        commissionPercentageDisplay: comm.percentageDisplay,
        commissionAmount: comm.amount,
        commissionAmountDisplay: comm.amountDisplay,
        commissionStatus: comm.status,
        isCommissionConfigured: comm.isConfigured,
      });
    }
    if (pair.isGuarantor && pair.isReferral) bothList.push({ id: `b-${key}`, ...base, type: "Both" });
  });

  const byDateDesc = (a, b) => new Date(b.associatedDate || 0) - new Date(a.associatedDate || 0);
  guarantorList.sort(byDateDesc);
  referralList.sort(byDateDesc);
  bothList.sort(byDateDesc);

  const distinct = new Set();
  loanPairs.forEach((pair) => {
    if (pair.isGuarantor || pair.isReferral) {
      const idf = pair.customerId && pair.customerId !== "—" ? pair.customerId : pair.customerName;
      if (idf) distinct.add(idf);
    }
  });

  // Documents live on the register record (loaded with its files).
  const documents = [];
  const seen = new Set();
  const addDoc = (id, title, file) => {
    if (!file) return;
    const dataKey = file.data || file.name || id;
    if (seen.has(dataKey)) return;
    seen.add(dataKey);
    documents.push({
      id,
      title,
      name: file.name || `${title}.pdf`,
      size: file.size || "—",
      type: file.type || "application/pdf",
      data: file.data || null,
    });
  };
  if (record.aadhaarFile) addDoc("aadhaar", "Aadhaar Card", record.aadhaarFile);
  if (record.panFile) addDoc("pan", "PAN Card", record.panFile);
  if (record.dlFile) addDoc("dl", "Driving License", record.dlFile);
  if (record.voterFile) addDoc("voter", "Voter ID", record.voterFile);
  (Array.isArray(record.additionalDocs) ? record.additionalDocs : []).forEach((doc, idx) => {
    if (doc) addDoc(doc.id || `doc-${idx}`, doc.title || `Document #${idx + 1}`, doc.file || doc);
  });

  return {
    guarantorList,
    referralList,
    bothList,
    kpis: { linkedCustomers: distinct.size, asGuarantor: guarantorList.length, asReferral: referralList.length },
    documents,
  };
};
