// src/services/loanCalculator.js
//
// Server-side port of the frontend loan calculator. This is the
// authoritative implementation: the backend recalculates loan figures
// from raw terms rather than trusting values submitted by a client.

import {
  getInterestYears,
  getPaymentCount,
  getPeriodicRate,
  normaliseInterestType,
} from "./loanTerms.js";

export const roundMoney = (value) => {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
};

export const calculateFlatInterest = ({
  principal = 0,
  rate = 0,
  tenure = 0,
  tenureUnit = "Months",
  frequency = "Monthly",
}) => {
  const loanAmount = Number(principal) || 0;
  const interestRate = Number(rate) || 0;
  const years = getInterestYears({ tenure, tenureUnit, frequency });

  if (loanAmount <= 0 || interestRate <= 0 || years <= 0) {
    return 0;
  }

  return roundMoney(loanAmount * (interestRate / 100) * years);
};

export const calculateFlatEMI = ({
  principal = 0,
  rate = 0,
  tenure = 0,
  tenureUnit = "Months",
  frequency = "Monthly",
}) => {
  const loanAmount = Number(principal) || 0;

  const interest = calculateFlatInterest({ principal: loanAmount, rate, tenure, tenureUnit, frequency });
  const totalDue = loanAmount + interest;
  const paymentCount = getPaymentCount({ tenure, tenureUnit, frequency });
  const emi = paymentCount > 0 ? totalDue / paymentCount : 0;

  return {
    principal: roundMoney(loanAmount),
    interest: roundMoney(interest),
    totalDue: roundMoney(totalDue),
    emiAmount: roundMoney(emi),
    paymentCount,
  };
};

export const calculateFlatPrincipalBased = ({
  principal = 0,
  rate = 0,
  tenure = 0,
  tenureUnit = "Months",
  frequency = "Monthly",
}) => {
  const loanAmount = Number(principal) || 0;

  const interest = calculateFlatInterest({ principal: loanAmount, rate, tenure, tenureUnit, frequency });
  const paymentCount = getPaymentCount({ tenure, tenureUnit, frequency });

  const principalPerPayment = paymentCount > 0 ? loanAmount / paymentCount : 0;
  const interestPerPayment = paymentCount > 0 ? interest / paymentCount : 0;
  const paymentAmount = principalPerPayment + interestPerPayment;

  return {
    principal: roundMoney(loanAmount),
    interest: roundMoney(interest),
    totalDue: roundMoney(loanAmount + interest),
    principalPerPayment: roundMoney(principalPerPayment),
    interestPerPayment: roundMoney(interestPerPayment),
    paymentAmount: roundMoney(paymentAmount),
    paymentCount,
  };
};

export const calculateReducingEMI = ({
  principal = 0,
  rate = 0,
  tenure = 0,
  tenureUnit = "Months",
  frequency = "Monthly",
}) => {
  const loanAmount = Number(principal) || 0;
  const paymentCount = getPaymentCount({ tenure, tenureUnit, frequency });

  if (loanAmount <= 0 || paymentCount <= 0) {
    return {
      principal: 0,
      interest: 0,
      totalDue: 0,
      emiAmount: 0,
      paymentCount: 0,
    };
  }

  const periodicRate = getPeriodicRate({ rate, frequency });

  if (periodicRate === 0) {
    const emi = loanAmount / paymentCount;

    return {
      principal: roundMoney(loanAmount),
      interest: 0,
      totalDue: roundMoney(loanAmount),
      emiAmount: roundMoney(emi),
      paymentCount,
    };
  }

  const factor = Math.pow(1 + periodicRate, paymentCount);
  const emi = (loanAmount * periodicRate * factor) / (factor - 1);
  const totalDue = emi * paymentCount;
  const totalInterest = totalDue - loanAmount;

  return {
    principal: roundMoney(loanAmount),
    interest: roundMoney(totalInterest),
    totalDue: roundMoney(totalDue),
    emiAmount: roundMoney(emi),
    paymentCount,
  };
};

export const calculateReducingPrincipalBased = ({
  principal = 0,
  rate = 0,
  tenure = 0,
  tenureUnit = "Months",
  frequency = "Monthly",
}) => {
  const loanAmount = Number(principal) || 0;
  const paymentCount = getPaymentCount({ tenure, tenureUnit, frequency });

  if (loanAmount <= 0 || paymentCount <= 0) {
    return {
      principal: 0,
      interest: 0,
      totalDue: 0,
      principalPerPayment: 0,
      firstPayment: 0,
      lastPayment: 0,
      paymentCount: 0,
    };
  }

  const periodicRate = getPeriodicRate({ rate, frequency });
  const principalPerPayment = loanAmount / paymentCount;

  let remainingPrincipal = loanAmount;
  let totalInterest = 0;
  let firstPayment = 0;
  let lastPayment = 0;

  for (let period = 1; period <= paymentCount; period++) {
    const interestForPeriod = remainingPrincipal * periodicRate;
    const currentPayment = principalPerPayment + interestForPeriod;

    totalInterest += interestForPeriod;

    if (period === 1) {
      firstPayment = currentPayment;
    }

    if (period === paymentCount) {
      lastPayment = currentPayment;
    }

    remainingPrincipal -= principalPerPayment;
  }

  return {
    principal: roundMoney(loanAmount),
    interest: roundMoney(totalInterest),
    totalDue: roundMoney(loanAmount + totalInterest),
    principalPerPayment: roundMoney(principalPerPayment),
    firstPayment: roundMoney(firstPayment),
    lastPayment: roundMoney(lastPayment),
    paymentCount,
  };
};

export const calculateLoan = ({
  principal = 0,
  rate = 0,
  tenure = 0,
  tenureUnit = "Months",
  interestType = "Flat",
  repaymentMethod = "EMI",
  frequency = "Monthly",
}) => {
  interestType = normaliseInterestType(interestType);

  if (interestType === "Flat" && repaymentMethod === "EMI") {
    return calculateFlatEMI({ principal, rate, tenure, tenureUnit, frequency });
  }

  if (interestType === "Flat" && repaymentMethod === "Principal") {
    return calculateFlatPrincipalBased({ principal, rate, tenure, tenureUnit, frequency });
  }

  if (interestType === "Reducing" && repaymentMethod === "EMI") {
    return calculateReducingEMI({ principal, rate, tenure, tenureUnit, frequency });
  }

  if (interestType === "Reducing" && repaymentMethod === "Principal") {
    return calculateReducingPrincipalBased({ principal, rate, tenure, tenureUnit, frequency });
  }

  return {
    principal: 0,
    interest: 0,
    totalDue: 0,
    emiAmount: 0,
    paymentCount: 0,
  };
};
