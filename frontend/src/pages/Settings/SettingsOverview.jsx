import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, ChevronRight, SlidersHorizontal } from 'lucide-react';

const SettingsOverview = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col flex-1 min-h-screen w-full max-w-full overflow-x-hidden bg-slate-50 px-4 sm:px-6 lg:px-8 py-5 sm:py-7">
      {/* Page Header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl bg-[#006052] text-white shadow-sm">
            <SlidersHorizontal className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 leading-tight">
              Settings
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
              Manage your finance business rules and configurations.
            </p>
          </div>
        </div>
      </div>

      {/* Settings Options Grid */}
      <div className="max-w-3xl">
        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate('/settings/penalty-grace')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              navigate('/settings/penalty-grace');
            }
          }}
          className="group relative flex items-center justify-between rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs hover:border-[#006052]/50 hover:shadow-md transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#006052] focus:ring-offset-2"
        >
          <div className="flex items-start gap-4 sm:gap-5 min-w-0 pr-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-[#006052] border border-emerald-100 group-hover:bg-[#006052] group-hover:text-white transition-colors duration-200">
              <Clock className="h-6 w-6" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 group-hover:text-[#006052] transition-colors duration-200 leading-snug">
                Penalty &amp; Grace Period
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 font-normal mt-1 leading-relaxed">
                Configure grace days and penalty rules for Daily, Weekly and Monthly loans.
              </p>
            </div>
          </div>

          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-400 group-hover:bg-emerald-50 group-hover:text-[#006052] transition-colors duration-200">
            <ChevronRight className="h-5 w-5 group-hover:translate-x-0.5 transition-transform duration-200" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsOverview;
