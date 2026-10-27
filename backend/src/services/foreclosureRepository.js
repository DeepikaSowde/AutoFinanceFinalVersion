// src/services/foreclosureRepository.js
//
// Selling a seized vehicle forecloses its loan. This works out what the sale
// had to cover (the foreclosure cost) on the company-wide Foreclosure &
// Vehicle Sale settings, and records the settlement with the customer
// afterwards:
//
//   Total Foreclosure Cost = Outstanding Principal + Unpaid Interest
//                          + Vehicle Expenses          (if enabled)
//                          + Seized-Period Interest    (if enabled)
//                          + Applicable Penalty        (if enabled)
//   Profit / Loss          = Sale Amount - Total Foreclosure Cost
//
// A profit can be paid out to the customer (one expense row) or retained; a
// shortfall can be collected from the customer (one income row per
// collection, until it is fully recovered) or waived. Money that has moved is
// never reversed by a later decision.

import { query } from "../db/connection.js";
import { currentTenantId } from "../db/tenantContext.js";
import { insertExpense } from "./expenseRepository.js";
import { insertIncome } from "./incomeRepository.js";
import { businessToday, pendingPenaltySummary } from "./penaltyRepository.js";

const roundMoney = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round((number + Number.EPSILON) * 100) / 100 : 0;
};
const rupees = (value) => Math.round(Number(value) || 0);
const httpError = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const inr = (value) => `₹${rupees(value).toLocaleString("en-IN")}`;

/* ---------- settings ---------- */

export const SEIZED_PERIOD_BASIS = ["Option A", "Option B"];

export const DEFAULT_FORECLOSURE_SETTINGS = {
  includeOutstanding: true,
  includeVehicleExpenses: true,
  includeSeizedPeriodInterest: true,
  seizedPeriodBasis: "Option A",
  includePenalty: true,
};

const normaliseSettings = (raw = {}) => ({
  // Outstanding principal and interest are always part of the cost.
  includeOutstanding: true,
  includeVehicleExpenses: raw.includeVehicleExpenses === undefined ? true : Boolean(raw.includeVehicleExpenses),
  includeSeizedPeriodInterest:
    raw.includeSeizedPeriodInterest === undefined ? true : Boolean(raw.includeSeizedPeriodInterest),
  seizedPeriodBasis: raw.seizedPeriodBasis === "Option B" ? "Option B" : "Option A",
  includePenalty: raw.includePenalty === undefined ? true : Boolean(raw.includePenalty),
});

const SETTINGS_KEY = "foreclosure_settings";

export const getForeclosureSettings = async (db = { query }) => {
  const result = await db.query("SELECT value FROM app_settings WHERE tenant_id = $1 AND key = $2", [
    currentTenantId(),
    SETTINGS_KEY,
  ]);
  const value = result.rows[0]?.value || {};
  return { ...normaliseSettings(value), updatedAt: value.updatedAt || null, updatedBy: value.updatedBy || null };
};

export const saveForeclosureSettings = async (raw = {}, updatedBy = "") => {
  if (raw.seizedPeriodBasis !== undefined && !SEIZED_PERIOD_BASIS.includes(raw.seizedPeriodBasis)) {
    throw httpError('Seized-period basis must be "Option A" or "Option B".');
  }
  const value = { ...normaliseSettings(raw), updatedAt: new Date().toISOString(), updatedBy: updatedBy || null };
  await query(
    `INSERT INTO app_settings (tenant_id, key, value) VALUES ($1, $2, $3)
     ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value`,
    [currentTenantId(), SETTINGS_KEY, JSON.stringify(value)]
  );
  return getForeclosureSettings();
};

/* ---------- the foreclosure cost ---------- */

const dateMs = (value) => {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
};
const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD = {
  daily: { unit: "Days", ms: DAY_MS },
  weekly: { unit: "Weeks", ms: 7 * DAY_MS },
  monthly: { unit: "Months", ms: 30.4375 * DAY_MS },
};

