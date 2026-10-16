/**
 * MotoLend — Penalty & Grace Period Business Rules and Storage
 *
 * Provides:
 * - Persistent storage for Penalty & Grace Period settings across Daily, Weekly, and Monthly frequencies.
 * - Persistent storage for Penalty Records (Pending, Collected, Cancelled).
 * - Exact calendar day calculation and penalty eligibility.
 * - Recalculation of Pending penalties upon settings update without corrupting Collected or Cancelled records.
 */

import { parseToDate, getLocalDateString } from './dateUtils.js';

export const PENALTY_SETTINGS_STORAGE_KEY = 'motoLendPenaltySettings_data';
export const PENALTY_RECORDS_STORAGE_KEY = 'motoLendPenaltyRecords_data';
export const PENALTY_UPDATE_EVENT = 'motoLend_penalty_settings_updated';

// Sensible initial defaults: 0 grace days, Fixed Penalty, ₹0 amount
export const DEFAULT_PENALTY_SETTINGS = {
  Daily: {
    gracePeriodDays: 0,
    penaltyType: 'Fixed Penalty', // 'Fixed Penalty' | 'Daily Increasing'
    fixedAmount: 0,
    dailyRate: 0,
  },
  Weekly: {
    gracePeriodDays: 0,
    penaltyType: 'Fixed Penalty',
    fixedAmount: 0,
    dailyRate: 0,
  },
  Monthly: {
    gracePeriodDays: 0,
    penaltyType: 'Fixed Penalty',
    fixedAmount: 0,
    dailyRate: 0,
  },
  updatedAt: null,
};

/**
 * Loads penalty settings from localStorage, or returns default if not configured.
 */
export const getPenaltySettings = () => {
  try {
    const raw = localStorage.getItem(PENALTY_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PENALTY_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      Daily: { ...DEFAULT_PENALTY_SETTINGS.Daily, ...(parsed.Daily || {}) },
      Weekly: { ...DEFAULT_PENALTY_SETTINGS.Weekly, ...(parsed.Weekly || {}) },
      Monthly: { ...DEFAULT_PENALTY_SETTINGS.Monthly, ...(parsed.Monthly || {}) },
      updatedAt: parsed.updatedAt || null,
    };
  } catch (err) {
    console.error('Failed to parse penalty settings from storage:', err);
    return { ...DEFAULT_PENALTY_SETTINGS };
  }
};

/**
 * Saves penalty settings to localStorage and triggers storage/custom event.
 */
export const savePenaltySettings = (settings) => {
  const updatedSettings = {
    ...settings,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(PENALTY_SETTINGS_STORAGE_KEY, JSON.stringify(updatedSettings));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent(PENALTY_UPDATE_EVENT, { detail: updatedSettings }));
  }
  return updatedSettings;
};

/**
 * Loads all penalty records.
 */
export const getPenaltyRecords = () => {
  try {
    const raw = localStorage.getItem(PENALTY_RECORDS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to load penalty records:', err);
    return [];
  }
};

/**
 * Saves all penalty records to localStorage.
 */
export const savePenaltyRecords = (records) => {
  localStorage.setItem(PENALTY_RECORDS_STORAGE_KEY, JSON.stringify(records));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('storage'));
  }
  return records;
};

/**
 * Calculates calendar day difference between two dates (baseDate - targetDate).
 * Uses UTC date values to prevent daylight saving or timezone hour drift.
 *
 * Example:
 * targetDate = "2026-10-10", baseDate = "2026-10-13" -> 3 calendar days.
 */
export const getCalendarDaysDiff = (targetDateInput, baseDateInput = new Date()) => {
  const d1 = parseToDate(targetDateInput);
  const d2 = parseToDate(baseDateInput);
  if (!d1 || !d2) return 0;

  const utc1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
  const utc2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((utc2 - utc1) / msPerDay);
};

/**
 * Normalizes payment frequency string to 'Daily' | 'Weekly' | 'Monthly'.
 */
export const normalizeFrequency = (freq) => {
  const s = String(freq || '').trim().toLowerCase();
  if (s.includes('day') || s.includes('daily')) return 'Daily';
  if (s.includes('week')) return 'Weekly';
  return 'Monthly';
};

