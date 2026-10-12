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

const Dashboard = () => {
  const { data, loading } = useDashboardData();

  if (loading) {
    return (
      <div className="h-full w-full min-h-[400px] flex items-center justify-center p-6 bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-700"></div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col p-4 sm:p-6 bg-slate-50 overflow-y-auto">
      <div className="w-full">
        <DashboardHeader />
        
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
      </div>
    </div>
  );
};

export default Dashboard;
