/**
 * Foreclosure & Vehicle Sale Calculations and Settlement Engine
 */

import { calculateLoanOutstanding } from './loanCalculations.js';
import { getLoanPenaltySummary, getPenaltySettings, normalizeFrequency } from './penaltyRules.js';
import { getForeclosureSettings } from './foreclosureSettings.js';
import { generateSchedule, computeEffectiveSchedule } from '../components/RepaymentScheduleTable.jsx';
import { parseToDate } from './dateUtils.js';

const parseDateMs = (dStr) => {
  if (!dStr) return 0;
  const t = new Date(dStr).getTime();
  return isNaN(t) ? 0 : t;
};

/**
 * Calculates the seized-period interest based on actual dates and selected basis:
 * - Option A: Within-Tenure Overdue/Seized Period + Post-Tenure Period until sale date
 * - Option B: Additional Post-Tenure Period Only
 */
export const calculateSeizedPeriodInterest = ({
  record,
  saleDate,
  basis = 'Option A',
  allPayments = [],
}) => {
  if (!record) return { amount: 0, duration: 0, unit: 'Months', startDate: '', endDate: '', basis };

  const loan = record.loan || {};
  const vehicle = record.vehicle || {};
  const frequency = (loan.paymentFrequency || record.paymentFrequency || 'Monthly').toLowerCase();

  // 1. Identify Seizure Date
  const seizureDetails =
    vehicle.seizureDetails ||
    record.seizureDetails ||
    (record.statusHistory || []).find((h) => h.toStatus === 'Seized') ||
    {};

  const seizureDateStr =
    seizureDetails.seizureDate ||
    seizureDetails.date?.split('T')[0] ||
    record.seizureDate ||
    loan.firstDueDate ||
    loan.disbursementDate ||
    saleDate;

  // 2. Identify Original Tenure End Date
  let tenureEndDateStr = '';
  const schedule = (Array.isArray(record.repaymentSchedule) && record.repaymentSchedule.length > 0)
    ? record.repaymentSchedule
    : (Array.isArray(record.loan?.repaymentSchedule) && record.loan.repaymentSchedule.length > 0)
      ? record.loan.repaymentSchedule
      : [];
  if (schedule.length > 0) {
    tenureEndDateStr = schedule[schedule.length - 1].dueDate;
  } else if (loan.tenure) {
    const tenureNum = Number(loan.tenure) || 1;
    const start = new Date(loan.firstDueDate || seizureDateStr);
    if (frequency === 'daily') {
      start.setDate(start.getDate() + tenureNum);
    } else if (frequency === 'weekly') {
      start.setDate(start.getDate() + tenureNum * 7);
    } else {
      start.setMonth(start.getMonth() + tenureNum);
    }
    tenureEndDateStr = start.toISOString().split('T')[0];
  } else {
    tenureEndDateStr = saleDate;
  }

  const seizureMs = parseDateMs(seizureDateStr);
  const tenureEndMs = parseDateMs(tenureEndDateStr);
  const saleMs = parseDateMs(saleDate);

  // 3. Determine Periodic Interest Rate & Amount
  // Average periodic interest from schedule if available, else derive from principal & interestRate
  let periodicInterest = 0;
  if (schedule.length > 0) {
    const totalSchedInterest = schedule.reduce((sum, s) => sum + Number(s.interest || 0), 0);
    periodicInterest = schedule.length > 0 ? totalSchedInterest / schedule.length : 0;
  } else {
    const P = Number(loan.loanAmount || record.loanAmount || 0);
    const rate = Number(loan.interestRate || record.interestRate || 0);
    if (frequency === 'daily') {
      periodicInterest = (P * (rate / 100)) / 30; // Daily interest
    } else if (frequency === 'weekly') {
      periodicInterest = (P * (rate / 100)) / 4.33; // Weekly interest
    } else {
      periodicInterest = P * (rate / 100); // Monthly interest
    }
  }

  // Millisecond constants
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const ONE_WEEK_MS = 7 * ONE_DAY_MS;
  const ONE_MONTH_MS = 30.4375 * ONE_DAY_MS;

  let unit = 'Months';
  let divisor = ONE_MONTH_MS;
  if (frequency === 'daily') {
    unit = 'Days';
    divisor = ONE_DAY_MS;
  } else if (frequency === 'weekly') {
    unit = 'Weeks';
    divisor = ONE_WEEK_MS;
  }

  // 4. Calculate Durations
  // A. Post-Tenure Period (from tenure end date to sale date)
  let postTenureDuration = 0;
  let postTenureStart = tenureEndDateStr;
  let postTenureEnd = saleDate;

  if (saleMs > tenureEndMs) {
    postTenureDuration = Math.max(0, Math.round((saleMs - tenureEndMs) / divisor));
  }

  // B. Within-Tenure Overdue/Seized Period (from seizure date to tenure end date, capped at tenure end)
  let withinTenureDuration = 0;
  let withinTenureStart = seizureDateStr;
  let withinTenureEnd = tenureEndDateStr;

  if (tenureEndMs > seizureMs) {
    const withinEndMs = Math.min(saleMs, tenureEndMs);
    withinTenureDuration = Math.max(0, Math.round((withinEndMs - seizureMs) / divisor));
    withinTenureEnd = new Date(withinEndMs).toISOString().split('T')[0];
  }

  let finalDuration = 0;
  let finalStartDate = '';
  let finalEndDate = saleDate;
  let calculatedAmount = 0;

  if (basis === 'Option B') {
    // Option B: Additional Post-Tenure Period Only
    finalDuration = postTenureDuration;
    finalStartDate = postTenureStart;
    finalEndDate = postTenureEnd;
    calculatedAmount = Math.max(0, Math.round(finalDuration * periodicInterest));
  } else {
    // Option A: Include Within-Tenure Period + Post-Tenure Period
    finalDuration = withinTenureDuration + postTenureDuration;
    finalStartDate = seizureDateStr;
    finalEndDate = saleDate;
    calculatedAmount = Math.max(0, Math.round(finalDuration * periodicInterest));
  }

  return {
    amount: calculatedAmount,
    duration: finalDuration,
    unit,
    startDate: finalStartDate,
    endDate: finalEndDate,
    basis,
    withinTenureDuration,
    postTenureDuration,
    periodicInterest: Math.round(periodicInterest),
    withinTenureAmount: Math.max(0, Math.round(withinTenureDuration * periodicInterest)),
    postTenureAmount: Math.max(0, Math.round(postTenureDuration * periodicInterest)),
  };
};

