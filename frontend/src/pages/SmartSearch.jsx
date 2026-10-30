import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Calendar as CalendarIcon,
  X,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  ArrowRight,
  Filter,
  Bike,
  Car,
} from "lucide-react";

import { generateSchedule } from "../components/RepaymentScheduleTable";
import RepaymentScheduleTable from "../components/RepaymentScheduleTable";
import { calculateLoanOutstanding } from "../utils/loanCalculations";
import { syncVehiclesWithClosedLoans } from "../utils/vehicleStatusHelper";
import { normalizeVehicleType } from "../utils/vehicleImageHelper";
import { getLoanPenaltySummary, usePenaltyData } from "../utils/penaltyRules";
import { DATA_CHANGED_EVENT } from "../services/api";
import { loadCustomerEntries } from "../services/customerApi";
import { loadPayments } from "../services/collectionApi";
import { formatDate, parseToDate, getLocalDateString } from "../utils/dateUtils";

// Dedicated 3-wheeler auto-rickshaw icon in matching stroke style
const ThreeWheelerIcon = ({ className = "h-3.5 w-3.5 shrink-0" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="5" cy="18" r="2.5" />
    <circle cx="18" cy="18" r="2.5" />
    <path d="M7.5 18h8" />
    <path d="M5 15.5l2-8h6.5l3.5 6v4.5" />
    <path d="M10 7.5v8" />
    <path d="M16 13h4" />
  </svg>
);

const formatCurrency = (value) => {
  if (value === undefined || value === null || isNaN(Number(value))) return "₹0";
  return `₹${Math.round(Number(value)).toLocaleString("en-IN")}`;
};

const parseToDayTimestamp = (dateInput) => {
  if (!dateInput) return null;
  const d = parseToDate(dateInput);
  if (!d || isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

export default function SmartSearch() {
  const navigate = useNavigate();

  // Search input
  const [searchQuery, setSearchQuery] = useState("");

  // Five Filter states (User-controlled inputs)
  const [customerStatusInput, setCustomerStatusInput] = useState("All Customers");
  const [loanStatusInput, setLoanStatusInput] = useState("All Loans");
  const [dueDateInput, setDueDateInput] = useState("");
  const [vehicleTypeInput, setVehicleTypeInput] = useState("All Vehicle Types");
  const [frequencyInput, setFrequencyInput] = useState("All Frequencies");

  // Applied Filter states (Committed when clicking "Apply Filters")
  const [appliedFilters, setAppliedFilters] = useState({
    customerStatus: "All Customers",
    loanStatus: "All Loans",
    dueDate: "",
    vehicleType: "All Vehicle Types",
    frequency: "All Frequencies",
  });

  // Quick-Filter state: null | 'overdue' | 'penalty' | 'partial'
  const [quickFilter, setQuickFilter] = useState(null);

  // Pagination state: Exactly 5 records per page
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 5;

  // View Schedule Modal state
  const [scheduleModalRecord, setScheduleModalRecord] = useState(null);

  // Raw data stores
  const [rawCustomers, setRawCustomers] = useState([]);
  const [allPayments, setAllPayments] = useState([]);

  const [loadError, setLoadError] = useState("");
  const penaltyVersion = usePenaltyData();

  // Loans and payments from the API; reload after any save.
  useEffect(() => {
    let active = true;
    const loadData = () =>
      Promise.all([loadCustomerEntries(), loadPayments()])
        .then(([entries, payments]) => {
          if (!active) return;
          setRawCustomers(syncVehiclesWithClosedLoans(entries));
          setAllPayments(payments);
          setLoadError("");
        })
        .catch((error) => active && setLoadError(error.message));

    loadData();
    window.addEventListener(DATA_CHANGED_EVENT, loadData);
    return () => {
      active = false;
      window.removeEventListener(DATA_CHANGED_EVENT, loadData);
    };
  }, []);

  // Process and enrich each customer and loan record with real schedule, vehicle, and penalty data
  const enrichedRecords = useMemo(() => {
    const todayTimestamp = parseToDayTimestamp(new Date());

    return rawCustomers.map((record, index) => {
      const customer = record.customer || {};
      const vehicle = record.vehicle || {};
      const loan = record.loan || {};

      const customerId =
        record.customerId ||
        customer.customerId ||
        (customer.mobile && customer.mobile.trim().length >= 5 && !/^0+$/.test(customer.mobile.trim().slice(-5))
          ? `CUS-${customer.mobile.trim().slice(-5)}`
          : `CUS-${String(index + 1).padStart(3, "0")}`);

      const loanId = record.loanId || loan.loanId || `LN-${String(index + 1).padStart(3, "0")}`;
      const customerName = customer.name || record.name || "Customer";
      const mobile = customer.mobile || record.mobile || "—";
      const customerStatus = customer.status || record.customerStatus || "Active";

      // Vehicle categorization
      const vehicleName = vehicle.name || vehicle.model || vehicle.vehicleModel || "Vehicle";
      const regNo = vehicle.regNo || vehicle.registrationNumber || vehicle.regNumber || "—";
      const normType = normalizeVehicleType(vehicle.type || vehicle.vehicleType);
      const vehicleCategoryBadge =
        normType === "Three Wheeler" ? "3 Wheeler" : normType === "Four Wheeler" ? "4 Wheeler" : "2 Wheeler";

      // Payment frequency
      const paymentFrequency = loan.paymentFrequency || record.paymentFrequency || "Monthly";

      // Calculate schedule & loan outstanding
      let schedule = record.repaymentSchedule;
      if (!schedule || schedule.length === 0) {
        const P = Number(record.loanAmount || Number(loan.vehicleAmount || 0) - Number(loan.downPayment || 0) || 0);
        if (P > 0 && loan.interestRate && loan.tenure) {
          schedule = generateSchedule({
            loanAmount: P,
            interestRate: loan.interestRate,
            tenure: loan.tenure,
            tenureUnit: loan.tenureUnit || "Months",
            paymentFrequency: loan.paymentFrequency || paymentFrequency,
            interestType: loan.interestType || "Reducing Balance",
            repaymentMethod: loan.repaymentMethod || "EMI",
            firstDueDate: loan.firstDueDate || record.nextDueDate,
          });
        } else {
          schedule = [];
        }
      }

      const loanCalc = calculateLoanOutstanding(record, allPayments);
      const effectiveSchedule =
        loanCalc.effectiveSchedule && loanCalc.effectiveSchedule.length > 0
          ? loanCalc.effectiveSchedule
          : schedule;

      // Identify overdue installments
      const overdueInstalls = effectiveSchedule.filter((s) => {
        const isNotCollected = s.status !== "Collected" && s.status !== "Paid";
        const hasBalance = s.emi - (s.amountPaid || 0) > 0.01;
        const dueTs = parseToDayTimestamp(s.dueDate);
        return isNotCollected && hasBalance && dueTs !== null && dueTs < todayTimestamp;
      });

      // Identify partially paid installments
      const hasPartialPayment = effectiveSchedule.some(
        (s) => s.status === "Partial" || ((s.amountPaid || 0) > 0.01 && (s.amountPaid || 0) < s.emi - 0.01)
      );

      // Determine loan status
      const rawStatus = String(record.status || loan.status || "").trim();
      const isForeclosed = rawStatus.toLowerCase() === "foreclosed" || Boolean(record.isForeclosed || record.foreclosure);
      const isMidwayClosed = Boolean(
        record.isMidwayClosed ||
        record.midwayClosure ||
        rawStatus.toLowerCase() === "midway closed" ||
        String(record.closureType || "").toLowerCase() === "midway closure"
      );

      let loanStatus = "Active";
      if (isMidwayClosed) {
        loanStatus = "Midway Closed";
      } else if (isForeclosed) {
        loanStatus = "Foreclosed";
      } else if (rawStatus.toLowerCase() === "closed" || (loanCalc.outstandingAmount <= 0.01 && rawStatus !== "Foreclosed")) {
        loanStatus = "Closed";
      } else if (overdueInstalls.length > 0) {
        loanStatus = "Overdue";
      } else {
        loanStatus = "Active";
      }

      // Next / applicable installment due date
      let relevantDueDate = null;
      let isDueDateOverdue = false;

      if (overdueInstalls.length > 0) {
        relevantDueDate = overdueInstalls[0].dueDate;
        isDueDateOverdue = true;
      } else {
        const nextUnpaid = effectiveSchedule.find(
          (s) => s.status !== "Collected" && s.status !== "Paid" && s.emi - (s.amountPaid || 0) > 0.01
        );
        relevantDueDate = nextUnpaid ? nextUnpaid.dueDate : null;
      }

      // Check penalties via centralized rules
      const penaltySummary = getLoanPenaltySummary(
        loanId,
        customerId,
        customerName,
        effectiveSchedule,
        paymentFrequency,
        new Date()
      );

      const hasFrozenPenalty = penaltySummary.frozenPenalties.length > 0;
      const totalFrozenPenalty = penaltySummary.totalFrozenPenalty;
      const hasPendingPenalty = penaltySummary.pendingPenalties.length > 0;
      const totalPendingPenalty = penaltySummary.totalPendingPenalty;

      const applicablePenaltyAmount = hasPendingPenalty
        ? totalPendingPenalty
        : hasFrozenPenalty
        ? totalFrozenPenalty
        : 0;

      let penaltyDisplay = "No Penalty";
      let penaltyState = "none";

      if (hasFrozenPenalty && totalFrozenPenalty > 0) {
        penaltyDisplay = `Frozen (${formatCurrency(totalFrozenPenalty)})`;
        penaltyState = "frozen";
      } else if (hasPendingPenalty && totalPendingPenalty > 0) {
        penaltyDisplay = formatCurrency(totalPendingPenalty);
        penaltyState = "pending";
      } else if (penaltySummary.cancelledPenalties.length > 0) {
        penaltyDisplay = "Cancelled";
        penaltyState = "cancelled";
      } else if (penaltySummary.collectedPenalties.length > 0) {
        penaltyDisplay = "Collected";
        penaltyState = "collected";
      }

      return {
        rawRecord: record,
        customerId,
        loanId,
        customerName,
        mobile,
        customerStatus,
        loanStatus,
        vehicleName,
        regNo,
        vehicleCategoryBadge,
        paymentFrequency,
        relevantDueDate,
        isDueDateOverdue,
        effectiveSchedule,
        overdueCount: overdueInstalls.length,
        hasOverdue: overdueInstalls.length > 0,
        hasPartialPayment,
        applicablePenaltyAmount,
        penaltyDisplay,
        penaltyState,
        outstandingAmount: loanCalc.outstandingAmount,
        loanCalc,
      };
    });
  }, [rawCustomers, allPayments, penaltyVersion]);

  // Combined Search and Filter execution
  const filteredRecords = useMemo(() => {
    return enrichedRecords.filter((row) => {
      // 1. Text Search across: Customer Name, Customer ID, Loan ID, Mobile
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesName = row.customerName.toLowerCase().includes(q);
        const matchesCustId = row.customerId.toLowerCase().includes(q);
        const matchesLoanId = row.loanId.toLowerCase().includes(q);
        const matchesMobile = row.mobile.toLowerCase().includes(q);

        if (!matchesName && !matchesCustId && !matchesLoanId && !matchesMobile) {
          return false;
        }
      }

      // 2. Customer Status Filter
      if (appliedFilters.customerStatus !== "All Customers") {
        const statusMatch =
          appliedFilters.customerStatus.toLowerCase() === row.customerStatus.toLowerCase();
        if (!statusMatch) return false;
      }

      // 3. Loan Status Filter
      if (appliedFilters.loanStatus !== "All Loans") {
        if (appliedFilters.loanStatus.toLowerCase() !== row.loanStatus.toLowerCase()) {
          return false;
        }
      }

      // 4. Installment Due Date Filter
      if (appliedFilters.dueDate) {
        const targetDateStr = appliedFilters.dueDate.trim();
        const hasMatchingInstallmentDate = row.effectiveSchedule.some((inst) => {
          if (!inst || !inst.dueDate) return false;
          const instDateStr = getLocalDateString(parseToDate(inst.dueDate));
          return instDateStr === targetDateStr;
        });

        if (!hasMatchingInstallmentDate) return false;
      }

      // 5. Vehicle Type Filter
      if (appliedFilters.vehicleType !== "All Vehicle Types") {
        if (appliedFilters.vehicleType !== row.vehicleCategoryBadge) {
          return false;
        }
      }

      // 6. Payment Frequency Filter
      if (appliedFilters.frequency !== "All Frequencies") {
        if (appliedFilters.frequency.toLowerCase() !== row.paymentFrequency.toLowerCase()) {
          return false;
        }
      }

      // 7. Quick Filters (Overdue | Penalty | Partial Payment)
      if (quickFilter === "overdue") {
        if (!row.hasOverdue) return false;
      } else if (quickFilter === "penalty") {
        if (row.applicablePenaltyAmount <= 0 || row.penaltyState === "cancelled") {
          return false;
        }
      } else if (quickFilter === "partial") {
        if (!row.hasPartialPayment) return false;
      }

      return true;
    });
  }, [enrichedRecords, searchQuery, appliedFilters, quickFilter]);

  // Reset to page 1 whenever search, filters, or quick-filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, appliedFilters, quickFilter]);

  // Paginated records for table view (Exactly 5 per page)
  const totalResults = filteredRecords.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / PAGE_SIZE));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safeCurrentPage - 1) * PAGE_SIZE;
  const paginatedRecords = filteredRecords.slice(startIndex, startIndex + PAGE_SIZE);

  // Apply Filters Action
  const handleApplyFilters = () => {
    setAppliedFilters({
      customerStatus: customerStatusInput,
      loanStatus: loanStatusInput,
      dueDate: dueDateInput,
      vehicleType: vehicleTypeInput,
      frequency: frequencyInput,
    });
  };

  // Reset Filters Action
  const handleResetFilters = () => {
    setCustomerStatusInput("All Customers");
    setLoanStatusInput("All Loans");
    setDueDateInput("");
    setVehicleTypeInput("All Vehicle Types");
    setFrequencyInput("All Frequencies");
    setAppliedFilters({
      customerStatus: "All Customers",
      loanStatus: "All Loans",
      dueDate: "",
      vehicleType: "All Vehicle Types",
      frequency: "All Frequencies",
    });
    setSearchQuery("");
    setQuickFilter(null);
    setCurrentPage(1);
  };

  // Quick Filter Toggle Action (immediate update)
  const handleQuickFilterClick = (filterType) => {
    setQuickFilter((prev) => (prev === filterType ? null : filterType));
  };

  // Quick Action: Collect Payment
  const handleCollectPaymentClick = (row) => {
    navigate(`/collection?collectLoanId=${encodeURIComponent(row.loanId)}`);
  };

  // Quick Action: View Schedule
  const handleViewScheduleClick = (row) => {
    setScheduleModalRecord(row);
  };

  return (
    <div className="w-full flex-1 min-h-screen flex flex-col p-3 sm:p-5 bg-white select-text">
      <div className="w-full flex flex-col gap-3">
        {loadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {loadError}
          </div>
        )}
        {/* =========================================================================
            1. HEADING & SUBTITLE WITH CHARCOAL + YELLOW SEARCH ICON ACCENT
        ========================================================================= */}
        <div className="mb-2 flex items-center gap-2.5">
          <div>
            <h1 className="page-title">
              Smart Search
            </h1>
          </div>
        </div>

        {/* =========================================================================
            2. FULL-WIDTH SEARCH BAR (PURE WHITE SURFACE WITH LIGHT GREY BORDER & GOLD FOCUS)
        ========================================================================= */}
        <div className="relative w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-4.5 sm:w-4.5 text-[#6B7280] pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by customer name, Customer ID, Loan ID, or mobile number..."
            className="h-10 sm:h-11 w-full rounded-xl border border-[#E5E7EB] bg-white pl-10 sm:pl-11 pr-9 text-xs sm:text-sm text-[#252525] outline-none placeholder:text-[#9CA3AF] focus:border-[#D4AF37] focus:bg-white focus:ring-2 focus:ring-[#D4AF37]/20 shadow-2xs transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              title="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* =========================================================================
            3. FILTER CARD (PURE WHITE SURFACE WITH LIGHT GREY BORDER):
               - MAIN FILTERS: ALL IN ONE HORIZONTAL ROW ON DESKTOP (5 filters + 2 buttons)
               - QUICK FILTERS: DEDICATED SEPARATE ROW DIRECTLY BELOW
        ========================================================================= */}
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-3 sm:p-3.5 shadow-2xs space-y-2.5">
          {/* Main Filters Row: 5 Inputs + Apply + Reset in One Row on Desktop */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-2.5 items-end">
            {/* 1. Customer Status */}
            <div>
              <label className="block text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#252525] mb-1 truncate">
                Customer Status
              </label>
              <select
                value={customerStatusInput}
                onChange={(e) => setCustomerStatusInput(e.target.value)}
                className="h-8.5 w-full rounded-lg border border-[#E5E7EB] bg-white px-2 py-1 text-xs font-semibold text-[#252525] outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/20 transition-all cursor-pointer truncate"
              >
                <option value="All Customers">All Customers</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>

            {/* 2. Loan Status */}
            <div>
              <label className="block text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#252525] mb-1 truncate">
                Loan Status
              </label>
              <select
                value={loanStatusInput}
                onChange={(e) => setLoanStatusInput(e.target.value)}
                className="h-8.5 w-full rounded-lg border border-[#E5E7EB] bg-white px-2 py-1 text-xs font-semibold text-[#252525] outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/20 transition-all cursor-pointer truncate"
              >
                <option value="All Loans">All Loans</option>
                <option value="Active">Active</option>
                <option value="Closed">Closed</option>
                <option value="Overdue">Overdue</option>
                <option value="Midway Closed">Midway Closed</option>
                <option value="Foreclosed">Foreclosed</option>
              </select>
            </div>

            {/* 3. Installment Due Date */}
            <div>
              <label className="block text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#252525] mb-1 truncate">
                Due Date
              </label>
              <input
                type="date"
                value={dueDateInput}
                onChange={(e) => setDueDateInput(e.target.value)}
                className="h-8.5 w-full rounded-lg border border-[#E5E7EB] bg-white px-2 py-1 text-xs font-semibold text-[#252525] outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/20 transition-all cursor-pointer"
              />
            </div>

            {/* 4. Vehicle Type */}
            <div>
              <label className="block text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#252525] mb-1 truncate">
                Vehicle Type
              </label>
              <select
                value={vehicleTypeInput}
                onChange={(e) => setVehicleTypeInput(e.target.value)}
                className="h-8.5 w-full rounded-lg border border-[#E5E7EB] bg-white px-2 py-1 text-xs font-semibold text-[#252525] outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/20 transition-all cursor-pointer truncate"
              >
                <option value="All Vehicle Types">All Vehicle Types</option>
                <option value="2 Wheeler">2 Wheeler</option>
                <option value="3 Wheeler">3 Wheeler</option>
                <option value="4 Wheeler">4 Wheeler</option>
              </select>
            </div>

            {/* 5. Payment Frequency */}
            <div>
              <label className="block text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#252525] mb-1 truncate">
                Payment Frequency
              </label>
              <select
                value={frequencyInput}
                onChange={(e) => setFrequencyInput(e.target.value)}
                className="h-8.5 w-full rounded-lg border border-[#E5E7EB] bg-white px-2 py-1 text-xs font-semibold text-[#252525] outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/20 transition-all cursor-pointer truncate"
              >
                <option value="All Frequencies">All Frequencies</option>
                <option value="Daily">Daily</option>
                <option value="Weekly">Weekly</option>
                <option value="Monthly">Monthly</option>
              </select>
            </div>

            {/* 6. Apply Filters Button (Charcoal Background + White Text) */}
            <div>
              <button
                type="button"
                onClick={handleApplyFilters}
                className="h-8.5 w-full rounded-lg bg-[#252525] hover:bg-[#171717] text-white text-xs font-bold transition-colors cursor-pointer flex items-center justify-center shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30"
              >
                Apply Filters
              </button>
            </div>

            {/* 7. Reset Filters Button (White Background + Charcoal Text + Light Grey Border) */}
            <div>
              <button
                type="button"
                onClick={handleResetFilters}
                className="h-8.5 w-full rounded-lg border border-[#E5E7EB] bg-white hover:bg-[#F0F0F0] text-[#252525] text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs focus:outline-none focus:ring-1 focus:ring-[#D4AF37]/30"
              >
                <RotateCcw className="h-3 w-3 text-[#6B7280]" />
                <span>Reset Filters</span>
              </button>
            </div>
          </div>

          {/* Quick Filters: Separate Dedicated Row Directly Below */}
          <div className="pt-2 border-t border-[#E5E7EB] flex items-center gap-2 flex-wrap">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#6B7280] mr-1 flex items-center gap-1">
              <Filter className="h-3 w-3 text-[#6B7280]" />
              <span>Quick Filters:</span>
            </span>

            {/* Quick Filter: Overdue (Soft Red) */}
            <button
              type="button"
              onClick={() => handleQuickFilterClick("overdue")}
              className={`rounded-lg px-2.5 sm:px-3 py-1 text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                quickFilter === "overdue"
                  ? "bg-rose-600 text-white border-rose-600 shadow-xs ring-2 ring-rose-200"
                  : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100/80"
              }`}
              title="Show only overdue records"
            >
              <span>Overdue</span>
              {quickFilter === "overdue" && (
                <span className="text-[9px] uppercase font-black bg-rose-700 px-1 py-0.2 rounded">Active</span>
              )}
            </button>

            {/* Quick Filter: Penalty (Light Gold Surface + Gold Accent) */}
            <button
              type="button"
              onClick={() => handleQuickFilterClick("penalty")}
              className={`rounded-lg px-2.5 sm:px-3 py-1 text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                quickFilter === "penalty"
                  ? "bg-[#D4AF37] text-white border-[#D4AF37] shadow-xs ring-2 ring-[#D4AF37]/30"
                  : "bg-[#FFF8E1] text-[#9A7B1C] border-[#D4AF37]/40 hover:bg-[#FEF3C7]"
              }`}
              title="Show only records with applicable penalties"
            >
              <span>Penalty</span>
              {quickFilter === "penalty" && (
                <span className="text-[9px] uppercase font-black bg-[#B89428] px-1 py-0.2 rounded">Active</span>
              )}
            </button>

            {/* Quick Filter: Partial Payment (Soft Amber / Purple) */}
            <button
              type="button"
              onClick={() => handleQuickFilterClick("partial")}
              className={`rounded-lg px-2.5 sm:px-3 py-1 text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                quickFilter === "partial"
                  ? "bg-purple-600 text-white border-purple-600 shadow-xs ring-2 ring-purple-200"
                  : "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100/80"
              }`}
              title="Show only records with partially paid installments"
            >
              <span>Partial Payment</span>
              {quickFilter === "partial" && (
                <span className="text-[9px] uppercase font-black bg-purple-700 px-1 py-0.2 rounded">Active</span>
              )}
            </button>

            {quickFilter && (
              <button
                type="button"
                onClick={() => setQuickFilter(null)}
                className="text-[11px] font-semibold text-[#6B7280] hover:text-[#252525] ml-1 underline decoration-[#E5E7EB] cursor-pointer"
              >
                Clear quick filter
              </button>
            )}
          </div>
        </div>

        {/* =========================================================================
            4. RESULTS TABLE CARD (PURE WHITE SURFACE, CHARCOAL HEADERS, EXACTLY 5 ROWS)
        ========================================================================= */}
        <div className="w-full bg-white rounded-xl border border-[#E5E7EB] shadow-2xs flex flex-col overflow-hidden">
          <div className="w-full overflow-x-auto">
            <table className="w-full divide-y divide-[#E5E7EB] text-xs sm:text-[13px]">
              <thead className="bg-[#F9FAFB] text-[#252525] font-bold border-b border-[#E5E7EB]">
                <tr>
                  <th className="px-4 py-2.5 text-left font-bold text-[#252525]">Customer</th>
                  <th className="px-4 py-2.5 text-left font-bold text-[#252525]">Vehicle</th>
                  <th className="px-4 py-2.5 text-left font-bold text-[#252525]">Payment Frequency</th>
                  <th className="px-4 py-2.5 text-left font-bold text-[#252525]">Installment Due</th>
                  <th className="px-4 py-2.5 text-center font-bold text-[#252525]">Status</th>
                  <th className="px-4 py-2.5 text-right font-bold text-[#252525]">Penalty</th>
                  <th className="px-4 py-2.5 text-center font-bold text-[#252525]">Quick Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB] bg-white">
                {paginatedRecords.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-400">
                      <div className="max-w-xs mx-auto space-y-1.5">
                        <AlertCircle className="h-7 w-7 mx-auto text-slate-300" />
                        <p className="font-bold text-[#252525] text-xs sm:text-sm">No records found</p>
                        <p className="text-[11px] text-[#6B7280]">
                          Try adjusting your search query, dropdown filters, or quick filters.
                        </p>
                        <button
                          type="button"
                          onClick={handleResetFilters}
                          className="mt-1.5 inline-flex items-center gap-1 rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1 text-xs font-bold text-[#252525] hover:bg-[#F0F0F0] transition-colors shadow-2xs cursor-pointer"
                        >
                          <RotateCcw className="h-3 w-3 text-[#6B7280]" />
                          <span>Reset Filters</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedRecords.map((r) => (
                    <tr key={r.loanId} className="hover:bg-[#F5F5F5] transition-colors">
                      {/* Column 1: Customer (Name, Customer ID, Loan ID, Mobile) */}
                      <td className="px-4 py-3 align-middle whitespace-nowrap">
                        <div className="space-y-0.5">
                          <p className="font-bold text-[#252525] leading-tight text-xs sm:text-[13px]">{r.customerName}</p>
                          <div className="flex items-center gap-2 text-[10.5px] text-[#6B7280] font-medium">
                            <span>{r.customerId}</span>
                            <span>•</span>
                            <span className="font-semibold text-[#252525]">{r.loanId}</span>
                            <span>•</span>
                            <span className="font-mono">{r.mobile}</span>
                          </div>
                        </div>
                      </td>

                      {/* Column 2: Vehicle (Model, Reg No, Category Badge on separate lines) */}
                      <td className="px-4 py-3 align-middle whitespace-nowrap">
                        <div className="space-y-0.5">
                          {/* Line 1: Vehicle Name / Model */}
                          <p className="font-bold text-[#252525] leading-tight text-xs sm:text-[13px]">{r.vehicleName}</p>
                          {/* Line 2: Registration Number */}
                          <p className="text-[11px] font-mono font-medium text-[#6B7280]">{r.regNo}</p>
                          {/* Line 3: Category Badge with icon & label (Neutral Grey Badge) */}
                          <div className="pt-0.5">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-[#F3F4F6] text-[#252525] border border-[#E5E7EB]">
                              {r.vehicleCategoryBadge === "2 Wheeler" && (
                                <Bike className="h-3.5 w-3.5 shrink-0 text-[#252525]" />
                              )}
                              {r.vehicleCategoryBadge === "3 Wheeler" && (
                                <ThreeWheelerIcon className="h-3.5 w-3.5 shrink-0 text-[#252525]" />
                              )}
                              {r.vehicleCategoryBadge === "4 Wheeler" && (
                                <Car className="h-3.5 w-3.5 shrink-0 text-[#252525]" />
                              )}
                              <span>{r.vehicleCategoryBadge}</span>
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Column 3: Payment Frequency */}
                      <td className="px-4 py-3 align-middle whitespace-nowrap">
                        <span className="font-semibold text-[#252525] text-xs sm:text-[13px]">{r.paymentFrequency}</span>
                      </td>

                      {/* Column 4: Installment Due */}
                      <td className="px-4 py-3 align-middle whitespace-nowrap">
                        {r.relevantDueDate ? (
                          <div>
                            <span
                              className={`text-xs sm:text-[13px] ${
                                r.isDueDateOverdue ? "text-rose-700 font-bold" : "text-[#252525] font-semibold"
                              }`}
                            >
                              {formatDate(r.relevantDueDate)}
                            </span>
                            {r.isDueDateOverdue && (
                              <span className="block text-[9px] font-bold text-rose-600 uppercase tracking-wider">
                                Overdue ({r.overdueCount})
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[#6B7280] text-xs">No pending dues</span>
                        )}
                      </td>

                      {/* Column 5: Status */}
                      <td className="px-4 py-3 align-middle text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            r.loanStatus === "Active"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : r.loanStatus === "Overdue"
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : r.loanStatus === "Closed"
                              ? "bg-slate-100 text-slate-700 border border-slate-200"
                              : r.loanStatus === "Midway Closed"
                              ? "bg-amber-50 text-amber-800 border border-amber-300"
                              : "bg-purple-50 text-purple-700 border border-purple-200"
                          }`}
                        >
                          {r.loanStatus}
                        </span>
                      </td>

                      {/* Column 6: Penalty */}
                      <td className="px-4 py-3 align-middle text-right whitespace-nowrap font-medium text-xs sm:text-[13px]">
                        {r.penaltyState === "pending" ? (
                          <span className="font-extrabold text-[#9A7B1C] bg-[#FFF8E1] px-2 py-0.5 rounded border border-[#D4AF37]/30">
                            {r.penaltyDisplay}
                          </span>
                        ) : r.penaltyState === "frozen" ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                            {r.penaltyDisplay}
                          </span>
                        ) : (
                          <span className="text-[#6B7280]">{r.penaltyDisplay}</span>
                        )}
                      </td>

                      {/* Column 7: Quick Action */}
                      <td className="px-4 py-3 align-middle text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Collect Payment (Charcoal Background + White Text) */}
                          <button
                            type="button"
                            onClick={() => handleCollectPaymentClick(r)}
                            className="rounded-lg bg-[#252525] hover:bg-[#171717] text-white px-3 py-1.5 text-xs font-bold transition-all shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30"
                          >
                            Collect Payment
                          </button>
                          {/* View Schedule (White Background + Charcoal Text + Light Grey Border) */}
                          <button
                            type="button"
                            onClick={() => handleViewScheduleClick(r)}
                            className="rounded-lg border border-[#E5E7EB] bg-white hover:bg-[#F0F0F0] text-[#252525] px-2.5 py-1.5 text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#D4AF37]/30"
                            title="View Repayment Schedule"
                          >
                            <CalendarIcon className="h-3 w-3 text-[#6B7280]" />
                            <span className="hidden sm:inline">View Schedule</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* =========================================================================
              5. PAGINATION (IMMEDIATELY BELOW ROWS, ZERO GAP)
          ========================================================================= */}
          {totalResults > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-2.5 border-t border-[#E5E7EB] bg-[#F9FAFB]">
              <div className="text-[11px] text-[#6B7280] font-medium">
                Showing <strong className="text-[#252525]">{startIndex + 1}</strong> to{" "}
                <strong className="text-[#252525]">
                  {Math.min(startIndex + PAGE_SIZE, totalResults)}
                </strong>{" "}
                of <strong className="text-[#252525]">{totalResults}</strong> results
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safeCurrentPage <= 1}
                  className="rounded-lg border border-[#E5E7EB] bg-white p-1 text-[#252525] hover:bg-[#F0F0F0] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  title="Previous Page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>

                {Array.from({ length: totalPages }).map((_, i) => {
                  const pNum = i + 1;
                  if (
                    pNum === 1 ||
                    pNum === totalPages ||
                    (pNum >= safeCurrentPage - 1 && pNum <= safeCurrentPage + 1)
                  ) {
                    return (
                      <button
                        key={pNum}
                        type="button"
                        onClick={() => setCurrentPage(pNum)}
                        className={`h-7 w-7 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                          safeCurrentPage === pNum
                            ? "bg-[#252525] text-white ring-1 ring-[#D4AF37] shadow-2xs"
                            : "border border-[#E5E7EB] bg-white text-[#252525] hover:bg-[#F0F0F0]"
                        }`}
                      >
                        {pNum}
                      </button>
                    );
                  }
                  if (pNum === safeCurrentPage - 2 || pNum === safeCurrentPage + 2) {
                    return (
                      <span key={pNum} className="px-1 text-[#6B7280] text-xs">
                        ...
                      </span>
                    );
                  }
                  return null;
                })}

                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safeCurrentPage >= totalPages}
                  className="rounded-lg border border-[#E5E7EB] bg-white p-1 text-[#252525] hover:bg-[#F0F0F0] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  title="Next Page"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          REPAYMENT SCHEDULE MODAL
      ========================================================================= */}
      {scheduleModalRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 sm:p-4 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-4xl max-h-[92vh] rounded-2xl bg-white shadow-2xl relative flex flex-col border border-slate-200 overflow-hidden my-auto animate-scale-in">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-white sticky top-0 z-10 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-[#FFF8E1] text-[#9A7B1C] border border-[#D4AF37]/30">
                  <CalendarIcon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-[#252525] leading-tight">
                    Repayment Schedule — {scheduleModalRecord.customerName}
                  </h3>
                  <p className="text-xs text-[#6B7280] mt-0.5 font-medium">
                    {scheduleModalRecord.loanId} · {scheduleModalRecord.vehicleName} ({scheduleModalRecord.vehicleCategoryBadge})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setScheduleModalRecord(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1">
              <RepaymentScheduleTable
                loanDetails={scheduleModalRecord.rawRecord?.loan || scheduleModalRecord.rawRecord}
                schedule={scheduleModalRecord.effectiveSchedule}
              />
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50/60 sticky bottom-0 z-10 shrink-0">
              <button
                type="button"
                onClick={() => setScheduleModalRecord(null)}
                className="rounded-xl border border-[#E5E7EB] bg-white px-4 py-2 text-xs font-bold text-[#252525] hover:bg-[#F0F0F0] transition-colors shadow-2xs cursor-pointer"
              >
                Close
              </button>
              {scheduleModalRecord.outstandingAmount > 0.01 && (
                <button
                  type="button"
                  onClick={() => {
                    const lId = scheduleModalRecord.loanId;
                    setScheduleModalRecord(null);
                    navigate(`/collection?collectLoanId=${encodeURIComponent(lId)}`);
                  }}
                  className="rounded-xl bg-[#252525] px-5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-[#171717] transition-colors flex items-center gap-1.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30"
                >
                  <span>Collect Payment</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
