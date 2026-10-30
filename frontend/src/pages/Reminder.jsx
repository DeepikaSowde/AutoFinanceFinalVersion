import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Clock,
  AlertCircle,
  IndianRupee,
  Plus,
  Search,
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  BellRing,
  Trash2,
  Check,
} from 'lucide-react';

import {
  processPaymentAlertsAndKPIs,
  filterAlertsByTab,
  searchAlerts,
  sortAlerts,
} from '../utils/reminderCalculations';
import {
  getCustomReminders,
  loadCustomReminders,
  evaluateCustomReminderStatus,
  updateCustomReminder,
  deleteCustomReminder,
  REMINDERS_UPDATE_EVENT,
} from '../utils/reminderStorage';
import { getPenaltyRecords, getPenaltySettings, usePenaltyData } from '../utils/penaltyRules';
import { syncVehiclesWithClosedLoans } from '../utils/vehicleStatusHelper';
import { DATA_CHANGED_EVENT, getSessionUser } from '../services/api';
import { loadCustomerEntries } from '../services/customerApi';
import { loadPayments } from '../services/collectionApi';
import { parseToDate } from '../utils/dateUtils';
import CreateReminderDrawer from '../components/reminders/CreateReminderDrawer';

const TABS = [
  'All',
  'Due Today',
  'Upcoming',
  'Overdue',
  'Penalty Applied',
  'Custom Reminders',
];

const SORT_OPTIONS = [
  'Overdue Days — High to Low',
  'Overdue Days — Low to High',
  'Due Date — Earliest First',
  'Penalty Amount — Highest First',
];

const formatINR = (val) => {
  const num = Math.round(Number(val || 0));
  return `₹${num.toLocaleString('en-IN')}`;
};

const formatDueDate = (dateStr) => {
  if (!dateStr) return '—';
  const d = parseToDate(dateStr);
  if (!d) return String(dateStr);
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
};

