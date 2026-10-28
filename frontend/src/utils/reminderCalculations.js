/**
 * MotoLend Reminder Module Calculations
 *
 * Reconciles customer and loan records with payment history and penalty configuration.
 * Generates dynamic KPI metrics and payment alert records without duplicating
 * or conflicting with existing business logic.
 */

import { calculateLoanOutstanding } from './loanCalculations.js';
import { getOrCalculatePenaltyRecord, getPenaltyRecords, getPenaltySettings } from './penaltyRules.js';
import { parseToDate, formatDate } from './dateUtils.js';

/**
 * Normalizes midnight timestamp for day-based comparisons
 */
export const toMidnightTimestamp = (dateInput) => {
  if (!dateInput) return null;
  const d = parseToDate(dateInput);
  if (!d || isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/**
 * Extracts normalized Customer ID from record
 */
export const extractCustomerId = (record, index = 0) => {
  if (!record) return `CUS-${String(index + 1).padStart(3, '0')}`;
  if (record.customerId) return record.customerId;
  if (record.customer?.customerId) return record.customer.customerId;
  if (
    record.customer?.mobile &&
    record.customer.mobile.trim().length >= 5 &&
    !/^0+$/.test(record.customer.mobile.trim().slice(-5))
  ) {
    return `CUS-${record.customer.mobile.trim().slice(-5)}`;
  }
  return `CUS-${String(index + 1).padStart(3, '0')}`;
};

/**
 * Extracts normalized Loan ID from record
 */
export const extractLoanId = (record, customerId, index = 0) => {
  if (!record) return `LN-${String(index + 1).padStart(3, '0')}`;
  if (record.loanId) return record.loanId;
  if (record.loan?.loanId) return record.loan.loanId;
  if (customerId && customerId.startsWith('CUS-')) {
    return `LN-${customerId.replace('CUS-', '')}`;
  }
  return `LN-${String(index + 1).padStart(3, '0')}`;
};

/**
 * Processes all customer records and payment history into Payment Alerts and KPIs.
 */
export const processPaymentAlertsAndKPIs = (
  rawCustomers = [],
  allPayments = [],
  penaltySettings = getPenaltySettings(),
  existingPenaltyRecords = getPenaltyRecords(),
  referenceDate = new Date()
) => {
  const todayMidnight = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  ).getTime();

  // Exactly next 7 calendar days inclusive (from tomorrow up to today + 7 days)
  const oneDayMs = 24 * 60 * 60 * 1000;
  const sevenDaysLimitTs = todayMidnight + 7 * oneDayMs;

  const alerts = [];

  let countDueToday = 0;
  let countUpcoming7Days = 0;
  let countOverdue = 0;
  let countPenaltyApplied = 0;
  let totalDueTodayAmount = 0;
  let totalOverdueAmount = 0;

  // Process each loan record
  rawCustomers.forEach((record, index) => {
    if (!record) return;

    const customer = record.customer || {};
    const loan = record.loan || {};
    const vehicle = record.vehicle || {};

    const customerId = extractCustomerId(record, index);
    const loanId = extractLoanId(record, customerId, index);
    const customerName = (customer.name || 'Customer').trim();
    const customerMobile = (customer.mobile || '').trim();

    // Check loan status
    const rawStatus = String(record.status || loan.status || '').trim().toLowerCase();
    const isExplicitlyClosed =
      rawStatus === 'closed' ||
      rawStatus === 'foreclosed' ||
      rawStatus === 'midway closed' ||
      Boolean(record.isForeclosed) ||
      Boolean(record.isMidwayClosed);

    const loanCalc = calculateLoanOutstanding(record, allPayments);

    // Skip closed, foreclosed, or fully settled loans
    if (
      isExplicitlyClosed ||
      loanCalc.status === 'Closed' ||
      loanCalc.status === 'Foreclosed'
    ) {
      return;
    }

    const normFreq = loan.paymentFrequency || record.paymentFrequency || 'Monthly';
    const schedule = loanCalc.effectiveSchedule || [];

    // Verify loan has at least one active unpaid installment
    const hasUnpaid = schedule.some((inst) => {
      const emi = Number(inst.emi || 0);
      const paid = Number(inst.amountPaid || 0);
      return (
        emi - paid > 0.01 &&
        inst.status !== 'Paid' &&
        inst.status !== 'Collected' &&
        inst.status !== 'Foreclosed'
      );
    });

    if (!hasUnpaid) return;

    schedule.forEach((installment) => {
      const emi = Number(installment.emi || 0);
      const amountPaid = Number(installment.amountPaid || 0);
      const remainingBalance = Math.max(0, Math.round((emi - amountPaid) * 100) / 100);

      // Unpaid or partially paid installment
      const isUnpaid =
        remainingBalance > 0.01 &&
        installment.status !== 'Paid' &&
        installment.status !== 'Collected' &&
        installment.status !== 'Foreclosed';

      if (!isUnpaid) return;

      const dueTs = toMidnightTimestamp(installment.dueDate);
      if (dueTs === null) return;

      let alertStatus = 'Upcoming';
      let overdueDays = 0;
      let isDueToday = false;
      let isUpcoming7Days = false;
      let isOverdue = false;

      if (dueTs < todayMidnight) {
        // Overdue
        isOverdue = true;
        alertStatus = 'Overdue';
        overdueDays = Math.max(1, Math.round((todayMidnight - dueTs) / oneDayMs));
        countOverdue += 1;
      } else if (dueTs === todayMidnight) {
        // Due Today
        isDueToday = true;
        alertStatus = 'Due Today';
        overdueDays = 0;
        countDueToday += 1;
      } else if (dueTs > todayMidnight && dueTs <= sevenDaysLimitTs) {
        // Upcoming within 7 days
        isUpcoming7Days = true;
        alertStatus = 'Upcoming';
        overdueDays = 0;
        countUpcoming7Days += 1;
      } else {
        // Due beyond 7 days (future installment)
        alertStatus = 'Upcoming';
        overdueDays = 0;
      }

      // Applicable Penalty Calculation
      let penaltyAmount = 0;
      let hasPenaltyApplied = false;

      if (isOverdue) {
        try {
          const penaltyRec = getOrCalculatePenaltyRecord(
            loanId,
            customerId,
            customerName,
            installment,
            normFreq,
            existingPenaltyRecords,
            penaltySettings,
            referenceDate
          );

          if (
            penaltyRec &&
            Number(penaltyRec.calculatedAmount || 0) > 0 &&
            penaltyRec.status !== 'Cancelled'
          ) {
            penaltyAmount = Number(penaltyRec.calculatedAmount || 0);
            hasPenaltyApplied = true;
            countPenaltyApplied += 1;
          }
        } catch (penErr) {
          console.error('Error checking installment penalty eligibility:', penErr);
        }
      }

      // Total Pending Amount = Total Due Today Amount + Total Overdue Amount
      // Strictly excludes upcoming/future installments and excludes fully paid installments
      if (isOverdue) {
        totalOverdueAmount += remainingBalance;
      } else if (isDueToday) {
        totalDueTodayAmount += remainingBalance;
      }

      // Determine left accent color and priority
      let accentColor = 'green'; // 'red' | 'orange' | 'green'
      let priority = 'Low';

      if (isOverdue) {
        if (hasPenaltyApplied) {
          accentColor = 'orange';
          priority = 'Medium';
        } else {
          accentColor = 'red';
          priority = 'High';
        }
      } else if (isDueToday) {
        accentColor = 'green';
        priority = 'Low';
      } else {
        accentColor = 'green';
        priority = 'Low';
      }

      alerts.push({
        id: `${loanId}-${installment.installmentNumber || index}`,
        installmentNumber: installment.installmentNumber,
        loanId,
        customerId,
        customerName,
        customerMobile,
        vehicleBrand: vehicle.brand || '',
        vehicleModel: vehicle.model || '',
        dueDate: installment.dueDate,
        dueTs,
        amountDue: remainingBalance,
        overdueDays,
        penalty: penaltyAmount,
        hasPenaltyApplied,
        alertStatus,
        isDueToday,
        isUpcoming7Days,
        isOverdue,
        accentColor,
        priority,
      });
    });
  });

  const totalPendingAmount = totalDueTodayAmount + totalOverdueAmount;

  return {
    alerts,
    kpis: {
      dueToday: countDueToday,
      upcoming7Days: countUpcoming7Days,
      overdue: countOverdue,
      penaltyApplied: countPenaltyApplied,
      totalDueTodayAmount: Math.round(totalDueTodayAmount),
      totalOverdueAmount: Math.round(totalOverdueAmount),
      totalPendingAmount: Math.round(totalPendingAmount),
    },
  };
};

/**
 * Filter alerts by selected tab
 */
export const filterAlertsByTab = (alerts = [], tab = 'All') => {
  switch (tab) {
    case 'Due Today':
      return alerts.filter((a) => a.isDueToday);
    case 'Upcoming':
      return alerts.filter((a) => a.isUpcoming7Days);
    case 'Overdue':
      return alerts.filter((a) => a.isOverdue);
    case 'Penalty Applied':
      return alerts.filter((a) => a.hasPenaltyApplied);
    case 'All':
    default:
      return alerts;
  }
};

/**
 * Search alerts by customer name, customer ID, loan ID, or mobile number
 */
export const searchAlerts = (alerts = [], query = '') => {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return alerts;

  return alerts.filter((a) => {
    const name = String(a.customerName || '').toLowerCase();
    const cId = String(a.customerId || '').toLowerCase();
    const lId = String(a.loanId || '').toLowerCase();
    const mobile = String(a.customerMobile || '').toLowerCase();

    return (
      name.includes(q) ||
      cId.includes(q) ||
      lId.includes(q) ||
      mobile.includes(q)
    );
  });
};

/**
 * Sort alerts based on selected sort option
 */
export const sortAlerts = (alerts = [], sortKey = 'Overdue Days — High to Low') => {
  const sorted = [...alerts];

  switch (sortKey) {
    case 'Overdue Days — High to Low':
      return sorted.sort((a, b) => {
        if (b.overdueDays !== a.overdueDays) return b.overdueDays - a.overdueDays;
        return a.dueTs - b.dueTs;
      });

    case 'Overdue Days — Low to High':
      return sorted.sort((a, b) => {
        if (a.overdueDays !== b.overdueDays) return a.overdueDays - b.overdueDays;
        return a.dueTs - b.dueTs;
      });

    case 'Due Date — Earliest First':
      return sorted.sort((a, b) => a.dueTs - b.dueTs);

    case 'Penalty Amount — Highest First':
      return sorted.sort((a, b) => {
        if (b.penalty !== a.penalty) return b.penalty - a.penalty;
        return b.amountDue - a.amountDue;
      });

    default:
      return sorted;
  }
};
