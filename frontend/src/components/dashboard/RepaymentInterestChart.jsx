import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Users, ArrowRightLeft } from 'lucide-react';
import { formatCompactCurrency } from '../../utils/currencyFormatter';
import DashboardEmptyState from './DashboardEmptyState';
import { useDashboardText } from '../../i18n/dashboardLanguage';

const RepaymentInterestChart = ({ data }) => {
  const t = useDashboardText('Dashboard Charts');
  const hasData = Array.isArray(data) && data.length > 0 && data.some(d => Number(d.Credit || 0) > 0);

  if (!hasData) {
    return (
      <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm col-span-1 lg:col-span-7 h-[360px] min-h-[360px] flex flex-col min-w-0">
        <div className="flex items-center gap-2 mb-4 shrink-0">
          <div className="h-8 w-8 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
            <Users className="h-4 w-4 text-emerald-700" strokeWidth={1.8} />
          </div>
          <h3 className="text-base font-bold text-slate-800">{t('Repayment vs Interest')}</h3>
        </div>
        <div className="flex-1 flex items-center justify-center min-h-0">
          <DashboardEmptyState
            icon={ArrowRightLeft}
            title={t('No repayment data available.')}
            subtitle={t('Repayment and interest trends will appear once recorded.')}
          />
        </div>
      </div>
    );
  }

  // We are mapping "Credit" (from monthlyData) as Repayment
  const chartData = data.map(d => ({
    name: d.name,
    Repayment: d.Credit,
  }));

  return (
    <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm col-span-1 lg:col-span-7 h-[360px] min-h-[360px] flex flex-col min-w-0">
      <div className="flex items-center gap-2 mb-4 shrink-0">
        <div className="h-8 w-8 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
          <Users className="h-4 w-4 text-emerald-700" strokeWidth={1.8} />
        </div>
        <h3 className="text-base font-bold text-slate-800">{t('Repayment vs Interest')}</h3>
      </div>
      <div className="flex-1 w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
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
            <Legend iconType="square" wrapperStyle={{ fontSize: '12px' }} align="right" verticalAlign="top" />
            <Bar dataKey="Repayment" name={t('Repayment')} fill="#0f4a36" radius={[2, 2, 0, 0]} maxBarSize={20} />
            {/* Interest line is omitted since we have no interest data */}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default RepaymentInterestChart;
