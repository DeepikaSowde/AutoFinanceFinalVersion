/**
 * motoLend Guarantor & Referral Shared Persistence and Relationship Manager
 * 
 * Manages the single shared collection of Guarantors & Referrals,
 * mobile number normalization, search/fetch, ID generation,
 * and per-loan relationship history tracking.
 */

export const STORAGE_KEY = "motoLendGuarantorReferrals_data";
export const CUSTOMERS_STORAGE_KEY = "motoLendCustomersList_data";
export const EXPENSES_STORAGE_KEY = "motoLendExpense_data";
export const COMMISSIONS_STORAGE_KEY = "motoLendReferralCommissions_data";
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

/**
 * Generates the next sequential unique ID in the format GR-00001, GR-00002, etc.
 * Never reuses existing IDs and maintains permanent record identity.
 */
export const generateNextGuarantorId = (existingRecords = []) => {
  let maxNum = 0;
  if (Array.isArray(existingRecords)) {
    existingRecords.forEach((r) => {
      if (r && r.id) {
        const match = String(r.id).match(/GR-(\d+)/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
      }
    });
  }
  const nextNum = maxNum + 1;
  return `GR-${String(nextNum).padStart(5, "0")}`;
};

/**
 * Retrieves all shared Guarantor / Referral records from localStorage.
 */
export const getGuarantorReferralRecords = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("Failed to load guarantor/referral records:", err);
    return [];
  }
};

/**
 * Persists records to localStorage and emits an update event for real-time reactivity.
 */
export const saveGuarantorReferralRecords = (records) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(UPDATE_EVENT_NAME));
    }
  } catch (err) {
    console.error("Failed to save guarantor/referral records:", err);
  }
};

/**
 * Finds all matching records by normalized mobile number.
 * Returns an array of matches to handle potential duplicates/ambiguities cleanly.
 */
export const findRecordsByMobile = (mobile) => {
  const targetClean = normalizePhone(mobile);
  if (!targetClean || targetClean.length < 10) return [];

  const records = getGuarantorReferralRecords();
  return records.filter((r) => {
    const recClean = normalizePhone(r.phone);
    return recClean === targetClean;
  });
};

/**
 * Synchronizes a commission record into the canonical Expenses collection (motoLendExpense_data).
 * Guarantees:
 * - Exactly one expense record per commission transaction.
 * - Idempotent updates without duplicate creation.
 * - Category is always "Referral Commission".
 * - Accounting rule: Creates an expense; does not touch loan balance or investor capital.
 */
export const syncCommissionExpense = (commission) => {
  if (!commission || !commission.amount || isNaN(Number(commission.amount))) return null;
  try {
    const raw = localStorage.getItem(EXPENSES_STORAGE_KEY);
    const expenses = raw ? JSON.parse(raw) : [];

    const commId = commission.id || `COMM-${commission.loanId || Date.now()}`;
    const expId = commission.expenseId || `EXP-${commId}`;
    const amountVal = Number(commission.amount);
    const dateVal = commission.date ? String(commission.date).slice(0, 10) : new Date().toISOString().slice(0, 10);
    const referrer = commission.referralName || commission.referrerName || "Referrer";
    const custName = commission.customerName || "Customer";
    const loanId = commission.loanId || "—";
    const custId = commission.customerId || "—";

    const expenseEntry = {
      id: expId,
      category: "Referral Commission",
      amount: amountVal,
      date: dateVal,
      mode: commission.paymentMode || "Cash",
      remarks: commission.notes || `Referral commission to ${referrer} for loan ${loanId} (${custName})`,
      referrerName: referrer,
      referralId: commission.referralId || "",
      customerId: custId,
      customerName: custName,
      loanId: loanId,
      commissionId: commId,
      isReferralCommission: true,
      createdAt: commission.createdAt || new Date().toISOString(),
    };

    // Find if already exists by expenseId or commissionId
    const existingIndex = expenses.findIndex(
      (e) =>
        e.id === expId ||
        (e.commissionId && e.commissionId === commId) ||
        (e.category === "Referral Commission" && e.loanId === loanId && e.loanId !== "—" && e.referrerName === referrer && e.id === expId)
    );

    if (existingIndex >= 0) {
      expenses[existingIndex] = { ...expenses[existingIndex], ...expenseEntry };
    } else {
      expenses.push(expenseEntry);
    }

    localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(expenses));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("storage"));
    }
    return expenseEntry;
  } catch (err) {
    console.error("Failed to sync commission expense:", err);
    return null;
  }
};

