import React, { useState } from 'react';
import { Search, ChevronRight, ChevronLeft, X, Wallet, ArrowDownCircle, ArrowUpCircle, Database, FileText, Banknote, Landmark, PiggyBank, Briefcase } from 'lucide-react';
import IncomeOverviewChart from './IncomeOverviewChart';

const formatCurrency = (value) => `₹${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;

const SummaryCard = ({ icon: Icon, title, value, subtext, valueColor = "text-slate-900", iconColor, iconBg, extraClass = "bg-white border-slate-200 shadow-sm" }) => (
  <div className={`rounded-xl border p-4 sm:p-5 transition-shadow flex flex-col justify-center h-full min-w-0 w-full ${extraClass}`}>
    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
      <div className={`flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
        <Icon className={`h-5 w-5 sm:h-6 sm:w-6 ${iconColor}`} strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] sm:text-[14px] font-semibold text-slate-500 leading-snug break-words">{title}</p>
        <p 
          className={`mt-0.5 sm:mt-1 text-base sm:text-lg lg:text-xl font-bold tracking-tight whitespace-nowrap leading-tight ${valueColor}`}
        >
          {value}
        </p>
        {subtext && <p className="text-[11px] sm:text-[12px] font-medium text-slate-400 mt-0.5 leading-snug break-words">{subtext}</p>}
      </div>
    </div>
  </div>
);

import { isDateInRange } from '../../utils/dateUtils';
import DateRangeFilter from '../../components/DateRangeFilter';

