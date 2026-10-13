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
export const INCOME_STORAGE_KEY = "motoLendIncome_data";
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

  // 3. Update customer's referral in motoLendCustomersList_data
  try {
    const rawCusts = localStorage.getItem(CUSTOMERS_STORAGE_KEY);
    if (rawCusts) {
      const custs = JSON.parse(rawCusts);
      let custModified = false;
      custs.forEach((c) => {
        if (loanId && c.loanId === loanId && c.referral) {
          c.referral.commissionStatus = "Paid";
          c.referral.payCommission = true;
          c.referral.paidDate = dateVal;
          c.referral.paymentMode = modeVal;
          custModified = true;
        }
      });
      if (custModified) {
        localStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify(custs));
      }
    }
  } catch (err) {
    console.error("Failed to update customers list on referral payment:", err);
  }

  // 4. Record the paid commission as an expense in motoLendExpense_data
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
 * Updates the commission percentage for an existing referral record and loan.
 * Automatically recalculates commission amount: Loan Amount × Commission % ÷ 100.
 * Preserves payment details and history when editing the percentage.
 * Does not overwrite previous payment records or create duplicate expenses.
 */
export const updateReferralCommissionRate = ({
  commissionId,
  loanId,
  percentage,
  commissionAmount,
  notes,
}) => {
  const parsedPct = Number(percentage) || 0;

  let commRecord = null;
  let computedAmount = 0;

  // 1. Update COMMISSIONS_STORAGE_KEY (motoLendReferralCommissions_data)
  try {
    const raw = localStorage.getItem(COMMISSIONS_STORAGE_KEY);
    const comms = raw ? JSON.parse(raw) : [];
    const idx = comms.findIndex(
      (c) => c.id === commissionId || (loanId && c.loanId === loanId && c.loanId !== "—")
    );

    if (idx >= 0) {
      const existing = comms[idx];
      const loanAmt = Number(existing.loanAmount || 0);
      computedAmount =
        commissionAmount !== undefined && commissionAmount !== null && !isNaN(commissionAmount) && Number(commissionAmount) > 0
          ? Number(commissionAmount)
          : (loanAmt > 0 && parsedPct > 0 ? Math.round((loanAmt * parsedPct) / 100) : 0);

      comms[idx] = {
        ...existing,
        percentage: parsedPct,
        commissionAmount: computedAmount,
        amount: computedAmount,
        notes: notes !== undefined ? notes : existing.notes,
        // PRESERVE payment history!
        status: existing.status || "Pending",
        paidDate: existing.paidDate || null,
        paymentMode: existing.paymentMode || null,
      };
      commRecord = comms[idx];
      localStorage.setItem(COMMISSIONS_STORAGE_KEY, JSON.stringify(comms));
    }
  } catch (err) {
    console.error("Failed to update referral commission percentage:", err);
  }

  // 2. Update Shared Guarantor/Referral records (motoLendGuarantorReferrals_data)
  try {
    const records = getGuarantorReferralRecords();
    let recordsModified = false;

    records.forEach((rec) => {
      // Update commissions list
      if (Array.isArray(rec.commissions)) {
        rec.commissions.forEach((c) => {
          if (c.id === commissionId || (loanId && c.loanId === loanId && c.loanId !== "—")) {
            const loanAmt = Number(c.loanAmount || commRecord?.loanAmount || 0);
            const calcAmt =
              computedAmount > 0
                ? computedAmount
                : (loanAmt > 0 && parsedPct > 0 ? Math.round((loanAmt * parsedPct) / 100) : 0);

            c.percentage = parsedPct;
            c.amount = calcAmt;
            c.commissionAmount = calcAmt;
            if (notes) c.notes = notes;
            recordsModified = true;
          }
        });
      }

      // Update relationships list
      if (Array.isArray(rec.relationships)) {
        rec.relationships.forEach((rel) => {
          if (rel.type === "Referral" && (rel.loanId === loanId || !loanId)) {
            rel.commissionPercentage = parsedPct;
            rel.commissionAmount = computedAmount;
            if (Array.isArray(rel.commissions)) {
              rel.commissions.forEach((c) => {
                if (c.id === commissionId || (loanId && c.loanId === loanId)) {
                  c.percentage = parsedPct;
                  c.amount = computedAmount;
                  c.commissionAmount = computedAmount;
                }
              });
            }
            recordsModified = true;
          }
        });
      }
    });

    if (recordsModified) {
      saveGuarantorReferralRecords(records);
    }
  } catch (err) {
    console.error("Failed to update shared records on commission rate update:", err);
  }

  // 3. Update CustomersList (motoLendCustomersList_data)
  try {
    const rawCusts = localStorage.getItem(CUSTOMERS_STORAGE_KEY);
    if (rawCusts && loanId) {
      const custs = JSON.parse(rawCusts);
      let custModified = false;
      custs.forEach((c) => {
        if (c.loanId === loanId && c.referral) {
          c.referral.commissionPercentage = parsedPct;
          c.referral.commissionAmount = computedAmount;
          custModified = true;
        }
      });
      if (custModified) {
        localStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify(custs));
      }
    }
  } catch (err) {
    console.error("Failed to update customers list on commission rate update:", err);
  }

  // 4. PRESERVE EXPENSE RULES:
  // If the commission was already paid, update the existing expense entry without creating a duplicate!
  // If it was unpaid, DO NOT create an expense.
  if (commRecord && commRecord.status === "Paid") {
    try {
      const rawExp = localStorage.getItem(EXPENSES_STORAGE_KEY);
      if (rawExp) {
        const expenses = JSON.parse(rawExp);
        const expIdx = expenses.findIndex(
          (e) =>
            e.commissionId === commRecord.id ||
            e.id === `EXP-${commRecord.id}` ||
            (e.category === "Referral Commission" && e.loanId === loanId && e.loanId !== "—")
        );
        if (expIdx >= 0) {
          expenses[expIdx].amount = Number(computedAmount);
          localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(expenses));
        }
      }
    } catch (err) {
      console.error("Failed to update existing expense on commission rate update:", err);
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new Event(UPDATE_EVENT_NAME));
  }

  return commRecord;
};

