import React, { useState, useMemo, useEffect, useRef } from "react";
import { DATA_CHANGED_EVENT } from "../../services/api";
import { loadCustomerEntries } from "../../services/customerApi";
import { loadPayments, recordCollection } from "../../services/collectionApi";
import {
  ArrowLeft,
  ChevronRight,
  User,
  Wallet,
  PiggyBank,
  Landmark,
  Calendar,
  CreditCard,
  Edit,
  MoreVertical,
  CheckCircle2,
  Clock,
  Car,
  AlertCircle,
  X,
  FileCheck,
  Send,
  Eye,
  Trash2,
  AlertTriangle,
  ChevronDown,
  TrendingUp,
  Coins,
  Activity,
  BadgePercent,
} from "lucide-react";
import RepaymentScheduleTable, { generateSchedule, computeEffectiveSchedule } from "../../components/RepaymentScheduleTable";
import InstallmentTimeline from "../../components/InstallmentTimeline";

const formatCurrency = (value) => {
  if (value === undefined || value === null || isNaN(Number(value))) return "₹0";
  return `₹${Math.round(Number(value)).toLocaleString("en-IN")}`;
};

const formatDate = (dateString) => {
  if (!dateString) return "—";
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const formatDateTime = (dateString) => {
  if (!dateString) return { date: "—", time: "" };
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return { date: dateString, time: "" };
  const formattedDate = d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  // Check if string contains time information (e.g., ISO string with 'T' or non-zero time)
  const hasTime = typeof dateString === "string" && (dateString.includes("T") || dateString.includes(":"));
  const formattedTime = hasTime
    ? d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
    : "";
  return { date: formattedDate, time: formattedTime };
};

const parseToDayTimestamp = (dateInput) => {
  if (!dateInput) return null;
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

// Exclude failed, cancelled, or reversed transactions from eligible collections
const isEligiblePayment = (p) => {
  if (!p) return false;
  const status = String(p.status || "").toLowerCase().trim();
  if (
    status === "failed" ||
    status === "cancelled" ||
    status === "canceled" ||
    status === "reversed" ||
    status === "rejected" ||
    status === "void"
  ) {
    return false;
  }
  return Number(p.amount || 0) > 0;
};

export default function LoanDetailsView({ loanId, customerId, onBack, onEditLoan }) {
  const [activeTab, setActiveTab] = useState("loanDetails");
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [recordAmount, setRecordAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [collectionRemarks, setCollectionRemarks] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [activityFilter, setActivityFilter] = useState("all"); // 'all' or 'recent'
  const [viewAllActivity, setViewAllActivity] = useState(false);
  const [selectedInstallmentForHistory, setSelectedInstallmentForHistory] = useState(null);

  const [customersList, setCustomersList] = useState([]);
  const [allPayments, setAllPayments] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const clientRef = useRef(null);

  useEffect(() => {
    let active = true;
    const load = () =>
      Promise.all([loadCustomerEntries(), loadPayments()])
        .then(([entries, payments]) => {
          if (!active) return;
          setCustomersList(entries);
          setAllPayments(payments);
          setLoadError("");
        })
        .catch((error) => active && setLoadError(error.message));

    load();
    window.addEventListener(DATA_CHANGED_EVENT, load);
    return () => {
      active = false;
      window.removeEventListener(DATA_CHANGED_EVENT, load);
    };
  }, []);

  // Find the exact loan record
  const loanRecord = useMemo(() => {
    if (!customersList.length) return null;
    return (
      customersList.find(
        (c) =>
          c.loanId === loanId ||
          (customerId && (c.customerId === customerId || c.customer?.mobile?.endsWith(customerId.replace("CUS-", ""))))
      ) || customersList[0]
    );
  }, [customersList, loanId, customerId]);

  const customer = loanRecord?.customer || {};
  const vehicle = loanRecord?.vehicle || {};
  const loan = loanRecord?.loan || {};

  const effectiveLoanId = loanRecord?.loanId || loanId || "LN-001";
  const effectiveCustomerId =
    loanRecord?.customerId ||
    (customer.mobile ? `CUS-${customer.mobile.slice(-5)}` : customerId || "CUS-001");
  const customerName = customer.name || "Unknown Customer";
  const customerMobile = customer.mobile
    ? `${customer.mobile.slice(0, 5)}XXXXX`
    : "Not provided";
  const loanStartDate =
    loan.firstDueDate || customer.applicationDate || loanRecord?.date || "";

  // Principal calculation
  const vehicleAmount =
    loan.vehicleAmount !== "" &&
      loan.vehicleAmount !== null &&
      loan.vehicleAmount !== undefined
      ? Number(loan.vehicleAmount)
      : Number(vehicle.amount || 0);
  const downPayment = Number(loan.downPayment || 0);
  const calculatedPrincipal = Math.max(vehicleAmount - downPayment, 0);
  const principalAmount = Number(loanRecord?.loanAmount || calculatedPrincipal || 0);

  // Raw Repayment Schedule Base
  const rawSchedule = useMemo(() => {
    if (loanRecord?.repaymentSchedule && loanRecord.repaymentSchedule.length > 0) {
      return loanRecord.repaymentSchedule;
    }
    if (principalAmount > 0 && loan.interestRate && loan.tenure) {
      return generateSchedule({
        loanAmount: principalAmount,
        interestRate: loan.interestRate,
        tenure: loan.tenure,
        tenureUnit: loan.tenureUnit || "Months",
        paymentFrequency: loan.paymentFrequency || "Daily",
        interestType: loan.interestType || "Flat",
        repaymentMethod: loan.repaymentMethod || "EMI",
        firstDueDate: loan.firstDueDate || loanStartDate,
      });
    }
    return [];
  }, [loanRecord, principalAmount, loan, loanStartDate]);

  // Eligible Collections for this loan (excluding failed, cancelled, or reversed transactions)
  const loanPayments = useMemo(() => {
    return allPayments.filter(
      (p) =>
        (p.loanId ? p.loanId === effectiveLoanId : (p.customerId && p.customerId === effectiveCustomerId)) &&
        isEligiblePayment(p)
    );
  }, [allPayments, effectiveLoanId, effectiveCustomerId]);

  // Derive authoritative schedule reconciled with actual recorded transactions
  const schedule = useMemo(() => {
    return computeEffectiveSchedule(rawSchedule, loanPayments);
  }, [rawSchedule, loanPayments]);

  // Financial summary metrics
  const totalCollectedFromPayments = loanPayments.reduce(
    (sum, p) => sum + Number(p.amount || 0),
    0
  );
  const totalCollectedFromSchedule = schedule.reduce(
    (sum, s) => sum + Number(s.amountPaid || 0),
    0
  );
  const totalCollected = loanPayments.length > 0
    ? totalCollectedFromPayments
    : totalCollectedFromSchedule;

  const totalPrincipalRepaid = schedule.reduce(
    (sum, s) => sum + Number(s.principalPaid || 0),
    0
  );
  const totalInterestCollected = schedule.reduce(
    (sum, s) => sum + Number(s.interestPaid || 0),
    0
  );

  // Total Interest and Repayable
  const totalInterest = useMemo(() => {
    if (schedule.length > 0) {
      return schedule.reduce((sum, s) => sum + Number(s.interest || 0), 0);
    }
    const rate = Number(loan.interestRate || 0);
    const tenureVal = Number(loan.tenure || 0);
    return Math.round((principalAmount * (rate / 100) * tenureVal) / 12);
  }, [schedule, loan, principalAmount]);

  const documentCharges = Number(loan.documentCharge || 0);
  const totalRepayable = principalAmount + totalInterest;

  // Total Outstanding = Total Repayable Amount - Total Eligible Collections
  // (Do not use remaining principal value as Total Outstanding)
  const outstandingBalance = loanRecord?.status === "Closed" ? 0 : Math.max(totalRepayable - totalCollected, 0);

  // Next Due Date
  const todayTs = parseToDayTimestamp(new Date());
  let nextDueDate = loanRecord?.nextDueDate || loan.firstDueDate || "";
  let upcomingInstallment = schedule.find(
    (s) =>
      s.status !== "Collected" &&
      s.status !== "Paid" &&
      s.emi - (s.amountPaid || 0) > 0.01
  );
  if (upcomingInstallment && upcomingInstallment.dueDate) {
    nextDueDate = upcomingInstallment.dueDate;
  }

  // Installments calculations
  const totalInstallmentsCount = schedule.length || Number(loan.tenure || 0);
  const installmentsPaidCount = schedule.filter(
    (s) => s.status === "Collected" || s.status === "Paid"
  ).length;
  const installmentsPendingCount = Math.max(
    totalInstallmentsCount - installmentsPaidCount,
    0
  );
  const overdueInstallmentsCount = schedule.filter((s) => {
    const isNotPaid = s.status !== "Collected" && s.status !== "Paid";
    const hasBal = s.emi - (s.amountPaid || 0) > 0.01;
    const dueTs = parseToDayTimestamp(s.dueDate);
    return isNotPaid && hasBal && dueTs !== null && dueTs < todayTs;
  }).length;

  const lastPayment = [...loanPayments].sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  )[0];
  const lastPaymentDate = lastPayment?.date ? formatDate(lastPayment.date) : "—";
  const lastPaymentAmount = lastPayment?.amount
    ? formatCurrency(lastPayment.amount)
    : "—";

  const remainingPrincipal = Math.max(principalAmount - totalPrincipalRepaid, 0);
  const remainingInterest = Math.max(totalInterest - totalInterestCollected, 0);

  // Status
  let loanStatus = "Active";
  if (outstandingBalance <= 0 || loanRecord?.status === "Closed") {
    loanStatus = "Closed";
  } else if (overdueInstallmentsCount > 0) {
    loanStatus = "Overdue";
  }

  // Maturity Date
  const maturityDate =
    schedule.length > 0 && schedule[schedule.length - 1].dueDate
      ? formatDate(schedule[schedule.length - 1].dueDate)
      : "—";

  // Installment Amount
  const installmentAmount =
    schedule[0]?.emi || Number(loanRecord?.emiAmount || loan.emiAmount || 0);

  // Construct Dynamic Activity List
  const activities = useMemo(() => {
    const list = [];

    // Collections recorded
    loanPayments.forEach((p) => {
      list.push({
        id: `act-pay-${p.id}`,
        title: "Collection recorded",
        subtext: `${formatCurrency(p.amount)} received (${p.mode || "Cash"})`,
        date: p.date,
        author: "Admin",
        type: "collection",
      });
    });

    // Installment dues from schedule
    schedule.forEach((s) => {
      list.push({
        id: `act-due-${s.installmentNumber}`,
        title: `Installment due (#${s.installmentNumber})`,
        subtext: `${formatCurrency(s.emi)}`,
        date: s.dueDate,
        author: "System",
        type: "due",
      });
    });

    // Loan disbursed
    if (principalAmount > 0) {
      list.push({
        id: "act-disbursed",
        title: "Loan disbursed",
        subtext: `${formatCurrency(principalAmount)}`,
        date: loanStartDate,
        author: "Admin",
        type: "disbursed",
      });
    }

    // Loan created
    list.push({
      id: "act-created",
      title: "Loan created",
      subtext: effectiveLoanId,
      date: loanStartDate || new Date().toISOString(),
      author: "Admin",
      type: "created",
    });

    // Sort newest first
    return list.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [loanPayments, schedule, principalAmount, loanStartDate, effectiveLoanId]);

  const displayedActivities = viewAllActivity ? activities : activities.slice(0, 5);

  // Handle Record Collection submission
  const handleRecordCollection = async (e) => {
    e.preventDefault();
    if (!recordAmount || isNaN(recordAmount) || Number(recordAmount) <= 0) {
      alert("Please enter a valid collection amount.");
      return;
    }
    if (saving) return;

    // One reference per payment attempt, so a retry cannot post it twice.
    clientRef.current ||= crypto.randomUUID();
    setSaving(true);
    try {
      await recordCollection({
        entry: { loanId: effectiveLoanId, customerId: effectiveCustomerId },
        amount: Number(recordAmount),
        paymentMode,
        remarks: collectionRemarks || "EMI Collection",
        clientRef: clientRef.current,
      });
      clientRef.current = null;
      setIsRecordModalOpen(false);
      setRecordAmount("");
      setCollectionRemarks("");
    } catch (error) {
      alert(error.message || "Could not save the payment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="loan-view-container flex-1 min-h-screen bg-[#F4F6F9] px-3 sm:px-6 py-5 sm:py-6 font-sans text-slate-800 w-full min-w-0 max-w-full overflow-x-hidden">
      <div className="w-full max-w-full space-y-4 sm:space-y-5">
        {loadError && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Could not load this loan: {loadError}
          </div>
        )}
        {/* =========================================================
            1. BREADCRUMB
        ========================================================= */}
        <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-500 font-medium">
          <button
            type="button"
            onClick={onBack}
            className="hover:text-emerald-800 transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Loans</span>
          </button>
          <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          <span className="font-semibold text-slate-800">{effectiveLoanId}</span>
        </div>

        {/* =========================================================
            2. CUSTOMER & LOAN HEADER CARD
        ========================================================= */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
            <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-emerald-100/70 border border-emerald-200 flex items-center justify-center shrink-0 text-emerald-800 shadow-2xs">
              <User className="h-6 w-6 sm:h-7 sm:w-7" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight break-words">
                  {customerName}
                </h1>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider border shrink-0 ${loanStatus === "Active"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : loanStatus === "Overdue"
                        ? "bg-rose-50 text-rose-700 border-rose-200"
                        : "bg-slate-100 text-slate-600 border-slate-200"
                    }`}
                >
                  {loanStatus}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 font-medium">
                <span className="whitespace-nowrap">
                  Loan ID: <strong className="text-slate-800 font-semibold">{effectiveLoanId}</strong>
                </span>
                <span className="text-slate-300">|</span>
                <span className="whitespace-nowrap">
                  Customer ID: <strong className="text-slate-800 font-semibold">{effectiveCustomerId}</strong>
                </span>
                <span className="text-slate-300">|</span>
                <span className="whitespace-nowrap">
                  Mobile: <strong className="text-slate-800 font-semibold">{customerMobile}</strong>
                </span>
                <span className="text-slate-300">|</span>
                <span className="whitespace-nowrap">
                  Start Date: <strong className="text-slate-800 font-semibold">{formatDate(loanStartDate)}</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 ml-auto sm:ml-0">
            {/* Edit Loan Button */}
            <button
              type="button"
              onClick={() => {
                if (onEditLoan) onEditLoan(loanRecord);
                else alert("Edit Loan initiated for " + effectiveLoanId);
              }}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 shadow-2xs transition-all cursor-pointer whitespace-nowrap"
            >
              <Edit className="h-3.5 w-3.5 text-slate-500" strokeWidth={2} />
              <span>Edit Loan</span>
            </button>

            {/* More Actions Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 p-2 text-slate-600 shadow-2xs transition-all cursor-pointer"
                aria-label="More actions"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-1 w-44 rounded-xl bg-white border border-slate-200 shadow-lg py-1.5 z-20 text-xs font-semibold text-slate-700">
                  <button
                    onClick={() => {
                      window.print();
                      setMenuOpen(false);
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-slate-50"
                  >
                    Print Summary
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab("repaymentSchedule");
                      setMenuOpen(false);
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-slate-50"
                  >
                    View Schedule
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* =========================================================
            3. FIVE TOP KPI CARDS
        ========================================================= */}
        <div className="loan-kpi-grid grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3.5 sm:gap-4">
          {/* 1. Principal Repaid */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-4 shadow-2xs flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center shrink-0">
              <Wallet className="h-4.5 w-4.5" strokeWidth={2.2} />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 block leading-tight" title="Principal Repaid">
                Principal Repaid
              </span>
              <p className="text-base sm:text-lg lg:text-xl font-extrabold text-slate-900 tracking-tight mt-0.5 leading-snug break-words" title={formatCurrency(totalPrincipalRepaid)}>
                {formatCurrency(totalPrincipalRepaid)}
              </p>
              <span className="text-[11px] text-slate-400 mt-0.5 block leading-tight">
                Principal received
              </span>
            </div>
          </div>

          {/* 2. Interest Repaid */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-4 shadow-2xs flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center shrink-0">
              <TrendingUp className="h-4.5 w-4.5" strokeWidth={2.2} />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 block leading-tight" title="Interest Repaid">
                Interest Repaid
              </span>
              <p className="text-base sm:text-lg lg:text-xl font-extrabold text-slate-900 tracking-tight mt-0.5 leading-snug break-words" title={formatCurrency(totalInterestCollected)}>
                {formatCurrency(totalInterestCollected)}
              </p>
              <span className="text-[11px] text-slate-400 mt-0.5 block leading-tight">
                Interest earned
              </span>
            </div>
          </div>

          {/* 3. Total Collected */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-4 shadow-2xs flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center shrink-0">
              <Coins className="h-4.5 w-4.5" strokeWidth={2.2} />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 block leading-tight" title="Total Collected">
                Total Collected
              </span>
              <p className="text-base sm:text-lg lg:text-xl font-extrabold text-slate-900 tracking-tight mt-0.5 leading-snug break-words" title={formatCurrency(totalCollected)}>
                {formatCurrency(totalCollected)}
              </p>
              <span className="text-[11px] text-slate-400 mt-0.5 block leading-tight">
                Total amount received
              </span>
            </div>
          </div>

          {/* 4. Remaining Principal */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-4 shadow-2xs flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center shrink-0">
              <Landmark className="h-4.5 w-4.5" strokeWidth={2.2} />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 block leading-tight" title="Remaining Principal">
                Remaining Principal
              </span>
              <p className="text-base sm:text-lg lg:text-xl font-extrabold text-slate-900 tracking-tight mt-0.5 leading-snug break-words" title={formatCurrency(remainingPrincipal)}>
                {formatCurrency(remainingPrincipal)}
              </p>
              <span className="text-[11px] text-slate-400 mt-0.5 block leading-tight">
                Balance principal
              </span>
            </div>
          </div>

          {/* 5. Remaining Interest */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-4 shadow-2xs flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center shrink-0">
              <PiggyBank className="h-4.5 w-4.5" strokeWidth={2.2} />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 block leading-tight" title="Remaining Interest">
                Remaining Interest
              </span>
              <p className="text-base sm:text-lg lg:text-xl font-extrabold text-slate-900 tracking-tight mt-0.5 leading-snug break-words" title={formatCurrency(remainingInterest)}>
                {formatCurrency(remainingInterest)}
              </p>
              <span className="text-[11px] text-slate-400 mt-0.5 block leading-tight">
                Balance interest
              </span>
            </div>
          </div>
        </div>

        {/* =========================================================
            4. TAB NAVIGATION
        ========================================================= */}
        <div className="border-b border-slate-200 flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar pt-1 w-full max-w-full">
          {[
            { id: "loanDetails", label: "Loan Details" },
            { id: "repaymentSchedule", label: "Repayment Schedule" },
            { id: "installmentTimeline", label: "Installment Timeline" },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 sm:px-6 py-2.5 text-xs sm:text-sm font-semibold whitespace-nowrap transition-all border-b-2 cursor-pointer ${isActive
                    ? "border-emerald-700 text-emerald-800 bg-emerald-50/40 rounded-t-lg"
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
                  }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* =========================================================
            5. TAB CONTENT
        ========================================================= */}

        {/* TAB 1: LOAN DETAILS */}
        {activeTab === "loanDetails" && (
          <div className="loan-overview-grid items-stretch w-full">
            {/* Left Column: Loan Information Section (~70% width on desktop) */}
            <div className="loan-info-col bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs flex flex-col justify-between">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 mb-5 tracking-tight">
                  Loan Information
                </h2>

                <div className="loan-info-fields-grid grid grid-cols-1 sm:grid-cols-2 gap-y-3.5 sm:gap-y-4 gap-x-6 sm:gap-x-8 text-xs sm:text-sm">
                  {/* Left Column */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100">
                      <span className="text-slate-500 font-medium shrink-0">Loan ID</span>
                      <span className="font-semibold text-slate-900 text-right break-words">{effectiveLoanId}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100">
                      <span className="text-slate-500 font-medium shrink-0">Loan Date</span>
                      <span className="font-semibold text-slate-900 text-right break-words">{formatDate(loanStartDate)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100">
                      <span className="text-slate-500 font-medium shrink-0">Principal Amount</span>
                      <span className="font-semibold text-slate-900 text-right break-words">{formatCurrency(principalAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100">
                      <span className="text-slate-500 font-medium shrink-0">Interest Method</span>
                      <span className="font-semibold text-slate-900 text-right break-words">{loan.interestType || "Flat"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100">
                      <span className="text-slate-500 font-medium shrink-0">Interest Rate</span>
                      <span className="font-semibold text-slate-900 text-right break-words">
                        {loan.interestRate ? `${loan.interestRate}% per month` : "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100">
                      <span className="text-slate-500 font-medium shrink-0">Total Interest</span>
                      <span className="font-semibold text-slate-900 text-right break-words">{formatCurrency(totalInterest)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100">
                      <span className="text-slate-500 font-medium shrink-0">Document Charges</span>
                      <span className="font-semibold text-slate-900 text-right break-words">{formatCurrency(documentCharges)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-1.5">
                      <span className="text-slate-500 font-medium shrink-0">Total Repayable</span>
                      <span className="font-bold text-slate-900 text-right break-words">{formatCurrency(totalRepayable)}</span>
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100">
                      <span className="text-slate-500 font-medium shrink-0">Repayment Frequency</span>
                      <span className="font-semibold text-slate-900 text-right break-words">
                        {loan.paymentFrequency || loanRecord?.paymentFrequency || "Daily"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100">
                      <span className="text-slate-500 font-medium shrink-0">Installment Amount</span>
                      <span className="font-semibold text-slate-900 text-right break-words">{formatCurrency(installmentAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100">
                      <span className="text-slate-500 font-medium shrink-0">Tenure</span>
                      <span className="font-semibold text-slate-900 text-right break-words">
                        {loan.tenure ? `${loan.tenure} ${loan.tenureUnit || "Months"}` : "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100">
                      <span className="text-slate-500 font-medium shrink-0">Total Installments</span>
                      <span className="font-semibold text-slate-900 text-right break-words">{totalInstallmentsCount}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100">
                      <span className="text-slate-500 font-medium shrink-0">First Due Date</span>
                      <span className="font-semibold text-slate-900 text-right break-words">
                        {formatDate(loan.firstDueDate || loanStartDate)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100">
                      <span className="text-slate-500 font-medium shrink-0">Maturity Date</span>
                      <span className="font-semibold text-slate-900 text-right break-words">{maturityDate}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100">
                      <span className="text-slate-500 font-medium shrink-0">Down Payment</span>
                      <span className="font-semibold text-slate-900 text-right break-words">{formatCurrency(downPayment)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-1.5">
                      <span className="text-slate-500 font-medium shrink-0">Vehicle Reg. No.</span>
                      <span className="font-semibold text-slate-900 text-right break-words">{vehicle.regNo || "—"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Three Vertically Stacked Summary Cards (~30% width on desktop) */}
            <div className="loan-summary-col flex flex-col justify-between gap-3.5 sm:gap-4 h-full">
              {/* 1. Total Amount Card (Green Accent) */}
              <div className="bg-emerald-50/50 rounded-2xl border border-emerald-200/80 p-4 sm:p-5 shadow-2xs flex-1 flex flex-col justify-between transition-all duration-200 hover:shadow-xs min-h-[120px]">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-800/80 block">
                      Total Amount
                    </span>
                    <p className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-1 leading-snug break-words">
                      {formatCurrency(totalRepayable)}
                    </p>
                  </div>
                  <div className="h-11 w-11 rounded-xl bg-emerald-100 text-emerald-700 border border-emerald-200/90 flex items-center justify-center shrink-0 shadow-2xs">
                    <Wallet className="h-5 w-5" strokeWidth={2.2} />
                  </div>
                </div>
                <div className="pt-2 mt-auto border-t border-emerald-100/70">
                  <span className="text-[11px] text-emerald-700/90 font-medium block">
                    Principal + Interest
                  </span>
                </div>
              </div>

              {/* 2. Total Collected Card (Blue Accent) */}
              <div className="bg-sky-50/50 rounded-2xl border border-sky-200/80 p-4 sm:p-5 shadow-2xs flex-1 flex flex-col justify-between transition-all duration-200 hover:shadow-xs min-h-[120px]">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-xs font-bold uppercase tracking-wider text-sky-800/80 block">
                      Total Collected
                    </span>
                    <p className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-1 leading-snug break-words">
                      {formatCurrency(totalCollected)}
                    </p>
                  </div>
                  <div className="h-11 w-11 rounded-xl bg-sky-100 text-sky-700 border border-sky-200/90 flex items-center justify-center shrink-0 shadow-2xs">
                    <Coins className="h-5 w-5" strokeWidth={2.2} />
                  </div>
                </div>
                <div className="pt-2 mt-auto border-t border-sky-100/70">
                  <span className="text-[11px] text-sky-700/90 font-medium block">
                    Total amount received so far
                  </span>
                </div>
              </div>

              {/* 3. Total Outstanding Card (Orange Accent) */}
              <div className="bg-amber-50/50 rounded-2xl border border-amber-200/80 p-4 sm:p-5 shadow-2xs flex-1 flex flex-col justify-between transition-all duration-200 hover:shadow-xs min-h-[120px]">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-800/80 block">
                      Total Outstanding
                    </span>
                    <p className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-1 leading-snug break-words">
                      {formatCurrency(outstandingBalance)}
                    </p>
                  </div>
                  <div className="h-11 w-11 rounded-xl bg-amber-100 text-amber-700 border border-amber-200/90 flex items-center justify-center shrink-0 shadow-2xs">
                    <Landmark className="h-5 w-5" strokeWidth={2.2} />
                  </div>
                </div>
                <div className="pt-2 mt-auto border-t border-amber-100/70">
                  <span className="text-[11px] text-amber-700/90 font-medium block">
                    Remaining payable balance
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: REPAYMENT SCHEDULE */}
        {activeTab === "repaymentSchedule" && (
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  Loan Repayment Schedule
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Detailed installment schedule and payment statuses for {effectiveLoanId}. Click any installment to view collection history.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600">
                  Total Installments: {schedule.length}
                </span>
              </div>
            </div>

            {schedule.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No repayment schedule available for this loan.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-xs sm:text-sm">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="px-3.5 py-3 text-left font-bold text-slate-700">No.</th>
                      <th className="px-3.5 py-3 text-left font-bold text-slate-700">Due Date</th>
                      <th className="px-3.5 py-3 text-right font-bold text-slate-700">Principal</th>
                      <th className="px-3.5 py-3 text-right font-bold text-slate-700">Principal Outstanding</th>
                      <th className="px-3.5 py-3 text-right font-bold text-slate-700">Interest</th>
                      <th className="px-3.5 py-3 text-right font-bold text-slate-700">Installment</th>
                      <th className="px-3.5 py-3 text-right font-bold text-slate-700">Amount Paid</th>
                      <th className="px-3.5 py-3 text-right font-bold text-slate-700">Balance</th>
                      <th className="px-3.5 py-3 text-center font-bold text-slate-700">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {schedule.map((row) => (
                      <tr
                        key={row.installmentNumber}
                        onClick={() => setSelectedInstallmentForHistory(row)}
                        className="hover:bg-emerald-50/40 transition-colors cursor-pointer group"
                        title="Click to view collection history"
                      >
                        <td className="whitespace-nowrap px-3.5 py-3 font-semibold text-slate-700 group-hover:text-emerald-800">
                          #{row.installmentNumber}
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-3 font-semibold text-slate-900">
                          {formatDate(row.dueDate)}
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-3 text-right text-slate-600 font-medium">
                          {formatCurrency(row.principal)}
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-3 text-right text-slate-700 font-medium">
                          {formatCurrency(row.principalOutstanding !== undefined ? row.principalOutstanding : 0)}
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-3 text-right text-slate-600 font-medium">
                          {formatCurrency(row.interest)}
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-3 text-right font-bold text-emerald-800">
                          {formatCurrency(row.emi)}
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-3 text-right text-slate-600 font-medium">
                          {formatCurrency(row.amountPaid || 0)}
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-3 text-right font-bold text-slate-900">
                          {formatCurrency(row.balance !== undefined ? row.balance : Math.max(0, row.emi - (row.amountPaid || 0)))}
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-3 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${row.status === "Collected" || row.status === "Paid"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : row.status === "Partial"
                                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                                  : row.status === "Overdue"
                                    ? "bg-rose-50 text-rose-700 border border-rose-200"
                                    : "bg-slate-100 text-slate-700 border border-slate-200"
                              }`}
                          >
                            {row.status || "Due"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: INSTALLMENT TIMELINE (ZIGZAG DESIGN) */}
        {activeTab === "installmentTimeline" && (
          <InstallmentTimeline
            schedule={schedule}
            loanPayments={loanPayments}
            effectiveLoanId={effectiveLoanId}
            isLoanCompleted={
              schedule.length > 0 &&
              schedule.every((s) => s.status === "Paid" || s.status === "Collected" || (s.balance !== undefined && s.balance <= 0.01))
            }
          />
        )}

        {/* TAB 4: LOAN ACTIVITY */}
        {activeTab === "loanActivity" && (
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-100 flex items-center justify-center">
                  <Activity className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                    Loan Activity
                  </h2>
                  <p className="text-xs text-slate-500">
                    Chronological timeline of loan events and collections
                  </p>
                </div>
              </div>
              {activities.length > 0 && (
                <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full">
                  {activities.length} event{activities.length > 1 ? "s" : ""}
                </span>
              )}
            </div>

            {activities.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No activity recorded yet for this loan.
              </div>
            ) : (
              <div className="relative pl-6 space-y-4 border-l-2 border-emerald-700/60 ml-3 pt-2 pb-2">
                {displayedActivities.map((act) => {
                  const isCollection = act.type === "collection";
                  const isDisbursed = act.type === "disbursed";
                  const isDue = act.type === "due";

                  return (
                    <div key={act.id} className="relative group">
                      {/* Timeline Connector Dot */}
                      <div
                        className={`absolute -left-[31px] top-1 h-3.5 w-3.5 rounded-full ring-4 ring-white flex items-center justify-center ${isCollection
                            ? "bg-emerald-600"
                            : isDisbursed
                              ? "bg-teal-700"
                              : isDue
                                ? "bg-amber-500"
                                : "bg-slate-600"
                          }`}
                      />

                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs sm:text-sm font-bold text-slate-900">
                              {act.title}
                            </span>
                            {isCollection && (
                              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Received
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-600 font-medium mt-0.5 break-words">
                            {act.subtext}
                          </p>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-xs font-semibold text-slate-600 block">
                            {formatDate(act.date)}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium block">
                            {act.author}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {activities.length > 5 && (
              <div className="pt-2 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setViewAllActivity(!viewAllActivity)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 hover:text-emerald-900 cursor-pointer transition-colors"
                >
                  <span>{viewAllActivity ? "Show less" : `View all (${activities.length})`}</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* =========================================================
            RECORD COLLECTION MODAL
        ========================================================= */}
        {isRecordModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/80">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-emerald-100 text-emerald-800">
                    <Wallet className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm sm:text-base text-slate-900">
                      Record Loan Collection
                    </h3>
                    <p className="text-[11px] text-slate-500">Loan ID: {effectiveLoanId}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsRecordModalOpen(false)}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleRecordCollection} className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Collection Amount *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={recordAmount}
                    onChange={(e) => setRecordAmount(e.target.value)}
                    placeholder={`e.g. ${installmentAmount || 1000}`}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Payment Mode *
                  </label>
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 shadow-2xs"
                  >
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Remarks / Notes
                  </label>
                  <input
                    type="text"
                    value={collectionRemarks}
                    onChange={(e) => setCollectionRemarks(e.target.value)}
                    placeholder="EMI Collection, advance, or receipt note"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 shadow-2xs"
                  />
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsRecordModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs sm:text-sm font-bold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save Collection"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {/* =========================================================
            COLLECTION HISTORY MODAL (INTEGRATED INTO REPAYMENT SCHEDULE)
        ========================================================= */}
        {selectedInstallmentForHistory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4">
            <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800 shrink-0">
                    <Wallet className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base sm:text-lg text-slate-900 leading-tight">
                      Collection History
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                      <span className="font-semibold text-emerald-800">
                        Installment #{selectedInstallmentForHistory.installmentNumber}
                      </span>
                      <span className="text-slate-300">|</span>
                      <span>
                        Loan ID: <strong className="text-slate-700 font-semibold">{effectiveLoanId}</strong>
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedInstallmentForHistory(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
                {/* 3. Installment Summary */}
                {(() => {
                  // Resolve latest installment state from computed schedule
                  const activeInst =
                    schedule.find(
                      (s) => s.installmentNumber === selectedInstallmentForHistory.installmentNumber
                    ) || selectedInstallmentForHistory;

                  const instPaid = activeInst.amountPaid || 0;
                  const instBal =
                    activeInst.balance !== undefined
                      ? activeInst.balance
                      : Math.max(0, activeInst.emi - instPaid);
                  const instStatus = activeInst.status || (instBal <= 0.01 ? "Paid" : "Due");

                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-slate-50/90 rounded-xl p-3 sm:p-4 border border-slate-200/80 text-xs">
                      <div>
                        <span className="text-slate-500 font-medium block text-[11px]">Due Date</span>
                        <strong className="text-slate-800 text-xs sm:text-sm font-semibold block mt-0.5">
                          {formatDate(activeInst.dueDate)}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500 font-medium block text-[11px]">Installment (EMI)</span>
                        <strong className="text-emerald-800 text-xs sm:text-sm font-bold block mt-0.5">
                          {formatCurrency(activeInst.emi)}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500 font-medium block text-[11px]">Total Amount Paid</span>
                        <strong className="text-slate-800 text-xs sm:text-sm font-semibold block mt-0.5">
                          {formatCurrency(instPaid)}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500 font-medium block text-[11px]">Remaining Balance</span>
                        <strong className="text-slate-900 text-xs sm:text-sm font-bold block mt-0.5">
                          {formatCurrency(instBal)}
                        </strong>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <span className="text-slate-500 font-medium block text-[11px]">Payment Status</span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 mt-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${instStatus === "Paid" || instStatus === "Collected"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : instStatus === "Partial"
                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                : instStatus === "Overdue"
                                  ? "bg-rose-50 text-rose-700 border-rose-200"
                                  : "bg-slate-100 text-slate-700 border-slate-200"
                            }`}
                        >
                          {instStatus}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* 4. Collection Transactions Table (Strictly 6 Columns, NO Remarks) */}
                {(() => {
                  const targetNum = selectedInstallmentForHistory.installmentNumber;

                  // Find matched installment in computed schedule
                  const activeInst = schedule.find((s) => s.installmentNumber === targetNum);

                  let matchingCollections = activeInst?.paymentsList || [];

                  // If paymentsList empty, fallback matching by explicit installment number or ref
                  if (matchingCollections.length === 0) {
                    const instIndex = schedule.findIndex((s) => s.installmentNumber === targetNum);
                    matchingCollections = loanPayments.filter((p, pIdx) => {
                      if (p.installmentNumber !== undefined && p.installmentNumber !== null) {
                        return Number(p.installmentNumber) === Number(targetNum);
                      }
                      if (p.installmentRef) {
                        const refMatch = p.installmentRef.match(/#?(\d+)/);
                        if (refMatch && Number(refMatch[1]) === Number(targetNum)) return true;
                      }
                      if (p.remarks && /installment\s*#?(\d+)/i.test(p.remarks)) {
                        const match = p.remarks.match(/installment\s*#?(\d+)/i);
                        if (match && Number(match[1]) === Number(targetNum)) return true;
                      }
                      return pIdx === instIndex;
                    });
                  }

                  if (matchingCollections.length === 0) {
                    return (
                      <div className="py-10 text-center text-xs text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 px-4">
                        No collections recorded for this installment.
                      </div>
                    );
                  }

                  return (
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="w-full divide-y divide-slate-200 text-xs">
                        <thead className="bg-slate-50/80">
                          <tr>
                            <th className="px-3 py-2.5 text-left font-bold text-slate-700 whitespace-nowrap">
                              Collection ID
                            </th>
                            <th className="px-3 py-2.5 text-left font-bold text-slate-700 whitespace-nowrap">
                              Collection Date &amp; Time
                            </th>
                            <th className="px-3 py-2.5 text-right font-bold text-slate-700 whitespace-nowrap">
                              Amount Collected
                            </th>
                            <th className="px-3 py-2.5 text-right font-bold text-slate-700 whitespace-nowrap">
                              Principal
                            </th>
                            <th className="px-3 py-2.5 text-right font-bold text-slate-700 whitespace-nowrap">
                              Interest
                            </th>
                            <th className="px-3 py-2.5 text-center font-bold text-slate-700 whitespace-nowrap">
                              Payment Mode
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {matchingCollections.map((col) => {
                            const { date, time } = formatDateTime(col.date);
                            return (
                              <tr key={col.id} className="hover:bg-slate-50/70 transition-colors">
                                <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-900">
                                  {col.id}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                                  <span className="font-medium text-slate-800">{date}</span>
                                  {time ? (
                                    <span className="text-[11px] text-slate-400 font-normal ml-1.5">
                                      {time}
                                    </span>
                                  ) : null}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5 text-right font-bold text-emerald-800">
                                  {formatCurrency(col.amount)}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5 text-right text-slate-600">
                                  {col.principal !== undefined ? formatCurrency(col.principal) : "—"}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5 text-right text-slate-600">
                                  {col.interest !== undefined ? formatCurrency(col.interest) : "—"}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5 text-center">
                                  <span className="inline-flex px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-semibold">
                                    {col.mode || "Cash"}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>

              {/* Modal Footer */}
              <div className="px-5 py-3.5 bg-slate-50/80 border-t border-slate-100 flex justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedInstallmentForHistory(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shadow-2xs"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
