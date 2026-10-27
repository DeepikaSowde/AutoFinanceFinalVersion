import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Users,
  Database,
  WalletCards,
  RotateCcw,
  Eye,
  UserCheck,
  Coins,
} from "lucide-react";

import { loadCustomerEntries } from "../../services/customerApi";
import { loadPayments } from "../../services/collectionApi";
import CustomerView from "./CustomerView";
import { calculateLoanOutstanding } from "../../utils/loanCalculations";
import { syncVehiclesWithClosedLoans } from "../../utils/vehicleStatusHelper";

const formatCurrency = (value) => {
  const amount = Math.round(Number(value || 0));

  return `₹${amount.toLocaleString("en-IN")}`;
};

const getCustomerId = (data, index) => {
  if (!data) return null;
  if (data.customerId) return data.customerId;
  if (data.customer?.customerId) return data.customer.customerId;
  if (data.customer?.mobile && data.customer.mobile.trim().length >= 5 && !/^0+$/.test(data.customer.mobile.trim().slice(-5))) {
    return `CUS-${data.customer.mobile.trim().slice(-5)}`;
  }
  if (data.mobile && data.mobile.trim().length >= 5 && !/^0+$/.test(data.mobile.trim().slice(-5))) {
    return `CUS-${data.mobile.trim().slice(-5)}`;
  }
  if (index !== undefined && index !== null && index >= 0) {
    return `CUS-${String(index + 1).padStart(3, "0")}`;
  }
  return null;
};

const getLoanId = (data, customerId, index) => {
  if (!data) return null;
  if (data.loanId) return data.loanId;
  if (data.loan?.loanId) return data.loan.loanId;
  if (index !== undefined && index !== null && index >= 0) {
    return `LN-${String(index + 1).padStart(3, "0")}`;
  }
  if (customerId) return `LN-${customerId.replace("CUS-", "")}`;
  return null;
};

const getLoanAmount = (loan, vehicle) => {
  const vehicleAmount =
    loan?.vehicleAmount !== "" &&
      loan?.vehicleAmount !== null &&
      loan?.vehicleAmount !== undefined
      ? Number(loan.vehicleAmount)
      : Number(vehicle?.amount || 0);

  const downPayment = Number(loan?.downPayment || 0);

  return Math.max(vehicleAmount - downPayment, 0);
};

