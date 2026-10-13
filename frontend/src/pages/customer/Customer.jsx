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
} from "lucide-react";

import { loadCustomerEntries } from "../../services/customerApi";
import { loadPayments } from "../../services/collectionApi";
import CustomerView from "./CustomerView";
import { calculateLoanOutstanding } from "../../utils/loanCalculations";

const formatCurrency = (value) => {
  const amount = Math.round(Number(value || 0));

  return `₹${amount.toLocaleString("en-IN")}`;
};

const getCustomerId = (data) => {
  if (!data) return null;
  if (data.customerId) return data.customerId;
  if (data.customer?.customerId) return data.customer.customerId;
  if (data.customer?.mobile) return `CUS-${data.customer.mobile.slice(-5)}`;
  if (data.mobile) return `CUS-${data.mobile.slice(-5)}`;
  return null;
};

const getLoanId = (data, customerId) => {
  if (!data) return null;
  if (data.loanId) return data.loanId;
  if (data.loan?.loanId) return data.loan.loanId;
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
    Active: "bg-emerald-100 text-emerald-700",
    Closed: "bg-slate-100 text-slate-600",
    Overdue: "bg-red-100 text-red-600",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
        styles[status] || "bg-slate-100 text-slate-600"
      }`}
    >
      {status}
    </span>
  );
};

const SummaryCard = ({ icon: Icon, title, value }) => {
  return (
    <div className="min-h-[96px] h-full rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm transition-shadow hover:shadow-md min-w-0 w-full">
      <div className="flex h-full items-center gap-3.5 sm:gap-4 min-w-0">
        <div className="flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
          <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-700" strokeWidth={1.8} />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm font-medium text-slate-500 mb-0.5 sm:mb-1 leading-snug break-words">
            {title}
          </p>

          <p 
            className="text-base sm:text-lg lg:text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap leading-tight"
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

  useEffect(() => {
    let active = true;

    Promise.all([loadCustomerEntries(), loadPayments()])
      .then(([entries, payments]) => {
        if (!active) return;
        setCustomerData(entries);
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
    return customerData.map(data => {
      const customer = data.customer || {};
      const vehicle = data.vehicle || {};
      const loan = data.loan || {};

      const customerId = getCustomerId(data);
      const loanId = getLoanId(data, customerId);

      const loanCalc = calculateLoanOutstanding(data, allPayments);
      const loanAmount = loanCalc.principal;
      const outstandingAmount = loanCalc.outstandingAmount;
      const customerStatus = data.status || (customer.name ? "Active" : "—");

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

  const handleReset = () => {
    setSearch("");
    setStatus("All");
    setStatusOpen(false);
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
  const totalAmountDeployed = processedCustomers.reduce((sum, item) => sum + item.loanAmount, 0);
  const totalOutstanding = processedCustomers.reduce((sum, item) => sum + item.outstandingAmount, 0);

  return (
    <div className="bg-white px-3 pb-6 sm:px-6 lg:px-8">
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

      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">

        <div>
          <h1 className="text-2xl font-bold leading-none tracking-tight text-[#06483f] sm:text-[32px]">
            Customers
          </h1>

          <p className="mt-3 text-[15px] text-slate-500">
            Manage and view all customers and their active loan information.
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate("/guarantor-referral")}
          className="inline-flex items-center justify-center gap-2 self-start rounded-lg bg-[#006052] px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-[#004d42] active:bg-[#003d34] transition-colors focus:outline-none focus:ring-2 focus:ring-[#006052] focus:ring-offset-1 cursor-pointer sm:self-auto shrink-0"
        >
          <UserCheck className="h-4 w-4" strokeWidth={2} />
          <span>Guarantor / Referral</span>
        </button>

      </div>

      {/* =========================
          SUMMARY CARDS
      ========================== */}

      <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4 lg:mt-8">

        <SummaryCard
          icon={Users}
          title="Total Customers"
          value={totalCustomers.toLocaleString("en-IN")}
        />

        <SummaryCard
          icon={Database}
          title="Total Amount Deployed"
          value={formatCurrency(
            totalAmountDeployed
          )}
        />

        <SummaryCard
          icon={WalletCards}
          title="Total Outstanding"
          value={formatCurrency(
            totalOutstanding
          )}
        />

      </div>

      {/* =========================
          CUSTOMER TABLE SECTION
      ========================== */}

      <div className="mt-6 rounded-md border border-slate-200 bg-white p-4">

        {/* =========================
            FILTER ROW
        ========================== */}

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-5">

          {/* Search */}

          <div className="relative min-w-0 flex-1">

            <Search
              className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500"
            />

            <input
              type="text"
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              placeholder="Search customer name, ID or loan no."
              className="h-[46px] w-full rounded-lg border border-slate-200 bg-white pl-12 pr-4 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            />

          </div>

          {/* Status */}

          <div className="relative w-full shrink-0 md:w-[188px]">

            <button
              type="button"
              onClick={() =>
                setStatusOpen(
                  (value) => !value
                )
              }
              className="flex h-[46px] w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-800"
            >

              <span>
                <span className="mr-2 text-slate-400">
                  Status
                </span>

                {status}
              </span>

              <ChevronDown className="h-4 w-4 text-slate-500" />

            </button>

            {statusOpen && (
              <div className="absolute left-0 top-[52px] z-30 w-full rounded-lg border border-slate-200 bg-white p-1 shadow-lg">

                {[
                  "All",
                  "Active",
                  "Closed",
                  "Overdue",
                ].map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setStatus(option);
                      setStatusOpen(false);
                    }}
                    className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-emerald-50"
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
            className="flex h-[46px] w-full items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-white text-sm font-medium text-[#006052] transition hover:bg-emerald-50 md:w-[88px]"
          >
            <RotateCcw className="h-4 w-4" />

            Reset
          </button>

        </div>

        {/* =========================
            TABLE
        ========================== */}

        <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200">

          <table className="w-full min-w-[900px] table-fixed border-collapse">

            {/* Exact column proportions */}

            <colgroup>
              <col style={{ width: "11%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "15%" }} />
            </colgroup>

            {/* Header */}

            <thead>

              <tr className="h-[54px] bg-slate-50">

                <TableHeader>
                  Customer ID
                </TableHeader>

                <TableHeader>
                  Customer Name
                </TableHeader>

                <TableHeader>
                  Loan No.
                </TableHeader>

                <TableHeader>
                  Loan Amount
                </TableHeader>

                <TableHeader>
                  Outstanding Amount
                </TableHeader>

                <TableHeader>
                  Interest Rate
                </TableHeader>

                <TableHeader>
                  Status
                </TableHeader>

                <TableHeader>
                  Action
                </TableHeader>

              </tr>

            </thead>

            {/* Body */}
<tbody>
  {!hasCustomer ? (
    <tr>
      <td
        colSpan={8}
        className="px-4 py-12 text-center text-sm text-slate-500"
      >
        No customers created yet...
      </td>
    </tr>
  ) : filteredCustomers.length > 0 ? (
    filteredCustomers.map((item, idx) => (
      <tr key={idx} className="border-b border-slate-100 bg-white hover:bg-slate-50/50 transition-colors">
        <td className="px-3 py-3 text-[13px] text-slate-800">
          {item.customerId}
        </td>

        <td className="px-3 py-3 text-[13px] font-semibold text-slate-800">
          {item.customer?.name}
        </td>

        <td className="px-3 py-3 text-[13px] text-slate-700">
          {item.loanId}
        </td>

        <td className="px-3 py-3 text-[13px] font-medium text-slate-800">
          {formatCurrency(item.loanAmount)}
        </td>

        <td className="px-3 py-3 text-[13px] font-medium text-slate-800">
          {formatCurrency(item.outstandingAmount)}
        </td>

        <td className="px-3 py-3 text-[13px] text-slate-700">
          {item.loan?.interestRate
            ? `${item.loan.interestRate}%`
            : "—"}
        </td>

        <td className="px-3 py-3">
          <StatusBadge status={item.status} />
        </td>

        <td className="px-3 py-3">
          <button
            type="button"
            onClick={() => handleView(item)}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <Eye className="h-3.5 w-3.5" />
            View
          </button>
        </td>
      </tr>
    ))
  ) : (
    <tr>
      <td
        colSpan={8}
        className="px-4 py-12 text-center text-sm text-slate-500"
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

        <div className="flex items-center justify-between pt-4">

          <p className="text-sm text-slate-500">
            {filteredCustomers.length === 1
              ? "Showing 1 customer"
              : `Showing ${filteredCustomers.length} customers`}
          </p>

          <div className="flex items-center gap-2">

            <button
              type="button"
              disabled
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-300"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#006052] text-sm font-semibold text-white"
            >
              1
            </button>

            <button
              type="button"
              disabled
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-300"
            >
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
  <th className="whitespace-nowrap px-3 text-left text-[13px] font-semibold text-slate-700">
    {children}
  </th>
);

const TableCell = ({ children }) => (
  <td className="overflow-hidden whitespace-nowrap px-3 text-[13px] text-slate-800">
    {children}
  </td>
);

export default Customer;