/*
 * Interest for the time the vehicle sat seized, at the loan's average
 * interest per instalment:
 *   Option A - from the seizure date to the sale date (the part inside the
 *              tenure plus any time after it);
 *   Option B - only the time after the tenure ended.
 */
export const seizedPeriodInterest = ({ loan, seizureDate, saleDate, basis = "Option A" }) => {
  const frequency = String(loan.repayment?.frequency || "Monthly").toLowerCase();
  const period = PERIOD[frequency] || PERIOD.monthly;
  const schedule = loan.repaymentSchedule || [];

  const tenureEnd = schedule.length ? schedule[schedule.length - 1].dueDate : saleDate;
  const periodicInterest = schedule.length
    ? schedule.reduce((sum, row) => sum + Number(row.interest || 0), 0) / schedule.length
    : 0;

  const seizedMs = dateMs(seizureDate || saleDate);
  const tenureEndMs = dateMs(tenureEnd);
  const saleMs = dateMs(saleDate);

  const postTenureDuration = saleMs > tenureEndMs ? Math.max(0, Math.round((saleMs - tenureEndMs) / period.ms)) : 0;
  const withinTenureDuration =
    tenureEndMs > seizedMs ? Math.max(0, Math.round((Math.min(saleMs, tenureEndMs) - seizedMs) / period.ms)) : 0;

  const optionB = basis === "Option B";
  const duration = optionB ? postTenureDuration : withinTenureDuration + postTenureDuration;

  return {
    amount: Math.max(0, Math.round(duration * periodicInterest)),
    duration,
    unit: period.unit,
    startDate: optionB ? tenureEnd : String(seizureDate || "").slice(0, 10),
    endDate: saleDate,
    basis: optionB ? "Option B" : "Option A",
    withinTenureDuration,
    postTenureDuration,
    periodicInterest: Math.round(periodicInterest),
    withinTenureAmount: Math.max(0, Math.round(withinTenureDuration * periodicInterest)),
    postTenureAmount: Math.max(0, Math.round(postTenureDuration * periodicInterest)),
  };
};