/**
 * Checks if an installment is overdue and eligible for penalty.
 *
 * Rules:
 * - Installment must not be fully paid.
 * - Installment dueDate must be in the past relative to reference date.
 * - Days past due date must exceed configured grace period.
 *
 * Example:
 * Due on 10th, grace period = 2 days:
 * 11th (1 day past): grace day, not eligible.
 * 12th (2 days past): grace day, not eligible.
 * 13th (3 days past): grace period elapsed! First eligible day.
 * Eligible overdue days = 3 - 2 = 1.
 */
export const checkInstallmentPenaltyEligibility = (
  installment,
  frequency = 'Monthly',
  settings = getPenaltySettings(),
  referenceDate = new Date()
) => {
  if (!installment) return { isEligible: false, eligibleOverdueDays: 0, penaltyAmount: 0 };

  // If already fully paid under existing collection logic, no penalty
  const emi = Number(installment.emi || 0);
  const amountPaid = Number(installment.amountPaid || 0);
  const remainingBal = Math.max(0, emi - amountPaid);
  if (remainingBal <= 0.01 || installment.status === 'Paid' || installment.status === 'Collected') {
    return { isEligible: false, eligibleOverdueDays: 0, penaltyAmount: 0 };
  }

  const normFreq = normalizeFrequency(frequency);
  const rule = settings[normFreq] || DEFAULT_PENALTY_SETTINGS[normFreq];
  const graceDays = Math.max(0, parseInt(rule.gracePeriodDays, 10) || 0);

  const daysPastDueDate = getCalendarDaysDiff(installment.dueDate, referenceDate);
  if (daysPastDueDate <= graceDays) {
    return { isEligible: false, eligibleOverdueDays: 0, penaltyAmount: 0, daysPastDueDate, graceDays };
  }

  // Eligible days strictly beyond the grace period
  const eligibleOverdueDays = daysPastDueDate - graceDays;

  let penaltyAmount = 0;
  if (rule.penaltyType === 'Daily Increasing') {
    const rate = Math.max(0, Number(rule.dailyRate || 0));
    penaltyAmount = Math.round(rate * eligibleOverdueDays);
  } else {
    // Fixed Penalty: charged once per eligible overdue installment
    penaltyAmount = Math.max(0, Number(rule.fixedAmount || 0));
  }

  return {
    isEligible: penaltyAmount > 0,
    eligibleOverdueDays,
    penaltyAmount,
    penaltyType: rule.penaltyType,
    graceDays,
    daysPastDueDate,
    rule,
  };
};

/**
 * Finds or calculates the active eligible Pending penalty for an installment.
 *
 * Looks up existing records first:
 * - If status is 'Cancelled', it stays permanently cancelled.
 * - If status is 'Collected', it returns the collected record unchanged.
 * - If status is 'Pending', recalculates amount using latest settings.
 * - If no record exists yet, returns newly calculated pending penalty object.
 */
