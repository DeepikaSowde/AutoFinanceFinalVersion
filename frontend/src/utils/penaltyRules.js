/**
 * MotoLend — Penalty & Grace Period rules, backed by the API (/api/penalties).
 *
 * The server owns penalties: the company-wide Penalty & Grace settings, every
 * penalty that is due or has been acted on (Pending / Frozen / Cancelled /
 * Collected), and penalty-only payments (each booked as "Penalty" income).
 * This module keeps the last copy loaded from the server so the getters answer
 * immediately during render, fires PENALTY_UPDATE_EVENT whenever a fresh copy
 * arrives, and sends freeze / unfreeze / cancel / collect / settings changes
 * to the server (which re-checks every amount) before refreshing the copy.
 *
 * The rule functions below (eligibility, summaries) are unchanged and only
 * used for display; the server applies the same rules.
 */

import { useEffect, useState } from 'react';
import { DATA_CHANGED_EVENT, apiGet, apiPost, apiPut } from '../services/api';
import { parseToDate } from './dateUtils.js';

export const PENALTY_UPDATE_EVENT = 'motoLend_penalty_settings_updated';

// Sensible initial defaults: 0 grace days, Fixed Penalty, ₹0 amount, Monthly enabled by default
export const DEFAULT_PENALTY_SETTINGS = {
  Daily: {
    enabled: false,
    gracePeriodDays: 0,
    penaltyType: 'Fixed Penalty', // 'Fixed Penalty' | 'Daily Increasing'
    fixedAmount: 0,
    dailyRate: 0,
  },
  Weekly: {
    enabled: false,
    gracePeriodDays: 0,
    penaltyType: 'Fixed Penalty',
    fixedAmount: 0,
    dailyRate: 0,
  },
  Monthly: {
    enabled: true,
    gracePeriodDays: 0,
    penaltyType: 'Fixed Penalty',
    fixedAmount: 0,
    dailyRate: 0,
  },
  updatedAt: null,
};

/* ---------- server copy ---------- */

let settingsCache = { ...DEFAULT_PENALTY_SETTINGS };
let recordsCache = [];
let transactionsCache = [];
let loading = null;
let loadedOnce = false;
let version = 0;

const notify = () => {
  version += 1;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PENALTY_UPDATE_EVENT));
};

/** Reloads settings, penalties and penalty payments; concurrent calls share one request. */
export const loadPenaltyData = () => {
  if (!loading) {
    loading = apiGet('/penalties')
      .then((data) => {
        settingsCache = { ...DEFAULT_PENALTY_SETTINGS, ...(data?.settings || {}) };
        recordsCache = Array.isArray(data?.records) ? data.records : [];
        transactionsCache = Array.isArray(data?.transactions) ? data.transactions : [];
        loadedOnce = true;
        notify();
        return data;
      })
      .finally(() => {
        loading = null;
      });
  }
  return loading;
};

// Payments, reversals and penalty actions anywhere in the app change penalties.
if (typeof window !== 'undefined') {
  window.addEventListener(DATA_CHANGED_EVENT, () => {
    if (loadedOnce) loadPenaltyData().catch(() => {});
  });
}

/**
 * Loads the penalty copy on first use and re-renders the component whenever a
 * fresh copy arrives. Returns a number that changes with each copy, for use
 * as a memo dependency.
 */
export const usePenaltyData = () => {
  const [current, setCurrent] = useState(version);
  useEffect(() => {
    const update = () => setCurrent(version);
    window.addEventListener(PENALTY_UPDATE_EVENT, update);
    if (!loadedOnce) loadPenaltyData().catch(() => {});
    else update();
    return () => window.removeEventListener(PENALTY_UPDATE_EVENT, update);
  }, []);
  return current;
};

/** The company-wide Penalty & Grace settings (last loaded copy). */
export const getPenaltySettings = () => settingsCache;

/** Every penalty that is due today or has been acted on (last loaded copy). */
export const getPenaltyRecords = () => recordsCache;

/** Penalty-only payments (last loaded copy). */
export const getPenaltyTransactions = () => transactionsCache;

/**
 * Saves the settings (admins only). Pending penalties follow the new rules at
 * once; Frozen, Cancelled and Collected ones are untouched. Resolves to
 * { settings, changesCount } — how many pending penalty amounts changed.
 */
export const savePenaltySettings = async (settings) => {
  const { Daily, Weekly, Monthly } = settings || {};
  const result = await apiPut('/penalties/settings', { Daily, Weekly, Monthly });
  await loadPenaltyData();
  return result;
};

/* ---------- actions (server) ---------- */

const PENALTY_ID = /^PEN-(.+)-(\d+)$/;

