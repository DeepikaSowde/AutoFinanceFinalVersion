import React from 'react';
import { formatCurrency } from '../../utils/currencyFormatter';

const KpiCard = ({ title, amount, icon: Icon }) => {
  return (
    <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm flex items-start space-x-4 min-w-[200px] flex-1">
      <div className="h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
        <Icon className="h-6 w-6 text-emerald-700" />
      </div>
      <div>
        <h3 className="text-sm font-medium text-slate-500 mb-1">{title}</h3>
        <p className="text-xl font-bold text-slate-800">
          {formatCurrency(amount)}
        </p>
      </div>
    </div>
  );
};

export default KpiCard;