export const getOrCalculatePenaltyRecord = (
  loanId,
  customerId,
  customerName,
  installment,
  frequency = 'Monthly',
  existingRecords = getPenaltyRecords(),
  settings = getPenaltySettings(),
  referenceDate = new Date()
) => {
  const normFreq = normalizeFrequency(frequency);
  const instNum = Number(installment.installmentNumber);
  const recordId = `PEN-${loanId}-${instNum}`;

  const existing = existingRecords.find(
    (r) => r.id === recordId || (r.loanId === loanId && Number(r.installmentNumber) === instNum)
  );

  // If already Cancelled: permanently cancelled, never recreated
  if (existing && existing.status === 'Cancelled') {
    return existing;
  }

  // If already Collected: never altered
  if (existing && existing.status === 'Collected') {
    return existing;
  }

  // If already Frozen: exact amount preserved, never recalculated or increased
  if (existing && existing.status === 'Frozen') {
    return existing;
  }

  // Evaluate current eligibility under latest settings
  const eligibility = checkInstallmentPenaltyEligibility(installment, normFreq, settings, referenceDate);
  if (!eligibility.isEligible && !existing) {
    return null;
  }

  // If previously pending, but now no longer eligible (e.g. grace period extended beyond overdue days)
  if (!eligibility.isEligible && existing && existing.status === 'Pending') {
    return {
      ...existing,
      eligibleDays: eligibility.eligibleOverdueDays,
      calculatedAmount: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  const nowIso = new Date().toISOString();
  const rule = settings[normFreq] || DEFAULT_PENALTY_SETTINGS[normFreq];

  if (existing && existing.status === 'Pending') {
    // Audit amount change if calculated amount updated
    const oldAmount = existing.calculatedAmount;
    const newAmount = eligibility.penaltyAmount;
    const auditTrail = Array.isArray(existing.auditTrail) ? [...existing.auditTrail] : [];

    if (oldAmount !== newAmount) {
      auditTrail.push({
        timestamp: nowIso,
        action: 'RECALCULATED',
        oldAmount,
        newAmount,
        reason: 'Recalculated with updated settings/overdue days',
      });
    }

    return {
      ...existing,
      gracePeriod: eligibility.graceDays,
      penaltyType: eligibility.penaltyType,
      configuredAmount: eligibility.penaltyType === 'Daily Increasing' ? rule.dailyRate : rule.fixedAmount,
      eligibleDays: eligibility.eligibleOverdueDays,
      calculatedAmount: newAmount,
      updatedAt: nowIso,
      auditTrail,
    };
  }

  // New Pending record
  return {
    id: recordId,
    loanId,
    customerId,
    customerName,
    installmentNumber: instNum,
    dueDate: installment.dueDate,
    repaymentFrequency: normFreq,
    gracePeriod: eligibility.graceDays,
    penaltyType: eligibility.penaltyType,
    configuredAmount: eligibility.penaltyType === 'Daily Increasing' ? rule.dailyRate : rule.fixedAmount,
    eligibleDays: eligibility.eligibleOverdueDays,
    calculatedAmount: eligibility.penaltyAmount,
    actualAmountCollected: 0,
    status: 'Pending',
    collectionDate: null,
    cancellationDate: null,
    cancellationReason: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    auditTrail: [
      {
        timestamp: nowIso,
        action: 'CREATED',
        amount: eligibility.penaltyAmount,
        reason: 'Initial penalty eligibility calculation',
      },
    ],
  };
};

/**
 * Recalculates all Pending penalties across all active loans using updated settings.
 * Preserves Collected and Cancelled penalties without any changes.
 */
export const recalculateAllPendingPenalties = (newSettings = getPenaltySettings()) => {
  try {
    const existingRecords = getPenaltyRecords();
    const customers = JSON.parse(localStorage.getItem('motoLendCustomersList_data') || '[]');

    let updatedRecords = [...existingRecords];
    let changesCount = 0;

    customers.forEach((cust) => {
      const loanId = cust.loanId || cust.loan?.loanId;
      if (!loanId) return;

      const customerId = cust.customerId || cust.customer?.customerId || '';
      const customerName = cust.customer?.name || cust.name || 'Customer';
      const frequency = cust.loan?.paymentFrequency || cust.paymentFrequency || 'Monthly';
      const schedule = cust.repaymentSchedule || [];

      schedule.forEach((inst) => {
        const instNum = Number(inst.installmentNumber);
        const recordId = `PEN-${loanId}-${instNum}`;
        const existingIdx = updatedRecords.findIndex(
          (r) => r.id === recordId || (r.loanId === loanId && Number(r.installmentNumber) === instNum)
        );

        const existing = existingIdx >= 0 ? updatedRecords[existingIdx] : null;

        // Skip permanently collected, cancelled, or frozen
        if (existing && (existing.status === 'Collected' || existing.status === 'Cancelled' || existing.status === 'Frozen')) {
          return;
        }

        const eligibility = checkInstallmentPenaltyEligibility(inst, frequency, newSettings);

        if (eligibility.isEligible) {
          const recalculated = getOrCalculatePenaltyRecord(
            loanId,
            customerId,
            customerName,
            inst,
            frequency,
            updatedRecords,
            newSettings
          );

          if (recalculated) {
            if (existingIdx >= 0) {
              if (updatedRecords[existingIdx].calculatedAmount !== recalculated.calculatedAmount) {
                changesCount++;
              }
              updatedRecords[existingIdx] = recalculated;
            } else {
              updatedRecords.push(recalculated);
              changesCount++;
            }
          }
        } else if (existing && existing.status === 'Pending') {
          // No longer eligible due to extended grace period
          if (existing.calculatedAmount > 0) {
            changesCount++;
          }
          updatedRecords[existingIdx] = {
            ...existing,
            eligibleDays: eligibility.eligibleOverdueDays,
            calculatedAmount: 0,
            updatedAt: new Date().toISOString(),
          };
        }
      });
    });

    savePenaltyRecords(updatedRecords);
    return { updatedRecords, changesCount };
  } catch (err) {
    console.error('Error recalculating pending penalties:', err);
    return { updatedRecords: getPenaltyRecords(), changesCount: 0 };
  }
};

/**
 * Permanently cancels a Pending or Frozen penalty record.
 */
export const cancelPenaltyRecord = (recordOrId, reason = 'Cancelled by Administrator') => {
  const records = getPenaltyRecords();
  const id = typeof recordOrId === 'string' ? recordOrId : recordOrId?.id;
  const idx = records.findIndex((r) => r.id === id);

  let target = idx >= 0 ? records[idx] : (typeof recordOrId === 'object' && recordOrId ? { ...recordOrId } : null);
  if (!target) return false;

  if (target.status === 'Collected') {
    console.warn('Cannot cancel an already collected penalty.');
    return false;
  }

  const nowIso = new Date().toISOString();
  const updated = {
    ...target,
    status: 'Cancelled',
    cancellationDate: nowIso,
    cancellationReason: reason,
    updatedAt: nowIso,
    auditTrail: [
      ...(Array.isArray(target.auditTrail) ? target.auditTrail : []),
      {
        timestamp: nowIso,
        action: 'CANCELLED',
        amount: Number(target.calculatedAmount || 0),
        reason,
      },
    ],
  };

  if (idx >= 0) {
    records[idx] = updated;
  } else {
    records.push(updated);
  }
  savePenaltyRecords(records);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('storage'));
  }
  return updated;
};

