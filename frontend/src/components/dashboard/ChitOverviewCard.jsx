import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatCurrency } from '../../utils/currencyFormatter';
import { CHIT_UPDATE_EVENT, getChitTransactions } from '../../utils/chitStorage';
import DashboardEmptyState from './DashboardEmptyState';

const ChitOverviewCard = ({ data }) => {
  // Saved chit transactions (from the API). They arrive after the first
  // render, so redraw whenever a fresh copy comes in.
  const [transactions, setTransactions] = useState(() => getChitTransactions());
  useEffect(() => {
    const sync = () => setTransactions(getChitTransactions());
    sync();
    window.addEventListener(CHIT_UPDATE_EVENT, sync);
    return () => window.removeEventListener(CHIT_UPDATE_EVENT, sync);
  }, []);

  const chitIncome = transactions
    .filter((t) => t.type === 'Chit Income' || t.category === 'Income')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const chitExpense = transactions
    .filter((t) => t.type === 'Chit Paid' || t.category === 'Expense')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const totalTransactions = transactions.length;

  const hasData = totalTransactions > 0 || chitIncome > 0 || chitExpense > 0;
  const hasChartData = chitIncome > 0 || chitExpense > 0;

  // Max value to scale bar heights proportionally
  const maxVal = Math.max(chitIncome, chitExpense, 1);
  const minBarHeightPct = 12; // Minimum height percentage so non-zero amounts remain visible
  const incomeHeightPct = chitIncome > 0 ? Math.max(Math.round((chitIncome / maxVal) * 100), minBarHeightPct) : 0;
  const expenseHeightPct = chitExpense > 0 ? Math.max(Math.round((chitExpense / maxVal) * 100), minBarHeightPct) : 0;

  return (
    <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm flex flex-col h-[360px] min-h-[360px] col-span-1 lg:col-span-4 w-full min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
            <Users className="h-4 w-4 text-emerald-700" strokeWidth={1.8} />
          </div>
          <h3 className="text-base font-bold text-slate-800">Chit Overview</h3>
        </div>
        <Link 
          to="/chit-investment"
          className="text-xs text-emerald-600 font-semibold hover:text-emerald-700 hover:underline select-none transition-colors"
        >
          View Details &rarr;
        </Link>
      </div>

      {!hasData ? (
        <div className="flex-1 flex items-center justify-center min-h-0">
          <DashboardEmptyState
            icon={Users}
            title="No chit records available."
            subtitle="Chit details will appear here when records are added."
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-between min-h-0">
          {/* Top: 3 KPI Metrics with full labels */}
          <div className="grid grid-cols-3 gap-2 shrink-0 py-2 border-b border-slate-100">
            {/* 1. Chit Income */}
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider truncate flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[#006052] shrink-0" />
                Chit Income
              </span>
              <span className="text-xs sm:text-sm font-bold text-[#006052] truncate mt-0.5" title={formatCurrency(chitIncome)}>
                {formatCurrency(chitIncome)}
              </span>
            </div>

            {/* 2. Chit Expense */}
            <div className="flex flex-col min-w-0 border-x border-slate-100 px-2">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider truncate flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-600 shrink-0" />
                Chit Expense
              </span>
              <span className="text-xs sm:text-sm font-bold text-rose-600 truncate mt-0.5" title={formatCurrency(chitExpense)}>
                {formatCurrency(chitExpense)}
              </span>
            </div>

            {/* 3. Total Transactions (Full Label, No abbreviation) */}
            <div className="flex flex-col min-w-0 pl-1 text-right">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider truncate">
                Total Transactions
              </span>
              <span className="text-xs sm:text-sm font-bold text-slate-800 truncate mt-0.5">
                {totalTransactions}
              </span>
            </div>
          </div>

          {/* Bottom: Clean Vertical Bar Chart Comparing Chit Income and Chit Expense */}
          <div className="flex-1 w-full min-h-0 pt-3 pb-1 flex flex-col justify-end">
            {!hasChartData ? (
              <div className="flex-1 flex items-center justify-center text-xs text-slate-400 italic">
                No financial amounts recorded yet.
              </div>
            ) : (
              <div className="w-full h-full flex flex-col justify-end">
                {/* Vertical Bars Area */}
                <div className="flex-1 flex items-end justify-center gap-12 sm:gap-16 px-4 pb-2">
                  {/* Chit Income Bar Column */}
                  <div className="flex flex-col items-center justify-end h-full w-24">
                    {/* Exact amount above bar */}
                    <span className="text-xs font-bold text-[#006052] mb-1.5 whitespace-nowrap">
                      {formatCurrency(chitIncome)}
                    </span>
                    {/* Vertical Green Bar */}
                    <div 
                      className="w-14 rounded-t-md bg-[#006052] shadow-2xs transition-all duration-300"
                      style={{ height: `${incomeHeightPct}%` }}
                    />
                  </div>

                  {/* Chit Expense Bar Column */}
                  <div className="flex flex-col items-center justify-end h-full w-24">
                    {/* Exact amount above bar */}
                    <span className="text-xs font-bold text-rose-600 mb-1.5 whitespace-nowrap">
                      {formatCurrency(chitExpense)}
                    </span>
                    {/* Vertical Red Bar */}
                    <div 
                      className="w-14 rounded-t-md bg-rose-600 shadow-2xs transition-all duration-300"
                      style={{ height: `${expenseHeightPct}%` }}
                    />
                  </div>
                </div>

                {/* Base Divider Line */}
                <div className="w-full border-t border-slate-200" />

                {/* Full Category Names Below Bars */}
                <div className="flex items-center justify-center gap-12 sm:gap-16 px-4 pt-2">
                  <div className="w-24 text-center">
                    <span className="text-xs font-bold text-slate-700">Chit Income</span>
                  </div>
                  <div className="w-24 text-center">
                    <span className="text-xs font-bold text-slate-700">Chit Expense</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChitOverviewCard;
