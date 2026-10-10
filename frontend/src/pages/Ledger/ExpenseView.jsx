import React, { useState } from 'react';
import { Search, X, Receipt, Banknote, Users, CalendarCheck, ChevronLeft, ChevronRight } from 'lucide-react';

const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;

import { isDateInRange } from '../../utils/dateUtils';
import DateRangeFilter from '../../components/DateRangeFilter';

const ExpenseView = ({ data }) => {
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('This Month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [viewTransaction, setViewTransaction] = useState(null);

  // Loaded from the API by the Ledger page.
  const { expenseData, customers: customersList } = data;

  const filteredExpense = expenseData.filter(exp => {
    if (!isDateInRange(exp.date, dateFilter, customStart, customEnd)) return false;
    if (categoryFilter !== 'All' && exp.category !== categoryFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!exp.remarks?.toLowerCase().includes(q) && !exp.id.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  // KPIs
  const totalExpense = expenseData.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);

  const loanAmountTotal = customersList.reduce((sum, c) => sum + Number(c.loanAmount || 0), 0);

  const commissionExpenses = expenseData.filter(exp => exp.category?.toLowerCase().includes('commission'));
  const partyCommissionTotal = commissionExpenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0) + customersList.reduce((sum, c) => sum + Number(c.referredByCommission || 0), 0);

  const chitExpenses = expenseData.filter(exp => exp.category?.toLowerCase().includes('chit'));
  const chitPaidTotal = chitExpenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);

  const hasLoanData = customersList.length > 0 && loanAmountTotal > 0;
  const hasCommissionData = partyCommissionTotal > 0;
  const hasChitData = chitExpenses.length > 0;

  // Pagination
  const PAGE_SIZE = 5;
  const totalPages = Math.max(1, Math.ceil(filteredExpense.length / PAGE_SIZE));
  const paginatedExpenses = filteredExpense.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Chart Data Logic
  const categoryTotals = filteredExpense.reduce((acc, exp) => {
    const cat = exp.category || 'Other';
    acc[cat] = (acc[cat] || 0) + Number(exp.amount || 0);
    return acc;
  }, {});

  const totalFilteredExpense = Object.values(categoryTotals).reduce((a, b) => a + b, 0);

  const chartData = Object.entries(categoryTotals)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const COLORS = ['#39D6A3', '#006B52', '#F4C542', '#003C32', '#EF1111', '#145247', '#46D8AE', '#A8D5C8'];

  let currentPercent = 0;
  const conicStops = totalFilteredExpense > 0 ? chartData.map((d, i) => {
    const percent = (d.value / totalFilteredExpense) * 100;
    const start = currentPercent;
    currentPercent += percent;
    return `${COLORS[i % COLORS.length]} ${start}% ${currentPercent}%`;
  }).join(', ') : '';

  return (
    <div className="flex flex-col mt-6 space-y-6">

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 shrink-0 pb-2">
        {/* Total Expense */}
        <div className="flex flex-col justify-center rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm h-full">
          <div className="flex items-center sm:items-start gap-3 sm:gap-4">
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600">
              <Receipt className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] sm:text-[14px] font-semibold text-slate-500 whitespace-normal break-words leading-tight">Total Expense</p>
              <p className="mt-0.5 sm:mt-1 text-lg sm:text-xl lg:text-2xl font-bold tracking-tight text-red-600 whitespace-normal break-words">
                {totalExpense > 0 ? formatCurrency(totalExpense) : 'No data'}
              </p>
            </div>
          </div>
        </div>

        {/* Loan Amount */}
        <div className="flex flex-col justify-center rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm h-full">
          <div className="flex items-center sm:items-start gap-3 sm:gap-4">
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
              <Banknote className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] sm:text-[14px] font-semibold text-slate-500 whitespace-normal break-words leading-tight">Loan Amount</p>
              <p className="mt-0.5 sm:mt-1 text-lg sm:text-xl lg:text-2xl font-bold tracking-tight text-slate-900 whitespace-normal break-words">
                {hasLoanData ? formatCurrency(loanAmountTotal) : 'No data'}
              </p>
            </div>
          </div>
        </div>

        {/* Party Commission */}
        <div className="flex flex-col justify-center rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm h-full">
          <div className="flex items-center sm:items-start gap-3 sm:gap-4">
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
              <Users className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] sm:text-[14px] font-semibold text-slate-500 whitespace-normal break-words leading-tight">Party Commission</p>
              <p className="mt-0.5 sm:mt-1 text-lg sm:text-xl lg:text-2xl font-bold tracking-tight text-slate-900 whitespace-normal break-words">
                {hasCommissionData ? formatCurrency(partyCommissionTotal) : 'No data'}
              </p>
            </div>
          </div>
        </div>

        {/* Chit Paid */}
        <div className="flex flex-col justify-center rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 sm:p-5 shadow-sm h-full">
          <div className="flex items-center sm:items-start gap-3 sm:gap-4">
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-[#e5f0ef] text-[#006052]">
              <CalendarCheck className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] sm:text-[14px] font-semibold text-slate-500 whitespace-normal break-words leading-tight">Chit Paid</p>
              <p className="mt-0.5 sm:mt-1 text-lg sm:text-xl lg:text-2xl font-bold tracking-tight text-[#006052] whitespace-normal break-words">
                {hasChitData ? formatCurrency(chitPaidTotal) : 'No data'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* FILTER / SEARCH */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setCurrentPage(1); }} className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-[14px] font-medium text-slate-700 shadow-sm outline-none focus:border-[#39D6A3] focus:ring-1 focus:ring-[#39D6A3] transition-all">
          <option>All</option>
          <option>Rent</option>
          <option>Salary</option>
          <option>Electricity</option>
          <option>Fuel</option>
          <option>Maintenance</option>
          <option>Office Expense</option>
          <option>Travel</option>
          <option>Other</option>
        </select>
        <div className="relative w-full sm:w-[260px] sm:ml-auto">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input type="text" value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} placeholder="Search..." className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 text-[14px] text-slate-800 shadow-sm outline-none focus:border-[#39D6A3] focus:ring-1 focus:ring-[#39D6A3] transition-all placeholder:text-slate-400" />
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">

        {/* EXPENSE TRANSACTIONS TABLE CONTAINER */}
        <div className="lg:w-[60%] flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">


          <div className="overflow-x-auto bg-white scrollbar-thin">
            <table className="w-full text-left border-collapse table-fixed">
              <thead className="sticky top-0 z-10 bg-slate-50/90 backdrop-blur-sm border-b border-slate-200">
                <tr>
                  <th className="w-[25%] sm:w-[25%] px-2 sm:px-6 py-4 sm:py-5 text-[11px] sm:text-[12px] font-bold uppercase tracking-wider text-[#172033] whitespace-nowrap">Date</th>
                  <th className="w-[25%] sm:w-[25%] px-2 sm:px-6 py-4 sm:py-5 text-[11px] sm:text-[12px] font-bold uppercase tracking-wider text-[#172033]">Category</th>
                  <th className="w-[25%] sm:w-[25%] px-2 sm:px-6 py-4 sm:py-5 text-[11px] sm:text-[12px] font-bold uppercase tracking-wider text-[#172033]">Amount</th>
                  <th className="w-[25%] sm:w-[25%] px-2 sm:px-6 py-4 sm:py-5 text-[11px] sm:text-[12px] font-bold uppercase tracking-wider text-[#172033] text-left">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-14 text-center">
                      <p className="text-[15px] font-medium text-slate-800">No expenses recorded</p>
                      <p className="text-[14px] text-slate-500 mt-1">No expense transactions found for the selected filters.</p>
                    </td>
                  </tr>
                ) : paginatedExpenses.map(exp => (
                  <tr key={exp.id} className="group hover:bg-slate-50/80 transition-colors">
                    <td className="px-2 sm:px-6 py-4 sm:py-5 whitespace-nowrap text-[11px] sm:text-[14px] font-medium text-slate-600">
                      {new Date(exp.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </td>
                    <td className="px-2 sm:px-6 py-4 sm:py-5 whitespace-nowrap">
                      <span className="inline-flex items-center rounded-md bg-emerald-100 px-1.5 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-[13px] font-bold text-emerald-800 shadow-sm border border-emerald-200/50 truncate max-w-full">
                        {exp.category}
                      </span>
                    </td>
                    <td className="px-2 sm:px-6 py-4 sm:py-5 whitespace-nowrap text-[12px] sm:text-[15px] font-bold text-red-600">
                      {formatCurrency(exp.amount)}
                    </td>
                    <td className="px-2 sm:px-6 py-4 sm:py-5 whitespace-nowrap text-left">
                      <button onClick={() => setViewTransaction(exp)} className="inline-flex items-center justify-center rounded-lg bg-[#F4C542] px-2 sm:px-6 py-1.5 sm:py-2.5 text-[11px] sm:text-[14px] font-bold text-[#1F2937] shadow-sm transition-colors hover:bg-[#E5B532]">
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filteredExpense.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-100 bg-white px-6 py-4">
              <p className="text-[13px] font-medium text-slate-500">
                Showing <span className="font-bold text-slate-700">{(currentPage - 1) * PAGE_SIZE + 1}</span> to <span className="font-bold text-slate-700">{Math.min(currentPage * PAGE_SIZE, filteredExpense.length)}</span> of <span className="font-bold text-slate-700">{filteredExpense.length}</span> results
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="sr-only">Previous</span>
                </button>
                <div className="flex h-8 min-w-[32px] items-center justify-center rounded-lg bg-emerald-50 px-3 text-[13px] font-bold text-[#006B52]">
                  {currentPage}
                </div>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-4 w-4" />
                  <span className="sr-only">Next</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* EXPENSE OVERVIEW CHART */}
        <div className="lg:w-[40%] flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 shrink-0 bg-white">
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">Expense Overview</h2>
            <p className="text-[13px] text-slate-500 mt-1">Expense breakdown for the selected month</p>
          </div>

          <div className="p-5 bg-white flex flex-col items-center justify-center">
            {totalFilteredExpense === 0 ? (
              <div className="text-center py-10">
                <p className="text-[15px] font-medium text-slate-800">No expense data for this period</p>
              </div>
            ) : (
              <div className="flex flex-col md:flex-row items-center md:items-start justify-center md:justify-start w-full gap-6">
                {/* Donut Chart SVG Alternative using CSS */}
                <div className="relative w-[160px] h-[160px] rounded-full shrink-0 shadow-sm mx-auto md:mx-0" style={{ background: `conic-gradient(${conicStops})` }}>
                  <div className="absolute inset-[18px] rounded-full bg-white flex flex-col items-center justify-center shadow-inner">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Total</span>
                    <span className="text-[15px] font-extrabold tracking-tight text-red-600 leading-none">{formatCurrency(totalFilteredExpense)}</span>
                  </div>
                </div>

                {/* Chart Legend */}
                <div className="flex flex-col gap-3 w-full min-w-0">
                  {chartData.map((d, i) => {
                    const pct = ((d.value / totalFilteredExpense) * 100).toFixed(1);
                    return (
                      <div key={d.name} className="flex flex-wrap sm:flex-nowrap items-center justify-between w-full gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                          <p className="text-[13px] font-semibold text-[#374151] truncate">{d.name}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <p className="text-[13px] font-bold text-slate-700">{formatCurrency(d.value)}</p>
                          <p className="text-[11px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-md min-w-[42px] text-center">{pct}%</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* VIEW MODAL */}
      {viewTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-[480px] rounded-2xl bg-white shadow-2xl flex flex-col relative animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <h3 className="font-bold text-lg text-slate-900">Expense Details</h3>
              <button
                onClick={() => setViewTransaction(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-6 space-y-5">

              <div className="grid grid-cols-2 gap-y-5 gap-x-4">
                <div>
                  <p className="text-[12px] font-medium text-slate-500 mb-1">Expense ID</p>
                  <p className="text-[14px] font-bold text-slate-900">{viewTransaction.id}</p>
                </div>

                <div>
                  <p className="text-[12px] font-medium text-slate-500 mb-1">Date</p>
                  <p className="text-[14px] font-bold text-slate-900">
                    {new Date(viewTransaction.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                </div>

                <div className="col-span-2 border-t border-slate-100 pt-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[12px] font-medium text-slate-500 mb-2">Category</p>
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[12px] font-semibold text-slate-600">
                        {viewTransaction.category}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-[12px] font-medium text-slate-500 mb-1">Amount</p>
                      <p className="text-[22px] font-extrabold tracking-tight text-red-600 leading-none">
                        {formatCurrency(viewTransaction.amount)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="col-span-2 border-t border-slate-100 pt-5">
                  <p className="text-[12px] font-medium text-slate-500 mb-1">Payment Mode</p>
                  <p className="text-[14px] font-bold text-slate-900">{viewTransaction.mode || "—"}</p>
                </div>

                <div className="col-span-2 border-t border-slate-100 pt-5">
                  <p className="text-[12px] font-medium text-slate-500 mb-1">Description</p>
                  <p className="text-[14px] font-medium text-slate-700 bg-slate-50 rounded-lg p-3 border border-slate-100">
                    {viewTransaction.remarks || "—"}
                  </p>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpenseView;
