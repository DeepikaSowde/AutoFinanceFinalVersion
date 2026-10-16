import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DATA_CHANGED_EVENT } from "../services/api";
import { loadCustomerEntries } from "../services/customerApi";
import { loadPayments } from "../services/collectionApi";
import {
  FileText,
  CheckCircle2,
  Wallet,
  Coins,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  Plus,
  Phone,
} from "lucide-react";
import LoanDetailsView from "./customer/LoanDetailsView";
import { generateSchedule } from "../components/RepaymentScheduleTable";
import { calculateLoanOutstanding } from "../utils/loanCalculations";

const formatINR = (value) => {
  const amount = Math.round(Number(value || 0));
  return `₹${amount.toLocaleString("en-IN")}`;
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

// Parse a date string into midnight timestamp for reliable day comparisons
const parseToDayTimestamp = (dateInput) => {
  if (!dateInput) return null;
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

const KpiCard = ({ icon: Icon, title, value, description, iconBg, iconColor }) => {
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 p-4 sm:p-4.5 shadow-xs flex flex-col justify-between transition-all duration-200 hover:shadow-sm min-w-0">
      <div>
        <div className="flex items-center gap-3 mb-2.5">
          <div className={`h-8 w-8 rounded-lg ${iconBg} ${iconColor} flex items-center justify-center shrink-0`}>
            <Icon className="h-4 w-4" strokeWidth={2.2} />
          </div>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider leading-tight">
            {title}
          </span>
        </div>
        <p className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight leading-snug whitespace-nowrap overflow-visible">
          {value}
        </p>
      </div>
      <p className="text-[11px] text-slate-400 font-normal leading-normal mt-2 line-clamp-2">
        {description}
      </p>
    </div>
  );
};

const StatusBadge = ({ status }) => {
  const styles = {
    Active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Closed: "bg-slate-100 text-slate-600 border-slate-200",
    "Midway Closed": "bg-amber-100 text-amber-800 border-amber-300",
    Overdue: "bg-amber-50 text-amber-800 border-amber-300",
    Foreclosed: "bg-purple-50 text-purple-700 border-purple-200",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
        styles[status] || styles.Active
      }`}
    >
      {status}
    </span>
  );
};

export default function Loans() {
  const navigate = useNavigate();
  const { loanId: routeLoanId } = useParams();

  const [rawCustomers, setRawCustomers] = useState([]);
  const [allPayments, setAllPayments] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [frequencyFilter, setFrequencyFilter] = useState("All Frequencies");
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [frequencyDropdownOpen, setFrequencyDropdownOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [viewingLoan, setViewingLoan] = useState(null);

  const PAGE_SIZE = 5;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Loans from the API; reload after any save (e.g. a payment).
  useEffect(() => {
    let active = true;
    const load = () =>
      Promise.all([loadCustomerEntries(), loadPayments()])
        .then(([entries, payments]) => {
          if (!active) return;
          setRawCustomers(entries);
          setAllPayments(payments);
          setLoadError("");
        })
        .catch((error) => active && setLoadError(error.message))
        .finally(() => active && setLoading(false));

    load();
    window.addEventListener(DATA_CHANGED_EVENT, load);
    return () => {
      active = false;
      window.removeEventListener(DATA_CHANGED_EVENT, load);
    };
  }, []);

  // Process loans from customer list
  const loans = useMemo(() => {
    const todayTimestamp = parseToDayTimestamp(new Date());

    return rawCustomers.map((record, index) => {
      const customer = record.customer || {};
      const vehicle = record.vehicle || {};
      const loan = record.loan || {};

      const customerId =
        record.customerId ||
        record.customer?.customerId ||
        (customer.mobile && customer.mobile.trim().length >= 5 && !/^0+$/.test(customer.mobile.trim().slice(-5))
          ? `CUS-${customer.mobile.trim().slice(-5)}`
          : `CUS-${String(index + 1).padStart(3, "0")}`);

      const loanId =
        record.loanId ||
        record.loan?.loanId ||
        `LN-${String(index + 1).padStart(3, "0")}`;

      const customerName = customer.name || "Unknown Customer";
      const customerMobile = customer.mobile || "";

      // Consistent loan-level calculation
      const loanCalc = calculateLoanOutstanding(record, allPayments);
      const loanAmount = loanCalc.principal;
      const outstandingAmount = loanCalc.outstandingAmount;
      const schedule = loanCalc.effectiveSchedule;

      // Check overdue installments:
      // An installment is overdue if it is not fully paid AND its due date is strictly earlier than today (dueTimestamp < todayTimestamp)
      const overdueInstalls = schedule.filter((s) => {
        const isNotCollected = s.status !== "Collected" && s.status !== "Paid";
        const hasBalance = s.emi - (s.amountPaid || 0) > 0.01;
        const dueTs = parseToDayTimestamp(s.dueDate);
        return isNotCollected && hasBalance && dueTs !== null && dueTs < todayTimestamp;
      });

      // Status determination:
      // 1. Foreclosed: loan closed early via foreclosure settlement
      // 2. Closed: loan is fully repaid (outstandingAmount <= 0) or marked Closed
      // 3. Overdue: has an unpaid installment whose due date is strictly earlier than today
      // 4. Active: ongoing loan without overdue installments
      const rawStatus = String(record.status || loan.status || '').trim();
      const isForeclosed = rawStatus.toLowerCase() === "foreclosed" || Boolean(record.isForeclosed || record.foreclosure);
      const isMidwayClosed = Boolean(
        record.isMidwayClosed ||
        record.midwayClosure ||
        rawStatus.toLowerCase() === "midway closed" ||
        String(record.closureType || "").toLowerCase() === "midway closure"
      );
      let status = "Active";
      if (isMidwayClosed) {
        status = "Midway Closed";
      } else if (isForeclosed) {
        status = "Foreclosed";
      } else if (rawStatus.toLowerCase() === "closed" || (outstandingAmount <= 0 && rawStatus !== "Foreclosed")) {
        status = "Closed";
      } else if (overdueInstalls.length > 0) {
        status = "Overdue";
      } else {
        status = "Active";
      }

      // Next due date
      let nextDueDate = record.nextDueDate || loan.firstDueDate || "";
      if (schedule.length > 0) {
        const nextPending = schedule.find(
          (s) => s.status !== "Collected" && s.status !== "Paid" && s.emi - (s.amountPaid || 0) > 0.01
        );
        if (nextPending && nextPending.dueDate) {
          nextDueDate = nextPending.dueDate;
        }
      }

      // Installment & Frequency
      const emiAmount = Number(record.emiAmount || loan.emiAmount || (schedule[0]?.emi || 0));
      const frequency = loan.paymentFrequency || record.paymentFrequency || "Monthly";

      return {
        ...record,
        customerId,
        loanId,
        customerName,
        customerMobile,
        loanAmount,
        outstandingAmount,
        status,
        nextDueDate,
        emiAmount,
        frequency,
      };
    });
  }, [rawCustomers, allPayments]);

  // KPI Calculations
  const kpiData = useMemo(() => {
    const totalLoans = loans.length;
    const activeLoansCount = loans.filter(
      (l) => l.status === "Active" || l.status === "Overdue"
    ).length;

    const activeLoanAmount = loans
      .filter((l) => l.status === "Active" || l.status === "Overdue")
      .reduce((sum, l) => sum + l.loanAmount, 0);

    const totalOutstanding = loans.reduce((sum, l) => sum + l.outstandingAmount, 0);

    return {
      totalLoans,
      activeLoansCount,
      activeLoanAmount,
      totalOutstanding,
    };
  }, [loans]);

  // Filters & Search
  const filteredLoans = useMemo(() => {
    return loans.filter((l) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        l.loanId.toLowerCase().includes(q) ||
        l.customerName.toLowerCase().includes(q) ||
        l.customerMobile.toLowerCase().includes(q);

      const matchesStatus =
        statusFilter === "All Statuses" || l.status === statusFilter;

      const matchesFrequency =
        frequencyFilter === "All Frequencies" ||
        l.frequency.toLowerCase() === frequencyFilter.toLowerCase();

      return matchesSearch && matchesStatus && matchesFrequency;
    });
  }, [loans, search, statusFilter, frequencyFilter]);

  // Pagination (5 loans per page)
  const totalPages = Math.max(1, Math.ceil(filteredLoans.length / PAGE_SIZE));

  // If filtered list changes, ensure current page does not stay on an invalid/empty page
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedLoans = useMemo(() => {
    const start = (validCurrentPage - 1) * PAGE_SIZE;
    return filteredLoans.slice(start, start + PAGE_SIZE);
  }, [filteredLoans, validCurrentPage]);

  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (validCurrentPage <= 4) {
      return [1, 2, 3, 4, 5, "...", totalPages];
    }
    if (validCurrentPage >= totalPages - 3) {
      return [1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, "...", validCurrentPage - 1, validCurrentPage, validCurrentPage + 1, "...", totalPages];
  }, [totalPages, validCurrentPage]);

  const handlePageChange = (page) => {
    if (typeof page === "number" && page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const activeViewingLoanId = routeLoanId || viewingLoan?.loanId || null;

  // If a loan view is requested (via route /loans/:loanId or View click)
  if (activeViewingLoanId) {
    return (
      <LoanDetailsView
        loanId={activeViewingLoanId}
        onBack={() => {
          setViewingLoan(null);
          navigate("/loans");
        }}
      />
    );
  }

  // Format frequency label in installment column
  const formatFrequencyUnit = (freq) => {
    if (!freq) return "Month";
    const lower = freq.toLowerCase();
    if (lower === "daily") return "Day";
    if (lower === "weekly") return "Week";
    return "Month";
  };

  return (
    <div className="flex-1 min-h-screen bg-[#F8FAFC] px-3 sm:px-6 py-5 sm:py-6 font-sans">
      {loadError && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load loans: {loadError}
        </div>
      )}
      {loading && !loadError && <p className="mb-4 text-sm text-slate-500">Loading loans…</p>}
      <div className="w-full space-y-5">
        {/* =========================================================
            HEADER ROW
        ========================================================= */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Loans
            </h1>
          </div>

          <div>
            <button
              type="button"
              onClick={() => navigate("/newloan")}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#006052] px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-[#004d42] active:bg-[#003d34] transition-colors focus:outline-none focus:ring-2 focus:ring-[#006052] focus:ring-offset-1 cursor-pointer"
            >
              <Plus className="h-4 w-4" strokeWidth={2.2} />
              <span>New Loan</span>
            </button>
          </div>
        </div>

        {/* =========================================================
            KPI CARDS (Container-responsive auto-fit grid)
        ========================================================= */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-3 sm:gap-4">
          <KpiCard
            icon={FileText}
            title="Total Loans"
            value={kpiData.totalLoans.toLocaleString("en-IN")}
            description="Count of all loans created, including closed loans."
            iconBg="bg-emerald-50"
            iconColor="text-emerald-700"
          />
          <KpiCard
            icon={CheckCircle2}
            title="Active Loans"
            value={kpiData.activeLoansCount.toLocaleString("en-IN")}
            description="Loans currently being repaid."
            iconBg="bg-emerald-50"
            iconColor="text-emerald-700"
          />
          <KpiCard
            icon={Wallet}
            title="Active Loan Amount"
            value={formatINR(kpiData.activeLoanAmount)}
            description="Original principal of active loans only."
            iconBg="bg-emerald-50"
            iconColor="text-emerald-700"
          />
          <KpiCard
            icon={Coins}
            title="Total Outstanding"
            value={formatINR(kpiData.totalOutstanding)}
            description="Remaining payable across active and overdue loans."
            iconBg="bg-emerald-50"
            iconColor="text-emerald-700"
          />
        </div>

        {/* =========================================================
            SEARCH AND FILTERS
        ========================================================= */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Search Bar */}
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search loan ID, customer name or mobile..."
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052] transition-colors shadow-2xs"
            />
          </div>

          {/* Status Filter */}
          <div className="relative w-full sm:w-44 shrink-0">
            <button
              type="button"
              onClick={() => {
                setStatusDropdownOpen(!statusDropdownOpen);
                setFrequencyDropdownOpen(false);
              }}
              className="flex h-10 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 text-xs sm:text-sm font-medium text-slate-700 shadow-2xs hover:border-slate-300 transition-colors cursor-pointer"
            >
              <span>{statusFilter}</span>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </button>

            {statusDropdownOpen && (
              <div className="absolute left-0 top-[44px] z-30 w-full rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                {["All Statuses", "Active", "Overdue", "Closed", "Midway Closed", "Foreclosed"].map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setStatusFilter(option);
                      setStatusDropdownOpen(false);
                      setCurrentPage(1);
                    }}
                    className={`w-full rounded-md px-3 py-1.5 text-left text-xs sm:text-sm font-medium transition-colors ${
                      statusFilter === option
                        ? "bg-emerald-50 text-emerald-800 font-semibold"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Frequency Filter */}
          <div className="relative w-full sm:w-44 shrink-0">
            <button
              type="button"
              onClick={() => {
                setFrequencyDropdownOpen(!frequencyDropdownOpen);
                setStatusDropdownOpen(false);
              }}
              className="flex h-10 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 text-xs sm:text-sm font-medium text-slate-700 shadow-2xs hover:border-slate-300 transition-colors cursor-pointer"
            >
              <span>{frequencyFilter}</span>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </button>

            {frequencyDropdownOpen && (
              <div className="absolute left-0 top-[44px] z-30 w-full rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                {["All Frequencies", "Daily", "Weekly", "Monthly"].map(
                  (option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setFrequencyFilter(option);
                        setFrequencyDropdownOpen(false);
                        setCurrentPage(1);
                      }}
                      className={`w-full rounded-md px-3 py-1.5 text-left text-xs sm:text-sm font-medium transition-colors ${
                        frequencyFilter === option
                          ? "bg-emerald-50 text-emerald-800 font-semibold"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {option}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        </div>

        {/* =========================================================
            LOANS TABLE CARD
        ========================================================= */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 px-4 sm:px-5 font-semibold">Loan / Customer</th>
                  <th className="py-3.5 px-4 sm:px-5 font-semibold">Loan Amount</th>
                  <th className="py-3.5 px-4 sm:px-5 font-semibold">Outstanding Amount</th>
                  <th className="py-3.5 px-4 sm:px-5 font-semibold">Installment</th>
                  <th className="py-3.5 px-4 sm:px-5 font-semibold">Next Due Date</th>
                  <th className="py-3.5 px-4 sm:px-5 font-semibold">Status</th>
                  <th className="py-3.5 px-4 sm:px-5 font-semibold text-center">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredLoans.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-14 px-4 text-center text-slate-400 text-xs sm:text-sm font-medium"
                    >
                      {loans.length === 0
                        ? "No loans recorded yet. Click 'New Loan' to create your first loan."
                        : "No loans match the selected filters."}
                    </td>
                  </tr>
                ) : (
                  paginatedLoans.map((loan) => (
                    <tr
                      key={loan.loanId}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      {/* Loan / Customer Column */}
                      <td className="py-3.5 px-4 sm:px-5">
                        <div>
                          <p className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight">
                            {loan.loanId}
                          </p>
                          <p className="text-xs font-medium text-slate-700 mt-0.5">
                            {loan.customerName}
                          </p>
                          <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-0.5">
                            <Phone className="h-3 w-3" />
                            <span>{loan.customerMobile || "—"}</span>
                          </div>
                        </div>
                      </td>

                      {/* Loan Amount */}
                      <td className="py-3.5 px-4 sm:px-5">
                        <span className="text-xs sm:text-sm font-bold text-slate-900">
                          {formatINR(loan.loanAmount)}
                        </span>
                      </td>

                      {/* Outstanding Amount */}
                      <td className="py-3.5 px-4 sm:px-5">
                        <span className="text-xs sm:text-sm font-bold text-slate-900">
                          {formatINR(loan.outstandingAmount)}
                        </span>
                      </td>

                      {/* Installment */}
                      <td className="py-3.5 px-4 sm:px-5">
                        <span className="text-xs sm:text-sm font-bold text-slate-900">
                          {loan.emiAmount > 0
                            ? `${formatINR(loan.emiAmount)} / ${formatFrequencyUnit(
                                loan.frequency
                              )}`
                            : `— / ${formatFrequencyUnit(loan.frequency)}`}
                        </span>
                      </td>

                      {/* Next Due Date */}
                      <td className="py-3.5 px-4 sm:px-5">
                        <span className="text-xs sm:text-sm font-medium text-slate-600">
                          {loan.status === "Closed" ? "—" : formatDate(loan.nextDueDate)}
                        </span>
                      </td>

                      {/* Status Badge */}
                      <td className="py-3.5 px-4 sm:px-5">
                        <StatusBadge status={loan.status} />
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 sm:px-5 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setViewingLoan(loan);
                            navigate(`/loans/${loan.loanId}`);
                          }}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-300 transition-colors cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5 text-slate-500" />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* =========================================================
              TABLE FOOTER & PAGINATION
          ========================================================= */}
          {filteredLoans.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-t border-slate-200 bg-slate-50/50">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-medium">
                <span>
                  Showing{" "}
                  <span className="font-semibold text-slate-700">
                    {Math.min(
                      (validCurrentPage - 1) * PAGE_SIZE + 1,
                      filteredLoans.length
                    )}
                  </span>{" "}
                  –{" "}
                  <span className="font-semibold text-slate-700">
                    {Math.min(validCurrentPage * PAGE_SIZE, filteredLoans.length)}
                  </span>{" "}
                  of{" "}
                  <span className="font-semibold text-slate-700">
                    {filteredLoans.length}
                  </span>{" "}
                  loans
                </span>
                <span className="text-slate-300">•</span>
                <span className="font-semibold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-[11px]">
                  Page {validCurrentPage} of {totalPages}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handlePageChange(validCurrentPage - 1)}
                  disabled={validCurrentPage <= 1}
                  className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Previous</span>
                </button>

                <div className="flex items-center gap-1">
                  {pageNumbers.map((page, idx) =>
                    page === "..." ? (
                      <span
                        key={`ellipsis-${idx}`}
                        className="px-1 text-xs text-slate-400 font-medium"
                      >
                        …
                      </span>
                    ) : (
                      <button
                        key={page}
                        type="button"
                        onClick={() => handlePageChange(page)}
                        className={`h-8 min-w-[32px] px-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                          validCurrentPage === page
                            ? "bg-[#006052] text-white shadow-2xs"
                            : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300"
                        }`}
                      >
                        {page}
                      </button>
                    )
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handlePageChange(validCurrentPage + 1)}
                  disabled={validCurrentPage >= totalPages}
                  className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  aria-label="Next page"
                >
                  <span>Next</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
