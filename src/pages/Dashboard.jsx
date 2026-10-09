import React from 'react';
import { LayoutDashboard, TrendingUp, Users, PiggyBank } from 'lucide-react';

const Dashboard = () => {
  return (
    <div className="h-full w-full flex flex-col p-6 bg-slate-50">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
      </div>
      
      <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center max-w-2xl mx-auto my-auto w-full">
        <div className="h-20 w-20 bg-emerald-50 rounded-2xl flex items-center justify-center mb-6 border border-emerald-100">
          <LayoutDashboard className="h-10 w-10 text-emerald-600" />
        </div>
        
        <h2 className="text-2xl font-bold text-slate-800 mb-3">Module Under Construction</h2>
        <p className="text-slate-500 mb-8 max-w-md text-[15px] leading-relaxed">
          The central Dashboard module is currently being developed. Soon you will be able to see high-level analytics, portfolio health, and key metrics here.
        </p>

        <div className="grid grid-cols-3 gap-4 w-full">
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-100 flex flex-col items-center">
            <TrendingUp className="h-6 w-6 text-slate-400 mb-2" />
            <span className="text-xs font-semibold text-slate-700">Analytics</span>
          </div>
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-100 flex flex-col items-center">
            <Users className="h-6 w-6 text-slate-400 mb-2" />
            <span className="text-xs font-semibold text-slate-700">Portfolio</span>
          </div>
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-100 flex flex-col items-center">
            <PiggyBank className="h-6 w-6 text-slate-400 mb-2" />
            <span className="text-xs font-semibold text-slate-700">Financials</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
