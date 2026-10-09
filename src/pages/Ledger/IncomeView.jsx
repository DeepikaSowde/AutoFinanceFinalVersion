import React, { useState } from 'react';
import { Search, ChevronRight, X, Wallet, ArrowDownCircle, ArrowUpCircle, Database, FileText, Banknote, Landmark } from 'lucide-react';

const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;

const SummaryCard = ({ icon: Icon, title, value, subtext, valueColor = "text-slate-900", iconColor, iconBg, extraClass = "bg-white border-slate-200 shadow-sm" }) => (
  <div className={`rounded-xl border p-5 transition-shadow ${extraClass}`}>
    <div className="flex items-center gap-4">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
        <Icon className={`h-6 w-6 ${iconColor}`} strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-slate-500">{title}</p>
        <p className={`mt-1 truncate text-2xl font-bold tracking-tight ${valueColor}`}>{value}</p>
        {subtext && <p className="text-[12px] font-medium text-slate-400 mt-1">{subtext}</p>}
      </div>
    </div>
  </div>
);

const IncomeView = () => {
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('This Month');
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

  const PAGE_SIZE = 5;
  const totalPages = Math.max(1, Math.ceil(filteredIncome.length / PAGE_SIZE));
  const paginatedIncome = filteredIncome.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const getTypeBadgeStyle = (type) => {
    switch(type) {
      case 'Collection': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Document Charge': return 'bg-amber-50 text-amber-700 border-amber-200';
      default: return 'bg-purple-50 text-purple-700 border-purple-200';
    }
  };
  
  const getTypeIcon = (type) => {
    switch(type) {
      case 'Collection': return Wallet;
      case 'Document Charge': return FileText;
      default: return Banknote;
    }
  };
  
  const getTypeIconBg = (type) => {
    switch(type) {
      case 'Collection': return 'bg-blue-100';
      case 'Document Charge': return 'bg-amber-100';
      default: return 'bg-purple-100';
    }
  };
  const getTypeIconColor = (type) => {
    switch(type) {
      case 'Collection': return 'text-blue-600';
      case 'Document Charge': return 'text-amber-600';
      default: return 'text-purple-600';
    }
  };



  return (
    <div className="flex flex-col mt-6 h-full overflow-hidden">
      
      {/* KPI GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 shrink-0 pb-2 overflow-x-auto">
        <SummaryCard 
          icon={Wallet} 
          title="Collection Credit" 
          value={formatCurrency(collectionCredit)}
          subtext="Customer Collections"
          valueColor="text-emerald-700"
          iconColor="text-emerald-600"
          iconBg="bg-emerald-100"
        />
        <SummaryCard 
          icon={Database} 
          title="Principal Recovered" 
          value={formatCurrency(principalRecovered)}
          subtext="From Collections"
          iconColor="text-blue-600"
          iconBg="bg-blue-100"
        />
        <SummaryCard 
          icon={ArrowDownCircle} 
          title="Interest" 
          value={formatCurrency(interestRecovered)}
          subtext="From Collections"
          valueColor="text-emerald-700"
          iconColor="text-emerald-600"
          iconBg="bg-emerald-100"
        />
        <SummaryCard 
          icon={FileText} 
          title="Document Charge" 
          value={formatCurrency(documentCharges)}
          subtext="Document Charges"
          iconColor="text-amber-600"
          iconBg="bg-amber-100"
        />
        <SummaryCard 
          icon={Landmark} 
          title="Total Income" 
          value={formatCurrency(totalIncome)}
          subtext="All Income"
          valueColor="text-[#006052]"
          iconColor="text-[#006052]"
          iconBg="bg-[#e5f0ef]"
          extraClass="bg-emerald-50/50 border-emerald-200 shadow-sm"
        />
      </div>

      {/* FILTERS */}
      <div className="mt-4 flex flex-col sm:flex-row gap-4 shrink-0">
        <select value={dateFilter} onChange={e => {setDateFilter(e.target.value); setCurrentPage(1);}} className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-medium text-slate-700 outline-none w-full sm:w-auto focus:border-[#006052] focus:ring-1 focus:ring-[#006052]">
          <option>Today</option>
          <option>This Week</option>
          <option>This Month</option>
          <option>Last Month</option>
          <option>Custom Range</option>
        </select>
        <select value={typeFilter} onChange={e => {setTypeFilter(e.target.value); setCurrentPage(1);}} className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-medium text-slate-700 outline-none w-full sm:w-auto focus:border-[#006052] focus:ring-1 focus:ring-[#006052]">
          <option>All</option>
          <option>Collection</option>
          <option>Document Charge</option>
          <option>Other Income</option>
          <option>Service Income</option>
          <option>Other</option>
        </select>
        <div className="relative w-full sm:w-[260px]">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input type="text" value={search} onChange={e => {setSearch(e.target.value); setCurrentPage(1);}} placeholder="Search Customer, ID, Remarks..." className="h-9 w-full rounded-full border border-slate-300 bg-white pl-9 pr-4 text-[13px] outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052] shadow-sm" />
        </div>
      </div>

      {/* TABLE SECTION */}
      <div className="mt-6 flex-1 flex flex-col min-h-0 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex-1 overflow-x-auto overflow-y-auto">
          <table className="w-full min-w-[950px] text-left border-collapse">
            <thead className="sticky top-0 bg-slate-50/90 backdrop-blur-sm z-10 shadow-[0_1px_0_0_#e2e8f0]">
              <tr>
                <th className="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-wider text-slate-500 w-[15%]">Date</th>
                <th className="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-wider text-slate-500 w-[45%]">Description</th>
                <th className="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-wider text-slate-500 w-[15%]">Amount</th>
                <th className="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-wider text-slate-500 w-[15%]">Type</th>
                <th className="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-wider text-slate-500 w-[10%]"></th>
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
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-[14px] text-slate-800">
                        {new Date(inc.date).toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: 'numeric'})}
                      </p>
                      <p className="text-[13px] text-slate-500 mt-0.5">{inc.type}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${getTypeIconBg(inc.type)}`}>
                          <Icon className={`h-4 w-4 ${getTypeIconColor(inc.type)}`} />
                        </div>
                        <div>
                          <p className="font-semibold text-[14px] text-slate-800">
                            {inc.type === 'Collection' ? `${inc.customerName} – EMI Collection` : (inc.type === 'Document Charge' ? `Document Charge – ${inc.customerName || 'Customer'}` : inc.remarks)}
                          </p>
                          <p className="text-[13px] text-slate-500 mt-0.5 line-clamp-1">
                            {inc.type === 'Collection' ? `${inc.customerId} · Loan ID: ${inc.loanId}` : (inc.remarks || 'Income recorded')}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="font-bold text-[14px] text-emerald-600">{formatCurrency(inc.displayAmount)}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider border ${getTypeBadgeStyle(inc.type)}`}>
                        {inc.type}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors opacity-0 group-hover:opacity-100">
                        <ChevronRight className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-white px-5 py-3 shrink-0">
          <span className="text-sm text-slate-500">
            {filteredIncome.length === 0 
              ? "Showing 0 results" 
              : `Showing ${(currentPage - 1) * PAGE_SIZE + 1} to ${Math.min(currentPage * PAGE_SIZE, filteredIncome.length)} of ${filteredIncome.length} results`}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-sm font-medium text-slate-700">Page {currentPage} of {totalPages}</span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
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
