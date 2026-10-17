import { useState, useMemo, useEffect, useRef } from "react";
import {
  Search,
  Calendar as CalendarIcon,
  CheckCircle2,
  X,
  Wallet,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  CreditCard,
  Banknote,
  Building2,
  Printer,
  Clock,
  ArrowRight,
  User,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  FileText,
  Car,
  IndianRupee,
  Layers,
  Users,
  Hash,
  Percent,
  Coins
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation } from "react-router-dom";
import { generateSchedule, getRepaymentColumnLabel } from "../../components/RepaymentScheduleTable";
import MidwayClosureModal from "../../components/MidwayClosureModal";
import { formatDate, formatDateTime, getLocalDateString, getTransactionTimestamp } from "../../utils/dateUtils";
import {
  getPenaltySettings,
  getPenaltyRecords,
  savePenaltyRecords,
  getOrCalculatePenaltyRecord,
  checkInstallmentPenaltyEligibility,
  getInstallmentPenaltySupportingAmount,
  freezePenaltyRecord,
  unfreezePenaltyRecord,
  cancelPenaltyRecord,
  collectPenaltyRecord,
  collectPenaltyTransaction,
  getLoanPenaltySummary,
} from "../../utils/penaltyRules";

const formatCurrency = (value) => `₹${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;

// Formats installment numbers as '1', '2', '3' or consecutive ranges like '1–10' without '#' or long comma-separated lists
const formatInstallmentDisplay = (txOrAllocations) => {
  if (!txOrAllocations) return "1";

  const numSet = new Set();

  if (Array.isArray(txOrAllocations)) {
    txOrAllocations.forEach((item) => {
      const n = typeof item === "object" ? Number(item.installmentNumber) : Number(item);
      if (!isNaN(n) && n > 0) numSet.add(n);
    });
  } else if (typeof txOrAllocations === "object") {
    const tx = txOrAllocations;
    if (Array.isArray(tx.allocations) && tx.allocations.length > 0) {
      tx.allocations.forEach((a) => {
        const n = Number(a.installmentNumber);
        if (!isNaN(n) && n > 0) numSet.add(n);
      });
    }
    if (Array.isArray(tx.installmentNumbers) && tx.installmentNumbers.length > 0) {
      tx.installmentNumbers.forEach((item) => {
        const n = Number(item);
        if (!isNaN(n) && n > 0) numSet.add(n);
      });
    }
    if (numSet.size === 0 && tx.installmentNumber !== undefined && tx.installmentNumber !== null) {
      const str = String(tx.installmentNumber).replace(/#/g, "");
      const nums = str.match(/\d+/g);
      if (nums) {
        nums.forEach((m) => {
          const parsed = Number(m);
          if (!isNaN(parsed) && parsed > 0) numSet.add(parsed);
        });
      }
    }
  } else {
    const str = String(txOrAllocations).replace(/#/g, "");
    const nums = str.match(/\d+/g);
    if (nums) {
      nums.forEach((m) => {
        const parsed = Number(m);
        if (!isNaN(parsed) && parsed > 0) numSet.add(parsed);
      });
    }
  }

  if (numSet.size === 0) return "1";

  const sorted = Array.from(numSet).sort((a, b) => a - b);
  const ranges = [];
  let start = sorted[0];
  let end = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push(start === end ? `${start}` : `${start}–${end}`);
      start = sorted[i];
      end = sorted[i];
    }
  }
  ranges.push(start === end ? `${start}` : `${start}–${end}`);

  return ranges.join(", ");
};

// Helper: Calculate if a date is today, past, or future relative to reference date (timezone-safe)
const getDayDiff = (targetDateStr, referenceDateStr) => {
  if (!targetDateStr) return 0;
  const ref = new Date(referenceDateStr);
  ref.setHours(0, 0, 0, 0);

  let target;
  if (typeof targetDateStr === "string" && /^\d{4}-\d{2}-\d{2}$/.test(targetDateStr)) {
    const [y, m, d] = targetDateStr.split("-").map(Number);
    target = new Date(y, m - 1, d);
  } else {
    target = new Date(targetDateStr);
  }
  target.setHours(0, 0, 0, 0);

  return Math.round((target.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24));
};

// Helper to compute start & end timestamp boundaries (00:00:00 to 23:59:59) for history date presets in local timezone
const getDateRangeBoundaries = (filterType, customStart, customEnd) => {
  const now = new Date();
  const todayStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  const todayEndMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

  if (filterType === "Today") {
    return { startMs: todayStartMs, endMs: todayEndMs };
  }
  if (filterType === "Yesterday") {
    const yestStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0).getTime();
    const yestEndMs = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999).getTime();
    return { startMs: yestStartMs, endMs: yestEndMs };
  }
  if (filterType === "This Week") {
    // Current week starting from Monday
    const day = now.getDay();
    const diffToMonday = now.getDate() - day + (day === 0 ? -6 : 1);
    const mondayStartMs = new Date(now.getFullYear(), now.getMonth(), diffToMonday, 0, 0, 0, 0).getTime();
    return { startMs: mondayStartMs, endMs: todayEndMs };
  }
  if (filterType === "This Month") {
    const monthStartMs = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();
    return { startMs: monthStartMs, endMs: todayEndMs };
  }
  if (filterType === "Custom") {
    const sDate = customStart ? getLocalDateString(customStart) : getLocalDateString(now);
    const eDate = customEnd ? getLocalDateString(customEnd) : getLocalDateString(now);
    const [sy, sm, sd] = (sDate || getLocalDateString(now)).split("-").map(Number);
    const [ey, em, ed] = (eDate || getLocalDateString(now)).split("-").map(Number);
    const sMs = new Date(sy, sm - 1, sd, 0, 0, 0, 0).getTime();
    const eMs = new Date(ey, em - 1, ed, 23, 59, 59, 999).getTime();
    return { startMs: sMs, endMs: eMs };
  }
  return { startMs: todayStartMs, endMs: todayEndMs };
};

const SummaryCard = ({ icon: Icon, title, value, subtext, accentClass, className = "" }) => (
  <div className={`rounded-xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-2xs hover:shadow-xs transition-shadow duration-200 min-w-0 w-full h-full flex flex-col justify-center ${className}`}>
    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
      <div className={`flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl ${accentClass}`}>
        <Icon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs sm:text-sm font-semibold text-slate-500 leading-snug truncate">{title}</p>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mt-0.5 sm:mt-1 min-w-0">
          <p className="text-base sm:text-lg lg:text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap leading-tight">
            {value}
          </p>
          {subtext && (
            <span className="text-xs font-medium text-slate-500 shrink-0 whitespace-nowrap">
              {subtext}
            </span>
          )}
        </div>
      </div>
    </div>
  </div>
);

const Collection = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("Today"); // "Today", "Overdue", or "History"
  const [overdueFilter, setOverdueFilter] = useState("All"); // "All", "1", "2", "3+"
  const [search, setSearch] = useState("");
  const [date, setDate] = useState(getLocalDateString(new Date()));

  // Collection History filter and pagination states
  const [historyDateFilter, setHistoryDateFilter] = useState("Today"); // "Today", "Yesterday", "This Week", "This Month", "Custom"
  const [historyCustomStart, setHistoryCustomStart] = useState(getLocalDateString(new Date()));
  const [historyCustomEnd, setHistoryCustomEnd] = useState(getLocalDateString(new Date()));
  const [historyPage, setHistoryPage] = useState(1);
  const [selectedHistoryTx, setSelectedHistoryTx] = useState(null);

  const [customers, setCustomers] = useState([]);
  const [paymentHistoryList, setPaymentHistoryList] = useState([]);

  // Collect Payment Modal states
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [collectAmount, setCollectAmount] = useState("");
  const [pendingPenaltyRecord, setPendingPenaltyRecord] = useState(null);
  const [pendingPenaltyRecordsList, setPendingPenaltyRecordsList] = useState([]);
  const [isPenaltyOnlyMode, setIsPenaltyOnlyMode] = useState(false);
  const [penaltyAmountInput, setPenaltyAmountInput] = useState("");
  const [paymentDate, setPaymentDate] = useState(getLocalDateString(new Date()));
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [transactionId, setTransactionId] = useState("");
  const [remarks, setRemarks] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [schedulePage, setSchedulePage] = useState(1);
  const submittingRef = useRef(false);

  // Collection Details Modal state (Shared between Today and Overdue)
  const [detailsCustomer, setDetailsCustomer] = useState(null);

  // View Schedule Modal state
  const [scheduleModalCustomer, setScheduleModalCustomer] = useState(null);

  // Amount Collected Successfully Modal state
  const [confirmedTransaction, setConfirmedTransaction] = useState(null);

  // Midway Closure Modal state
  const [showMidwayModal, setShowMidwayModal] = useState(false);

  // Load customer and payment history data
  const loadCustomers = () => {
    try {
      const list = JSON.parse(localStorage.getItem("motoLendCustomersList_data") || "[]");
      setCustomers(list);
    } catch {
      setCustomers([]);
    }
  };

  const loadPaymentHistory = () => {
    try {
      const hist = JSON.parse(localStorage.getItem("motoLendPaymentHistory") || "[]");
      setPaymentHistoryList(hist);
    } catch {
      setPaymentHistoryList([]);
    }
  };

  useEffect(() => {
    loadCustomers();
    loadPaymentHistory();
    const handleStorageChange = () => {
      loadCustomers();
      loadPaymentHistory();
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  // Lock background body scroll when any modal is open, and restore when closed
  useEffect(() => {
    if (selectedCustomer || confirmedTransaction || detailsCustomer || scheduleModalCustomer || selectedHistoryTx || showMidwayModal) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [selectedCustomer, confirmedTransaction, detailsCustomer, scheduleModalCustomer, selectedHistoryTx, showMidwayModal]);

  // Compute processed customer loans and schedules across all records
  const allProcessedCustomers = useMemo(() => {
    return customers.map((c, index) => {
      let schedule = c.repaymentSchedule;
      if (!schedule || schedule.length === 0) {
        const P = Number(c.loanAmount || (Number(c.loan?.vehicleAmount) - Number(c.loan?.downPayment || 0)) || 0);
        if (P > 0 && c.loan?.interestRate && c.loan?.tenure) {
          schedule = generateSchedule({
            loanAmount: P,
            interestRate: c.loan.interestRate,
            tenure: c.loan.tenure,
            tenureUnit: c.loan.tenureUnit || "Months",
            paymentFrequency: c.loan.paymentFrequency || c.paymentFrequency || "Monthly",
            interestType: c.loan.interestType || "Reducing Balance",
            repaymentMethod: c.loan.repaymentMethod || "EMI",
            firstDueDate: c.loan.firstDueDate || c.nextDueDate,
          });
        } else {
          schedule = [];
        }
      }

      // Check installments
      const overdueInstalls = schedule.filter(
        (s) => s.status !== "Collected" && s.status !== "Paid" && s.emi - (s.amountPaid || 0) > 0.01 && getDayDiff(s.dueDate, date) < 0
      );
      const todayInstalls = schedule.filter(
        (s) => s.status !== "Collected" && s.status !== "Paid" && s.emi - (s.amountPaid || 0) > 0.01 && getDayDiff(s.dueDate, date) === 0
      );
      const allUnpaidInstalls = schedule.filter(
        (s) => s.status !== "Collected" && s.status !== "Paid" && s.emi - (s.amountPaid || 0) > 0.01
      );

      const isDueToday = todayInstalls.length > 0;
      const isOverdue = overdueInstalls.length > 0;

      const totalDueToday = todayInstalls.reduce((sum, s) => sum + Math.max(0, s.emi - (s.amountPaid || 0)), 0);
      const totalOverdue = overdueInstalls.reduce((sum, s) => sum + Math.max(0, s.emi - (s.amountPaid || 0)), 0);
      const totalUnpaidInstallmentAmount = allUnpaidInstalls.reduce(
        (sum, s) => sum + Math.max(0, s.emi - (s.amountPaid || 0)),
        0
      );

      const originalDueToday = todayInstalls.reduce((sum, s) => sum + s.emi, 0);
      const originalOverdue = overdueInstalls.reduce((sum, s) => sum + s.emi, 0);

      const activeInstalls = [...overdueInstalls, ...todayInstalls];
      let statusText = "Pending";

      if (activeInstalls.length > 0) {
        const allCollected = activeInstalls.every((s) => s.status === "Collected" || s.status === "Paid" || (s.amountPaid || 0) >= s.emi);
        const anyPartial = activeInstalls.some(
          (s) => s.status === "Partial" || ((s.amountPaid || 0) > 0 && (s.amountPaid || 0) < s.emi)
        );

        if (allCollected) {
          statusText = "Collected";
        } else if (anyPartial) {
          statusText = "Partial";
        }
      } else if (allUnpaidInstalls.length === 0 && schedule.length > 0) {
        statusText = "Collected";
      }

      const customerId =
        c.customerId ||
        c.customer?.customerId ||
        (c.customer?.mobile && c.customer.mobile.trim().length >= 5 && !/^0+$/.test(c.customer.mobile.trim().slice(-5))
          ? `CUS-${c.customer.mobile.trim().slice(-5)}`
          : `CUS-${String(index + 1).padStart(3, "0")}`);

      const loanId = c.loanId || c.loan?.loanId || `LN-${String(index + 1).padStart(3, "0")}`;

      // Check for Penalties belonging to this loan using comprehensive summary
      const penaltySummary = getLoanPenaltySummary(
        loanId,
        customerId,
        c.customer?.name,
        schedule,
        c.paymentFrequency || c.loan?.paymentFrequency || "Monthly",
        date ? new Date(date) : new Date()
      );

      const hasFrozenPenalty = penaltySummary.frozenPenalties.length > 0;
      const totalFrozenPenaltyAmount = penaltySummary.totalFrozenPenalty;
      const hasPendingPenalty = penaltySummary.pendingPenalties.length > 0;
      const totalPendingPenaltyAmount = penaltySummary.totalPendingPenalty;

      // Dedicated Penalty status:
      // If loan has a frozen penalty and no regular overdue installments (or active collection is 0)
      if (hasFrozenPenalty && overdueInstalls.length === 0 && todayInstalls.length === 0) {
        statusText = "Penalty";
      } else if (hasPendingPenalty && overdueInstalls.length === 0 && todayInstalls.length === 0) {
        statusText = "Pending Penalty";
      }

      return {
        ...c,
        customerId,
        loanId,
        isDueToday,
        isOverdue,
        overdueCount: overdueInstalls.length,
        totalDueToday,
        totalOverdue,
        totalUnpaidInstallmentAmount,
        originalDueToday,
        originalOverdue,
        currentTotalDue: totalDueToday + totalOverdue,
        statusText,
        hasFrozenPenalty,
        totalFrozenPenaltyAmount,
        frozenPenalties: penaltySummary.frozenPenalties,
        hasPendingPenalty,
        totalPendingPenaltyAmount,
        pendingPenalties: penaltySummary.pendingPenalties,
        penaltySummary,
        overdueInstalls,
        todayInstalls,
        allUnpaidInstalls,
        fullSchedule: schedule,
      };
    });
  }, [customers, date]);

  const processedCustomers = useMemo(() => {
    return allProcessedCustomers.filter((c) => c.isDueToday || c.isOverdue || c.hasFrozenPenalty || c.hasPendingPenalty);
  }, [allProcessedCustomers]);

  const todayList = useMemo(() => allProcessedCustomers.filter((c) => c.isDueToday), [allProcessedCustomers]);
  const overdueList = useMemo(
    () => allProcessedCustomers.filter((c) => c.isOverdue || c.hasFrozenPenalty || c.hasPendingPenalty),
    [allProcessedCustomers]
  );

  // Search and Filter:
  // When a search term is entered, search dynamically across ALL customer and loan records
  // by customer name, customer ID, or loan ID (including customers with multiple loans).
  const getFilteredList = (list) => {
    const baseList = search.trim() ? allProcessedCustomers : list;

    return baseList.filter((c) => {
      if (!search.trim() && activeTab === "Overdue" && overdueFilter !== "All") {
        if (overdueFilter === "1" && c.overdueCount !== 1) return false;
        if (overdueFilter === "2" && c.overdueCount !== 2) return false;
        if (overdueFilter === "3+" && c.overdueCount < 3) return false;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const name = (c.customer?.name || "").toLowerCase();
        const customerId = (c.customerId || c.customer?.customerId || "").toLowerCase();
        const loanId = (c.loanId || c.loan?.loanId || "").toLowerCase();
        const vehicle = (c.vehicle?.regNo || "").toLowerCase();
        if (
          !name.includes(q) &&
          !customerId.includes(q) &&
          !loanId.includes(q) &&
          !vehicle.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  };

  const currentDisplayList = getFilteredList(activeTab === "Today" ? todayList : overdueList);

  // Date range boundaries for Collection History
  const historyDateRange = useMemo(() => {
    return getDateRangeBoundaries(historyDateFilter, historyCustomStart, historyCustomEnd);
  }, [historyDateFilter, historyCustomStart, historyCustomEnd]);

  // Validate custom date range
  const isCustomRangeInvalid = useMemo(() => {
    if (historyDateFilter !== "Custom") return false;
    return historyCustomStart && historyCustomEnd && historyCustomStart > historyCustomEnd;
  }, [historyDateFilter, historyCustomStart, historyCustomEnd]);

  // Authoritative collection transactions for Collection History and KPI calculations
  // Excludes failed/cancelled/reversed and ensures valid amounts
  const collectionTransactions = useMemo(() => {
    return (paymentHistoryList || []).filter((p) => {
      if (!p) return false;
      const status = (p.status || "").toLowerCase();
      if (status === "failed" || status === "cancelled" || status === "reversed") return false;
      return true;
    });
  }, [paymentHistoryList]);

  // Filtered transactions for the selected date range in Collection History
  const dateRangeFilteredTransactions = useMemo(() => {
    if (isCustomRangeInvalid) return [];
    const { startMs, endMs } = historyDateRange;

    return collectionTransactions.filter((p) => {
      if (!p || !p.date) return false;
      const ts = getTransactionTimestamp(p.date);
      if (isNaN(ts)) {
        // Fallback to local date string matching
        const txDateStr = getLocalDateString(p.date);
        const sStr = getLocalDateString(new Date(startMs));
        const eStr = getLocalDateString(new Date(endMs));
        return txDateStr >= sStr && txDateStr <= eStr;
      }
      return ts >= startMs && ts <= endMs;
    });
  }, [collectionTransactions, historyDateRange, isCustomRangeInvalid]);

  // Collection History Search & Date Filtered List
  const filteredHistoryList = useMemo(() => {
    let list = dateRangeFilteredTransactions;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => {
        const name = (p.customerName || "").toLowerCase();
        const loanId = (p.loanId || "").toLowerCase();
        const custId = (p.customerId || "").toLowerCase();
        const mode = (p.mode || "").toLowerCase();
        const txId = (p.transactionId || p.transactionRef || p.id || "").toLowerCase();
        const instRef = String(p.installmentNumber || "").toLowerCase();
        return (
          name.includes(q) ||
          loanId.includes(q) ||
          custId.includes(q) ||
          mode.includes(q) ||
          txId.includes(q) ||
          instRef.includes(q)
        );
      });
    }

    // Sort newest first by collection date & time
    return [...list].sort((a, b) => {
      const tsB = getTransactionTimestamp(b.date) || 0;
      const tsA = getTransactionTimestamp(a.date) || 0;
      return tsB - tsA;
    });
  }, [dateRangeFilteredTransactions, search]);

  // KPI Calculations for Today Collection & Overdue Collections sections:
  // - Today's Due: Total amount due for today's scheduled instalments
  // - Overdue: Total unpaid overdue amount
  // - Collected Today: Total amount actually collected today (current local day)
  const todayDueKPI = useMemo(() => {
    return todayList.reduce((sum, c) => sum + (c.totalDueToday || 0), 0);
  }, [todayList]);

  const overdueKPI = useMemo(() => {
    return overdueList.reduce((sum, c) => sum + (c.totalOverdue || 0), 0);
  }, [overdueList]);

  const { collectedTodayAmount, collectedTodayCount } = useMemo(() => {
    const now = new Date();
    const todayStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
    const todayEndMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

    const txsToday = collectionTransactions.filter((p) => {
      if (!p || !p.date) return false;
      const ts = getTransactionTimestamp(p.date);
      if (isNaN(ts)) {
        return getLocalDateString(p.date) === getLocalDateString(now);
      }
      return ts >= todayStartMs && ts <= todayEndMs;
    });
    const total = txsToday.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    return { collectedTodayAmount: total, collectedTodayCount: txsToday.length };
  }, [collectionTransactions]);

  // Three Collection History KPIs calculated strictly from the filtered dataset (date filter + search)
  // 1. Total Collection — Total amount collected in the filtered history records
  // 2. Principal Collected — Principal portion actually received in those records
  // 3. Interest Collected — Interest portion actually received in those records
  const totalCollectionKPI = useMemo(() => {
    return filteredHistoryList.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  }, [filteredHistoryList]);

  const principalCollectedKPI = useMemo(() => {
    return filteredHistoryList.reduce((sum, p) => {
      if (p.principal !== undefined && p.principal !== null) {
        return sum + Number(p.principal || 0);
      }
      if (Array.isArray(p.allocations) && p.allocations.length > 0) {
        const sumAllocPrin = p.allocations.reduce(
          (s, a) => s + Number(a.principalPaid || Math.max(0, Number(a.allocated || 0) - Number(a.interestPaid || 0))),
          0
        );
        return sum + sumAllocPrin;
      }
      return sum + Number(p.amount || 0);
    }, 0);
  }, [filteredHistoryList]);

  const interestCollectedKPI = useMemo(() => {
    return filteredHistoryList.reduce((sum, p) => {
      if (p.interest !== undefined && p.interest !== null) {
        return sum + Number(p.interest || 0);
      }
      if (Array.isArray(p.allocations) && p.allocations.length > 0) {
        const sumAllocInt = p.allocations.reduce((s, a) => s + Number(a.interestPaid || 0), 0);
        return sum + sumAllocInt;
      }
      return sum;
    }, 0);
  }, [filteredHistoryList]);

  // Pagination for Collection History (Exactly 5 items per page)
  const historyPageSize = 5;
  const historyTotalPages = Math.max(1, Math.ceil(filteredHistoryList.length / historyPageSize));
  const currentHistoryPage = Math.min(Math.max(1, historyPage), historyTotalPages);
  const paginatedHistoryList = useMemo(() => {
    const start = (currentHistoryPage - 1) * historyPageSize;
    return filteredHistoryList.slice(start, start + historyPageSize);
  }, [filteredHistoryList, currentHistoryPage, historyPageSize]);

  const handleCollectClick = (c, penaltyOnly = false) => {
    setSelectedCustomer(c);
    setIsPenaltyOnlyMode(penaltyOnly);

    // In penalty-only mode, initialAmount is strictly 0 (no principal/interest)
    const initialAmount = penaltyOnly
      ? "0"
      : c.currentTotalDue > 0
        ? c.currentTotalDue
        : (c.totalUnpaidInstallmentAmount || "");
    setCollectAmount(String(initialAmount || ""));
    setPaymentDate(date);
    setPaymentMode("Cash");
    setTransactionId("");
    setRemarks("");
    setSchedulePage(1);
    setIsSubmitting(false);

    try {
      const loanId = c.loanId || c.loan?.loanId;
      const custId = c.customerId || c.customer?.customerId || "";
      const custName = c.customer?.name || c.name || "Customer";
      const schedule = c.fullSchedule || c.repaymentSchedule || [];
      const normFreq = c.paymentFrequency || c.loan?.paymentFrequency || "Monthly";

      // Use comprehensive summary to get pending and frozen penalties
      const summary = getLoanPenaltySummary(
        loanId,
        custId,
        custName,
        schedule,
        normFreq,
        date ? new Date(date) : new Date()
      );

      const existingFrozen = summary.frozenPenalties[0] || null;

      if (penaltyOnly) {
        // Penalty-only mode: Target eligible pending penalties across all eligible unpaid installments
        if (summary.pendingPenalties.length > 0) {
          setPendingPenaltyRecordsList(summary.pendingPenalties);
          setPendingPenaltyRecord(summary.pendingPenalties[0]);
          setPenaltyAmountInput(String(summary.totalPendingPenalty));
        } else if (existingFrozen) {
          setPendingPenaltyRecordsList(summary.frozenPenalties);
          setPendingPenaltyRecord(existingFrozen);
          setPenaltyAmountInput(String(summary.totalFrozenPenalty));
        } else {
          setPendingPenaltyRecordsList([]);
          setPendingPenaltyRecord(null);
          setPenaltyAmountInput("");
        }
      } else {
        // Normal installment collection mode
        if (existingFrozen) {
          // Keep frozen penalty visible in modal as Frozen, but NEVER auto-collect or merge it!
          setPendingPenaltyRecordsList(summary.frozenPenalties);
          setPendingPenaltyRecord(existingFrozen);
          setPenaltyAmountInput(String(summary.totalFrozenPenalty));
        } else if (summary.pendingPenalties.length > 0) {
          // Accumulate across all eligible unpaid installments (FIX 3)
          setPendingPenaltyRecordsList(summary.pendingPenalties);
          setPendingPenaltyRecord(summary.pendingPenalties[0]);
          setPenaltyAmountInput(String(summary.totalPendingPenalty));
        } else {
          setPendingPenaltyRecordsList([]);
          setPendingPenaltyRecord(null);
          setPenaltyAmountInput("");
        }
      }
    } catch (err) {
      console.error("Error checking loan penalties:", err);
      setPendingPenaltyRecordsList([]);
      setPendingPenaltyRecord(null);
      setPenaltyAmountInput("");
    }
  };

  const location = useLocation();
  const handledCollectLoanIdRef = useRef(null);

  // Auto-open Collect Payment modal when navigated with ?collectLoanId=...
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const collectLoanId = params.get("collectLoanId");
    if (collectLoanId && allProcessedCustomers.length > 0 && handledCollectLoanIdRef.current !== collectLoanId) {
      const target = allProcessedCustomers.find(
        (c) => c.loanId && c.loanId.trim().toLowerCase() === collectLoanId.trim().toLowerCase()
      );
      if (target) {
        handledCollectLoanIdRef.current = collectLoanId;
        handleCollectClick(target);
      }
    }
  }, [location.search, allProcessedCustomers]);

  const handleUnfreezeLoanPenalties = (c) => {
    const loanId = c.loanId || c.loan?.loanId;
    if (!loanId) return;
    const allRecords = getPenaltyRecords();
    const frozenList = allRecords.filter((r) => r.loanId === loanId && r.status === "Frozen");
    frozenList.forEach((r) => {
      unfreezePenaltyRecord(r);
    });
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("storage"));
    }
  };

  const handleUnfreezeModalPenalty = () => {
    if (!pendingPenaltyRecord) return;
    const recordsToUnfreeze = pendingPenaltyRecordsList.length > 0 ? pendingPenaltyRecordsList : [pendingPenaltyRecord];
    const unfrozenList = [];
    recordsToUnfreeze.forEach((rec) => {
      const u = unfreezePenaltyRecord(rec);
      if (u) unfrozenList.push(u);
    });

    if (unfrozenList.length > 0) {
      setPendingPenaltyRecordsList(unfrozenList);
      setPendingPenaltyRecord(unfrozenList[0]);
      const totalUnfrozen = unfrozenList.reduce((sum, r) => sum + Number(r.calculatedAmount || 0), 0);
      setPenaltyAmountInput(String(totalUnfrozen));
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("storage"));
      }
    }
  };

  const handleFreezePenalty = () => {
    if (!pendingPenaltyRecord) return;
    const recordsToFreeze = pendingPenaltyRecordsList.length > 0 ? pendingPenaltyRecordsList : [pendingPenaltyRecord];
    const frozenList = [];
    recordsToFreeze.forEach((rec) => {
      const f = freezePenaltyRecord(rec, rec.calculatedAmount);
      if (f) frozenList.push(f);
    });

    if (frozenList.length > 0) {
      setPendingPenaltyRecordsList(frozenList);
      setPendingPenaltyRecord(frozenList[0]);
      const totalFrozen = frozenList.reduce((sum, r) => sum + Number(r.calculatedAmount || 0), 0);
      setPenaltyAmountInput(String(totalFrozen));
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("storage"));
      }
    }
  };

  const handleCancelPenalty = () => {
    if (!pendingPenaltyRecord) return;
    const recordsToCancel = pendingPenaltyRecordsList.length > 0 ? pendingPenaltyRecordsList : [pendingPenaltyRecord];
    recordsToCancel.forEach((rec) => {
      cancelPenaltyRecord(rec, "Cancelled via Collect Payment popup");
    });
    setPendingPenaltyRecord(null);
    setPendingPenaltyRecordsList([]);
    setPenaltyAmountInput("0");
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("storage"));
    }
  };

  const handleCollectPenaltyOnly = () => {
    if (!pendingPenaltyRecord || !selectedCustomer) return;
    const amtToCollect = Number(pendingPenaltyRecord.calculatedAmount || penaltyAmountInput || 0);
    if (amtToCollect <= 0) return;

    const now = new Date();
    const finalDateTimeStr = paymentDate ? new Date(paymentDate).toISOString() : now.toISOString();
    const txnRef = transactionId && transactionId.trim() !== "" ? transactionId.trim() : `TX-PEN-${now.getTime()}`;

    const collected = collectPenaltyRecord(pendingPenaltyRecord, {
      amount: amtToCollect,
      collectionDate: finalDateTimeStr,
      paymentMode,
      transactionRef: txnRef,
      customerId: selectedCustomer.customerId,
      customerName: selectedCustomer.customer?.name || "Customer",
      loanId: selectedCustomer.loanId,
    });

    if (collected) {
      setConfirmedTransaction({
        isPenaltyOnly: true,
        amount: amtToCollect,
        customerName: selectedCustomer.customer?.name || "Customer",
        customerId: selectedCustomer.customerId,
        loanId: selectedCustomer.loanId,
        installmentNumber: pendingPenaltyRecord.installmentNumber,
        date: finalDateTimeStr,
        mode: paymentMode,
        transactionId: txnRef,
        totalPrincipalOutstanding: selectedCustomer.totalPrincipalOutstanding || 0,
        totalInterestOutstanding: selectedCustomer.totalInterestOutstanding || 0,
        totalLoanOutstanding: selectedCustomer.totalLoanOutstanding || 0,
      });

      setSelectedCustomer(null);
      setPendingPenaltyRecord(null);
      setPenaltyAmountInput("");
      window.dispatchEvent(new Event("storage"));
    }
  };

  // Live Payment Allocation Preview computation for selected customer
  const allocationPreview = useMemo(() => {
    if (!selectedCustomer || !collectAmount || isNaN(Number(collectAmount)) || Number(collectAmount) <= 0) {
      return { allocations: [], unappliedAdvance: 0, paymentType: "NONE" };
    }

    const amt = Number(collectAmount);
    let remainingToAllocate = amt;
    const allocations = [];

    // Sort full schedule chronologically by installment number
    const sortedSchedule = [...selectedCustomer.fullSchedule].sort(
      (a, b) => a.installmentNumber - b.installmentNumber
    );

    for (const s of sortedSchedule) {
      if (remainingToAllocate <= 0.001) break;
      const due = Math.max(0, s.emi - (s.amountPaid || 0));
      if (due <= 0.001) continue;

      const alloc = Math.min(due, remainingToAllocate);
      remainingToAllocate -= alloc;

      // Internal interest-first allocation
      const interestDue = Math.max(0, s.interest - (s.interestPaid || 0));
      const intAlloc = Math.min(interestDue, alloc);
      const prinAlloc = alloc - intAlloc;

      const newAmountPaid = (s.amountPaid || 0) + alloc;
      const newBalance = Math.max(0, s.emi - newAmountPaid);
      const statusAfter = newBalance <= 0.01 ? "Paid" : "Partial";

      const diff = getDayDiff(s.dueDate, date);
      const isAdvance = diff > 0;

      allocations.push({
        installmentNumber: s.installmentNumber,
        dueDate: s.dueDate,
        allocated: alloc,
        interestPaid: intAlloc,
        principalPaid: prinAlloc,
        balanceAfter: newBalance,
        statusAfter,
        isAdvance,
      });
    }

    const unappliedAdvance = remainingToAllocate > 0.001 ? remainingToAllocate : 0;
    const currentDue = selectedCustomer.currentTotalDue || 0;

    let paymentType = "PARTIAL";
    if (Math.abs(amt - currentDue) < 0.01) {
      paymentType = "FULL";
    } else if (amt > currentDue) {
      paymentType = "EXCESS";
    }

    return { allocations, unappliedAdvance, paymentType };
  }, [selectedCustomer, collectAmount, date]);

  // Handle Confirm Payment Submission
  const handleConfirmPayment = () => {
    if (submittingRef.current || isSubmitting) return;

    if (isPenaltyOnlyMode) {
      const penaltyAmt = Number(penaltyAmountInput || 0);
      if (penaltyAmt <= 0) {
        alert("Please enter a valid penalty amount greater than 0.");
        return;
      }
    } else {
      if (!collectAmount || isNaN(collectAmount) || Number(collectAmount) <= 0) {
        alert("Please enter a valid payment amount greater than 0.");
        return;
      }
    }

    if (!selectedCustomer) return;

    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      // Handle Penalty-Only Collection Mode (FIX 2)
      if (isPenaltyOnlyMode) {
        const now = new Date();
        let finalDateTimeStr = now.toISOString();
        if (paymentDate) {
          const isPlainDate = /^\d{4}-\d{2}-\d{2}$/.test(paymentDate.trim());
          if (isPlainDate) {
            const [y, m, d] = paymentDate.trim().split("-").map(Number);
            const customDt = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
            finalDateTimeStr = customDt.toISOString();
          } else {
            finalDateTimeStr = paymentDate;
          }
        }
        const txnRef = transactionId && transactionId.trim() !== "" ? transactionId.trim() : `TX-PEN-${now.getTime()}`;

        const recordsToCollect = pendingPenaltyRecordsList.length > 0
          ? pendingPenaltyRecordsList.filter((r) => r.status === "Pending")
          : (pendingPenaltyRecord && pendingPenaltyRecord.status === "Pending" ? [pendingPenaltyRecord] : []);

        const totalEntered = Number(penaltyAmountInput || 0);

        const result = collectPenaltyTransaction({
          loanId: selectedCustomer.loanId,
          customerId: selectedCustomer.customerId,
          customerName: selectedCustomer.customer?.name || "Customer",
          records: recordsToCollect,
          collectedAmount: totalEntered,
          collectionDate: finalDateTimeStr,
          paymentMode,
          transactionRef: txnRef,
        });

        const accumulatedCollected = result?.transaction?.collectedAmount || totalEntered;
        const instDisplay = result?.transaction?.installmentDisplay || (recordsToCollect.length === 1
          ? String(recordsToCollect[0].installmentNumber)
          : (recordsToCollect.map((r) => r.installmentNumber).join(", ") || "1"));

        // Set confirmed transaction popup for penalty-only
        setConfirmedTransaction({
          isPenaltyOnly: true,
          amount: accumulatedCollected,
          customerName: selectedCustomer.customer?.name || "Customer",
          customerId: selectedCustomer.customerId,
          loanId: selectedCustomer.loanId,
          installmentNumber: instDisplay,
          date: finalDateTimeStr,
          mode: paymentMode,
          transactionId: txnRef,
          totalPrincipalOutstanding: selectedCustomer.totalPrincipalOutstanding || 0,
          totalInterestOutstanding: selectedCustomer.totalInterestOutstanding || 0,
          totalLoanOutstanding: selectedCustomer.totalLoanOutstanding || 0,
        });

        setSelectedCustomer(null);
        setPendingPenaltyRecord(null);
        setPendingPenaltyRecordsList([]);
        setPenaltyAmountInput("");
        setIsPenaltyOnlyMode(false);
        setIsSubmitting(false);
        submittingRef.current = false;
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("storage"));
        }
        return;
      }

      const amt = Number(collectAmount);
      let remainingToAllocate = amt;
      let totalPrincipalRecovered = 0;
      let totalInterestEarned = 0;
      const appliedAllocations = [];

      // Sort entire schedule chronologically to guarantee oldest unpaid first
      const schedule = selectedCustomer.fullSchedule.map((s) => ({ ...s }));
      schedule.sort((a, b) => a.installmentNumber - b.installmentNumber);

      for (let i = 0; i < schedule.length; i++) {
        const s = schedule[i];
        if (remainingToAllocate <= 0.001) break;

        const due = Math.max(0, s.emi - (s.amountPaid || 0));
        if (due <= 0.001) continue;

        const alloc = Math.min(due, remainingToAllocate);
        remainingToAllocate -= alloc;

        // Interest first, then principal
        const interestDue = Math.max(0, s.interest - (s.interestPaid || 0));
        const intAlloc = Math.min(interestDue, alloc);
        const prinAlloc = alloc - intAlloc;

        totalInterestEarned += intAlloc;
        totalPrincipalRecovered += prinAlloc;

        const priorAmountPaid = s.amountPaid || 0;
        const newAmountPaid = priorAmountPaid + alloc;
        const newPrincipalPaid = (s.principalPaid || 0) + prinAlloc;
        const newInterestPaid = (s.interestPaid || 0) + intAlloc;
        const newBalance = Math.max(0, s.emi - newAmountPaid);
        const statusAfter = newBalance <= 0.01 ? "Paid" : "Partial";

        s.amountPaid = newAmountPaid;
        s.principalPaid = newPrincipalPaid;
        s.interestPaid = newInterestPaid;
        s.balance = newBalance;
        s.status = statusAfter;

        appliedAllocations.push({
          installmentNumber: s.installmentNumber,
          dueDate: s.dueDate,
          scheduledEmi: s.emi,
          previousAmountPaid: priorAmountPaid,
          previousRemainingDue: due,
          allocated: alloc,
          interestPaid: intAlloc,
          principalPaid: prinAlloc,
          balanceAfter: newBalance,
          statusAfter,
        });
      }

      // Any excess beyond all installments is customer advance
      const unappliedAdvance = remainingToAllocate > 0.001 ? remainingToAllocate : 0;

      // Recalculate loan-level outstanding across ALL installments of the loan
      const totalPrincipalOutstanding = Math.max(
        0,
        schedule.reduce((sum, s) => sum + Math.max(0, s.principal - (s.principalPaid || 0)), 0) - unappliedAdvance
      );
      const totalInterestOutstanding = schedule.reduce(
        (sum, s) => sum + Math.max(0, s.interest - (s.interestPaid || 0)),
        0
      );
      const totalLoanOutstanding = totalPrincipalOutstanding + totalInterestOutstanding;

      // Determine next due date and loan closure status
      let nextDueDate = "Completed";
      let loanStatus = "Closed";
      const nextUnpaid = schedule.find((s) => s.emi - (s.amountPaid || 0) > 0.01);
      if (nextUnpaid) {
        nextDueDate = nextUnpaid.dueDate;
        loanStatus = "Active";
      }

      // 1. Clean customer record and update schedule & balances
      const {
        fullSchedule,
        overdueInstalls,
        todayInstalls,
        allUnpaidInstalls,
        isDueToday,
        isOverdue,
        overdueCount,
        totalDueToday,
        totalOverdue,
        totalUnpaidInstallmentAmount,
        originalDueToday,
        originalOverdue,
        currentTotalDue,
        statusText,
        ...cleanCustomer
      } = selectedCustomer;

      let vehicleStatus = selectedCustomer.vehicleStatus || selectedCustomer.vehicle?.status || "Active";
      if (loanStatus === "Closed") {
        if (vehicleStatus.toLowerCase() !== "seized" && vehicleStatus.toLowerCase() !== "sold") {
          vehicleStatus = "Inactive";
        }
      }

      const updatedCustomer = {
        ...cleanCustomer,
        repaymentSchedule: schedule,
        outstandingAmount: totalLoanOutstanding,
        totalPrincipalOutstanding,
        totalInterestOutstanding,
        totalLoanOutstanding,
        advanceBalance: (selectedCustomer.advanceBalance || 0) + unappliedAdvance,
        status: loanStatus,
        loanStatus: loanStatus,
        nextDueDate: nextDueDate,
        vehicleStatus: vehicleStatus,
        vehicle: {
          ...(cleanCustomer.vehicle || {}),
          status: vehicleStatus,
        },
      };

      const existingCustomers = JSON.parse(localStorage.getItem("motoLendCustomersList_data") || "[]");
      const updatedCustomersList = existingCustomers.map((c) =>
        (c.loanId && c.loanId.trim().toLowerCase() === selectedCustomer.loanId?.trim().toLowerCase())
          ? updatedCustomer
          : c
      );
      localStorage.setItem("motoLendCustomersList_data", JSON.stringify(updatedCustomersList));

      // 2. Add single transaction to payment history with precise current timestamp
      const now = new Date();
      const txId = `PAY-${now.getTime()}`;
      const txnRef = `TXN-${now.getTime().toString().slice(-8)}`;

      // Combine user-chosen paymentDate (if specified) with current local time, or use now.toISOString()
      let finalDateTimeStr = now.toISOString();
      if (paymentDate) {
        const isPlainDate = /^\d{4}-\d{2}-\d{2}$/.test(paymentDate.trim());
        if (isPlainDate) {
          const [y, m, d] = paymentDate.trim().split("-").map(Number);
          const customDt = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
          finalDateTimeStr = customDt.toISOString();
        } else {
          finalDateTimeStr = paymentDate;
        }
      }

      // Penalty collection: Strictly separate financial record.
      // Frozen penalties are NEVER collected as part of normal installment collection.
      const recordsToCollectInNormal = pendingPenaltyRecordsList.length > 0
        ? pendingPenaltyRecordsList.filter((r) => r.status === "Pending")
        : (pendingPenaltyRecord && pendingPenaltyRecord.status === "Pending" ? [pendingPenaltyRecord] : []);

      const penaltyCollectedAmt =
        recordsToCollectInNormal.length > 0 && penaltyAmountInput !== "" && !isNaN(Number(penaltyAmountInput))
          ? Math.max(0, Number(penaltyAmountInput))
          : 0;

      if (penaltyCollectedAmt > 0 && recordsToCollectInNormal.length > 0) {
        collectPenaltyTransaction({
          loanId: selectedCustomer.loanId,
          customerId: selectedCustomer.customerId,
          customerName: selectedCustomer.customer?.name || "Customer",
          records: recordsToCollectInNormal,
          collectedAmount: penaltyCollectedAmt,
          collectionDate: finalDateTimeStr,
          paymentMode,
          transactionRef: txnRef,
        });
      }

      const paymentRecord = {
        id: txId,
        transactionRef: txnRef,
        customerId: selectedCustomer.customerId,
        customerName: selectedCustomer.customer?.name || "Customer",
        loanId: selectedCustomer.loanId,
        installmentNumber: appliedAllocations.length === 1
          ? appliedAllocations[0]?.installmentNumber
          : (appliedAllocations.map((a) => a.installmentNumber).join(", ") || appliedAllocations[0]?.installmentNumber),
        installmentNumbers: appliedAllocations.map((a) => a.installmentNumber),
        date: finalDateTimeStr,
        createdAt: now.toISOString(),
        timestamp: now.getTime(),
        amount: amt, // Strict rule: Penalty and normal loan collection are separate financial records!
        principal: totalPrincipalRecovered,
        interest: totalInterestEarned,
        penaltyAmount: 0,
        advance: unappliedAdvance,
        mode: paymentMode,
        transactionId: paymentMode !== "Cash" ? (transactionId ? transactionId.trim() : "") : "",
        remarks: "Collection Payment",
        allocations: appliedAllocations,
        totalPrincipalOutstandingAfter: totalPrincipalOutstanding,
        totalInterestOutstandingAfter: totalInterestOutstanding,
        totalLoanOutstandingAfter: totalLoanOutstanding,
      };

      const existingHistory = JSON.parse(localStorage.getItem("motoLendPaymentHistory") || "[]");
      existingHistory.push(paymentRecord);
      localStorage.setItem("motoLendPaymentHistory", JSON.stringify(existingHistory));

      // 3. Synchronize storage event across tabs and state
      window.dispatchEvent(new Event("storage"));
      setCustomers(updatedCustomersList);

      // 4. Close collect modal and display Amount Collected Successfully popup
      setSelectedCustomer(null);
      setPendingPenaltyRecord(null);
      setPendingPenaltyRecordsList([]);
      setIsPenaltyOnlyMode(false);
      setPenaltyAmountInput("");
      setConfirmedTransaction({
        ...paymentRecord,
        customerName: selectedCustomer.customer?.name || "Customer",
        customerId: selectedCustomer.customerId,
        loanId: selectedCustomer.loanId,
        loanAmount: selectedCustomer.loanAmount,
        paymentFrequency: selectedCustomer.paymentFrequency || selectedCustomer.loan?.paymentFrequency || "Monthly",
        totalPrincipalOutstanding,
        totalInterestOutstanding,
        totalLoanOutstanding,
        allocations: appliedAllocations,
        advanceCreated: unappliedAdvance,
      });
    } catch (error) {
      console.error("Payment failed to process:", error);
      alert("Payment processing failed. No changes were made.");
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleView = (c, contextTab) => {
    setDetailsCustomer({
      customer: c,
      context: contextTab || activeTab,
    });
  };

  return (
    <div className="flex flex-col flex-1 min-h-screen w-full max-w-full overflow-x-hidden bg-white px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-8">
      {/* HEADER + SEARCH + DATE ROW */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between shrink-0 mb-5 sm:mb-6 gap-3.5 sm:gap-4">
        <div>
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-slate-900 sm:text-3xl">Collection</h1>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-[280px] md:w-[320px] lg:w-[360px]">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setHistoryPage(1);
              }}
              placeholder="Search Customer Name, Customer ID, Loan ID..."
              className="h-10 sm:h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 text-xs sm:text-[14px] text-slate-800 outline-none placeholder:text-slate-400 focus:border-[#006052] focus:ring-1 focus:ring-[#006052] shadow-2xs transition-all"
            />
          </div>

          {/* Midway Closure Button */}
          <button
            type="button"
            onClick={() => setShowMidwayModal(true)}
            className="flex h-10 sm:h-11 items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 text-xs sm:text-sm font-bold text-white hover:bg-amber-700 shadow-2xs transition-colors shrink-0 cursor-pointer"
          >
            <Coins className="h-4 w-4" />
            <span>Midway Closure</span>
          </button>
        </div>
      </div>

      {/* SEGMENTED SWITCH & FILTERS ROW */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center mb-5 sm:mb-6 gap-3 sm:gap-4 shrink-0">
        <div className="flex w-full sm:w-auto bg-slate-100 p-1 rounded-xl shadow-2xs border border-slate-200 shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab("Today")}
            className={`flex-1 sm:flex-none flex justify-center items-center gap-1.5 sm:gap-2 px-3 sm:px-4 md:px-5 py-2 sm:py-2.5 text-xs sm:text-[14px] font-bold rounded-lg transition-all duration-200 whitespace-nowrap ${activeTab === "Today"
                ? "bg-[#006052] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
              }`}
          >
            <span className="truncate">Today's Collection</span>
            <span
              className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[11px] sm:text-[12px] font-semibold shrink-0 ${activeTab === "Today" ? "bg-white/20 text-white" : "bg-white text-slate-500 shadow-2xs"
                }`}
            >
              {todayList.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("Overdue")}
            className={`flex-1 sm:flex-none flex justify-center items-center gap-1.5 sm:gap-2 px-3 sm:px-4 md:px-5 py-2 sm:py-2.5 text-xs sm:text-[14px] font-bold rounded-lg transition-all duration-200 whitespace-nowrap ${activeTab === "Overdue"
                ? "bg-[#006052] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
              }`}
          >
            <span className="truncate">Overdue Collection</span>
            <span
              className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[11px] sm:text-[12px] font-semibold shrink-0 ${activeTab === "Overdue" ? "bg-white/20 text-white" : "bg-white text-slate-500 shadow-2xs"
                }`}
            >
              {overdueList.length}
            </span>
          </button>
          <button
            onClick={() => {
              setActiveTab("History");
              setHistoryPage(1);
            }}
            className={`flex-1 sm:flex-none flex justify-center items-center gap-1.5 sm:gap-2 px-3 sm:px-4 md:px-5 py-2 sm:py-2.5 text-xs sm:text-[14px] font-bold rounded-lg transition-all duration-200 whitespace-nowrap ${activeTab === "History"
                ? "bg-[#006052] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
              }`}
          >
            <span className="truncate">Collection History</span>
            <span
              className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[11px] sm:text-[12px] font-semibold shrink-0 ${activeTab === "History" ? "bg-white/20 text-white" : "bg-white text-slate-500 shadow-2xs"
                }`}
            >
              {filteredHistoryList.length}
            </span>
          </button>
        </div>

        {activeTab === "Overdue" && (
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
            {["All", "1", "2", "3+"].map((f) => (
              <button
                key={f}
                onClick={() => setOverdueFilter(f)}
                className={`flex-1 sm:flex-none px-3 sm:px-4 py-1.5 text-xs sm:text-[13px] font-semibold rounded-full transition-all border text-center ${overdueFilter === f
                    ? "bg-slate-800 border-slate-800 text-white shadow-2xs"
                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  }`}
              >
                {f === "All" ? "All" : `${f} Overdue`}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* DYNAMIC KPI CARDS BASED ON SELECTED COLLECTION SECTION */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4 shrink-0 mb-6">
        {activeTab === "History" ? (
          <>
            <SummaryCard
              icon={Wallet}
              title="Total Collection"
              value={formatCurrency(totalCollectionKPI)}
              subtext={`${filteredHistoryList.length} ${filteredHistoryList.length === 1 ? "Record" : "Records"}`}
              accentClass="bg-emerald-50 text-emerald-700 border border-emerald-100"
            />
            <SummaryCard
              icon={Building2}
              title="Principal Collected"
              value={formatCurrency(principalCollectedKPI)}
              subtext="Actual received"
              accentClass="bg-teal-50 text-teal-700 border border-teal-100"
            />
            <SummaryCard
              icon={Percent}
              title="Interest Collected"
              value={formatCurrency(interestCollectedKPI)}
              subtext="Actual received"
              accentClass="bg-amber-50 text-amber-700 border border-amber-100"
              className="sm:col-span-2 lg:col-span-1"
            />
          </>
        ) : (
          <>
            <SummaryCard
              icon={CalendarIcon}
              title="Today's Due"
              value={formatCurrency(todayDueKPI)}
              subtext={`${todayList.length} ${todayList.length === 1 ? "Customer" : "Customers"}`}
              accentClass="bg-teal-50 text-[#006052] border border-teal-100"
            />
            <SummaryCard
              icon={Clock}
              title="Overdue"
              value={formatCurrency(overdueKPI)}
              subtext={`${overdueList.length} ${overdueList.length === 1 ? "Customer" : "Customers"}`}
              accentClass="bg-red-50 text-red-700 border border-red-100"
            />
            <SummaryCard
              icon={CheckCircle2}
              title="Collected Today"
              value={formatCurrency(collectedTodayAmount)}
              subtext={`${collectedTodayCount} ${collectedTodayCount === 1 ? "Payment" : "Payments"}`}
              accentClass="bg-emerald-50 text-emerald-700 border border-emerald-100"
              className="sm:col-span-2 lg:col-span-1"
            />
          </>
        )}
      </div>

      {/* =========================================================================
          COLLECTION HISTORY VIEW (activeTab === "History")
      ========================================================================= */}
      {activeTab === "History" ? (
        <div className="space-y-4 mb-6">
          {/* COMPACT DATE FILTERS & CUSTOM DATE RANGE CONTROLS */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 sm:p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              {[
                { key: "Today", label: "Today" },
                { key: "Yesterday", label: "Yesterday" },
                { key: "This Week", label: "This Week" },
                { key: "This Month", label: "This Month" },
                { key: "Custom", label: "Custom Date Range" },
              ].map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => {
                    setHistoryDateFilter(filter.key);
                    setHistoryPage(1);
                  }}
                  className={`px-3 py-1.5 text-xs sm:text-[13px] font-bold rounded-lg transition-all border ${historyDateFilter === filter.key
                      ? "bg-slate-900 border-slate-900 text-white shadow-2xs"
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            {/* Custom Date Range Pickers (Start Date & End Date) */}
            {historyDateFilter === "Custom" && (
              <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-500">From:</span>
                  <input
                    type="date"
                    value={historyCustomStart}
                    onChange={(e) => {
                      setHistoryCustomStart(e.target.value);
                      setHistoryPage(1);
                    }}
                    className="h-8 sm:h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-2xs outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052]"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-500">To:</span>
                  <input
                    type="date"
                    value={historyCustomEnd}
                    onChange={(e) => {
                      setHistoryCustomEnd(e.target.value);
                      setHistoryPage(1);
                    }}
                    className="h-8 sm:h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-2xs outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052]"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Validation alert if custom start date is later than end date */}
          {isCustomRangeInvalid && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs font-semibold text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>Start Date cannot be later than End Date. Please adjust the date range.</span>
            </div>
          )}

          {/* MOBILE CARDS VIEW FOR HISTORY (<md) */}
          <div className="block md:hidden space-y-3">
            {paginatedHistoryList.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8 text-center shadow-2xs">
                <div className="flex flex-col items-center justify-center text-slate-400">
                  <FileText className="h-8 w-8 text-slate-300 mb-2" />
                  <p className="text-sm font-semibold text-slate-700">No collection records found for this period.</p>
                  <p className="text-xs text-slate-400 mt-1">Try selecting a different date range or adjusting your search.</p>
                </div>
              </div>
            ) : (
              paginatedHistoryList.map((tx) => {
                const prin = tx.principal !== undefined ? Number(tx.principal || 0) : (
                  Array.isArray(tx.allocations)
                    ? tx.allocations.reduce((s, a) => s + Number(a.principalPaid || 0), 0)
                    : Number(tx.amount || 0)
                );
                const intr = tx.interest !== undefined ? Number(tx.interest || 0) : (
                  Array.isArray(tx.allocations)
                    ? tx.allocations.reduce((s, a) => s + Number(a.interestPaid || 0), 0)
                    : 0
                );

                return (
                  <div
                    key={tx.id || tx.transactionRef || `${tx.loanId}-${tx.date}`}
                    onClick={() => setSelectedHistoryTx(tx)}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3 transition-all hover:border-[#006052]/40 hover:shadow-xs cursor-pointer active:bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-slate-900 text-sm truncate">{tx.customerName || "Customer"}</h3>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 mt-0.5">
                          <span className="font-semibold text-slate-700">{tx.loanId}</span>
                          {tx.customerId && (
                            <>
                              <span>•</span>
                              <span>{tx.customerId}</span>
                            </>
                          )}
                          <span>•</span>
                          <span>Instalment {formatInstallmentDisplay(tx)}</span>
                        </div>
                      </div>
                      <span className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/20 shrink-0">
                        Collected
                      </span>
                    </div>

                    <div className="rounded-lg bg-slate-50 p-2.5 flex items-center justify-between border border-slate-100">
                      <div>
                        <span className="text-[11px] font-medium text-slate-500 block">Amount Collected</span>
                        <span className="text-base font-bold text-slate-900">{formatCurrency(tx.amount)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[11px] font-medium text-slate-500 block">Mode</span>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700">
                          {tx.mode || "Cash"}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-100 text-slate-600">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Principal / Interest</span>
                        <span className="font-semibold text-slate-700">
                          {formatCurrency(prin)} / {formatCurrency(intr)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400 block text-[10px]">Collection Date & Time</span>
                        <span className="font-medium text-slate-700">{formatDateTime(tx.date, tx)}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* DESKTOP/TABLET TABLE VIEW FOR HISTORY (hidden md:block) */}
          <div className="hidden md:block rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-slate-50 z-10 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 bg-slate-50/95 backdrop-blur-sm">
                      Collection Date & Time
                    </th>
                    <th className="px-4 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 bg-slate-50/95 backdrop-blur-sm">
                      Customer Name
                    </th>
                    <th className="px-4 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 bg-slate-50/95 backdrop-blur-sm">
                      Loan ID
                    </th>
                    <th className="px-3 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 bg-slate-50/95 backdrop-blur-sm text-center">
                      Instalment
                    </th>
                    <th className="px-4 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 bg-slate-50/95 backdrop-blur-sm text-right">
                      Amount Collected
                    </th>
                    <th className="px-4 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 bg-slate-50/95 backdrop-blur-sm text-right">
                      Principal
                    </th>
                    <th className="px-4 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 bg-slate-50/95 backdrop-blur-sm text-right">
                      Interest
                    </th>
                    <th className="px-3 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 bg-slate-50/95 backdrop-blur-sm text-center">
                      Payment Mode
                    </th>
                    <th className="px-4 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 bg-slate-50/95 backdrop-blur-sm text-center">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedHistoryList.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center">
                        <div className="flex flex-col items-center justify-center text-slate-400">
                          <FileText className="h-9 w-9 text-slate-300 mb-2" />
                          <p className="text-[15px] font-semibold text-slate-700">No collection records found for this period.</p>
                          <p className="text-[13px] text-slate-400 mt-1">Try selecting a different date range or adjusting your search filter.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedHistoryList.map((tx) => {
                      const prin = tx.principal !== undefined ? Number(tx.principal || 0) : (
                        Array.isArray(tx.allocations)
                          ? tx.allocations.reduce((s, a) => s + Number(a.principalPaid || 0), 0)
                          : Number(tx.amount || 0)
                      );
                      const intr = tx.interest !== undefined ? Number(tx.interest || 0) : (
                        Array.isArray(tx.allocations)
                          ? tx.allocations.reduce((s, a) => s + Number(a.interestPaid || 0), 0)
                          : 0
                      );

                      return (
                        <tr
                          key={tx.id || tx.transactionRef || `${tx.loanId}-${tx.date}`}
                          onClick={() => setSelectedHistoryTx(tx)}
                          className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                        >
                          <td className="px-4 py-3.5 whitespace-nowrap text-xs font-medium text-slate-700">
                            {formatDateTime(tx.date, tx)}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className="font-bold text-[13px] text-slate-900 group-hover:text-[#006052] transition-colors">
                              {tx.customerName || "Customer"}
                            </span>
                            {tx.customerId && (
                              <p className="text-[11px] text-slate-400 font-medium">{tx.customerId}</p>
                            )}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-xs font-semibold text-slate-700">
                            {tx.loanId}
                          </td>
                          <td className="px-3 py-3.5 whitespace-nowrap text-xs font-bold text-slate-800 text-center font-mono">
                            {formatInstallmentDisplay(tx)}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-xs font-bold text-slate-900 text-right">
                            {formatCurrency(tx.amount)}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-xs font-medium text-slate-600 text-right">
                            {formatCurrency(prin)}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-xs font-medium text-slate-600 text-right">
                            {formatCurrency(intr)}
                          </td>
                          <td className="px-3 py-3.5 whitespace-nowrap text-center">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                              {tx.mode || "Cash"}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-center">
                            <span className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                              Collected
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* PAGINATION CONTROLS FOR HISTORY */}
          {historyTotalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
              <p className="text-xs text-slate-500 font-medium">
                Showing <span className="font-bold text-slate-700">{(currentHistoryPage - 1) * historyPageSize + 1}</span> to{" "}
                <span className="font-bold text-slate-700">
                  {Math.min(currentHistoryPage * historyPageSize, filteredHistoryList.length)}
                </span>{" "}
                of <span className="font-bold text-slate-700">{filteredHistoryList.length}</span> records
              </p>
              <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap justify-center">
                <button
                  type="button"
                  onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                  disabled={currentHistoryPage === 1}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Previous</span>
                </button>

                {/* Page Number Buttons */}
                {Array.from({ length: historyTotalPages }, (_, i) => i + 1)
                  .filter((page) => {
                    if (historyTotalPages <= 7) return true;
                    if (page === 1 || page === historyTotalPages) return true;
                    return Math.abs(page - currentHistoryPage) <= 1;
                  })
                  .reduce((acc, page, idx, arr) => {
                    if (idx > 0 && page - arr[idx - 1] > 1) {
                      acc.push("ellipsis-" + page);
                    }
                    acc.push(page);
                    return acc;
                  }, [])
                  .map((item) => {
                    if (typeof item === "string") {
                      return (
                        <span key={item} className="px-1 text-xs text-slate-400 font-semibold select-none">
                          …
                        </span>
                      );
                    }
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setHistoryPage(item)}
                        className={`h-7 min-w-[28px] px-2 text-xs font-bold rounded-lg transition-colors border ${currentHistoryPage === item
                            ? "bg-[#006052] border-[#006052] text-white shadow-2xs"
                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                          }`}
                      >
                        {item}
                      </button>
                    );
                  })}

                <button
                  type="button"
                  onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                  disabled={currentHistoryPage >= historyTotalPages}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
                >
                  <span>Next</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* MOBILE CARDS VIEW (<md) FOR TODAY / OVERDUE */}
          <div className="block md:hidden space-y-3 mb-6">
            {currentDisplayList.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8 text-center shadow-2xs">
                <div className="flex flex-col items-center justify-center text-slate-400">
                  <p className="text-sm font-semibold text-slate-600">
                    {search.trim() ? "No matching records found" : (activeTab === "Today" ? "No collections due today" : "No overdue collections")}
                  </p>
                  <p className="text-xs mt-1">
                    {search.trim() ? `No customer or loan matches "${search}".` : (activeTab === "Today" ? "There are no pending collections due today." : "There are no overdue collections at this time.")}
                  </p>
                </div>
              </div>
            ) : (
              currentDisplayList.map((c) => {
                const dueAmt = c.statusText === "Collected"
                  ? (activeTab === "Today" ? (c.originalDueToday || c.totalUnpaidInstallmentAmount) : (c.originalOverdue || c.totalUnpaidInstallmentAmount))
                  : (activeTab === "Today"
                    ? (c.totalDueToday || c.totalOverdue || (c.allUnpaidInstalls?.[0]?.emi ?? 0))
                    : (c.totalOverdue || c.totalDueToday || (c.allUnpaidInstalls?.[0]?.emi ?? 0)));

                return (
                  <div key={`${c.customerId}-${c.loanId}`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3 transition-shadow hover:shadow-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate">{c.customer?.name}</h3>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 mt-0.5">
                          <span className="font-medium text-slate-600">{c.customerId}</span>
                          <span>•</span>
                          <span className="font-semibold text-slate-700">{c.loanId}</span>
                          {c.vehicle?.regNo && (
                            <>
                              <span>•</span>
                              <span className="truncate">{c.vehicle?.regNo}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-1.5">
                        {c.statusText === "Penalty" ? (
                          <span className="inline-flex items-center rounded-md bg-sky-50 px-2 py-0.5 text-xs font-bold text-sky-700 ring-1 ring-inset ring-sky-600/20">
                            Frozen
                          </span>
                        ) : c.statusText === "Pending Penalty" ? (
                          <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                            Pending
                          </span>
                        ) : c.hasFrozenPenalty ? (
                          <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                            Penalty
                          </span>
                        ) : null}
                        {c.statusText === "Pending" && !c.hasFrozenPenalty && (
                          <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700 ring-1 ring-inset ring-slate-500/20">
                            Pending
                          </span>
                        )}
                        {c.statusText === "Collected" && !c.hasFrozenPenalty && (
                          <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                            Collected
                          </span>
                        )}
                        {c.statusText === "Partial" && !c.hasFrozenPenalty && (
                          <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                            Partial
                          </span>
                        )}
                        {c.statusText === "Overdue" && (
                          <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700 ring-1 ring-inset ring-red-600/20">
                            Overdue
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="rounded-lg bg-slate-50 p-2.5 flex items-center justify-between border border-slate-100">
                      <span className="text-xs font-semibold text-slate-500">
                        {c.statusText === "Penalty" || c.statusText === "Pending Penalty" ? "Penalty Amount" : activeTab === "Today" ? "Due Amount" : "Overdue Amount"}
                      </span>
                      <div className="text-right">
                        <span className="text-base font-bold text-slate-900">
                          {formatCurrency(c.statusText === "Penalty" ? c.totalFrozenPenaltyAmount : c.statusText === "Pending Penalty" ? c.totalPendingPenaltyAmount : dueAmt)}
                        </span>
                        {c.hasFrozenPenalty && c.statusText !== "Penalty" && (
                          <span className="block text-[11px] font-semibold text-amber-700">
                            Penalty: {formatCurrency(c.totalFrozenPenaltyAmount)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      {c.statusText === "Penalty" ? (
                        <button
                          onClick={() => handleUnfreezeLoanPenalties(c)}
                          className="flex-1 rounded-lg bg-sky-600 py-2 px-3 text-xs font-bold text-white shadow-2xs hover:bg-sky-700 transition-colors text-center cursor-pointer"
                        >
                          Unfreeze
                        </button>
                      ) : c.statusText === "Pending Penalty" ? (
                        <button
                          onClick={() => handleCollectClick(c, true)}
                          className="flex-1 rounded-lg bg-emerald-700 py-2 px-3 text-xs font-bold text-white shadow-2xs hover:bg-emerald-800 transition-colors text-center cursor-pointer"
                        >
                          Collect Penalty
                        </button>
                      ) : (
                        <button
                          onClick={() => handleCollectClick(c)}
                          className="flex-1 rounded-lg bg-[#006052] py-2 px-3 text-xs font-bold text-white shadow-2xs hover:bg-[#004d43] transition-colors text-center cursor-pointer"
                        >
                          Collect Payment
                        </button>
                      )}
                      <button
                        onClick={() => setScheduleModalCustomer(c)}
                        className="flex-1 rounded-lg bg-white border border-slate-300 py-2 px-3 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors text-center cursor-pointer"
                      >
                        View Schedule
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* DESKTOP/TABLET TABLE VIEW (hidden md:block) FOR TODAY / OVERDUE */}
          <div className="hidden md:block rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-slate-50 z-10 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3.5 text-[12px] font-bold uppercase tracking-wider text-slate-600 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200">
                      Customer ID / Loan ID
                    </th>
                    <th className="px-6 py-3.5 text-[12px] font-bold uppercase tracking-wider text-slate-600 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200">
                      Customer
                    </th>
                    <th className="px-6 py-3.5 text-[12px] font-bold uppercase tracking-wider text-slate-600 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200">
                      {activeTab === "Today" ? "Due Amount" : "Overdue Amount"}
                    </th>
                    <th className="px-6 py-3.5 text-[12px] font-bold uppercase tracking-wider text-slate-600 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200">
                      Status
                    </th>
                    <th className="px-6 py-3.5 text-[12px] font-bold uppercase tracking-wider text-slate-600 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200 text-right">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentDisplayList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center">
                        <div className="flex flex-col items-center justify-center text-slate-400">
                          <p className="text-[15px] font-semibold text-slate-600">
                            {search.trim() ? "No matching records found" : (activeTab === "Today" ? "No collections due today" : "No overdue collections")}
                          </p>
                          <p className="text-[13px] mt-1">
                            {search.trim() ? `No customer or loan matches "${search}".` : (activeTab === "Today" ? "There are no pending collections due today." : "There are no overdue collections at this time.")}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    currentDisplayList.map((c) => (
                      <tr key={`${c.customerId}-${c.loanId}`} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <p className="text-[14px] text-slate-700 font-bold">{c.customerId}</p>
                          <p className="text-[12px] text-slate-400 font-mono font-medium">{c.loanId}</p>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <p className="font-bold text-[14px] text-slate-900">{c.customer?.name}</p>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <p className="font-bold text-[14px] text-slate-900">
                            {c.statusText === "Penalty"
                              ? formatCurrency(c.totalFrozenPenaltyAmount)
                              : c.statusText === "Pending Penalty"
                                ? formatCurrency(c.totalPendingPenaltyAmount)
                                : c.statusText === "Collected"
                                  ? `${formatCurrency(activeTab === "Today" ? (c.originalDueToday || c.totalUnpaidInstallmentAmount) : (c.originalOverdue || c.totalUnpaidInstallmentAmount))}`
                                  : formatCurrency(
                                    activeTab === "Today"
                                      ? (c.totalDueToday || c.totalOverdue || (c.allUnpaidInstalls?.[0]?.emi ?? 0))
                                      : (c.totalOverdue || c.totalDueToday || (c.allUnpaidInstalls?.[0]?.emi ?? 0))
                                  )}
                          </p>
                          {c.hasFrozenPenalty && c.statusText !== "Penalty" && (
                            <span className="block text-[11px] font-semibold text-amber-700">
                              Penalty: {formatCurrency(c.totalFrozenPenaltyAmount)}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {c.statusText === "Penalty" ? (
                              <span className="inline-flex items-center rounded-md bg-sky-50 px-2.5 py-1 text-[12px] font-bold text-sky-700 ring-1 ring-inset ring-sky-600/20">
                                Frozen
                              </span>
                            ) : c.statusText === "Pending Penalty" ? (
                              <span className="inline-flex items-center rounded-md bg-amber-50 px-2.5 py-1 text-[12px] font-bold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                                Pending
                              </span>
                            ) : c.hasFrozenPenalty ? (
                              <span className="inline-flex items-center rounded-md bg-amber-50 px-2.5 py-1 text-[12px] font-bold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                                Penalty
                              </span>
                            ) : null}
                            {c.statusText === "Pending" && !c.hasFrozenPenalty && (
                              <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-[12px] font-bold text-slate-700 ring-1 ring-inset ring-slate-500/20">
                                Pending
                              </span>
                            )}
                            {c.statusText === "Collected" && !c.hasFrozenPenalty && (
                              <span className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-1 text-[12px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                                Collected
                              </span>
                            )}
                            {c.statusText === "Partial" && !c.hasFrozenPenalty && (
                              <span className="inline-flex items-center rounded-md bg-amber-50 px-2.5 py-1 text-[12px] font-bold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                                Partial
                              </span>
                            )}
                            {c.statusText === "Overdue" && (
                              <span className="inline-flex items-center rounded-md bg-red-50 px-2.5 py-1 text-[12px] font-bold text-red-700 ring-1 ring-inset ring-red-600/20">
                                Overdue
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <div className="flex justify-end gap-2">
                            {c.statusText === "Penalty" ? (
                              <button
                                onClick={() => handleUnfreezeLoanPenalties(c)}
                                className="rounded-md bg-sky-600 px-5 py-2.5 text-[13px] font-bold text-white shadow-sm hover:bg-sky-700 transition-colors cursor-pointer"
                                title="Unfreeze this penalty"
                              >
                                Unfreeze
                              </button>
                            ) : c.statusText === "Pending Penalty" ? (
                              <button
                                onClick={() => handleCollectClick(c, true)}
                                className="rounded-md bg-emerald-700 px-5 py-2.5 text-[13px] font-bold text-white shadow-sm hover:bg-emerald-800 transition-colors cursor-pointer"
                                title="Collect penalty"
                              >
                                Collect Penalty
                              </button>
                            ) : (
                              <button
                                onClick={() => handleCollectClick(c)}
                                className="rounded-md bg-[#006052] px-5 py-2.5 text-[13px] font-bold text-white shadow-sm hover:bg-[#004d43] transition-colors cursor-pointer"
                              >
                                Collect Payment
                              </button>
                            )}
                            <button
                              onClick={() => setScheduleModalCustomer(c)}
                              className="rounded-md bg-white border border-slate-300 px-5 py-2.5 text-[13px] font-bold text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
                            >
                              View Schedule
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* =========================================================================
          1. COLLECT PAYMENT POPUP (REDESIGNED MATCHING REFERENCE IMAGE)
      ========================================================================= */}
      {selectedCustomer && (() => {
        const amountReceived = Number(collectAmount) || 0;
        const isPenaltyFrozen = pendingPenaltyRecord && pendingPenaltyRecord.status === "Frozen";
        const enteredPenaltyAmt =
          pendingPenaltyRecord && !isPenaltyFrozen && penaltyAmountInput !== "" && !isNaN(Number(penaltyAmountInput))
            ? Math.max(0, Number(penaltyAmountInput))
            : 0;
        const totalAmountToCollect = amountReceived + (isPenaltyFrozen ? 0 : enteredPenaltyAmt);
        const unpaidSchedule = selectedCustomer.allUnpaidInstalls || [];
        const fullSchedule = selectedCustomer.fullSchedule || [];

        // Pagination for Repayment Schedule (4 rows per page matching reference image)
        const pageSize = 4;
        const totalPages = Math.max(1, Math.ceil(fullSchedule.length / pageSize));
        const currentPage = Math.min(Math.max(1, schedulePage), totalPages);
        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = Math.min(startIndex + pageSize, fullSchedule.length);
        const paginatedSchedule = fullSchedule.slice(startIndex, endIndex);

        // Values for KPI Cards and dynamic Quick Actions
        const totalOutstanding = selectedCustomer.totalUnpaidInstallmentAmount || 0;
        const overdueAmount = selectedCustomer.totalOverdue || 0;
        const dueTodayAmount = selectedCustomer.totalDueToday || 0;
        const currentTotalDue = selectedCustomer.currentTotalDue || 0;
        const overdueCount = selectedCustomer.overdueInstalls?.length || 0;
        const unpaidCount = unpaidSchedule.length;

        // Map of preview allocations keyed by installmentNumber for O(1) lookups
        const previewAllocationMap = new Map(
          (allocationPreview?.allocations || []).map((al) => [al.installmentNumber, al])
        );

        // Conditions for Dynamic Quick Action buttons
        const hasOverdue = overdueAmount > 0;
        const hasDueToday = dueTodayAmount > 0;
        const hasAnyCurrentOrOverdue = hasOverdue || hasDueToday;
        const hasUnpaidFutureOnly = !hasAnyCurrentOrOverdue && totalOutstanding > 0;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 sm:p-4 md:p-6 backdrop-blur-xs overflow-y-auto overscroll-contain">
            <div className="w-full max-w-4xl max-h-[calc(100dvh-1rem)] sm:max-h-[92vh] rounded-2xl bg-white shadow-2xl relative flex flex-col border border-slate-200 overflow-hidden my-auto">
              {/* Header (Sticky top) */}
              <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 bg-white sticky top-0 z-20 shrink-0">
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
                    <Banknote className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-tight truncate">Collect Payment</h3>
                    <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5 truncate">
                      {selectedCustomer.customer?.name} &nbsp;·&nbsp; {selectedCustomer.loanId} &nbsp;·&nbsp; {selectedCustomer.customerId}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCustomer(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors shrink-0"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Main Body (Scrollable with momentum touch scrolling on mobile) */}
              <div className="px-3 sm:px-5 py-3 sm:py-3.5 space-y-3 overflow-y-auto flex-1 overscroll-contain [webkit-overflow-scrolling:touch]">
                {/* 1. KPI Cards (Hidden in penalty-only mode) */}
                {!isPenaltyOnlyMode && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-2.5">
                    {/* Card 1: TOTAL OUTSTANDING */}
                    <div className="rounded-xl border border-slate-200 bg-white p-2.5 sm:p-3 flex items-start gap-2.5 shadow-2xs">
                      <div className="p-1.5 sm:p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 shrink-0 mt-0.5">
                        <CreditCard className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          TOTAL OUTSTANDING
                        </p>
                        <p className="text-lg sm:text-xl font-bold text-slate-900 mt-0.5">
                          {formatCurrency(totalOutstanding)}
                        </p>
                        <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 truncate">
                          {unpaidCount} Unpaid {unpaidCount === 1 ? "Installment" : "Installments"}
                        </p>
                      </div>
                    </div>

                    {/* Card 2: OVERDUE */}
                    <div className="rounded-xl border border-red-200/80 bg-red-50/30 p-2.5 sm:p-3 flex items-start gap-2.5 shadow-2xs">
                      <div className="p-1.5 sm:p-2 rounded-lg bg-red-50 text-red-600 shrink-0 mt-0.5">
                        <Clock className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-red-600">
                          OVERDUE
                        </p>
                        <p className="text-lg sm:text-xl font-bold text-red-600 mt-0.5">
                          {formatCurrency(overdueAmount)}
                        </p>
                        <p className="text-[10px] sm:text-[11px] text-red-500 mt-0.5 truncate">
                          {overdueCount} Overdue {overdueCount === 1 ? "Installment" : "Installments"}
                        </p>
                      </div>
                    </div>

                    {/* Card 3: DUE TODAY */}
                    <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/30 p-2.5 sm:p-3 flex items-start gap-2.5 shadow-2xs">
                      <div className="p-1.5 sm:p-2 rounded-lg bg-emerald-50 text-emerald-700 shrink-0 mt-0.5">
                        <CalendarIcon className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                          DUE TODAY
                        </p>
                        <p className="text-lg sm:text-xl font-bold text-emerald-700 mt-0.5">
                          {formatCurrency(dueTodayAmount)}
                        </p>
                        <p className="text-[10px] sm:text-[11px] text-emerald-600 mt-0.5 truncate">
                          {selectedCustomer.todayInstalls?.length > 0 ? "Due Today" : "None Due Today"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. Payment Amount and Dynamic Quick Actions (Hidden in penalty-only mode) */}
                {!isPenaltyOnlyMode && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 sm:gap-3 items-end">
                    {/* Amount Input (approx 4 cols) */}
                    <div className="lg:col-span-4">
                      <label className="block text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                        PAYMENT AMOUNT <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">₹</span>
                        <input
                          type="number"
                          value={collectAmount}
                          onChange={(e) => setCollectAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-full rounded-xl border border-slate-200 bg-slate-50/60 py-2 pl-7 sm:pl-8 pr-3 text-sm sm:text-base font-bold text-slate-900 outline-none transition-colors focus:border-[#006052] focus:bg-white focus:ring-1 focus:ring-[#006052]"
                        />
                      </div>
                    </div>

                    {/* Quick Action Buttons (approx 8 cols) */}
                    <div className="lg:col-span-8">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 items-center">
                        {/* Scenario A: Overdue and current dues exist -> Pay Overdue, Pay Current, Pay Total, Pay All */}
                        {hasOverdue && hasDueToday && (
                          <>
                            <button
                              type="button"
                              onClick={() => setCollectAmount(String(dueTodayAmount))}
                              className="rounded-lg border border-teal-200 bg-teal-50/70 hover:bg-teal-100/70 text-teal-800 px-2 py-1.5 text-center transition-all active:scale-[0.98] shadow-2xs"
                            >
                              <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-teal-700">
                                <CreditCard className="h-3 w-3 shrink-0" />
                                <span className="truncate">Pay Current</span>
                              </div>
                              <div className="text-xs font-bold text-teal-900 mt-0.5 truncate">{formatCurrency(dueTodayAmount)}</div>
                            </button>

                            <button
                              type="button"
                              onClick={() => setCollectAmount(String(overdueAmount))}
                              className="rounded-lg border border-amber-200 bg-amber-50/70 hover:bg-amber-100/70 text-amber-800 px-2 py-1.5 text-center transition-all active:scale-[0.98] shadow-2xs"
                            >
                              <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-amber-700">
                                <Clock className="h-3 w-3 shrink-0" />
                                <span className="truncate">Pay Overdue</span>
                              </div>
                              <div className="text-xs font-bold text-amber-900 mt-0.5 truncate">{formatCurrency(overdueAmount)}</div>
                            </button>

                            <button
                              type="button"
                              onClick={() => setCollectAmount(String(currentTotalDue))}
                              className="rounded-lg border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100/70 text-emerald-800 px-2 py-1.5 text-center transition-all active:scale-[0.98] shadow-2xs"
                            >
                              <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-emerald-700">
                                <Layers className="h-3 w-3 shrink-0" />
                                <span className="truncate">Pay Total</span>
                              </div>
                              <div className="text-xs font-bold text-emerald-900 mt-0.5 truncate">{formatCurrency(currentTotalDue)}</div>
                            </button>

                            <button
                              type="button"
                              onClick={() => setCollectAmount(String(totalOutstanding))}
                              className="rounded-lg border border-slate-200 bg-slate-50/80 hover:bg-slate-100 text-slate-700 px-2 py-1.5 text-center transition-all active:scale-[0.98] shadow-2xs"
                            >
                              <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-600">
                                <Users className="h-3 w-3 shrink-0" />
                                <span className="truncate">Pay All</span>
                              </div>
                              <div className="text-xs font-bold text-slate-800 mt-0.5 truncate">{formatCurrency(totalOutstanding)}</div>
                            </button>
                          </>
                        )}

                        {/* Scenario B: Only Overdue exists -> Pay Overdue, Pay All */}
                        {hasOverdue && !hasDueToday && (
                          <>
                            <button
                              type="button"
                              onClick={() => setCollectAmount(String(overdueAmount))}
                              className="rounded-lg border border-amber-200 bg-amber-50/70 hover:bg-amber-100/70 text-amber-800 px-2 py-1.5 text-center transition-all active:scale-[0.98] shadow-2xs"
                            >
                              <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-amber-700">
                                <Clock className="h-3 w-3 shrink-0" />
                                <span className="truncate">Pay Overdue</span>
                              </div>
                              <div className="text-xs font-bold text-amber-900 mt-0.5 truncate">{formatCurrency(overdueAmount)}</div>
                            </button>

                            <button
                              type="button"
                              onClick={() => setCollectAmount(String(totalOutstanding))}
                              className="rounded-lg border border-slate-200 bg-slate-50/80 hover:bg-slate-100 text-slate-700 px-2 py-1.5 text-center transition-all active:scale-[0.98] shadow-2xs"
                            >
                              <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-600">
                                <Users className="h-3 w-3 shrink-0" />
                                <span className="truncate">Pay All</span>
                              </div>
                              <div className="text-xs font-bold text-slate-800 mt-0.5 truncate">{formatCurrency(totalOutstanding)}</div>
                            </button>
                          </>
                        )}

                        {/* Scenario C: Only Current (Due Today) exists -> Pay Current, Pay All */}
                        {!hasOverdue && hasDueToday && (
                          <>
                            <button
                              type="button"
                              onClick={() => setCollectAmount(String(dueTodayAmount))}
                              className="rounded-lg border border-teal-200 bg-teal-50/70 hover:bg-teal-100/70 text-teal-800 px-2 py-1.5 text-center transition-all active:scale-[0.98] shadow-2xs"
                            >
                              <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-teal-700">
                                <CreditCard className="h-3 w-3 shrink-0" />
                                <span className="truncate">Pay Current</span>
                              </div>
                              <div className="text-xs font-bold text-teal-900 mt-0.5 truncate">{formatCurrency(dueTodayAmount)}</div>
                            </button>

                            <button
                              type="button"
                              onClick={() => setCollectAmount(String(totalOutstanding))}
                              className="rounded-lg border border-slate-200 bg-slate-50/80 hover:bg-slate-100 text-slate-700 px-2 py-1.5 text-center transition-all active:scale-[0.98] shadow-2xs"
                            >
                              <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-600">
                                <Users className="h-3 w-3 shrink-0" />
                                <span className="truncate">Pay All</span>
                              </div>
                              <div className="text-xs font-bold text-slate-800 mt-0.5 truncate">{formatCurrency(totalOutstanding)}</div>
                            </button>
                          </>
                        )}

                        {/* Scenario D: Neither overdue nor current dues exist -> Pay All if unpaid future remain */}
                        {hasUnpaidFutureOnly && (
                          <button
                            type="button"
                            onClick={() => setCollectAmount(String(totalOutstanding))}
                            className="rounded-lg border border-teal-200 bg-teal-50/70 hover:bg-teal-100/70 text-teal-800 px-2 py-1.5 text-center transition-all active:scale-[0.98] shadow-2xs col-span-2 sm:col-span-1"
                          >
                            <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-teal-700">
                              <Users className="h-3 w-3 shrink-0" />
                              <span className="truncate">Pay All</span>
                            </div>
                            <div className="text-xs font-bold text-teal-900 mt-0.5 truncate">{formatCurrency(totalOutstanding)}</div>
                          </button>
                        )}

                        {/* If fully paid */}
                        {!hasAnyCurrentOrOverdue && !hasUnpaidFutureOnly && (
                          <div className="col-span-2 sm:col-span-4 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-500 font-medium text-center">
                            No pending dues for this loan.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. Payment Date, Payment Method, Transaction ID */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 sm:gap-3 items-start">
                  {/* Payment Date (3 cols) */}
                  <div className="md:col-span-3">
                    <label className="block text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                      PAYMENT DATE <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                      <input
                        type="date"
                        value={paymentDate}
                        onChange={(e) => setPaymentDate(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/60 py-1.5 pl-8 sm:pl-9 pr-2.5 text-xs font-medium text-slate-800 outline-none focus:border-[#006052] focus:bg-white focus:ring-1 focus:ring-[#006052]"
                      />
                    </div>
                  </div>

                  {/* Payment Method (5 cols) */}
                  <div className="md:col-span-5">
                    <label className="block text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                      PAYMENT METHOD <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {/* Cash */}
                      <button
                        type="button"
                        onClick={() => setPaymentMode("Cash")}
                        className={`rounded-xl border py-1.5 px-2 text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${paymentMode === "Cash"
                            ? "bg-[#006052] border-[#006052] text-white shadow-xs"
                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                          }`}
                      >
                        <Banknote className="h-3.5 w-3.5 shrink-0" />
                        <span>Cash</span>
                      </button>

                      {/* UPI */}
                      <button
                        type="button"
                        onClick={() => setPaymentMode("UPI")}
                        className={`rounded-xl border py-1.5 px-2 text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${paymentMode === "UPI"
                            ? "bg-[#006052] border-[#006052] text-white shadow-xs"
                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                          }`}
                      >
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 -rotate-45" />
                        <span>UPI</span>
                      </button>

                      {/* Bank Transfer */}
                      <button
                        type="button"
                        onClick={() => setPaymentMode("Bank Transfer")}
                        className={`rounded-xl border py-1.5 px-2 text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${paymentMode === "Bank Transfer"
                            ? "bg-[#006052] border-[#006052] text-white shadow-xs"
                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                          }`}
                      >
                        <Building2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">Bank Transfer</span>
                      </button>
                    </div>
                  </div>

                  {/* Transaction ID (4 cols) */}
                  <div className="md:col-span-4">
                    <label className="block text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                      TRANSACTION ID
                    </label>
                    <div className="relative">
                      {paymentMode === "Cash" && (
                        <AlertCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                      )}
                      <input
                        type="text"
                        value={transactionId}
                        onChange={(e) => setTransactionId(e.target.value)}
                        disabled={paymentMode === "Cash"}
                        placeholder={
                          paymentMode === "Cash"
                            ? "Not applicable for Cash"
                            : "Enter transaction ID"
                        }
                        className={`w-full rounded-xl border py-1.5 text-xs outline-none transition-all ${paymentMode === "Cash"
                            ? "border-slate-200 bg-slate-50/70 text-slate-400 pl-8 pr-3 cursor-not-allowed placeholder:text-slate-400"
                            : "border-slate-200 bg-white text-slate-800 px-3 placeholder:text-slate-400 focus:border-[#006052] focus:ring-1 focus:ring-[#006052]"
                          }`}
                      />
                    </div>
                  </div>
                </div>

                {/* Penalty Section (Compact, No Remarks, No '#', Action Buttons) */}
                {pendingPenaltyRecord && (
                  <div className="rounded-xl border border-amber-200/90 bg-amber-50/50 p-2.5 sm:p-3 shadow-2xs">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-amber-900">
                            {pendingPenaltyRecordsList.length > 1
                              ? `Penalty Amount — ${pendingPenaltyRecordsList.length} Overdue Installments`
                              : `Penalty Amount ${pendingPenaltyRecord.installmentNumber ? `— Installment ${pendingPenaltyRecord.installmentNumber}` : ''}`}
                          </label>
                          {pendingPenaltyRecord.status === "Frozen" ? (
                            <span className="inline-flex items-center rounded-md bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-800 border border-sky-300">
                              Frozen
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-300">
                              Pending
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="relative w-32 sm:w-36">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-800">₹</span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={penaltyAmountInput}
                            disabled={pendingPenaltyRecord.status === "Frozen"}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === "" || Number(val) >= 0) {
                                setPenaltyAmountInput(val);
                              }
                            }}
                            placeholder="0.00"
                            className={`w-full rounded-lg border py-1.5 pl-6 pr-2.5 text-xs font-bold outline-none ${pendingPenaltyRecord.status === "Frozen"
                                ? "border-sky-200 bg-sky-50/60 text-sky-900 cursor-not-allowed"
                                : "border-amber-300 bg-white text-slate-900 focus:border-[#006052] focus:ring-1 focus:ring-[#006052]"
                              }`}
                          />
                        </div>

                        {/* Penalty Actions */}
                        {pendingPenaltyRecord.status === "Frozen" ? (
                          <>
                            <button
                              type="button"
                              onClick={handleUnfreezeModalPenalty}
                              className="rounded-lg bg-sky-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-2xs hover:bg-sky-700 transition-colors cursor-pointer shrink-0"
                              title="Unfreeze this penalty to make it collectible or pending"
                            >
                              Unfreeze
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelPenalty}
                              className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-bold text-red-700 hover:bg-red-100 transition-colors cursor-pointer shrink-0"
                              title="Cancel this penalty permanently"
                            >
                              Cancel Penalty
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={handleFreezePenalty}
                              className="rounded-lg border border-sky-300 bg-sky-50 px-2.5 py-1.5 text-[11px] font-bold text-sky-800 hover:bg-sky-100 transition-colors cursor-pointer shrink-0"
                              title="Freeze this penalty (preserve exact amount without increasing)"
                            >
                              Freeze Penalty
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelPenalty}
                              className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-bold text-red-700 hover:bg-red-100 transition-colors cursor-pointer shrink-0"
                              title="Cancel this penalty permanently"
                            >
                              Cancel Penalty
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 5. Repayment Schedule (Hidden in penalty-only mode) */}
                {!isPenaltyOnlyMode && (
                  <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    {/* Schedule Header */}
                    <div className="flex items-center justify-between px-3.5 sm:px-4 py-2 bg-white border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded-md bg-emerald-50 text-emerald-700">
                        <CalendarIcon className="h-4 w-4" />
                      </div>
                      <h4 className="text-xs font-bold text-slate-800">
                        Repayment Schedule
                      </h4>
                      {previewAllocationMap.size > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-700 ring-1 ring-purple-600/20">
                          <span className="h-1.5 w-1.5 rounded-full bg-purple-600 animate-pulse"></span>
                          Payment Preview Active
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 font-medium">
                      <span>
                        {fullSchedule.length > 0
                          ? `${startIndex + 1} - ${endIndex} of ${fullSchedule.length} installments`
                          : "0 of 0 installments"}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setSchedulePage((p) => Math.max(1, p - 1))}
                          disabled={currentPage <= 1}
                          className="h-6 w-6 rounded border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setSchedulePage((p) => Math.min(totalPages, p + 1))}
                          disabled={currentPage >= totalPages}
                          className="h-6 w-6 rounded border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Desktop / Tablet Table View (hidden on small mobile screens to prevent cramped horizontal scrolling) */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-xs text-left min-w-[580px] border-separate border-spacing-y-0.5">
                      <thead className="bg-slate-50/70 border-b border-slate-100 text-slate-600 font-semibold text-[11px]">
                        <tr>
                          <th className="px-4 py-2">Installment</th>
                          <th className="px-4 py-2">Due Date</th>
                          <th className="px-4 py-2 text-right">Installment Amount</th>
                          <th className="px-4 py-2 text-right">Amount Paid (Preview)</th>
                          <th className="px-4 py-2 text-right">Remaining Due (Preview)</th>
                          <th className="px-4 py-2 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {paginatedSchedule.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-4 text-center text-slate-400">
                              No schedule records found.
                            </td>
                          </tr>
                        ) : (
                          paginatedSchedule.map((s) => {
                            const preview = previewAllocationMap.get(s.installmentNumber);
                            const isAffected = !!preview;

                            // Actual values without preview
                            const actualPaid = s.amountPaid || 0;
                            const actualRemainingDue = Math.max(0, s.emi - actualPaid);
                            const actualIsPaid = actualRemainingDue <= 0.01;
                            const actualIsOverdue = !actualIsPaid && getDayDiff(s.dueDate, date) < 0;
                            const actualIsToday = !actualIsPaid && getDayDiff(s.dueDate, date) === 0;
                            const actualIsPartial = !actualIsPaid && actualPaid > 0.01;
                            const actualIsUpcoming = !actualIsPaid && !actualIsOverdue && !actualIsToday && !actualIsPartial;

                            // Displayed values (preview if affected, else actual)
                            const displayedPaid = isAffected ? actualPaid + preview.allocated : actualPaid;
                            const displayedRemainingDue = isAffected ? preview.balanceAfter : actualRemainingDue;
                            const displayedStatus = isAffected ? preview.statusAfter : null;

                            const penaltyAmt = (!isAffected && actualIsOverdue)
                              ? getInstallmentPenaltySupportingAmount(s, {
                                loanId: selectedCustomer?.loanId || selectedCustomer?.loan?.loanId,
                                frequency: selectedCustomer?.paymentFrequency || selectedCustomer?.loan?.paymentFrequency || "Monthly",
                                referenceDate: date ? new Date(date) : new Date(),
                              })
                              : null;

                            return (
                              <tr
                                key={s.installmentNumber}
                                className={`transition-all duration-150 ${isAffected
                                    ? "bg-[#F3E8FF] shadow-xs text-purple-950 font-medium"
                                    : "hover:bg-slate-50/60 text-slate-800"
                                  }`}
                                style={isAffected ? { outline: "2px solid #7E22CE", outlineOffset: "-1px" } : {}}
                              >
                                <td className="px-4 py-2.5 font-medium">
                                  <div className="flex items-center gap-1.5">
                                    <span className={isAffected ? "font-bold text-purple-900" : "text-slate-700"}>
                                      {s.installmentNumber}
                                    </span>
                                    {isAffected && (
                                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded font-extrabold bg-[#7E22CE] text-white tracking-wider">
                                        Preview
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className={`px-4 py-2.5 ${isAffected ? "text-purple-900 font-medium" : "text-slate-600"}`}>
                                  {formatDate(s.dueDate)}
                                </td>
                                <td className={`px-4 py-2.5 text-right font-medium ${isAffected ? "text-purple-950" : "text-slate-700"}`}>
                                  {formatCurrency(s.emi)}
                                </td>
                                <td className="px-4 py-2.5 text-right">
                                  {isAffected ? (
                                    <span className="font-bold text-purple-900">
                                      {formatCurrency(displayedPaid)}
                                    </span>
                                  ) : (
                                    <span className="text-slate-600">{formatCurrency(actualPaid)}</span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-right font-semibold">
                                  {isAffected ? (
                                    <span className="font-black text-purple-950">
                                      {formatCurrency(displayedRemainingDue)}
                                    </span>
                                  ) : (
                                    <span className="text-slate-800">{formatCurrency(actualRemainingDue)}</span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  {isAffected ? (
                                    displayedStatus === "Paid" ? (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-[10px] font-bold text-purple-800 ring-1 ring-purple-600/40">
                                        <span className="h-1.5 w-1.5 rounded-full bg-purple-600"></span>
                                        Paid
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-[10px] font-bold text-purple-800 ring-1 ring-purple-600/40">
                                        <span className="h-1.5 w-1.5 rounded-full bg-purple-600"></span>
                                        Partial
                                      </span>
                                    )
                                  ) : actualIsPaid ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-600/20">
                                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                                      Paid
                                    </span>
                                  ) : actualIsOverdue ? (
                                    <div className="flex flex-col items-center justify-center gap-0.5">
                                      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-[10px] font-bold text-red-700 ring-1 ring-red-600/20">
                                        <span className="h-1.5 w-1.5 rounded-full bg-red-500"></span>
                                        Overdue
                                      </span>
                                      {penaltyAmt > 0 && (
                                        <span className="text-[10px] font-semibold text-[#006052] whitespace-nowrap leading-tight">
                                          Penalty: ₹{Number(penaltyAmt).toLocaleString('en-IN')}
                                        </span>
                                      )}
                                    </div>
                                  ) : actualIsToday ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-600/20">
                                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                                      Due Today
                                    </span>
                                  ) : actualIsPartial ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-600/20">
                                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                                      Partial
                                    </span>
                                  ) : actualIsUpcoming ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-400/20">
                                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
                                      Upcoming
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-400/20">
                                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
                                      Due
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Compact Cards View (shown on xs/small phones, fully readable and responsive) */}
                  <div className="block sm:hidden divide-y divide-slate-100 bg-white">
                    {paginatedSchedule.length === 0 ? (
                      <p className="py-4 text-center text-xs text-slate-400">No schedule records found.</p>
                    ) : (
                      paginatedSchedule.map((s) => {
                        const preview = previewAllocationMap.get(s.installmentNumber);
                        const isAffected = !!preview;

                        const actualPaid = s.amountPaid || 0;
                        const actualRemainingDue = Math.max(0, s.emi - actualPaid);
                        const actualIsPaid = actualRemainingDue <= 0.01;
                        const actualIsOverdue = !actualIsPaid && getDayDiff(s.dueDate, date) < 0;
                        const actualIsToday = !actualIsPaid && getDayDiff(s.dueDate, date) === 0;
                        const actualIsPartial = !actualIsPaid && actualPaid > 0.01;
                        const actualIsUpcoming = !actualIsPaid && !actualIsOverdue && !actualIsToday && !actualIsPartial;

                        const displayedPaid = isAffected ? actualPaid + preview.allocated : actualPaid;
                        const displayedRemainingDue = isAffected ? preview.balanceAfter : actualRemainingDue;
                        const displayedStatus = isAffected ? preview.statusAfter : null;

                        const penaltyAmt = (!isAffected && actualIsOverdue)
                          ? getInstallmentPenaltySupportingAmount(s, {
                            loanId: selectedCustomer?.loanId || selectedCustomer?.loan?.loanId,
                            frequency: selectedCustomer?.paymentFrequency || selectedCustomer?.loan?.paymentFrequency || "Monthly",
                            referenceDate: date ? new Date(date) : new Date(),
                          })
                          : null;

                        return (
                          <div
                            key={s.installmentNumber}
                            className={`p-3 space-y-2 transition-all ${isAffected
                                ? "bg-[#F3E8FF] border-l-4 border-l-[#7E22CE]"
                                : "hover:bg-slate-50/60"
                              }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <span className={`text-xs font-bold ${isAffected ? "text-purple-950" : "text-slate-800"}`}>
                                  Installment {s.installmentNumber}
                                </span>
                                {isAffected && (
                                  <span className="text-[9px] uppercase px-1.5 py-0.2 rounded font-extrabold bg-[#7E22CE] text-white tracking-wider">
                                    Preview
                                  </span>
                                )}
                              </div>
                              <div>
                                {isAffected ? (
                                  displayedStatus === "Paid" ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-800 ring-1 ring-purple-600/40">
                                      <span className="h-1.5 w-1.5 rounded-full bg-purple-600"></span>
                                      Paid
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-800 ring-1 ring-purple-600/40">
                                      <span className="h-1.5 w-1.5 rounded-full bg-purple-600"></span>
                                      Partial
                                    </span>
                                  )
                                ) : actualIsPaid ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-600/20">
                                    Paid
                                  </span>
                                ) : actualIsOverdue ? (
                                  <div className="flex flex-col items-end gap-0.5">
                                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 ring-1 ring-red-600/20">
                                      Overdue
                                    </span>
                                    {penaltyAmt > 0 && (
                                      <span className="text-[10px] font-semibold text-[#006052] whitespace-nowrap leading-tight">
                                        Penalty: ₹{Number(penaltyAmt).toLocaleString('en-IN')}
                                      </span>
                                    )}
                                  </div>
                                ) : actualIsToday ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-600/20">
                                    Due Today
                                  </span>
                                ) : actualIsPartial ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-600/20">
                                    Partial
                                  </span>
                                ) : actualIsUpcoming ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-400/20">
                                    Upcoming
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-400/20">
                                    Due
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-100">
                              <div>
                                <span className="text-slate-400 block text-[10px]">Due Date</span>
                                <span className="font-medium text-slate-700">{formatDate(s.dueDate)}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-slate-400 block text-[10px]">Installment Amount</span>
                                <span className="font-semibold text-slate-800">{formatCurrency(s.emi)}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[10px]">
                                  {isAffected ? "Amount Paid (Preview)" : "Amount Paid"}
                                </span>
                                <span className={`font-bold ${isAffected ? "text-purple-900" : "text-slate-700"}`}>
                                  {formatCurrency(displayedPaid)}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="text-slate-400 block text-[10px]">
                                  {isAffected ? "Remaining (Preview)" : "Remaining Due"}
                                </span>
                                <span className={`font-bold ${isAffected ? "text-purple-950" : "text-slate-800"}`}>
                                  {formatCurrency(displayedRemainingDue)}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                    {/* Excess Advance Notice (if amount exceeds all installments) */}
                    {allocationPreview.unappliedAdvance > 0 && (
                      <div className="px-4 py-2 bg-blue-50/80 border-t border-blue-200/60 flex items-center justify-between text-xs text-blue-900 font-semibold">
                        <span>Unapplied Advance (exceeds all remaining installments):</span>
                        <span className="font-bold text-blue-800">{formatCurrency(allocationPreview.unappliedAdvance)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer (Sticky bottom so Confirm Collection is always reachable) */}
              <div className="flex items-center justify-end gap-2.5 sm:gap-3 px-4 sm:px-6 py-3 sm:py-3.5 bg-white border-t border-slate-100 sticky bottom-0 z-20 shrink-0">
                {isPenaltyOnlyMode ? (
                  <div className="mr-auto text-xs text-slate-600 hidden sm:flex items-center gap-1.5">
                    <span>Penalty Collection Only:</span>
                    <strong className="text-amber-800 font-extrabold text-sm">{formatCurrency(enteredPenaltyAmt)}</strong>
                  </div>
                ) : enteredPenaltyAmt > 0 && (
                  <div className="mr-auto text-xs text-slate-600 hidden sm:flex items-center gap-1.5">
                    <span>Due: <strong className="text-slate-800">{formatCurrency(amountReceived)}</strong></span>
                    <span>+</span>
                    <span>Penalty: <strong className="text-amber-800">{formatCurrency(enteredPenaltyAmt)}</strong></span>
                    <span>=</span>
                    <span>Total: <strong className="text-[#006052] font-extrabold">{formatCurrency(totalAmountToCollect)}</strong></span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedCustomer(null)}
                  disabled={isSubmitting}
                  className="rounded-xl border border-slate-200 bg-white px-4 sm:px-5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPayment}
                  disabled={(isPenaltyOnlyMode ? (enteredPenaltyAmt <= 0 || isPenaltyFrozen) : totalAmountToCollect <= 0) || isSubmitting}
                  className="rounded-xl bg-[#006052] px-5 sm:px-6 py-2 text-xs font-bold text-white shadow-2xs hover:bg-[#004d43] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSubmitting
                    ? "Processing Payment..."
                    : isPenaltyOnlyMode
                      ? `Confirm Penalty Collection (${formatCurrency(enteredPenaltyAmt)})`
                      : totalAmountToCollect > 0
                        ? `Confirm Collection (${formatCurrency(totalAmountToCollect)})`
                        : "Confirm Collection"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* =========================================================================
          2. AMOUNT COLLECTED SUCCESSFULLY CONFIRMATION POPUP (REDESIGNED TO MATCH REFERENCE)
          Displays transaction details, loan-level outstanding (Principal, Interest, Total),
          and installment allocations clearly separated.
      ========================================================================= */}
      {confirmedTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 sm:p-4 md:p-6 backdrop-blur-xs overflow-y-auto overscroll-contain">
          <div className="w-full max-w-4xl max-h-[calc(100dvh-1rem)] sm:max-h-[92vh] rounded-2xl bg-white shadow-2xl relative flex flex-col border border-slate-200 overflow-hidden my-auto">
            {/* Header (Sticky top) */}
            <div className="flex items-center justify-between px-5 sm:px-6 pt-5 pb-3 border-b border-slate-100 bg-white sticky top-0 z-20 shrink-0">
              <div className="flex items-center gap-3.5">
                <div className="relative flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100/90 text-emerald-800 shadow-2xs ring-4 ring-emerald-50">
                  <CheckCircle2 className="h-6 w-6 sm:h-7 sm:w-7" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                    {confirmedTransaction.isPenaltyOnly ? "Penalty Collected Successfully" : "Amount Collected Successfully"}
                  </h3>
                  <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5">
                    {confirmedTransaction.isPenaltyOnly
                      ? "Penalty recorded as separate Penalty Income and synchronized with Penalty Log"
                      : "Transaction recorded and synchronized across Ledger, Loan, and Dashboard"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmedTransaction(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="px-5 sm:px-6 py-4 space-y-3.5 overflow-y-auto flex-1 overscroll-contain [webkit-overflow-scrolling:touch]">
              {/* 1. Transaction Summary Strip */}
              <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
                {/* Left side items in a grid/flex */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 flex-1 items-center divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
                  {/* TRANSACTION AMOUNT */}
                  <div className="flex items-center gap-2.5 pt-2 first:pt-0 sm:pt-0">
                    <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 shrink-0">
                      <CreditCard className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                        TRANSACTION AMOUNT
                      </span>
                      <p className="text-base sm:text-lg font-bold text-emerald-800 leading-snug">
                        {formatCurrency(confirmedTransaction.amount)}
                      </p>
                    </div>
                  </div>

                  {/* CUSTOMER */}
                  <div className="flex items-center gap-2.5 pt-2 sm:pt-0 sm:pl-3 min-w-0">
                    <User className="h-4 w-4 text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                        CUSTOMER
                      </span>
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {confirmedTransaction.customerName}
                      </p>
                      {confirmedTransaction.customerId && (
                        <span className="text-[10px] text-slate-400 block font-mono truncate">
                          {confirmedTransaction.customerId}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* LOAN ID */}
                  <div className="flex items-center gap-2.5 pt-2 sm:pt-0 sm:pl-3 min-w-0">
                    <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                        LOAN ID
                      </span>
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {confirmedTransaction.loanId}
                      </p>
                      {confirmedTransaction.loanAmount > 0 && (
                        <span className="text-[10px] text-slate-500 block">
                          Amount: {formatCurrency(confirmedTransaction.loanAmount)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* PAYMENT DATE */}
                  <div className="flex items-center gap-2.5 pt-2 sm:pt-0 sm:pl-3 min-w-0">
                    <CalendarIcon className="h-4 w-4 text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                        PAYMENT DATE
                      </span>
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {formatDate(confirmedTransaction.date)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Right side box: PAYMENT METHOD */}
                <div className="rounded-xl border border-slate-200 bg-white p-2.5 sm:px-3 sm:py-2 shrink-0 md:min-w-[130px] flex flex-col justify-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    PAYMENT METHOD
                  </span>
                  <div className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 border border-emerald-200 w-fit">
                    {confirmedTransaction.mode === "Cash" ? (
                      <Banknote className="h-3.5 w-3.5 text-emerald-700" />
                    ) : confirmedTransaction.mode === "UPI" ? (
                      <ArrowRight className="h-3.5 w-3.5 text-emerald-700 -rotate-45" />
                    ) : (
                      <Building2 className="h-3.5 w-3.5 text-emerald-700" />
                    )}
                    <span>{confirmedTransaction.mode || "Cash"}</span>
                  </div>
                  {confirmedTransaction.transactionId && (
                    <span className="text-[10px] font-mono text-slate-500 mt-1 block truncate">
                      ID: {confirmedTransaction.transactionId}
                    </span>
                  )}
                </div>
              </div>

              {/* 2. OVERALL LOAN BALANCE AFTER PAYMENT */}
              <div className="rounded-xl border border-emerald-200/90 bg-emerald-50/25 p-3.5 sm:p-4 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-1">
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded-md bg-emerald-100 text-emerald-800">
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-950">
                        OVERALL LOAN BALANCE AFTER PAYMENT
                      </h4>
                      <p className="text-[11px] text-emerald-800/80 font-medium">
                        Customer's entire remaining loan obligation across all installments
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200/80 w-fit self-start sm:self-auto">
                    Loan Level
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* TOTAL PRINCIPAL OUTSTANDING */}
                  <div className="rounded-xl bg-white border border-slate-200 p-3 sm:p-3.5 flex items-start gap-3 shadow-2xs">
                    <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 shrink-0 mt-0.5">
                      <Layers className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 truncate">
                        TOTAL PRINCIPAL OUTSTANDING
                      </p>
                      <p className="text-lg font-bold text-slate-900 mt-0.5 truncate">
                        {formatCurrency(confirmedTransaction.totalPrincipalOutstanding)}
                      </p>
                    </div>
                  </div>

                  {/* TOTAL INTEREST OUTSTANDING */}
                  <div className="rounded-xl bg-white border border-slate-200 p-3 sm:p-3.5 flex items-start gap-3 shadow-2xs">
                    <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 shrink-0 mt-0.5">
                      <Percent className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 truncate">
                        TOTAL INTEREST OUTSTANDING
                      </p>
                      <p className="text-lg font-bold text-slate-900 mt-0.5 truncate">
                        {formatCurrency(confirmedTransaction.totalInterestOutstanding)}
                      </p>
                    </div>
                  </div>

                  {/* TOTAL LOAN OUTSTANDING */}
                  <div className="rounded-xl bg-white border border-emerald-200 p-3 sm:p-3.5 flex items-start gap-3 shadow-2xs">
                    <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 shrink-0 mt-0.5">
                      <IndianRupee className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-900 truncate">
                        TOTAL LOAN OUTSTANDING
                      </p>
                      <p className="text-lg font-bold text-emerald-800 mt-0.5 truncate">
                        {formatCurrency(confirmedTransaction.totalLoanOutstanding)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. INSTALLMENT PAYMENT BREAKDOWN / PENALTY BREAKDOWN */}
              {confirmedTransaction.isPenaltyOnly ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 shadow-2xs">
                  <div className="flex items-center gap-2 mb-2 text-amber-900 font-bold text-xs uppercase tracking-wider">
                    <FileText className="h-4 w-4" />
                    <span>Penalty Collection Breakdown</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase">Installment</span>
                      <span className="font-bold text-slate-900">Installment {confirmedTransaction.installmentNumber}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase">Amount Collected</span>
                      <span className="font-bold text-emerald-700">{formatCurrency(confirmedTransaction.amount)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase">Accounting Type</span>
                      <span className="font-bold text-amber-800">Separate Penalty Income</span>
                    </div>
                  </div>
                  <p className="mt-3 text-[11px] text-slate-500 italic">
                    Strict Financial Separation: Loan principal outstanding and interest outstanding remain unchanged.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
                  {/* Section Header */}
                  <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-slate-500" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        INSTALLMENT PAYMENT BREAKDOWN
                      </h4>
                    </div>
                    <span className="text-[11px] text-slate-400 font-medium">
                      {confirmedTransaction.allocations?.length || 0} Installment(s) applied
                    </span>
                  </div>

                  {/* Table for Tablet / Desktop */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-xs text-left min-w-[580px]">
                      <thead className="bg-slate-50/70 border-b border-slate-100 text-slate-600 font-semibold text-[11px]">
                        <tr>
                          <th className="px-4 py-2">Installment</th>
                          <th className="px-4 py-2">Due Date</th>
                          <th className="px-4 py-2 text-right">Remaining Due</th>
                          <th className="px-4 py-2 text-right">Amount Received</th>
                          <th className="px-4 py-2 text-right">Interest / Principal Paid</th>
                          <th className="px-4 py-2 text-right">Remaining Balance</th>
                          <th className="px-4 py-2 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {confirmedTransaction.allocations?.map((al) => {
                          const preRemainingDue = al.previousRemainingDue !== undefined
                            ? al.previousRemainingDue
                            : al.allocated + (al.balanceAfter || 0);

                          return (
                            <tr key={al.installmentNumber} className="hover:bg-slate-50/60">
                              <td className="px-4 py-2.5 font-bold text-slate-900">{al.installmentNumber}</td>
                              <td className="px-4 py-2.5 text-slate-600">{formatDate(al.dueDate)}</td>
                              <td className="px-4 py-2.5 text-right font-medium text-slate-700">
                                {formatCurrency(preRemainingDue)}
                              </td>
                              <td className="px-4 py-2.5 text-right font-bold text-emerald-800">
                                {formatCurrency(al.allocated)}
                              </td>
                              <td className="px-4 py-2.5 text-right text-slate-500 whitespace-nowrap">
                                {formatCurrency(al.interestPaid)} / {formatCurrency(al.principalPaid)}
                              </td>
                              <td className="px-4 py-2.5 text-right font-bold text-slate-900">
                                {formatCurrency(al.balanceAfter)}
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                {al.statusAfter === "Paid" ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-600/20">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                                    Paid
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-600/20">
                                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                                    Partial
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Card View (shown on xs screens) */}
                  <div className="block sm:hidden divide-y divide-slate-100 bg-white">
                    {confirmedTransaction.allocations?.map((al) => {
                      const preRemainingDue = al.previousRemainingDue !== undefined
                        ? al.previousRemainingDue
                        : al.allocated + (al.balanceAfter || 0);

                      return (
                        <div key={al.installmentNumber} className="p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-900">
                              Installment {al.installmentNumber}
                            </span>
                            <div>
                              {al.statusAfter === "Paid" ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-600/20">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                                  Paid
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-600/20">
                                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                                  Partial
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-100">
                            <div>
                              <span className="text-slate-400 block text-[10px]">Due Date</span>
                              <span className="font-medium text-slate-700">{formatDate(al.dueDate)}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-slate-400 block text-[10px]">Remaining Due</span>
                              <span className="font-medium text-slate-700">{formatCurrency(preRemainingDue)}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[10px]">Amount Received</span>
                              <span className="font-bold text-emerald-800">{formatCurrency(al.allocated)}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-slate-400 block text-[10px]">Remaining Balance</span>
                              <span className="font-bold text-slate-900">{formatCurrency(al.balanceAfter)}</span>
                            </div>
                            <div className="col-span-2 text-slate-500 text-[10px] pt-0.5">
                              Interest / Principal Paid: <span className="font-semibold text-slate-700">{formatCurrency(al.interestPaid)} / {formatCurrency(al.principalPaid)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {confirmedTransaction.advanceCreated > 0 && (
                    <div className="px-4 py-2 bg-blue-50/80 border-t border-blue-200/60 flex items-center justify-between text-xs text-blue-900 font-semibold">
                      <span>Excess Advance Created:</span>
                      <span className="font-bold text-blue-800">{formatCurrency(confirmedTransaction.advanceCreated)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer Buttons (Sticky bottom) */}
            <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-3.5 bg-white border-t border-slate-100 sticky bottom-0 z-20 shrink-0">
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-xl border border-slate-200 bg-white px-4 sm:px-5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2 shadow-2xs"
              >
                <Printer className="h-4 w-4" />
                <span>Print Receipt</span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmedTransaction(null)}
                className="rounded-xl bg-[#006052] px-6 sm:px-8 py-2 text-xs font-bold text-white shadow-2xs hover:bg-[#004d43] transition-colors flex items-center gap-2"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          3. VIEW SCHEDULE MODAL (FOR SELECTED CUSTOMER LOAN)
      ========================================================================= */}
      {scheduleModalCustomer && (() => {
        const c = scheduleModalCustomer;
        const schedule = c.fullSchedule || [];
        const customerName = c.customer?.name || "Customer";
        const customerId = c.customerId;
        const loanId = c.loanId;
        const vehicleReg = c.vehicle?.regNo;
        const frequency = c.paymentFrequency || c.loan?.paymentFrequency || "Monthly";

        // Total stats for this loan
        const totalPrincipal = Number(c.loanAmount || (Number(c.loan?.vehicleAmount) - Number(c.loan?.downPayment || 0)) || 0);
        const totalPaid = schedule.reduce((sum, s) => sum + Number(s.amountPaid || 0), 0);
        const totalOutstanding = schedule.reduce(
          (sum, s) => sum + Math.max(0, Number(s.emi || 0) - Number(s.amountPaid || 0)),
          0
        );

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 sm:p-4 md:p-6 backdrop-blur-xs overflow-hidden overscroll-contain">
            <div className="w-full max-w-4xl max-h-[92vh] sm:max-h-[86vh] rounded-2xl bg-white shadow-2xl relative flex flex-col border border-slate-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 bg-white sticky top-0 z-20 shrink-0">
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-[#006052] ring-2 sm:ring-4 ring-teal-50/50">
                    <CalendarIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <h3 className="text-sm sm:text-base md:text-lg font-bold text-slate-900 leading-tight truncate">
                        Repayment Schedule
                      </h3>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        {frequency}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5">
                      <span className="font-bold text-slate-800">{customerName}</span>
                      <span>•</span>
                      <span className="font-mono">{customerId}</span>
                      <span>•</span>
                      <span className="font-mono font-semibold text-slate-700">{loanId}</span>
                      {vehicleReg && (
                        <>
                          <span className="hidden sm:inline">•</span>
                          <span className="hidden sm:inline">{vehicleReg}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setScheduleModalCustomer(null)}
                  className="rounded-lg p-1.5 sm:p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors shrink-0 cursor-pointer"
                  aria-label="Close modal"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Summary KPIs Banner */}
              <div className="grid grid-cols-3 gap-2 px-4 sm:px-6 py-2.5 bg-slate-50 border-b border-slate-100 text-xs shrink-0">
                <div className="min-w-0">
                  <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase tracking-wider block truncate">
                    Loan Amount
                  </span>
                  <p className="text-xs sm:text-sm font-bold text-slate-900 truncate mt-0.5">
                    {formatCurrency(totalPrincipal)}
                  </p>
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase tracking-wider block truncate">
                    Total Paid
                  </span>
                  <p className="text-xs sm:text-sm font-bold text-emerald-700 truncate mt-0.5">
                    {formatCurrency(totalPaid)}
                  </p>
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase tracking-wider block truncate">
                    Outstanding
                  </span>
                  <p className="text-xs sm:text-sm font-bold text-amber-700 truncate mt-0.5">
                    {formatCurrency(totalOutstanding)}
                  </p>
                </div>
              </div>

              {/* Compact Scrollable Schedule Table Container */}
              <div className="flex-1 overflow-y-auto overflow-x-auto min-h-0 p-3 sm:p-5">
                {schedule.length === 0 ? (
                  <div className="py-12 text-center text-slate-400">
                    <p className="text-sm font-semibold text-slate-600">No schedule available</p>
                    <p className="text-xs mt-1">Repayment schedule has not been generated for this loan.</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50/95 sticky top-0 z-10 border-b border-slate-200">
                        <tr>
                          <th className="px-3.5 py-2.5 font-bold uppercase tracking-wider text-slate-600 text-[11px]">
                            Instalment #
                          </th>
                          <th className="px-3.5 py-2.5 font-bold uppercase tracking-wider text-slate-600 text-[11px]">
                            Due Date
                          </th>
                          <th className="px-3.5 py-2.5 font-bold uppercase tracking-wider text-slate-600 text-[11px] text-right">
                            Amount
                          </th>
                          <th className="px-3.5 py-2.5 font-bold uppercase tracking-wider text-slate-600 text-[11px] text-right">
                            Paid Amount
                          </th>
                          <th className="px-3.5 py-2.5 font-bold uppercase tracking-wider text-slate-600 text-[11px] text-right">
                            Outstanding Amount
                          </th>
                          <th className="px-3.5 py-2.5 font-bold uppercase tracking-wider text-slate-600 text-[11px] text-center">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {schedule.map((row) => {
                          const emi = Number(row.emi || 0);
                          const paid = Number(row.amountPaid || 0);
                          const outstanding = Math.max(0, Math.round((emi - paid) * 100) / 100);
                          const isMidwaySettled = Boolean(
                            row.isMidwayClosed || row.closureAdjusted || row.status === "Midway Closed"
                          );

                          let rowStatus = "Due";
                          if (isMidwaySettled) {
                            rowStatus = "Paid";
                          } else if (outstanding <= 0.01 && emi > 0) {
                            rowStatus = "Paid";
                          } else if (paid > 0.01) {
                            rowStatus = "Partial";
                          } else {
                            const d = new Date(row.dueDate);
                            d.setHours(0, 0, 0, 0);
                            const t = new Date(date);
                            t.setHours(0, 0, 0, 0);
                            if (!isNaN(d.getTime()) && d.getTime() < t.getTime()) {
                              rowStatus = "Overdue";
                            } else {
                              rowStatus = "Due";
                            }
                          }

                          const penaltyAmt = (!isMidwaySettled && rowStatus === "Overdue")
                            ? getInstallmentPenaltySupportingAmount(row, {
                              loanId,
                              frequency,
                              referenceDate: date ? new Date(date) : new Date(),
                            })
                            : null;

                          return (
                            <tr
                              key={row.installmentNumber}
                              className={`transition-colors ${isMidwaySettled
                                  ? "bg-amber-50/70 hover:bg-amber-100/60"
                                  : "hover:bg-slate-50/70"
                                }`}
                            >
                              <td className={`px-3.5 py-2.5 whitespace-nowrap font-medium ${isMidwaySettled ? "text-amber-950 font-semibold" : "text-slate-700"
                                }`}>
                                {row.installmentNumber}
                              </td>
                              <td className="px-3.5 py-2.5 whitespace-nowrap font-medium text-slate-800">
                                {formatDate(row.dueDate)}
                              </td>
                              <td className="px-3.5 py-2.5 whitespace-nowrap text-right font-medium text-slate-700">
                                {formatCurrency(emi)}
                              </td>
                              <td className="px-3.5 py-2.5 whitespace-nowrap text-right font-semibold text-emerald-700">
                                {formatCurrency(paid)}
                              </td>
                              <td className="px-3.5 py-2.5 whitespace-nowrap text-right font-semibold text-slate-900">
                                {formatCurrency(outstanding)}
                              </td>
                              <td className="px-3.5 py-2.5 whitespace-nowrap text-center">
                                {isMidwaySettled ? (
                                  <span className="inline-flex items-center rounded-full bg-orange-100/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-900 border border-amber-300 ring-1 ring-amber-500/20">
                                    Paid
                                  </span>
                                ) : rowStatus === "Paid" ? (
                                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                                    Paid
                                  </span>
                                ) : rowStatus === "Partial" ? (
                                  <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 ring-1 ring-inset ring-amber-600/20">
                                    Partial
                                  </span>
                                ) : rowStatus === "Overdue" ? (
                                  <div className="flex flex-col items-center justify-center gap-0.5">
                                    <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-700 ring-1 ring-inset ring-red-600/10">
                                      Overdue
                                    </span>
                                    {penaltyAmt > 0 && (
                                      <span className="text-[10px] font-semibold text-[#006052] whitespace-nowrap leading-tight">
                                        Penalty: ₹{Number(penaltyAmt).toLocaleString('en-IN')}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700 ring-1 ring-inset ring-slate-500/20">
                                    Due
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Modal Footer Actions */}
              <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 bg-white border-t border-slate-200 sticky bottom-0 z-20 shrink-0">
                <button
                  type="button"
                  onClick={() => setScheduleModalCustomer(null)}
                  className="rounded-xl border border-slate-300 bg-white px-4 sm:px-5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
                >
                  Close
                </button>
                {totalOutstanding > 0.01 && (
                  <button
                    type="button"
                    onClick={() => {
                      const cust = scheduleModalCustomer;
                      setScheduleModalCustomer(null);
                      handleCollectClick(cust);
                    }}
                    className="rounded-xl bg-[#006052] px-5 sm:px-6 py-2 text-xs font-bold text-white shadow-2xs hover:bg-[#004d43] transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Collect Payment</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* =========================================================================
          4. READ-ONLY COLLECTION DETAILS MODAL FOR COLLECTION HISTORY
          Displays:
          - Customer Name
          - Loan ID
          - Amount Collected
          - Principal Collected
          - Interest Collected
          - Collection Date & Time
          - Payment Mode
          - EMI / Instalment Number
          - Payment Status ("Collected")
          - UPI Transaction ID (Only when paymentMode is UPI, otherwise hidden)
      ========================================================================= */}
      {selectedHistoryTx && (() => {
        const tx = selectedHistoryTx;
        const isUpi = (tx.mode || "").toUpperCase() === "UPI";
        const upiTxId = tx.transactionId || (tx.mode === "UPI" ? tx.transactionRef : null);
        const prin = tx.principal !== undefined ? Number(tx.principal || 0) : (
          Array.isArray(tx.allocations)
            ? tx.allocations.reduce((s, a) => s + Number(a.principalPaid || 0), 0)
            : Number(tx.amount || 0)
        );
        const intr = tx.interest !== undefined ? Number(tx.interest || 0) : (
          Array.isArray(tx.allocations)
            ? tx.allocations.reduce((s, a) => s + Number(a.interestPaid || 0), 0)
            : 0
        );

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 md:p-6 backdrop-blur-xs overflow-y-auto overscroll-contain"
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelectedHistoryTx(null);
            }}
          >
            <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl relative flex flex-col border border-slate-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100 bg-white">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 leading-tight">Collection Details</h3>
                    <p className="text-xs text-slate-500 font-medium">Completed Collection Transaction</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedHistoryTx(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-5 sm:p-6 space-y-4">
                {/* Hero Amount Banner */}
                <div className="rounded-xl bg-emerald-50/70 border border-emerald-100/80 p-4 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider block">
                      Amount Collected
                    </span>
                    <span className="text-2xl font-black text-emerald-900 mt-0.5 block">
                      {formatCurrency(tx.amount)}
                    </span>
                  </div>
                  <span className="inline-flex items-center rounded-md bg-emerald-100/80 px-2.5 py-1 text-xs font-bold text-emerald-800 ring-1 ring-inset ring-emerald-600/30">
                    Collected
                  </span>
                </div>

                {/* Key Details Grid */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 divide-y divide-slate-100 text-xs">
                  <div className="flex items-center justify-between py-2 first:pt-0">
                    <span className="text-slate-500 font-medium">Customer Name</span>
                    <span className="font-bold text-slate-900 text-right">{tx.customerName || "Customer"}</span>
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <span className="text-slate-500 font-medium">Loan ID</span>
                    <span className="font-semibold text-slate-800">{tx.loanId}</span>
                  </div>

                  {tx.customerId && (
                    <div className="flex items-center justify-between py-2">
                      <span className="text-slate-500 font-medium">Customer ID</span>
                      <span className="font-semibold text-slate-700">{tx.customerId}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between py-2">
                    <span className="text-slate-500 font-medium">EMI / Instalment Number</span>
                    <span className="font-bold text-slate-900 font-mono">{formatInstallmentDisplay(tx)}</span>
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <span className="text-slate-500 font-medium">Principal Collected</span>
                    <span className="font-bold text-slate-800">{formatCurrency(prin)}</span>
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <span className="text-slate-500 font-medium">Interest Collected</span>
                    <span className="font-bold text-slate-800">{formatCurrency(intr)}</span>
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <span className="text-slate-500 font-medium">Collection Date & Time</span>
                    <span className="font-medium text-slate-700">{formatDateTime(tx.date, tx)}</span>
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <span className="text-slate-500 font-medium">Payment Mode</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-white text-slate-700 border border-slate-200">
                      {tx.mode || "Cash"}
                    </span>
                  </div>

                  {/* UPI Transaction ID: For UPI payments, display the exact ID entered by admin, or '-' if not entered.
                      For non-UPI payment modes, display '-'. */}
                  <div className="flex items-center justify-between py-2">
                    <span className="text-slate-500 font-medium">UPI Transaction ID</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {isUpi && upiTxId && String(upiTxId).trim() ? String(upiTxId).trim() : "-"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-2 last:pb-0">
                    <span className="text-slate-500 font-medium">Payment Status</span>
                    <span className="font-bold text-emerald-700">Collected</span>
                  </div>
                </div>

                {tx.remarks && (
                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
                    <span className="text-slate-400 font-medium block text-[10px] uppercase">Remarks</span>
                    <p className="text-slate-700 mt-0.5 font-medium">{tx.remarks}</p>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end px-5 sm:px-6 py-3.5 bg-white border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedHistoryTx(null)}
                  className="rounded-xl border border-slate-200 bg-white px-5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Midway Closure Modal */}
      <MidwayClosureModal
        isOpen={showMidwayModal}
        onClose={() => {
          setShowMidwayModal(false);
          loadCustomers();
        }}
        onSuccess={() => {
          loadCustomers();
        }}
      />
    </div>
  );
};

export default Collection;
