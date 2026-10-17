import { generateSchedule, computeEffectiveSchedule } from '../components/RepaymentScheduleTable.jsx';
import { calculateRepayment } from '../components/Loantab.jsx';

/**
 * Filter out failed, cancelled, or reversed transactions.
 * Only valid, positive payment transactions are counted.
 */
export const isEligiblePayment = (p) => {
  if (!p) return false;
  const status = String(p.status || '').toLowerCase().trim();
  if (
    status === 'failed' ||
    status === 'cancelled' ||
    status === 'canceled' ||
    status === 'reversed' ||
    status === 'rejected' ||
    status === 'void'
  ) {
    return false;
  }
  return Number(p.amount || 0) > 0;
};

/**
 * Calculate loan-level outstanding breakdown following authoritative formula:
 * Total Outstanding = Remaining Principal + Remaining Interest
 *
 * Remaining Principal = Total Loan Principal - Principal Repaid (reduced by unapplied advance)
 * Remaining Interest = Total Scheduled Interest - Interest Repaid
 */
export const calculateLoanOutstanding = (loanRecord, allPayments = []) => {
  if (!loanRecord) {
    return {
      principal: 0,
      totalInterest: 0,
      totalRepayable: 0,
      principalRepaid: 0,
      interestRepaid: 0,
      totalRepaid: 0,
      remainingPrincipal: 0,
      remainingInterest: 0,
      outstandingAmount: 0,
      advanceBalance: 0,
      status: 'Closed',
      effectiveSchedule: [],
    };
  }

  const customer = loanRecord.customer || {};
  const vehicle = loanRecord.vehicle || {};
  const loan = loanRecord.loan || {};

  // 1. Calculate Principal
  const vehicleAmount =
    loan.vehicleAmount !== '' && loan.vehicleAmount !== null && loan.vehicleAmount !== undefined
      ? Number(loan.vehicleAmount)
      : Number(vehicle.amount || 0);
  const downPayment = Number(loan.downPayment || 0);
  const calculatedPrincipal = Math.max(vehicleAmount - downPayment, 0);
  const principal = Number(loanRecord.loanAmount || calculatedPrincipal || 0);

  const rawStatus = String(loanRecord.status || loan.status || '').trim();
  const isForeclosed =
    rawStatus.toLowerCase() === 'foreclosed' ||
    Boolean(loanRecord.isForeclosed || loanRecord.foreclosure);

  // Foreclosed, no principal, or Closed with no schedule to read: outstanding
  // is ₹0. A Closed loan WITH a schedule goes through the full calculation
  // below (which also gives ₹0 outstanding) so its interest and total repaid
  // are the real figures, not ₹0.
  const hasSchedule = Array.isArray(loanRecord.repaymentSchedule) && loanRecord.repaymentSchedule.length > 0;
  if ((loanRecord.status === 'Closed' && !hasSchedule) || isForeclosed || principal <= 0) {
    return {
      principal,
      totalInterest: 0,
      totalRepayable: principal,
      principalRepaid: principal,
      interestRepaid: 0,
      totalRepaid: principal,
      remainingPrincipal: 0,
      remainingInterest: 0,
      outstandingAmount: 0,
      advanceBalance: Number(loanRecord.advanceBalance || 0),
      status: isForeclosed ? 'Foreclosed' : 'Closed',
      effectiveSchedule: loanRecord.repaymentSchedule || [],
    };
  }

  // 2. Base Repayment Schedule
  let baseSchedule = loanRecord.repaymentSchedule;
  if (!baseSchedule || baseSchedule.length === 0) {
    if (principal > 0 && loan.interestRate && loan.tenure) {
      baseSchedule = generateSchedule({
        loanAmount: principal,
        interestRate: loan.interestRate,
        tenure: loan.tenure,
        tenureUnit: loan.tenureUnit || 'Months',
        paymentFrequency: loan.paymentFrequency || loanRecord.paymentFrequency || 'Monthly',
        interestType: loan.interestType || 'Flat',
        repaymentMethod: loan.repaymentMethod || 'EMI',
        firstDueDate: loan.firstDueDate || loanRecord.nextDueDate,
      });
    } else {
      baseSchedule = [];
    }
  }

  // 3. Match Eligible Payments for this loan
  const effectiveLoanId = loanRecord.loanId ? String(loanRecord.loanId).trim().toLowerCase() : '';
  const effectiveCustomerId = loanRecord.customerId
    ? String(loanRecord.customerId).trim().toLowerCase()
    : customer.mobile
    ? `cus-${customer.mobile.slice(-5)}`.toLowerCase()
    : '';

  const loanPayments = (allPayments || []).filter((p) => {
    if (!isEligiblePayment(p)) return false;
    const pLoanId = p.loanId ? String(p.loanId).trim().toLowerCase() : '';
    const pCustId = p.customerId ? String(p.customerId).trim().toLowerCase() : '';

    if (effectiveLoanId && pLoanId) {
      return pLoanId === effectiveLoanId;
    }
    if (effectiveCustomerId && pCustId) {
      return pCustId === effectiveCustomerId;
    }
    return false;
  });

  // 4. Compute Effective Schedule reconciled with payments
  const effectiveSchedule = computeEffectiveSchedule(baseSchedule, loanPayments);

  // 5. Total Scheduled Principal & Interest
  const totalScheduledPrincipal =
    effectiveSchedule.length > 0
      ? effectiveSchedule.reduce((sum, s) => sum + Number(s.principal || 0), 0)
      : principal;

  let totalScheduledInterest = 0;
  if (effectiveSchedule.length > 0) {
    totalScheduledInterest = effectiveSchedule.reduce((sum, s) => sum + Number(s.interest || 0), 0);
  } else if (loan.interestRate && loan.tenure) {
    const summary = calculateRepayment({
      principal,
      interestRate: loan.interestRate,
      tenure: loan.tenure,
      tenureUnit: loan.tenureUnit || 'Months',
      paymentFrequency: loan.paymentFrequency || loanRecord.paymentFrequency || 'Monthly',
      interestType: loan.interestType || 'Flat',
      repaymentMethod: loan.repaymentMethod || 'EMI',
    });
    totalScheduledInterest = Number(summary.interest || 0);
  }

  // 6. Principal & Interest Repaid
  let principalRepaid = effectiveSchedule.reduce((sum, s) => {
    if (s.principalPaid !== undefined) return sum + Number(s.principalPaid || 0);
    const intDue = Number(s.interest || 0);
    const amtPaid = Number(s.amountPaid || 0);
    const intPaid = Math.min(intDue, amtPaid);
    return sum + Math.max(0, amtPaid - intPaid);
  }, 0);

  let interestRepaid = effectiveSchedule.reduce((sum, s) => {
    if (s.interestPaid !== undefined) return sum + Number(s.interestPaid || 0);
    const intDue = Number(s.interest || 0);
    const amtPaid = Number(s.amountPaid || 0);
    return sum + Math.min(intDue, amtPaid);
  }, 0);

  // Payments total collections vs schedule allocations
  const totalPaidFromPayments = loanPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const totalPaidFromSchedule = effectiveSchedule.reduce((sum, s) => sum + Number(s.amountPaid || 0), 0);
  const totalCollected = loanPayments.length > 0 ? totalPaidFromPayments : totalPaidFromSchedule;
  const totalAllocatedOnSchedule = principalRepaid + interestRepaid;

  // Unapplied excess payment / advance
  const advance = Math.max(
    Number(loanRecord.advanceBalance || 0),
    Math.max(0, totalCollected - totalAllocatedOnSchedule)
  );

  // 7. Remaining Balances
  const isMidwayClosedLoan = Boolean(
    loanRecord.isMidwayClosed ||
    loanRecord.midwayClosure ||
    rawStatus.toLowerCase() === 'midway closed' ||
    String(loanRecord.closureType || '').toLowerCase() === 'midway closure'
  );

  // If midway closed, all principal is fully repaid, interest repaid is normal + closure interest,
  // and remaining principal, remaining interest, and outstanding are ₹0.
  if (isMidwayClosedLoan) {
    const effectivePrincipalRepaid = totalScheduledPrincipal;
    const effectiveInterest = interestRepaid;
    return {
      principal: totalScheduledPrincipal,
      totalInterest: effectiveInterest,
      totalRepayable: totalScheduledPrincipal + effectiveInterest,
      principalRepaid: effectivePrincipalRepaid,
      interestRepaid,
      totalRepaid: totalCollected,
      remainingPrincipal: 0,
      remainingInterest: 0,
      outstandingAmount: 0,
      advanceBalance: advance,
      status: 'Midway Closed',
      effectiveSchedule,
    };
  }

  // Remaining Principal = Total Principal - Principal Repaid (reduced by any unapplied advance)
  const remainingPrincipal = Math.max(0, totalScheduledPrincipal - principalRepaid - advance);

  // Remaining Interest = Total Scheduled Interest - Interest Repaid
  const remainingInterest = Math.max(0, totalScheduledInterest - interestRepaid);

  // Loan Outstanding = Remaining Principal + Remaining Interest
  let outstandingAmount = remainingPrincipal + remainingInterest;

  if (outstandingAmount <= 0.01) {
    outstandingAmount = 0;
  }

  const finalStatus =
    loanRecord.status === 'Closed' || outstandingAmount <= 0.01
      ? 'Closed'
      : loanRecord.status || 'Active';

  return {
    principal: totalScheduledPrincipal,
    totalInterest: totalScheduledInterest,
    totalRepayable: totalScheduledPrincipal + totalScheduledInterest,
    principalRepaid,
    interestRepaid,
    totalRepaid: totalCollected,
    remainingPrincipal: outstandingAmount === 0 ? 0 : remainingPrincipal,
    remainingInterest: outstandingAmount === 0 ? 0 : remainingInterest,
    outstandingAmount,
    advanceBalance: advance,
    status: finalStatus,
    effectiveSchedule,
  };
};

