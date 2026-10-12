import { Calendar, Bell, Download } from 'lucide-react';

const DashboardHeader = () => {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">Financial Dashboard</h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Track your business performance, collections and financial position — all in one place.
        </p>
      </div>

      <div className="flex items-center gap-2.5 sm:gap-3 self-stretch sm:self-auto justify-end flex-wrap">
        <div className="flex items-center gap-2 bg-white border border-slate-200/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-600 cursor-not-allowed opacity-80 shadow-xs">
          <Calendar className="h-4 w-4 text-emerald-700" />
          <span>This Month</span>
        </div>
        <button 
          aria-label="Notifications"
          className="bg-white border border-slate-200/80 rounded-lg p-2 text-slate-600 hover:bg-slate-50 cursor-not-allowed opacity-80 shadow-xs"
        >
          <Bell className="h-4 w-4" />
        </button>
        <button 
          className="bg-emerald-700 hover:bg-emerald-800 text-white flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-not-allowed opacity-80 shadow-xs"
        >
          <Download className="h-4 w-4" />
          <span>Export</span>
        </button>
      </div>
    </div>
  );
};

export default DashboardHeader;
