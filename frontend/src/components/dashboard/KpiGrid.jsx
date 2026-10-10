import React from 'react';
import KpiCard from './KpiCard';
import { Database, Wallet, ArrowRightLeft, Percent, PiggyBank } from 'lucide-react';

const KpiGrid = ({ data }) => {
  if (!data) return null;

  return (
    <div className="flex flex-wrap lg:flex-nowrap gap-4 mb-6">
      <KpiCard 
        title="Total Outstanding" 
        amount={data.totalOutstanding} 
        icon={Database} 
      />
      <KpiCard 
        title="Total Credit" 
        amount={data.totalCredit} 
        icon={Wallet} 
      />
      <KpiCard 
        title="Total Debit" 
        amount={data.totalDebit} 
        icon={ArrowRightLeft} 
      />
      <KpiCard 
        title="Interest Earned" 
        amount={data.interestEarned} 
        icon={Percent} 
      />
      <KpiCard 
        title="Closing Balance" 
        amount={data.closingBalance} 
        icon={PiggyBank} 
      />
    </div>
  );
};

export default KpiGrid;
