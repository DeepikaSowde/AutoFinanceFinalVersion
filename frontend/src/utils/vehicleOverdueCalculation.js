import { computeEffectiveSchedule, generateSchedule } from '../components/RepaymentScheduleTable.jsx';
import { calculateRepayment } from '../components/Loantab.jsx';
import { isEligiblePayment } from './loanCalculations.js';

// Parse a date string into midnight timestamp for reliable day comparisons
const parseToDayTimestamp = (dateInput) => {
  if (!dateInput) return null;
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/**
 * Calculates overdue metrics for a specific loan associated with a vehicle.
 *
 * @param {Object} loanRecord - The customer/loan record associated with the vehicle
 * @param {Array} allPayments - The full payments list from localStorage ("motoLendPaymentHistory")
 * @returns {Object} {
 *   isDataMissing: boolean,
 *   missingReason: string,
 *   overdueCount: number,
 *   overdueAmount: number,
 *   overdueInstallments: Array,
 *   hasOverdue: boolean
 * }
 */
export const calculateVehicleLoanOverdue = (loanRecord, allPayments = []) => {
  // Case 6: The loan schedule or repayment data is missing
  if (!loanRecord) {
    return {
      isDataMissing: true,
      missingReason: 'No loan record linked to this vehicle',
      overdueCount: 0,
      overdueAmount: 0,
      overdueInstallments: [],
      hasOverdue: false,
    };
  }

  const customer = loanRecord.customer || {};
  const vehicle = loanRecord.vehicle || {};
  const loan = loanRecord.loan || {};

  const vehicleAmount =
    loan.vehicleAmount !== '' && loan.vehicleAmount !== null && loan.vehicleAmount !== undefined
      ? Number(loan.vehicleAmount)
      : Number(vehicle.amount || 0);
  const downPayment = Number(loan.downPayment || 0);
  const calculatedPrincipal = Math.max(vehicleAmount - downPayment, 0);
  const principal = Number(loanRecord.loanAmount || calculatedPrincipal || 0);

  const rawStatus = String(loanRecord.status || loan.status || '').trim().toLowerCase();
  const isMidway = loanRecord.isMidwayClosed === true || rawStatus === 'midway closed';

  // If marked explicitly Closed, Midway Closed, or principal is 0, no overdue
  if (loanRecord.status === 'Closed' || isMidway || principal <= 0) {
    return {
      isDataMissing: false,
      missingReason: '',
      overdueCount: 0,
      overdueAmount: 0,
      overdueInstallments: [],
      hasOverdue: false,
    };
  }

  // Base schedule
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

  // If schedule is still empty and we cannot generate one due to missing loan terms
  if (!baseSchedule || baseSchedule.length === 0) {
    return {
      isDataMissing: true,
      missingReason: 'Repayment schedule unavailable',
      overdueCount: 0,
      overdueAmount: 0,
      overdueInstallments: [],
      hasOverdue: false,
    };
  }

  // Filter payments strictly for THIS specific loan
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
    if (effectiveCustomerId && pCustId && !effectiveLoanId) {
      return pCustId === effectiveCustomerId;
    }
    return false;
  });

  // Compute effective schedule with allocated payments
  const effectiveSchedule = computeEffectiveSchedule(baseSchedule, loanPayments);

  // Compare strictly past due dates (earlier than today at 00:00:00)
  const todayTimestamp = parseToDayTimestamp(new Date());

  const overdueInstallments = effectiveSchedule.filter((s) => {
    const isNotFullyPaid = s.status !== 'Collected' && s.status !== 'Paid';
    const remainingUnpaid = Math.max(0, Number(s.emi || 0) - Number(s.amountPaid || 0));
    const hasUnpaidBalance = remainingUnpaid > 0.01;
    const dueTs = parseToDayTimestamp(s.dueDate);

    // Past due date strictly earlier than today (future and today installments are NOT overdue)
    return isNotFullyPaid && hasUnpaidBalance && dueTs !== null && dueTs < todayTimestamp;
  });

  const overdueCount = overdueInstallments.length;
  const overdueAmount = overdueInstallments.reduce((sum, s) => {
    const remaining = Math.max(0, Number(s.emi || 0) - Number(s.amountPaid || 0));
    return sum + remaining;
  }, 0);

  return {
    isDataMissing: false,
    missingReason: '',
    overdueCount,
    overdueAmount: Math.round(overdueAmount * 100) / 100,
    overdueInstallments,
    hasOverdue: overdueCount > 0,
  };
};