/**
 * Freezes a penalty record, preserving its exact amount and recording the action in history.
 */
export const freezePenaltyRecord = (recordOrId, freezeAmount = null) => {
  const records = getPenaltyRecords();
  const id = typeof recordOrId === 'string' ? recordOrId : recordOrId?.id;
  const idx = records.findIndex((r) => r.id === id);

  const nowIso = new Date().toISOString();
  let target = idx >= 0 ? records[idx] : (typeof recordOrId === 'object' && recordOrId ? { ...recordOrId } : null);
  if (!target) return null;

  if (target.status === 'Collected') {
    console.warn('Cannot freeze an already collected penalty.');
    return target;
  }
  if (target.status === 'Cancelled') {
    console.warn('Cannot freeze a cancelled penalty.');
    return target;
  }

  const preservedAmount =
    freezeAmount !== null && !isNaN(Number(freezeAmount)) && Number(freezeAmount) > 0
      ? Number(freezeAmount)
      : Number(target.calculatedAmount || 0);

  const updated = {
    ...target,
    status: 'Frozen',
    calculatedAmount: preservedAmount,
    updatedAt: nowIso,
    auditTrail: [
      ...(Array.isArray(target.auditTrail) ? target.auditTrail : []),
      {
        timestamp: nowIso,
        action: 'FROZEN',
        amount: preservedAmount,
        reason: 'Penalty frozen by user',
      },
    ],
  };

  if (idx >= 0) {
    records[idx] = updated;
  } else {
    records.push(updated);
  }
  savePenaltyRecords(records);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('storage'));
  }
  return updated;
};

/**
 * Marks a penalty record as Collected, saves collection date & amount,
 * records audit trail, and creates a separate Penalty Income record in motoLendIncome_data.
 */
