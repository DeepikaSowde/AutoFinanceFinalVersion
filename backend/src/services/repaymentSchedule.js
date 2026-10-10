// src/services/repaymentSchedule.js
//
// Server-side port of the frontend repayment schedule generator. Kept
// in lockstep with loanCalculator.js so persisted installments always
// match the persisted loan calculation.

import {
  addPeriods,
  getInterestYears,
  getPaymentCount,
  getPeriodicRate,
  normaliseInterestType,
} from "./loanTerms.js";

export const roundMoney = (value) => {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
};

/*
 * Rounding each row to paise loses fractions of a rupee against the loan
 * total. The final installment absorbs that drift so the schedule sums
 * exactly to what was lent — the borrower's last payment closes the loan
 * rather than leaving a few paise outstanding forever.
 */
const reconcileFinalRow = (schedule, { loanAmount, totalInterest = null }) => {
  if (!schedule.length) {
    return schedule;
  }

  const last = schedule[schedule.length - 1];
  const earlier = schedule.slice(0, -1);

  const postedPrincipal = earlier.reduce((sum, row) => sum + row.principal, 0);
  last.principal = roundMoney(loanAmount - postedPrincipal);

  if (totalInterest !== null) {
    const postedInterest = earlier.reduce((sum, row) => sum + row.interest, 0);
    last.interest = roundMoney(totalInterest - postedInterest);
  }

  last.paymentAmount = roundMoney(last.principal + last.interest);
  last.closingBalance = 0;

  return schedule;
};

const generateFlatEMI = ({ principal, rate, tenure, tenureUnit, frequency, firstDueDate }) => {
  const loanAmount = Number(principal) || 0;
  const paymentCount = getPaymentCount({ tenure, tenureUnit, frequency });

  if (loanAmount <= 0 || paymentCount <= 0) {
    return [];
  }

  const years = getInterestYears({ tenure, tenureUnit, frequency });
  const totalInterest = loanAmount * ((Number(rate) || 0) / 100) * years;
  const principalPerPayment = loanAmount / paymentCount;
  const interestPerPayment = totalInterest / paymentCount;

  const schedule = [];
  let remainingBalance = loanAmount;

  for (let period = 1; period <= paymentCount; period++) {
    const principalAmount = period === paymentCount ? remainingBalance : principalPerPayment;

    const interestAmount =
      period === paymentCount
        ? totalInterest - schedule.reduce((sum, row) => sum + row.interest, 0)
        : interestPerPayment;

    const amount = principalAmount + interestAmount;

    remainingBalance -= principalAmount;

    schedule.push({
      installmentNumber: period,
      dueDate: addPeriods(firstDueDate, frequency, period - 1),
      openingBalance: roundMoney(remainingBalance + principalAmount),
      principal: roundMoney(principalAmount),
      interest: roundMoney(interestAmount),
      paymentAmount: roundMoney(amount),
      closingBalance: roundMoney(Math.max(remainingBalance, 0)),
      status: "Pending",
    });
  }

  return reconcileFinalRow(schedule, { loanAmount, totalInterest });
};

const generateReducingEMI = ({ principal, rate, tenure, tenureUnit, frequency, firstDueDate }) => {
  const loanAmount = Number(principal) || 0;
  const annualRate = Number(rate) || 0;
  const paymentCount = getPaymentCount({ tenure, tenureUnit, frequency });

  if (loanAmount <= 0 || paymentCount <= 0) {
    return [];
  }

  const periodicRate = getPeriodicRate({ rate: annualRate, frequency });

  let paymentAmount;

  if (periodicRate === 0) {
    paymentAmount = loanAmount / paymentCount;
  } else {
    const factor = Math.pow(1 + periodicRate, paymentCount);
    paymentAmount = (loanAmount * periodicRate * factor) / (factor - 1);
  }

  const schedule = [];
  let remainingBalance = loanAmount;

  for (let period = 1; period <= paymentCount; period++) {
    const openingBalance = remainingBalance;
    const interestAmount = openingBalance * periodicRate;

    let principalAmount = paymentAmount - interestAmount;

    if (period === paymentCount) {
      principalAmount = remainingBalance;
    }

    const actualPayment = principalAmount + interestAmount;

    remainingBalance -= principalAmount;

    schedule.push({
      installmentNumber: period,
      dueDate: addPeriods(firstDueDate, frequency, period - 1),
      openingBalance: roundMoney(openingBalance),
      principal: roundMoney(principalAmount),
      interest: roundMoney(interestAmount),
      paymentAmount: roundMoney(actualPayment),
      closingBalance: roundMoney(Math.max(remainingBalance, 0)),
      status: "Pending",
    });
  }

  // Reducing-balance interest is computed per period from the real
  // balance, so only principal needs reconciling.
  return reconcileFinalRow(schedule, { loanAmount });
};

