import { useDashboardData } from '../hooks/useDashboardData';
import DashboardHeader from '../components/dashboard/DashboardHeader';
import KpiGrid from '../components/dashboard/KpiGrid';
import MonthlyDebitCreditChart from '../components/dashboard/MonthlyDebitCreditChart';
import IncomeBreakdownChart from '../components/dashboard/IncomeBreakdownChart';
import ChitOverviewCard from '../components/dashboard/ChitOverviewCard';
import ExpenseBreakdownChart from '../components/dashboard/ExpenseBreakdownChart';
import RepaymentInterestChart from '../components/dashboard/RepaymentInterestChart';
import OutstandingOverviewCard from '../components/dashboard/OutstandingOverviewCard';
import CapitalPositionCard from '../components/dashboard/CapitalPositionCard';
import OperationalDashboard from '../components/dashboard/OperationalDashboard';
import DashboardLanguageSwitch from '../components/dashboard/DashboardLanguageSwitch';
import {
  DashboardLanguageProvider,
  translateDashboardText,
  useDashboardLanguageState,
} from '../i18n/dashboardLanguage';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';

const Dashboard = () => {
  const [dateFilter, setDateFilter] = useState({ filterType: 'all', label: 'All Months' });
  const { data, loading } = useDashboardData(dateFilter);
  const [activeTab, setActiveTab] = useState('financial');
  const navigate = useNavigate();
  const { language, setLanguage, table, value: languageValue } = useDashboardLanguageState();
  const t = translateDashboardText(language, 'Dashboard Module', table);

  if (loading) {
    return (
      <div className="h-full w-full min-h-[400px] flex items-center justify-center p-6 bg-white">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-700"></div>
      </div>
    );
  }

  return (
    <DashboardLanguageProvider value={languageValue}>
    <div className="h-full w-full flex-1 min-h-screen flex flex-col p-4 sm:p-6 bg-white overflow-y-auto">
      <div className="w-full">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200">
          <div className="flex w-full sm:w-auto overflow-x-auto -mb-px">
            <button
              type="button"
              onClick={() => setActiveTab('financial')}
              className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                activeTab === 'financial'
                  ? 'border-emerald-700 text-emerald-800'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
              aria-current={activeTab === 'financial' ? 'page' : undefined}
            >
              {t('Financial Dashboard')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('operational')}
              className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                activeTab === 'operational'
                  ? 'border-emerald-700 text-emerald-800'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
              aria-current={activeTab === 'operational' ? 'page' : undefined}
            >
              {t('Operational Dashboard')}
            </button>
          </div>

          <div className="flex items-center justify-end gap-2 pb-2.5 sm:pb-0">
            <DashboardLanguageSwitch language={language} onChange={setLanguage} />
            <button
              type="button"
              onClick={() => navigate('/smart-search')}
              className="inline-flex items-center gap-2 rounded-xl bg-[#07111F] hover:bg-[#0e1f36] border border-slate-700/60 px-3.5 py-1.5 sm:py-2 text-xs sm:text-[13px] font-semibold text-white shadow-sm hover:shadow transition-all duration-150 active:scale-[0.98] cursor-pointer group focus:outline-none focus:ring-2 focus:ring-[#FACC15]/40"
              title={t('Smart Search')}
              aria-label={t('Smart Search')}
            >
              <Search className="h-4 w-4 text-[#FACC15] stroke-[2.5] transition-transform duration-200 group-hover:scale-110 shrink-0" />
              <span className="text-white">{t('Smart Search')}</span>
            </button>
          </div>
        </div>

        {activeTab === 'operational' ? (
          <OperationalDashboard
            data={data}
            dateFilter={dateFilter}
            setDateFilter={setDateFilter}
          />
        ) : (
          <>
            <DashboardHeader
              dateFilter={dateFilter}
              setDateFilter={setDateFilter}
            />
            <KpiGrid data={data} />
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4">
              <MonthlyDebitCreditChart data={data?.monthlyData} />
              <IncomeBreakdownChart data={data?.incomeBreakdown} total={data?.totalCredit} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4">
              <OutstandingOverviewCard data={data?.outstandingOverview} />
              <ExpenseBreakdownChart data={data?.expenseBreakdown} total={data?.totalDebit} />
              <ChitOverviewCard data={data?.chitData} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6 sm:mb-8">
              <CapitalPositionCard data={data?.capitalData} />
              <RepaymentInterestChart data={data?.monthlyData} />
            </div>
          </>
        )}
      </div>
    </div>
    </DashboardLanguageProvider>
  );
};

export default Dashboard;