export default function Reminder() {
  const navigate = useNavigate();

  // State
  const [rawCustomers, setRawCustomers] = useState([]);
  const [allPayments, setAllPayments] = useState([]);
  // Penalties come from the server's copy; the number changes with each fresh copy.
  const penaltyVersion = usePenaltyData();
  const [customReminders, setCustomReminders] = useState(() => getCustomReminders());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const user = getSessionUser();
  const canAdd = user?.role === 'admin' || Boolean(user?.permissions?.reminders?.add);
  const canEdit = user?.role === 'admin' || Boolean(user?.permissions?.reminders?.edit);

  const [activeTab, setActiveTab] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSort, setSelectedSort] = useState('Overdue Days — High to Low');
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 8;

  const [toastMessage, setToastMessage] = useState(null);

  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  }, []);

  // Loans, payments and custom reminders from the API; reload after any save (e.g. a payment).
  useEffect(() => {
    let active = true;
    const load = () =>
      Promise.all([loadCustomerEntries(), loadPayments(), loadCustomReminders()])
        .then(([entries, payments]) => {
          if (!active) return;
          setRawCustomers(syncVehiclesWithClosedLoans(entries));
          setAllPayments(payments);
          setLoadError('');
        })
        .catch((error) => active && setLoadError(error.message))
        .finally(() => active && setLoading(false));

    const handleReminders = () => setCustomReminders(getCustomReminders());

    load();
    window.addEventListener(DATA_CHANGED_EVENT, load);
    window.addEventListener(REMINDERS_UPDATE_EVENT, handleReminders);

    return () => {
      active = false;
      window.removeEventListener(DATA_CHANGED_EVENT, load);
      window.removeEventListener(REMINDERS_UPDATE_EVENT, handleReminders);
    };
  }, []);

  // Dynamic KPI and Payment Alert calculations from actual application records
  const { alerts, kpis } = useMemo(() => {
    return processPaymentAlertsAndKPIs(
      rawCustomers,
      allPayments,
      getPenaltySettings(),
      getPenaltyRecords(),
      new Date()
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawCustomers, allPayments, penaltyVersion]);

  // Filter and sort payment alerts
  const processedAlerts = useMemo(() => {
    if (activeTab === 'Custom Reminders') return [];
    const tabFiltered = filterAlertsByTab(alerts, activeTab);
    const searched = searchAlerts(tabFiltered, searchQuery);
    return sortAlerts(searched, selectedSort);
  }, [alerts, activeTab, searchQuery, selectedSort]);

  // Process and sort custom reminders when on Custom Reminders tab
  const processedCustomReminders = useMemo(() => {
    if (activeTab !== 'Custom Reminders') return [];

    let list = customReminders.map((r) => ({
      ...r,
      evaluatedStatus: evaluateCustomReminderStatus(r),
    }));

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (r) =>
          String(r.customerName || '').toLowerCase().includes(q) ||
          String(r.customerId || '').toLowerCase().includes(q) ||
          String(r.loanId || '').toLowerCase().includes(q) ||
          String(r.title || '').toLowerCase().includes(q) ||
          String(r.notes || '').toLowerCase().includes(q)
      );
    }

    // Sort custom reminders
    list.sort((a, b) => {
      const dateA = a.scheduleDate ? new Date(a.scheduleDate).getTime() : 0;
      const dateB = b.scheduleDate ? new Date(b.scheduleDate).getTime() : 0;
      return dateA - dateB;
    });

    return list;
  }, [customReminders, activeTab, searchQuery]);

  // Pagination for currently viewed list
  const activeListLength =
    activeTab === 'Custom Reminders'
      ? processedCustomReminders.length
      : processedAlerts.length;

  const totalPages = Math.max(1, Math.ceil(activeListLength / PAGE_SIZE));

  // Back to page 1 whenever the tab, search or sort changes (adjusted during render, not in an effect).
  const listKey = `${activeTab}|${searchQuery}|${selectedSort}`;
  const [pagedListKey, setPagedListKey] = useState(listKey);
  if (pagedListKey !== listKey) {
    setPagedListKey(listKey);
    setCurrentPage(1);
  }

  const paginatedAlerts = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return processedAlerts.slice(start, start + PAGE_SIZE);
  }, [processedAlerts, currentPage]);

  const paginatedCustomReminders = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return processedCustomReminders.slice(start, start + PAGE_SIZE);
  }, [processedCustomReminders, currentPage]);

  // Navigate to existing Loan Details page
  const handleViewLoan = (loanId) => {
    if (!loanId) return;
    navigate(`/loans/${loanId}`);
  };

  // Custom reminder actions
  const handleToggleComplete = async (id, currentStatus) => {
    const nextStatus = currentStatus === 'Completed' ? 'Scheduled' : 'Completed';
    try {
      await updateCustomReminder(id, { status: nextStatus });
      showToast(
        nextStatus === 'Completed'
          ? 'Reminder marked as completed.'
          : 'Reminder reopened.'
      );
    } catch (error) {
      showToast(error.message || 'Could not update the reminder.');
    }
  };

  const handleDeleteReminder = async (id) => {
    if (window.confirm('Are you sure you want to delete this reminder?')) {
      try {
        await deleteCustomReminder(id);
        showToast('Reminder deleted.');
      } catch (error) {
        showToast(error.message || 'Could not delete the reminder.');
      }
    }
  };

  return (
    <div className="flex-1 min-h-screen bg-white p-4 sm:p-6 lg:p-8 font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2.5 text-xs font-medium animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* =========================================================
          PAGE HEADER
      ========================================================= */}
      <div className="mb-5">

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="page-title">
              Reminders
            </h1>
          </div>

          {canAdd && (
            <button
              type="button"
              onClick={() => setIsDrawerOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-4.5 py-2.5 rounded-xl bg-[#006B52] hover:bg-[#005344] text-white text-sm font-semibold transition-all shadow-xs hover:shadow-sm shrink-0 cursor-pointer"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              <span>Create Reminder</span>
            </button>
          )}
        </div>
      </div>

      {loadError && (
        <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Could not load reminders: {loadError}
        </div>
      )}
      {loading && !loadError && (
        <p className="mb-5 text-sm text-slate-500">Loading reminders…</p>
      )}

      {/* =========================================================
          5 COMPACT KPI CARDS
      ========================================================= */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4 mb-7">
        {/* 1. Due Today */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-4 sm:p-4.5 shadow-xs flex flex-col justify-between hover:shadow-sm transition-shadow">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="h-8.5 w-8.5 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100/60">
              <Calendar className="h-4.5 w-4.5 stroke-[2.2]" />
            </div>
            <span className="text-xs font-semibold text-slate-600">
              Due Today
            </span>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {kpis.dueToday}
          </p>
        </div>

        {/* 2. Upcoming — 7 Days */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-4 sm:p-4.5 shadow-xs flex flex-col justify-between hover:shadow-sm transition-shadow">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="h-8.5 w-8.5 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100/60">
              <Clock className="h-4.5 w-4.5 stroke-[2.2]" />
            </div>
            <span className="text-xs font-semibold text-slate-600 truncate">
              Upcoming — 7 Days
            </span>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {kpis.upcoming7Days}
          </p>
        </div>

        {/* 3. Overdue */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-4 sm:p-4.5 shadow-xs flex flex-col justify-between hover:shadow-sm transition-shadow">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="h-8.5 w-8.5 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center shrink-0 border border-rose-100/60">
              <AlertCircle className="h-4.5 w-4.5 stroke-[2.2]" />
            </div>
            <span className="text-xs font-semibold text-slate-600">
              Overdue
            </span>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {kpis.overdue}
          </p>
        </div>

        {/* 4. Penalty Applied */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-4 sm:p-4.5 shadow-xs flex flex-col justify-between hover:shadow-sm transition-shadow">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="h-8.5 w-8.5 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100/60">
              <IndianRupee className="h-4.5 w-4.5 stroke-[2.2]" />
            </div>
            <span className="text-xs font-semibold text-slate-600">
              Penalty Applied
            </span>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {kpis.penaltyApplied}
          </p>
        </div>

        {/* 5. Total Pending Amount */}
        <div className="col-span-2 sm:col-span-1 bg-white rounded-xl border border-slate-200/90 p-4 sm:p-4.5 shadow-xs flex flex-col justify-between hover:shadow-sm transition-shadow">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="h-8.5 w-8.5 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100/60">
              <IndianRupee className="h-4.5 w-4.5 stroke-[2.2]" />
            </div>
            <span className="text-xs font-semibold text-slate-600 truncate">
              Total Pending Amount
            </span>
          </div>
          <p className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight whitespace-nowrap overflow-hidden text-ellipsis">
            {formatINR(kpis.totalPendingAmount)}
          </p>
        </div>
      </div>

      {/* =========================================================
          FILTER TABS
      ========================================================= */}
      <div className="mb-4 overflow-x-auto pb-1">
        <div className="flex items-center gap-1.5 min-w-max border-b border-slate-200/80">
          {TABS.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-3.5 py-2 text-xs sm:text-sm font-semibold transition-all relative cursor-pointer ${
                  isActive
                    ? 'text-emerald-800 font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>{tab}</span>
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#006B52] rounded-t-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* =========================================================
          SEARCH & SORT BAR
      ========================================================= */}
      <div className="mb-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search customer, loan ID, or mobile..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 bg-white border border-slate-200/90 rounded-xl text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 transition-all shadow-xs"
          />
        </div>

        {/* Sort Dropdown */}
        {activeTab !== 'Custom Reminders' && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
              className="w-full sm:w-auto inline-flex items-center justify-between gap-2.5 px-3.5 py-2 bg-white border border-slate-200/90 rounded-xl text-xs sm:text-sm font-medium text-slate-700 hover:border-slate-300 focus:outline-none shadow-xs cursor-pointer"
            >
              <div className="flex items-center gap-1.5 text-slate-500">
                <span className="text-slate-800 font-semibold">{selectedSort}</span>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </button>

            {isSortDropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-60 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1 overflow-hidden">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      setSelectedSort(opt);
                      setIsSortDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3.5 py-2 text-xs font-medium transition-colors ${
                      selectedSort === opt
                        ? 'bg-emerald-50 text-emerald-800 font-bold'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* =========================================================
          TABLE SECTION
      ========================================================= */}
      <div className="mb-2">
        <h2 className="text-base sm:text-lg font-bold text-slate-900 mb-3 tracking-tight">
          {activeTab === 'Custom Reminders'
            ? 'Custom Reminders'
            : 'Payment Alerts'}
        </h2>

        {/* PAYMENT ALERTS TABLE */}
        {activeTab !== 'Custom Reminders' && (
          <div className="bg-white rounded-xl border border-slate-200/90 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-slate-50/70 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3.5 pl-5 pr-3">Customer Name</th>
                    <th className="py-3.5 px-3">Loan ID</th>
                    <th className="py-3.5 px-3">Due Date</th>
                    <th className="py-3.5 px-3">Amount Due</th>
                    <th className="py-3.5 px-3">Overdue Days</th>
                    <th className="py-3.5 px-3">Penalty</th>
                    <th className="py-3.5 px-3">Alert Status</th>
                    <th className="py-3.5 pr-5 pl-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                  {paginatedAlerts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center">
                        <div className="max-w-xs mx-auto flex flex-col items-center">
                          <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                            <CheckCircle2 className="h-6 w-6" />
                          </div>
                          <p className="text-sm font-semibold text-slate-700">
                            No payment alerts found
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            {searchQuery
                              ? 'No records match your search criteria.'
                              : 'All payments in this category are up to date.'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedAlerts.map((item) => {
                      // Accent line color on the left of row:
                      // Red for overdue, Orange for penalty applied / medium priority, Green for due today/upcoming
                      const accentColorClass =
                        item.accentColor === 'red'
                          ? 'bg-rose-500'
                          : item.accentColor === 'orange'
                          ? 'bg-amber-500'
                          : 'bg-emerald-500';

                      return (
                        <tr
                          key={item.id}
                          className="hover:bg-slate-50/70 transition-colors group"
                        >
                          {/* Customer Name with vertical accent strip */}
                          <td className="py-3.5 pl-5 pr-3 font-semibold text-slate-900 relative">
                            <span
                              className={`absolute left-0 top-2 bottom-2 w-1 rounded-r-md ${accentColorClass}`}
                            />
                            <div className="flex flex-col">
                              <span>{item.customerName}</span>
                              {item.customerMobile && (
                                <span className="text-[11px] font-normal text-slate-400 sm:hidden">
                                  {item.customerMobile}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Loan ID */}
                          <td className="py-3.5 px-3 font-medium text-slate-600">
                            {item.loanId}
                          </td>

                          {/* Due Date */}
                          <td className="py-3.5 px-3 text-slate-700 font-medium">
                            {formatDueDate(item.dueDate)}
                          </td>

                          {/* Amount Due */}
                          <td className="py-3.5 px-3 font-bold text-slate-900">
                            {formatINR(item.amountDue)}
                          </td>

                          {/* Overdue Days */}
                          <td className="py-3.5 px-3">
                            {item.isOverdue ? (
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                  item.hasPenaltyApplied
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200/70'
                                    : 'bg-rose-50 text-rose-600 border border-rose-200/70'
                                }`}
                              >
                                {item.overdueDays} Days
                              </span>
                            ) : item.isDueToday ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/70">
                                Today
                              </span>
                            ) : (
                              <span className="text-slate-400 font-medium">—</span>
                            )}
                          </td>

                          {/* Penalty */}
                          <td className="py-3.5 px-3 font-semibold">
                            {item.penalty > 0 ? (
                              <span className="text-rose-600 font-bold">
                                {formatINR(item.penalty)}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-medium">₹0</span>
                            )}
                          </td>

                          {/* Alert Status */}
                          <td className="py-3.5 px-3">
                            {item.alertStatus === 'Overdue' ? (
                              <span className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-600 border border-rose-200/70">
                                Overdue
                              </span>
                            ) : item.alertStatus === 'Due Today' ? (
                              <span className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/70">
                                Due Today
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/70">
                                Upcoming
                              </span>
                            )}
                          </td>

                          {/* Actions: View Loan */}
                          <td className="py-3.5 pr-5 pl-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleViewLoan(item.loanId)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-600 text-emerald-700 hover:bg-emerald-50 text-xs font-semibold transition-colors cursor-pointer"
                            >
                              <span>View Loan</span>
                              <ArrowRight className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CUSTOM REMINDERS TABLE */}
        {activeTab === 'Custom Reminders' && (
          <div className="bg-white rounded-xl border border-slate-200/90 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-slate-50/70 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3.5 pl-5 pr-3">Title & Type</th>
                    <th className="py-3.5 px-3">Customer Name</th>
                    <th className="py-3.5 px-3">Loan ID</th>
                    <th className="py-3.5 px-3">Scheduled For</th>
                    <th className="py-3.5 px-3">Priority</th>
                    <th className="py-3.5 px-3">Status</th>
                    <th className="py-3.5 pr-5 pl-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                  {paginatedCustomReminders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center">
                        <div className="max-w-xs mx-auto flex flex-col items-center">
                          <div className="h-12 w-12 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mb-3">
                            <BellRing className="h-6 w-6" />
                          </div>
                          <p className="text-sm font-semibold text-slate-800">
                            No custom reminders scheduled
                          </p>
                          <p className="text-xs text-slate-400 mt-1 mb-4">
                            Schedule a follow-up reminder for any customer or loan.
                          </p>
                          {canAdd && (
                            <button
                              type="button"
                              onClick={() => setIsDrawerOpen(true)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#006B52] hover:bg-[#005344] text-white text-xs font-semibold transition-colors cursor-pointer"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              <span>Create Reminder</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedCustomReminders.map((rem) => {
                      const priorityColor =
                        rem.priority === 'High'
                          ? 'bg-rose-500'
                          : rem.priority === 'Medium'
                          ? 'bg-amber-500'
                          : 'bg-emerald-500';

                      return (
                        <tr
                          key={rem.id}
                          className="hover:bg-slate-50/70 transition-colors group"
                        >
                          {/* Title & Type */}
                          <td className="py-3.5 pl-5 pr-3 relative">
                            <span
                              className={`absolute left-0 top-2 bottom-2 w-1 rounded-r-md ${priorityColor}`}
                            />
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-900">
                                {rem.title}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                {rem.reminderType}
                              </span>
                            </div>
                          </td>

                          {/* Customer Name */}
                          <td className="py-3.5 px-3 font-medium text-slate-800">
                            <div>{rem.customerName}</div>
                            {rem.customerId && (
                              <div className="text-[11px] text-slate-400">
                                {rem.customerId}
                              </div>
                            )}
                          </td>

                          {/* Loan ID */}
                          <td className="py-3.5 px-3 font-medium text-slate-600">
                            {rem.loanId || <span className="text-slate-400">—</span>}
                          </td>

                          {/* Scheduled Date & Time */}
                          <td className="py-3.5 px-3 text-slate-700 font-medium">
                            <div>{formatDueDate(rem.scheduleDate)}</div>
                            <div className="text-[11px] text-slate-400">
                              {rem.scheduleTime || '10:00 AM'}
                            </div>
                          </td>

                          {/* Priority */}
                          <td className="py-3.5 px-3">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                rem.priority === 'High'
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200/60'
                                  : rem.priority === 'Medium'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200/60'
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                              }`}
                            >
                              {rem.priority}
                            </span>
                          </td>

                          {/* Status */}
                          <td className="py-3.5 px-3">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                rem.evaluatedStatus === 'Completed'
                                  ? 'bg-slate-100 text-slate-600 border border-slate-200'
                                  : rem.evaluatedStatus === 'Overdue'
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200/60'
                                  : rem.evaluatedStatus === 'Scheduled'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200/60'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200/60'
                              }`}
                            >
                              {rem.evaluatedStatus}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 pr-5 pl-3 text-right">
                            <div className="inline-flex items-center gap-1.5 justify-end">
                              {rem.loanId && (
                                <button
                                  type="button"
                                  onClick={() => handleViewLoan(rem.loanId)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-600 text-emerald-700 hover:bg-emerald-50 text-xs font-semibold transition-colors cursor-pointer"
                                  title="View Loan"
                                >
                                  <span>View Loan</span>
                                  <ArrowRight className="h-3 w-3" />
                                </button>
                              )}

                              {canEdit && (
                              <>
                              <button
                                type="button"
                                onClick={() =>
                                  handleToggleComplete(rem.id, rem.status)
                                }
                                className={`p-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                                  rem.status === 'Completed'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                    : 'border-slate-200 text-slate-500 hover:bg-slate-100'
                                }`}
                                title={
                                  rem.status === 'Completed'
                                    ? 'Reopen reminder'
                                    : 'Mark completed'
                                }
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteReminder(rem.id)}
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Delete reminder"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                              </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* =========================================================
          PAGINATION
      ========================================================= */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-3 pb-6 text-xs text-slate-500">
          <p>
            Showing{' '}
            <span className="font-semibold text-slate-700">
              {(currentPage - 1) * PAGE_SIZE + 1}
            </span>{' '}
            to{' '}
            <span className="font-semibold text-slate-700">
              {Math.min(currentPage * PAGE_SIZE, activeListLength)}
            </span>{' '}
            of{' '}
            <span className="font-semibold text-slate-700">
              {activeListLength}
            </span>{' '}
            records
          </p>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 font-medium">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* =========================================================
          CUSTOM REMINDER RIGHT-SIDE DRAWER
      ========================================================= */}
      <CreateReminderDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        rawCustomers={rawCustomers}
        onReminderCreated={(newRem) => {
          showToast(`Reminder "${newRem.title}" scheduled successfully.`);
          setCustomReminders(getCustomReminders());
        }}
      />
    </div>
  );
}
