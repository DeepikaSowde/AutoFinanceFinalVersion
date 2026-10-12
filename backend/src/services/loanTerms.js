// src/services/loanTerms.js
//
// How loan terms turn into a payment count, a periodic rate, an interest
// period and due dates. Shared by loanCalculator.js and repaymentSchedule.js
// so persisted figures always match the schedule, and kept identical to the
// frontend's New Loan preview (components/Loantab.jsx calculateRepayment and
// components/RepaymentScheduleTable.jsx generateSchedule), so what the user
// sees before submitting is what gets saved.
//
// The interest rate is a MONTHLY rate (% per month). Tenure is in Months or
// Years; the payment count follows from tenure and frequency
// (e.g. 12 months paid weekly = 52 payments).

// Payments per month for each frequency. Daily/Weekly/Monthly are what the
// New Loan screen offers; the rest keep loans saved before that readable.
const PAYMENTS_PER_MONTH = {
  Daily: 30,
  Weekly: 52 / 12,
  "Bi-Weekly": 26 / 12,
  Monthly: 1,
  Quarterly: 1 / 3,
  "Half-Yearly": 1 / 6,
  Yearly: 1 / 12,
};

const PAYMENTS_PER_YEAR = {
  Daily: 365,
  Weekly: 52,
  "Bi-Weekly": 26,
  Monthly: 12,
  Quarterly: 4,
  "Half-Yearly": 2,
  Yearly: 1,
};

const paymentsPerMonth = (frequency) => PAYMENTS_PER_MONTH[frequency] || 1;

export const tenureInMonths = (tenure = 0, tenureUnit = "Months") => {
  const value = Number(tenure) || 0;

  return tenureUnit === "Years" ? value * 12 : value;
};

export const getPaymentCount = ({ tenure = 0, tenureUnit = "Months", frequency = "Monthly" }) => {
  const value = Number(tenure) || 0;

  if (value <= 0) {
    return 0;
  }

  const count =
    tenureUnit === "Years"
      ? value * (PAYMENTS_PER_YEAR[frequency] || 12)
      : tenureInMonths(value, tenureUnit) * paymentsPerMonth(frequency);

  return Math.max(Math.round(count), 0);
};

// The monthly rate spread over the payments in a month.
export const getPeriodicRate = ({ rate = 0, frequency = "Monthly" }) => {
  const monthlyRate = Number(rate) || 0;

  return monthlyRate > 0 ? monthlyRate / 100 / paymentsPerMonth(frequency) : 0;
};

// Flat interest is the monthly rate charged for every month of the tenure.
export const getInterestMonths = ({ tenure = 0, tenureUnit = "Months" }) => tenureInMonths(tenure, tenureUnit);

// The UI labels reducing-balance loans "Reducing Balance"; older records say "Reducing".
export const normaliseInterestType = (type) =>
  type === "Reducing Balance" || type === "Reducing" ? "Reducing" : "Flat";

/*
 * Due date of the installment `periods` steps after the first. Monthly keeps
 * the same day of the month, clamped to the month's last day (31 Jan ->
 * 28/29 Feb -> 31 Mar), as the New Loan schedule does.
 */
export const addPeriods = (date, frequency, periods) => {
  const start = new Date(date);

  if (Number.isNaN(start.getTime())) {
    return "";
  }

  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const day = start.getUTCDate();
  const daysInMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const monthsAhead = (count) => {
    const target = month + count;
    const targetYear = year + Math.floor(target / 12);
    const targetMonth = ((target % 12) + 12) % 12;
    return new Date(Date.UTC(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth))));
  };

  let next;

  switch (frequency) {
    case "Daily":
      next = new Date(Date.UTC(year, month, day + periods));
      break;
    case "Weekly":
      next = new Date(Date.UTC(year, month, day + periods * 7));
      break;
    case "Bi-Weekly":
      next = new Date(Date.UTC(year, month, day + periods * 14));
      break;
    case "Quarterly":
      next = monthsAhead(periods * 3);
      break;
    case "Half-Yearly":
      next = monthsAhead(periods * 6);
      break;
    case "Yearly":
      next = monthsAhead(periods * 12);
      break;
    case "Monthly":
    default:
      next = monthsAhead(periods);
      break;
  }

  return next.toISOString().split("T")[0];
};