export const collectPenaltyRecord = (
  recordOrId,
  {
    amount = null,
    collectionDate = new Date().toISOString(),
    paymentMode = 'Cash',
    transactionRef = null,
    customerId = '',
    customerName = 'Customer',
    loanId = '',
  } = {}
) => {
  const records = getPenaltyRecords();
  const id = typeof recordOrId === 'string' ? recordOrId : recordOrId?.id;
  const idx = records.findIndex((r) => r.id === id);

  const nowIso = new Date().toISOString();
  let target = idx >= 0 ? records[idx] : (typeof recordOrId === 'object' && recordOrId ? { ...recordOrId } : null);
  if (!target) return null;

  if (target.status === 'Collected') {
    console.warn('Penalty already collected.');
    return target;
  }

  const collectedAmt = Number(
    amount !== undefined && amount !== null && !isNaN(Number(amount))
      ? amount
      : target.calculatedAmount || 0
  );

  const finalTxnRef = transactionRef || target.transactionRef || `TX-PEN-${Date.now()}`;

  const updated = {
    ...target,
    status: 'Collected',
    actualAmountCollected: collectedAmt,
    collectionDate,
    transactionRef: finalTxnRef,
    updatedAt: nowIso,
    auditTrail: [
      ...(Array.isArray(target.auditTrail) ? target.auditTrail : []),
      {
        timestamp: nowIso,
        action: 'COLLECTED',
        amount: collectedAmt,
        reason: 'Penalty collected',
        transactionRef: finalTxnRef,
      },
    ],
  };

  if (idx >= 0) {
    records[idx] = updated;
  } else {
    records.push(updated);
  }
  savePenaltyRecords(records);

  // Record separate Penalty Income entry in motoLendIncome_data
  try {
    const existingIncome = JSON.parse(localStorage.getItem('motoLendIncome_data') || '[]');
    const alreadyExists = existingIncome.some(
      (inc) => inc.penaltyRecordId === updated.id || (inc.type === 'Penalty' && inc.penaltyRecordId === updated.id)
    );

    if (!alreadyExists && collectedAmt > 0) {
      const penaltyIncomeEntry = {
        id: `INC-PEN-${Date.now()}`,
        type: 'Penalty',
        category: 'Penalty Income',
        amount: collectedAmt,
        date: collectionDate,
        customerId: customerId || updated.customerId,
        customerName: customerName || updated.customerName || 'Customer',
        loanId: loanId || updated.loanId,
        installmentNumber: updated.installmentNumber,
        penaltyRecordId: updated.id,
        penaltyType: updated.penaltyType,
        gracePeriod: updated.gracePeriod,
        configuredAmount: updated.configuredAmount,
        calculatedAmount: updated.calculatedAmount,
        actualAmountCollected: collectedAmt,
        mode: paymentMode,
        transactionRef: finalTxnRef,
        remarks: `Penalty collected for Installment ${updated.installmentNumber}`,
        createdAt: nowIso,
      };
      existingIncome.push(penaltyIncomeEntry);
      localStorage.setItem('motoLendIncome_data', JSON.stringify(existingIncome));
    }
  } catch (err) {
    console.error('Failed to save penalty income:', err);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('storage'));
  }
  return updated;
};

export const PENALTY_TRANSACTIONS_STORAGE_KEY = 'motoLendPenaltyTransactions_data';

export const getPenaltyTransactions = () => {
  try {
    const raw = localStorage.getItem(PENALTY_TRANSACTIONS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to load penalty transactions:', err);
    return [];
  }
};

export const savePenaltyTransactions = (txns) => {
  localStorage.setItem(PENALTY_TRANSACTIONS_STORAGE_KEY, JSON.stringify(txns));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('storage'));
  }
  return txns;
};

/**
 * Executes a single penalty collection transaction across one or more eligible pending penalty installments.
 *
 * Rules:
 * 1. Creates exactly ONE transaction record with actual penalty amount before collection and amount collected.
 * 2. Creates exactly ONE separate Penalty Income entry in motoLendIncome_data.
 * 3. Never marks an installment penalty as fully collected if user paid only part of applicable total.
 * 4. Allocates collected amount chronologically across pending installments; preserves remaining balance on unpaid/partially paid installments.
 * 5. Prevents duplicate execution if triggered multiple times with same transactionRef.
 * 6. Never adds penalty to normal collection income or alters principal/interest outstanding.
 */
