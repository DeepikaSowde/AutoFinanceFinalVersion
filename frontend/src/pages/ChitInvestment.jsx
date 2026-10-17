import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Building2, 
  Plus, 
  Calendar, 
  ChevronDown, 
  ChevronLeft,
  ChevronRight,
  ArrowUpRight, 
  ArrowDownLeft, 
  ReceiptText, 
  X,
  CreditCard,
  Building,
  Hash,
  Eye,
  TrendingUp,
  TrendingDown,
  Info
} from 'lucide-react';
import { formatCurrency } from '../utils/currencyFormatter';
import {
  getChitCompanies,
  saveChitCompanies,
  getChitTransactions,
  saveChitTransaction
} from '../utils/chitStorage';
import { formatDate } from '../utils/dateUtils';

const ChitInvestment = () => {
  const [companies, setCompanies] = useState([]);
  const [transactions, setTransactions] = useState([]);
  // Month and Year filters: "All" or 2-digit month ("01"-"12") and 4-digit year ("2026")
  const [selectedMonth, setSelectedMonth] = useState("All");
  const [selectedYear, setSelectedYear] = useState("All");

  // Calendar-style Month/Year Picker Popover States
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [pickerNavYear, setPickerNavYear] = useState(() => {
    return new Date().getFullYear();
  });
  const [pickerYearDecadeStart, setPickerYearDecadeStart] = useState(() => {
    const curYear = new Date().getFullYear();
    return Math.floor(curYear / 12) * 12;
  });

  const monthPickerRef = useRef(null);
  const yearPickerRef = useRef(null);

  // Close pickers on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (monthPickerRef.current && !monthPickerRef.current.contains(e.target)) {
        setShowMonthPicker(false);
      }
      if (yearPickerRef.current && !yearPickerRef.current.contains(e.target)) {
        setShowYearPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Company and Chit filter states
  const [selectedCompanyId, setSelectedCompanyId] = useState("All");
  const [selectedChitId, setSelectedChitId] = useState("All");

  // Transaction Tabs: All Transactions, Income, Expense
  const [activeTab, setActiveTab] = useState("All Transactions");

  // Pagination State (Change 1: Max 6 transaction rows per page)
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 6;

  // Modal States
  const [showAddTxModal, setShowAddTxModal] = useState(false);
  const [showAddCompanyModal, setShowAddCompanyModal] = useState(false);
  const [showCompanyDetailsModal, setShowCompanyDetailsModal] = useState(false);
  const [showChitDetailsModal, setShowChitDetailsModal] = useState(false);
  // Target chit state for Chit Details popup (allows viewing specific chit from inside company popup or header button)
  const [viewingChitId, setViewingChitId] = useState(null);

  // Form states for Add Chit Transaction
  const [txType, setTxType] = useState("Chit Paid"); // "Chit Paid" or "Chit Income"
  const [formCompanyId, setFormCompanyId] = useState("");
  const [formChitId, setFormChitId] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10));
  const [formPaymentType, setFormPaymentType] = useState("Cash");
  const [txError, setTxError] = useState("");

  // Form states for Add Company Modal (Change 2: 5 fields per chit scheme + Existing Company support)
  const [companyModalMode, setCompanyModalMode] = useState("create"); // "create" | "existing"
  const [existingCompanyId, setExistingCompanyId] = useState("");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyChits, setNewCompanyChits] = useState([
    {
      id: "temp-1",
      name: "",
      totalValue: "",
      paymentFrequency: "Monthly",
      totalPayments: "",
      amountPerPayment: ""
    }
  ]);
  const [companyError, setCompanyError] = useState("");
  const [companySuccess, setCompanySuccess] = useState("");

  // Load data
  const loadData = () => {
    setCompanies(getChitCompanies());
    setTransactions(getChitTransactions());
  };

  useEffect(() => {
    loadData();
    const handleSync = () => loadData();
    window.addEventListener("storage", handleSync);
    window.addEventListener("motoLendStorageUpdate", handleSync);
    return () => {
      window.removeEventListener("storage", handleSync);
      window.removeEventListener("motoLendStorageUpdate", handleSync);
    };
  }, []);

  // When selected company filter changes, reset chit filter and reset page
  const handleCompanyFilterChange = (companyId) => {
    setSelectedCompanyId(companyId);
    setSelectedChitId("All");
    setCurrentPage(1);
  };

  // Reset pagination whenever any filter or tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedMonth, selectedYear, selectedCompanyId, selectedChitId, activeTab]);

  // Available chits for the selected company filter
  const availableFilterChits = useMemo(() => {
    if (selectedCompanyId === "All") {
      return [];
    }
    const comp = companies.find((c) => c.id === selectedCompanyId);
    return comp?.chits || [];
  }, [companies, selectedCompanyId]);

  // Available chits in Add Transaction Modal
  const availableFormChits = useMemo(() => {
    if (!formCompanyId) return [];
    const comp = companies.find((c) => c.id === formCompanyId);
    return comp?.chits || [];
  }, [companies, formCompanyId]);

  // Set default company in form when modal opens
  useEffect(() => {
    if (showAddTxModal && companies.length > 0) {
      if (!formCompanyId || !companies.some(c => c.id === formCompanyId)) {
        setFormCompanyId(companies[0].id);
        setFormChitId(companies[0].chits?.[0]?.id || "");
      }
    }
  }, [showAddTxModal, companies]);

  // Available Years: Scrollable range starting from 2000 through future years (+5 years ahead)
  // plus any years present in transactions
  const yearOptions = useMemo(() => {
    const years = new Set();
    const curYear = new Date().getFullYear();
    // Include 5 future years beyond current year
    const maxYear = curYear + 5;
    for (let y = maxYear; y >= 2000; y--) {
      years.add(String(y));
    }
    // Also include any years from transactions that might be outside this range
    transactions.forEach((tx) => {
      if (tx.date && tx.date.length >= 4) {
        years.add(tx.date.slice(0, 4));
      }
    });
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [transactions]);

  // Standard 12 Months list for Month selector
  const monthNameList = [
    { value: "01", label: "January", short: "Jan" },
    { value: "02", label: "February", short: "Feb" },
    { value: "03", label: "March", short: "Mar" },
    { value: "04", label: "April", short: "Apr" },
    { value: "05", label: "May", short: "May" },
    { value: "06", label: "June", short: "Jun" },
    { value: "07", label: "July", short: "Jul" },
    { value: "08", label: "August", short: "Aug" },
    { value: "09", label: "September", short: "Sep" },
    { value: "10", label: "October", short: "Oct" },
    { value: "11", label: "November", short: "Nov" },
    { value: "12", label: "December", short: "Dec" },
  ];

  // Helper to match transaction with month and year (supports any year string)
  const matchesDate = (txDate) => {
    if (!txDate) return false;
    const [y, m] = txDate.split("-");
    const cleanYear = selectedYear.trim();
    if (cleanYear !== "" && cleanYear !== "All" && y !== cleanYear) return false;
    if (selectedMonth !== "All" && m !== selectedMonth) return false;
    return true;
  };

  // Selected Company based on filter
  const selectedCompany = useMemo(() => {
    if (selectedCompanyId === "All") return null;
    return companies.find((c) => c.id === selectedCompanyId) || null;
  }, [companies, selectedCompanyId]);

  // Selected Chit based on filter or modal trigger
  const selectedChit = useMemo(() => {
    if (!selectedCompany) return null;
    const chitIdToUse = viewingChitId || (selectedChitId !== "All" ? selectedChitId : null);
    if (!chitIdToUse) return null;
    return selectedCompany.chits?.find((ch) => ch.id === chitIdToUse) || null;
  }, [selectedCompany, selectedChitId, viewingChitId]);

  // Company Details Popup Data (Aggregated across all chits of selected company, respecting Month/Year filter)
  const companyModalData = useMemo(() => {
    if (!selectedCompany) return null;

    const compTxs = transactions.filter((tx) => {
      if (!matchesDate(tx.date)) return false;
      return tx.companyId === selectedCompany.id;
    });

    const totalPaid = compTxs
      .filter((tx) => tx.type === "Chit Paid" || tx.category === "Expense")
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

    const totalIncome = compTxs
      .filter((tx) => tx.type === "Chit Income" || tx.category === "Income")
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

    return {
      company: selectedCompany,
      totalChits: selectedCompany.chits?.length || 0,
      chits: selectedCompany.chits || [],
      txCount: compTxs.length,
      totalPaid,
      totalIncome,
      transactions: compTxs
    };
  }, [selectedCompany, transactions, selectedMonth, selectedYear]);

  // Chit Details Popup Data (Specific to selected or viewed chit, respecting Month/Year filter)
  const chitModalData = useMemo(() => {
    if (!selectedCompany || !selectedChit) return null;

    const chitTxs = transactions.filter((tx) => {
      if (!matchesDate(tx.date)) return false;
      return tx.companyId === selectedCompany.id && tx.chitId === selectedChit.id;
    });

    const totalPaid = chitTxs
      .filter((tx) => tx.type === "Chit Paid" || tx.category === "Expense")
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

    const totalIncome = chitTxs
      .filter((tx) => tx.type === "Chit Income" || tx.category === "Income")
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

    return {
      companyName: selectedCompany.name,
      chit: selectedChit,
      txCount: chitTxs.length,
      totalPaid,
      totalIncome,
      transactions: chitTxs
    };
  }, [selectedCompany, selectedChit, transactions, selectedMonth, selectedYear]);

  // =========================================================================
  // 2. KPI Cards — MUST REMAIN FIXED
  // Calculated across ALL companies and chits on the main page.
  // Month & Year filter can filter them, but Company / Chit filters DO NOT affect KPIs.
  // =========================================================================
  const kpiTransactions = useMemo(() => {
    return transactions.filter((tx) => matchesDate(tx.date));
  }, [transactions, selectedMonth, selectedYear]);

  const totalChitPayments = useMemo(() => {
    return kpiTransactions
      .filter((tx) => tx.type === "Chit Paid" || tx.category === "Expense")
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  }, [kpiTransactions]);

  const totalChitIncome = useMemo(() => {
    return kpiTransactions
      .filter((tx) => tx.type === "Chit Income" || tx.category === "Income")
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  }, [kpiTransactions]);

  const totalTransactionsCount = kpiTransactions.length;

  // =========================================================================
  // 5. Transaction Table Filters & Pagination
  // Filtered by: Month, Year, Company, Chit, and Tab (All Transactions / Income / Expense)
  // Max 6 transaction rows per page
  // =========================================================================
  const filteredTableTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      // 1. Month & Year filter
      if (!matchesDate(tx.date)) {
        return false;
      }
      // 2. Company filter
      if (selectedCompanyId !== "All" && tx.companyId !== selectedCompanyId) {
        return false;
      }
      // 3. Chit filter
      if (selectedChitId !== "All" && tx.chitId !== selectedChitId) {
        return false;
      }
      // 4. Tab filter
      if (activeTab === "Income" && tx.type !== "Chit Income" && tx.category !== "Income") {
        return false;
      }
      if (activeTab === "Expense" && tx.type !== "Chit Paid" && tx.category !== "Expense") {
        return false;
      }
      return true;
    });
  }, [transactions, selectedMonth, selectedYear, selectedCompanyId, selectedChitId, activeTab]);

  const totalPages = Math.max(1, Math.ceil(filteredTableTransactions.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedTableTransactions = useMemo(() => {
    const start = (safeCurrentPage - 1) * PAGE_SIZE;
    return filteredTableTransactions.slice(start, start + PAGE_SIZE);
  }, [filteredTableTransactions, safeCurrentPage, PAGE_SIZE]);

  // =========================================================================
  // Form Submission: Add Chit Transaction
  // =========================================================================
  const handleAddTransactionSubmit = async (e) => {
    e.preventDefault();
    setTxError("");
    const amt = Number(formAmount);
    if (!formAmount || isNaN(amt) || amt <= 0) {
      setTxError("Please enter a valid amount greater than 0.");
      return;
    }
    if (!formCompanyId) {
      setTxError("Please select a company.");
      return;
    }
    if (!formChitId) {
      setTxError("Please select a chit.");
      return;
    }

    const company = companies.find((c) => c.id === formCompanyId);
    const chit = company?.chits?.find((ch) => ch.id === formChitId);

    try {
      // The server books the expense (Chit Paid) or income (Chit Income) with it.
      await saveChitTransaction({
        type: txType,
        companyId: formCompanyId,
        companyName: company?.name || "",
        chitId: formChitId,
        chitName: chit?.name || "",
        amount: amt,
        date: formDate,
        paymentType: formPaymentType
      });
    } catch (err) {
      setTxError(err.message || "Could not save the chit transaction.");
      return;
    }

    setShowAddTxModal(false);
    setFormAmount("");
    setTxError("");
  };

  // =========================================================================
  // Form Submission: Add Company & Multiple Chits (Change 2)
  // Each chit has:
  // 1. Scheme Name
  // 2. Total Value
  // 3. Payment Frequency (Monthly | Weekly)
  // 4. Total Number of Payments
  // 5. Amount per Payment (= Total Value ÷ Total Number of Payments)
  // =========================================================================
  const handleAddChitRow = () => {
    setNewCompanyChits((prev) => [
      ...prev,
      {
        id: `temp-${Date.now()}-${Math.random()}`,
        name: "",
        totalValue: "",
        paymentFrequency: "Monthly",
        totalPayments: "",
        amountPerPayment: ""
      }
    ]);
  };

  const handleRemoveChitRow = (index) => {
    if (newCompanyChits.length <= 1) return;
    setNewCompanyChits((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleChitRowChange = (index, field, value) => {
    setNewCompanyChits((prev) => {
      const copy = [...prev];
      const updatedRow = { ...copy[index], [field]: value };

      // Recalculate Amount per Payment whenever Total Value, Frequency, or Total Payments change
      const val = parseFloat(updatedRow.totalValue);
      const count = parseFloat(updatedRow.totalPayments);

      if (!isNaN(val) && val > 0 && !isNaN(count) && count > 0) {
        const calculated = Math.round((val / count) * 100) / 100;
        updatedRow.amountPerPayment = String(calculated);
      } else {
        updatedRow.amountPerPayment = "";
      }

      copy[index] = updatedRow;
      return copy;
    });
  };

  const handleAddCompanySubmit = async (e) => {
    e.preventDefault();
    setCompanyError("");
    setCompanySuccess("");

    if (companyModalMode === "existing") {
      if (!existingCompanyId) {
        setCompanyError("Please select an existing company.");
        return;
      }

      const targetCompany = companies.find((c) => c.id === existingCompanyId);
      if (!targetCompany) {
        setCompanyError("Selected company was not found.");
        return;
      }

      // If no new chits added
      if (newCompanyChits.length === 0) {
        setCompanyError("Please click 'Add Chit' to add at least one new chit scheme.");
        return;
      }

      // Validate each new chit entry
      for (let i = 0; i < newCompanyChits.length; i++) {
        const ch = newCompanyChits[i];
        if (!ch.name || !ch.name.trim()) {
          setCompanyError(`Please enter a Scheme Name for Chit #${i + 1}.`);
          return;
        }
        const val = Number(ch.totalValue);
        if (!ch.totalValue || isNaN(val) || val <= 0) {
          setCompanyError(`Please enter a valid Total Value greater than 0 for Chit #${i + 1}.`);
          return;
        }
        const paymentsCount = Number(ch.totalPayments);
        if (!ch.totalPayments || isNaN(paymentsCount) || paymentsCount <= 0) {
          setCompanyError(`Please enter a valid Total Number of Payments greater than 0 for Chit #${i + 1}.`);
          return;
        }
      }

      const formattedNewChits = newCompanyChits.map((ch, idx) => {
        const val = Number(ch.totalValue);
        const paymentsCount = Number(ch.totalPayments);
        const perPaymentAmt = Math.round((val / paymentsCount) * 100) / 100;
        const freq = ch.paymentFrequency === "Weekly" ? "Weekly" : "Monthly";

        return {
          id: `CHIT-${Date.now()}-${idx + 1}-${Math.floor(Math.random() * 1000)}`,
          name: ch.name.trim(),
          totalValue: val,
          chitValue: val, // backwards compatibility for existing financial calculations
          paymentFrequency: freq,
          totalPayments: paymentsCount,
          durationMonths: freq === "Monthly" ? paymentsCount : Math.ceil(paymentsCount / 4),
          amountPerPayment: perPaymentAmt,
          monthlyInstallment: freq === "Monthly" ? perPaymentAmt : Math.round(perPaymentAmt * 4)
        };
      });

      // Preserve existing chits and append new chits to the selected company
      const updatedCompanies = companies.map((c) => {
        if (c.id === existingCompanyId) {
          return {
            ...c,
            chits: [...(c.chits || []), ...formattedNewChits]
          };
        }
        return c;
      });

      try {
        await saveChitCompanies(updatedCompanies);
      } catch (err) {
        setCompanyError(err.message || "Could not save the chit schemes.");
        return;
      }

      setCompanySuccess(`Successfully added ${formattedNewChits.length} new chit scheme(s) to ${targetCompany.name}!`);
      setTimeout(() => {
        setShowAddCompanyModal(false);
        setCompanySuccess("");
        setNewCompanyName("");
        setNewCompanyChits([
          {
            id: "temp-1",
            name: "",
            totalValue: "",
            paymentFrequency: "Monthly",
            totalPayments: "",
            amountPerPayment: ""
          }
        ]);
        setCompanyError("");
      }, 1200);

      return;
    }

    // Default 'create' Mode: Create New Company
    if (!newCompanyName.trim()) {
      setCompanyError("Please enter a company name.");
      return;
    }

    // Validate each chit entry
    for (let i = 0; i < newCompanyChits.length; i++) {
      const ch = newCompanyChits[i];
      if (!ch.name || !ch.name.trim()) {
        setCompanyError(`Please enter a Scheme Name for Chit #${i + 1}.`);
        return;
      }
      const val = Number(ch.totalValue);
      if (!ch.totalValue || isNaN(val) || val <= 0) {
        setCompanyError(`Please enter a valid Total Value greater than 0 for Chit #${i + 1}.`);
        return;
      }
      const paymentsCount = Number(ch.totalPayments);
      if (!ch.totalPayments || isNaN(paymentsCount) || paymentsCount <= 0) {
        setCompanyError(`Please enter a valid Total Number of Payments greater than 0 for Chit #${i + 1}.`);
        return;
      }
    }

    const compId = `COMP-${Date.now()}`;
    const formattedChits = newCompanyChits.map((ch, idx) => {
      const val = Number(ch.totalValue);
      const paymentsCount = Number(ch.totalPayments);
      const perPaymentAmt = Math.round((val / paymentsCount) * 100) / 100;
      const freq = ch.paymentFrequency === "Weekly" ? "Weekly" : "Monthly";

      return {
        id: `CHIT-${Date.now()}-${idx + 1}`,
        name: ch.name.trim(),
        totalValue: val,
        chitValue: val, // backwards compatibility for existing financial calculation logic
        paymentFrequency: freq,
        totalPayments: paymentsCount,
        durationMonths: freq === "Monthly" ? paymentsCount : Math.ceil(paymentsCount / 4), // backwards compatibility
        amountPerPayment: perPaymentAmt,
        monthlyInstallment: freq === "Monthly" ? perPaymentAmt : Math.round(perPaymentAmt * 4) // backwards compatibility
      };
    });

    const newComp = {
      id: compId,
      name: newCompanyName.trim(),
      chits: formattedChits
    };

    const updated = [...companies, newComp];
    try {
      await saveChitCompanies(updated);
    } catch (err) {
      setCompanyError(err.message || "Could not save the company.");
      return;
    }

    setCompanySuccess(`Successfully created ${newComp.name} with ${formattedChits.length} chit scheme(s)!`);
    setTimeout(() => {
      setShowAddCompanyModal(false);
      setCompanySuccess("");
      setNewCompanyName("");
      setNewCompanyChits([
        {
          id: "temp-1",
          name: "",
          totalValue: "",
          paymentFrequency: "Monthly",
          totalPayments: "",
          amountPerPayment: ""
        }
      ]);
      setCompanyError("");
    }, 1200);
  };

  // Format month label
  const formatMonthLabel = (mStr) => {
    if (mStr === "All") return "All Months";
    const [year, month] = mStr.split("-");
    const d = new Date(Number(year), Number(month) - 1, 1);
    return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  };

  // Format date cell
  const formatDateCell = (dateStr) => formatDate(dateStr);

  return (
    <div className="flex flex-col flex-1 min-h-screen bg-white px-4 sm:px-6 lg:px-8 py-6 pb-12">
      {/* =========================================================================
          1. MAIN PAGE HEADER & ACTIONS
      ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 shrink-0">
        <div>
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-slate-900 sm:text-3xl">
            Chit Investment
          </h1>
          <p className="text-xs sm:text-sm font-medium text-slate-500 mt-0.5">
            Manage company chits, track monthly payments, and record chit income
          </p>
        </div>

        {/* Top-right Actions: Month filter, Add Chit Transaction, Add Company */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          {/* Month & Year Calendar-Style Filters */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-xl p-1 shadow-2xs">
            {/* Month Picker Trigger & Dropdown */}
            <div className="relative" ref={monthPickerRef}>
              <button
                type="button"
                onClick={() => {
                  setShowMonthPicker((prev) => !prev);
                  setShowYearPicker(false);
                  if (selectedYear !== "All") {
                    setPickerNavYear(Number(selectedYear));
                  }
                }}
                className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                  showMonthPicker
                    ? "bg-emerald-50 text-[#006052] ring-1 ring-[#006052]"
                    : "text-slate-700 hover:text-[#006052] hover:bg-slate-50"
                }`}
                title="Select Month"
              >
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                <span>
                  {selectedMonth === "All"
                    ? "All Months"
                    : monthNameList.find((m) => m.value === selectedMonth)?.short ||
                      monthNameList.find((m) => m.value === selectedMonth)?.label ||
                      selectedMonth}
                </span>
                <ChevronDown
                  className={`h-3 w-3 text-slate-400 transition-transform duration-200 ${
                    showMonthPicker ? "rotate-180 text-[#006052]" : ""
                  }`}
                />
              </button>

              {/* Month Picker Popup Panel */}
              {showMonthPicker && (
                <div className="absolute right-0 sm:left-0 sm:right-auto mt-2 w-72 rounded-2xl bg-white p-4 shadow-xl border border-slate-200 z-50 animate-in fade-in zoom-in-95 duration-150">
                  {/* Top Bar: Nav Year with Left / Right Arrows */}
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
                    <button
                      type="button"
                      onClick={() => setPickerNavYear((y) => y - 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
                      title="Previous Year"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedYear(String(pickerNavYear));
                        setPickerYearDecadeStart(Math.floor(pickerNavYear / 12) * 12);
                        setShowMonthPicker(false);
                        setShowYearPicker(true);
                      }}
                      className="text-sm font-bold text-slate-800 hover:text-[#006052] hover:underline px-2 py-1 rounded-md transition-colors"
                      title="Click to select Year"
                    >
                      {pickerNavYear}
                    </button>

                    <button
                      type="button"
                      onClick={() => setPickerNavYear((y) => y + 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
                      title="Next Year"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>

                  {/* 12 Months 3x4 Grid */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {monthNameList.map((m) => {
                      const isSelected = selectedMonth === m.value;
                      return (
                        <button
                          key={m.value}
                          type="button"
                          onClick={() => {
                            setSelectedMonth(m.value);
                            // Also set the year to the nav year if year is All or different
                            if (selectedYear === "All") {
                              setSelectedYear(String(pickerNavYear));
                            }
                            setCurrentPage(1);
                            setShowMonthPicker(false);
                          }}
                          className={`h-9 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                            isSelected
                              ? "bg-[#006052] text-white font-bold shadow-xs scale-102"
                              : "text-slate-700 hover:bg-emerald-50 hover:text-[#006052]"
                          }`}
                        >
                          {m.short}
                        </button>
                      );
                    })}
                  </div>

                  {/* Footer Action: All Months option */}
                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMonth("All");
                        setCurrentPage(1);
                        setShowMonthPicker(false);
                      }}
                      className={`text-[11px] font-bold px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                        selectedMonth === "All"
                          ? "text-[#006052] bg-emerald-50 font-extrabold"
                          : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                      }`}
                    >
                      All Months
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowMonthPicker(false)}
                      className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 px-2 py-1 cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>

            <span className="text-slate-300 font-bold select-none">|</span>

            {/* Year Picker Trigger & Dropdown */}
            <div className="relative" ref={yearPickerRef}>
              <button
                type="button"
                onClick={() => {
                  setShowYearPicker((prev) => !prev);
                  setShowMonthPicker(false);
                  const y = selectedYear !== "All" ? Number(selectedYear) : new Date().getFullYear();
                  setPickerYearDecadeStart(Math.floor(y / 12) * 12);
                }}
                className={`flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                  showYearPicker
                    ? "bg-emerald-50 text-[#006052] ring-1 ring-[#006052]"
                    : "text-slate-700 hover:text-[#006052] hover:bg-slate-50"
                }`}
                title="Select Year"
              >
                <span>{selectedYear === "All" ? "All Years" : selectedYear}</span>
                <ChevronDown
                  className={`h-3 w-3 text-slate-400 transition-transform duration-200 ${
                    showYearPicker ? "rotate-180 text-[#006052]" : ""
                  }`}
                />
              </button>

              {/* Year Picker Popup Panel */}
              {showYearPicker && (
                <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-white p-4 shadow-xl border border-slate-200 z-50 animate-in fade-in zoom-in-95 duration-150">
                  {/* Top Bar: Year Range with Left / Right Arrows */}
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
                    <button
                      type="button"
                      onClick={() => setPickerYearDecadeStart((start) => start - 12)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
                      title="Previous 12 Years"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>

                    <span className="text-sm font-bold text-slate-800">
                      {pickerYearDecadeStart} – {pickerYearDecadeStart + 11}
                    </span>

                    <button
                      type="button"
                      onClick={() => setPickerYearDecadeStart((start) => start + 12)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
                      title="Next 12 Years"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>

                  {/* 12 Years 3x4 Grid */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {Array.from({ length: 12 }, (_, i) => pickerYearDecadeStart + i).map((y) => {
                      const isSelected = selectedYear === String(y);
                      const isCurrentYear = y === new Date().getFullYear();
                      return (
                        <button
                          key={y}
                          type="button"
                          onClick={() => {
                            setSelectedYear(String(y));
                            setPickerNavYear(y);
                            setCurrentPage(1);
                            setShowYearPicker(false);
                          }}
                          className={`h-9 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                            isSelected
                              ? "bg-[#006052] text-white font-bold shadow-xs scale-102"
                              : isCurrentYear
                              ? "text-[#006052] bg-emerald-50/70 border border-emerald-200 hover:bg-emerald-100 font-bold"
                              : "text-slate-700 hover:bg-emerald-50 hover:text-[#006052]"
                          }`}
                        >
                          {y}
                        </button>
                      );
                    })}
                  </div>

                  {/* Footer Action: All Years option */}
                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedYear("All");
                        setCurrentPage(1);
                        setShowYearPicker(false);
                      }}
                      className={`text-[11px] font-bold px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                        selectedYear === "All"
                          ? "text-[#006052] bg-emerald-50 font-extrabold"
                          : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                      }`}
                    >
                      All Years
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowYearPicker(false)}
                      className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 px-2 py-1 cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Add Company Button */}
          <button
            type="button"
            onClick={() => setShowAddCompanyModal(true)}
            className="flex h-10 items-center justify-center gap-2 rounded-xl bg-white border border-slate-300 px-4 text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors shrink-0"
          >
            <Building2 className="h-4 w-4 text-slate-500" />
            <span>Add Company</span>
          </button>

          {/* Add Chit Transaction Button */}
          <button
            type="button"
            onClick={() => setShowAddTxModal(true)}
            className="flex h-10 items-center justify-center gap-2 rounded-xl bg-[#006052] px-4 sm:px-5 text-xs sm:text-sm font-bold text-white hover:bg-[#004d43] shadow-2xs transition-colors shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Add Chit Transaction</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          2. THREE FIXED KPI CARDS
          1. Chit Payments (Expense)
          2. Chit Income (Income)
          3. Total Transactions
          (Do NOT replace or rearrange when company/chit is selected)
      ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4 mb-6">
        {/* KPI 1: Chit Payments */}
        <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-rose-700">
              Chit Payments
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
              <TrendingDown className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <p className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-rose-900">
              {formatCurrency(totalChitPayments)}
            </p>
            <span className="text-[11px] text-rose-600/90 font-medium mt-0.5 block">
              Expense · Overall Chit Fund Payments
            </span>
          </div>
        </div>

        {/* KPI 2: Chit Income */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-emerald-800">
              Chit Income
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-[#006052]">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <p className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-[#006052]">
              {formatCurrency(totalChitIncome)}
            </p>
            <span className="text-[11px] text-emerald-700/90 font-medium mt-0.5 block">
              Income · Chit Receipts & Returns
            </span>
          </div>
        </div>

        {/* KPI 3: Total Transactions */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-500">
              Total Transactions
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <ReceiptText className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <p className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">
              {totalTransactionsCount}
            </p>
            <span className="text-[11px] text-slate-500 font-medium mt-0.5 block">
              Across all companies and chits
            </span>
          </div>
        </div>
      </div>

      {/* =========================================================================
          3. COMPANY AND CHIT FILTERS
      ========================================================================= */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs mb-5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
            {/* Company Filter */}
            <div className="flex-1 sm:max-w-xs">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Company Filter
              </label>
              <div className="relative">
                <select
                  value={selectedCompanyId}
                  onChange={(e) => handleCompanyFilterChange(e.target.value)}
                  className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs sm:text-sm font-semibold text-slate-800 outline-none hover:border-slate-400 focus:border-[#006052] focus:ring-1 focus:ring-[#006052] transition-all cursor-pointer appearance-none pr-8"
                >
                  {companies.length === 0 ? (
                    <option value="All">No companies added (Click 'Add Company')</option>
                  ) : (
                    <>
                      <option value="All">All Companies</option>
                      {companies.map((comp) => (
                        <option key={comp.id} value={comp.id}>
                          {comp.name}
                        </option>
                      ))}
                    </>
                  )}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Chit Filter (depends on selected company) */}
            <div className="flex-1 sm:max-w-xs">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Chit Filter
              </label>
              <div className="relative">
                <select
                  value={selectedChitId}
                  onChange={(e) => setSelectedChitId(e.target.value)}
                  disabled={selectedCompanyId === "All" || companies.length === 0}
                  className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs sm:text-sm font-semibold text-slate-800 outline-none hover:border-slate-400 focus:border-[#006052] focus:ring-1 focus:ring-[#006052] transition-all cursor-pointer disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed appearance-none pr-8"
                >
                  <option value="All">
                    {companies.length === 0
                      ? "No companies available"
                      : selectedCompanyId === "All"
                      ? "Select a company first"
                      : availableFilterChits.length === 0
                      ? "No chits for this company"
                      : "All Chits"}
                  </option>
                  {availableFilterChits.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.name} (Val: {formatCurrency(ch.chitValue)})
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Right side of filter row: Company Details & Chit Details Buttons */}
          <div className="flex items-center gap-2.5 self-end sm:self-center pt-2 sm:pt-4">
            <button
              type="button"
              disabled={selectedCompanyId === "All"}
              onClick={() => setShowCompanyDetailsModal(true)}
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-xs sm:text-sm font-bold border transition-all shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-slate-400 border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300"
            >
              <Eye className="h-4 w-4 text-slate-500" />
              <span>Company Details</span>
            </button>

            <button
              type="button"
              disabled={selectedCompanyId === "All" || selectedChitId === "All"}
              onClick={() => {
                setViewingChitId(selectedChitId);
                setShowChitDetailsModal(true);
              }}
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-xs sm:text-sm font-bold border transition-all shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-slate-400 border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300"
            >
              <Eye className="h-4 w-4 text-slate-500" />
              <span>Chit Details</span>
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          4. TRANSACTION TABS (All Transactions, Income, Expense)
      ========================================================================= */}
      <div className="flex items-center gap-2 mb-4 border-b border-slate-200 pb-3 overflow-x-auto">
        {[
          { id: "All Transactions", label: "All Transactions" },
          { id: "Income", label: "Income" },
          { id: "Expense", label: "Expense" }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 sm:px-5 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all whitespace-nowrap shadow-2xs ${
              activeTab === tab.id
                ? "bg-[#006052] text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* =========================================================================
          5. TRANSACTION TABLE
          EXACTLY SIX COLUMNS:
          1. Date
          2. Company Name
          3. Chit Name
          4. Transaction (Chit Paid / Chit Income)
          5. Amount
          6. Payment Type
      ========================================================================= */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Date
                </th>
                <th className="px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Company Name
                </th>
                <th className="px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Chit Name
                </th>
                <th className="px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Transaction
                </th>
                <th className="px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 text-right">
                  Amount
                </th>
                <th className="px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Payment Type
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTableTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-400">
                      <ReceiptText className="h-8 w-8 mb-2 stroke-[1.5] text-slate-300" />
                      <p className="text-sm font-semibold text-slate-600">No chit transactions found</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {transactions.length === 0
                          ? "Click 'Add Chit Transaction' to record your first chit entry."
                          : "Try adjusting the month, year, company, chit, or tab filters."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedTableTransactions.map((tx) => {
                  const isExpense = tx.type === "Chit Paid" || tx.category === "Expense";
                  return (
                    <tr key={tx.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* 1. Date */}
                      <td className="px-5 py-3.5 whitespace-nowrap text-xs font-semibold text-slate-700">
                        {formatDateCell(tx.date)}
                      </td>

                      {/* 2. Company Name */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className="font-bold text-xs sm:text-sm text-slate-900">
                          {tx.companyName}
                        </span>
                      </td>

                      {/* 3. Chit Name */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className="text-xs font-semibold text-slate-700 font-mono">
                          {tx.chitName}
                        </span>
                      </td>

                      {/* 4. Transaction */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {isExpense ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 border border-rose-200">
                            <ArrowDownLeft className="h-3 w-3" />
                            Chit Paid
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-[#006052] border border-emerald-200">
                            <ArrowUpRight className="h-3 w-3" />
                            Chit Income
                          </span>
                        )}
                      </td>

                      {/* 5. Amount */}
                      <td className="px-5 py-3.5 whitespace-nowrap text-right">
                        <span className={`font-bold text-xs sm:text-sm ${isExpense ? 'text-rose-700' : 'text-[#006052]'}`}>
                          {isExpense ? '-' : '+'}{formatCurrency(tx.amount)}
                        </span>
                      </td>

                      {/* 6. Payment Type */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                          {tx.paymentType || "Cash"}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls (Change 1: Max 6 records per page) */}
        {filteredTableTransactions.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between px-5 py-3.5 border-t border-slate-100 bg-white gap-3">
            <p className="text-xs font-medium text-slate-500">
              Showing <span className="font-bold text-slate-700">{((safeCurrentPage - 1) * PAGE_SIZE) + 1}</span> to{" "}
              <span className="font-bold text-slate-700">
                {Math.min(safeCurrentPage * PAGE_SIZE, filteredTableTransactions.length)}
              </span>{" "}
              of <span className="font-bold text-slate-700">{filteredTableTransactions.length}</span> transactions
            </p>

            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safeCurrentPage === 1}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs transition-colors"
                >
                  Previous
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pageNum) => (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setCurrentPage(pageNum)}
                      className={`h-7 w-7 rounded-lg text-xs font-bold transition-all ${
                        safeCurrentPage === pageNum
                          ? "bg-[#006052] text-white shadow-2xs"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {pageNum}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safeCurrentPage === totalPages}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>



      {/* =========================================================================
          6. COMPANY DETAILS MODAL (POPUP)
      ========================================================================= */}
      {showCompanyDetailsModal && companyModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-2xl max-h-[90vh] rounded-2xl bg-white shadow-2xl relative flex flex-col border border-slate-200 overflow-hidden my-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100 bg-white sticky top-0 z-10 shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-[#006052] ring-4 ring-teal-50/50">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900">
                    {companyModalData.company.name}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Company Details · {companyModalData.totalChits} Associated Chit Schemes
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCompanyDetailsModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
              {/* Filter Notice */}
              {(selectedMonth !== "All" || selectedYear !== "All") && (
                <div className="p-2.5 rounded-lg bg-teal-50/80 border border-teal-200 text-xs font-semibold text-[#006052] flex items-center justify-between">
                  <span>
                    Showing statistics for {selectedMonth !== "All" ? monthNameList.find(m => m.value === selectedMonth)?.label : "All Months"} {selectedYear !== "All" ? selectedYear : "All Years"}
                  </span>
                </div>
              )}

              {/* Summary KPIs Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Total Transactions
                  </span>
                  <p className="text-xl font-bold text-slate-900 mt-1">
                    {companyModalData.txCount}
                  </p>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Across all chits
                  </span>
                </div>

                <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3.5 text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 block">
                    Total Chit Paid (Expense)
                  </span>
                  <p className="text-xl font-bold text-rose-900 mt-1">
                    {formatCurrency(companyModalData.totalPaid)}
                  </p>
                  <span className="text-[10px] text-rose-600/80 mt-0.5 block">
                    Company installment payments
                  </span>
                </div>

                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
                    Total Chit Income
                  </span>
                  <p className="text-xl font-bold text-[#006052] mt-1">
                    {formatCurrency(companyModalData.totalIncome)}
                  </p>
                  <span className="text-[10px] text-emerald-700/80 mt-0.5 block">
                    Receipts & prize returns
                  </span>
                </div>
              </div>

              {/* Associated Chit Schemes List with View Details button */}
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-2.5">
                  Associated Chit Schemes ({companyModalData.totalChits})
                </span>
                {companyModalData.chits.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No chit schemes registered for this company.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {companyModalData.chits.map((ch) => {
                      const chTxs = transactions.filter((t) => {
                        if (!matchesDate(t.date)) return false;
                        return t.companyId === companyModalData.company.id && t.chitId === ch.id;
                      });
                      const chPaid = chTxs
                        .filter((t) => t.type === "Chit Paid" || t.category === "Expense")
                        .reduce((sum, t) => sum + Number(t.amount || 0), 0);

                      return (
                        <div
                          key={ch.id}
                          className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs flex flex-col justify-between hover:border-slate-300 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs sm:text-sm text-slate-900 font-mono truncate mr-2">
                              {ch.name}
                            </span>
                          </div>

                          <div className="mt-2 text-xs flex items-center justify-between text-slate-500">
                            <span>Value: <strong className="text-slate-700">{formatCurrency(ch.chitValue)}</strong></span>
                            <span className="font-semibold text-rose-700">Paid: {formatCurrency(chPaid)}</span>
                          </div>

                          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-[10px] text-slate-400">
                              {ch.totalPayments
                                ? `${ch.totalPayments} ${ch.paymentFrequency === "Weekly" ? "Weeks" : "Months"}`
                                : ch.durationMonths
                                ? `${ch.durationMonths} Months`
                                : "—"}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setViewingChitId(ch.id);
                                setSelectedChitId(ch.id);
                                setShowCompanyDetailsModal(false);
                                setShowChitDetailsModal(true);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-[#006052] bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
                            >
                              <Eye className="h-3 w-3" />
                              <span>View Details</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Transactions Recorded for Company */}
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-2.5">
                  Transactions Recorded ({companyModalData.transactions.length})
                </span>
                {companyModalData.transactions.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No transactions recorded for this period.</p>
                ) : (
                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                    {companyModalData.transactions.map((tx) => {
                      const isExp = tx.type === "Chit Paid" || tx.category === "Expense";
                      return (
                        <div
                          key={tx.id}
                          className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-slate-50 border border-slate-100"
                        >
                          <div>
                            <p className="font-bold text-slate-800">
                              {tx.chitName} · <span className="font-normal text-slate-500">{formatDateCell(tx.date)}</span>
                            </p>
                            <span className="text-[10px] text-slate-400">Mode: {tx.paymentType}</span>
                          </div>
                          <div className="text-right">
                            <span className={`font-bold ${isExp ? 'text-rose-700' : 'text-[#006052]'}`}>
                              {isExp ? '-' : '+'}{formatCurrency(tx.amount)}
                            </span>
                            <span className="block text-[10px] font-medium text-slate-400">{tx.type}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end px-5 sm:px-6 py-3.5 bg-white border-t border-slate-100 shrink-0">
              <button
                type="button"
                onClick={() => setShowCompanyDetailsModal(false)}
                className="rounded-xl border border-slate-200 bg-white px-5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          6B. CHIT DETAILS MODAL (POPUP)
      ========================================================================= */}
      {showChitDetailsModal && chitModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-2xl max-h-[90vh] rounded-2xl bg-white shadow-2xl relative flex flex-col border border-slate-200 overflow-hidden my-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100 bg-white sticky top-0 z-10 shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-[#006052] ring-4 ring-teal-50/50">
                  <Hash className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900">
                    {chitModalData.chit.name}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Company: <strong className="text-slate-700">{chitModalData.companyName}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowChitDetailsModal(false);
                  setViewingChitId(null);
                }}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
              {/* Chit Specification Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Total Value
                  </span>
                  <p className="text-lg font-bold text-slate-900 mt-1">
                    {formatCurrency(chitModalData.chit.totalValue || chitModalData.chit.chitValue)}
                  </p>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Full chit amount
                  </span>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Frequency & Payments
                  </span>
                  <p className="text-lg font-bold text-slate-900 mt-1">
                    {chitModalData.chit.totalPayments || chitModalData.chit.durationMonths}{" "}
                    {chitModalData.chit.paymentFrequency === "Weekly" ? "Weeks" : "Months"}
                  </p>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    {chitModalData.chit.paymentFrequency || "Monthly"} schedule
                  </span>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Amount per Payment
                  </span>
                  <p className="text-lg font-bold text-[#006052] mt-1">
                    {formatCurrency(chitModalData.chit.amountPerPayment || chitModalData.chit.monthlyInstallment || Math.round((chitModalData.chit.chitValue || 0) / (chitModalData.chit.durationMonths || 1)))}
                  </p>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Per {chitModalData.chit.paymentFrequency === "Weekly" ? "week" : "month"}
                  </span>
                </div>
              </div>

              {/* Chit Financial Totals for this scheme */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 text-center shadow-2xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Transactions Count
                  </span>
                  <p className="text-xl font-bold text-slate-900 mt-1">
                    {chitModalData.txCount}
                  </p>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    For this chit
                  </span>
                </div>

                <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3.5 text-center shadow-2xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 block">
                    Total Chit Paid
                  </span>
                  <p className="text-xl font-bold text-rose-900 mt-1">
                    {formatCurrency(chitModalData.totalPaid)}
                  </p>
                  <span className="text-[10px] text-rose-600/80 mt-0.5 block">
                    Expense for this scheme
                  </span>
                </div>

                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 text-center shadow-2xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
                    Total Chit Income
                  </span>
                  <p className="text-xl font-bold text-[#006052] mt-1">
                    {formatCurrency(chitModalData.totalIncome)}
                  </p>
                  <span className="text-[10px] text-emerald-700/80 mt-0.5 block">
                    Receipts & prize returns
                  </span>
                </div>
              </div>

              {/* Only transactions belonging to this specific chit */}
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-2.5">
                  Transactions For This Chit ({chitModalData.transactions.length})
                </span>
                {chitModalData.transactions.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No transactions recorded for this chit yet.</p>
                ) : (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {chitModalData.transactions.map((tx) => {
                      const isExp = tx.type === "Chit Paid" || tx.category === "Expense";
                      return (
                        <div
                          key={tx.id}
                          className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-slate-50 border border-slate-100"
                        >
                          <div>
                            <p className="font-bold text-slate-800">
                              {formatDateCell(tx.date)} · <span className="font-normal text-slate-500">Mode: {tx.paymentType}</span>
                            </p>
                            <span className="text-[10px] text-slate-400">ID: {tx.id}</span>
                          </div>
                          <div className="text-right">
                            <span className={`font-bold ${isExp ? 'text-rose-700' : 'text-[#006052]'}`}>
                              {isExp ? '-' : '+'}{formatCurrency(tx.amount)}
                            </span>
                            <span className="block text-[10px] font-medium text-slate-400">{tx.type}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 bg-white border-t border-slate-100 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowChitDetailsModal(false);
                  setShowCompanyDetailsModal(true);
                }}
                className="text-xs font-bold text-[#006052] hover:underline"
              >
                ← Back to Company Details
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowChitDetailsModal(false);
                  setViewingChitId(null);
                }}
                className="rounded-xl border border-slate-200 bg-white px-5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          7. ADD CHIT TRANSACTION MODAL
      ========================================================================= */}
      {showAddTxModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl relative flex flex-col border border-slate-200 overflow-hidden my-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white">
              <div>
                <h3 className="font-bold text-base sm:text-lg text-slate-900">Add Chit Transaction</h3>
                <p className="text-xs text-slate-500">Record a chit payment or income entry</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddTxModal(false);
                  setTxError("");
                }}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleAddTransactionSubmit} className="p-6 space-y-4">
              {/* Transaction Type selection */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Transaction Type *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTxType("Chit Paid")}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                      txType === "Chit Paid"
                        ? "border-rose-300 bg-rose-50 text-rose-700 shadow-2xs"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <ArrowDownLeft className="h-3.5 w-3.5" />
                    Chit Paid (Expense)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxType("Chit Income")}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                      txType === "Chit Income"
                        ? "border-emerald-300 bg-emerald-50 text-[#006052] shadow-2xs"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <ArrowUpRight className="h-3.5 w-3.5" />
                    Chit Income (Income)
                  </button>
                </div>
              </div>

              {/* Company Selection */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Select Company *
                </label>
                <select
                  required
                  value={formCompanyId}
                  disabled={companies.length === 0}
                  onChange={(e) => {
                    setFormCompanyId(e.target.value);
                    const comp = companies.find((c) => c.id === e.target.value);
                    setFormChitId(comp?.chits?.[0]?.id || "");
                  }}
                  className="w-full h-11 border border-slate-300 rounded-xl px-3 text-xs sm:text-sm font-medium text-slate-700 outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052] shadow-2xs transition-all disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="">
                    {companies.length === 0 ? "No companies added — Add Company first" : "Select Company"}
                  </option>
                  {companies.map((comp) => (
                    <option key={comp.id} value={comp.id}>
                      {comp.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Chit Selection */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Select Chit *
                </label>
                <select
                  required
                  value={formChitId}
                  onChange={(e) => setFormChitId(e.target.value)}
                  disabled={!formCompanyId || availableFormChits.length === 0}
                  className="w-full h-11 border border-slate-300 rounded-xl px-3 text-xs sm:text-sm font-medium text-slate-700 outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052] shadow-2xs transition-all disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="">
                    {!formCompanyId
                      ? "Select a company first"
                      : availableFormChits.length === 0
                      ? "No chits registered for this company"
                      : "Select Chit"}
                  </option>
                  {availableFormChits.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.name} (Value: {formatCurrency(ch.chitValue)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Amount (₹) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  step="any"
                  placeholder="e.g. 5000"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  className="w-full h-11 border border-slate-300 rounded-xl px-3 text-xs sm:text-sm font-medium text-slate-800 outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052] shadow-2xs transition-all"
                />
              </div>

              {/* Date & Payment Type */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full h-11 border border-slate-300 rounded-xl px-3 text-xs sm:text-sm font-medium text-slate-700 outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052] shadow-2xs transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Payment Type *
                  </label>
                  <select
                    value={formPaymentType}
                    onChange={(e) => setFormPaymentType(e.target.value)}
                    className="w-full h-11 border border-slate-300 rounded-xl px-3 text-xs sm:text-sm font-medium text-slate-700 outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052] shadow-2xs transition-all"
                  >
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>
              </div>

              {txError && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
                  {txError}
                </div>
              )}

              {/* Footer Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddTxModal(false);
                    setTxError("");
                  }}
                  className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-[#006052] hover:bg-[#004d43] rounded-xl shadow-2xs transition-colors"
                >
                  Save Transaction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          8. ADD COMPANY MODAL (Change 2: No Company Code, Multiple Chits Supported)
      ========================================================================= */}
      {showAddCompanyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl relative flex flex-col border border-slate-200 overflow-hidden my-auto max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white shrink-0">
              <div>
                <h3 className="font-bold text-base sm:text-lg text-slate-900">Add Chit Company</h3>
                <p className="text-xs text-slate-500">Register a company and configure its chit schemes</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddCompanyModal(false);
                  setCompanyError("");
                }}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleAddCompanySubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
              {/* 1. Mode Selection: Create New Company vs Select Existing Company */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Action Type *
                </label>
                <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => {
                      setCompanyModalMode("create");
                      setCompanyError("");
                      setCompanySuccess("");
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      companyModalMode === "create"
                        ? "bg-white text-[#006052] shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Create New Company</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCompanyModalMode("existing");
                      setCompanyError("");
                      setCompanySuccess("");
                      if (!existingCompanyId && companies.length > 0) {
                        setExistingCompanyId(companies[0].id);
                      }
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      companyModalMode === "existing"
                        ? "bg-white text-[#006052] shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    <span>Select Existing Company</span>
                  </button>
                </div>
              </div>

              {/* Mode 1: Create New Company */}
              {companyModalMode === "create" && (
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Company Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Shriram Chits"
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                    className="w-full h-11 border border-slate-300 rounded-xl px-3 text-xs sm:text-sm font-medium text-slate-800 outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052] shadow-2xs transition-all"
                  />
                </div>
              )}

              {/* Mode 2: Select Existing Company */}
              {companyModalMode === "existing" && (
                <div className="space-y-4">
                  {companies.length === 0 ? (
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-center">
                      <p className="text-xs font-semibold text-amber-800">
                        No existing companies found.
                      </p>
                      <p className="text-[11px] text-amber-700 mt-1">
                        Please create a new company first.
                      </p>
                      <button
                        type="button"
                        onClick={() => setCompanyModalMode("create")}
                        className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#006052] hover:bg-[#004d43] transition-colors"
                      >
                        <Plus className="h-3 w-3" />
                        <span>Switch to Create New Company</span>
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Select Company Dropdown */}
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                          Select Saved Company *
                        </label>
                        <div className="relative">
                          <select
                            required
                            value={existingCompanyId}
                            onChange={(e) => setExistingCompanyId(e.target.value)}
                            className="w-full h-11 border border-slate-300 bg-white rounded-xl px-3 text-xs sm:text-sm font-semibold text-slate-800 outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052] shadow-2xs cursor-pointer appearance-none pr-8"
                          >
                            <option value="">Select a company</option>
                            {companies.map((comp) => (
                              <option key={comp.id} value={comp.id}>
                                {comp.name} ({comp.chits?.length || 0} existing chits)
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                        </div>
                      </div>

                      {/* Read-Only Details of Selected Company & Existing Chits */}
                      {(() => {
                        const selComp = companies.find((c) => c.id === existingCompanyId);
                        if (!selComp) return null;
                        return (
                          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                              <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                                  Company Name
                                </span>
                                <p className="text-sm font-bold text-slate-800 mt-0.5">{selComp.name}</p>
                              </div>
                              <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-[#006052] border border-emerald-200">
                                {selComp.chits?.length || 0} Registered Chits
                              </span>
                            </div>

                            {/* Existing Schemes List (Read-Only) */}
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                                Existing Chit Schemes (Read-Only)
                              </span>
                              {!selComp.chits || selComp.chits.length === 0 ? (
                                <p className="text-xs text-slate-400 italic">No chits currently registered for this company.</p>
                              ) : (
                                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                                  {selComp.chits.map((ch, idx) => (
                                    <div
                                      key={ch.id || idx}
                                      className="p-2.5 rounded-lg bg-white border border-slate-200 text-xs flex items-center justify-between shadow-2xs"
                                    >
                                      <div>
                                        <p className="font-bold text-slate-800">{ch.name}</p>
                                        <p className="text-[10px] text-slate-500 mt-0.5">
                                          {ch.totalPayments || ch.durationMonths}{" "}
                                          {ch.paymentFrequency === "Weekly" ? "Weeks" : "Months"} ({ch.paymentFrequency || "Monthly"})
                                        </p>
                                      </div>
                                      <div className="text-right">
                                        <span className="font-bold text-slate-900 block">
                                          {formatCurrency(ch.totalValue || ch.chitValue)}
                                        </span>
                                        <span className="text-[10px] text-[#006052] font-semibold">
                                          {formatCurrency(ch.amountPerPayment || ch.monthlyInstallment || 0)} / payment
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>
              )}

              {/* Chits Section: Add one or multiple new chits */}
              {(companyModalMode === "create" || (companyModalMode === "existing" && companies.length > 0)) && (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        {companyModalMode === "existing" ? "Add New Chit Schemes *" : "Chit Schemes *"}
                      </label>
                      <span className="text-[11px] text-slate-400">
                        {companyModalMode === "existing"
                          ? "Configure one or more new chit schemes to append"
                          : "Configure one or more chit schemes"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddChitRow}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#006052] bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add Chit</span>
                    </button>
                  </div>

                  {newCompanyChits.length === 0 ? (
                    <div className="p-3 text-center rounded-xl border border-dashed border-slate-300 text-xs text-slate-400">
                      No new chits configured. Click <strong className="text-[#006052] font-bold">Add Chit</strong> above to add one.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {newCompanyChits.map((chitRow, index) => (
                        <div
                          key={chitRow.id || index}
                          className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3 relative"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-700">
                              {companyModalMode === "existing" ? `New Chit #${index + 1}` : `Chit #${index + 1}`}
                            </span>
                            {(newCompanyChits.length > 1 || companyModalMode === "existing") && (
                              <button
                                type="button"
                                onClick={() => handleRemoveChitRow(index)}
                                className="text-xs font-semibold text-rose-600 hover:text-rose-800 transition-colors cursor-pointer"
                              >
                                Remove
                              </button>
                            )}
                          </div>

                          {/* 1. Scheme Name */}
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                              Scheme Name *
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. SM-1L-20M"
                              value={chitRow.name}
                              onChange={(e) => handleChitRowChange(index, "name", e.target.value)}
                              className="w-full h-10 border border-slate-300 bg-white rounded-lg px-3 text-xs font-medium text-slate-800 outline-none focus:border-[#006052] shadow-2xs"
                            />
                          </div>

                          {/* 2. Total Value & 3. Payment Frequency */}
                          <div className="grid grid-cols-2 gap-2.5">
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                                Total Value (₹) *
                              </label>
                              <input
                                type="number"
                                required
                                min="1"
                                step="any"
                                placeholder="e.g. 100000"
                                value={chitRow.totalValue}
                                onChange={(e) => handleChitRowChange(index, "totalValue", e.target.value)}
                                className="w-full h-10 border border-slate-300 bg-white rounded-lg px-3 text-xs font-medium text-slate-800 outline-none focus:border-[#006052] shadow-2xs"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                                Payment Frequency *
                              </label>
                              <select
                                value={chitRow.paymentFrequency || "Monthly"}
                                onChange={(e) => handleChitRowChange(index, "paymentFrequency", e.target.value)}
                                className="w-full h-10 border border-slate-300 bg-white rounded-lg px-3 text-xs font-medium text-slate-800 outline-none focus:border-[#006052] shadow-2xs cursor-pointer"
                              >
                                <option value="Monthly">Monthly</option>
                                <option value="Weekly">Weekly</option>
                              </select>
                            </div>
                          </div>

                          {/* 4. Total Number of Payments & 5. Amount per Payment */}
                          <div className="grid grid-cols-2 gap-2.5">
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                                Total Number of Payments *
                              </label>
                              <input
                                type="number"
                                required
                                min="1"
                                placeholder={chitRow.paymentFrequency === "Weekly" ? "e.g. 52 (weeks)" : "e.g. 20 (months)"}
                                value={chitRow.totalPayments}
                                onChange={(e) => handleChitRowChange(index, "totalPayments", e.target.value)}
                                className="w-full h-10 border border-slate-300 bg-white rounded-lg px-3 text-xs font-medium text-slate-800 outline-none focus:border-[#006052] shadow-2xs"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                                Amount per Payment (₹)
                              </label>
                              <input
                                type="text"
                                readOnly
                                placeholder="Auto-calculated"
                                value={chitRow.amountPerPayment ? `₹${Number(chitRow.amountPerPayment).toLocaleString('en-IN')}` : ""}
                                className="w-full h-10 border border-slate-200 bg-slate-100 rounded-lg px-3 text-xs font-bold text-[#006052] outline-none cursor-default shadow-2xs"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {companyError && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
                  {companyError}
                </div>
              )}

              {companySuccess && (
                <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-[#006052] flex items-center gap-1.5">
                  <span>✓</span>
                  <span>{companySuccess}</span>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddCompanyModal(false);
                    setCompanyError("");
                    setCompanySuccess("");
                  }}
                  className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-[#006052] hover:bg-[#004d43] rounded-xl shadow-2xs transition-colors cursor-pointer"
                >
                  {companyModalMode === "existing" ? "Save New Chits" : "Save Company & Chits"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChitInvestment;