const IncomeView = ({ data }) => {
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('All Time');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [entityFilter, setEntityFilter] = useState('All'); // 'All' | 'Customer' | 'Investor'
  const [selectedCustomerId, setSelectedCustomerId] = useState('All');
  const [selectedInvestorId, setSelectedInvestorId] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [viewTransaction, setViewTransaction] = useState(null);

  // Loaded from the API by the Ledger page.
  const { incomeData: rawIncomeData, payments, customers, investors } = data;

  // 1. Manual Income Records
  const manualIncomeList = rawIncomeData.map(inc => ({
    ...inc,
    source: inc.isCapital || inc.type === 'Investment' ? 'investor' : 'manual',
    displayDate: (inc.date || '').slice(0, 10),
    displayAmount: Number(inc.amount || 0),
    isCapital: inc.isCapital || inc.type === 'Chit Investment' || inc.type === 'Investment',
  }));

  // 2. Collection Payments with Principal & Interest
  const collectionList = payments.map(p => {
    const cust = customers.find(c => c.customerId === p.customerId || c.loanId === p.loanId);
    const cName = cust?.customer?.name || cust?.name || 'Unknown Customer';
    const rawAmt = Number(p.amount || 0);

    const hasStoredBreakdown = (p.principal !== undefined && p.principal !== null) || (p.interest !== undefined && p.interest !== null);
    const principal = hasStoredBreakdown ? Number(p.principal || 0) : null;
    const interest = hasStoredBreakdown ? Number(p.interest || 0) : null;

    return {
      id: p.id,
      date: p.date,
      displayDate: (p.date || '').slice(0, 10),
      type: 'Collection',
      source: 'collection',
      amount: rawAmt,
      displayAmount: rawAmt,
      principal,
      interest,
      hasBreakdown: hasStoredBreakdown,
      mode: p.mode || 'Cash',
      customerId: p.customerId,
      customerName: cName,
      loanId: p.loanId,
      installmentRef: p.installmentNumber ? `Installment #${p.installmentNumber}` : (p.remarks || 'EMI Collection'),
      frequency: cust?.loan?.paymentFrequency || cust?.paymentFrequency || '',
      remarks: p.remarks || 'EMI Collection'
    };
  });

  // 3. Eligible Investor Capital Transactions (New Investment, Re-Investment, Opening Balance)
  const investmentList = [];
  investors.forEach(inv => {
    if (inv.transactions && Array.isArray(inv.transactions)) {
      inv.transactions.forEach(tx => {
        if (tx.type === 'New Investment' || tx.type === 'Re-Investment' || tx.type === 'Opening Balance') {
          // Avoid duplicate if already tracked in rawIncomeData with matching ID
          const alreadyInIncome = rawIncomeData.some(inc => 
            (inc.transactionId && inc.transactionId === tx.id) ||
            (tx.incomeId && tx.incomeId === inc.id)
          );
          if (!alreadyInIncome) {
            const txAmount = Number(tx.amount || 0);
            investmentList.push({
              id: tx.id || `INV-${inv.id}-${tx.date}`,
              date: tx.date || new Date().toISOString(),
              displayDate: (tx.date || '').slice(0, 10),
              type: 'Investment',
              source: 'investor',
              subType: tx.type,
              amount: txAmount,
              displayAmount: txAmount,
              investorId: inv.id,
              investorName: inv.name,
              mode: tx.transferMode || tx.paymentMode || 'Bank Transfer',
              remarks: tx.type === 'Opening Balance' ? 'Opening Balance Capital' : `${tx.type} received from ${inv.name}`,
              isCapital: true
            });
          }
        }
      });
    }
  });

  // Combine and sort chronologically (newest first)
  const allIncome = [
    ...manualIncomeList,
    ...collectionList,
    ...investmentList
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  const filteredIncome = allIncome.filter(inc => {
    if (!isDateInRange(inc.date, dateFilter, customStart, customEnd)) return false;
    if (typeFilter !== 'All' && inc.type !== typeFilter) return false;

    // Entity Filter: Customer / Investor
    if (entityFilter === 'Customer') {
      if (inc.source !== 'collection' && !inc.customerId) return false;
      if (selectedCustomerId !== 'All' && inc.customerId !== selectedCustomerId) return false;
    } else if (entityFilter === 'Investor') {
      if (inc.source !== 'investor' && inc.type !== 'Investment' && !inc.investorId) return false;
      if (selectedInvestorId !== 'All' && inc.investorId !== selectedInvestorId) return false;
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      const matchesSearch =
        inc.customerName?.toLowerCase().includes(q) ||
        inc.investorName?.toLowerCase().includes(q) ||
        inc.remarks?.toLowerCase().includes(q) ||
        inc.id?.toLowerCase().includes(q) ||
        inc.loanId?.toLowerCase().includes(q) ||
        inc.type?.toLowerCase().includes(q);
      if (!matchesSearch) return false;
    }
    return true;
  });

  // KPI Calculations
  const collectionCredit = filteredIncome
    .filter(i => i.source === 'collection')
    .reduce((sum, i) => sum + i.displayAmount, 0);

  const principalRecovered = filteredIncome
    .filter(i => i.source === 'collection' && i.principal !== null)
    .reduce((sum, i) => sum + (i.principal || 0), 0);

  const interestEarned = filteredIncome
    .filter(i => i.source === 'collection' && i.interest !== null)
    .reduce((sum, i) => sum + (i.interest || 0), 0);

  const totalInvestmentCapital = filteredIncome
    .filter(i => i.source === 'investor' || i.type === 'Investment')
    .reduce((sum, i) => sum + i.displayAmount, 0);

  const chitInvestmentTotal = filteredIncome
    .filter(i => i.type === 'Chit Investment')
    .reduce((sum, i) => sum + i.displayAmount, 0);

  const totalInflow = filteredIncome.reduce((sum, i) => sum + i.displayAmount, 0);

  // Income Breakdown Chart Data: shows distinct sources without combining capital with interest
  const breakdownMap = filteredIncome.reduce((acc, inc) => {
    let key = inc.type || 'Other';
    if (inc.type === 'Investment') {
      key = 'Investor Capital';
    }
    acc[key] = (acc[key] || 0) + inc.displayAmount;
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
      case 'Investment': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Chit Investment': return 'bg-teal-50 text-teal-700 border-teal-200';
      case 'Document Charge': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Service Income': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Commission': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      default: return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'Collection': return Wallet;
      case 'Investment': return Landmark;
      case 'Chit Investment': return PiggyBank;
      case 'Document Charge': return FileText;
      default: return Banknote;
    }
  };

  const getTypeIconBg = (type) => {
    switch (type) {
      case 'Collection': return 'bg-blue-100';
      case 'Investment': return 'bg-purple-100';
      case 'Chit Investment': return 'bg-teal-100';
      case 'Document Charge': return 'bg-amber-100';
      default: return 'bg-emerald-100';
    }
  };

  const getTypeIconColor = (type) => {
    switch (type) {
      case 'Collection': return 'text-blue-600';
      case 'Investment': return 'text-purple-600';
      case 'Chit Investment': return 'text-teal-600';
      case 'Document Charge': return 'text-amber-600';
      default: return 'text-emerald-600';
    }
  };



  return (
    <div className="flex flex-col mt-6 space-y-6">

      {/* KPI GRID */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 sm:gap-4 shrink-0 pb-2">
        <SummaryCard
          icon={Wallet}
          title="Collection Credit"
          value={formatCurrency(collectionCredit)}
          subtext="Customer Collections"
          valueColor="text-emerald-700"
          iconColor="text-emerald-600"
          iconBg="bg-emerald-100"
          extraClass="bg-white border-slate-200 shadow-sm"
        />
        <SummaryCard
          icon={Database}
          title="Principal Recovered"
          value={formatCurrency(principalRecovered)}
          subtext="From Collections"
          iconColor="text-blue-600"
          iconBg="bg-blue-100"
          extraClass="bg-white border-slate-200 shadow-sm"
        />
        <SummaryCard
          icon={ArrowDownCircle}
          title="Interest Earned"
          value={formatCurrency(interestEarned)}
          subtext="From Collections"
          valueColor="text-emerald-700"
          iconColor="text-emerald-600"
          iconBg="bg-emerald-100"
          extraClass="bg-white border-slate-200 shadow-sm"
        />
        <SummaryCard
          icon={Landmark}
          title="Investor Capital"
          value={formatCurrency(totalInvestmentCapital)}
          subtext="Deposits & Re-investments"
          iconColor="text-purple-600"
          iconBg="bg-purple-100"
          extraClass="bg-white border-slate-200 shadow-sm"
        />
        {chitInvestmentTotal > 0 && (
          <SummaryCard
            icon={PiggyBank}
            title="Chit Investment"
            value={formatCurrency(chitInvestmentTotal)}
            subtext="Chit Fund Capital"
            iconColor="text-teal-600"
            iconBg="bg-teal-100"
            extraClass="bg-white border-slate-200 shadow-sm"
          />
        )}
        <SummaryCard
          icon={ArrowUpCircle}
          title="Total Inflow"
          value={formatCurrency(totalInflow)}
          subtext="All Collections & Inflow"
          valueColor="text-[#006052]"
          iconColor="text-[#006052]"
          iconBg="bg-[#e5f0ef]"
          extraClass="bg-emerald-50/50 border-emerald-200 shadow-sm"
        />
      </div>

      {/* FILTERS */}
      <div className="mt-4 flex flex-col md:flex-row gap-3 shrink-0 flex-wrap items-start md:items-center justify-between">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Date Filter (Monthly, Today, All Time, Custom, etc.) */}
          <DateRangeFilter
            dateFilter={dateFilter}
            setDateFilter={(val) => { setDateFilter(val); setCurrentPage(1); }}
            customStart={customStart}
            setCustomStart={setCustomStart}
            customEnd={customEnd}
            setCustomEnd={setCustomEnd}
          />

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={e => { setTypeFilter(e.target.value); setCurrentPage(1); }}
            className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-semibold text-slate-700 outline-none hover:border-[#006052] focus:border-[#006052] focus:ring-1 focus:ring-[#006052] shadow-sm"
          >
            <option value="All">All Types</option>
            <option value="Investment">Investor Capital</option>
            <option value="Collection">EMI Collection</option>
            <option value="Chit Investment">Chit Investment</option>
            <option value="Document Charge">Document Charge</option>
            <option value="Service Income">Service Income</option>
            <option value="Other Income">Other Income</option>
            <option value="Commission">Commission</option>
            <option value="Other">Other</option>
          </select>

          {/* Entity Filter (All, Customer, Investor) */}
          <select
            value={entityFilter}
            onChange={e => {
              setEntityFilter(e.target.value);
              setSelectedCustomerId('All');
              setSelectedInvestorId('All');
              setCurrentPage(1);
            }}
            className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-semibold text-slate-700 outline-none hover:border-[#006052] focus:border-[#006052] focus:ring-1 focus:ring-[#006052] shadow-sm"
          >
            <option value="All">All Parties</option>
            <option value="Customer">Customer Collections</option>
            <option value="Investor">Investor Capital</option>
          </select>

          {/* Conditional Customer Dropdown */}
          {entityFilter === 'Customer' && (
            <select
              value={selectedCustomerId}
              onChange={e => { setSelectedCustomerId(e.target.value); setCurrentPage(1); }}
              className="h-9 rounded-lg border border-blue-300 bg-blue-50/50 px-3 text-[13px] font-semibold text-blue-900 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 shadow-sm max-w-[200px]"
            >
              <option value="All">All Customers</option>
              {customers.map(c => (
                <option key={c.customerId || c.loanId} value={c.customerId}>
                  {c.customer?.name || c.name || c.customerId}
                </option>
              ))}
            </select>
          )}

          {/* Conditional Investor Dropdown */}
          {entityFilter === 'Investor' && (
            <select
              value={selectedInvestorId}
              onChange={e => { setSelectedInvestorId(e.target.value); setCurrentPage(1); }}
              className="h-9 rounded-lg border border-purple-300 bg-purple-50/50 px-3 text-[13px] font-semibold text-purple-900 outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600 shadow-sm max-w-[200px]"
            >
              <option value="All">All Investors</option>
              {investors.map(inv => (
                <option key={inv.id} value={inv.id}>
                  {inv.name} ({inv.id})
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="relative w-full md:w-[260px]">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
            placeholder="Search Customer, Investor, ID, Remarks..."
            className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-4 text-[13px] outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052] shadow-sm placeholder:text-slate-400"
          />
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
                              {inc.type === 'Collection'
                                ? `${inc.customerName} – EMI Collection`
                                : inc.type === 'Investment'
                                ? `${inc.investorName} – ${inc.subType || 'Capital Deposit'}`
                                : inc.type === 'Chit Investment'
                                ? `Chit Investment – ${inc.remarks || 'Investment Deposit'}`
                                : inc.type === 'Document Charge'
                                ? `Document Charge – ${inc.customerName || 'Customer'}`
                                : inc.remarks || inc.type}
                            </p>
                            <p className="text-[11px] sm:text-[13px] text-slate-500 mt-0.5 truncate">
                              {inc.type === 'Collection'
                                ? `${inc.customerId} · Loan ID: ${inc.loanId}`
                                : inc.type === 'Investment'
                                ? `Investor ID: ${inc.investorId} · Capital`
                                : inc.remarks || 'Income recorded'}
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
          <IncomeOverviewChart data={incomeBreakdownData} total={totalInflow} />
        </div>
      </div>

      {/* View Modal */}
      {viewTransaction && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-[460px] rounded-2xl bg-white shadow-2xl flex flex-col relative overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50/80">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-lg ${getTypeIconBg(viewTransaction.type)}`}>
                  {(() => {
                    const Icon = getTypeIcon(viewTransaction.type);
                    return <Icon className={`h-4 w-4 ${getTypeIconColor(viewTransaction.type)}`} />;
                  })()}
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    {viewTransaction.type === 'Collection' ? 'Collection Breakdown' : (viewTransaction.type === 'Investment' ? 'Investment Details' : 'Income Details')}
                  </h3>
                  <p className="text-[11px] text-slate-400">Transaction ID: {viewTransaction.id}</p>
                </div>
              </div>
              <button onClick={() => setViewTransaction(null)} className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[75vh]">
              {viewTransaction.type === 'Collection' ? (
                <div className="space-y-4">
                  {/* Summary Breakdown Card */}
                  <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 space-y-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Collection Allocation Breakdown</p>
                    <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                      <span className="text-[13px] font-semibold text-slate-700">Total Collection Amount</span>
                      <span className="text-[16px] font-black text-emerald-700">{formatCurrency(viewTransaction.amount)}</span>
                    </div>
                    <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                      <span className="text-[13px] font-medium text-slate-600">Principal Recovered</span>
                      <span className="text-[14px] font-bold text-blue-700">
                        {viewTransaction.hasBreakdown ? formatCurrency(viewTransaction.principal) : 'Unavailable'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[13px] font-medium text-slate-600">Interest Earned</span>
                      <span className="text-[14px] font-bold text-emerald-700">
                        {viewTransaction.hasBreakdown ? formatCurrency(viewTransaction.interest) : 'Unavailable'}
                      </span>
                    </div>
                  </div>

                  {/* Metadata fields */}
                  <div className="space-y-2.5 pt-1 text-[13px]">
                    <div className="flex justify-between items-center py-1 border-b border-slate-100">
                      <span className="font-medium text-slate-500">Customer Name</span>
                      <span className="font-bold text-slate-900">{viewTransaction.customerName}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-slate-100">
                      <span className="font-medium text-slate-500">Loan ID</span>
                      <span className="font-bold text-slate-900">{viewTransaction.loanId}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-slate-100">
                      <span className="font-medium text-slate-500">Collection Date</span>
                      <span className="font-bold text-slate-900">
                        {new Date(viewTransaction.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                    {viewTransaction.frequency && (
                      <div className="flex justify-between items-center py-1 border-b border-slate-100">
                        <span className="font-medium text-slate-500">Payment Frequency</span>
                        <span className="font-bold text-slate-900">{viewTransaction.frequency}</span>
                      </div>
                    )}
                    {viewTransaction.installmentRef && (
                      <div className="flex justify-between items-center py-1 border-b border-slate-100">
                        <span className="font-medium text-slate-500">Installment Reference</span>
                        <span className="font-bold text-slate-900">{viewTransaction.installmentRef}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center py-1 border-b border-slate-100">
                      <span className="font-medium text-slate-500">Payment Mode</span>
                      <span className="font-bold text-slate-900">{viewTransaction.mode}</span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="font-medium text-slate-500">Remarks</span>
                      <span className="font-bold text-slate-900">{viewTransaction.remarks || 'EMI Collection'}</span>
                    </div>
                  </div>
                </div>
              ) : viewTransaction.type === 'Investment' ? (
                <div className="space-y-3.5 text-[13px]">
                  <div className="rounded-xl border border-purple-200/70 bg-purple-50/40 p-4 space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-purple-700">Investor Capital Entry</p>
                    <div className="flex justify-between items-center">
                      <span className="text-[13px] font-semibold text-slate-700">Investment Capital</span>
                      <span className="text-[16px] font-black text-purple-700">{formatCurrency(viewTransaction.amount)}</span>
                    </div>
                    <p className="text-[11px] text-slate-500">Classified as investor capital, separate from business revenue.</p>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-100">
                    <span className="font-medium text-slate-500">Investor Name</span>
                    <span className="font-bold text-slate-900">{viewTransaction.investorName}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-100">
                    <span className="font-medium text-slate-500">Transaction Type</span>
                    <span className="font-bold text-slate-900">{viewTransaction.subType}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-100">
                    <span className="font-medium text-slate-500">Date</span>
                    <span className="font-bold text-slate-900">{new Date(viewTransaction.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-100">
                    <span className="font-medium text-slate-500">Payment Mode</span>
                    <span className="font-bold text-slate-900">{viewTransaction.mode}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="font-medium text-slate-500">Remarks</span>
                    <span className="font-bold text-slate-900">{viewTransaction.remarks || 'Investment Deposit'}</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3.5 text-[13px]">
                  <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/40 p-4 space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Income Entry</p>
                    <div className="flex justify-between items-center">
                      <span className="text-[13px] font-semibold text-slate-700">Recorded Amount</span>
                      <span className="text-[16px] font-black text-emerald-700">{formatCurrency(viewTransaction.amount)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-100">
                    <span className="font-medium text-slate-500">Income Type</span>
                    <span className="font-bold text-slate-900">{viewTransaction.type}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-100">
                    <span className="font-medium text-slate-500">Date</span>
                    <span className="font-bold text-slate-900">{new Date(viewTransaction.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-100">
                    <span className="font-medium text-slate-500">Payment Mode</span>
                    <span className="font-bold text-slate-900">{viewTransaction.mode}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="font-medium text-slate-500">Remarks</span>
                    <span className="font-bold text-slate-900">{viewTransaction.remarks || 'None'}</span>
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50/80 flex justify-end">
              <button onClick={() => setViewTransaction(null)} className="px-5 py-2 text-[13px] font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl transition-colors shadow-xs">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IncomeView;