// A penalty is addressed by its loan and instalment number.
const targetOf = (recordOrId) => {
  if (recordOrId && typeof recordOrId === 'object') {
    if (recordOrId.loanId && Number(recordOrId.installmentNumber) > 0) {
      return { loanId: recordOrId.loanId, installmentNumber: Number(recordOrId.installmentNumber) };
    }
    return targetOf(recordOrId.id);
  }
  const m = PENALTY_ID.exec(String(recordOrId || ''));
  return m ? { loanId: m[1], installmentNumber: Number(m[2]) } : null;
};

const groupByLoan = (recordsOrIds) => {
  const groups = new Map();
  (Array.isArray(recordsOrIds) ? recordsOrIds : [recordsOrIds]).forEach((item) => {
    const target = targetOf(item);
    if (!target?.loanId || !target.installmentNumber) return;
    if (!groups.has(target.loanId)) groups.set(target.loanId, []);
    groups.get(target.loanId).push(target.installmentNumber);
  });
  return groups;
};

const runAction = async (path, recordsOrIds, body = {}) => {
  const groups = groupByLoan(recordsOrIds);
  if (!groups.size) throw new Error('No penalty selected.');
  const updated = [];
  for (const [loanId, installmentNumbers] of groups) {
    const records = await apiPost(`/penalties/loans/${encodeURIComponent(loanId)}/${path}`, {
      ...body,
      installmentNumbers,
    });
    const wanted = new Set(installmentNumbers);
    updated.push(...(records || []).filter((r) => wanted.has(Number(r.installmentNumber))));
  }
  await loadPenaltyData();
  return updated;
};

/** Freezes penalties (one record, an id, or a list): the amount is locked until unfrozen. Resolves to the updated records. */
export const freezePenaltyRecords = (recordsOrIds) => runAction('freeze', recordsOrIds);

/** Unfreezes penalties back to Pending. Resolves to the updated records. */
export const unfreezePenaltyRecords = (recordsOrIds) => runAction('unfreeze', recordsOrIds);

/** Cancels penalties permanently (needs Collections "Approve / Reverse"). Resolves to the updated records. */
export const cancelPenaltyRecords = (recordsOrIds, reason = 'Cancelled by Administrator') =>
  runAction('cancel', recordsOrIds, { reason });

export const freezePenaltyRecord = async (recordOrId) => (await freezePenaltyRecords([recordOrId]))[0] || null;
export const unfreezePenaltyRecord = async (recordOrId) => (await unfreezePenaltyRecords([recordOrId]))[0] || null;
export const cancelPenaltyRecord = async (recordOrId, reason) => (await cancelPenaltyRecords([recordOrId], reason))[0] || null;

/**
 * One penalty-only payment across the given pending penalties of a loan. The
 * server marks each Collected and books one "Penalty" income entry; principal
 * and interest are never touched. A repeat with the same clientRef or
 * transactionRef returns the first payment instead of charging twice.
 * Resolves to { transaction, updatedRecords }.
 */
export const collectPenaltyTransaction = async ({
  loanId,
  records = [],
  collectedAmount = 0,
  collectionDate = new Date().toISOString(),
  paymentMode = 'Cash',
  transactionRef = null,
  clientRef = null,
}) => {
  const pending = (records || []).filter((r) => r.status === 'Pending');
  const installmentNumbers = [...new Set(pending.map((r) => Number(r.installmentNumber)))];
  if (!loanId || !installmentNumbers.length || !(Number(collectedAmount) > 0)) return null;

  const result = await apiPost(`/penalties/loans/${encodeURIComponent(loanId)}/collect`, {
    installmentNumbers,
    amount: Number(collectedAmount),
    collectionDate,
    paymentMode,
    transactionRef: transactionRef && String(transactionRef).trim() ? String(transactionRef).trim() : null,
    clientRef: clientRef || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : null),
  });
  await loadPenaltyData();
  const wanted = new Set(installmentNumbers);
  return {
    transaction: result?.transaction || null,
    updatedRecords: (result?.records || []).filter((r) => wanted.has(Number(r.installmentNumber))),
  };
};

/** Collects a single penalty (see collectPenaltyTransaction). Resolves to the updated record. */
export const collectPenaltyRecord = async (record, { amount = null, collectionDate, paymentMode = 'Cash', transactionRef = null, loanId = '' } = {}) => {
  const result = await collectPenaltyTransaction({
    loanId: loanId || record?.loanId,
    records: [record],
    collectedAmount: amount ?? record?.calculatedAmount,
    collectionDate,
    paymentMode,
    transactionRef,
  });
  return result?.updatedRecords?.[0] || null;
};

