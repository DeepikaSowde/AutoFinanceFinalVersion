// src/services/loanTerms.js
//
// How loan terms turn into a payment count, a periodic rate and an interest
// period. Shared by loanCalculator.js and repaymentSchedule.js so persisted
// figures always match the schedule, and kept identical to the frontend's
// New Loan preview (components/RepaymentScheduleTable.jsx) so what the user
// sees before submitting is what gets saved.
//
// A tenure in Years is spread over that many years of payments; any other
// unit is read as the number of payments.

const PERIODS_PER_YEAR = {
  Daily: 365,
  Weekly: 52,
  "Bi-Weekly": 26,
  Monthly: 12,
  Quarterly: 4,
  "Half-Yearly": 2,
  Yearly: 1,
};

export const periodsPerYear = (frequency) => PERIODS_PER_YEAR[frequency] || 12;

export const getPaymentCount = ({ tenure = 0, tenureUnit = "Months", frequency = "Monthly" }) => {
  const value = Number(tenure) || 0;

  if (value <= 0) {
    return 0;
  }

  const count = tenureUnit === "Years" ? value * periodsPerYear(frequency) : value;

  return Math.max(Math.round(count), 0);
};

export const getPeriodicRate = ({ rate = 0, frequency = "Monthly" }) => {
  const annualRate = Number(rate) || 0;

  return annualRate > 0 ? annualRate / 100 / periodsPerYear(frequency) : 0;
};

// The span flat interest is charged over, in years.
export const getInterestYears = ({ tenure = 0, tenureUnit = "Months", frequency = "Monthly" }) => {
  const value = Number(tenure) || 0;

  return tenureUnit === "Years" ? value : value / periodsPerYear(frequency);
};

// The UI labels reducing-balance loans "Reducing Balance"; older records say "Reducing".
export const normaliseInterestType = (type) =>
  type === "Reducing Balance" || type === "Reducing" ? "Reducing" : "Flat";

export const addPeriods = (date, frequency, periods) => {
  const next = new Date(date);

  if (Number.isNaN(next.getTime())) {
    return "";
  }

  switch (frequency) {
    case "Daily":
      next.setDate(next.getDate() + periods);
      break;
    case "Weekly":
      next.setDate(next.getDate() + periods * 7);
      break;
    case "Bi-Weekly":
      next.setDate(next.getDate() + periods * 14);
      break;
    case "Quarterly":
      next.setMonth(next.getMonth() + periods * 3);
      break;
    case "Half-Yearly":
      next.setMonth(next.getMonth() + periods * 6);
      break;
    case "Yearly":
      next.setFullYear(next.getFullYear() + periods);
      break;
    case "Monthly":
    default:
      next.setMonth(next.getMonth() + periods);
      break;
  }

  return next.toISOString().split("T")[0];
};
