// src/routes/finance.js
//
// Investors, expenses and re-loan configuration.

import { Router } from "express";

import {
  addInvestorInvestment,
  allocateInvestmentPoolToLoan,
  createInvestor,
  getFundingSummary,
  getInvestorById,
  getInvestorTransactions,
  getInvestors,
} from "../services/investorRepository.js";
import {
  addExpense,
  deleteExpense,
  getExpenseById,
  getExpenses,
  updateExpense,
} from "../services/expenseRepository.js";
import {
  addIncome,
  deleteIncome,
  getIncomeById,
  getIncomes,
  updateIncome,
} from "../services/incomeRepository.js";
import {
  addReferral,
  deleteReferral,
  getReferrals,
  markReferralPaid,
} from "../services/referralRepository.js";
import {
  addReminder,
  getReminders,
  updateReminder,
} from "../services/reminderRepository.js";
import {
  addCategory,
  deleteCategory,
  getCategories,
} from "../services/categoryRepository.js";
import {
  getEligibilityChecks,
  getReLoanRules,
  saveEligibilityCheck,
  saveReLoanRules,
} from "../services/reloanRepository.js";
import { requirePermission, requireRole } from "../middleware/requireAuth.js";

// Money data also feeds the overview screens, so those can read it too.
const OVERVIEW_READERS = ["ledger.view", "dashboard.view", "control-center.view"];
import { asyncHandler } from "../util/asyncHandler.js";

/* =========================================================
   INVESTORS
========================================================= */

export const investorsRouter = Router();

investorsRouter.get(
  "/",
  requirePermission("investor.view", "loans.add", ...OVERVIEW_READERS),
  asyncHandler(async (req, res) => {
    res.json(await getInvestors());
  })
);

investorsRouter.get(
  "/summary",
  requirePermission("investor.view", "loans.add", ...OVERVIEW_READERS),
  asyncHandler(async (req, res) => {
    res.json(await getFundingSummary());
  })
);

investorsRouter.get(
  "/transactions",
  requirePermission("investor.view", "loans.add", ...OVERVIEW_READERS),
  asyncHandler(async (req, res) => {
    res.json(await getInvestorTransactions(req.query.investorId));
  })
);

investorsRouter.get(
  "/:investorId",
  requirePermission("investor.view", "loans.add", ...OVERVIEW_READERS),
  asyncHandler(async (req, res) => {
    const investor = await getInvestorById(req.params.investorId);

    if (!investor) {
      return res.status(404).json({ error: "Investor not found." });
    }

    res.json(investor);
  })
);

investorsRouter.post(
  "/",
  requirePermission("investor.add"),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createInvestor(req.body || {}));
  })
);

investorsRouter.post(
  "/:investorId/investments",
  requirePermission("investor.add"),
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(await addInvestorInvestment({ ...(req.body || {}), investorId: req.params.investorId }));
  })
);

// Funding a loan draws on the whole pool, so it is not nested under an investor.
investorsRouter.post(
  "/allocations",
  requirePermission("investor.add", "loans.add", "reloan.add"),
  asyncHandler(async (req, res) => {
    res.status(201).json(await allocateInvestmentPoolToLoan(req.body || {}));
  })
);

/* =========================================================
   EXPENSES
========================================================= */

export const expensesRouter = Router();

expensesRouter.get(
  "/",
  requirePermission("expense.view", ...OVERVIEW_READERS),
  asyncHandler(async (req, res) => {
    res.json(await getExpenses());
  })
);

expensesRouter.get(
  "/:expenseId",
  requirePermission("expense.view", ...OVERVIEW_READERS),
  asyncHandler(async (req, res) => {
    const expense = await getExpenseById(req.params.expenseId);

    if (!expense) {
      return res.status(404).json({ error: "Expense not found." });
    }

    res.json(expense);
  })
);

expensesRouter.post(
  "/",
  requirePermission("expense.add"),
  asyncHandler(async (req, res) => {
    res.status(201).json(await addExpense(req.body || {}));
  })
);

expensesRouter.put(
  "/:expenseId",
  requirePermission("expense.edit"),
  asyncHandler(async (req, res) => {
    const expense = await updateExpense(req.params.expenseId, req.body || {});

    if (!expense) {
      return res.status(404).json({ error: "Expense not found." });
    }

    res.json(expense);
  })
);

expensesRouter.delete(
  "/:expenseId",
  requirePermission("expense.delete"),
  asyncHandler(async (req, res) => {
    if (!(await deleteExpense(req.params.expenseId))) {
      return res.status(404).json({ error: "Expense not found." });
    }

    res.status(204).send();
  })
);

/* =========================================================
   INCOME
========================================================= */

export const incomesRouter = Router();

incomesRouter.get(
  "/",
  requirePermission("income.view", ...OVERVIEW_READERS),
  asyncHandler(async (req, res) => {
    res.json(await getIncomes());
  })
);

