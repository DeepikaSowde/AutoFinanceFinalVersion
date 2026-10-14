import React, { useState } from 'react';
import { Search, X, Receipt, Banknote, Users, CalendarCheck, ChevronLeft, ChevronRight, Landmark } from 'lucide-react';

const formatCurrency = (value) => `₹${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;

import { isDateInRange } from '../../utils/dateUtils';
import DateRangeFilter from '../../components/DateRangeFilter';

const ExpenseView = ({ onAddExpense }) => {
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('All Time');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [selectedInvestorId, setSelectedInvestorId] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [viewTransaction, setViewTransaction] = useState(null);

  const rawExpenseData = JSON.parse(window.localStorage.getItem('motoLendExpense_data') || '[]');
  const customersList = JSON.parse(window.localStorage.getItem('motoLendCustomersList_data') || '[]');
  const investors = JSON.parse(window.localStorage.getItem('motoLendInvestors_data') || '[]');

  // Ensure all investor withdrawals from investors data are represented in expenses without duplicate
  let needsSync = false;
  const expenseData = [...rawExpenseData];
  investors.forEach(inv => {
    inv.transactions?.forEach(tx => {
      if (tx.type === 'Debit') {
        const alreadyExists = expenseData.some(e =>
          (e.transactionId && e.transactionId === tx.id) ||
          (tx.expenseId && tx.expenseId === e.id) ||
          (e.category === 'Investor Withdrawal' && e.investorId === inv.id && Number(e.amount) === Number(tx.amount) && e.date === tx.date)
        );
        if (!alreadyExists) {
          expenseData.push({
            id: tx.expenseId || `EXP-INV-${tx.id}`,
            category: 'Investor Withdrawal',
            amount: Number(tx.amount || 0),
            date: tx.date || new Date().toISOString().slice(0, 10),
            mode: tx.paymentMode || 'Bank Transfer',
            remarks: tx.remarks ? `${tx.reason || 'Withdrawal'} - ${tx.remarks}` : (tx.reason || 'Investor Withdrawal'),
            investorId: inv.id,
            investorName: inv.name,
            transactionId: tx.id,
            isInvestorWithdrawal: true
          });
          needsSync = true;
        }
      }
    });
  });

  if (needsSync) {
    try {
      window.localStorage.setItem('motoLendExpense_data', JSON.stringify(expenseData));
    } catch (err) {
      console.error('Failed to sync expenses:', err);
    }
  }

  const filteredExpense = expenseData.filter(exp => {
    if (!isDateInRange(exp.date, dateFilter, customStart, customEnd)) return false;
    if (categoryFilter !== 'All' && exp.category !== categoryFilter) return false;
    if (selectedInvestorId !== 'All' && exp.investorId !== selectedInvestorId) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matches =
        exp.remarks?.toLowerCase().includes(q) ||
        exp.id?.toLowerCase().includes(q) ||
        exp.category?.toLowerCase().includes(q) ||
        exp.investorName?.toLowerCase().includes(q);
      if (!matches) {
        return false;
      }
    }
    return true;
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  // Separate regular business expenses from investor withdrawals
  const regularExpenses = expenseData.filter(exp => exp.category !== 'Investor Withdrawal');
  const regularExpenseTotal = regularExpenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);

  const investorWithdrawals = expenseData.filter(exp => exp.category === 'Investor Withdrawal');
  const investorWithdrawalTotal = investorWithdrawals.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);

  const loanAmountTotal = customersList.reduce((sum, c) => sum + Number(c.loanAmount || 0), 0);

  const commissionExpenses = expenseData.filter(exp => exp.category?.toLowerCase().includes('commission'));
  const unlinkedCustomerCommissions = customersList
    .filter(c => !commissionExpenses.some(e => (e.loanId && e.loanId === c.loanId) || (e.customerId && e.customerId === c.customerId)))
    .reduce((sum, c) => sum + Number(c.referredByCommission || 0), 0);
  const partyCommissionTotal = commissionExpenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0) + unlinkedCustomerCommissions;

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

  const getCategoryColor = (catName, index) => {
    if (catName === 'Investor Withdrawal') return '#8B5CF6';
    const palette = ['#39D6A3', '#006B52', '#F4C542', '#003C32', '#EF1111', '#145247', '#46D8AE', '#A8D5C8'];
    return palette[index % palette.length];
  };

  let currentPercent = 0;
  const conicStops = totalFilteredExpense > 0 ? chartData.map((d, i) => {
    const percent = (d.value / totalFilteredExpense) * 100;
    const start = currentPercent;
    currentPercent += percent;
    return `${getCategoryColor(d.name, i)} ${start}% ${currentPercent}%`;
  }).join(', ') : '';

  return (
    <div className="flex flex-col mt-6 space-y-6">

      {/* KPI CARDS */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 sm:gap-4 shrink-0 pb-2">
        {/* Business Operating Expenses */}
        <div className="flex flex-col justify-center rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm h-full">
          <div className="flex items-center sm:items-start gap-3 sm:gap-4">
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600">
              <Receipt className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] sm:text-[14px] font-semibold text-slate-500 whitespace-normal break-words leading-tight">Business Expenses</p>
              <p className="mt-0.5 sm:mt-1 text-lg sm:text-xl lg:text-2xl font-bold tracking-tight text-red-600 whitespace-normal break-words">
                {regularExpenseTotal > 0 ? formatCurrency(regularExpenseTotal) : 'No data'}
              </p>
              <span className="text-[11px] text-slate-400 font-medium">Operating Costs</span>
            </div>
          </div>
        </div>

        {/* Investor Withdrawals Card */}
        <div className="flex flex-col justify-center rounded-xl border border-purple-200 bg-purple-50/50 p-4 sm:p-5 shadow-sm h-full">
          <div className="flex items-center sm:items-start gap-3 sm:gap-4">
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
              <Landmark className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] sm:text-[14px] font-semibold text-purple-900 whitespace-normal break-words leading-tight">Investor Withdrawals</p>
              <p className="mt-0.5 sm:mt-1 text-lg sm:text-xl lg:text-2xl font-bold tracking-tight text-purple-700 whitespace-normal break-words">
                {investorWithdrawalTotal > 0 ? formatCurrency(investorWithdrawalTotal) : '₹0'}
              </p>
              <span className="text-[11px] text-purple-600/80 font-medium">Capital Outflow</span>
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
              <span className="text-[11px] text-slate-400 font-medium">Total Loans Disbursed</span>
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
              <span className="text-[11px] text-slate-400 font-medium">Referral Payouts</span>
            </div>
          </div>
        </div>

        {/* Chit Paid (if present) */}
        {hasChitData && (
          <div className="flex flex-col justify-center rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 sm:p-5 shadow-sm h-full">
            <div className="flex items-center sm:items-start gap-3 sm:gap-4">
              <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-[#e5f0ef] text-[#006052]">
                <CalendarCheck className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] sm:text-[14px] font-semibold text-slate-500 whitespace-normal break-words leading-tight">Chit Paid</p>
                <p className="mt-0.5 sm:mt-1 text-lg sm:text-xl lg:text-2xl font-bold tracking-tight text-[#006052] whitespace-normal break-words">
                  {formatCurrency(chitPaidTotal)}
                </p>
                <span className="text-[11px] text-[#006052]/80 font-medium">Chit Fund Payments</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* FILTER / SEARCH */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap w-full sm:w-auto">
          <DateRangeFilter
            dateFilter={dateFilter}
            setDateFilter={(val) => { setDateFilter(val); setCurrentPage(1); }}
            customStart={customStart}
            setCustomStart={setCustomStart}
            customEnd={customEnd}
            setCustomEnd={setCustomEnd}
          />

          <select
            value={categoryFilter}
            onChange={e => { 
              setCategoryFilter(e.target.value); 
              if (e.target.value !== 'Investor Withdrawal') {
                setSelectedInvestorId('All');
              }
              setCurrentPage(1); 
            }}
            className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-semibold text-slate-700 shadow-sm outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052] transition-all"
          >
            <option value="All">All Categories</option>
            <option value="Vehicle Expense">Vehicle Expense</option>
            <option value="Referral Commission">Referral Commission</option>
            <option value="Investor Withdrawal">Investor Withdrawal</option>
            <option value="Rent">Rent</option>
            <option value="Salary">Salary</option>
            <option value="Electricity">Electricity</option>
            <option value="Fuel">Fuel</option>
            <option value="Maintenance">Maintenance</option>
            <option value="Office Expense">Office Expense</option>
            <option value="Travel">Travel</option>
            <option value="Other">Other</option>
          </select>

          {categoryFilter === 'Investor Withdrawal' && (
            <select
              value={selectedInvestorId}
              onChange={e => { setSelectedInvestorId(e.target.value); setCurrentPage(1); }}
              className="h-9 rounded-lg border border-purple-300 bg-purple-50/50 px-3 text-[13px] font-semibold text-purple-900 shadow-sm outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600 transition-all"
            >
              <option value="All">All Investors</option>
              {investors.map(inv => (
                <option key={inv.id} value={inv.id}>{inv.name}</option>
              ))}
            </select>
          )}
        </div>

        <div className="relative w-full sm:w-[260px]">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
            placeholder="Search category, investor, remarks..."
            className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 text-[13px] text-slate-800 shadow-sm outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052] transition-all placeholder:text-slate-400"
          />
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">

        {/* EXPENSE TRANSACTIONS TABLE CONTAINER */}
        <div className="lg:w-[60%] flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto bg-white scrollbar-thin">
            <table className="w-full text-left border-collapse table-fixed">
              <thead className="sticky top-0 z-10 bg-slate-50/90 backdrop-blur-sm border-b border-slate-200">
                <tr>
                  <th className="w-[25%] px-3 sm:px-6 py-4 text-[11px] sm:text-[12px] font-bold uppercase tracking-wider text-[#172033] whitespace-nowrap">Date</th>
                  <th className="w-[30%] px-3 sm:px-6 py-4 text-[11px] sm:text-[12px] font-bold uppercase tracking-wider text-[#172033]">Category / Details</th>
                  <th className="w-[25%] px-3 sm:px-6 py-4 text-[11px] sm:text-[12px] font-bold uppercase tracking-wider text-[#172033]">Amount</th>
                  <th className="w-[20%] px-3 sm:px-6 py-4 text-[11px] sm:text-[12px] font-bold uppercase tracking-wider text-[#172033] text-left">Action</th>
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
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-[12px] sm:text-[14px] font-medium text-slate-600">
                      {new Date(exp.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </td>
                    <td className="px-3 sm:px-6 py-4">
                      <div className="flex flex-col">
                        <span className={`inline-flex items-center w-fit rounded-md px-2 py-0.5 text-[11px] sm:text-[12px] font-bold shadow-sm border truncate max-w-full ${
                          exp.category === 'Investor Withdrawal'
                            ? 'bg-purple-100 text-purple-800 border-purple-200'
                            : exp.category === 'Referral Commission'
                            ? 'bg-blue-100 text-[#0F1E36] border-blue-200'
                            : exp.category === 'Vehicle Expense'
                            ? 'bg-amber-100 text-amber-900 border-amber-200'
                            : 'bg-emerald-100 text-emerald-800 border-emerald-200/50'
                        }`}>
                          {exp.category}
                        </span>
                        {exp.investorName ? (
                          <span className="text-[11px] font-semibold text-slate-600 mt-1 truncate">
                            {exp.investorName}
                          </span>
                        ) : exp.referrerName ? (
                          <span className="text-[11px] font-semibold text-[#006052] mt-0.5 truncate max-w-[200px]">
                            Ref: {exp.referrerName} {exp.loanId && exp.loanId !== '—' ? `(${exp.loanId})` : ''}
                          </span>
                        ) : (exp.regNo || exp.vehicleRegNo) ? (
                          <span className="text-[11px] font-semibold text-amber-800 mt-0.5 truncate max-w-[200px]">
                            Veh: {exp.regNo || exp.vehicleRegNo} {exp.customerName && exp.customerName !== '—' ? `(${exp.customerName})` : ''}
                          </span>
                        ) : exp.remarks ? (
                          <span className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[180px]">
                            {exp.remarks}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-[13px] sm:text-[15px] font-bold text-red-600">
                      {formatCurrency(exp.amount)}
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-left">
                      <button onClick={() => setViewTransaction(exp)} className="inline-flex items-center justify-center rounded-lg bg-[#F4C542] px-3 sm:px-5 py-1.5 text-[12px] sm:text-[13px] font-bold text-[#1F2937] shadow-sm transition-colors hover:bg-[#E5B532]">
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
            <p className="text-[13px] text-slate-500 mt-1">Expense breakdown for the selected period</p>
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
                <div className="flex flex-col gap-2.5 w-full min-w-0">
                  {chartData.map((d, i) => {
                    const pct = ((d.value / totalFilteredExpense) * 100).toFixed(1);
                    return (
                      <div key={d.name} className="flex flex-wrap sm:flex-nowrap items-center justify-between w-full gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getCategoryColor(d.name, i) }}></div>
                          <p className="text-[13px] font-semibold text-[#374151] truncate">{d.name}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <p className="text-[13px] font-bold text-slate-700">{formatCurrency(d.value)}</p>
                          <p className="text-[11px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-md min-w-[42px] text-center">{pct}%</p>
                        </div>
                      </div>
                    );
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
              <div>
                <h3 className="font-bold text-lg text-slate-900">Expense Details</h3>
                <p className="text-[12px] text-slate-500">{viewTransaction.category}</p>
              </div>
              <button
                onClick={() => setViewTransaction(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-6 space-y-5">
              {/* Special Investor Highlight if Investor Withdrawal */}
              {(viewTransaction.category === 'Investor Withdrawal' || viewTransaction.investorName) && (
                <div className="rounded-xl bg-purple-50 p-4 border border-purple-200">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700">Investor Withdrawal</span>
                    <span className="text-[11px] font-semibold text-purple-600 bg-purple-100 px-2.5 py-0.5 rounded-full">Capital Outflow</span>
                  </div>
                  <p className="text-[12px] text-slate-600 mt-1">Classified as investor capital withdrawal, tracked separately from regular operating expenses.</p>
                  <div className="mt-3 pt-3 border-t border-purple-200/60 flex items-center justify-between">
                    <span className="text-[12px] font-medium text-slate-500">Investor Name</span>
                    <span className="text-[14px] font-bold text-slate-900">{viewTransaction.investorName || "—"}</span>
                  </div>
                  {viewTransaction.investorId && (
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-[12px] font-medium text-slate-500">Investor ID</span>
                      <span className="text-[13px] font-semibold text-slate-700">{viewTransaction.investorId}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Special Referral Commission Highlight */}
              {(viewTransaction.category === 'Referral Commission' || viewTransaction.referrerName) && (
                <div className="rounded-xl bg-blue-50/80 p-4 border border-blue-200">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#0F1E36]">Referral Commission Expense</span>
                    <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full">Referral Payout</span>
                  </div>
                  <div className="mt-3 pt-3 border-t border-blue-200/60 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-medium text-slate-500">Referrer</span>
                      <span className="text-[13px] font-bold text-slate-900">{viewTransaction.referrerName || "—"}</span>
                    </div>
                    {viewTransaction.customerName && (
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-medium text-slate-500">Customer</span>
                        <span className="text-[13px] font-semibold text-slate-700">
                          {viewTransaction.customerName} {viewTransaction.customerId && viewTransaction.customerId !== '—' ? `(${viewTransaction.customerId})` : ''}
                        </span>
                      </div>
                    )}
                    {viewTransaction.loanId && viewTransaction.loanId !== '—' && (
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-medium text-slate-500">Loan ID</span>
                        <span className="text-[13px] font-mono font-bold text-[#006052]">{viewTransaction.loanId}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {(viewTransaction.category === 'Vehicle Expense' || viewTransaction.isVehicleExpense) && (
                <div className="rounded-xl bg-amber-50/80 p-4 border border-amber-200">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-950">Vehicle Expense Details</span>
                    <span className="text-[11px] font-semibold text-amber-900 bg-amber-100 px-2.5 py-0.5 rounded-full">Sale Liquidation</span>
                  </div>
                  <div className="mt-3 pt-3 border-t border-amber-200/60 space-y-1.5 text-xs">
                    {(viewTransaction.regNo || viewTransaction.vehicleRegNo) && (
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-500">Vehicle Reg No</span>
                        <span className="font-bold text-slate-900">{viewTransaction.regNo || viewTransaction.vehicleRegNo}</span>
                      </div>
                    )}
                    {viewTransaction.customerName && viewTransaction.customerName !== '—' && (
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-500">Linked Customer</span>
                        <span className="font-semibold text-slate-700">{viewTransaction.customerName}</span>
                      </div>
                    )}
                    {viewTransaction.loanId && viewTransaction.loanId !== '—' && (
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-500">Loan ID</span>
                        <span className="font-mono font-bold text-[#006052]">{viewTransaction.loanId}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

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
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold ${
                        viewTransaction.category === 'Investor Withdrawal'
                          ? 'bg-purple-100 text-purple-800 border border-purple-200'
                          : viewTransaction.category === 'Referral Commission'
                          ? 'bg-blue-100 text-[#0F1E36] border border-blue-200'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
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
                  <p className="text-[12px] font-medium text-slate-500 mb-1">Description / Remarks</p>
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