/**
 * Calculate total portfolio outstanding across all customer loans.
 */
export const calculateTotalPortfolioOutstanding = (customers = [], payments = []) => {
  let totalOutstanding = 0;
  let totalRemainingPrincipal = 0;
  let totalRemainingInterest = 0;
  let totalScheduledPrincipal = 0;
  let totalScheduledInterest = 0;
  let totalRepaidPrincipal = 0;
  let totalRepaidInterest = 0;

  const breakdowns = (customers || []).map((cust) => {
    const result = calculateLoanOutstanding(cust, payments);
    totalOutstanding += result.outstandingAmount;
    totalRemainingPrincipal += result.remainingPrincipal;
    totalRemainingInterest += result.remainingInterest;
    totalScheduledPrincipal += result.principal;
    totalScheduledInterest += result.totalInterest;
    totalRepaidPrincipal += result.principalRepaid;
    totalRepaidInterest += result.interestRepaid;
    return {
      ...cust,
      outstandingAmount: result.outstandingAmount,
      totalPrincipalOutstanding: result.remainingPrincipal,
      totalInterestOutstanding: result.remainingInterest,
      totalLoanOutstanding: result.outstandingAmount,
      loanCalculations: result,
    };
  });

  return {
    totalOutstanding: Math.round(totalOutstanding * 100) / 100,
    totalRemainingPrincipal: Math.round(totalRemainingPrincipal * 100) / 100,
    totalRemainingInterest: Math.round(totalRemainingInterest * 100) / 100,
    totalScheduledPrincipal: Math.round(totalScheduledPrincipal * 100) / 100,
    totalScheduledInterest: Math.round(totalScheduledInterest * 100) / 100,
    totalRepaidPrincipal: Math.round(totalRepaidPrincipal * 100) / 100,
    totalRepaidInterest: Math.round(totalRepaidInterest * 100) / 100,
    breakdowns,
  };
};
