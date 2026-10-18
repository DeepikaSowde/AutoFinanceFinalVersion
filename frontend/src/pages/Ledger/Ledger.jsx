import React, { useState, useRef, useEffect, useMemo } from "react";
import { addExpense, addIncome, loadLedgerData } from "../../services/ledgerApi";
import { debitInvestor, reinvest } from "../../services/investorApi";
import IncomeView from "./IncomeView";
import ExpenseView from "./ExpenseView";
import {
  Plus,
  ArrowDownCircle,
  ArrowUpCircle,
  Wallet,
  Database,
  Calendar,
  Search,
  Download,
  ChevronDown,
  ChevronRight,
  User,
  Briefcase,
  TrendingDown,
  Car,
  SlidersHorizontal,
  X
} from "lucide-react";

import { isDateInRange, formatDateTimeParts, getLocalDateString } from "../../utils/dateUtils";
import DateRangeFilter from "../../components/DateRangeFilter";
import { calculateTotalInflow } from "../../utils/incomeCalculations";

const formatCurrency = (value) => `₹${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;

const Ledger = () => {
  const [filter, setFilter] = useState("Ledger");
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("All Time");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const [data, setData] = useState({ investors: [], customers: [], payments: [], incomeData: [], expenseData: [], vehicleSales: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const { investors, customers, payments, incomeData, expenseData, vehicleSales } = data;

  // For the Income / Expense tabs only: each sold vehicle as its gross sale
  // income and its expenses, from the server's sale record. The Ledger view and
  // totals below keep the single net-proceeds line, so nothing is counted twice.
  const tabData = useMemo(() => {
    const saleBase = (sale) => ({
      date: String(sale.date || '').slice(0, 10),
      mode: 'Cash',
      regNo: sale.regNo,
      vehicleRegNo: sale.regNo,
      loanId: sale.loanId || '—',
      customerName: sale.customerName || '—',
    });
    const saleIncomes = vehicleSales.map((sale) => ({
      ...saleBase(sale),
      id: `INC-${sale.id}`,
      type: 'Vehicle Sale',
      amount: sale.salePrice,
      remarks: `Vehicle Sale – ${sale.regNo || ''}`,
      isVehicleSale: true,
    }));
    const saleExpenses = vehicleSales
      .filter((sale) => sale.saleExpenses > 0)
      .map((sale) => ({
        ...saleBase(sale),
        id: `EXP-${sale.id}`,
        category: 'Vehicle Expense',
        amount: sale.saleExpenses,
        remarks: `Vehicle Expenses – ${sale.regNo || ''}`,
        isVehicleExpense: true,
      }));
    return {
      ...data,
      incomeData: [...incomeData, ...saleIncomes],
      expenseData: [...expenseData, ...saleExpenses],
    };
  }, [data, incomeData, expenseData, vehicleSales]);

  // State to trigger modals
  const [showTypeSelection, setShowTypeSelection] = useState(false);
  const [showAddIncome, setShowAddIncome] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [triggerRefresh, setTriggerRefresh] = useState(0); // To force refresh when sub-view adds data

  useEffect(() => {
    let active = true;

    loadLedgerData()
      .then((loaded) => {
        if (!active) return;
        setData(loaded);
        setLoadError("");
      })
      .catch((error) => active && setLoadError(error.message))
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [triggerRefresh]);

  // Investor Helper Calculations
  const getOpeningBalance = (inv) => inv.transactions?.find(t => t.type === "Opening Balance")?.amount || 0;
  const getNewInvestments = (inv) => inv.transactions?.filter(t => t.type === "New Investment" || t.type === "Re-Investment").reduce((sum, t) => sum + (t.amount || 0), 0) || 0;
  const getTotalAmountInvested = (inv) => getOpeningBalance(inv) + getNewInvestments(inv);
  const getInvestorDebits = (inv) => inv.transactions?.filter(t => t.type === "Debit").reduce((sum, t) => sum + (t.amount || 0), 0) || 0;
  const getInvestorRemainingCapital = (inv) => getTotalAmountInvested(inv) - getInvestorDebits(inv);

  const totalInvestedGlobal = investors.reduce((sum, inv) => sum + getTotalAmountInvested(inv), 0);
  const totalDebitsGlobal = investors.reduce((sum, inv) => sum + getInvestorDebits(inv), 0);
  const totalAllocatedToLoans = customers.reduce((sum, c) => sum + (c.loanAmount || 0), 0);
  const totalAvailablePool = Math.max(0, totalInvestedGlobal - totalDebitsGlobal - totalAllocatedToLoans);

  // Income Form States
  const [incomeType, setIncomeType] = useState('Other Income');
  const [incomeAmount, setIncomeAmount] = useState('');
  const [incomeDate, setIncomeDate] = useState(new Date().toISOString().slice(0, 10));
  const [incomeMode, setIncomeMode] = useState('Cash');
  const [incomeRemarks, setIncomeRemarks] = useState('');

  // Expense Form States
  const [expenseCategory, setExpenseCategory] = useState('Rent');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [expenseMode, setExpenseMode] = useState('Cash');
  const [expenseRemarks, setExpenseRemarks] = useState('');
  const [withdrawalInvestorId, setWithdrawalInvestorId] = useState('');
  const [incomeInvestorId, setIncomeInvestorId] = useState('');
  const [incomeError, setIncomeError] = useState('');
  const [expenseError, setExpenseError] = useState('');

  const resetIncomeForm = () => {
    setShowAddIncome(false);
    setIncomeAmount('');
    setIncomeRemarks('');
    setIncomeInvestorId('');
    setIncomeError('');
    setTriggerRefresh(prev => prev + 1);
  };

  const handleIncomeSubmit = async (e) => {
    e.preventDefault();
    setIncomeError('');
    const amountNum = Number(incomeAmount);
    if (!incomeAmount || isNaN(incomeAmount) || amountNum <= 0) {
      setIncomeError('Please enter a valid amount greater than 0.');
      return;
    }

    const isCapital = incomeType === 'Investor Capital' || incomeType === 'Investment';
    if (isCapital && !incomeInvestorId) {
      setIncomeError('Please select an investor for the investment capital.');
      return;
    }
    if (saving) return;

    setSaving(true);
    try {
      if (isCapital) {
        await reinvest(incomeInvestorId, {
          investmentAmount: amountNum,
          investmentDate: incomeDate,
          transferMode: incomeMode,
        });
      } else {
        await addIncome({ type: incomeType, amount: amountNum, date: incomeDate, mode: incomeMode, remarks: incomeRemarks });
      }
      resetIncomeForm();
    } catch (error) {
      setIncomeError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const resetExpenseForm = () => {
    setShowAddExpense(false);
    setExpenseAmount('');
    setExpenseRemarks('');
    setWithdrawalInvestorId('');
    setExpenseError('');
    setTriggerRefresh(prev => prev + 1);
  };

  const handleExpenseSubmit = async (e) => {
    e.preventDefault();
    setExpenseError('');
    const amountNum = Number(expenseAmount);
    if (!expenseAmount || isNaN(expenseAmount) || amountNum <= 0) {
      setExpenseError('Please enter a valid amount greater than 0.');
      return;
    }

    const isWithdrawal = expenseCategory === 'Investor Withdrawal';
    if (isWithdrawal) {
      if (!withdrawalInvestorId) {
        setExpenseError('Please select an investor for the withdrawal.');
        return;
      }
      const selectedInv = investors.find(i => i.id === withdrawalInvestorId);
      const remCapital = selectedInv ? getInvestorRemainingCapital(selectedInv) : 0;
      if (amountNum > remCapital) {
        setExpenseError(`Withdrawal amount (₹${amountNum.toLocaleString('en-IN')}) exceeds investor's remaining capital (₹${remCapital.toLocaleString('en-IN')}).`);
        return;
      }
    }
    if (saving) return;

    setSaving(true);
    try {
      if (isWithdrawal) {
        await debitInvestor(withdrawalInvestorId, {
          debitAmount: amountNum,
          debitDate: expenseDate,
          paymentMode: expenseMode,
          reason: 'Withdrawal',
          remarks: expenseRemarks || 'Investor Withdrawal',
        });
      } else {
        await addExpense({ category: expenseCategory, amount: amountNum, date: expenseDate, mode: expenseMode, remarks: expenseRemarks });
      }
      resetExpenseForm();
    } catch (error) {
      setExpenseError(error.message);
    } finally {
      setSaving(false);
    }
  };

  // Flatten all transactions from investors (skipping debits already in expenseData and investments already in incomeData to prevent double counting)
  const rawTransactions = [];
  investors.forEach(inv => {
    if (inv.transactions) {
      inv.transactions.forEach(tx => {
        const isLinkedToExpense = tx.type === 'Debit' && expenseData.some(e =>
          (e.transactionId && e.transactionId === tx.id) ||
          (tx.expenseId && tx.expenseId === e.id) ||
          (e.category === 'Investor Withdrawal' && e.investorId === inv.id && Number(e.amount) === Number(tx.amount) && e.date === tx.date)
        );
        const isLinkedToIncome = (tx.type === 'New Investment' || tx.type === 'Re-Investment') && incomeData.some(inc =>
          (inc.transactionId && inc.transactionId === tx.id) ||
          (tx.incomeId && tx.incomeId === inc.id) ||
          (inc.type === 'Investment' && inc.investorId === inv.id && Number(inc.amount) === Number(tx.amount) && (inc.date || '').slice(0, 10) === (tx.date || '').slice(0, 10))
        );
        if (!isLinkedToExpense && !isLinkedToIncome) {
          rawTransactions.push({
            ...tx,
            source: 'investor',
            investorName: inv.name,
            investorId: inv.id
          });
        }
      });
    }
  });

  // Flatten loans from customers
  customers.forEach(cust => {
    if (cust.loanAmount) {
      rawTransactions.push({
        id: cust.loanId,
        date: cust.customer?.applicationDate || new Date().toISOString().slice(0, 10),
        amount: cust.loanAmount,
        type: "Loan Disbursed",
        source: 'customer',
        customerName: cust.customer?.name,
        loanId: cust.loanId
      });
    }
  });

  // Flatten collections from payments
  payments.forEach(pay => {
    const cust = customers.find(c => c.customerId === pay.customerId);
    rawTransactions.push({
      id: pay.id,
      date: pay.date,
      amount: pay.amount,
      type: "Collection",
      source: 'payment',
      customerName: cust?.customer?.name || "Unknown Customer",
      loanId: pay.loanId
    });
  });

  // Flatten sold vehicles (net sale proceeds)
  vehicleSales.forEach(sale => {
    rawTransactions.push({
      id: sale.id,
      date: sale.date,
      amount: sale.amount,
      type: "Vehicle Sale",
      source: 'sold',
      customerName: sale.customerName,
      loanId: sale.loanId,
      regNo: sale.regNo,
      salePrice: sale.salePrice,
      saleExpenses: sale.saleExpenses
    });
  });

  // Flatten manual income
  incomeData.forEach(inc => {
    rawTransactions.push({
      id: inc.id,
      date: inc.date,
      amount: inc.amount,
      type: "Income",
      source: 'income',
      description: inc.type,
      remarks: inc.remarks,
      customerName: inc.customerName,
      customerId: inc.customerId,
      loanId: inc.loanId,
    });
  });

  // Flatten manual expense
  expenseData.forEach(exp => {
    if (exp.category === 'Investor Withdrawal') {
      rawTransactions.push({
        id: exp.id,
        date: exp.date,
        amount: exp.amount,
        type: "Investor Withdrawal",
        source: 'investor_withdrawal',
        description: exp.category,
        remarks: exp.remarks,
        investorName: exp.investorName,
        investorId: exp.investorId,
        mode: exp.mode
      });
    } else {
      rawTransactions.push({
        id: exp.id,
        date: exp.date,
        amount: exp.amount,
        type: "Expense",
        source: 'expense',
        description: exp.category,
        remarks: exp.remarks,
        referralName: exp.referrerName || exp.referralName,
        customerName: exp.customerName,
        loanId: exp.loanId,
      });
    }
  });

  // Sort chronologically (oldest first) to compute running balance
  rawTransactions.sort((a, b) => new Date(a.date) - new Date(b.date));

  let runningBalance = 0;
  const allTransactions = rawTransactions.map(tx => {
    let amountIn = null;
    let amountOut = null;
    let typeDesc = "";
    let subDesc = "";
    let name = "";

    if (tx.source === 'payment' && tx.type === "Collection") {
      amountIn = Number(tx.amount || 0);
      runningBalance += amountIn;
      typeDesc = "EMI Collection";
      subDesc = `Loan ID: ${tx.loanId} · Collection Amount: ₹${Number(amountIn).toLocaleString('en-IN')}`;
      name = tx.customerName;
    } else if (tx.source === 'customer' && tx.type === "Loan Disbursed") {
      amountOut = Number(tx.amount || 0);
      runningBalance -= amountOut;
      typeDesc = "Loan Disbursed";
      subDesc = `Loan ID: ${tx.loanId} · Loan Amount: ₹${Number(amountOut).toLocaleString('en-IN')}`;
      name = tx.customerName;
    } else if (tx.source === 'investor_withdrawal' || tx.type === "Investor Withdrawal") {
      amountOut = Number(tx.amount || 0);
      runningBalance -= amountOut;
      typeDesc = "Investor Withdrawal";
      subDesc = `Investor: ${tx.investorName || "Investor"} · Mode: ${tx.mode || 'Withdrawal'}${tx.remarks ? ` · ${tx.remarks}` : ''}`;
      name = tx.investorName || "Investor";
    } else if (tx.type === "Debit") {
      amountOut = Number(tx.amount || 0);
      runningBalance -= amountOut;
      typeDesc = "Investor Withdrawal";
      subDesc = tx.reason ? `Reason: ${tx.reason}${tx.remarks ? ` - ${tx.remarks}` : ''}` : 'Withdrawal';
      name = tx.investorName;
    } else if (tx.source === 'sold') {
      amountIn = Number(tx.amount || 0);
      runningBalance += amountIn;
      typeDesc = "Vehicle Sale";
      subDesc = `${tx.regNo} · Loan ID: ${tx.loanId} · Sold for ₹${Number(tx.salePrice).toLocaleString('en-IN')}${tx.saleExpenses ? ` less ₹${Number(tx.saleExpenses).toLocaleString('en-IN')} costs` : ''}`;
      name = tx.customerName;
    } else if (tx.source === 'income') {
      amountIn = Number(tx.amount || 0);
      runningBalance += amountIn;
      typeDesc = tx.description === "Document Charge" ? "Document Charge" : (tx.description || "Income");
      subDesc = tx.loanId
        ? `Loan ID: ${tx.loanId}${tx.remarks ? ` · ${tx.remarks}` : ''}`
        : `${tx.description}${tx.remarks ? ` - ${tx.remarks}` : ''}`;
      name = tx.customerName || (tx.description === "Document Charge" ? "Document Charge" : "Manual Income");
    } else if (tx.source === 'expense') {
      amountOut = Number(tx.amount || 0);
      runningBalance -= amountOut;
      typeDesc = tx.description || "Expense";
      subDesc = tx.loanId && tx.loanId !== "—"
        ? `Loan ID: ${tx.loanId}${tx.remarks ? ` · ${tx.remarks}` : ''}`
        : `${tx.description}${tx.remarks ? ` - ${tx.remarks}` : ''}`;
      name = tx.referralName || tx.customerName || "Business Expense";
    } else {
      amountIn = Number(tx.amount || 0);
      runningBalance += amountIn;
      typeDesc = tx.type === "Opening Balance" ? "Opening Balance" : "Investor Deposit";
      subDesc = "Investment received";
      name = tx.investorName;
    }

    // Format date and time safely in IST
    const { date: dateStr, time: timeStr } = formatDateTimeParts(tx.date, tx);

    const getLedgerType = (source, type) => {
      if (source === 'investor_withdrawal' || type === 'Investor Withdrawal') return 'INVESTOR';
      switch (source) {
        case 'expense': return 'EXPENSE';
        case 'income': return 'INCOME';
        case 'investor': return 'INVESTOR';
        case 'payment': return 'COLLECTION';
        case 'customer': return 'LOAN';
        case 'sold': return 'SOLD';
        default: return source ? source.toUpperCase() : 'UNKNOWN';
      }
    };

    return {
      id: tx.id || Math.random().toString(),
      date: dateStr,
      time: timeStr || "-",
      description: `${name} – ${typeDesc}`,
      subtext: subDesc,
      in: amountIn,
      out: amountOut,
      balance: runningBalance,
      type: getLedgerType(tx.source, tx.type),
      icon: tx.source === 'customer' ? Briefcase : User,
      isOpeningBalance: tx.type === "Opening Balance",
      rawDate: tx.date
    };
  });

  // Reverse to show newest first
  const ledgerTransactions = allTransactions.reverse();

  const totalOpeningBalance = investors.reduce((sum, inv) => {
    const openingTx = inv.transactions?.find(t => t.type === "Opening Balance");
    return sum + Number(openingTx?.amount || 0);
  }, 0);

  // Money In = the Income page's Total Inflow (collections, recorded income,
  // investor capital) plus each sold vehicle's net proceeds, which the server
  // keeps on the sale rather than as an income row.
  const totalMoneyIn = calculateTotalInflow(incomeData, payments, investors, customers) +
    vehicleSales.reduce((sum, s) => sum + Number(s.amount || 0), 0);

  const regularExpensesTotal = expenseData
    .filter(e => e.category !== 'Investor Withdrawal')
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const investorDebitsTotal = investors.reduce((sum, inv) => {
    const debitTxs = inv.transactions?.filter(t => t.type === "Debit") || [];
    return sum + debitTxs.reduce((s, t) => s + Number(t.amount || 0), 0);
  }, 0);

  const unlinkedWithdrawalsTotal = expenseData
    .filter(e => e.category === 'Investor Withdrawal' && !investors.some(inv => inv.transactions?.some(t => t.id === e.transactionId || t.expenseId === e.id)))
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const totalMoneyOut = investorDebitsTotal + unlinkedWithdrawalsTotal + customers.reduce((sum, c) => sum + Number(c.loanAmount || 0), 0) + regularExpensesTotal;

  const closingBalance = totalOpeningBalance + totalMoneyIn - totalMoneyOut;

  const filteredTransactions = ledgerTransactions.filter(tx => {
    if (!isDateInRange(tx.rawDate || tx.date, dateFilter, customStart, customEnd)) return false;
    if (filter === 'Income' && !tx.in) return false;
    if (filter === 'Expense' && !tx.out) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!tx.description.toLowerCase().includes(q) && !tx.subtext.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  const isFilterActive = dateFilter !== 'All Time' || search.trim() !== '';

  const handleResetFilters = () => {
    setDateFilter('All Time');
    setCustomStart('');
    setCustomEnd('');
    setSearch('');
    setCurrentPage(1);
  };

  // KPI cards for the filtered view.
  // - Search only: the matching rows' subtotals.
  // - Date period: a statement for the period. Opening Balance = cash at the
  //   start of the period (every row dated before it, plus opening capital
  //   dated inside it), Money In / Out = the period's rows, Closing Balance =
  //   cash at the end of the period.
  const periodStart = (() => {
    const today = getLocalDateString(new Date());
    const [y, m] = today.split("-").map(Number);
    const pad = (n) => String(n).padStart(2, "0");
    if (dateFilter === "Today") return today;
    if (dateFilter === "This Week") {
      const d = new Date();
      d.setDate(d.getDate() - d.getDay());
      return getLocalDateString(d);
    }
    if (dateFilter === "This Month") return `${y}-${pad(m)}-01`;
    if (dateFilter === "Last Month") return m === 1 ? `${y - 1}-12-01` : `${y}-${pad(m - 1)}-01`;
    if (dateFilter === "Custom Range") return customStart || null;
    return null;
  })();
  const isDatePeriod = dateFilter !== "All Time";
  const sumIn = (rows) => rows.reduce((sum, tx) => sum + (Number(tx.in) || 0), 0);
  const sumOut = (rows) => rows.reduce((sum, tx) => sum + (Number(tx.out) || 0), 0);
  const searchMatches = (tx) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return tx.description.toLowerCase().includes(q) || tx.subtext.toLowerCase().includes(q);
  };
  const tabMatches = (tx) => !(filter === "Income" && !tx.in) && !(filter === "Expense" && !tx.out);
  const rowsBeforePeriod = isDatePeriod && periodStart
    ? ledgerTransactions.filter((tx) => {
        const day = getLocalDateString(tx.rawDate || tx.date);
        return day && day < periodStart && tabMatches(tx) && searchMatches(tx);
      })
    : [];

  const filteredOpeningBalance = !isFilterActive
    ? totalOpeningBalance
    : isDatePeriod
      ? sumIn(rowsBeforePeriod) - sumOut(rowsBeforePeriod) + sumIn(filteredTransactions.filter((tx) => tx.isOpeningBalance))
      : sumIn(filteredTransactions.filter((tx) => tx.isOpeningBalance));

  const filteredMoneyIn = isFilterActive
    ? sumIn(filteredTransactions.filter((tx) => !tx.isOpeningBalance))
    : totalMoneyIn;

  const filteredMoneyOut = isFilterActive
    ? sumOut(filteredTransactions)
    : totalMoneyOut;

  const filteredClosingBalance = isFilterActive
    ? filteredOpeningBalance + filteredMoneyIn - filteredMoneyOut
    : closingBalance;

  const PAGE_SIZE = 5;
  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));
  const paginatedTransactions = filteredTransactions.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="flex flex-col flex-1 min-h-screen bg-white px-4 sm:px-6 lg:px-8 py-6 pb-8">

      {/* PAGE HEADER */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between shrink-0">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold leading-tight tracking-tight text-slate-900 sm:text-3xl">
              {filter === 'Ledger' ? 'Ledger' : filter}
            </h1>
          </div>
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="lg:hidden flex items-center justify-center p-2 rounded-lg bg-white border border-slate-200 text-slate-600 shadow-sm hover:bg-slate-50 transition-colors"
          >
            <SlidersHorizontal className="h-5 w-5" />
          </button>
        </div>
        <div className="hidden lg:flex flex-wrap items-center gap-3">

          {/* Separated Navigation Buttons */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {[
              { id: 'Ledger', label: 'Ledger', base: 'text-slate-600 bg-white border border-slate-200', active: 'bg-amber-100 text-amber-800 border-amber-300 shadow-sm', hover: 'hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200' },
              { id: 'Income', label: 'Income', base: 'text-slate-600 bg-white border border-slate-200', active: 'bg-emerald-100 text-emerald-800 border-emerald-300 shadow-sm', hover: 'hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200' },
              { id: 'Expense', label: 'Expense', base: 'text-slate-600 bg-white border border-slate-200', active: 'bg-rose-100 text-rose-800 border-rose-300 shadow-sm', hover: 'hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  if (filter !== tab.id) {
                    setFilter(tab.id);
                    setCurrentPage(1);
                    setDateFilter("All Time");
                    setCustomStart("");
                    setCustomEnd("");
                    setSearch("");
                  }
                }}
                className={`px-5 py-2 text-[14px] font-bold rounded-lg transition-all duration-200 whitespace-nowrap min-w-[100px] text-center ${filter === tab.id
                    ? tab.active
                    : `${tab.base} ${tab.hover} shadow-sm`
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              if (filter === 'Ledger') setShowTypeSelection(true);
              else if (filter === 'Income') setShowAddIncome(true);
              else if (filter === 'Expense') setShowAddExpense(true);
            }}
            className="flex h-9 items-center justify-center gap-2 rounded-full bg-[#006052] px-4 text-[13px] font-semibold text-white hover:bg-[#004d43] shadow-sm transition-colors shrink-0"
          >
            <Plus className="h-4 w-4" />
            {filter === 'Ledger' ? 'Add Transaction' : `Add ${filter}`}
          </button>
        </div>
      </div>

      {loadError && (
        <div role="alert" className="mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-6 lg:mx-8">
          Could not load the ledger: {loadError}{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => {
              setLoading(true);
              setTriggerRefresh((prev) => prev + 1);
            }}
          >
            Retry
          </button>
        </div>
      )}
      {loading && !loadError && <p className="mx-4 mt-4 text-sm text-slate-500 sm:mx-6 lg:mx-8">Loading ledger…</p>}
      {filter === 'Income' && <IncomeView data={tabData} />}
      {filter === 'Expense' && <ExpenseView data={tabData} onAddExpense={() => setShowAddExpense(true)} />}

      {filter === 'Ledger' && (
        <>
          {/* KPI CARDS */}
          <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 sm:gap-4 shrink-0 pb-2">
            <SummaryCard
              icon={Database}
              title="Opening Balance"
              value={formatCurrency(filteredOpeningBalance)}
              iconColor="text-slate-600"
              iconBg="bg-slate-100"
              extraClass="bg-white border-slate-200 shadow-sm"
            />
            <SummaryCard
              icon={ArrowUpCircle}
              title="Money In"
              value={formatCurrency(filteredMoneyIn)}
              valueColor="text-emerald-700"
              iconColor="text-emerald-600"
              iconBg="bg-emerald-100"
              extraClass="bg-white border-slate-200 shadow-sm"
            />
            <SummaryCard
              icon={ArrowDownCircle}
              title="Money Out"
              value={formatCurrency(filteredMoneyOut)}
              valueColor="text-red-600"
              iconColor="text-red-600"
              iconBg="bg-red-100"
              extraClass="bg-white border-slate-200 shadow-sm"
            />
            <SummaryCard
              icon={Wallet}
              title="Closing Balance"
              value={formatCurrency(filteredClosingBalance)}
              valueColor="text-[#006052]"
              iconColor="text-[#006052]"
              iconBg="bg-[#e5f0ef]"
              extraClass="bg-emerald-50/50 border-emerald-200 shadow-sm"
            />
          </div>

          {/* FILTER TOOLBAR */}
          <div className="mt-5 flex flex-col md:flex-row md:items-center gap-3 w-full min-w-0">
            {/* Date filter (compact) */}
            <div className="shrink-0 flex items-center gap-2">
              <DateRangeFilter
                dateFilter={dateFilter}
                setDateFilter={(val) => { setDateFilter(val); setCurrentPage(1); }}
                customStart={customStart}
                setCustomStart={setCustomStart}
                customEnd={customEnd}
                setCustomEnd={setCustomEnd}
              />
            </div>

            {/* Search bar (flexible width) */}
            <div className="relative flex-1 min-w-[180px] w-full">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                placeholder="Search transactions..."
                className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-4 text-[13px] font-medium text-slate-800 outline-none placeholder:text-slate-400 transition-colors hover:border-[#006052] focus:border-[#006052] focus:ring-1 focus:ring-[#006052] shadow-sm"
              />
            </div>

            {isFilterActive && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="h-9 px-3 text-[13px] font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-300 hover:border-slate-400 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 shrink-0"
                title="Reset all filters"
              >
                <X className="h-3.5 w-3.5 text-slate-400" />
                <span>Reset</span>
              </button>
            )}

            {/* Export button (compact) */}
            <button className="flex h-9 shrink-0 items-center justify-center gap-2 text-[13px] font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 px-4 rounded-lg shadow-sm transition-colors hover:bg-slate-50 w-full md:w-auto">
              <Download className="h-4 w-4" /> Export
            </button>
          </div>

          {/* TRANSACTIONS TABLE CARD */}
          <div className="mt-4 flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            {/* Table */}
            <div className="overflow-x-auto w-full min-w-0" style={{ WebkitOverflowScrolling: 'touch' }}>
              <table className="w-full min-w-[950px] text-left border-collapse">
                <thead className="sticky top-0 bg-slate-50/90 backdrop-blur-sm z-10 shadow-[0_1px_0_0_#e2e8f0]">
                  <tr>
                    <TableHeader width="15%">Date</TableHeader>
                    <TableHeader width="28%">Description</TableHeader>
                    <TableHeader width="14%">In</TableHeader>
                    <TableHeader width="14%">Out</TableHeader>
                    <TableHeader width="14%">Balance</TableHeader>
                    <TableHeader width="10%">Type</TableHeader>
                    <TableHeader width="5%"></TableHeader>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="h-40 text-center text-[15px] text-slate-500">No transactions found.</td>
                    </tr>
                  ) : paginatedTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors group cursor-pointer">
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-[14px] text-slate-800">{tx.date}</p>
                        <p className="text-[13px] text-slate-500 mt-0.5">{tx.time}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-start gap-3">
                          <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${getTypeIconBg(tx.type)}`}>
                            <tx.icon className={`h-4 w-4 ${getTypeIconColor(tx.type)}`} />
                          </div>
                          <div>
                            <p className="font-bold text-[15px] text-slate-900">{tx.description}</p>
                            <p className="text-[13px] text-slate-500 mt-0.5">{tx.subtext}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 font-bold text-emerald-600 text-[15px]">
                        {tx.in ? formatCurrency(tx.in) : '—'}
                      </td>
                      <td className="px-5 py-3.5 font-bold text-red-600 text-[15px]">
                        {tx.out ? formatCurrency(tx.out) : '—'}
                      </td>
                      <td className="px-5 py-3.5 font-bold text-slate-800 text-[15px]">
                        {formatCurrency(tx.balance)}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-[12px] font-bold uppercase tracking-wider shadow-sm border ${getTypeBadgeStyle(tx.type)}`}>
                          {tx.type}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors opacity-0 group-hover:opacity-100">
                          <ChevronRight className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between border-t border-slate-200 bg-white px-5 py-3">
              <span className="text-sm text-slate-500">
                {filteredTransactions.length === 0
                  ? "Showing 0 results"
                  : `Showing ${(currentPage - 1) * PAGE_SIZE + 1} to ${Math.min(currentPage * PAGE_SIZE, filteredTransactions.length)} of ${filteredTransactions.length} results`}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-sm font-medium text-slate-700">Page {currentPage} of {totalPages}</span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Type Selection Modal */}
      {showTypeSelection && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-[320px] rounded-2xl bg-white shadow-xl flex flex-col overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-lg text-slate-900">Add Transaction</h3>
              <button onClick={() => setShowTypeSelection(false)}><X className="h-5 w-5 text-slate-400 hover:text-slate-600" /></button>
            </div>
            <div className="p-6 flex flex-col gap-3">
              <p className="text-[13px] font-medium text-slate-500 mb-2 text-center">What type of transaction?</p>
              <button
                onClick={() => { setShowTypeSelection(false); setShowAddIncome(true); }}
                className="flex items-center justify-center gap-3 w-full py-4 rounded-xl border-2 border-emerald-100 bg-emerald-50 hover:bg-emerald-100/50 hover:border-emerald-200 text-emerald-700 font-bold text-[15px] transition-all"
              >
                <span className="text-xl">💰</span> Income
              </button>
              <button
                onClick={() => { setShowTypeSelection(false); setShowAddExpense(true); }}
                className="flex items-center justify-center gap-3 w-full py-4 rounded-xl border-2 border-red-100 bg-red-50 hover:bg-red-100/50 hover:border-red-200 text-red-700 font-bold text-[15px] transition-all"
              >
                <span className="text-xl">💸</span> Expense
              </button>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-center">
              <button onClick={() => setShowTypeSelection(false)} className="px-6 py-2 text-[13px] font-bold text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors w-full">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Income Modal */}
      {showAddIncome && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-[400px] rounded-2xl bg-white shadow-xl flex flex-col overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-lg text-slate-900">Add Income</h3>
              <button onClick={() => setShowAddIncome(false)}><X className="h-5 w-5 text-slate-400 hover:text-slate-600" /></button>
            </div>
            <form onSubmit={handleIncomeSubmit} className="p-6 flex flex-col gap-4">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">Income Type *</label>
                <select
                  value={incomeType}
                  onChange={e => {
                    setIncomeType(e.target.value);
                    setIncomeError('');
                  }}
                  className="w-full h-11 border border-slate-300 rounded-xl px-3 text-[14px] font-medium text-slate-700 outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052] shadow-sm transition-all"
                >
                  <option value="Other Income">Other Income</option>
                  <option value="Investor Capital">Investor Capital</option>
                  <option value="Chit Investment">Chit Investment</option>
                  <option value="Service Income">Service Income</option>
                  <option value="Commission">Commission</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {(incomeType === 'Investor Capital' || incomeType === 'Investment') && (
                <div className="flex flex-col gap-3 rounded-xl bg-purple-50/70 p-4 border border-purple-200">
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-purple-900 mb-1">Select Investor *</label>
                    <select
                      value={incomeInvestorId}
                      onChange={e => {
                        setIncomeInvestorId(e.target.value);
                        setIncomeError('');
                      }}
                      required
                      className="w-full h-10 border border-purple-300 rounded-lg px-3 text-[13px] font-semibold text-slate-800 bg-white outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600 shadow-sm"
                    >
                      <option value="">-- Choose an Investor --</option>
                      {investors.map(inv => (
                        <option key={inv.id} value={inv.id}>
                          {inv.name} ({inv.id})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">Amount *</label>
                <input
                  type="number"
                  required
                  placeholder="0.00"
                  value={incomeAmount}
                  onChange={e => {
                    setIncomeAmount(e.target.value);
                    setIncomeError('');
                  }}
                  className="w-full h-11 border border-slate-300 rounded-xl px-3 text-[14px] font-medium text-slate-700 outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052] shadow-sm transition-all"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">Date *</label>
                <input type="date" required value={incomeDate} onChange={e => setIncomeDate(e.target.value)} className="w-full h-11 border border-slate-300 rounded-xl px-3 text-[14px] font-medium text-slate-700 outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052] shadow-sm transition-all" />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">Payment Mode *</label>
                <select value={incomeMode} onChange={e => setIncomeMode(e.target.value)} className="w-full h-11 border border-slate-300 rounded-xl px-3 text-[14px] font-medium text-slate-700 outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052] shadow-sm transition-all">
                  <option>Cash</option>
                  <option>UPI</option>
                  <option>Bank Transfer</option>
                  <option>Cheque</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">Description / Remarks</label>
                <input
                  type="text"
                  placeholder={incomeType === 'Investor Capital' ? 'Optional investment notes' : 'Description'}
                  value={incomeRemarks}
                  onChange={e => setIncomeRemarks(e.target.value)}
                  className="w-full h-11 border border-slate-300 rounded-xl px-3 text-[14px] font-medium text-slate-700 outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052] shadow-sm transition-all"
                />
              </div>

              {incomeError && (
                <div className="rounded-lg bg-red-50 p-3 border border-red-200">
                  <p className="text-[13px] font-medium text-red-600">{incomeError}</p>
                </div>
              )}

              <div className="flex justify-end gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddIncome(false);
                    setIncomeError('');
                    setIncomeInvestorId('');
                  }}
                  className="px-5 py-2.5 text-[13px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-[13px] font-bold text-white bg-[#006052] hover:bg-[#004d43] rounded-xl shadow-sm transition-colors"
                >
                  Add Income
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {showAddExpense && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-[460px] rounded-2xl bg-white shadow-xl flex flex-col overflow-hidden max-h-[90vh]">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50">
              <div>
                <h3 className="font-bold text-lg text-slate-900">Add Expense</h3>
                <p className="text-[12px] text-slate-500">Record a business expense or investor withdrawal</p>
              </div>
              <button onClick={() => { setShowAddExpense(false); setExpenseError(''); setWithdrawalInvestorId(''); }}><X className="h-5 w-5 text-slate-400 hover:text-slate-600" /></button>
            </div>
            <form onSubmit={handleExpenseSubmit} className="p-6 flex flex-col gap-4 overflow-y-auto">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">Expense Category *</label>
                <select
                  value={expenseCategory}
                  onChange={e => {
                    setExpenseCategory(e.target.value);
                    setExpenseError('');
                  }}
                  className="w-full h-11 border border-slate-300 rounded-xl px-3 text-[14px] font-medium text-slate-700 outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052] shadow-sm transition-all"
                >
                  <option value="Vehicle Expense">Vehicle Expense</option>
                  <option value="Rent">Rent</option>
                  <option value="Salary">Salary</option>
                  <option value="Electricity">Electricity</option>
                  <option value="Fuel">Fuel</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Office Expense">Office Expense</option>
                  <option value="Travel">Travel</option>
                  <option value="Investor Withdrawal">Investor Withdrawal</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Special Investor Selector & Balance preview for Investor Withdrawal */}
              {expenseCategory === 'Investor Withdrawal' && (
                <div className="flex flex-col gap-3 rounded-xl bg-purple-50/70 p-4 border border-purple-200">
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-purple-900 mb-1">Select Investor *</label>
                    <select
                      value={withdrawalInvestorId}
                      onChange={e => {
                        setWithdrawalInvestorId(e.target.value);
                        setExpenseError('');
                      }}
                      required
                      className="w-full h-10 border border-purple-300 rounded-lg px-3 text-[13px] font-semibold text-slate-800 bg-white outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600 shadow-sm"
                    >
                      <option value="">-- Choose an Investor --</option>
                      {investors.map(inv => {
                        const remCap = getInvestorRemainingCapital(inv);
                        return (
                          <option key={inv.id} value={inv.id}>
                            {inv.name} (Available: ₹{Number(remCap).toLocaleString('en-IN')})
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {withdrawalInvestorId && (() => {
                    const selInv = investors.find(i => i.id === withdrawalInvestorId);
                    if (!selInv) return null;
                    const remCap = getInvestorRemainingCapital(selInv);
                    const amtNum = Number(expenseAmount) || 0;
                    return (
                      <div className="space-y-2 pt-1 text-[12px]">
                        <div className="grid grid-cols-2 gap-2 bg-white/90 p-2.5 rounded-lg border border-purple-100">
                          <div>
                            <span className="text-slate-500 font-medium block">Investor Balance:</span>
                            <span className="font-bold text-purple-900 text-[14px]">₹{remCap.toLocaleString('en-IN')}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 font-medium block">Total Pool Available:</span>
                            <span className="font-bold text-slate-800 text-[14px]">₹{totalAvailablePool.toLocaleString('en-IN')}</span>
                          </div>
                        </div>

                        {amtNum > 0 && (
                          <div className={`p-2 rounded-lg text-[12px] font-medium border ${amtNum > remCap || amtNum > totalAvailablePool ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
                            {amtNum > remCap ? (
                              <span>⚠️ Exceeds investor's remaining capital (₹{remCap.toLocaleString('en-IN')})</span>
                            ) : amtNum > totalAvailablePool ? (
                              <span>⚠️ Exceeds total available pool (₹{totalAvailablePool.toLocaleString('en-IN')})</span>
                            ) : (
                              <span>✓ Capital after withdrawal: ₹{(remCap - amtNum).toLocaleString('en-IN')}</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">Amount *</label>
                <input
                  type="number"
                  required
                  placeholder="0.00"
                  value={expenseAmount}
                  onChange={e => {
                    setExpenseAmount(e.target.value);
                    setExpenseError('');
                  }}
                  className="w-full h-11 border border-slate-300 rounded-xl px-3 text-[14px] font-medium text-slate-700 outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052] shadow-sm transition-all"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">Date *</label>
                <input type="date" required value={expenseDate} onChange={e => setExpenseDate(e.target.value)} className="w-full h-11 border border-slate-300 rounded-xl px-3 text-[14px] font-medium text-slate-700 outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052] shadow-sm transition-all" />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">Payment Mode *</label>
                <select value={expenseMode} onChange={e => setExpenseMode(e.target.value)} className="w-full h-11 border border-slate-300 rounded-xl px-3 text-[14px] font-medium text-slate-700 outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052] shadow-sm transition-all">
                  <option>Cash</option>
                  <option>UPI</option>
                  <option>Bank Transfer</option>
                  <option>Cheque</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">Description / Remarks</label>
                <input
                  type="text"
                  placeholder={expenseCategory === 'Investor Withdrawal' ? 'Optional reason / withdrawal notes' : 'Description'}
                  value={expenseRemarks}
                  onChange={e => setExpenseRemarks(e.target.value)}
                  className="w-full h-11 border border-slate-300 rounded-xl px-3 text-[14px] font-medium text-slate-700 outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052] shadow-sm transition-all"
                />
              </div>

              {expenseError && (
                <div className="rounded-lg bg-red-50 p-3 border border-red-200">
                  <p className="text-[13px] font-medium text-red-600">{expenseError}</p>
                </div>
              )}

              <div className="flex justify-end gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddExpense(false);
                    setExpenseError('');
                    setWithdrawalInvestorId('');
                  }}
                  className="px-5 py-2.5 text-[13px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-[13px] font-bold text-white bg-[#006052] hover:bg-[#004d43] rounded-xl shadow-sm transition-colors"
                >
                  Add Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MOBILE DRAWER (For KPI cards and actions) */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-[110] lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsDrawerOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-[300px] max-w-[85vw] bg-white shadow-2xl overflow-y-auto flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="font-bold text-slate-900">Dashboard Panel</h3>
              <button onClick={() => setIsDrawerOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-50">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 flex flex-col gap-6">
              {/* Actions */}
              <div className="flex flex-col gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Navigation</p>
                {[
                  { id: 'Ledger', label: 'Ledger' },
                  { id: 'Income', label: 'Income' },
                  { id: 'Expense', label: 'Expense' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      if (filter !== tab.id) {
                        setFilter(tab.id);
                        setCurrentPage(1);
                        setDateFilter("All Time");
                        setCustomStart("");
                        setCustomEnd("");
                        setSearch("");
                      }
                      setIsDrawerOpen(false);
                    }}
                    className={`px-4 py-2.5 text-left text-[14px] font-bold rounded-lg transition-colors ${filter === tab.id
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'text-slate-600 hover:bg-slate-50'
                      }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <button
                onClick={() => {
                  setIsDrawerOpen(false);
                  if (filter === 'Ledger') setShowTypeSelection(true);
                  else if (filter === 'Income') setShowAddIncome(true);
                  else if (filter === 'Expense') setShowAddExpense(true);
                }}
                className="flex items-center justify-center gap-2 rounded-xl bg-[#006052] p-3 text-[14px] font-bold text-white hover:bg-[#004d43] shadow-md transition-colors"
              >
                <Plus className="h-4 w-4" />
                {filter === 'Ledger' ? 'Add Transaction' : `Add ${filter}`}
              </button>

            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper for Category Icon Colors
const getTypeIconBg = (type) => {
  switch (type) {
    case 'COLLECTION': return 'bg-blue-100';
    case 'INVESTOR': return 'bg-purple-100';
    case 'LOAN': return 'bg-orange-100';
    case 'EXPENSE': return 'bg-red-100';
    case 'INCOME': return 'bg-emerald-100';
    case 'SOLD': return 'bg-indigo-100';
    default: return 'bg-slate-100';
  }
};
const getTypeIconColor = (type) => {
  switch (type) {
    case 'COLLECTION': return 'text-blue-600';
    case 'INVESTOR': return 'text-purple-600';
    case 'LOAN': return 'text-orange-600';
    case 'EXPENSE': return 'text-red-600';
    case 'INCOME': return 'text-emerald-600';
    case 'SOLD': return 'text-indigo-600';
    default: return 'text-slate-600';
  }
};

// Helper for Badge Styles
const getTypeBadgeStyle = (type) => {
  switch (type) {
    case 'COLLECTION': return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'INVESTOR': return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'LOAN': return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'EXPENSE': return 'bg-red-50 text-red-700 border-red-200';
    case 'INCOME': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'SOLD': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    default: return 'bg-slate-50 text-slate-700 border-slate-200';
  }
};



// Sub-components
const SummaryCard = ({ icon: Icon, title, value, valueColor = "text-slate-900", iconColor, iconBg, extraClass = "bg-white border-slate-200 shadow-sm" }) => (
  <div className={`rounded-xl border p-4 sm:p-5 transition-shadow flex flex-col justify-center h-full min-w-0 w-full ${extraClass}`}>
    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
      <div className={`flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
        <Icon className={`h-5 w-5 sm:h-6 sm:w-6 ${iconColor}`} strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] sm:text-[14px] font-semibold text-slate-500 leading-snug break-words">{title}</p>
        <p 
          className={`mt-0.5 sm:mt-1 text-base sm:text-lg lg:text-xl font-bold tracking-tight whitespace-nowrap leading-tight ${valueColor}`}
        >
          {value}
        </p>
      </div>
    </div>
  </div>
);

const TableHeader = ({ children, width }) => (
  <th style={{ width }} className="whitespace-nowrap px-5 py-4 text-left text-[13px] font-bold uppercase tracking-wider text-slate-500">
    {children}
  </th>
);

export default function LedgerWrapper() {
  return <Ledger />;
}

// Ensure modals are rendered at the bottom of Ledger
// We need to inject them before the last closing div of Ledger component

