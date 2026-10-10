import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatCurrency } from '../../utils/currencyFormatter';

const COLORS = ['#0f4a36', '#10b981', '#f59e0b', '#8b5cf6', '#64748b', '#3b82f6'];

const ExpenseBreakdownChart = ({ data, total }) => {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm h-80 flex items-center justify-center">
        <p className="text-slate-500">No expense data available</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm flex flex-col h-[350px] col-span-1 lg:col-span-4">
      <h3 className="text-lg font-bold text-slate-800 mb-4">Expense Breakdown</h3>
      <div className="flex-1 flex flex-col md:flex-row items-center justify-between min-h-0">
        <div className="h-48 w-48 relative shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatCurrency(value)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-sm font-bold text-slate-800">{formatCurrency(total)}</span>
            <span className="text-xs text-slate-500">Total Debit</span>
          </div>
        </div>
        
        <div className="flex-1 w-full mt-4 md:mt-0 md:ml-6 overflow-y-auto pr-2">
          <div className="space-y-3">
            {data.map((item, index) => {
              const percentage = total > 0 ? ((item.value / total) * 100).toFixed(1) : 0;
              return (
                <div key={index} className="flex items-start justify-between text-xs w-full gap-2">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <div 
                      className="h-2 w-2 rounded-full shrink-0 mt-1" 
                      style={{ backgroundColor: COLORS[index % COLORS.length] }} 
                    />
                    <span className="text-slate-600 break-words leading-tight">{item.name}</span>
                  </div>
                  <div className="flex items-center justify-end gap-3 shrink-0">
                    <span className="text-slate-400 w-10 text-right">{percentage}%</span>
                    <span className="font-medium text-slate-800 min-w-[70px] text-right">{formatCurrency(item.value)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExpenseBreakdownChart;
