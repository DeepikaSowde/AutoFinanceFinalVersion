import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Receipt } from 'lucide-react';
import { formatCurrency } from '../../utils/currencyFormatter';
import DashboardEmptyState from './DashboardEmptyState';

const COLORS = ['#0f4a36', '#10b981', '#f59e0b', '#8b5cf6', '#64748b', '#3b82f6'];

const ExpenseBreakdownChart = ({ data, total }) => {
  const hasData = Array.isArray(data) && data.length > 0 && data.some(d => Number(d.value || 0) > 0);

  if (!hasData) {
    return (
      <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm flex flex-col h-[360px] min-h-[360px] col-span-1 lg:col-span-4 w-full min-w-0">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h3 className="text-base font-bold text-slate-800">Expense Overview</h3>
        </div>
        <div className="flex-1 flex items-center justify-center min-h-0">
          <DashboardEmptyState
            icon={Receipt}
            title="No expense records available."
            subtitle="Recorded expenses will appear here."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm flex flex-col h-[360px] min-h-[360px] col-span-1 lg:col-span-4 w-full min-w-0">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h3 className="text-base font-bold text-slate-800">Expense Overview</h3>
      </div>
      <div className="flex-1 flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center justify-between min-h-0">
        <div className="h-44 w-44 sm:h-48 sm:w-48 relative shrink-0 mx-auto sm:mx-0 lg:mx-auto xl:mx-0">
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
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-2">
            <span className="text-xs sm:text-sm font-bold text-slate-800 leading-tight">{formatCurrency(total)}</span>
            <span className="text-xs text-slate-500">Total Debit</span>
          </div>
        </div>
        
        <div className="flex-1 w-full mt-3 sm:mt-0 sm:ml-6 lg:mt-3 lg:ml-0 xl:mt-0 xl:ml-6 overflow-y-auto pr-1 max-h-[140px] lg:max-h-[120px] xl:max-h-[140px]">
          <div className="space-y-2.5">
            {data.map((item, index) => {
              const percentage = total > 0 ? ((item.value / total) * 100).toFixed(1) : 0;
              return (
                <div key={index} className="flex items-start justify-between text-xs w-full gap-2">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <div 
                      className="h-2 w-2 rounded-full shrink-0 mt-1" 
                      style={{ backgroundColor: COLORS[index % COLORS.length] }} 
                    />
                    <span className="text-slate-600 break-words leading-tight" title={item.name}>{item.name}</span>
                  </div>
                  <div className="flex items-center justify-end gap-2.5 shrink-0 ml-2">
                    <span className="text-slate-400 text-right">{percentage}%</span>
                    <span className="font-medium text-slate-800 text-right">{formatCurrency(item.value)}</span>
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
