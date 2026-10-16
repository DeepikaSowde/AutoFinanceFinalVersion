import React, { useState, useMemo, useEffect } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { DATA_CHANGED_EVENT } from "../../services/api";
import { loadCustomerEntries } from "../../services/customerApi";
import { loadPayments } from "../../services/collectionApi";
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
  CheckCircle,
  CheckCircle2,
  Clock,
  Car,
  AlertCircle,
  X,
  FileCheck,
  TrendingUp,
  Coins,
  Lock,
  ShieldCheck,
  FileText,
  Receipt,
} from "lucide-react";
import RepaymentScheduleTable, { generateSchedule, computeEffectiveSchedule, getRepaymentColumnLabel } from "../../components/RepaymentScheduleTable";
import InstallmentTimeline from "../../components/InstallmentTimeline";
import MidwayClosureModal from "../../components/MidwayClosureModal";
import { getVehicleDisplayImage } from "../../utils/vehicleImageHelper";

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

export default function LoanDetailsView({ loanId: propLoanId, customerId: propCustomerId, onBack: propOnBack, onEditLoan }) {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("loanDetails");
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedInstallmentForHistory, setSelectedInstallmentForHistory] = useState(null);

  const [customersList, setCustomersList] = useState([]);
  const [allPayments, setAllPayments] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showMidwayModal, setShowMidwayModal] = useState(false);

  // Read target IDs from prop, route params (/loans/:loanId), or query string (?loanId=...)
  const selectedLoanId = (propLoanId || params.loanId || searchParams.get("loanId") || "").trim();
  const selectedCustomerId = (propCustomerId || params.customerId || searchParams.get("customerId") || "").trim();

  const handleBack = () => {
    if (propOnBack) {
      propOnBack();
    } else {
      navigate("/loans");
    }
  };

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
        .catch((error) => active && setLoadError(error.message))
        .finally(() => active && setLoaded(true));

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

    // 1. If loanId is specified, strictly match by loanId (exact match, case-insensitive)
    if (selectedLoanId) {
      const match = customersList.find((c, idx) => {
        const id = (c.loanId || c.loan?.loanId || `LN-${String(idx + 1).padStart(3, "0")}`).trim().toLowerCase();
        return id === selectedLoanId.toLowerCase();
      });
      return match || null;
    }

    // 2. If NO loanId is specified, but customerId is specified, find that customer's loan
    if (selectedCustomerId) {
      const match = customersList.find((c, idx) => {
        const cId = (c.customerId || c.customer?.customerId || `CUS-${String(idx + 1).padStart(3, "0")}`).trim().toLowerCase();
        const mobile = (c.customer?.mobile || "").trim();
        return cId === selectedCustomerId.toLowerCase() || (mobile && selectedCustomerId.includes(mobile.slice(-5)));
      });
      return match || null;
    }

    return null;
  }, [customersList, selectedLoanId, selectedCustomerId]);

  const customer = loanRecord?.customer || {};
  const vehicle = loanRecord?.vehicle || {};
  const loan = loanRecord?.loan || {};
  const vehicleImageSrc = loanRecord ? getVehicleDisplayImage(loanRecord) : null;

  // Foreclosure detection
  const rawStatus = String(loanRecord?.status || loan.status || "").trim();
  const isForeclosed =
    rawStatus.toLowerCase() === "foreclosed" ||
    Boolean(loanRecord?.isForeclosed || loanRecord?.foreclosure);
  const foreclosureData = loanRecord?.foreclosure || {};

  // Midway Closure detection
  const isMidwayClosed = Boolean(
    loanRecord?.isMidwayClosed ||
    loanRecord?.midwayClosure ||
    rawStatus.toLowerCase() === "midway closed" ||
    String(loanRecord?.closureType || "").toLowerCase() === "midway closure"
  );
  const midwayClosureData = loanRecord?.midwayClosure || {};

  const effectiveLoanId = loanRecord?.loanId || loan.loanId || selectedLoanId || "LN-001";
  const effectiveCustomerId =
    loanRecord?.customerId ||
    (customer.mobile ? `CUS-${customer.mobile.slice(-5)}` : selectedCustomerId || "CUS-001");
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
    if (!loanRecord) return [];
    if (loanRecord.repaymentSchedule && loanRecord.repaymentSchedule.length > 0) {
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
    const computed = computeEffectiveSchedule(rawSchedule, loanPayments);
    if (!isMidwayClosed) {
      return computed;
    }

    // Identify the closure start installment number
    let closureStartNum = null;
    if (midwayClosureData?.installmentNumber && !isNaN(Number(midwayClosureData.installmentNumber))) {
      closureStartNum = Number(midwayClosureData.installmentNumber);
    } else if (midwayClosureData?.instalmentsRange) {
      const match = String(midwayClosureData.instalmentsRange).match(/#(\d+)/);
      if (match) closureStartNum = Number(match[1]);
    }

    if (closureStartNum === null) {
      const midwayP = loanPayments.find((p) => p.isMidwayClosure || String(p.remarks || "").toLowerCase().includes("midway closure"));
      if (midwayP) {
        if (midwayP.allocations && midwayP.allocations.length > 0) {
          const minNum = Math.min(
            ...midwayP.allocations.map((a) => Number(a.installmentNumber)).filter((n) => !isNaN(n) && n > 0)
          );
          if (isFinite(minNum) && minNum > 0) closureStartNum = minNum;
        }
        if (closureStartNum === null) {
          const match = String(midwayP.installmentNumber || midwayP.remarks || "").match(/#(\d+)/);
          if (match) closureStartNum = Number(match[1]);
        }
      }
    }

    if (closureStartNum === null) {
      const firstMidway = computed.find((s) => Boolean(s.isMidwayClosed || s.closureAdjusted || s.status === "Midway Closed"));
      if (firstMidway && Number(firstMidway.installmentNumber) > 0) {
        closureStartNum = Number(firstMidway.installmentNumber);
      }
    }

    // Fallback if not recorded: find first installment not fully paid before closure
    if (closureStartNum === null) {
      const firstUnpaid = rawSchedule.find((s) => s.status !== "Paid" && s.status !== "Collected");
      if (firstUnpaid && Number(firstUnpaid.installmentNumber) > 0) {
        closureStartNum = Number(firstUnpaid.installmentNumber);
      }
    }

    let hasSeenClosurePoint = false;
    return computed.map((item) => {
      const isPastOrAtClosure = closureStartNum !== null && Number(item.installmentNumber) >= closureStartNum;
      const isExplicitMidway = Boolean(item.isMidwayClosed || item.closureAdjusted || item.status === "Midway Closed");

      if (isPastOrAtClosure || isExplicitMidway || hasSeenClosurePoint) {
        hasSeenClosurePoint = true;
        return {
          ...item,
          amountPaid: Math.round(Number(item.amountPaid ?? item.emi ?? 0) * 100) / 100,
          principalOutstanding: 0,
          balance: 0,
          status: "Paid",
          isMidwayClosed: true,
          closureAdjusted: true,
        };
      }

      return {
        ...item,
        isMidwayClosed: false,
        closureAdjusted: false,
      };
    });
  }, [rawSchedule, loanPayments, isMidwayClosed, midwayClosureData]);

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

  const totalPrincipalRepaid = isMidwayClosed
    ? principalAmount
    : schedule.reduce(
        (sum, s) => sum + Number(s.principalPaid || 0),
        0
      );
  const totalInterestCollected = schedule.reduce(
    (sum, s) => sum + Number(s.interestPaid || 0),
    0
  );

  // Total Interest and Repayable
  // For Midway Closed loans, total interest is the interest actually collected through normal repayments
  // plus the closure interest charged and collected by the admin.
  const totalInterest = useMemo(() => {
    if (isMidwayClosed) {
      return totalInterestCollected;
    }
    if (schedule.length > 0) {
      return schedule.reduce((sum, s) => sum + Number(s.interest || 0), 0);
    }
    const rate = Number(loan.interestRate || 0);
    const tenureVal = Number(loan.tenure || 0);
    return Math.round((principalAmount * (rate / 100) * tenureVal) / 12);
  }, [schedule, loan, principalAmount, isMidwayClosed, totalInterestCollected]);

  const documentCharges = Number(loan.documentCharge || 0);
  const totalRepayable = isMidwayClosed
    ? principalAmount + totalInterestCollected
    : principalAmount + totalInterest;

  // Total Outstanding = Total Repayable Amount - Total Eligible Collections
  // For Foreclosed loans, Midway Closed loans, or Closed loans, outstanding balance is ₹0
  const outstandingBalance = isForeclosed || isMidwayClosed || loanRecord?.status === "Closed"
    ? 0
    : Math.max(totalRepayable - totalCollected, 0);

  const remainingPrincipal = isForeclosed || isMidwayClosed || loanRecord?.status === "Closed"
    ? 0
    : Math.max(principalAmount - totalPrincipalRepaid, 0);

  const remainingInterest = isForeclosed || isMidwayClosed || loanRecord?.status === "Closed"
    ? 0
    : Math.max(totalInterest - totalInterestCollected, 0);

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

  // Status
  let loanStatus = "Active";
  if (isMidwayClosed) {
    loanStatus = "Midway Closed";
  } else if (isForeclosed) {
    loanStatus = "Foreclosed";
  } else if (outstandingBalance <= 0 || loanRecord?.status === "Closed") {
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

  // Data arrives from the API after the page opens: wait for it (or show the
  // load error) before deciding the loan does not exist.
  if (!loanRecord && (!loaded || loadError)) {
    return (
      <div className="loan-view-container flex-1 min-h-screen bg-[#F4F6F9] px-3 sm:px-6 py-16 font-sans text-center text-sm w-full">
        {loadError ? <p className="text-rose-600">{loadError}</p> : <p className="text-slate-500">Loading loan…</p>}
      </div>
    );
  }

  // Gracefully handle invalid or missing loan ID
  if (!loanRecord) {
    return (
      <div className="loan-view-container flex-1 min-h-screen bg-[#F4F6F9] px-3 sm:px-6 py-8 font-sans text-slate-800 w-full min-w-0 max-w-full">
        <div className="max-w-xl mx-auto bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-xs">
          <div className="h-14 w-14 rounded-full bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Loan Not Found</h2>
          <p className="text-sm text-slate-500 mb-6">
            We couldn't find any loan matching ID <strong className="text-slate-800">{selectedLoanId || "specified"}</strong>. The loan may have been removed or the link is incorrect.
          </p>
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white px-5 py-2.5 text-sm font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Loans</span>
          </button>
        </div>
      </div>
    );
  }

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
            onClick={handleBack}
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
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider border shrink-0 ${
                    loanStatus === "Active"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : loanStatus === "Midway Closed"
                        ? "bg-amber-50 text-amber-800 border-amber-300"
                        : loanStatus === "Foreclosed"
                          ? "bg-purple-50 text-purple-700 border-purple-200"
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

          <div className="flex items-center gap-2.5 shrink-0 ml-auto sm:ml-0 flex-wrap">
            {/* Foreclosed Status Indicator if foreclosed */}
            {isForeclosed && (
              <div
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-50 border border-purple-200 text-purple-700 text-xs font-semibold shadow-2xs"
                title="Loan is foreclosed and settled."
              >
                <Lock className="h-3.5 w-3.5" />
                <span>Foreclosed</span>
              </div>
            )}

            {/* Midway Closed Status Indicator if midway closed */}
            {isMidwayClosed && (
              <div
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold shadow-2xs"
                title="Loan is midway closed."
              >
                <Coins className="h-3.5 w-3.5 text-amber-700" />
                <span>Midway Closed</span>
              </div>
            )}

            {/* Edit Loan Button */}
            <button
              type="button"
              disabled={isMidwayClosed}
              onClick={() => {
                if (isMidwayClosed) return;
                if (onEditLoan) onEditLoan(loanRecord);
                else alert("Edit Loan initiated for " + effectiveLoanId);
              }}
              title={isMidwayClosed ? "Editing is disabled for midway-closed loans" : "Edit Loan"}
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs sm:text-sm font-semibold shadow-2xs transition-all whitespace-nowrap ${
                isMidwayClosed
                  ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed opacity-60 pointer-events-none"
                  : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
              }`}
            >
              <Edit className={`h-3.5 w-3.5 ${isMidwayClosed ? "text-slate-400" : "text-slate-500"}`} strokeWidth={2} />
              <span>Edit Loan</span>
            </button>

            {/* Midway Closure Button (orange accent beside Edit Loan) */}
            <button
              type="button"
              disabled={isMidwayClosed}
              onClick={() => {
                if (isMidwayClosed) return;
                setShowMidwayModal(true);
              }}
              title={isMidwayClosed ? "This loan is already midway closed" : "Midway Closure"}
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-semibold shadow-2xs transition-all whitespace-nowrap ${
                isMidwayClosed
                  ? "bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed opacity-60 pointer-events-none"
                  : "bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
              }`}
            >
              <Coins className="h-3.5 w-3.5" />
              <span>Midway Closure</span>
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
                  <button
                    onClick={() => {
                      setActiveTab("collections");
                      setMenuOpen(false);
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-slate-50"
                  >
                    View Collections
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
                {isForeclosed
                  ? "Settled (Foreclosed)"
                  : isMidwayClosed
                  ? "Settled (Midway Closed)"
                  : "Balance principal"}
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
                {isForeclosed
                  ? "Settled / Waived"
                  : isMidwayClosed
                  ? "Settled (Midway Closed)"
                  : "Balance interest"}
              </span>
            </div>
          </div>
        </div>

        {/* =========================================================
            4. TAB NAVIGATION (4 TABS)
        ========================================================= */}
        <div className="border-b border-slate-200 flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar pt-1 w-full max-w-full">
          {[
            { id: "loanDetails", label: "Loan Details" },
            { id: "repaymentSchedule", label: "Repayment Schedule" },
            { id: "collections", label: `Collection History (${loanPayments.length})` },
            { id: "installmentTimeline", label: "Installment Timeline" },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 sm:px-6 py-2.5 text-xs sm:text-sm font-semibold whitespace-nowrap transition-all border-b-2 cursor-pointer ${
                  isActive
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
          <div className="space-y-5 w-full">
            {/* Foreclosure Information Banner (if foreclosed) */}
            {isForeclosed && (
              <div className="p-4 sm:p-5 rounded-2xl bg-purple-50 border border-purple-200 text-purple-900 shadow-2xs">
                <div className="flex items-start gap-3.5">
                  <div className="p-2.5 rounded-xl bg-purple-100 text-purple-700 shrink-0">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-base text-purple-950">
                        Loan Foreclosed &amp; Settled
                      </h3>
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-purple-200/80 text-purple-800 border border-purple-300">
                        Foreclosed
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-purple-700 mt-1">
                      This loan was closed early via foreclosure settlement. All loan terms, schedules, vehicle records, and historical payment receipts remain preserved below.
                    </p>
                    <div className="mt-3.5 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-purple-200/80 text-xs">
                      <div>
                        <span className="text-purple-600 font-medium block">Foreclosure Date</span>
                        <span className="font-bold text-purple-900 mt-0.5 block">
                          {formatDate(foreclosureData.date || loanRecord?.foreclosedDate || loanRecord?.updatedAt)}
                        </span>
                      </div>
                      <div>
                        <span className="text-purple-600 font-medium block">Settlement Amount</span>
                        <span className="font-bold text-purple-900 mt-0.5 block">
                          {formatCurrency(foreclosureData.settlementAmount || foreclosureData.amount || totalCollected)}
                        </span>
                      </div>
                      <div>
                        <span className="text-purple-600 font-medium block">Waived / Concession</span>
                        <span className="font-bold text-purple-900 mt-0.5 block">
                          {formatCurrency(foreclosureData.waivedAmount || 0)}
                        </span>
                      </div>
                      <div>
                        <span className="text-purple-600 font-medium block">Remarks</span>
                        <span className="font-bold text-purple-900 mt-0.5 block truncate" title={foreclosureData.remarks || loanRecord?.foreclosureRemarks || "Foreclosure settlement complete"}>
                          {foreclosureData.remarks || loanRecord?.foreclosureRemarks || "Foreclosure settlement complete"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Loan Overview: Loan Information Column + 3 Summary Cards */}
            <div className="loan-overview-grid items-stretch w-full">
              {/* Left Column: Loan Information Section */}
              <div className="loan-info-col bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs flex flex-col justify-between">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 mb-5 tracking-tight flex items-center gap-2">
                    <FileText className="h-4.5 w-4.5 text-emerald-800" />
                    <span>Loan Information</span>
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
                        <span className="text-slate-500 font-medium shrink-0">Vehicle Model</span>
                        <div className="flex items-center gap-2">
                          {vehicleImageSrc && (
                            <img
                              src={vehicleImageSrc}
                              alt={vehicle.model || vehicle.regNo || "Vehicle"}
                              className="h-6 w-9 rounded object-cover border border-slate-200 shadow-2xs"
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                          )}
                          <span className="font-semibold text-slate-900 text-right break-words">
                            {[vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "—"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Three Vertically Stacked Summary Cards */}
              <div className="loan-summary-col flex flex-col justify-between gap-3.5 sm:gap-4 h-full">
                {/* 1. Total Amount Card */}
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

                {/* 2. Total Collected Card */}
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

                {/* 3. Total Outstanding Card */}
                <div className={`${isForeclosed ? "bg-purple-50/50 border-purple-200/80" : isMidwayClosed ? "bg-amber-50/50 border-amber-200/80" : "bg-amber-50/50 border-amber-200/80"} rounded-2xl border p-4 sm:p-5 shadow-2xs flex-1 flex flex-col justify-between transition-all duration-200 hover:shadow-xs min-h-[120px]`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className={`text-xs font-bold uppercase tracking-wider ${isForeclosed ? "text-purple-800/80" : isMidwayClosed ? "text-amber-800/80" : "text-amber-800/80"} block`}>
                        Total Outstanding
                      </span>
                      <p className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-1 leading-snug break-words">
                        {formatCurrency(outstandingBalance)}
                      </p>
                    </div>
                    <div className={`h-11 w-11 rounded-xl ${isForeclosed ? "bg-purple-100 text-purple-700 border-purple-200/90" : isMidwayClosed ? "bg-amber-100 text-amber-700 border-amber-200/90" : "bg-amber-100 text-amber-700 border-amber-200/90"} border flex items-center justify-center shrink-0 shadow-2xs`}>
                      {isForeclosed ? <ShieldCheck className="h-5 w-5" strokeWidth={2.2} /> : isMidwayClosed ? <CheckCircle className="h-5 w-5" strokeWidth={2.2} /> : <Landmark className="h-5 w-5" strokeWidth={2.2} />}
                    </div>
                  </div>
                  <div className={`pt-2 mt-auto border-t ${isForeclosed ? "border-purple-100/70" : isMidwayClosed ? "border-amber-100/70" : "border-amber-100/70"}`}>
                    <span className={`text-[11px] ${isForeclosed ? "text-purple-700 font-semibold" : isMidwayClosed ? "text-amber-700 font-semibold" : "text-amber-700/90 font-medium"} block`}>
                      {isForeclosed
                        ? "Settled via Foreclosure (₹0 balance)"
                        : isMidwayClosed
                        ? "Settled via Midway Closure (₹0 balance)"
                        : "Remaining payable balance"}
                    </span>
                  </div>
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
                <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
                  Total Installments: {schedule.length}
                </span>
              </div>
            </div>

            {isForeclosed && (
              <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 text-xs flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-purple-700 shrink-0" />
                <span>This loan is foreclosed and settled. Historical schedule records are maintained for audit integrity.</span>
              </div>
            )}

            {isMidwayClosed && !isForeclosed && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-amber-700 shrink-0" />
                <span>This loan is settled via Midway Closure. Genuine prior payments are preserved and future cancelled instalments are marked Midway Closed with ₹0 balance.</span>
              </div>
            )}

            {schedule.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No repayment schedule available for this loan.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-xs sm:text-sm">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="px-3.5 py-3 text-left font-bold text-slate-700">Instalment Number</th>
                      <th className="px-3.5 py-3 text-left font-bold text-slate-700">Due Date</th>
                      <th className="px-3.5 py-3 text-right font-bold text-slate-700">Principal</th>
                      <th className="px-3.5 py-3 text-right font-bold text-slate-700">Interest</th>
                      <th className="px-3.5 py-3 text-right font-bold text-slate-700">Total EMI</th>
                      <th className="px-3.5 py-3 text-right font-bold text-slate-700">Principal Outstanding</th>
                      <th className="px-3.5 py-3 text-right font-bold text-slate-700">Balance Amount</th>
                      <th className="px-3.5 py-3 text-center font-bold text-slate-700">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {schedule.map((row) => {
                      const isMidwaySettled = Boolean(row.isMidwayClosed || row.closureAdjusted || row.status === "Midway Closed");
                      return (
                        <tr
                          key={row.installmentNumber}
                          onClick={() => setSelectedInstallmentForHistory(row)}
                          className={`transition-colors cursor-pointer group ${
                            isMidwaySettled
                              ? "bg-amber-50/70 hover:bg-amber-100/60"
                              : "hover:bg-emerald-50/40"
                          }`}
                          title="Click to view collection history"
                        >
                          <td className={`whitespace-nowrap px-3.5 py-3 font-semibold ${
                            isMidwaySettled
                              ? "text-amber-950 group-hover:text-amber-900"
                              : "text-slate-700 group-hover:text-emerald-800"
                          }`}>
                            {row.installmentNumber}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3 font-semibold text-slate-900">
                            {formatDate(row.dueDate)}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3 text-right text-slate-600 font-medium">
                            {formatCurrency(row.principal)}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3 text-right text-slate-600 font-medium">
                            {formatCurrency(row.interest)}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3 text-right font-bold text-emerald-800">
                            {formatCurrency(row.emi)}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3 text-right text-slate-700 font-medium">
                            {formatCurrency(row.principalOutstanding !== undefined ? row.principalOutstanding : 0)}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3 text-right font-bold text-slate-900">
                            {formatCurrency(row.balance !== undefined ? row.balance : Math.max(0, row.emi - (row.amountPaid || 0)))}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3 text-center">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                isMidwaySettled
                                  ? "bg-orange-100/90 text-amber-900 border border-amber-300 ring-1 ring-amber-500/20"
                                  : row.status === "Collected" || row.status === "Paid"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : row.status === "Partial"
                                    ? "bg-amber-50 text-amber-700 border border-amber-200"
                                    : row.status === "Overdue"
                                      ? "bg-rose-50 text-rose-700 border border-rose-200"
                                      : "bg-slate-100 text-slate-700 border border-slate-200"
                              }`}
                            >
                              {isMidwaySettled ? "Paid" : (row.status || "Due")}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: COLLECTION HISTORY */}
        {activeTab === "collections" && (
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-emerald-800" />
                  <span>Collection &amp; Repayment History</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Complete ledger of payments and collections received for loan {effectiveLoanId}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
                  {loanPayments.length} payment{loanPayments.length === 1 ? "" : "s"} recorded
                </span>
              </div>
            </div>

            {/* Quick Financial Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Total Collections</span>
                <p className="text-base sm:text-lg font-extrabold text-slate-900 mt-0.5">{loanPayments.length}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
                <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider block">Amount Collected</span>
                <p className="text-base sm:text-lg font-extrabold text-emerald-900 mt-0.5">{formatCurrency(totalCollected)}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-sky-50/70 border border-sky-200">
                <span className="text-[11px] font-semibold text-sky-800 uppercase tracking-wider block">Principal Recovered</span>
                <p className="text-base sm:text-lg font-extrabold text-sky-900 mt-0.5">{formatCurrency(totalPrincipalRepaid)}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200">
                <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider block">Interest Earned</span>
                <p className="text-base sm:text-lg font-extrabold text-amber-900 mt-0.5">{formatCurrency(totalInterestCollected)}</p>
              </div>
            </div>

            {loanPayments.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400 space-y-2">
                <Receipt className="h-8 w-8 mx-auto text-slate-300" />
                <p>No collections recorded yet for this loan.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-xs sm:text-sm">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="px-3.5 py-3 text-left font-bold text-slate-700">Receipt ID</th>
                      <th className="px-3.5 py-3 text-left font-bold text-slate-700">Collection Date &amp; Time</th>
                      <th className="px-3.5 py-3 text-right font-bold text-slate-700">Amount Collected</th>
                      <th className="px-3.5 py-3 text-right font-bold text-slate-700">Principal</th>
                      <th className="px-3.5 py-3 text-right font-bold text-slate-700">Interest</th>
                      <th className="px-3.5 py-3 text-center font-bold text-slate-700">Payment Mode</th>
                      <th className="px-3.5 py-3 text-center font-bold text-slate-700">Installment Ref</th>
                      <th className="px-3.5 py-3 text-left font-bold text-slate-700">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {loanPayments.map((p) => {
                      const { date, time } = formatDateTime(p.date);
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="whitespace-nowrap px-3.5 py-3 font-semibold text-slate-900">
                            {p.id}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3 text-slate-700">
                            <span className="font-semibold text-slate-900">{date}</span>
                            {time && <span className="text-[11px] text-slate-400 ml-1.5 font-normal">{time}</span>}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3 text-right font-bold text-emerald-800">
                            {formatCurrency(p.amount)}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3 text-right text-slate-600 font-medium">
                            {p.principal !== undefined ? formatCurrency(p.principal) : "—"}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3 text-right text-slate-600 font-medium">
                            {p.interest !== undefined ? formatCurrency(p.interest) : "—"}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3 text-center">
                            <span className="inline-flex px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-semibold border border-slate-200">
                              {p.mode || "Cash"}
                            </span>
                            {p.transactionId && (
                              <span className="block text-[10px] text-slate-500 font-mono mt-0.5">
                                Transaction ID: {p.transactionId}
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3 text-center">
                            <span className="text-xs font-semibold text-emerald-800">
                              {p.installmentNumber ? `#${p.installmentNumber}` : "—"}
                            </span>
                          </td>
                          <td className="px-3.5 py-3 text-slate-600 text-xs max-w-xs truncate" title={p.remarks || "—"}>
                            {p.remarks || "EMI Collection"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: INSTALLMENT TIMELINE (ZIGZAG DESIGN) */}
        {activeTab === "installmentTimeline" && (
          <InstallmentTimeline
            schedule={schedule}
            loanPayments={loanPayments}
            effectiveLoanId={effectiveLoanId}
            isLoanCompleted={
              isForeclosed ||
              (schedule.length > 0 &&
                schedule.every((s) => s.status === "Paid" || s.status === "Collected" || (s.balance !== undefined && s.balance <= 0.01)))
            }
          />
        )}

        {/* =========================================================
            COLLECTION HISTORY MODAL (CLICKED FROM REPAYMENT SCHEDULE)
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
                      Installment Collection History
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
                {(() => {
                  const activeInst =
                    schedule.find(
                      (s) => s.installmentNumber === selectedInstallmentForHistory.installmentNumber
                    ) || selectedInstallmentForHistory;

                  const targetNum = Number(selectedInstallmentForHistory.installmentNumber);

                  const matchingCollections = loanPayments.filter((p) => {
                    if (Array.isArray(p.allocations) && p.allocations.length > 0) {
                      return p.allocations.some(
                        (a) => Number(a.installmentNumber) === targetNum && Number(a.allocated || 0) > 0
                      );
                    }
                    if (Array.isArray(p.installmentNumbers)) {
                      return p.installmentNumbers.map(Number).includes(targetNum);
                    }
                    if (p.installmentNumber !== undefined && p.installmentNumber !== null) {
                      const numStr = String(p.installmentNumber);
                      const parts = numStr.split(",").map((s) => Number(s.trim()));
                      return parts.includes(targetNum);
                    }
                    return false;
                  });

                  return (
                    <div className="space-y-4">
                      {/* Installment Summary */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                        <div>
                          <span className="text-slate-500 block">Due Date</span>
                          <span className="font-bold text-slate-800">{formatDate(activeInst.dueDate)}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">{getRepaymentColumnLabel(loan.paymentFrequency || loanRecord?.paymentFrequency)} Due</span>
                          <span className="font-bold text-slate-800">{formatCurrency(activeInst.emi)}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Amount Paid</span>
                          <span className="font-bold text-emerald-800">{formatCurrency(activeInst.amountPaid || 0)}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Balance Remaining</span>
                          <span className="font-bold text-slate-800">{formatCurrency(activeInst.balance !== undefined ? activeInst.balance : Math.max(0, activeInst.emi - (activeInst.amountPaid || 0)))}</span>
                        </div>
                      </div>

                      {matchingCollections.length === 0 ? (
                        <div className="py-8 text-center text-xs text-slate-400">
                          No collections recorded specifically for this installment yet.
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                          <table className="min-w-full divide-y divide-slate-200 text-xs sm:text-sm">
                            <thead className="bg-slate-50/80">
                              <tr>
                                <th className="px-3 py-2.5 text-left font-bold text-slate-700">Receipt ID</th>
                                <th className="px-3 py-2.5 text-left font-bold text-slate-700">Date &amp; Time</th>
                                <th className="px-3 py-2.5 text-right font-bold text-slate-700">Amount</th>
                                <th className="px-3 py-2.5 text-right font-bold text-slate-700">Principal</th>
                                <th className="px-3 py-2.5 text-right font-bold text-slate-700">Interest</th>
                                <th className="px-3 py-2.5 text-center font-bold text-slate-700">Mode</th>
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
                                      <span className="font-semibold text-slate-800">{date}</span>
                                      {time && <span className="text-[11px] text-slate-400 ml-1.5">{time}</span>}
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
                      )}
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

        {/* Midway Closure Modal with preselected current loan */}
        <MidwayClosureModal
          isOpen={showMidwayModal}
          onClose={() => setShowMidwayModal(false)}
          preselectedLoanRecord={loanRecord}
          onSuccess={() => {
            setRefreshKey((k) => k + 1);
          }}
        />
      </div>
    </div>
  );
}