const StatusBadge = ({ status }) => {
  const styles = {
    Active: "bg-emerald-100 text-emerald-800 border border-emerald-200/60",
    Closed: "bg-slate-100 text-slate-700 border border-slate-200/60",
    Overdue: "bg-red-100 text-red-700 border border-red-200/60",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs sm:text-[13px] font-semibold ${styles[status] || "bg-slate-100 text-slate-700 border border-slate-200/60"
        }`}
    >
      {status}
    </span>
  );
};

const SummaryCard = ({ icon: Icon, title, value }) => {
  return (
    <div className="min-h-[100px] sm:min-h-[108px] h-full rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs transition-shadow hover:shadow-sm min-w-0 w-full">
      <div className="flex h-full items-center gap-3.5 sm:gap-4 min-w-0">
        <div className="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
          <Icon className="h-6 w-6 sm:h-7 sm:w-7 text-emerald-700" strokeWidth={1.8} />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm lg:text-[15px] font-medium text-slate-500 mb-0.5 sm:mb-1 leading-snug break-words">
            {title}
          </p>

          <p
            className="text-lg sm:text-xl lg:text-2xl font-bold tracking-tight text-slate-900 whitespace-nowrap leading-tight"
          >
            {value}
          </p>
        </div>
      </div>
    </div>
  );
};

const Customer = () => {
  const navigate = useNavigate();
  const [customerData, setCustomerData] = useState([]);
  const [allPayments, setAllPayments] = useState([]);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [statusOpen, setStatusOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [selectedLoanId, setSelectedLoanId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  useEffect(() => {
    let active = true;

    Promise.all([loadCustomerEntries(), loadPayments()])
      .then(([entries, payments]) => {
        if (!active) return;
        setCustomerData(syncVehiclesWithClosedLoans(entries));
        setAllPayments(payments);
        setLoadError("");
      })
      .catch((error) => active && setLoadError(error.message))
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [reloadKey]);

  const hasCustomer = customerData.length > 0;

  const processedCustomers = useMemo(() => {
    return customerData.map((data, index) => {
      const customer = data.customer || {};
      const vehicle = data.vehicle || {};
      const loan = data.loan || {};

      const customerId = getCustomerId(data, index);
      const loanId = getLoanId(data, customerId, index);

      const loanCalc = calculateLoanOutstanding(data, allPayments);
      const loanAmount = loanCalc.principal;
      const outstandingAmount = loanCalc.outstandingAmount;
      const customerStatus =
        data.status === "Closed" || loanCalc.status === "Closed"
          ? "Closed"
          : (data.status || loanCalc.status || (customer.name ? "Active" : "—"));

      return {
        ...data,
        customer,
        vehicle,
        loan,
        customerId,
        loanId,
        loanAmount,
        outstandingAmount,
        status: customerStatus
      };
    });
  }, [customerData, allPayments]);

  const filteredCustomers = useMemo(() => {
    if (!hasCustomer) return [];

    const searchValue = search.trim().toLowerCase();

    return processedCustomers.filter(item => {
      const matchesSearch = !searchValue ||
        item.customer.name?.toLowerCase().includes(searchValue) ||
        item.customerId?.toLowerCase().includes(searchValue) ||
        item.loanId?.toLowerCase().includes(searchValue);

      const matchesStatus = status === "All" || item.status === status;

      return matchesSearch && matchesStatus;
    });
  }, [processedCustomers, search, status, hasCustomer]);

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / ITEMS_PER_PAGE));
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const paginatedCustomers = useMemo(() => {
    const start = (validCurrentPage - 1) * ITEMS_PER_PAGE;
    return filteredCustomers.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredCustomers, validCurrentPage]);

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

  const handleReset = () => {
    setSearch("");
    setStatus("All");
    setStatusOpen(false);
    setCurrentPage(1);
  };

  const handleView = (item) => {
    setSelectedCustomerId(item.customerId);
    setSelectedLoanId(item.loanId);
  };

  if (selectedCustomerId) {
    return (
      <CustomerView
        customerId={selectedCustomerId}
        initialLoanId={selectedLoanId}
        onBack={() => {
          setSelectedCustomerId(null);
          setSelectedLoanId(null);
        }}
      />
    );
  }

  const totalCustomers = processedCustomers.length;
  const activeLoans = processedCustomers.filter(item => item.status === "Active");
  const totalActiveDeployed = activeLoans.reduce((sum, item) => sum + item.loanAmount, 0);
  const totalActiveOutstanding = activeLoans.reduce((sum, item) => sum + item.outstandingAmount, 0);

  return (
    <div className="w-full min-w-0 flex-1 min-h-screen bg-white px-3.5 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6 space-y-5 sm:space-y-6">
      {loadError && (
        <div role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load customers: {loadError}{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => {
              setLoading(true);
              setReloadKey((key) => key + 1);
            }}
          >
            Retry
          </button>
        </div>
      )}
      {loading && !loadError && <p className="mt-2 text-sm text-slate-500">Loading customers…</p>}

      {/* =========================
          PAGE HEADER
      ========================== */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-[#06483f] sm:text-3xl lg:text-[34px]">
            Customers
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 self-start sm:self-auto shrink-0 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => navigate("/guarantor-referral")}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-lg bg-[#006052] px-4 py-2.5 sm:px-4.5 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-[#004d42] active:bg-[#003d34] transition-colors focus:outline-none focus:ring-2 focus:ring-[#006052] focus:ring-offset-1 cursor-pointer shrink-0"
          >
            <UserCheck className="h-4 w-4 sm:h-4.5 sm:w-4.5" strokeWidth={2} />
            <span>Guarantor / Referral</span>
          </button>

          <button
            type="button"
            onClick={() => navigate("/referral-commission")}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-lg border border-[#006052] bg-white text-[#006052] hover:bg-emerald-50 active:bg-emerald-100/70 px-4 py-2.5 sm:px-4.5 text-xs sm:text-sm font-semibold shadow-2xs transition-colors focus:outline-none focus:ring-2 focus:ring-[#006052] focus:ring-offset-1 cursor-pointer shrink-0"
          >
            <Coins className="h-4 w-4 sm:h-4.5 sm:w-4.5 text-[#006052]" strokeWidth={2} />
            <span>Referral Commission</span>
          </button>
        </div>
      </div>

      {/* =========================
          SUMMARY CARDS
      ========================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4 lg:gap-5">
        <SummaryCard
          icon={Users}
          title="Total Customers"
          value={totalCustomers.toLocaleString("en-IN")}
        />

        <SummaryCard
          icon={Database}
          title="Total Active Deployed"
          value={formatCurrency(totalActiveDeployed)}
        />

        <SummaryCard
          icon={WalletCards}
          title="Total Active Outstanding"
          value={formatCurrency(totalActiveOutstanding)}
        />
      </div>

      {/* =========================
          CUSTOMER TABLE SECTION
      ========================== */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-4 sm:space-y-5">

        {/* =========================
            FILTER ROW
        ========================== */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">

          {/* Search */}
          <div className="relative min-w-0 flex-1">
            <Search
              className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search customer name, ID or loan no."
              className="h-11 sm:h-12 w-full rounded-lg border border-slate-200 bg-white pl-11 pr-4 text-sm sm:text-base text-slate-800 outline-none placeholder:text-slate-400 focus:border-[#006052] focus:ring-2 focus:ring-emerald-100 transition-colors shadow-2xs"
            />
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3 w-full sm:w-auto">
            {/* Status */}
            <div className="relative flex-1 sm:w-48 sm:flex-initial">
              <button
                type="button"
                onClick={() => setStatusOpen((value) => !value)}
                className="flex h-11 sm:h-12 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3.5 sm:px-4 text-sm sm:text-base font-medium text-slate-800 hover:border-slate-300 transition-colors shadow-2xs cursor-pointer"
              >
                <span>
                  <span className="mr-2 text-slate-400 font-normal">Status:</span>
                  <span className="font-semibold text-slate-900">{status}</span>
                </span>
                <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
              </button>

              {statusOpen && (
                <div className="absolute left-0 top-[48px] sm:top-[52px] z-30 w-full rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg">
                  {["All", "Active", "Closed", "Overdue"].map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setStatus(option);
                        setStatusOpen(false);
                        setCurrentPage(1);
                      }}
                      className={`w-full rounded-md px-3 py-2 text-left text-sm sm:text-base transition-colors cursor-pointer ${status === option
                          ? "bg-emerald-50 text-[#006052] font-semibold"
                          : "text-slate-700 hover:bg-slate-50"
                        }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Reset */}
            <button
              type="button"
              onClick={handleReset}
              className="flex h-11 sm:h-12 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-white px-4 text-sm sm:text-base font-semibold text-[#006052] transition hover:bg-emerald-50 cursor-pointer shadow-2xs shrink-0"
            >
              <RotateCcw className="h-4 w-4 text-[#006052]" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* =========================
            TABLE
        ========================== */}
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[940px] table-fixed border-collapse">
            <colgroup>
              <col style={{ width: "12%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "12%" }} />
            </colgroup>

            <thead>
              <tr className="h-12 sm:h-14 bg-slate-50 border-b border-slate-200">
                <TableHeader>Customer ID</TableHeader>
                <TableHeader>Customer Name</TableHeader>
                <TableHeader>Loan No.</TableHeader>
                <TableHeader>Loan Amount</TableHeader>
                <TableHeader>Outstanding Amount</TableHeader>
                <TableHeader>Interest Rate</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Action</TableHeader>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {!hasCustomer ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-sm sm:text-base text-slate-500 font-medium"
                  >
                    No customers created yet...
                  </td>
                </tr>
              ) : paginatedCustomers.length > 0 ? (
                paginatedCustomers.map((item, idx) => (
                  <tr
                    key={`${item.customerId || "cus"}_${item.loanId || "loan"}_${(validCurrentPage - 1) * ITEMS_PER_PAGE + idx}`}
                    className="bg-white hover:bg-slate-50/70 transition-colors"
                  >
                    <td className="px-3.5 py-3.5 sm:py-4 text-sm sm:text-[15px] font-medium text-slate-800 whitespace-nowrap">
                      {item.customerId}
                    </td>

                    <td className="px-3.5 py-3.5 sm:py-4 text-sm sm:text-[15px] font-bold text-slate-900 whitespace-nowrap">
                      {item.customer?.name}
                    </td>

                    <td className="px-3.5 py-3.5 sm:py-4 text-sm sm:text-[15px] text-slate-700 whitespace-nowrap">
                      {item.loanId}
                    </td>

                    <td className="px-3.5 py-3.5 sm:py-4 text-sm sm:text-[15px] font-semibold text-slate-900 whitespace-nowrap">
                      {formatCurrency(item.loanAmount)}
                    </td>

                    <td className="px-3.5 py-3.5 sm:py-4 text-sm sm:text-[15px] font-semibold text-slate-900 whitespace-nowrap">
                      {formatCurrency(item.outstandingAmount)}
                    </td>

                    <td className="px-3.5 py-3.5 sm:py-4 text-sm sm:text-[15px] text-slate-700 whitespace-nowrap">
                      {item.loan?.interestRate
                        ? `${item.loan.interestRate}%`
                        : "—"}
                    </td>

                    <td className="px-3.5 py-3.5 sm:py-4 whitespace-nowrap">
                      <StatusBadge status={item.status} />
                    </td>

                    <td className="px-3.5 py-3.5 sm:py-4 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleView(item)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs sm:text-sm font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
                      >
                        <Eye className="h-4 w-4 text-slate-500" />
                        <span>View</span>
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-sm sm:text-base text-slate-500 font-medium"
                  >
                    No customers match your search or filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* =========================
            TABLE FOOTER
        ========================== */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 sm:pt-4 border-t border-slate-100">
          <p className="text-sm sm:text-[15px] font-medium text-slate-600">
            {filteredCustomers.length === 0 ? (
              "Showing 0 customers"
            ) : filteredCustomers.length === 1 ? (
              "Showing 1 customer"
            ) : (
              <>
                Showing{" "}
                <span className="font-bold text-slate-800">
                  {(validCurrentPage - 1) * ITEMS_PER_PAGE + 1}
                </span>{" "}
                to{" "}
                <span className="font-bold text-slate-800">
                  {Math.min(validCurrentPage * ITEMS_PER_PAGE, filteredCustomers.length)}
                </span>{" "}
                of{" "}
                <span className="font-bold text-slate-800">
                  {filteredCustomers.length}
                </span>{" "}
                customers
              </>
            )}
          </p>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => handlePageChange(validCurrentPage - 1)}
              disabled={validCurrentPage <= 1}
              className="flex h-9 sm:h-10 items-center justify-center gap-1.5 px-3 sm:px-3.5 rounded-lg border border-slate-200 bg-white text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Previous</span>
            </button>

            <div className="flex items-center gap-1 sm:gap-1.5">
              {pageNumbers.map((page, idx) =>
                page === "..." ? (
                  <span
                    key={`ellipsis-${idx}`}
                    className="flex h-9 sm:h-10 min-w-[28px] sm:min-w-[32px] items-center justify-center px-1 text-xs sm:text-sm text-slate-400 font-semibold select-none"
                  >
                    …
                  </span>
                ) : (
                  <button
                    key={page}
                    type="button"
                    onClick={() => handlePageChange(page)}
                    className={`flex h-9 sm:h-10 min-w-[36px] sm:min-w-[40px] px-2.5 items-center justify-center rounded-lg text-xs sm:text-sm font-bold transition-colors cursor-pointer ${validCurrentPage === page
                        ? "bg-[#006052] border border-[#006052] text-white shadow-2xs"
                        : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300"
                      }`}
                    aria-label={`Page ${page}`}
                    aria-current={validCurrentPage === page ? "page" : undefined}
                  >
                    {page}
                  </button>
                )
              )}
            </div>

            <button
              type="button"
              onClick={() => handlePageChange(validCurrentPage + 1)}
              disabled={validCurrentPage >= totalPages || filteredCustomers.length === 0}
              className="flex h-9 sm:h-10 items-center justify-center gap-1.5 px-3 sm:px-3.5 rounded-lg border border-slate-200 bg-white text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              aria-label="Next page"
            >
              <span>Next</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

      </div>

    </div>
  );
};

/* =========================
   TABLE COMPONENTS
========================= */

const TableHeader = ({ children }) => (
  <th className="whitespace-nowrap px-3.5 py-3.5 text-left text-xs sm:text-sm font-bold text-slate-700 tracking-wide">
    {children}
  </th>
);

const TableCell = ({ children }) => (
  <td className="overflow-hidden whitespace-nowrap px-3.5 py-3.5 text-sm sm:text-[15px] text-slate-800">
    {children}
  </td>
);

export default Customer;