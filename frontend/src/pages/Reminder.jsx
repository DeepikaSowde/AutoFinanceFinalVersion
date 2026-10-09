import React from 'react';
import { BellRing, CalendarClock, MessageSquareWarning } from 'lucide-react';

const Reminder = () => {
  return (
    <div className="h-full w-full flex flex-col p-6 bg-slate-50">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Notifications & Reminders</h1>
      </div>
      
      <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center max-w-2xl mx-auto my-auto w-full">
        <div className="h-20 w-20 bg-emerald-50 rounded-2xl flex items-center justify-center mb-6 border border-emerald-100">
          <BellRing className="h-10 w-10 text-emerald-600" />
        </div>
        
        <h2 className="text-2xl font-bold text-slate-800 mb-3">Module Under Construction</h2>
        <p className="text-slate-500 mb-8 max-w-md text-[15px] leading-relaxed">
          The Reminders module is currently being developed. Soon you will be able to automate customer follow-ups and manage daily collection alerts.
        </p>

        <div className="grid grid-cols-2 gap-4 w-full">
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-100 flex flex-col items-center">
            <CalendarClock className="h-6 w-6 text-slate-400 mb-2" />
            <span className="text-sm font-semibold text-slate-700">Scheduled Alerts</span>
          </div>
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-100 flex flex-col items-center">
            <MessageSquareWarning className="h-6 w-6 text-slate-400 mb-2" />
            <span className="text-sm font-semibold text-slate-700">Overdue Follow-ups</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reminder;
