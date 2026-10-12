import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const formatCurrency = (value) => `₹${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;

const COLORS = ['#0f4a36', '#3b82f6', '#10b981', '#f59e0b', '#06b6d4', '#8b5cf6', '#ec4899', '#64748b'];

const IncomeOverviewChart = ({ data, total }) => {
  if (!data || data.length === 0) {
    return (
      <div className="h-full bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 tracking-tight">Income Overview</h3>
        <p className="text-[13px] text-slate-500 mt-1 mb-6">Income breakdown for the selected period</p>
        <div className="flex-1 flex flex-col items-center justify-center min-h-[250px]">
          <p className="text-[15px] font-medium text-slate-800">No income data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
      <div className="p-5 border-b border-slate-100 shrink-0 bg-white">
        <h2 className="text-lg font-bold text-slate-900 tracking-tight">Income Overview</h2>
        <p className="text-[13px] text-slate-500 mt-1">Income breakdown for the selected period</p>
      </div>
      
      <div className="p-5 bg-white flex flex-col items-center justify-center">
        <div className="flex flex-col md:flex-row items-center md:items-start justify-center md:justify-start w-full gap-6">
          <div className="h-40 w-40 relative shrink-0 mx-auto md:mx-0">
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
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Total</span>
              <span className="text-[15px] font-extrabold tracking-tight text-[#006052] leading-none">{formatCurrency(total)}</span>
            </div>
          </div>
          
          <div className="flex flex-col gap-3 w-full min-w-0">
            {data.map((item, index) => {
              const percentage = total > 0 ? ((item.value / total) * 100).toFixed(1) : 0;
              return (
                <div key={index} className="flex flex-wrap sm:flex-nowrap items-center justify-between w-full gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div 
                      className="w-2.5 h-2.5 rounded-full shrink-0" 
                      style={{ backgroundColor: COLORS[index % COLORS.length] }} 
                    />
                    <span className="text-[13px] font-semibold text-[#374151] truncate">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[13px] font-bold text-slate-700">{formatCurrency(item.value)}</span>
                    <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-md min-w-[42px] text-center">{percentage}%</span>
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

export default IncomeOverviewChart;