// Vehicle Expense rows already booked against the vehicle (Ledger -> Add
// Expense -> Vehicle Expense, while it was held).
export const recordedVehicleExpenses = async (db, vehicleId) => {
  const result = await db.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses
      WHERE tenant_id = $1 AND category = 'Vehicle Expense' AND details->>'vehicleId' = $2`,
    [currentTenantId(), vehicleId]
  );
  return roundMoney(result.rows[0].total);
};

/*
 * The foreclosure cost and profit / loss of selling the vehicle for
 * `salePrice` on `saleDate`, in the shape the Vehicle and Loan screens read
 * (record.foreclosure.finalizedCalculation). `vehicleExpenses` defaults to the
 * expenses already booked against the vehicle.
 */
export const computeForeclosure = async (db, { vehicleRow, loan, salePrice, saleDate, vehicleExpenses }) => {
  const settings = await getForeclosureSettings(db);
  const sale = roundMoney(salePrice);
  const date = String(saleDate || businessToday()).slice(0, 10);

  const outstandingPrincipal = rupees(loan?.principalOutstanding);
  const scheduledUnpaidInterest = rupees(loan?.interestOutstanding);

  const rawExpenses =
    vehicleExpenses === undefined || vehicleExpenses === null || vehicleExpenses === ""
      ? await recordedVehicleExpenses(db, vehicleRow.id)
      : Math.max(0, roundMoney(vehicleExpenses));
  const expenses = settings.includeVehicleExpenses ? rawExpenses : 0;

  const seized = seizedPeriodInterest({
    loan: loan || {},
    seizureDate: vehicleRow.seizure?.seizureDate,
    saleDate: date,
    basis: settings.seizedPeriodBasis,
  });
  const seizedInterest = settings.includeSeizedPeriodInterest ? seized.amount : 0;

  // Option A covers the seized months inside the tenure, whose interest is
  // also still in the schedule: count those months once.
  const overlap =
    settings.includeSeizedPeriodInterest && settings.seizedPeriodBasis === "Option A"
      ? Math.min(scheduledUnpaidInterest, seized.withinTenureAmount)
      : 0;
  const unpaidInterest = Math.max(0, scheduledUnpaidInterest - overlap);

  // Penalties still pending on the sale date, on the Penalty & Grace rules.
  const penaltySummary = loan?.id ? await pendingPenaltySummary(db, loan.id, date) : null;
  const rule = penaltySummary?.rule || {};
  const frequency = penaltySummary?.frequency || "Monthly";
  let penalty = 0;
  let penaltyReason;
  if (!settings.includePenalty) {
    penaltyReason = "Excluded: Applicable penalty is disabled in Foreclosure Settings";
  } else if (!rule.enabled) {
    penaltyReason = `Excluded: ${frequency} penalty is disabled in Penalty Settings`;
  } else if (penaltySummary.pendingAmount > 0) {
    penalty = rupees(penaltySummary.pendingAmount);
    penaltyReason = `Included: ${inr(penalty)} across ${penaltySummary.pendingCount} eligible overdue installment(s) (${rule.penaltyType || "Fixed Penalty"})`;
  } else if (penaltySummary.frozenCount > 0) {
    penaltyReason = `Excluded: Penalty is frozen (${penaltySummary.frozenCount} installment(s))`;
  } else if (penaltySummary.cancelledCount > 0) {
    penaltyReason = "Excluded: Penalty was cancelled by administrator";
  } else {
    penaltyReason = "No eligible unpaid penalties (within grace period or up to date)";
  }
  const penaltyEngineEnabled = Boolean(settings.includePenalty && rule.enabled);

  const totalForeclosureCost = Math.round(outstandingPrincipal + unpaidInterest + expenses + seizedInterest + penalty);
  const profitLoss = Math.round(sale - totalForeclosureCost);

  return {
    salePrice: sale,
    saleDate: date,
    settings: normaliseSettings(settings),
    components: {
      outstandingPrincipalAndInterest: {
        enabled: true,
        principal: outstandingPrincipal,
        unpaidInterest,
        total: outstandingPrincipal + unpaidInterest,
        originalScheduledUnpaidInterest: scheduledUnpaidInterest,
      },
      vehicleExpenses: { enabled: settings.includeVehicleExpenses, amount: expenses, rawAmount: rawExpenses },
      seizedPeriodInterest: {
        enabled: settings.includeSeizedPeriodInterest,
        basis: settings.seizedPeriodBasis,
        amount: seizedInterest,
        details: {
          amount: seized.amount,
          duration: seized.duration,
          unit: seized.unit,
          startDate: seized.startDate,
          endDate: seized.endDate,
          basis: seized.basis,
          withinTenureAmount: seized.withinTenureAmount,
          postTenureAmount: seized.postTenureAmount,
        },
      },
      applicablePenalty: {
        enabled: penaltyEngineEnabled,
        amount: penalty,
        penaltyEngineEnabled,
        reason: penaltyReason,
        details: {
          enabled: penalty > 0,
          frequency,
          frequencyEnabled: Boolean(rule.enabled),
          reason: penaltyReason,
          eligibleCount: penaltySummary?.pendingCount || 0,
          amount: penalty,
          penaltyType: rule.penaltyType || "Fixed Penalty",
          gracePeriodDays: rule.gracePeriodDays ?? 0,
        },
      },
    },
    outstandingPrincipal,
    unpaidInterest,
    vehicleExpenses: expenses,
    seizedPeriodInterest: seizedInterest,
    penalty,
    totalForeclosureCost,
    profitLoss,
    isProfit: profitLoss > 0,
    isLoss: profitLoss < 0,
    isBreakEven: profitLoss === 0,
    shortfall: profitLoss < 0 ? Math.abs(profitLoss) : 0,
  };
};

// The settlement a sale starts with: pending a decision, or settled at break-even.
export const initialSettlement = (calc, now) =>
  calc.isBreakEven
    ? {
        status: "Settled",
        type: "breakeven",
        action: "Break-even Foreclosure",
        amount: 0,
        settlementAmount: 0,
        shortfall: 0,
        profitLoss: 0,
        createdAt: now,
        notes: "Finalized at break-even (Total Foreclosure Cost matches Sale Amount)",
        collections: [],
      }
    : {
        status: "Pending",
        type: calc.isProfit ? "surplus_pending" : "shortfall_pending",
        action: "Pending Settlement Decision",
        amount: 0,
        settlementAmount: 0,
        shortfall: calc.shortfall,
        profitLoss: calc.profitLoss,
        isProfit: calc.isProfit,
        isLoss: calc.isLoss,
        createdAt: now,
        notes: "Pending settlement decision in Sold Vehicles section",
        collections: [],
      };

/* ---------- the settlement ---------- */

const DECISIONS = ["recovery", "waiver", "payout", "retained", "breakeven"];

/*
 * Applies a settlement decision to a sold vehicle's sale record (inside the
 * caller's transaction) and books any money that moves:
 *   recovery  - shortfall collected from the customer: one income row
 *               ("Shortfall Recovery") per collection, up to the shortfall;
 *   waiver    - the rest of the shortfall is not collected (nothing booked);
 *   payout    - paid to the customer: one expense row ("Customer Profit
 *               Payment"), at most the profit (after a loss, a refund);
 *   retained  - the profit is kept (nothing booked);
 *   breakeven - nothing to settle.
 * Returns the new sale record and the history event's details.
 */
export const applySettlement = async (client, { vehicleRow, loanId, regNo: vehicleRegNo, customerName, body, performedBy }) => {
  const sale = vehicleRow.sale || {};
  const calc = sale.finalizedCalculation;
  if (!calc) throw httpError("This sale has no foreclosure calculation to settle.", 409);

  const decision = String(body.decision || body.type || "").trim();
  if (!DECISIONS.includes(decision)) throw httpError("Choose a valid settlement decision.");

  const previous = sale.settlement || {};
  const collections = Array.isArray(previous.collections) ? previous.collections : [];
  const recovered = roundMoney(collections.reduce((sum, c) => sum + Number(c.amount || 0), 0));
  const shortfall = rupees(calc.shortfall);
  const profit = Math.max(0, rupees(calc.profitLoss));
  const amount = rupees(body.amount);
  const notes = String(body.notes || "").trim();
  const now = new Date().toISOString();
  const today = businessToday();
  const regNo = vehicleRegNo || "Vehicle";
  const who = customerName || "Customer";

  if (previous.type === "payout" && decision !== "payout") {
    throw httpError("The customer has already been paid; that payment cannot be undone here.", 409);
  }
  if (previous.type === "payout" && decision === "payout") {
    throw httpError("The customer payout has already been recorded.", 409);
  }

  let settlement;

  if (decision === "breakeven") {
    if (!calc.isBreakEven) throw httpError("This sale did not break even.");
    settlement = { ...previous, type: "breakeven", action: "Foreclosure Break-Even Finalized", amount: 0, status: "Completed", timestamp: now };
  } else if (decision === "recovery" || decision === "waiver") {
    if (!calc.isLoss) throw httpError("There is no shortfall to settle on this sale.");
    if (decision === "recovery") {
      const remaining = Math.max(0, shortfall - recovered);
      if (!(amount > 0)) throw httpError("Please enter a collection amount greater than ₹0.");
      if (amount > remaining) {
        throw httpError(`Amount cannot exceed the remaining recoverable shortfall of ${inr(remaining)}.`);
      }
      const incomeId = await insertIncome(client, {
        amount,
        status: "Received",
        category: "Shortfall Recovery",
        incomeDate: today,
        paymentMode: body.paymentMode || "Cash",
        receivedFrom: who,
        reference: loanId,
        description: `Shortfall collected from customer • ${regNo} (${who})`,
        remarks: notes || `Shortfall recovery for loan ${loanId}`,
        loanId,
        vehicleId: vehicleRow.id,
        vehicleRegNo: regNo,
        customerName: who,
        isForeclosureRecovery: true,
        createdBy: performedBy,
      });
      const total = recovered + amount;
      settlement = {
        ...previous,
        type: "recovery",
        action: "Shortfall Collected from Customer",
        amount: total,
        lastCollectedAmount: amount,
        shortfall,
        profitLoss: calc.profitLoss,
        status: total >= shortfall ? "Completed" : "Partially Collected",
        timestamp: now,
        notes: notes || `Shortfall of ${inr(amount)} collected from customer (Total collected: ${inr(total)})`,
        collections: [...collections, { amount, date: today, incomeId, at: now }],
      };
    } else {
      settlement = {
        ...previous,
        type: "waiver",
        action: "Do Not Collect from Customer",
        // Anything already collected stays collected.
        amount: recovered,
        settlementAmount: 0,
        shortfall,
        profitLoss: calc.profitLoss,
        status: "Waived",
        timestamp: now,
        recoveryWaivedAt: now,
        notes:
          notes ||
          `Shortfall of ${inr(shortfall - recovered)} will not be collected from customer. No income transaction created.`,
      };
    }
  } else if (decision === "payout") {
    // A profit is paid out up to its amount; after a loss a refund to the
    // customer is still allowed (a special-policy payout).
    if (calc.isBreakEven) throw httpError("This sale broke even; there is nothing to pay out.");
    if (!(amount > 0)) throw httpError("Please enter a valid payout amount greater than ₹0.");
    if (calc.isProfit && amount > profit) throw httpError(`Payout amount cannot exceed the total surplus of ${inr(profit)}.`);
    const expenseId = await insertExpense(client, {
      amount,
      status: "Paid",
      category: "Customer Profit Payment",
      expenseDate: today,
      paymentMode: body.paymentMode || "Cash",
      paidBy: performedBy,
      reference: loanId,
      description: `Customer Profit Payment • ${regNo} (${who})`,
      remarks: notes || `Customer profit payment for loan ${loanId}`,
      loanId,
      vehicleId: vehicleRow.id,
      vehicleRegNo: regNo,
      customerName: who,
      isForeclosurePayout: true,
      createdBy: performedBy,
    });
    settlement = {
      ...previous,
      type: "payout",
      action: calc.isProfit ? "Customer Profit Paid" : "Customer Payout Approved",
      amount,
      settlementAmount: amount,
      profitLoss: calc.profitLoss,
      status: "Completed",
      timestamp: now,
      expenseId,
      notes:
        notes ||
        (calc.isProfit
          ? `Customer profit payment of ${inr(amount)} paid to customer from vehicle sale profit.`
          : `Customer payout of ${inr(amount)} approved and recorded.`),
    };
  } else {
    if (!calc.isProfit) throw httpError("There is no profit to settle on this sale.");
    settlement = {
      ...previous,
      type: "retained",
      action: "Retain Surplus / No Payout",
      amount: 0,
      settlementAmount: 0,
      profitLoss: calc.profitLoss,
      status: "Retained",
      timestamp: now,
      settlementWaivedAt: now,
      notes:
        notes ||
        `Customer profit of ${inr(profit)} will not be paid to customer. No expense transaction created.`,
    };
  }

  const event = {
    eventType: "settlement",
    settlementType: settlement.type,
    amount: decision === "recovery" ? amount : settlement.amount,
    status: settlement.status,
    notes: settlement.notes,
    reason: settlement.action,
  };

  return { sale: { ...sale, settlement, updatedAt: now }, event };
};