/**
 * Calculates the complete sold-vehicle foreclosure breakdown and profit/loss:
 *
 * Total Foreclosure Cost = Outstanding Principal + Unpaid Interest
 *                        + Enabled Vehicle Expenses
 *                        + Enabled Seized-Period Interest
 *                        + Enabled Applicable Penalty
 *
 * Profit/Loss = Vehicle Sale Amount − Total Foreclosure Cost
 */
export const calculateForeclosureSale = ({
  record,
  salePrice = 0,
  saleDate = new Date().toISOString().split('T')[0],
  vehicleExpensesInput = null,
  foreclosureSettings = null,
  penaltySettings = null,
  allPayments = [],
}) => {
  const fSettings = foreclosureSettings || getForeclosureSettings();
  const pSettings = penaltySettings || getPenaltySettings();

  const saleAmountNum = Number(salePrice) || 0;

  // 1. Outstanding Principal and Scheduled Unpaid Interest
  const loanOutstanding = calculateLoanOutstanding(record, allPayments, { ignoreClosedStatus: true });
  const outstandingPrincipal = Math.max(0, Math.round(Number(loanOutstanding?.outstandingPrincipal || loanOutstanding?.outstandingAmount || 0)));
  const scheduledUnpaidInterest = Math.max(0, Math.round(Number(loanOutstanding?.unpaidInterest || 0)));

  // 2. Vehicle Expenses
  let resolvedExpenses = 0;
  if (vehicleExpensesInput !== null && vehicleExpensesInput !== undefined && !isNaN(Number(vehicleExpensesInput))) {
    resolvedExpenses = Math.max(0, Number(vehicleExpensesInput));
  } else {
    const saleDetails = record?.vehicle?.saleDetails || record?.saleDetails || {};
    resolvedExpenses = Number(saleDetails.vehicleExpenses || saleDetails.saleExpenses || 0);
  }
  const enabledExpenses = fSettings.includeVehicleExpenses ? resolvedExpenses : 0;

  // 3. Seized-Period Interest
  const seizedInterestDetails = calculateSeizedPeriodInterest({
    record,
    saleDate,
    basis: fSettings.seizedPeriodBasis,
    allPayments,
  });

  const enabledSeizedInterest = fSettings.includeSeizedPeriodInterest
    ? Number(seizedInterestDetails.amount || 0)
    : 0;

  // Double-counting safeguard:
  // When Option A is enabled (which includes within-tenure seized period interest),
  // deduct any within-tenure interest that is already present in scheduled unpaid interest
  // so the borrower is not charged twice for the same within-tenure months.
  let netUnpaidScheduledInterest = scheduledUnpaidInterest;
  if (fSettings.includeSeizedPeriodInterest && fSettings.seizedPeriodBasis === 'Option A') {
    const overlapDeduction = Math.min(scheduledUnpaidInterest, seizedInterestDetails.withinTenureAmount || 0);
    netUnpaidScheduledInterest = Math.max(0, scheduledUnpaidInterest - overlapDeduction);
  }

  // 4. Applicable Penalty (respects both Foreclosure Settings & Penalty Settings)
  let enabledPenalty = 0;
  let penaltyReason = '';
  let penaltyEngineEnabled = false;

  const rawFrequency = record?.paymentFrequency || record?.loan?.paymentFrequency || 'Monthly';
  const normFreq = typeof normalizeFrequency === 'function' 
    ? normalizeFrequency(rawFrequency) 
    : (String(rawFrequency).toLowerCase().includes('day') ? 'Daily' : String(rawFrequency).toLowerCase().includes('week') ? 'Weekly' : 'Monthly');
  
  const rule = pSettings[normFreq] || { enabled: normFreq === 'Monthly', gracePeriodDays: 0, penaltyType: 'Fixed Penalty', fixedAmount: 0, dailyRate: 0 };
  
  // Frequency check:
  // For Monthly: defaults to enabled unless explicitly set to false
  // For Daily & Weekly: disabled unless explicitly enabled
  const isFreqEnabled = normFreq === 'Monthly' 
    ? (rule?.enabled === false ? false : true)
    : Boolean(rule?.enabled);

  // Global penalty check: if pSettings has an explicit enabled: false flag
  const isGloballyEnabled = pSettings?.enabled !== false && pSettings?.isGloballyEnabled !== false && pSettings?.globalEnabled !== false;

  let penaltyDetails = {
    enabled: false,
    frequency: normFreq,
    frequencyEnabled: isFreqEnabled,
    reason: '',
    eligibleCount: 0,
    amount: 0,
    penaltyType: rule?.penaltyType || 'Fixed Penalty',
    gracePeriodDays: rule?.gracePeriodDays ?? 0,
  };

  if (!fSettings.includePenalty) {
    penaltyReason = 'Excluded: Applicable penalty is disabled in Foreclosure Settings';
  } else if (!isGloballyEnabled) {
    penaltyReason = 'Excluded: Penalty is globally disabled in Penalty Settings';
  } else if (!isFreqEnabled) {
    penaltyReason = `Excluded: ${normFreq} penalty is disabled in Penalty Settings`;
  } else {
    // Both foreclosure setting and frequency penalty are enabled
    penaltyEngineEnabled = true;

    // Resolve full schedule from loanOutstanding or base record, or generate from loan parameters
    const baseSchedule = (loanOutstanding && Array.isArray(loanOutstanding.effectiveSchedule) && loanOutstanding.effectiveSchedule.length > 0)
      ? loanOutstanding.effectiveSchedule
      : (Array.isArray(record?.repaymentSchedule) && record.repaymentSchedule.length > 0)
        ? record.repaymentSchedule
        : (Array.isArray(record?.loan?.repaymentSchedule) && record.loan.repaymentSchedule.length > 0)
          ? record.loan.repaymentSchedule
          : [];

    let schedule = baseSchedule;
    if (!schedule || schedule.length === 0) {
      const loan = record?.loan || {};
      const vehicle = record?.vehicle || {};
      const vehicleAmount = loan.vehicleAmount !== '' && loan.vehicleAmount !== null && loan.vehicleAmount !== undefined
        ? Number(loan.vehicleAmount)
        : Number(vehicle.amount || 0);
      const downPayment = Number(loan.downPayment || 0);
      const principal = Number(record?.loanAmount || loan.loanAmount || (vehicleAmount - downPayment) || 0);
      const interestRate = loan.interestRate || record?.interestRate;
      const tenure = loan.tenure || record?.tenure;

      if (principal > 0 && interestRate && tenure) {
        const rawSched = generateSchedule({
          loanAmount: principal,
          interestRate,
          tenure,
          tenureUnit: loan.tenureUnit || record?.tenureUnit || 'Months',
          paymentFrequency: normFreq,
          interestType: loan.interestType || record?.interestType || 'Flat',
          repaymentMethod: loan.repaymentMethod || record?.repaymentMethod || 'EMI',
          firstDueDate: loan.firstDueDate || record?.nextDueDate,
        });
        schedule = computeEffectiveSchedule(rawSched, allPayments);
      }
    }

    const loanId = record?.loanId || record?.loan?.loanId || record?.vehicle?.loanId || '';
    const custId = record?.customerId || record?.customer?.customerId || '';
    const custName = record?.customer?.name || record?.name || '';

    const penaltySummary = getLoanPenaltySummary(
      loanId,
      custId,
      custName,
      schedule,
      normFreq,
      parseToDate(saleDate) || new Date(saleDate),
      pSettings
    );

    const pendingAmt = Math.max(0, Math.round(Number(penaltySummary.totalPendingPenalty || 0)));
    const pendingCount = penaltySummary.pendingPenaltyRecords?.length || 0;
    const frozenCount = penaltySummary.frozenPenaltyRecords?.length || 0;
    const cancelledCount = penaltySummary.cancelledPenaltyRecords?.length || 0;

    if (pendingAmt > 0) {
      enabledPenalty = pendingAmt;
      penaltyReason = `Included: ₹${pendingAmt.toLocaleString('en-IN')} across ${pendingCount} eligible overdue installment(s) (${rule.penaltyType || 'Fixed Penalty'})`;
    } else if (frozenCount > 0 && pendingCount === 0) {
      penaltyReason = `Excluded: Penalty is frozen (${frozenCount} installment(s))`;
    } else if (cancelledCount > 0 && pendingCount === 0) {
      penaltyReason = 'Excluded: Penalty was cancelled by administrator';
    } else {
      penaltyReason = 'No eligible unpaid penalties (within grace period or up to date)';
    }

    // Store only lightweight scalar details to prevent localStorage bloat
    penaltyDetails = {
      enabled: enabledPenalty > 0,
      frequency: normFreq,
      frequencyEnabled: isFreqEnabled,
      reason: penaltyReason,
      eligibleCount: pendingCount,
      amount: enabledPenalty,
      penaltyType: rule?.penaltyType || 'Fixed Penalty',
      gracePeriodDays: rule?.gracePeriodDays ?? 0,
    };
  }

  // 5. Total Foreclosure Cost
  const totalForeclosureCost = Math.round(
    outstandingPrincipal +
    netUnpaidScheduledInterest +
    enabledExpenses +
    enabledSeizedInterest +
    enabledPenalty
  );

  // 6. Profit / Loss
  const profitLoss = Math.round(saleAmountNum - totalForeclosureCost);

  return {
    salePrice: saleAmountNum,
    saleDate,
    settings: fSettings,
    components: {
      outstandingPrincipalAndInterest: {
        enabled: true, // Always included
        principal: outstandingPrincipal,
        unpaidInterest: netUnpaidScheduledInterest,
        total: outstandingPrincipal + netUnpaidScheduledInterest,
        originalScheduledUnpaidInterest: scheduledUnpaidInterest,
      },
      vehicleExpenses: {
        enabled: Boolean(fSettings.includeVehicleExpenses),
        amount: enabledExpenses,
        rawAmount: resolvedExpenses,
      },
      seizedPeriodInterest: {
        enabled: Boolean(fSettings.includeSeizedPeriodInterest),
        basis: fSettings.seizedPeriodBasis,
        amount: enabledSeizedInterest,
        details: {
          amount: seizedInterestDetails.amount,
          duration: seizedInterestDetails.duration,
          unit: seizedInterestDetails.unit,
          startDate: seizedInterestDetails.startDate,
          endDate: seizedInterestDetails.endDate,
          basis: seizedInterestDetails.basis,
          withinTenureAmount: seizedInterestDetails.withinTenureAmount,
          postTenureAmount: seizedInterestDetails.postTenureAmount,
        },
      },
      applicablePenalty: {
        enabled: Boolean(fSettings.includePenalty && isFreqEnabled && isGloballyEnabled),
        amount: enabledPenalty,
        penaltyEngineEnabled,
        reason: penaltyReason,
        details: penaltyDetails,
      },
    },
    outstandingPrincipal,
    unpaidInterest: netUnpaidScheduledInterest,
    vehicleExpenses: enabledExpenses,
    seizedPeriodInterest: enabledSeizedInterest,
    penalty: enabledPenalty,
    totalForeclosureCost,
    profitLoss,
    isProfit: profitLoss > 0,
    isLoss: profitLoss < 0,
    isBreakEven: profitLoss === 0,
    shortfall: profitLoss < 0 ? Math.abs(profitLoss) : 0,
  };
};