incomesRouter.get(
  "/:incomeId",
  requirePermission("income.view", ...OVERVIEW_READERS),
  asyncHandler(async (req, res) => {
    const income = await getIncomeById(req.params.incomeId);

    if (!income) {
      return res.status(404).json({ error: "Income not found." });
    }

    res.json(income);
  })
);

incomesRouter.post(
  "/",
  requirePermission("income.add"),
  asyncHandler(async (req, res) => {
    res.status(201).json(await addIncome(req.body || {}));
  })
);

incomesRouter.put(
  "/:incomeId",
  requirePermission("income.edit"),
  asyncHandler(async (req, res) => {
    const income = await updateIncome(req.params.incomeId, req.body || {});

    if (!income) {
      return res.status(404).json({ error: "Income not found." });
    }

    res.json(income);
  })
);

incomesRouter.delete(
  "/:incomeId",
  requirePermission("income.delete"),
  asyncHandler(async (req, res) => {
    if (!(await deleteIncome(req.params.incomeId))) {
      return res.status(404).json({ error: "Income not found." });
    }

    res.status(204).send();
  })
);

/* =========================================================
   CATEGORIES
========================================================= */

export const categoriesRouter = Router();

categoriesRouter.get(
  "/",
  requirePermission("income.view", "expense.view"),
  asyncHandler(async (req, res) => {
    res.json(await getCategories(req.query.type));
  })
);

categoriesRouter.post(
  "/",
  requirePermission("income.add", "expense.add"),
  asyncHandler(async (req, res) => {
    const { type, name } = req.body || {};

    res.status(201).json(await addCategory(type, name));
  })
);

categoriesRouter.delete(
  "/:categoryId",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    if (!(await deleteCategory(req.params.categoryId))) {
      return res.status(404).json({ error: "Category not found." });
    }

    res.status(204).send();
  })
);

/* =========================================================
   RE-LOAN
========================================================= */

export const reloanRouter = Router();

reloanRouter.get(
  "/rules",
  requirePermission("reloan.view", "customers.view", "loans.view", "loans.add"),
  asyncHandler(async (req, res) => {
    res.json(await getReLoanRules());
  })
);

reloanRouter.put(
  "/rules",
  requirePermission("reloan.edit"),
  asyncHandler(async (req, res) => {
    res.json(await saveReLoanRules(req.body || {}));
  })
);

reloanRouter.get(
  "/eligibility",
  requirePermission("reloan.view", "customers.view", "loans.view"),
  asyncHandler(async (req, res) => {
    res.json(await getEligibilityChecks(req.query.loanId));
  })
);

// Every eligibility check is logged as an audit record, including ones
// run just by opening a customer or re-loan screen.
reloanRouter.post(
  "/eligibility",
  requirePermission("reloan.view", "customers.view", "loans.view"),
  asyncHandler(async (req, res) => {
    res.status(201).json(await saveEligibilityCheck(req.body || {}));
  })
);

/* =========================================================
   REFERRAL COMMISSIONS
========================================================= */

export const referralsRouter = Router();

referralsRouter.get(
  "/",
  requirePermission("expense.view"),
  asyncHandler(async (req, res) => {
    res.json(await getReferrals());
  })
);

referralsRouter.post(
  "/",
  requirePermission("expense.add"),
  asyncHandler(async (req, res) => {
    res.status(201).json(await addReferral(req.body || {}));
  })
);

referralsRouter.post(
  "/:referralId/pay",
  requirePermission("expense.approve"),
  asyncHandler(async (req, res) => {
    const referral = await markReferralPaid(req.params.referralId, req.body || {});

    if (!referral) {
      return res.status(404).json({ error: "Referral commission not found." });
    }

    res.json(referral);
  })
);

referralsRouter.delete(
  "/:referralId",
  requirePermission("expense.delete"),
  asyncHandler(async (req, res) => {
    if (!(await deleteReferral(req.params.referralId))) {
      return res.status(404).json({ error: "Referral commission not found." });
    }

    res.status(204).send();
  })
);

/* =========================================================
   REMINDERS
========================================================= */

export const remindersRouter = Router();

remindersRouter.get(
  "/",
  requirePermission("reminders.view"),
  asyncHandler(async (req, res) => {
    res.json(await getReminders());
  })
);

remindersRouter.post(
  "/",
  requirePermission("reminders.add"),
  asyncHandler(async (req, res) => {
    res.status(201).json(await addReminder(req.body || {}));
  })
);

remindersRouter.put(
  "/:reminderId",
  requirePermission("reminders.edit"),
  asyncHandler(async (req, res) => {
    const reminder = await updateReminder(req.params.reminderId, req.body || {});

    if (!reminder) {
      return res.status(404).json({ error: "Reminder not found." });
    }

    res.json(reminder);
  })
);