const generateFlatPrincipal = ({ principal, rate, tenure, tenureUnit, frequency, firstDueDate }) => {
  const loanAmount = Number(principal) || 0;
  const paymentCount = getPaymentCount({ tenure, tenureUnit, frequency });

  if (loanAmount <= 0 || paymentCount <= 0) {
    return [];
  }

  const years = getInterestYears({ tenure, tenureUnit, frequency });
  const totalInterest = loanAmount * ((Number(rate) || 0) / 100) * years;
  const principalPerPayment = loanAmount / paymentCount;
  const interestPerPayment = totalInterest / paymentCount;

  const schedule = [];
  let remainingBalance = loanAmount;

  for (let period = 1; period <= paymentCount; period++) {
    const principalAmount = period === paymentCount ? remainingBalance : principalPerPayment;

    const interestAmount =
      period === paymentCount
        ? totalInterest - schedule.reduce((sum, row) => sum + row.interest, 0)
        : interestPerPayment;

    const paymentAmount = principalAmount + interestAmount;

    remainingBalance -= principalAmount;

    schedule.push({
      installmentNumber: period,
      dueDate: addPeriods(firstDueDate, frequency, period - 1),
      openingBalance: roundMoney(remainingBalance + principalAmount),
      principal: roundMoney(principalAmount),
      interest: roundMoney(interestAmount),
      paymentAmount: roundMoney(paymentAmount),
      closingBalance: roundMoney(Math.max(remainingBalance, 0)),
      status: "Pending",
    });
  }

  return reconcileFinalRow(schedule, { loanAmount, totalInterest });
};

const generateReducingPrincipal = ({
  principal,
  rate,
  tenure,
  tenureUnit,
  frequency,
  firstDueDate,
}) => {
  const loanAmount = Number(principal) || 0;
  const annualRate = Number(rate) || 0;
  const paymentCount = getPaymentCount({ tenure, tenureUnit, frequency });

  if (loanAmount <= 0 || paymentCount <= 0) {
    return [];
  }

  const periodicRate = getPeriodicRate({ rate: annualRate, frequency });
  const principalPerPayment = loanAmount / paymentCount;

  const schedule = [];
  let remainingBalance = loanAmount;

  for (let period = 1; period <= paymentCount; period++) {
    const openingBalance = remainingBalance;
    const interestAmount = openingBalance * periodicRate;
    const principalAmount = period === paymentCount ? remainingBalance : principalPerPayment;
    const paymentAmount = principalAmount + interestAmount;

    remainingBalance -= principalAmount;

    schedule.push({
      installmentNumber: period,
      dueDate: addPeriods(firstDueDate, frequency, period - 1),
      openingBalance: roundMoney(openingBalance),
      principal: roundMoney(principalAmount),
      interest: roundMoney(interestAmount),
      paymentAmount: roundMoney(paymentAmount),
      closingBalance: roundMoney(Math.max(remainingBalance, 0)),
      status: "Pending",
    });
  }

  return reconcileFinalRow(schedule, { loanAmount });
};

export const generateRepaymentSchedule = ({
  principal = 0,
  rate = 0,
  tenure = 0,
  tenureUnit = "Months",
  interestType = "Flat",
  repaymentMethod = "EMI",
  frequency = "Monthly",
  firstDueDate = "",
}) => {
  const params = { principal, rate, tenure, tenureUnit, frequency, firstDueDate };

  interestType = normaliseInterestType(interestType);

  if (interestType === "Flat" && repaymentMethod === "EMI") {
    return generateFlatEMI(params);
  }

  if (interestType === "Flat" && repaymentMethod === "Principal") {
    return generateFlatPrincipal(params);
  }

  if (interestType === "Reducing" && repaymentMethod === "EMI") {
    return generateReducingEMI(params);
  }

  if (interestType === "Reducing" && repaymentMethod === "Principal") {
    return generateReducingPrincipal(params);
  }

  return [];
};

export const calculateScheduleTotals = (schedule = []) => {
  return schedule.reduce(
    (totals, row) => {
      totals.principal += Number(row.principal) || 0;
      totals.interest += Number(row.interest) || 0;
      totals.totalPayable += Number(row.paymentAmount) || 0;

      return totals;
    },
    { principal: 0, interest: 0, totalPayable: 0 }
  );
};