/**
 * Idempotently updates the Ledger for Foreclosure Settlements:
 * - Customer Payouts are recorded as EXPENSES (EXP-PAYOUT-{loanId})
 * - Shortfall Recoveries are recorded as INCOME (INC-RECOVERY-{loanId})
 * - Retained profit or waived settlements create NO transaction.
 */
export const syncForeclosureSettlementAccounting = ({
  record,
  settlement,
  saleDate = new Date().toISOString().split('T')[0],
  throwOnError = false,
}) => {
  if (!record || !settlement) return;

  const loanId = record.loanId || record.loan?.loanId || `LN-${record.vehicle?.regNo || 'VEH'}`;
  const regNo = record.vehicle?.regNo || record.regNo || 'Vehicle';
  const customerName = record.customer?.name || record.name || 'Customer';

  const payoutTxId = `EXP-PAYOUT-${loanId}`;
  const recoveryTxId = `INC-RECOVERY-${loanId}`;

  try {
    // 1. Handle Customer Payout (Expense)
    const rawExp = localStorage.getItem('motoLendExpense_data');
    let expenses = rawExp ? JSON.parse(rawExp) : [];
    // Remove existing payout entry to prevent duplication
    expenses = expenses.filter((e) => e.id !== payoutTxId && e.expenseId !== payoutTxId);

    if (settlement.type === 'payout' && Number(settlement.amount || 0) > 0) {
      expenses.push({
        id: payoutTxId,
        expenseId: payoutTxId,
        date: saleDate,
        amount: Math.round(Number(settlement.amount)),
        category: 'Customer Profit Payment',
        isForeclosurePayout: true,
        loanId,
        vehicleRegNo: regNo,
        customerName,
        paymentType: 'Payout',
        description: `Customer Profit Payment • ${regNo} (${customerName})`,
        remarks: `Customer Profit Payment • ${regNo} (${customerName})`,
        notes: settlement.notes || `Customer profit payment confirmed for loan ${loanId}`,
        createdAt: new Date().toISOString(),
      });
    }
    localStorage.setItem('motoLendExpense_data', JSON.stringify(expenses));

    // 2. Handle Shortfall Recovery (Income)
    const rawInc = localStorage.getItem('motoLendIncome_data');
    let income = rawInc ? JSON.parse(rawInc) : [];
    // Remove existing recovery entry to prevent duplication
    income = income.filter((i) => i.id !== recoveryTxId && i.incomeId !== recoveryTxId);

    if (settlement.type === 'recovery' && Number(settlement.amount || 0) > 0) {
      income.push({
        id: recoveryTxId,
        incomeId: recoveryTxId,
        date: saleDate,
        amount: Math.round(Number(settlement.amount)),
        type: 'Shortfall Recovery',
        category: 'Shortfall Recovery',
        source: 'Customer Recovery',
        isForeclosureRecovery: true,
        loanId,
        vehicleRegNo: regNo,
        customerName,
        paymentMethod: 'Cash',
        description: `Shortfall collected from customer • ${regNo} (${customerName})`,
        remarks: `Shortfall collected from customer • ${regNo} (${customerName})`,
        notes: settlement.notes || `Shortfall recovery confirmed for loan ${loanId}`,
        createdAt: new Date().toISOString(),
      });
    }
    localStorage.setItem('motoLendIncome_data', JSON.stringify(income));

    // Emit storage event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('storage'));
      window.dispatchEvent(new Event('motoLendStorageUpdate'));
    }
  } catch (err) {
    console.error('Failed to sync foreclosure settlement accounting:', err);
    if (throwOnError) {
      throw err;
    }
  }
};
