import KpiCard from './KpiCard';
import { Database, Wallet, ArrowRightLeft, Percent, PiggyBank } from 'lucide-react';
import { useDashboardText } from '../../i18n/dashboardLanguage';

const KpiGrid = ({ data }) => {
  const t = useDashboardText('Dashboard KPI');
  const safeData = data || {
    totalOutstanding: 0,
    totalCredit: 0,
    totalDebit: 0,
    interestEarned: 0,
    closingBalance: 0
  };

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4 mb-6">
      <KpiCard 
        title={t('Total Outstanding')} 
        amount={safeData.totalOutstanding} 
        icon={Database} 
      />
      <KpiCard 
        title={t('Total Credit')} 
        amount={safeData.totalCredit} 
        icon={Wallet} 
      />
      <KpiCard 
        title={t('Total Debit')} 
        amount={safeData.totalDebit} 
        icon={ArrowRightLeft} 
      />
      <KpiCard 
        title={t('Interest Earned')} 
        amount={safeData.interestEarned} 
        icon={Percent} 
      />
      <KpiCard 
        title={t('Closing Balance')} 
        amount={safeData.closingBalance} 
        icon={PiggyBank} 
      />
    </div>
  );
};

export default KpiGrid;
