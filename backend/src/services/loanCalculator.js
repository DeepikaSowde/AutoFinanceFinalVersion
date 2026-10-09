// src/services/loanCalculator.js
//
// Server-side port of the frontend loan calculator. This is the
// authoritative implementation: the backend recalculates loan figures
// from raw terms rather than trusting values submitted by a client.

export const roundMoney = (value) => {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
};

const getTenureInMonths = (tenure = 0, tenureUnit = "Months") => {
  const value = Number(tenure) || 0;

  switch (tenureUnit) {
    case "Years":
      return value * 12;

    case "Weeks":
      return value / 4.345;

    case "Days":
      return value / 30.4375;

    case "Months":
    default:
      return value;
  }
};

const getPaymentCount = ({ tenure = 0, tenureUnit = "Months", frequency = "Monthly" }) => {
  const months = getTenureInMonths(tenure, tenureUnit);

  switch (frequency) {
    case "Daily":
      return Math.round(months * 30.4375);

    case "Weekly":
      return Math.round(months * 4.345);

    case "Monthly":
    default:
      return Math.round(months);
  }
};

export const calculateFlatInterest = ({
  principal = 0,
  rate = 0,
  tenure = 0,
  tenureUnit = "Months",
}) => {
  const loanAmount = Number(principal) || 0;
  const interestRate = Number(rate) || 0;
  const months = getTenureInMonths(tenure, tenureUnit);

  if (loanAmount <= 0 || interestRate <= 0 || months <= 0) {
    return 0;
  }

  const years = months / 12;

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

  const interest = calculateFlatInterest({ principal: loanAmount, rate, tenure, tenureUnit });
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

  const interest = calculateFlatInterest({ principal: loanAmount, rate, tenure, tenureUnit });
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

const getPeriodicRate = ({ rate = 0, frequency = "Monthly" }) => {
  const interestRate = Number(rate) || 0;

  if (frequency === "Weekly") {
    return interestRate / 100 / 52;
  }

  if (frequency === "Daily") {
    return interestRate / 100 / 365;
  }

  return interestRate / 100 / 12;
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
