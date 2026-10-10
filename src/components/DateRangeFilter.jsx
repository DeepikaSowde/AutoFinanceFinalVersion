import React from 'react';

const DateRangeFilter = ({ dateFilter, setDateFilter, customStart, setCustomStart, customEnd, setCustomEnd }) => {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
      <select
        value={dateFilter}
        onChange={e => setDateFilter(e.target.value)}
        className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-medium text-slate-700 outline-none hover:border-[#006052] focus:border-[#006052] focus:ring-1 focus:ring-[#006052] shadow-sm min-w-[140px]"
      >
        <option>All Time</option>
        <option>Today</option>
        <option>This Week</option>
        <option>This Month</option>
        <option>Last Month</option>
        <option>Custom Range</option>
      </select>

      {dateFilter === 'Custom Range' && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={customStart}
            onChange={e => setCustomStart(e.target.value)}
            className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-medium text-slate-700 outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052] shadow-sm w-[130px]"
          />
          <span className="text-slate-400 font-medium">to</span>
          <input
            type="date"
            value={customEnd}
            onChange={e => setCustomEnd(e.target.value)}
            className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-medium text-slate-700 outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052] shadow-sm w-[130px]"
          />
        </div>
      )}
    </div>
  );
};

export default DateRangeFilter;