/**
 * Synchronizes Document Charge collected on a loan as Income.
 * Accounting Rules:
 * - Document charge is recorded as Income (not part of principal or interest).
 * - Records into motoLendIncome_data with type "Document Charge".
 * - Idempotent: Updates existing entry when saving or editing the same loan, preventing duplicate entries.
 * - Updates income and ledger totals immediately.
 */
export const syncDocumentChargeIncome = ({
  loanId,
  customerId,
  customerName,
  documentCharge,
  date,
  mode = "Cash",
}) => {
  if (!loanId || loanId === "—") return null;
  const chargeNum = Number(documentCharge) || 0;

  try {
    const raw = localStorage.getItem(INCOME_STORAGE_KEY);
    const incomeList = raw ? JSON.parse(raw) : [];

    // Stable ID for this loan's document charge
    const docChargeId = `INC-DOC-${loanId}`;

    const existingIndex = incomeList.findIndex(
      (inc) =>
        inc.id === docChargeId ||
        (inc.loanId === loanId && inc.loanId !== "—" && inc.type === "Document Charge")
    );

    if (chargeNum <= 0) {
      if (existingIndex >= 0) {
        incomeList.splice(existingIndex, 1);
        localStorage.setItem(INCOME_STORAGE_KEY, JSON.stringify(incomeList));
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("storage"));
        }
      }
      return null;
    }

    const dateVal = date ? String(date).slice(0, 10) : new Date().toISOString().slice(0, 10);
    const custName = customerName || "Customer";

    const incomeEntry = {
      id: docChargeId,
      type: "Document Charge",
      amount: chargeNum,
      date: dateVal,
      mode: mode || "Cash",
      remarks: `Document charge collected for loan ${loanId} (${custName})`,
      loanId: loanId,
      customerId: customerId || "—",
      customerName: custName,
      isDocumentCharge: true,
      createdAt: date || new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      const existing = incomeList[existingIndex];
      const isIdentical =
        Number(existing.amount || 0) === chargeNum &&
        (existing.date || "").slice(0, 10) === dateVal &&
        (existing.mode || "Cash") === (mode || "Cash") &&
        (existing.customerName || "Customer") === custName &&
        existing.customerId === (customerId || "—");

      if (isIdentical) {
        return existing;
      }

      incomeList[existingIndex] = {
        ...incomeList[existingIndex],
        ...incomeEntry,
        id: incomeList[existingIndex].id || docChargeId,
      };
    } else {
      incomeList.unshift(incomeEntry);
    }

    localStorage.setItem(INCOME_STORAGE_KEY, JSON.stringify(incomeList));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("storage"));
    }
    return incomeEntry;
  } catch (err) {
    console.error("Failed to sync document charge income:", err);
    return null;
  }
};