export const collectPenaltyTransaction = ({
  loanId,
  customerId = '',
  customerName = 'Customer',
  records = [],
  collectedAmount = 0,
  collectionDate = new Date().toISOString(),
  paymentMode = 'Cash',
  transactionRef = null,
}) => {
  const amtToCollect = Number(collectedAmount || 0);
  if (amtToCollect <= 0 || !records || records.length === 0) return null;

  // Filter to pending records only - Frozen and Cancelled penalties must NEVER be collected
  const pendingRecords = records.filter((r) => r.status === 'Pending');
  if (pendingRecords.length === 0) return null;

  // Sort by installment number ascending
  pendingRecords.sort((a, b) => Number(a.installmentNumber) - Number(b.installmentNumber));

  const nowIso = new Date().toISOString();
  const finalTxnRef = transactionRef && transactionRef.trim() !== '' ? transactionRef.trim() : `TX-PEN-${Date.now()}`;

  // Prevent duplicate execution if transactionRef already recorded
  const existingTxns = getPenaltyTransactions();
  const alreadyExists = existingTxns.find((t) => t.transactionRef === finalTxnRef);
  if (alreadyExists) {
    return { transaction: alreadyExists, updatedRecords: [] };
  }

  // Calculate total applicable penalty before collection
  const totalApplicableAmount = pendingRecords.reduce(
    (sum, r) => sum + Number(r.calculatedAmount || 0),
    0
  );

  const installmentNums = pendingRecords.map((r) => Number(r.installmentNumber));
  const instDisplay = installmentNums.join(', ');

  const allRecords = getPenaltyRecords();
  const updatedRecords = [];

  // When user confirms an edited penalty collection:
  // Rule 4: Mark that transaction as Collected. Do not display Pending as another row for the unpaid difference.
  // Rule 5: Do not invent per-installment payment allocations when user has made one combined penalty payment.
  // Mark all participating pending penalty records as Collected so they do not produce separate Pending rows.
  pendingRecords.forEach((rec) => {
    const recId = rec.id || `PEN-${loanId}-${rec.installmentNumber}`;
    const idx = allRecords.findIndex((r) => r.id === recId);
    let target = idx >= 0 ? allRecords[idx] : { ...rec, id: recId, loanId, customerId };

    target = {
      ...target,
      status: 'Collected',
      calculatedAmount: 0,
      actualAmountCollected: amtToCollect,
      collectionDate,
      transactionRef: finalTxnRef,
      updatedAt: nowIso,
      auditTrail: [
        ...(Array.isArray(target.auditTrail) ? target.auditTrail : []),
        {
          timestamp: nowIso,
          action: 'COLLECTED',
          amount: amtToCollect,
          transactionRef: finalTxnRef,
          reason: 'Penalty collected via combined transaction',
        },
      ],
    };

    if (idx >= 0) {
      allRecords[idx] = target;
    } else {
      allRecords.push(target);
    }
    updatedRecords.push(target);
  });

  savePenaltyRecords(allRecords);

  // 1. Record single collection transaction
  const newTx = {
    id: `PTX-${Date.now()}`,
    transactionRef: finalTxnRef,
    loanId,
    customerId,
    customerName,
    date: collectionDate,
    installmentNumbers: installmentNums,
    installmentDisplay: instDisplay,
    actualPenaltyAmount: totalApplicableAmount,
    calculatedPenaltyAmount: totalApplicableAmount,
    collectedAmount: amtToCollect,
    status: 'Collected',
    paymentMode,
    createdAt: nowIso,
  };

  existingTxns.push(newTx);
  savePenaltyTransactions(existingTxns);

  // 2. Record exactly ONE Penalty Income entry in motoLendIncome_data
  try {
    const existingIncome = JSON.parse(localStorage.getItem('motoLendIncome_data') || '[]');
    const incExists = existingIncome.some((inc) => inc.transactionRef === finalTxnRef);
    if (!incExists && amtToCollect > 0) {
      existingIncome.push({
        id: `INC-PEN-${Date.now()}`,
        type: 'Penalty',
        category: 'Penalty Income',
        amount: amtToCollect,
        date: collectionDate,
        customerId,
        customerName,
        loanId,
        installmentNumbers: installmentNums,
        installmentNumber: instDisplay,
        transactionRef: finalTxnRef,
        actualPenaltyAmount: totalApplicableAmount,
        collectedAmount: amtToCollect,
        mode: paymentMode,
        remarks: `Penalty collection for Installment ${instDisplay}`,
        createdAt: nowIso,
      });
      localStorage.setItem('motoLendIncome_data', JSON.stringify(existingIncome));
    }
  } catch (err) {
    console.error('Failed to save penalty income record:', err);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('storage'));
  }

  return { transaction: newTx, updatedRecords };
};

/**
 * Calculates or retrieves the applicable penalty amount for an installment
 * to be displayed as supporting text below the Overdue status.
 *
 * Requirements:
 * 1. Installment must be overdue and not fully paid.
 * 2. Configured grace period has expired according to application logic.
 * 3. Existing penalty calculation determines that penalty is eligible (> 0).
 * 4. Installment has not been fully paid or midway closed.
 * 5. Penalty is not cancelled or already collected.
 *
 * Returns positive number if eligible, or null if not eligible.
 */
