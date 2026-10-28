import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Calendar } from 'lucide-react';
import { formatCompactCurrency } from '../../utils/currencyFormatter';
import DashboardEmptyState from './DashboardEmptyState';
import { useDashboardText } from '../../i18n/dashboardLanguage';

const MonthlyDebitCreditChart = ({ data }) => {
  const t = useDashboardText('Dashboard Charts');
  const hasData = Array.isArray(data) && data.length > 0 && data.some(d => (Number(d.Debit || 0) > 0 || Number(d.Credit || 0) > 0));

  if (!hasData) {
    return (
      <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm col-span-1 lg:col-span-7 h-[360px] min-h-[360px] flex flex-col min-w-0">
        <div className="flex justify-between items-center mb-4 shrink-0">
          <h3 className="text-base font-bold text-slate-800">{t('Monthly Financial Overview')}</h3>
        </div>
        <div className="flex-1 flex items-center justify-center min-h-0">
          <DashboardEmptyState
            icon={Calendar}
            title={t('No monthly financial data available.')}
            subtitle={t('Transactions will appear here once recorded.')}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm col-span-1 lg:col-span-7 h-[360px] min-h-[360px] flex flex-col min-w-0">
      <div className="flex justify-between items-center mb-4 shrink-0">
        <h3 className="text-base font-bold text-slate-800">{t('Monthly Financial Overview')}</h3>
      </div>
      <div className="flex-1 w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis 
              dataKey="name" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 10, fill: '#64748b' }} 
              dy={10} 
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 10, fill: '#64748b' }} 
              tickFormatter={(value) => formatCompactCurrency(value)}
            />
            <Tooltip 
              formatter={(value) => formatCompactCurrency(value)}
              cursor={{ fill: '#f8fafc' }}
              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            />
            <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} align="right" verticalAlign="top" />
            <Bar dataKey="Debit" name={t('Debit')} fill="#0f4a36" radius={[2, 2, 0, 0]} maxBarSize={14} />
            <Bar dataKey="Credit" name={t('Credit')} fill="#69bca0" radius={[2, 2, 0, 0]} maxBarSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default MonthlyDebitCreditChart;
