import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RefreshCw,
  Search,
  Calendar,
  Eye,
  ChevronLeft,
  ChevronRight,
  User,
  Phone,
  ArrowLeft,
  X,
  Plus,
  FileText,
  RotateCcw,
  ShieldCheck,
  MoreVertical,
  ExternalLink,
} from 'lucide-react';
import { extractRecordCustomerId, extractRecordLoanId } from '../customer/CustomerView';
import LoanDetailsView from '../customer/LoanDetailsView';

const formatCurrency = (value) => {
  const amount = Math.round(Number(value || 0));
  return `₹${amount.toLocaleString('en-IN')}`;
};

const formatDate = (dateVal) => {
  if (!dateVal) return '—';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
};

const getReLoanDate = (record) => {
  if (!record) return null;
  const rawDate =
    record.createdAt ||
    record.customer?.applicationDate ||
    record.applicationDate ||
    record.loan?.applicationDate ||
    record.loan?.firstDueDate ||
    record.date;
  if (!rawDate) return null;
  const d = new Date(rawDate);
  return isNaN(d.getTime()) ? null : d;
};

const StatusBadge = ({ status }) => {
  const styles = {
    Active: 'bg-emerald-100 text-emerald-800 border border-emerald-200/70',
    Closed: 'bg-slate-100 text-slate-700 border border-slate-200/70',
    Settled: 'bg-slate-100 text-slate-700 border border-slate-200/70',
    Overdue: 'bg-red-100 text-red-700 border border-red-200/70',
    Foreclosed: 'bg-purple-100 text-purple-800 border border-purple-200/70',
    'Sold · Foreclosed': 'bg-purple-100 text-purple-800 border border-purple-200/70',
    'Midway Closed': 'bg-amber-100 text-amber-800 border border-amber-300/70',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        styles[status] || 'bg-slate-100 text-slate-700 border border-slate-200/70'
      }`}
    >
      {status || 'Active'}
    </span>
  );
};

const ReLoanSearch = () => {
  const navigate = useNavigate();

  // Storage data
  const [customersList, setCustomersList] = useState([]);
  const [viewingLoanId, setViewingLoanId] = useState(null);

  // Filters & Search
  const [dateFilter, setDateFilter] = useState('all'); // 'all' | 'month' | 'week' | 'custom'
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modal to initiate assessment for existing customer
  const [isAssessmentModalOpen, setIsAssessmentModalOpen] = useState(false);
  const [assessmentCustomerSearch, setAssessmentCustomerSearch] = useState('');

  // Active action menu row dropdown
  const [openActionMenuId, setOpenActionMenuId] = useState(null);

  // Load storage
  useEffect(() => {
    const loadData = () => {
      try {
        const raw = JSON.parse(localStorage.getItem('motoLendCustomersList_data') || '[]');
        setCustomersList(Array.isArray(raw) ? raw : []);
      } catch (err) {
        console.error('Failed to load customers for re-loan:', err);
        setCustomersList([]);
      }
    };

    loadData();
    window.addEventListener('storage', loadData);
    window.addEventListener('customersDataUpdated', loadData);
    return () => {
      window.removeEventListener('storage', loadData);
      window.removeEventListener('customersDataUpdated', loadData);
    };
  }, []);

  // Close actions menu on outside click
  useEffect(() => {
    const handleClickOutside = () => setOpenActionMenuId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // 1. Group records by unique customer ID to know each customer's complete loan history
  const customerLoansMap = useMemo(() => {
    const map = new Map();
    customersList.forEach((record, index) => {
      const cId = extractRecordCustomerId(record, index);
      if (!cId) return;
      const cleanCId = cId.trim().toLowerCase();
      if (!map.has(cleanCId)) {
        map.set(cleanCId, []);
      }
      map.get(cleanCId).push({ record, index });
    });
    return map;
  }, [customersList]);

  // 2. Extract actual Re-Loan records (never count normal first-time loans as Re-Loans)
  const allReLoans = useMemo(() => {
    const reLoanEntries = [];

    customersList.forEach((record, index) => {
      const cId = extractRecordCustomerId(record, index) || '—';
      const lId = extractRecordLoanId(record, index) || `LN-${String(index + 1).padStart(3, '0')}`;
      const cleanCId = cId.trim().toLowerCase();
      const customerLoans = customerLoansMap.get(cleanCId) || [];

      // Check explicit Re-Loan identifiers
      const hasExplicitReLoanFlag = Boolean(
        record.isReLoan === true ||
        record.isReLoan === 'true' ||
        record.loan?.isReLoan === true ||
        record.loan?.isReLoan === 'true' ||
        record.customer?.isReLoanCustomer === true ||
        record.customer?.isReLoanCustomer === 'true' ||
        record.isReLoanCustomer === true ||
        record.reLoan === true ||
        record.loanType === 'Re-Loan' ||
        record.loan?.loanType === 'Re-Loan' ||
        (typeof record.vehicle?.remarks === 'string' &&
          record.vehicle.remarks.toLowerCase().includes('re-loan'))
      );

      // Or if this customer has multiple loans, and this record is not their very first loan
      let isSubsequentCustomerLoan = false;
      if (customerLoans.length > 1) {
        const firstLoanIndex = customerLoans[0].index;
        if (index !== firstLoanIndex) {
          isSubsequentCustomerLoan = true;
        }
      }

      const isReLoan = hasExplicitReLoanFlag || isSubsequentCustomerLoan;
      if (!isReLoan) {
        return; // Normal first-time loan: do not count as Re-Loan
      }

      // Customer info
      const cust = record.customer || {};
      const customerName = (cust.name || record.name || 'Customer').trim();
      const mobile = (cust.mobile || record.mobile || '').trim() || '—';

      // Customer loan history
      const totalLoansCount = customerLoans.length;
      const activeLoansCount = customerLoans.filter(({ record: r }) => {
        const st = (r.status || r.loan?.status || 'Active').toLowerCase();
        return (
          st !== 'closed' &&
          st !== 'midway closed' &&
          st !== 'foreclosed' &&
          st !== 'sold · foreclosed'
        );
      }).length;

      // Re-Loan specific details
      const loanObj = record.loan || {};
      const loanAmount = Number(record.loanAmount || loanObj.loanAmount || 0);
      const loanStatus = record.status || loanObj.status || 'Active';
      const dateObj = getReLoanDate(record);

      reLoanEntries.push({
        record,
        index,
        customerId: cId,
        customerName,
        mobile,
        reLoanId: lId,
        loanAmount,
        status: loanStatus,
        totalLoansCount,
        activeLoansCount,
        date: dateObj,
        rawDate: record.createdAt || cust.applicationDate || record.applicationDate,
      });
    });

    return reLoanEntries;
  }, [customersList, customerLoansMap]);

  // 3. Filter Re-Loans by Date Filter (Updates both KPI card and table records)
  const dateFilteredReLoans = useMemo(() => {
    if (dateFilter === 'all') {
      return allReLoans;
    }

    const now = new Date();

    if (dateFilter === 'month') {
      const curYear = now.getFullYear();
      const curMonth = now.getMonth();
      return allReLoans.filter((item) => {
        if (!item.date) return false;
        return item.date.getFullYear() === curYear && item.date.getMonth() === curMonth;
      });
    }

    if (dateFilter === 'week') {
      const day = now.getDay();
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      const monday = new Date(now);
      monday.setDate(now.getDate() + diffToMonday);
      monday.setHours(0, 0, 0, 0);

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      return allReLoans.filter((item) => {
        if (!item.date) return false;
        return item.date >= monday && item.date <= sunday;
      });
    }

    if (dateFilter === 'custom') {
      const start = customStartDate ? new Date(customStartDate + 'T00:00:00') : null;
      const end = customEndDate ? new Date(customEndDate + 'T23:59:59.999') : null;

      return allReLoans.filter((item) => {
        if (!item.date) return false;
        if (start && item.date < start) return false;
        if (end && item.date > end) return false;
        return true;
      });
    }

    return allReLoans;
  }, [allReLoans, dateFilter, customStartDate, customEndDate]);

  // 4. Search Filter
  const filteredReLoans = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return dateFilteredReLoans;

    return dateFilteredReLoans.filter((item) => {
      const matchesName = item.customerName.toLowerCase().includes(q);
      const matchesCId = item.customerId.toLowerCase().includes(q);
      const matchesMobile = item.mobile.includes(q);
      const matchesLoanId = item.reLoanId.toLowerCase().includes(q);
      return matchesName || matchesCId || matchesMobile || matchesLoanId;
    });
  }, [dateFilteredReLoans, searchQuery]);

  // 5. Pagination
  const totalPages = Math.max(1, Math.ceil(filteredReLoans.length / pageSize));
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const paginatedReLoans = useMemo(() => {
    const start = (validCurrentPage - 1) * pageSize;
    return filteredReLoans.slice(start, start + pageSize);
  }, [filteredReLoans, validCurrentPage, pageSize]);

  // Existing customer list for the "+ New Re-Loan Assessment" modal
  const eligibleAssessmentCustomers = useMemo(() => {
    const list = [];
    customerLoansMap.forEach((loans, cleanCId) => {
      const first = loans[0]?.record || {};
      const cId = extractRecordCustomerId(first, loans[0]?.index) || cleanCId;
      const name = (first.customer?.name || first.name || 'Customer').trim();
      const mobile = (first.customer?.mobile || first.mobile || '').trim();
      list.push({
        customerId: cId,
        name,
        mobile,
        loansCount: loans.length,
      });
    });

    const q = assessmentCustomerSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.customerId.toLowerCase().includes(q) ||
        c.mobile.includes(q)
    );
  }, [customerLoansMap, assessmentCustomerSearch]);

  // If a loan details view is requested, reuse existing LoanDetailsView component
  if (viewingLoanId) {
    return (
      <LoanDetailsView
        loanId={viewingLoanId}
        onBack={() => setViewingLoanId(null)}
      />
    );
  }

  // Exact KPI value: Total Re-Loans Given (respects selected date filter)
  const totalReLoansGivenCount = dateFilteredReLoans.length;

  return (
    <div className="flex flex-col flex-1 min-h-screen w-full max-w-full overflow-x-hidden bg-slate-50/50 px-4 sm:px-6 lg:px-8 py-5 sm:py-6 font-sans space-y-5">
      {/* =========================
          PAGE HEADER
      ========================== */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <button
            type="button"
            onClick={() => navigate('/customers')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#006052] hover:text-[#004d42] transition-colors mb-1.5 cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Customers</span>
          </button>
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-[#06483f] sm:text-3xl">
            Re-Loans
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Manage and track all Re-Loan accounts issued to existing onboarded borrowers.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsAssessmentModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#006052] px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-[#004d42] active:bg-[#003d34] transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>New Re-Loan Assessment</span>
          </button>
        </div>
      </div>

      {/* ========================================================
          1. TOP KPI CARD — EXACTLY ONE CARD: "TOTAL RE-LOANS GIVEN"
      ========================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="min-h-[104px] rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition-shadow hover:shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-[#006052]">
              <RefreshCw className="h-6 w-6 text-[#006052]" strokeWidth={2} />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm font-medium text-slate-500 mb-0.5">
                Total Re-Loans Given
              </p>
              <p className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 leading-tight">
                {totalReLoansGivenCount.toLocaleString('en-IN')}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {dateFilter === 'all'
                  ? 'All-time Re-Loan accounts'
                  : dateFilter === 'month'
                  ? 'Created this calendar month'
                  : dateFilter === 'week'
                  ? 'Created this calendar week'
                  : 'Created within custom range'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* =========================
          MAIN TABLE CARD CONTAINER
      ========================== */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-4">
        {/* ========================================================
            2. DATE FILTER & SEARCH BAR (ABOVE TABLE)
        ========================================================= */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3.5 pb-2">
          {/* Search Box */}
          <div className="relative min-w-0 flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search by customer, customer ID, mobile, or re-loan ID..."
              className="h-10 sm:h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-9 text-xs sm:text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-[#006052] focus:ring-2 focus:ring-emerald-100 transition-colors shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setCurrentPage(1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Date Filter Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50/70 p-1 text-xs font-semibold shadow-2xs">
              <button
                type="button"
                onClick={() => {
                  setDateFilter('all');
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                  dateFilter === 'all'
                    ? 'bg-[#006052] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                All Time
              </button>

              <button
                type="button"
                onClick={() => {
                  setDateFilter('month');
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                  dateFilter === 'month'
                    ? 'bg-[#006052] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                This Month
              </button>

              <button
                type="button"
                onClick={() => {
                  setDateFilter('week');
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                  dateFilter === 'week'
                    ? 'bg-[#006052] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                This Week
              </button>

              <button
                type="button"
                onClick={() => {
                  setDateFilter('custom');
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                  dateFilter === 'custom'
                    ? 'bg-[#006052] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <Calendar className="h-3 w-3" />
                <span>Custom Date Range</span>
              </button>
            </div>

            {(dateFilter !== 'all' || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setDateFilter('all');
                  setCustomStartDate('');
                  setCustomEndDate('');
                  setSearchQuery('');
                  setCurrentPage(1);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer shadow-2xs"
                title="Reset filters"
              >
                <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Custom Date Range Pickers (conditionally visible) */}
        {dateFilter === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 p-3 bg-emerald-50/50 rounded-lg border border-emerald-100 text-xs">
            <span className="font-semibold text-[#006052]">Select Custom Date Range:</span>
            <div className="flex items-center gap-2">
              <label htmlFor="custom-start-date" className="text-slate-600">From:</label>
              <input
                id="custom-start-date"
                type="date"
                value={customStartDate}
                onChange={(e) => {
                  setCustomStartDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-8 px-2.5 rounded-md border border-slate-300 bg-white text-xs text-slate-800 focus:outline-none focus:border-[#006052]"
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="custom-end-date" className="text-slate-600">To:</label>
              <input
                id="custom-end-date"
                type="date"
                value={customEndDate}
                onChange={(e) => {
                  setCustomEndDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-8 px-2.5 rounded-md border border-slate-300 bg-white text-xs text-slate-800 focus:outline-none focus:border-[#006052]"
              />
            </div>
            {(customStartDate || customEndDate) && (
              <span className="text-[11px] text-slate-500">
                (Filtered {dateFilteredReLoans.length} Re-Loan{dateFilteredReLoans.length !== 1 ? 's' : ''})
              </span>
            )}
          </div>
        )}

        {/* ========================================================
            3. RE-LOAN TABLE (DARK GREEN HEADER, WHITE ROWS)
        ========================================================= */}
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[980px] table-fixed border-collapse">
            <colgroup>
              <col style={{ width: '18%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '12%' }} />
            </colgroup>

            {/* Dark green header as requested */}
            <thead className="bg-[#006052] text-white">
              <tr className="h-12 border-b border-[#004d42]">
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-white">
                  Customer
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-white">
                  Mobile
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-white">
                  Customer ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-white">
                  Loan History
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-white">
                  Re-Loan Details
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-white">
                  Current Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-white">
                  Action
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 bg-white">
              {paginatedReLoans.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-sm text-slate-500 font-medium"
                  >
                    {allReLoans.length === 0 ? (
                      <div className="space-y-2 max-w-md mx-auto">
                        <RefreshCw className="h-8 w-8 text-slate-300 mx-auto" />
                        <p className="text-slate-700 font-semibold text-base">
                          No Re-Loan accounts recorded yet
                        </p>
                        <p className="text-xs text-slate-500">
                          Re-Loans are issued to existing customers who already have an account. Click "New Re-Loan Assessment" above to evaluate an eligible customer.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-slate-700 font-semibold">
                          No Re-Loans match the current filter or search criteria.
                        </p>
                        <p className="text-xs text-slate-400">
                          Try adjusting your date range or clearing your search query.
                        </p>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                paginatedReLoans.map((item) => (
                  <tr
                    key={`${item.customerId}_${item.reLoanId}_${item.index}`}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    {/* 1. Customer: Name and sub-badge */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-emerald-50 text-[#006052] border border-emerald-100 flex items-center justify-center shrink-0">
                          <User className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">
                            {item.customerName}
                          </p>
                          <span className="text-[11px] font-mono text-slate-400">
                            {item.customerId}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* 2. Mobile */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-xs sm:text-sm text-slate-700 font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-slate-400" />
                        <span>{item.mobile}</span>
                      </span>
                    </td>

                    {/* 3. Customer ID */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md font-mono text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                        {item.customerId}
                      </span>
                    </td>

                    {/* 4. Loan History: Total loans and active loans */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-bold text-slate-800">
                          {item.totalLoansCount} Loan{item.totalLoansCount !== 1 ? 's' : ''}
                        </span>
                        <span className="text-[11px] text-slate-500 font-medium">
                          {item.activeLoansCount > 0
                            ? `${item.activeLoansCount} Active`
                            : 'All Settled'}
                        </span>
                      </div>
                    </td>

                    {/* 5. Re-Loan Details: Loan ID and Amount */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-xs font-bold text-[#006052]">
                          {item.reLoanId}
                        </span>
                        <span className="text-sm font-semibold text-slate-900">
                          {formatCurrency(item.loanAmount)}
                        </span>
                      </div>
                    </td>

                    {/* 6. Current Status */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <StatusBadge status={item.status} />
                    </td>

                    {/* 7. Action: View Details button & actions menu */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-right">
                      <div className="inline-flex items-center justify-end gap-1.5 relative">
                        <button
                          type="button"
                          onClick={() => setViewingLoanId(item.reLoanId)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-[#006052] hover:text-white hover:border-[#006052] transition-colors cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>View Details</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenActionMenuId(
                              openActionMenuId === item.reLoanId ? null : item.reLoanId
                            );
                          }}
                          className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-50 shadow-2xs cursor-pointer"
                          title="More actions"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>

                        {/* Actions dropdown menu */}
                        {openActionMenuId === item.reLoanId && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-0 top-full mt-1.5 w-48 rounded-xl bg-white border border-slate-200 shadow-lg py-1 z-30 text-left text-xs font-medium animate-in fade-in zoom-in-95 duration-100"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setOpenActionMenuId(null);
                                setViewingLoanId(item.reLoanId);
                              }}
                              className="w-full px-3.5 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                            >
                              <Eye className="h-3.5 w-3.5 text-slate-400" />
                              <span>View Loan Details</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setOpenActionMenuId(null);
                                navigate(`/re-loan/${encodeURIComponent(item.customerId)}`);
                              }}
                              className="w-full px-3.5 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                            >
                              <ShieldCheck className="h-3.5 w-3.5 text-[#006052]" />
                              <span>Risk Assessment</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setOpenActionMenuId(null);
                                navigate(`/loans/${encodeURIComponent(item.reLoanId)}`);
                              }}
                              className="w-full px-3.5 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer border-t border-slate-100"
                            >
                              <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                              <span>Open in Loans Page</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ========================================================
            5. TABLE FOOTER (PAGINATION & PAGE SIZE SELECTOR)
        ========================================================= */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs text-slate-600">
          <div className="flex items-center gap-3">
            <p className="font-medium">
              {filteredReLoans.length === 0 ? (
                'Showing 0 Re-Loans'
              ) : (
                <>
                  Showing{' '}
                  <span className="font-bold text-slate-800">
                    {(validCurrentPage - 1) * pageSize + 1}
                  </span>{' '}
                  to{' '}
                  <span className="font-bold text-slate-800">
                    {Math.min(validCurrentPage * pageSize, filteredReLoans.length)}
                  </span>{' '}
                  of{' '}
                  <span className="font-bold text-slate-800">
                    {filteredReLoans.length}
                  </span>{' '}
                  Re-Loan{filteredReLoans.length !== 1 ? 's' : ''}
                </>
              )}
            </p>

            {/* Page Size Selector */}
            <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200">
              <span className="text-slate-400">Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="h-7 rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700 font-semibold focus:outline-none focus:border-[#006052]"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>

          {/* Page Navigation */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={validCurrentPage === 1}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => {
                    return (
                      p === 1 ||
                      p === totalPages ||
                      (p >= validCurrentPage - 1 && p <= validCurrentPage + 1)
                    );
                  })
                  .map((p, idx, arr) => {
                    const prev = arr[idx - 1];
                    const hasGap = prev && p - prev > 1;

                    return (
                      <React.Fragment key={p}>
                        {hasGap && <span className="px-1 text-slate-400">...</span>}
                        <button
                          type="button"
                          onClick={() => setCurrentPage(p)}
                          className={`h-8 min-w-[32px] px-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                            validCurrentPage === p
                              ? 'bg-[#006052] text-white shadow-xs'
                              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {p}
                        </button>
                      </React.Fragment>
                    );
                  })}
              </div>

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={validCurrentPage === totalPages}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================
          CUSTOMER ASSESSMENT SELECTION MODAL
      ========================================================= */}
      {isAssessmentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-xl w-full p-5 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-emerald-50 text-[#006052] flex items-center justify-center">
                  <RefreshCw className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Select Customer for Re-Loan Assessment
                  </h3>
                  <p className="text-xs text-slate-500">
                    Choose an existing onboarded borrower to scan loan history and credit risk.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAssessmentModalOpen(false);
                  setAssessmentCustomerSearch('');
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal search */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={assessmentCustomerSearch}
                onChange={(e) => setAssessmentCustomerSearch(e.target.value)}
                placeholder="Search existing customer by name, ID, or phone..."
                className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-200 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052]"
              />
            </div>

            {/* Customer List */}
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-100">
              {eligibleAssessmentCustomers.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No existing customers found.
                </div>
              ) : (
                eligibleAssessmentCustomers.map((cust) => (
                  <div
                    key={cust.customerId}
                    className="p-3 hover:bg-slate-50 flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs sm:text-sm text-slate-900 truncate">
                          {cust.name}
                        </span>
                        <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                          {cust.customerId}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {cust.mobile || 'No mobile'} • {cust.loansCount} existing loan{cust.loansCount !== 1 ? 's' : ''}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setIsAssessmentModalOpen(false);
                        navigate(`/re-loan/${encodeURIComponent(cust.customerId)}`);
                      }}
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#006052] hover:bg-[#004d42] text-white text-xs font-semibold shadow-2xs cursor-pointer"
                    >
                      <span>Run Assessment</span>
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsAssessmentModalOpen(false);
                  setAssessmentCustomerSearch('');
                }}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReLoanSearch;
