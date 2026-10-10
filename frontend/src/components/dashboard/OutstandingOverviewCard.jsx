import React from 'react';
import { Database } from 'lucide-react';
import { formatCurrency } from '../../utils/currencyFormatter';

const OutstandingOverviewCard = ({ data }) => {
  if (!data) return null;

  const total = Math.max(data.debit, data.credit); // For scaling the progress bars

  const getPercentage = (value) => {
    if (!total || total === 0) return 0;
    return Math.min((value / total) * 100, 100);
  };

  const items = [
    { label: 'Debit Outstanding', value: data.debit },
    { label: 'Credit', value: data.credit },
    { label: 'Balance', value: data.balance }
  ];

  return (
    <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm col-span-1 lg:col-span-4 h-full">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-8 w-8 rounded-full bg-emerald-50 flex items-center justify-center">
          <Database className="h-4 w-4 text-emerald-700" />
        </div>
        <h3 className="text-sm font-bold text-slate-800">Outstanding Overview</h3>
      </div>
      
      <div className="mb-6">
        <p className="text-2xl font-bold text-slate-800">{formatCurrency(data.totalOutstanding)}</p>
        <p className="text-xs text-slate-500">Total Outstanding</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div key={idx} className="flex justify-between items-center text-sm">
              <span className="text-slate-600">{item.label}</span>
              <span className="font-medium text-slate-800">{formatCurrency(item.value)}</span>
            </div>
          ))}
        </div>
        
        <div className="space-y-4 mt-2 md:mt-0">
          {items.map((item, idx) => (
            <div key={idx} className="w-full">
              <div className="flex justify-between items-center text-xs mb-1">
                <span className="text-slate-600">{item.label}</span>
                <span className="text-slate-800">{formatCurrency(item.value)}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5">
                <div 
                  className="bg-emerald-700 h-1.5 rounded-full" 
                  style={{ width: `${getPercentage(item.value)}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default OutstandingOverviewCard;