/* ---------- rules (display only; the server applies the same) ---------- */

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

  // If already fully paid under existing collection logic or foreclosed, no penalty
  const emi = Number(installment.emi || 0);
  const amountPaid = Number(installment.amountPaid || 0);
  const remainingBal = Math.max(0, emi - amountPaid);
  if (remainingBal <= 0.01 || installment.status === 'Paid' || installment.status === 'Collected' || installment.status === 'Foreclosed') {
    return { isEligible: false, eligibleOverdueDays: 0, penaltyAmount: 0 };
  }

  const normFreq = normalizeFrequency(frequency);
  const rule = settings[normFreq] || DEFAULT_PENALTY_SETTINGS[normFreq];

  // If frequency is disabled (specifically when Monthly penalty is disabled):
  // Stop applying new grace-period rules and penalty calculations
  const isEnabled = normFreq === 'Monthly' ? (rule.enabled !== false) : Boolean(rule.enabled);
  if (!isEnabled) {
    return {
      isEligible: false,
      eligibleOverdueDays: 0,
      penaltyAmount: 0,
      disabled: true,
      normFreq,
    };
  }

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
 * - If status is 'Frozen', it returns the frozen record unchanged.
 * - If frequency is disabled (e.g. Monthly disabled):
 *     - If an existing record exists, it is preserved completely without modification.
 *     - If no existing record exists, returns null (no new penalties generated).
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

  const rule = settings[normFreq] || DEFAULT_PENALTY_SETTINGS[normFreq];
  const isEnabled = normFreq === 'Monthly' ? (rule.enabled !== false) : Boolean(rule.enabled);

  // When disabled (specifically Monthly disabled):
  // Preserve all existing penalty records, amounts, dates, and statuses without rewriting or zeroing them out
  if (!isEnabled) {
    return existing || null;
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

    // Pending penalty that already exists: return its preserved calculated amount if > 0
    if (existing && existing.status === 'Pending') {
      return Number(existing.calculatedAmount || 0) > 0 ? Number(existing.calculatedAmount) : null;
    }
  }

  const normFreq = normalizeFrequency(frequency);
  const rule = activeSettings[normFreq] || DEFAULT_PENALTY_SETTINGS[normFreq];
  const isEnabled = normFreq === 'Monthly' ? (rule.enabled !== false) : Boolean(rule.enabled);

  // If disabled and no existing record exists, do not generate or show new penalties
  if (!isEnabled) {
    return null;
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
  referenceDate = new Date(),
  customSettings = null
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
  const settings = customSettings || getPenaltySettings();
  const targetLoanId = String(loanId || '').trim().toLowerCase();
  const loanRecords = existingRecords.filter((r) => String(r.loanId || '').trim().toLowerCase() === targetLoanId);

  // Group existing records by numeric installmentNumber
  const recordsByInstallment = {};
  loanRecords.forEach((r) => {
    recordsByInstallment[String(Number(r.installmentNumber))] = r;
  });

  // A foreclosed loan owes no further penalties (the server drops its
  // pending and frozen ones too); collected and cancelled ones stay.
  const isLoanForeclosed =
    schedule.length > 0 &&
    schedule.every((s) => s.status === 'Paid' || s.status === 'Collected' || s.status === 'Foreclosed') &&
    schedule.some((s) => s.status === 'Foreclosed');

  const pendingPenaltyRecords = [];
  const frozenPenaltyRecords = [];
  const collectedPenaltyRecords = [];
  const cancelledPenaltyRecords = [];

  const sortRecord = (r) => {
    if (r.status === 'Frozen') {
      if (!isLoanForeclosed) frozenPenaltyRecords.push(r);
    } else if (r.status === 'Collected') {
      collectedPenaltyRecords.push(r);
    } else if (r.status === 'Cancelled') {
      cancelledPenaltyRecords.push(r);
    } else if (r.status === 'Pending') {
      // The server's pending amount is live (as of today).
      if (!isLoanForeclosed && Number(r.calculatedAmount) > 0) pendingPenaltyRecords.push(r);
    }
  };

  // Check each installment in schedule
  schedule.forEach((inst) => {
    const instNumStr = String(Number(inst.installmentNumber));
    const existing = recordsByInstallment[instNumStr];

    if (existing) {
      sortRecord(existing);
      return;
    }

    if (isLoanForeclosed) return;

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
      if (rec && rec.status === 'Pending' && Number(rec.calculatedAmount) > 0) {
        pendingPenaltyRecords.push(rec);
      }
    }
  });

  // Also include the loan's penalty records whose installment was not in the schedule given
  const visitedInstNumbers = new Set(schedule.map((s) => String(Number(s.installmentNumber))));
  loanRecords.forEach((r) => {
    if (!visitedInstNumbers.has(String(Number(r.installmentNumber)))) sortRecord(r);
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

