import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { PieChart as PieChartIcon } from 'lucide-react';

const formatCurrency = (value) => `₹${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;

const COLORS = ['#0f4a36', '#3b82f6', '#10b981', '#f59e0b', '#06b6d4', '#8b5cf6', '#ec4899', '#64748b'];

const IncomeOverviewChart = ({ data, total }) => {
  const chartData = Array.isArray(data)
    ? data.filter((d) => Number(d?.value || 0) > 0)
    : [];

  const hasData = chartData.length > 0 && Number(total || 0) > 0;

  if (!hasData) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col min-w-0 w-full overflow-hidden h-full">
        <div className="p-4 sm:p-5 border-b border-slate-100 shrink-0 bg-white">
          <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">Income Overview</h2>
          <p className="text-xs sm:text-[13px] text-slate-500 mt-0.5">Income breakdown for the selected period</p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-[240px] text-center">
          <div className="h-12 w-12 rounded-full bg-emerald-50 text-[#006052] flex items-center justify-center mb-3 border border-emerald-100 shadow-2xs">
            <PieChartIcon className="h-6 w-6" strokeWidth={1.8} />
          </div>
          <p className="text-[14px] sm:text-[15px] font-semibold text-slate-800">No income data available</p>
          <p className="text-xs text-slate-500 mt-1 max-w-[240px]">Income breakdown will appear here once transactions are recorded for this period.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden min-w-0 w-full h-full">
      <div className="p-4 sm:p-5 border-b border-slate-100 shrink-0 bg-white">
        <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">Income Overview</h2>
        <p className="text-xs sm:text-[13px] text-slate-500 mt-0.5">Income breakdown for the selected period</p>
      </div>

      <div className="p-4 sm:p-5 bg-white flex flex-col items-center justify-center flex-1 min-w-0">
        <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center sm:items-start lg:items-center xl:items-start justify-center sm:justify-start lg:justify-center xl:justify-start w-full gap-5 sm:gap-6 min-w-0">
          {/* Chart Wrapper with guaranteed dimensions and responsive scaling */}
          <div className="h-44 w-44 sm:h-48 sm:w-48 min-h-[176px] min-w-[176px] relative shrink-0 mx-auto sm:mx-0 lg:mx-auto xl:mx-0 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%" minWidth={160} minHeight={160}>
              <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={72}
                  paddingAngle={chartData.length > 1 ? 3 : 0}
                  dataKey="value"
                  stroke="#ffffff"
                  strokeWidth={2}
                  isAnimationActive={false}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>

            {/* Center Total Overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-1">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Total</span>
              <span className="text-xs sm:text-[14px] font-extrabold tracking-tight text-[#006052] leading-none px-1 truncate max-w-[100px]">
                {formatCurrency(total)}
              </span>
            </div>
          </div>

          {/* Legend and breakdown items */}
          <div className="flex flex-col gap-2.5 w-full min-w-0 flex-1 overflow-y-auto max-h-[240px] pr-1">
            {chartData.map((item, index) => {
              const val = Number(item.value || 0);
              const percentage = total > 0 ? ((val / total) * 100).toFixed(1) : "0.0";
              return (
                <div key={index} className="flex items-center justify-between w-full gap-2 min-w-0">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span className="text-xs sm:text-[13px] font-semibold text-slate-700 truncate" title={item.name}>
                      {item.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs sm:text-[13px] font-bold text-slate-800">{formatCurrency(val)}</span>
                    <span className="text-[10px] sm:text-[11px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded min-w-[38px] text-center">
                      {percentage}%
                    </span>
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