/**
 * Reconciles document charges from customer loans to ensure
 * all existing loans with document charges are reflected in motoLendIncome_data.
 */
export const reconcileLoanDocumentCharges = () => {
  try {
    const rawCusts = localStorage.getItem(CUSTOMERS_STORAGE_KEY);
    if (!rawCusts) return;
    const custs = JSON.parse(rawCusts);
    if (!Array.isArray(custs)) return;

    custs.forEach((c) => {
      const charge = Number(c.loan?.documentCharge || c.documentCharge || 0);
      const lId = c.loanId || (c.customerId ? `LN-${c.customerId.replace("CUS-", "")}` : null);
      if (charge > 0 && lId) {
        syncDocumentChargeIncome({
          loanId: lId,
          customerId: c.customerId || "—",
          customerName: c.customer?.name || c.name || "Customer",
          documentCharge: charge,
          date: c.customer?.applicationDate || c.createdAt || new Date().toISOString(),
          mode: c.loan?.paymentMode || "Cash",
        });
      }
    });
  } catch (err) {
    console.error("Failed to reconcile loan document charges:", err);
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
      const refObj = c.referral;
      const refBy = c.customer?.referredBy || c.loan?.referredBy || c.referredBy;
      let isRefMatch = false;

      if (refObj && (refObj.fullName || refObj.name || refObj.phone || refObj.mobile || refObj.referralId || refObj.id)) {
        const rPhone = normalizePhone(refObj.phone || refObj.mobile);
        const rName = (refObj.fullName || refObj.name || "").trim().toLowerCase();
        const rId = refObj.referralId || refObj.id;
        if (
          (rId && rId === record.id) ||
          (recPhone && rPhone && recPhone === rPhone) ||
          (recName && rName && recName === rName)
        ) {
          isRefMatch = true;
        }
      }

      if (!isRefMatch && refBy && typeof refBy === "string" && refBy.trim()) {
        const refName = refBy.trim().toLowerCase();
        if (recName && recName === refName) {
          isRefMatch = true;
        }
      }

      if (isRefMatch) {
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
            commissionAmount: refObj?.commissionAmount,
            commissionPercentage: refObj?.commissionPercentage,
            commissionStatus: refObj?.commissionStatus || (refObj?.payCommission ? "Paid" : undefined),
          });
        }
      }
    });
  } catch (err) {
    console.error("Error reading relationships from storage:", err);
  }

  // Cross-reference commissions stored in COMMISSIONS_STORAGE_KEY
  try {
    const rawComms = localStorage.getItem(COMMISSIONS_STORAGE_KEY);
    if (rawComms) {
      const comms = JSON.parse(rawComms);
      comms.forEach((sc) => {
        const matchId = sc.referralId && sc.referralId === record.id;
        const matchPhone = recPhone && normalizePhone(sc.referrerPhone) === recPhone;
        const matchName = recName && (sc.referrerName || "").trim().toLowerCase() === recName;
        if (matchId || matchPhone || matchName) {
          const exists = rels.some(
            (r) => r.type === "Referral" && r.customerId === sc.customerId && r.loanId === sc.loanId
          );
          if (!exists) {
            rels.push({
              id: `rel-r-comm-${sc.id || sc.loanId}`,
              type: "Referral",
              customerId: sc.customerId || "—",
              customerName: sc.customerName || "Customer",
              loanId: sc.loanId || "—",
              associatedDate: sc.paidDate || sc.createdAt || null,
              commissionAmount: sc.commissionAmount || sc.amount,
              commissionPercentage: sc.percentage,
              commissionStatus: sc.status || "Pending",
            });
          }
        }
      });
    }
  } catch (err) {
    console.error("Error reading stored commissions in getRecordRelationships:", err);
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

/**
 * Computes consolidated relationship details, tab lists, KPIs, and documents
 * for a selected person in the Referral / Guarantor directory.
 * 
 * Rules:
 * - Linked Customers: Count distinct customers across all relationships (same customer with multiple loans counted once).
 * - As Guarantor: Count distinct customer-loan relationships where person is Guarantor.
 * - As Referral: Count distinct customer-loan relationships where person is Referral.
 * - Both: Customer-loan relationships where the person is BOTH Guarantor AND Referral for that same loan.
 * - Tab Guarantor: Shows all customer-loan relationships where person is Guarantor (including Both).
 * - Tab Referral: Shows all customer-loan relationships where person is Referral (including Both), with commission details.
 * - Tab Both: Shows only customer-loan relationships where person has BOTH roles for that same loan.
 * - Tab Documents: Shared documents (Aadhaar, PAN, KYC docs), deduplicated.
 * - Commission: Shows Paid/Pending if configured, or "Not Configured" if unconfigured. Never false "₹0 Pending".
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

  // 1. Fetch all raw relationships (from record, customers, and stored commissions)
  const allRelationships = getRecordRelationships(record);

  // 2. Load stored commissions and customer records for cross-referencing
  let storedCommissions = [];
  try {
    const rawComms = localStorage.getItem(COMMISSIONS_STORAGE_KEY);
    storedCommissions = rawComms ? JSON.parse(rawComms) : [];
  } catch {
    storedCommissions = [];
  }

  let customersList = [];
  try {
    const rawCusts = localStorage.getItem(CUSTOMERS_STORAGE_KEY);
    customersList = rawCusts ? JSON.parse(rawCusts) : [];
  } catch {
    customersList = [];
  }

  const recName = (record.fullName || "").trim().toLowerCase();
  const recPhone = normalizePhone(record.phone);
  const recId = record.id;

  // 3. Group by Customer-Loan pair (unique loan relationship)
  // Pair key: customerId + loanId
  const loanPairs = new Map();

  allRelationships.forEach((rel) => {
    const custId = rel.customerId || "—";
    const loanId = rel.loanId || "—";
    // Unique key per customer-loan relationship
    const pairKey = (loanId && loanId !== "—")
      ? `${custId}___${loanId}`
      : `${custId}___${rel.id || Math.random()}`;

    if (!loanPairs.has(pairKey)) {
      loanPairs.set(pairKey, {
        customerId: custId,
        customerName: rel.customerName || "Customer",
        loanId: loanId,
        associatedDate: rel.associatedDate || null,
        isGuarantor: false,
        isReferral: false,
        relGuarantor: null,
        relReferral: null,
      });
    }

    const pair = loanPairs.get(pairKey);
    if (rel.type === "Guarantor") {
      pair.isGuarantor = true;
      pair.relGuarantor = rel;
      if (!pair.associatedDate && rel.associatedDate) pair.associatedDate = rel.associatedDate;
    } else if (rel.type === "Referral") {
      pair.isReferral = true;
      pair.relReferral = rel;
      if (!pair.associatedDate && rel.associatedDate) pair.associatedDate = rel.associatedDate;
    } else if (rel.type === "Both") {
      pair.isGuarantor = true;
      pair.isReferral = true;
      pair.relGuarantor = rel;
      pair.relReferral = rel;
      if (!pair.associatedDate && rel.associatedDate) pair.associatedDate = rel.associatedDate;
    }
  });

  // Also check storedCommissions for any registered referral loan
  storedCommissions.forEach((sc) => {
    const matchId = sc.referralId && sc.referralId === recId;
    const matchPhone = recPhone && normalizePhone(sc.referrerPhone) === recPhone;
    const matchName = recName && (sc.referrerName || "").trim().toLowerCase() === recName;
    if (matchId || matchPhone || matchName) {
      const custId = sc.customerId || "—";
      const loanId = sc.loanId || "—";
      const pairKey = (loanId && loanId !== "—") ? `${custId}___${loanId}` : `${custId}___comm-${sc.id}`;

      if (!loanPairs.has(pairKey)) {
        loanPairs.set(pairKey, {
          customerId: custId,
          customerName: sc.customerName || "Customer",
          loanId: loanId,
          associatedDate: sc.paidDate || sc.createdAt || null,
          isGuarantor: false,
          isReferral: true,
          relGuarantor: null,
          relReferral: null,
        });
      } else {
        const pair = loanPairs.get(pairKey);
        pair.isReferral = true;
      }
    }
  });

  // 4. Resolve commission information for each Referral relationship
  const resolveCommission = (pair) => {
    const loanId = pair.loanId;
    const custId = pair.customerId;

    // A. Check stored commissions (motoLendReferralCommissions_data)
    const storedComm = storedCommissions.find((sc) => {
      const matchLoan = loanId && loanId !== "—" && sc.loanId === loanId;
      const matchCust = custId && custId !== "—" && sc.customerId === custId;
      const matchPerson =
        (sc.referralId && sc.referralId === recId) ||
        (recPhone && normalizePhone(sc.referrerPhone) === recPhone) ||
        (recName && (sc.referrerName || "").trim().toLowerCase() === recName);
      return (matchLoan || matchCust) && matchPerson;
    });

    // B. Check customer record (motoLendCustomersList_data)
    const custRecord = customersList.find((c) => {
      return (loanId && loanId !== "—" && c.loanId === loanId) ||
             (custId && custId !== "—" && c.customerId === custId);
    });

    // C. Check inline commissions in record.commissions
    const recordComm = Array.isArray(record.commissions)
      ? record.commissions.find((c) => (loanId && loanId !== "—" && c.loanId === loanId))
      : null;

    // D. Check relationship object
    const rel = pair.relReferral;

    let percentage = null;
    let amount = null;
    let status = null;

    if (storedComm) {
      if (storedComm.percentage !== undefined && storedComm.percentage !== null && storedComm.percentage !== "") {
        const p = Number(storedComm.percentage);
        if (!isNaN(p)) percentage = p;
      }
      const rawAmt = storedComm.commissionAmount ?? storedComm.amount;
      if (rawAmt !== undefined && rawAmt !== null && rawAmt !== "") {
        const a = Number(rawAmt);
        if (!isNaN(a)) amount = a;
      }
      if (storedComm.status === "Paid" || storedComm.status === "Pending") {
        status = storedComm.status;
      }
    }

    if (custRecord?.referral) {
      const r = custRecord.referral;
      if (percentage === null && r.commissionPercentage !== undefined && r.commissionPercentage !== null && r.commissionPercentage !== "") {
        const p = Number(r.commissionPercentage);
        if (!isNaN(p)) percentage = p;
      }
      if (amount === null && r.commissionAmount !== undefined && r.commissionAmount !== null && r.commissionAmount !== "") {
        const a = Number(r.commissionAmount);
        if (!isNaN(a)) amount = a;
      }
      if (!status) {
        if (r.payCommission === true || r.commissionStatus === "Paid") {
          status = "Paid";
        } else if (r.commissionStatus === "Pending") {
          status = "Pending";
        }
      }
    }

    if (recordComm) {
      if (percentage === null && recordComm.percentage !== undefined && recordComm.percentage !== null && recordComm.percentage !== "") {
        const p = Number(recordComm.percentage);
        if (!isNaN(p)) percentage = p;
      }
      const rawAmt = recordComm.commissionAmount ?? recordComm.amount;
      if (amount === null && rawAmt !== undefined && rawAmt !== null && rawAmt !== "") {
        const a = Number(rawAmt);
        if (!isNaN(a)) amount = a;
      }
      if (!status && (recordComm.status === "Paid" || recordComm.status === "Pending")) {
        status = recordComm.status;
      }
    }

    if (rel) {
      if (percentage === null && rel.commissionPercentage !== undefined && rel.commissionPercentage !== null && rel.commissionPercentage !== "") {
        const p = Number(rel.commissionPercentage);
        if (!isNaN(p)) percentage = p;
      }
      if (amount === null && rel.commissionAmount !== undefined && rel.commissionAmount !== null && rel.commissionAmount !== "") {
        const a = Number(rel.commissionAmount);
        if (!isNaN(a)) amount = a;
      }
      if (!status && (rel.commissionStatus === "Paid" || rel.commissionStatus === "Pending")) {
        status = rel.commissionStatus;
      }
    }

    // Auto-calculate amount if percentage and loan principal exist, but amount was 0
    if ((amount === null || amount <= 0) && percentage !== null && percentage > 0) {
      const principal = Number(storedComm?.loanAmount || custRecord?.loanAmount || custRecord?.loan?.loanAmount || 0);
      if (principal > 0) {
        amount = Math.round((principal * percentage) / 100);
      }
    }

    // Configuration check:
    // If neither percentage > 0 nor amount > 0, and not explicitly Paid -> NOT CONFIGURED!
    const isConfigured = (percentage !== null && percentage > 0) || (amount !== null && amount > 0) || (status === "Paid");

    if (!isConfigured) {
      return {
        isConfigured: false,
        percentage: null,
        percentageDisplay: "Not Configured",
        amount: null,
        amountDisplay: "—",
        status: "Not Configured",
      };
    }

    return {
      isConfigured: true,
      percentage: percentage,
      percentageDisplay: percentage !== null && percentage > 0 ? `${percentage}%` : "—",
      amount: amount,
      amountDisplay: amount !== null && amount > 0 ? `₹${amount.toLocaleString("en-IN")}` : "—",
      status: status === "Paid" ? "Paid" : "Pending",
    };
  };

  // 5. Build Tab Records
  const guarantorList = [];
  const referralList = [];
  const bothList = [];

  loanPairs.forEach((pair, key) => {
    if (pair.isGuarantor) {
      guarantorList.push({
        id: `g-${key}`,
        customerId: pair.customerId,
        customerName: pair.customerName,
        loanId: pair.loanId,
        type: "Guarantor",
        associatedDate: pair.associatedDate,
      });
    }

    if (pair.isReferral) {
      const comm = resolveCommission(pair);
      referralList.push({
        id: `r-${key}`,
        customerId: pair.customerId,
        customerName: pair.customerName,
        loanId: pair.loanId,
        type: "Referral",
        commissionPercentage: comm.percentage,
        commissionPercentageDisplay: comm.percentageDisplay,
        commissionAmount: comm.amount,
        commissionAmountDisplay: comm.amountDisplay,
        commissionStatus: comm.status,
        isCommissionConfigured: comm.isConfigured,
        associatedDate: pair.associatedDate,
      });
    }

    if (pair.isGuarantor && pair.isReferral) {
      bothList.push({
        id: `b-${key}`,
        customerId: pair.customerId,
        customerName: pair.customerName,
        loanId: pair.loanId,
        type: "Both",
        associatedDate: pair.associatedDate,
      });
    }
  });

  // Sort lists by date descending
  const sortByDate = (a, b) => new Date(b.associatedDate || 0) - new Date(a.associatedDate || 0);
  guarantorList.sort(sortByDate);
  referralList.sort(sortByDate);
  bothList.sort(sortByDate);

  // 6. Calculate Distinct Customers for KPI
  const distinctCustSet = new Set();
  loanPairs.forEach((pair) => {
    if (pair.isGuarantor || pair.isReferral) {
      const identifier = (pair.customerId && pair.customerId !== "—") ? pair.customerId : pair.customerName;
      if (identifier) distinctCustSet.add(identifier);
    }
  });

  const kpis = {
    linkedCustomers: distinctCustSet.size,
    asGuarantor: guarantorList.length,
    asReferral: referralList.length,
  };

  // 7. Deduplicate Shared Documents
  const documents = [];
  const seenDocs = new Set();

  const addDoc = (id, title, file) => {
    if (!file) return;
    const dataKey = file.data || file.name || id;
    if (seenDocs.has(dataKey)) return;
    seenDocs.add(dataKey);

    documents.push({
      id: id,
      title: title,
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

  if (Array.isArray(record.additionalDocs)) {
    record.additionalDocs.forEach((doc, idx) => {
      if (doc) {
        addDoc(doc.id || `doc-${idx}`, doc.title || `Document #${idx + 1}`, doc.file || doc);
      }
    });
  }

  // Cross-reference linked customers for any KYC documents attached to this person
  customersList.forEach((c) => {
    const g = c.guarantor;
    if (g) {
      const isMatch =
        (g.guarantorId && g.guarantorId === recId) ||
        (g.id && g.id === recId) ||
        (recPhone && normalizePhone(g.mobile || g.phone) === recPhone) ||
        (recName && (g.name || g.fullName || "").trim().toLowerCase() === recName);
      if (isMatch) {
        if (g.aadhaarFile) addDoc("cust-g-aadhaar", "Aadhaar Card", g.aadhaarFile);
        if (g.panFile) addDoc("cust-g-pan", "PAN Card", g.panFile);
        if (g.dlFile) addDoc("cust-g-dl", "Driving License", g.dlFile);
        if (g.voterFile) addDoc("cust-g-voter", "Voter ID", g.voterFile);
        if (Array.isArray(g.additionalDocs)) {
          g.additionalDocs.forEach((d, i) => addDoc(`cust-g-doc-${i}`, d.title || "Additional Document", d.file || d));
        }
      }
    }

    const r = c.referral;
    if (r) {
      const isMatch =
        (r.referralId && r.referralId === recId) ||
        (r.id && r.id === recId) ||
        (recPhone && normalizePhone(r.phone || r.mobile) === recPhone) ||
        (recName && (r.fullName || r.name || "").trim().toLowerCase() === recName);
      if (isMatch) {
        if (r.aadhaarFile) addDoc("cust-r-aadhaar", "Aadhaar Card", r.aadhaarFile);
        if (r.panFile) addDoc("cust-r-pan", "PAN Card", r.panFile);
        if (Array.isArray(r.additionalDocs)) {
          r.additionalDocs.forEach((d, i) => addDoc(`cust-r-doc-${i}`, d.title || "Additional Document", d.file || d));
        }
      }
    }
  });

  return {
    guarantorList,
    referralList,
    bothList,
    kpis,
    documents,
  };
};