export const getInstallmentPenaltySupportingAmount = (
  installment,
  {
    loanId = null,
    frequency = 'Monthly',
    settings = null,
    penaltyRecords = null,
    referenceDate = new Date(),
  } = {}
) => {
  if (!installment) return null;

  // 1. Fully paid, midway settled, or zero balance installments are not eligible
  const emi = Number(installment.emi || 0);
  const amountPaid = Number(installment.amountPaid || 0);
  const remainingBal = Math.max(0, emi - amountPaid);
  if (
    remainingBal <= 0.01 ||
    installment.status === 'Paid' ||
    installment.status === 'Collected' ||
    installment.status === 'Midway Closed' ||
    installment.isMidwayClosed ||
    installment.closureAdjusted
  ) {
    return null;
  }

  // Load settings and records if not provided
  const activeSettings = settings || getPenaltySettings();
  const activeRecords = penaltyRecords || getPenaltyRecords();

  // 2. Lookup existing penalty record if loanId is available
  const effectiveLoanId = loanId || installment.loanId || null;
  const instNum = Number(installment.installmentNumber);

  if (effectiveLoanId && Array.isArray(activeRecords)) {
    const recordId = `PEN-${effectiveLoanId}-${instNum}`;
    const existing = activeRecords.find(
      (r) =>
        r.id === recordId ||
        (r.loanId === effectiveLoanId && Number(r.installmentNumber) === instNum)
    );

    // Cancelled penalty: never shown as pending or recreated
    if (existing && existing.status === 'Cancelled') {
      return null;
    }

    // Collected penalty: never implied as unpaid
    if (existing && existing.status === 'Collected') {
      return null;
    }

    // Frozen penalty: return the exact preserved frozen amount
    if (existing && existing.status === 'Frozen') {
      return Number(existing.calculatedAmount || 0);
    }
  }

  // 3. Evaluate eligibility using existing penalty calculation logic
  const eligibility = checkInstallmentPenaltyEligibility(
    installment,
    frequency,
    activeSettings,
    referenceDate
  );

  if (!eligibility.isEligible || Number(eligibility.penaltyAmount || 0) <= 0) {
    return null;
  }

  return eligibility.penaltyAmount;
};

/**
 * Unfreezes a frozen penalty record, changing its status from 'Frozen' to 'Pending'
 * while preserving the exact existing penalty amount.
 *
 * Requirements:
 * 1. Change status from 'Frozen' to 'Pending'.
 * 2. Preserve existing penalty amount.
 * 3. User can then choose whether to collect it or leave it pending.
 * 4. Record 'UNFROZEN' event in audit trail.
 */
export const unfreezePenaltyRecord = (recordOrId) => {
  const records = getPenaltyRecords();
  const id = typeof recordOrId === 'string' ? recordOrId : recordOrId?.id;
  const idx = records.findIndex((r) => r.id === id);

  const nowIso = new Date().toISOString();
  let target = idx >= 0 ? records[idx] : (typeof recordOrId === 'object' && recordOrId ? { ...recordOrId } : null);
  if (!target) return null;

  if (target.status !== 'Frozen') {
    return target;
  }

  const preservedAmount = Number(target.calculatedAmount || 0);

  const updated = {
    ...target,
    status: 'Pending',
    calculatedAmount: preservedAmount,
    updatedAt: nowIso,
    auditTrail: [
      ...(Array.isArray(target.auditTrail) ? target.auditTrail : []),
      {
        timestamp: nowIso,
        action: 'UNFROZEN',
        amount: preservedAmount,
        reason: 'Penalty unfrozen by user to Pending status',
      },
    ],
  };

  if (idx >= 0) {
    records[idx] = updated;
  } else {
    records.push(updated);
  }
  savePenaltyRecords(records);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('storage'));
  }
  return updated;
};

