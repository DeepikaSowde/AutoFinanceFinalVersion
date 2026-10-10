import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatCompactCurrency } from '../../utils/currencyFormatter';

const MonthlyDebitCreditChart = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm h-80 flex items-center justify-center col-span-2">
        <p className="text-slate-500">No monthly data available</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm col-span-1 lg:col-span-7 h-[350px] flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-bold text-slate-800">Monthly Debit vs Credit</h3>
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
            <Bar dataKey="Debit" fill="#0f4a36" radius={[2, 2, 0, 0]} maxBarSize={12} />
            <Bar dataKey="Credit" fill="#69bca0" radius={[2, 2, 0, 0]} maxBarSize={12} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default MonthlyDebitCreditChart;
