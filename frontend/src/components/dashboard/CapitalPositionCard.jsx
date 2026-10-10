import React from 'react';
import { Wallet } from 'lucide-react';
import { formatCurrency } from '../../utils/currencyFormatter';

const CapitalPositionCard = ({ data }) => {
  if (!data) return null;

  const total = data.totalCapital;
  
  const getPercentage = (value) => {
    if (!total || total === 0) return 0;
    return Math.min((value / total) * 100, 100);
  };

  return (
    <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm col-span-1 lg:col-span-5 h-full">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-8 w-8 rounded-full bg-emerald-50 flex items-center justify-center">
          <Wallet className="h-4 w-4 text-emerald-700" />
        </div>
        <h3 className="text-sm font-bold text-slate-800">Capital Position</h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div>
            <p className="text-2xl font-bold text-slate-800">{formatCurrency(data.totalCapital)}</p>
            <p className="text-xs text-slate-500">Total Capital</p>
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">{formatCurrency(data.openingCapital)}</p>
            <p className="text-xs text-slate-500">Opening Capital</p>
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">{formatCurrency(data.closingBalance)}</p>
            <p className="text-xs text-slate-500">Closing Balance</p>
          </div>
        </div>

        <div>
          <h4 className="text-xs font-semibold text-emerald-700 mb-2">Capital Utilization</h4>
          <div className="w-full bg-slate-100 rounded-full h-2 mb-6">
            <div 
              className="bg-emerald-700 h-2 rounded-full" 
              style={{ width: `${getPercentage(data.deployed)}%` }}
            ></div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center text-xs">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-slate-300"></div>
                <span className="text-slate-600">Available Capital</span>
              </div>
              <span className="font-medium text-slate-800">{formatCurrency(data.available)}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-700"></div>
                <span className="text-slate-600">Deployed</span>
              </div>
              <span className="font-medium text-slate-800">{formatCurrency(data.deployed)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CapitalPositionCard;