/**
 * Aggregates penalty records and amounts across ALL eligible unpaid installments of a loan.
 *
 * Requirements (FIX 3):
 * 1. Calculate each installment's penalty using existing Penalty & Grace Settings and calculation logic.
 * 2. Identify all relevant installments whose penalties are eligible under existing due-date and grace-period rules.
 * 3. Sum their current applicable penalty amounts for the loan (e.g. 3 overdue installments * ₹100 = ₹300).
 * 4. Display accumulated total in penalty summary / penalty-only collection context when multiple are collected together.
 * 5. Retain each installment's individual penalty amount and record for traceable history in Penalty Log.
 * 6. Exclude collected and cancelled penalties from pending collectible total.
 * 7. Exclude frozen penalties from pending collectible total until explicitly unfrozen.
 * 8. Never duplicate penalty amounts.
 * 9. Never create extra penalty records just to compute display total.
 * 10. Never sum across unrelated loans.
 */
export const getLoanPenaltySummary = (
  loanId,
  customerId,
  customerName,
  schedule = [],
  frequency = 'Monthly',
  referenceDate = new Date()
) => {
  if (!loanId) {
    return {
      loanId: '',
      eligibleCount: 0,
      totalPendingPenalty: 0,
      totalFrozenPenalty: 0,
      totalCollectedPenalty: 0,
      totalCancelledPenalty: 0,
      pendingPenaltyRecords: [],
      frozenPenaltyRecords: [],
      collectedPenaltyRecords: [],
      cancelledPenaltyRecords: [],
      allPenaltyRecords: [],
    };
  }

  const existingRecords = getPenaltyRecords();
  const settings = getPenaltySettings();
  const loanRecords = existingRecords.filter((r) => r.loanId === loanId);

  // Group existing records by installmentNumber
  const recordsByInstallment = {};
  loanRecords.forEach((r) => {
    recordsByInstallment[String(r.installmentNumber)] = r;
  });

  const pendingPenaltyRecords = [];
  const frozenPenaltyRecords = [];
  const collectedPenaltyRecords = [];
  const cancelledPenaltyRecords = [];

  // Check each installment in schedule
  schedule.forEach((inst) => {
    const instNumStr = String(inst.installmentNumber);
    const existing = recordsByInstallment[instNumStr];

    if (existing) {
      if (existing.status === 'Frozen') {
        frozenPenaltyRecords.push(existing);
      } else if (existing.status === 'Collected') {
        collectedPenaltyRecords.push(existing);
      } else if (existing.status === 'Cancelled') {
        cancelledPenaltyRecords.push(existing);
      } else if (existing.status === 'Pending') {
        pendingPenaltyRecords.push(existing);
      }
      return;
    }

    // If no existing record, check if eligible under grace-period rules
    const eligibility = checkInstallmentPenaltyEligibility(inst, frequency, settings, referenceDate);
    if (eligibility.isEligible) {
      const rec = getOrCalculatePenaltyRecord(
        loanId,
        customerId,
        customerName,
        inst,
        frequency,
        existingRecords,
        settings,
        referenceDate
      );
      if (rec && rec.status === 'Pending') {
        pendingPenaltyRecords.push(rec);
      }
    }
  });

  const totalPendingPenalty = pendingPenaltyRecords.reduce(
    (sum, r) => sum + (Number(r.calculatedAmount) || 0),
    0
  );
  const totalFrozenPenalty = frozenPenaltyRecords.reduce(
    (sum, r) => sum + (Number(r.calculatedAmount) || 0),
    0
  );
  const totalCollectedPenalty = collectedPenaltyRecords.reduce(
    (sum, r) => sum + (Number(r.amountCollected) || Number(r.calculatedAmount) || 0),
    0
  );
  const totalCancelledPenalty = cancelledPenaltyRecords.reduce(
    (sum, r) => sum + (Number(r.calculatedAmount) || 0),
    0
  );

  return {
    loanId,
    eligibleCount: pendingPenaltyRecords.length + frozenPenaltyRecords.length,
    totalPendingPenalty,
    totalFrozenPenalty,
    totalCollectedPenalty,
    totalCancelledPenalty,
    pendingPenaltyRecords,
    pendingPenalties: pendingPenaltyRecords,
    frozenPenaltyRecords,
    frozenPenalties: frozenPenaltyRecords,
    collectedPenaltyRecords,
    collectedPenalties: collectedPenaltyRecords,
    cancelledPenaltyRecords,
    cancelledPenalties: cancelledPenaltyRecords,
    allPenaltyRecords: loanRecords,
  };
};

