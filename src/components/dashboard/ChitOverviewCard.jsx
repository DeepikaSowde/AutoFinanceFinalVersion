import React from 'react';
import { Users } from 'lucide-react';
import { formatCurrency } from '../../utils/currencyFormatter';

const ChitOverviewCard = ({ data }) => {
  return (
    <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm flex flex-col h-[350px] col-span-1 lg:col-span-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
            <Users className="h-4 w-4 text-emerald-700" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">Chit Overview</h3>
        </div>
        <span className="text-xs text-emerald-600 font-medium cursor-not-allowed">View Details &rarr;</span>
      </div>

      <div className="flex-1 flex flex-col justify-center">
        {(!data || Object.keys(data).length === 0) ? (
          <div className="text-center text-slate-500 text-sm py-8">
            <p>No chit data available</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-center text-sm border-b border-slate-100 pb-2">
              <span className="text-slate-600">Chit Paid</span>
              <span className="font-medium text-slate-800">{formatCurrency(data.paid)}</span>
            </div>
            <div className="flex justify-between items-center text-sm border-b border-slate-100 pb-2">
              <span className="text-slate-600">Chit Amount</span>
              <span className="font-medium text-slate-800">{formatCurrency(data.amount)}</span>
            </div>
            <div className="flex justify-between items-center text-sm border-b border-slate-100 pb-2">
              <span className="text-slate-600">Chit Investment</span>
              <span className="font-medium text-slate-800">{formatCurrency(data.investment)}</span>
            </div>
            <div className="flex justify-between items-center text-sm mb-4">
              <span className="text-slate-600">Chit Inward</span>
              <span className="font-medium text-slate-800">{formatCurrency(data.inward)}</span>
            </div>
            
            {data.paid > 0 && data.amount > 0 && (
              <div className="mt-auto">
                <div className="w-full bg-slate-100 rounded-full h-1.5 mb-2">
                  <div 
                    className="bg-emerald-700 h-1.5 rounded-full" 
                    style={{ width: `${Math.min((data.paid / data.amount) * 100, 100)}%` }}
                  ></div>
                </div>
                <div className="flex justify-between items-center text-xs text-slate-500">
                  <span>Paid vs Received</span>
                  <span>{formatCurrency(data.paid)} / {formatCurrency(data.amount)}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChitOverviewCard;
