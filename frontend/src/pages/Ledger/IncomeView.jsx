import React, { useState } from 'react';
import { Search, ChevronRight, ChevronLeft, X, Wallet, ArrowDownCircle, ArrowUpCircle, Database, FileText, Banknote, Landmark } from 'lucide-react';
import IncomeOverviewChart from './IncomeOverviewChart';

const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;

const SummaryCard = ({ icon: Icon, title, value, subtext, valueColor = "text-slate-900", iconColor, iconBg, extraClass = "bg-white border-slate-200 shadow-sm" }) => (
  <div className={`rounded-xl border p-4 sm:p-5 transition-shadow flex flex-col justify-center h-full ${extraClass}`}>
    <div className="flex items-center sm:items-start gap-3 sm:gap-4">
      <div className={`flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
        <Icon className={`h-5 w-5 sm:h-6 sm:w-6 ${iconColor}`} strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] sm:text-[14px] font-semibold text-slate-500 whitespace-normal break-words leading-tight">{title}</p>
        <p className={`mt-0.5 sm:mt-1 text-lg sm:text-xl lg:text-2xl font-bold tracking-tight whitespace-normal break-words ${valueColor}`}>{value}</p>
        {subtext && <p className="text-[11px] sm:text-[12px] font-medium text-slate-400 mt-1 whitespace-normal break-words leading-tight">{subtext}</p>}
      </div>
    </div>
  </div>
);

import { isDateInRange } from '../../utils/dateUtils';
import DateRangeFilter from '../../components/DateRangeFilter';

const IncomeView = () => {
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('This Month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [viewTransaction, setViewTransaction] = useState(null);

  const incomeData = JSON.parse(window.localStorage.getItem('motoLendIncome_data') || '[]');
  const payments = JSON.parse(window.localStorage.getItem('motoLendPaymentHistory') || '[]');
  const customers = JSON.parse(window.localStorage.getItem('motoLendCustomersList_data') || '[]');

  const allIncome = [
    ...incomeData.map(inc => ({
      ...inc,
      source: 'manual',
      displayDate: inc.date.slice(0, 10),
      displayAmount: Number(inc.amount),
    })),
    ...payments.map(p => {
      const cust = customers.find(c => c.customerId === p.customerId);
      const cName = cust?.customer?.name || cust?.name || 'Unknown Customer';
      return {
        id: p.id,
        date: p.date,
        displayDate: p.date.slice(0, 10),
        type: 'Collection',
        source: 'collection',
        amount: p.amount,
        displayAmount: Number(p.amount),
        principal: p.principal || 0,
        interest: p.interest || 0,
        mode: p.mode,
        customerId: p.customerId,
        customerName: cName,
        loanId: p.loanId,
        remarks: 'EMI Collection'
      };
    })
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  const filteredIncome = allIncome.filter(inc => {
    if (!isDateInRange(inc.date, dateFilter, customStart, customEnd)) return false;
    if (typeFilter !== 'All' && inc.type !== typeFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!inc.customerName?.toLowerCase().includes(q) && !inc.remarks?.toLowerCase().includes(q) && !inc.id?.toLowerCase().includes(q) && !inc.loanId?.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  const collectionCredit = filteredIncome.filter(i => i.source === 'collection').reduce((sum, i) => sum + i.displayAmount, 0);
  const principalRecovered = filteredIncome.filter(i => i.source === 'collection').reduce((sum, i) => sum + (i.principal || 0), 0);
  const interestRecovered = filteredIncome.filter(i => i.source === 'collection').reduce((sum, i) => sum + (i.interest || 0), 0);
  const documentCharges = filteredIncome.filter(i => i.type === 'Document Charge').reduce((sum, i) => sum + i.displayAmount, 0);
  const totalIncome = filteredIncome.reduce((sum, i) => sum + i.displayAmount, 0);

  const breakdownMap = filteredIncome.reduce((acc, inc) => {
    const type = inc.type || 'Other';
    acc[type] = (acc[type] || 0) + inc.displayAmount;
    return acc;
  }, {});

  const incomeBreakdownData = Object.keys(breakdownMap)
    .map(name => ({ name, value: breakdownMap[name] }))
    .sort((a, b) => b.value - a.value);

  const PAGE_SIZE = 5;
  const totalPages = Math.max(1, Math.ceil(filteredIncome.length / PAGE_SIZE));
  const paginatedIncome = filteredIncome.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const getTypeBadgeStyle = (type) => {
    switch (type) {
      case 'Collection': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Document Charge': return 'bg-amber-50 text-amber-700 border-amber-200';
      default: return 'bg-purple-50 text-purple-700 border-purple-200';
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'Collection': return Wallet;
      case 'Document Charge': return FileText;
      default: return Banknote;
    }
  };

  const getTypeIconBg = (type) => {
    switch (type) {
      case 'Collection': return 'bg-blue-100';
      case 'Document Charge': return 'bg-amber-100';
      default: return 'bg-purple-100';
    }
  };
  const getTypeIconColor = (type) => {
    switch (type) {
      case 'Collection': return 'text-blue-600';
      case 'Document Charge': return 'text-amber-600';
      default: return 'text-purple-600';
    }
  };



  return (
    <div className="flex flex-col mt-6 space-y-6">

      {/* KPI GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4 shrink-0 pb-2">
        <SummaryCard
          icon={Wallet}
          title="Collection Credit"
          value={formatCurrency(collectionCredit)}
          subtext="Customer Collections"
          valueColor="text-emerald-700"
          iconColor="text-emerald-600"
          iconBg="bg-emerald-100"
          extraClass="flex-1 min-w-[200px] bg-white border-slate-200 shadow-sm"
        />
        <SummaryCard
          icon={Database}
          title="Principal Recovered"
          value={formatCurrency(principalRecovered)}
          subtext="From Collections"
          iconColor="text-blue-600"
          iconBg="bg-blue-100"
          extraClass="flex-1 min-w-[200px] bg-white border-slate-200 shadow-sm"
        />
        <SummaryCard
          icon={ArrowDownCircle}
          title="Interest"
          value={formatCurrency(interestRecovered)}
          subtext="From Collections"
          valueColor="text-emerald-700"
          iconColor="text-emerald-600"
          iconBg="bg-emerald-100"
          extraClass="flex-1 min-w-[200px] bg-white border-slate-200 shadow-sm"
        />
        <SummaryCard
          icon={FileText}
          title="Document Charge"
          value={formatCurrency(documentCharges)}
          subtext="Document Charges"
          iconColor="text-amber-600"
          iconBg="bg-amber-100"
          extraClass="flex-1 min-w-[200px] bg-white border-slate-200 shadow-sm"
        />
        <SummaryCard
          icon={Landmark}
          title="Total Income"
          value={formatCurrency(totalIncome)}
          subtext="All Income"
          valueColor="text-[#006052]"
          iconColor="text-[#006052]"
          iconBg="bg-[#e5f0ef]"
          extraClass="flex-1 min-w-[200px] bg-emerald-50/50 border-emerald-200 shadow-sm"
        />
      </div>

      {/* FILTERS */}
      <div className="mt-4 flex flex-col sm:flex-row gap-4 shrink-0 flex-wrap">
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setCurrentPage(1); }} className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-medium text-slate-700 outline-none w-full sm:w-auto focus:border-[#006052] focus:ring-1 focus:ring-[#006052]">
          <option>All</option>
          <option>Collection</option>
          <option>Document Charge</option>
          <option>Other Income</option>
          <option>Service Income</option>
          <option>Other</option>
        </select>
        <div className="relative w-full sm:w-[260px]">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input type="text" value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} placeholder="Search Customer, ID, Remarks..." className="h-9 w-full rounded-full border border-slate-300 bg-white pl-9 pr-4 text-[13px] outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052] shadow-sm" />
        </div>
      </div>

      {/* TABLE SECTION */}
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:w-[60%] flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse table-fixed">
              <thead className="sticky top-0 bg-slate-50/90 backdrop-blur-sm z-10 shadow-[0_1px_0_0_#e2e8f0]">
                <tr>
                  <th className="px-2 sm:px-5 py-4 text-left text-[11px] sm:text-[13px] font-bold uppercase tracking-wider text-slate-500 w-[25%] sm:w-[20%]">Date</th>
                  <th className="px-2 sm:px-5 py-4 text-left text-[11px] sm:text-[13px] font-bold uppercase tracking-wider text-slate-500 w-[40%] sm:w-[35%]">Description</th>
                  <th className="px-2 sm:px-5 py-4 text-left text-[11px] sm:text-[13px] font-bold uppercase tracking-wider text-slate-500 w-[25%] sm:w-[20%]">Amount</th>
                  <th className="hidden sm:table-cell px-2 sm:px-5 py-4 text-left text-[11px] sm:text-[13px] font-bold uppercase tracking-wider text-slate-500 sm:w-[15%]">Type</th>
                  <th className="px-1 sm:px-5 py-4 text-left text-[11px] sm:text-[13px] font-bold uppercase tracking-wider text-slate-500 w-[10%] sm:w-[10%]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedIncome.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="h-40 text-center text-[15px] text-slate-500">
                      No income recorded
                      <p className="text-[13px] font-normal mt-1">No income transactions found for the selected filters.</p>
                    </td>
                  </tr>
                ) : paginatedIncome.map(inc => {
                  const Icon = getTypeIcon(inc.type);
                  return (
                    <tr key={inc.id} className="hover:bg-slate-50/50 transition-colors group cursor-pointer" onClick={() => setViewTransaction(inc)}>
                      <td className="px-2 sm:px-5 py-3.5 whitespace-nowrap">
                        <p className="font-semibold text-[12px] sm:text-[14px] text-slate-800">
                          {new Date(inc.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                        </p>
                        <p className="text-[11px] sm:text-[13px] text-slate-500 mt-0.5 sm:hidden">{inc.type}</p>
                      </td>
                      <td className="px-2 sm:px-5 py-3.5">
                        <div className="flex items-start gap-2 sm:gap-3">
                          <div className={`mt-0.5 hidden sm:flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${getTypeIconBg(inc.type)}`}>
                            <Icon className={`h-4 w-4 ${getTypeIconColor(inc.type)}`} />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-[12px] sm:text-[14px] text-slate-800 truncate">
                              {inc.type === 'Collection' ? `${inc.customerName} – EMI Collection` : (inc.type === 'Document Charge' ? `Document Charge – ${inc.customerName || 'Customer'}` : inc.remarks)}
                            </p>
                            <p className="text-[11px] sm:text-[13px] text-slate-500 mt-0.5 truncate">
                              {inc.type === 'Collection' ? `${inc.customerId} · Loan ID: ${inc.loanId}` : (inc.remarks || 'Income recorded')}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 sm:px-5 py-3.5 whitespace-nowrap">
                        <span className="font-bold text-[12px] sm:text-[14px] text-emerald-600">{formatCurrency(inc.displayAmount)}</span>
                      </td>
                      <td className="hidden sm:table-cell px-2 sm:px-5 py-3.5 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider whitespace-nowrap border ${getTypeBadgeStyle(inc.type)}`}>
                          {inc.type}
                        </span>
                      </td>
                      <td className="px-1 sm:px-5 py-3.5 text-right">
                        <button className="p-1 sm:p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors opacity-0 group-hover:opacity-100">
                          <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {filteredIncome.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-100 bg-white px-6 py-4">
              <p className="text-[13px] font-medium text-slate-500">
                Showing <span className="font-bold text-slate-700">{(currentPage - 1) * PAGE_SIZE + 1}</span> to <span className="font-bold text-slate-700">{Math.min(currentPage * PAGE_SIZE, filteredIncome.length)}</span> of <span className="font-bold text-slate-700">{filteredIncome.length}</span> results
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

        {/* INCOME OVERVIEW CHART */}
        <div className="lg:w-[40%] flex flex-col">
          <IncomeOverviewChart data={incomeBreakdownData} total={totalIncome} />
        </div>
      </div>

      {/* View Modal */}
      {viewTransaction && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-[400px] rounded-xl bg-white shadow-xl flex flex-col relative overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-lg text-slate-900">Income Details</h3>
              <button onClick={() => setViewTransaction(null)}><X className="h-5 w-5 text-slate-400 hover:text-slate-600" /></button>
            </div>

            <div className="p-6">
              {viewTransaction.type === 'Collection' ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                    <span className="text-[13px] font-medium text-slate-500">Customer</span>
                    <span className="text-[14px] font-bold text-slate-900">{viewTransaction.customerName}</span>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                    <span className="text-[13px] font-medium text-slate-500">Loan ID</span>
                    <span className="text-[14px] font-bold text-slate-900">{viewTransaction.loanId}</span>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                    <span className="text-[13px] font-medium text-slate-500">Collection Date</span>
                    <span className="text-[14px] font-bold text-slate-900">{new Date(viewTransaction.date).toLocaleDateString('en-GB')}</span>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                    <span className="text-[13px] font-medium text-slate-500">Amount Received</span>
                    <span className="text-[16px] font-black text-emerald-600">{formatCurrency(viewTransaction.amount)}</span>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                    <span className="text-[13px] font-medium text-slate-500">Principal Allocation</span>
                    <span className="text-[14px] font-bold text-slate-700">{formatCurrency(viewTransaction.principal)}</span>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                    <span className="text-[13px] font-medium text-slate-500">Interest Allocation</span>
                    <span className="text-[14px] font-bold text-slate-700">{formatCurrency(viewTransaction.interest)}</span>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                    <span className="text-[13px] font-medium text-slate-500">Payment Mode</span>
                    <span className="text-[14px] font-bold text-slate-900">{viewTransaction.mode}</span>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                    <span className="text-[13px] font-medium text-slate-500">Status</span>
                    <span className="text-[12px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded">Collected</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[13px] font-medium text-slate-500">Remarks</span>
                    <span className="text-[14px] font-bold text-slate-900">EMI Collection</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                    <span className="text-[13px] font-medium text-slate-500">Income ID</span>
                    <span className="text-[14px] font-bold text-slate-900">{viewTransaction.id}</span>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                    <span className="text-[13px] font-medium text-slate-500">Type</span>
                    <span className="text-[14px] font-bold text-slate-900">{viewTransaction.type}</span>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                    <span className="text-[13px] font-medium text-slate-500">Date</span>
                    <span className="text-[14px] font-bold text-slate-900">{new Date(viewTransaction.date).toLocaleDateString('en-GB')}</span>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                    <span className="text-[13px] font-medium text-slate-500">Amount</span>
                    <span className="text-[16px] font-black text-emerald-600">{formatCurrency(viewTransaction.amount)}</span>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                    <span className="text-[13px] font-medium text-slate-500">Payment Mode</span>
                    <span className="text-[14px] font-bold text-slate-900">{viewTransaction.mode}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[13px] font-medium text-slate-500">Remarks</span>
                    <span className="text-[14px] font-bold text-slate-900">{viewTransaction.remarks || 'None'}</span>
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button onClick={() => setViewTransaction(null)} className="px-4 py-2 text-[13px] font-bold text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IncomeView;