/**
 * Synchronizes with motoLendReferralCommissions_data so the Referral Commission dashboard is always aligned.
 */
export const syncReferralCommissionStore = (commission) => {
  if (!commission) return;
  try {
    const raw = localStorage.getItem(COMMISSIONS_STORAGE_KEY);
    const comms = raw ? JSON.parse(raw) : [];

    const commId = commission.id;
    const existingIndex = comms.findIndex(
      (c) =>
        c.id === commId ||
        (commission.loanId &&
          c.loanId === commission.loanId &&
          c.referrerName === (commission.referralName || commission.referrerName))
    );

    const entry = {
      id: commId,
      referrerName: commission.referralName || commission.referrerName || "Referrer",
      referrerPhone: commission.referralPhone || commission.referrerPhone || "—",
      customerName: commission.customerName || "Customer",
      customerId: commission.customerId || "—",
      loanId: commission.loanId || "—",
      loanAmount: commission.loanAmount || 0,
      percentage: commission.percentage || 0,
      commissionAmount: Number(commission.amount || commission.commissionAmount || 0),
      status: commission.status || "Pending",
      paidDate: commission.paidDate || null,
      paymentMode: commission.paymentMode || "Cash",
      notes: commission.notes || `Referral commission for loan ${commission.loanId}`,
      createdAt: commission.createdAt || new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      comms[existingIndex] = { ...comms[existingIndex], ...entry };
    } else {
      comms.unshift(entry);
    }

    localStorage.setItem(COMMISSIONS_STORAGE_KEY, JSON.stringify(comms));
  } catch (err) {
    console.error("Failed to sync referral commission store:", err);
  }
};

/**
 * Saves or updates a person in the shared Guarantor/Referral collection
 * and records their relationship with a specific customer and loan.
 * Also records and syncs referral commission if specified.
 * 
 * @param {Object} params
 * @param {Object} params.person - The person form details
 * @param {"Guarantor"|"Referral"} params.type - Relationship type
 * @param {string} params.customerId - Saved customer ID
 * @param {string} params.customerName - Customer's full name
 * @param {string} params.loanId - Saved loan ID
 * @param {string} [params.associatedDate] - Associated timestamp
 * @param {number|string} [params.commissionAmount] - Optional referral commission amount
 * @returns {Object|null} The created or updated person record
 */
export const recordPersonRelationship = ({
  person,
  type = "Guarantor",
  customerId,
  customerName,
  loanId,
  associatedDate,
  commissionAmount,
  commissionPercentage,
  payCommission,
  paymentMode,
  loanAmount,
}) => {
  if (!person) return null;

  const rawName = (person.fullName || person.name || "").trim();
  const rawPhone = person.phone || person.mobile || "";
  const normPhone = normalizePhone(rawPhone);

  // If there's neither name nor phone, ignore
  if (!rawName && !normPhone) return null;

  const records = getGuarantorReferralRecords();
  const personAadhaar = String(person.aadhaarNumber || person.aadhaarNo || "").replace(/\D/g, "");
  const targetId = person.referralId || person.guarantorId || person.id;

  // 1. Locate existing record if present:
  let existingIndex = -1;

  if (targetId) {
    existingIndex = records.findIndex((r) => r.id === targetId);
  }
  if (existingIndex === -1 && normPhone && normPhone.length === 10) {
    existingIndex = records.findIndex((r) => normalizePhone(r.phone) === normPhone);
  }
  if (existingIndex === -1 && personAadhaar && personAadhaar.length === 12) {
    existingIndex = records.findIndex((r) => {
      const recAadhaar = String(r.aadhaarNumber || "").replace(/\D/g, "");
      return recAadhaar === personAadhaar;
    });
  }
  if (existingIndex === -1 && rawName) {
    existingIndex = records.findIndex((r) => {
      const nameMatch = (r.fullName || "").trim().toLowerCase() === rawName.toLowerCase();
      if (!nameMatch) return false;
      const recPhoneNorm = normalizePhone(r.phone);
      return !normPhone || !recPhoneNorm || normPhone === recPhoneNorm;
    });
  }

  // Safety: check if this relationship was already assigned to an existing record
  if (existingIndex === -1 && customerId && loanId) {
    existingIndex = records.findIndex(
      (r) =>
        Array.isArray(r.relationships) &&
        r.relationships.some(
          (rel) => rel.type === type && rel.customerId === customerId && rel.loanId === loanId
        )
    );
  }

  const isReferralType = type === "Referral";

  // Calculate commission percentage and amount (Only for Referral)
  let parsedPercentage = 0;
  let parsedCommission = 0;
  let isPaidNow = false;
  let payMode = "Cash";

  if (isReferralType) {
    const rawPct =
      commissionPercentage !== undefined && commissionPercentage !== null && commissionPercentage !== ""
        ? commissionPercentage
        : person.commissionPercentage;
    parsedPercentage = Number(rawPct) || 0;

    const rawAmt =
      commissionAmount !== undefined && commissionAmount !== null && commissionAmount !== ""
        ? commissionAmount
        : person.commissionAmount;
    parsedCommission = Number(rawAmt) || 0;

    // Auto-calculate if amount was not explicitly provided but percentage and loan amount exist
    if (parsedCommission <= 0 && parsedPercentage > 0 && Number(loanAmount) > 0) {
      parsedCommission = Math.round((Number(loanAmount) * parsedPercentage) / 100);
    }

    isPaidNow = Boolean(payCommission === true || person.payCommission === true);
    payMode = paymentMode || person.paymentMode || "Cash";
  }

  const finalAmount = parsedCommission > 0 ? parsedCommission : 0;
  const status = isPaidNow ? "Paid" : "Pending";
  const dateStr = (associatedDate || new Date().toISOString()).slice(0, 10);
  const paidDateStr = isPaidNow ? dateStr : null;

  // Determine canonical person ID: reuse existing ID or prepare next sequential ID
  const assignedId =
    existingIndex >= 0 ? records[existingIndex].id : (targetId || generateNextGuarantorId(records));

  const relationshipEntry = {
    id: `rel-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    type: type, // "Guarantor" or "Referral"
    customerId: customerId || "—",
    customerName: customerName || "Customer",
    loanId: loanId || "—",
    associatedDate: associatedDate || new Date().toISOString(),
    commissionAmount: finalAmount,
    commissionPercentage: parsedPercentage,
    commissionStatus: status,
  };

  // Commission entry for Referral records
  let commEntry = null;
  if (isReferralType) {
    const commId = `COMM-${loanId || "LN"}-${normPhone || "ref"}`;
    commEntry = {
      id: commId,
      referralId: assignedId,
      referralName: rawName,
      referralPhone: normPhone || rawPhone,
      customerId: customerId || "—",
      customerName: customerName || "Customer",
      loanId: loanId || "—",
      loanAmount: Number(loanAmount || 0),
      percentage: parsedPercentage,
      amount: finalAmount,
      commissionAmount: finalAmount,
      status: status,
      paidDate: paidDateStr,
      paymentMode: isPaidNow ? payMode : null,
      expenseId: `EXP-${commId}`,
      notes: isPaidNow
        ? `Referral commission paid on loan creation (${payMode}) for loan ${loanId} (${customerName})`
        : `Referral commission for loan ${loanId} (${customerName})`,
      createdAt: associatedDate || new Date().toISOString(),
    };

    relationshipEntry.commissions = [commEntry];

    // If paid during loan creation, record the paid commission as an expense
    if (isPaidNow && finalAmount > 0) {
      syncCommissionExpense(commEntry);
    }

    // Always sync referral details to Referral page store (motoLendReferralCommissions_data)
    syncReferralCommissionStore(commEntry);
  }

  if (existingIndex >= 0) {
    // REUSE existing person record and unique ID
    const existing = records[existingIndex];
    const currentRels = Array.isArray(existing.relationships) ? [...existing.relationships] : [];
    const currentComms = Array.isArray(existing.commissions) ? [...existing.commissions] : [];

    // Prevent duplicate entries for the same person, customer, loan, and relationship type
    const relIndex = currentRels.findIndex(
      (rel) => rel.type === type && rel.customerId === customerId && rel.loanId === loanId
    );

    if (relIndex >= 0) {
      currentRels[relIndex] = {
        ...currentRels[relIndex],
        ...relationshipEntry,
        id: currentRels[relIndex].id, // preserve stable ID
      };
    } else {
      currentRels.push(relationshipEntry);
    }

    // Handle commission in person's commissions array
    if (commEntry) {
      commEntry.referralId = existing.id;
      const commIdx = currentComms.findIndex(
        (c) => (c.loanId === loanId && c.loanId !== "—") || c.id === commEntry.id
      );
      if (commIdx >= 0) {
        currentComms[commIdx] = { ...currentComms[commIdx], ...commEntry };
      } else {
        currentComms.push(commEntry);
      }
    }

    // Merge in any newly uploaded documents or missing location details
    const mergedRecord = {
      ...existing,
      relationships: currentRels,
      commissions: currentComms,
      address: person.address ? person.address.trim() : existing.address,
      area: person.area ? person.area.trim() : existing.area,
      landmark: person.landmark ? person.landmark.trim() : existing.landmark,
      pincode: person.pincode ? person.pincode.trim() : existing.pincode,
      aadhaarNumber:
        personAadhaar.length === 12 ? personAadhaar : existing.aadhaarNumber || "",
      aadhaarFile: person.aadhaarFile || existing.aadhaarFile || null,
      additionalDocs:
        Array.isArray(person.additionalDocs) && person.additionalDocs.length > 0
          ? person.additionalDocs
          : existing.additionalDocs || [],
    };

    records[existingIndex] = mergedRecord;
    saveGuarantorReferralRecords(records);
    return mergedRecord;
  } else {
    // CREATE new permanent record in the shared collection using assigned ID
    const newRecord = {
      id: assignedId,
      fullName: rawName,
      phone: normPhone || rawPhone,
      address: (person.address || "").trim(),
      area: (person.area || "").trim(),
      landmark: (person.landmark || "").trim(),
      pincode: (person.pincode || "").trim(),
      aadhaarNumber: personAadhaar,
      aadhaarFile: person.aadhaarFile || null,
      additionalDocs: Array.isArray(person.additionalDocs) ? person.additionalDocs : [],
      relationships: [relationshipEntry],
      commissions: commEntry ? [commEntry] : [],
      createdAt: associatedDate || new Date().toISOString(),
    };

    records.unshift(newRecord);
    saveGuarantorReferralRecords(records);
    return newRecord;
  }
};

/**
 * Marks an unpaid referral commission as Paid.
 * Used when the admin uses the Pay Commission button on the Referral page to pay later.
 * Updates:
 * 1. Referral Commission store (motoLendReferralCommissions_data)
 * 2. Shared Guarantor/Referral records (motoLendGuarantorReferrals_data) - commission and relationship history
 * 3. Expenses module (motoLendExpense_data) - records the paid commission as an expense
 */
export const markReferralCommissionPaid = ({
  commissionId,
  loanId,
  referralId,
  referralName,
  referralPhone,
  amount,
  paidDate,
  paymentMode,
  notes,
}) => {
  const dateVal = paidDate || new Date().toISOString().slice(0, 10);
  const modeVal = paymentMode || "Cash";
  const numAmount = Number(amount || 0);

  // 1. Update Referral Commission store (motoLendReferralCommissions_data)
  try {
    const rawComms = localStorage.getItem(COMMISSIONS_STORAGE_KEY);
    const comms = rawComms ? JSON.parse(rawComms) : [];
    let updatedComms = false;

    const newComms = comms.map((c) => {
      const isMatch =
        c.id === commissionId ||
        (loanId && c.loanId === loanId && c.loanId !== "—" && (!referralName || c.referrerName === referralName));
      if (isMatch) {
        updatedComms = true;
        return {
          ...c,
          status: "Paid",
          paidDate: dateVal,
          paymentMode: modeVal,
          notes: notes || c.notes,
        };
      }
      return c;
    });

    if (updatedComms) {
      localStorage.setItem(COMMISSIONS_STORAGE_KEY, JSON.stringify(newComms));
    }
  } catch (err) {
    console.error("Failed to update referral commissions store on payment:", err);
  }

  // 2. Update Shared Guarantor / Referral records (motoLendGuarantorReferrals_data)
  try {
    const records = getGuarantorReferralRecords();
    let recordsModified = false;

    records.forEach((rec) => {
      const matchId = referralId && rec.id === referralId;
      const matchPhone = referralPhone && normalizePhone(rec.phone) === normalizePhone(referralPhone);
      const matchName =
        referralName && (rec.fullName || "").trim().toLowerCase() === referralName.trim().toLowerCase();

      if (matchId || matchPhone || matchName) {
        // Update commissions array
        if (Array.isArray(rec.commissions)) {
          rec.commissions.forEach((c) => {
            const isMatch =
              c.id === commissionId ||
              (loanId && c.loanId === loanId && c.loanId !== "—");
            if (isMatch) {
              c.status = "Paid";
              c.paidDate = dateVal;
              c.paymentMode = modeVal;
              recordsModified = true;
            }
          });
        }

        // Update relationships array
        if (Array.isArray(rec.relationships)) {
          rec.relationships.forEach((rel) => {
            if (rel.type === "Referral" && (rel.loanId === loanId || !loanId)) {
              rel.commissionStatus = "Paid";
              if (Array.isArray(rel.commissions)) {
                rel.commissions.forEach((c) => {
                  if (c.id === commissionId || (loanId && c.loanId === loanId)) {
                    c.status = "Paid";
                    c.paidDate = dateVal;
                    c.paymentMode = modeVal;
                  }
                });
              }
              recordsModified = true;
            }
          });
        }
      }
    });

    if (recordsModified) {
      saveGuarantorReferralRecords(records);
    }
  } catch (err) {
    console.error("Failed to update guarantor referral records on payment:", err);
  }

  // 3. Record the paid commission as an expense in motoLendExpense_data
  if (numAmount > 0) {
    syncCommissionExpense({
      id: commissionId || `COMM-${loanId || Date.now()}`,
      referralId: referralId || "",
      referralName: referralName || "Referrer",
      referralPhone: referralPhone || "",
      loanId: loanId || "—",
      amount: numAmount,
      date: dateVal,
      paymentMode: modeVal,
      notes: notes || `Referral commission paid for loan ${loanId || "—"} (${referralName || "Referrer"})`,
    });
  }

  // Trigger storage events
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new Event(UPDATE_EVENT_NAME));
  }
};

/**
 * Adds an additional referral commission from the Referral View page.
 * Guarantees:
 * - Does not overwrite existing commission history.
 * - Creates a linked expense in Expenses module.
 * - Persists and triggers updates.
 */
export const addReferralCommission = ({
  personId,
  referralName,
  referralPhone,
  customerId,
  customerName,
  loanId,
  amount,
  date,
  notes,
}) => {
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error("Invalid commission amount. Must be greater than 0.");
  }

  const records = getGuarantorReferralRecords();
  const normPhone = normalizePhone(referralPhone);

  let targetIndex = -1;
  if (personId) {
    targetIndex = records.findIndex((r) => r.id === personId);
  }
  if (targetIndex === -1 && normPhone) {
    targetIndex = records.findIndex((r) => normalizePhone(r.phone) === normPhone);
  }
  if (targetIndex === -1 && referralName) {
    targetIndex = records.findIndex(
      (r) => (r.fullName || "").trim().toLowerCase() === referralName.trim().toLowerCase()
    );
  }

  const commId = `COMM-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  const expenseId = `EXP-${commId}`;
  const dateStr = date ? String(date).slice(0, 10) : new Date().toISOString().slice(0, 10);

  const commEntry = {
    id: commId,
    referralId: personId || (targetIndex >= 0 ? records[targetIndex].id : ""),
    referralName: referralName || (targetIndex >= 0 ? records[targetIndex].fullName : "Referrer"),
    referralPhone: referralPhone || (targetIndex >= 0 ? records[targetIndex].phone : ""),
    customerId: customerId || "—",
    customerName: customerName || "Customer",
    loanId: loanId || "—",
    amount: numAmount,
    date: dateStr,
    expenseId: expenseId,
    status: "Recorded",
    notes: notes || `Referral commission for loan ${loanId} (${customerName || "Customer"})`,
    createdAt: new Date().toISOString(),
  };

  if (targetIndex >= 0) {
    const existing = records[targetIndex];
    const comms = Array.isArray(existing.commissions) ? [...existing.commissions] : [];
    comms.push(commEntry);

    // Also update or add to relationships if not already present
    const rels = Array.isArray(existing.relationships) ? [...existing.relationships] : [];
    const relExists = rels.some(
      (r) => r.type === "Referral" && r.loanId === loanId && r.loanId !== "—"
    );
    if (!relExists && (loanId || customerId)) {
      rels.push({
        id: `rel-${Date.now()}`,
        type: "Referral",
        customerId: customerId || "—",
        customerName: customerName || "Customer",
        loanId: loanId || "—",
        associatedDate: dateStr,
        commissionAmount: numAmount,
        commissions: [commEntry],
      });
    }

    records[targetIndex] = {
      ...existing,
      commissions: comms,
      relationships: rels,
    };
    saveGuarantorReferralRecords(records);
  }

  // Sync to Expenses and Referral Commission store
  syncCommissionExpense(commEntry);
  syncReferralCommissionStore(commEntry);

  return commEntry;
};

/**
 * Retrieves all commission records associated with a referral person.
 * Deduplicates and returns an array sorted by date descending, cross-referencing
 * both Referral Commission store and Expenses module to ensure accurate status.
 */
export const getRecordCommissions = (record) => {
  if (!record) return [];

  const commsMap = new Map();

  // 1. Check record.commissions array
  if (Array.isArray(record.commissions)) {
    record.commissions.forEach((c) => {
      if (c && (c.amount !== undefined || c.commissionAmount !== undefined)) {
        commsMap.set(c.id || `${c.loanId}-${c.amount}`, { ...c });
      }
    });
  }

  // 2. Check record.relationships for any inline commissions
  if (Array.isArray(record.relationships)) {
    record.relationships.forEach((rel) => {
      if (rel.type === "Referral" && Array.isArray(rel.commissions)) {
        rel.commissions.forEach((c) => {
          if (c && (c.amount !== undefined || c.commissionAmount !== undefined)) {
            commsMap.set(c.id || `${c.loanId}-${c.amount}`, { ...c });
          }
        });
      } else if (rel.type === "Referral" && rel.commissionAmount && Number(rel.commissionAmount) > 0) {
        const key = `COMM-${rel.loanId || "loan"}-${rel.customerId || "cus"}`;
        if (!commsMap.has(key)) {
          commsMap.set(key, {
            id: key,
            referralId: record.id,
            referralName: record.fullName,
            referralPhone: record.phone,
            customerId: rel.customerId || "—",
            customerName: rel.customerName || "Customer",
            loanId: rel.loanId || "—",
            amount: Number(rel.commissionAmount),
            date: rel.associatedDate ? String(rel.associatedDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
            expenseId: `EXP-${key}`,
            status: rel.commissionStatus || "Pending",
            createdAt: rel.associatedDate || new Date().toISOString(),
          });
        }
      }
    });
  }

  // 3. Cross-reference with Referral Commissions Store (motoLendReferralCommissions_data)
  try {
    const rawComms = localStorage.getItem(COMMISSIONS_STORAGE_KEY);
    const storedComms = rawComms ? JSON.parse(rawComms) : [];
    const recName = (record.fullName || "").trim().toLowerCase();
    const recPhone = normalizePhone(record.phone);

    storedComms.forEach((sc) => {
      const matchName = (sc.referrerName || "").trim().toLowerCase() === recName;
      const matchPhone = recPhone && normalizePhone(sc.referrerPhone) === recPhone;
      const matchId = sc.referralId && sc.referralId === record.id;

      if (matchId || matchName || matchPhone) {
        const key = sc.id || `COMM-${sc.loanId || "LN"}-${recPhone || "ref"}`;
        if (commsMap.has(key)) {
          const existing = commsMap.get(key);
          commsMap.set(key, {
            ...existing,
            status: sc.status || existing.status,
            paidDate: sc.paidDate || existing.paidDate,
            paymentMode: sc.paymentMode || existing.paymentMode,
          });
        } else {
          commsMap.set(key, {
            id: key,
            referralId: record.id,
            referralName: record.fullName,
            referralPhone: record.phone,
            customerId: sc.customerId || "—",
            customerName: sc.customerName || "Customer",
            loanId: sc.loanId || "—",
            amount: Number(sc.commissionAmount || 0),
            date: sc.paidDate || sc.createdAt || new Date().toISOString().slice(0, 10),
            expenseId: `EXP-${key}`,
            status: sc.status || "Pending",
            paidDate: sc.paidDate || null,
            paymentMode: sc.paymentMode || null,
            notes: sc.notes || "",
            createdAt: sc.createdAt || new Date().toISOString(),
          });
        }
      }
    });
  } catch (err) {
    console.error("Error reading stored commissions:", err);
  }

  // 4. Cross-reference with Expenses module (motoLendExpense_data)
  try {
    const rawExp = localStorage.getItem(EXPENSES_STORAGE_KEY);
    const expenses = rawExp ? JSON.parse(rawExp) : [];
    const recName = (record.fullName || "").trim().toLowerCase();
    const recPhone = normalizePhone(record.phone);

    expenses.forEach((exp) => {
      if (exp.category === "Referral Commission") {
        const matchId = exp.referralId && exp.referralId === record.id;
        const matchName = exp.referrerName && (exp.referrerName || "").trim().toLowerCase() === recName;
        const matchPhone = exp.referrerPhone && normalizePhone(exp.referrerPhone) === recPhone;

        if (matchId || matchName || (matchPhone && recPhone)) {
          const key = exp.commissionId || exp.id;
          if (commsMap.has(key)) {
            const existing = commsMap.get(key);
            commsMap.set(key, {
              ...existing,
              status: "Paid",
              paidDate: exp.date || existing.paidDate,
              paymentMode: exp.mode || existing.paymentMode,
            });
          } else {
            commsMap.set(key, {
              id: key,
              referralId: record.id,
              referralName: record.fullName,
              referralPhone: record.phone,
              customerId: exp.customerId || "—",
              customerName: exp.customerName || "Customer",
              loanId: exp.loanId || "—",
              amount: Number(exp.amount),
              date: exp.date || new Date().toISOString().slice(0, 10),
              expenseId: exp.id,
              status: "Paid",
              paidDate: exp.date,
              paymentMode: exp.mode,
              notes: exp.remarks || "",
              createdAt: exp.createdAt || exp.date,
            });
          }
        }
      }
    });
  } catch (err) {
    console.error("Error reading commissions from expenses:", err);
  }

  const result = Array.from(commsMap.values());
  result.sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
  return result;
};

/**
 * Returns complete, real relationship history for a guarantor/referral record.
 * Ensures deduplication and queries both the record's relationship history
 * and cross-references customer loan records in application storage.
 */
export const getRecordRelationships = (record) => {
  if (!record) return [];

  const rels = Array.isArray(record.relationships) ? [...record.relationships] : [];
  const recPhone = normalizePhone(record.phone);
  const recName = (record.fullName || "").trim().toLowerCase();
  const recAadhaar = String(record.aadhaarNumber || "").replace(/\D/g, "");

  try {
    const customers = JSON.parse(localStorage.getItem(CUSTOMERS_STORAGE_KEY) || "[]");

    customers.forEach((c) => {
      const custId = c.customerId || (c.customer?.mobile ? `CUS-${c.customer.mobile.slice(-5)}` : null);
      const custName = c.customer?.name || c.name || "—";
      const loanId = c.loanId || "—";
      const assocDate = c.createdAt || c.customer?.applicationDate || c.applicationDate || null;

      // Check if linked as Guarantor
      const g = c.guarantor;
      if (g && g.required !== "No" && (g.name || g.fullName || g.mobile || g.phone)) {
        const gPhone = normalizePhone(g.mobile || g.phone);
        const gName = (g.name || g.fullName || "").trim().toLowerCase();
        const gAadhaar = String(g.aadhaarNo || g.aadhaarNumber || "").replace(/\D/g, "");
        const gId = g.guarantorId || g.id;

        const isMatch =
          (gId && gId === record.id) ||
          (recPhone && gPhone && recPhone === gPhone) ||
          (recAadhaar && gAadhaar && recAadhaar.length === 12 && recAadhaar === gAadhaar) ||
          (recName && gName && recName === gName && (recPhone === gPhone || !gPhone));

        if (isMatch) {
          const exists = rels.some(
            (r) => r.type === "Guarantor" && r.customerId === custId && r.loanId === loanId
          );
          if (!exists) {
            rels.push({
              id: `rel-g-${custId}-${loanId}`,
              type: "Guarantor",
              customerId: custId || "—",
              customerName: custName,
              loanId: loanId,
              associatedDate: assocDate,
            });
          }
        }
      }

      // Check if linked as Referral
      const refBy = c.customer?.referredBy || c.loan?.referredBy || c.referredBy;
      if (refBy && typeof refBy === "string" && refBy.trim()) {
        const refName = refBy.trim().toLowerCase();
        if (recName && recName === refName) {
          const exists = rels.some(
            (r) => r.type === "Referral" && r.customerId === custId && r.loanId === loanId
          );
          if (!exists) {
            rels.push({
              id: `rel-r-${custId}-${loanId}`,
              type: "Referral",
              customerId: custId || "—",
              customerName: custName,
              loanId: loanId,
              associatedDate: assocDate,
            });
          }
        }
      }
    });
  } catch (err) {
    console.error("Error reading relationships from storage:", err);
  }

  // Deduplicate entries by type, customerId, loanId
  const unique = [];
  const seen = new Set();
  rels.forEach((rel) => {
    const key = `${rel.type}-${rel.customerId}-${rel.loanId}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(rel);
    }
  });

  return unique;
};
