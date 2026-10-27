import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, ChevronRight, SlidersHorizontal, Scale, ArrowDownUp, RefreshCw } from 'lucide-react';

const SettingsOverview = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col flex-1 min-h-screen w-full max-w-full overflow-x-hidden bg-white px-4 sm:px-6 lg:px-8 py-5 sm:py-7">
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
      <div className="max-w-3xl space-y-4">
        {/* 1. Penalty & Grace Period */}
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

        {/* 2. Foreclosure & Vehicle Sale Settings */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate('/settings/foreclosure-vehicle-sale')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              navigate('/settings/foreclosure-vehicle-sale');
            }
          }}
          className="group relative flex items-center justify-between rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs hover:border-[#006052]/50 hover:shadow-md transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#006052] focus:ring-offset-2"
        >
          <div className="flex items-start gap-4 sm:gap-5 min-w-0 pr-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-700 border border-purple-100 group-hover:bg-[#006052] group-hover:text-white transition-colors duration-200">
              <Scale className="h-6 w-6" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 group-hover:text-[#006052] transition-colors duration-200 leading-snug">
                Foreclosure &amp; Vehicle Sale Settings
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 font-normal mt-1 leading-relaxed">
                Configure calculation components, seized-period interest basis, and profit/loss rules.
              </p>
            </div>
          </div>

          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-400 group-hover:bg-purple-50 group-hover:text-purple-700 transition-colors duration-200">
            <ChevronRight className="h-5 w-5 group-hover:translate-x-0.5 transition-transform duration-200" />
          </div>
        </div>

        {/* 3. Payment Allocation Settings */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate('/settings/payment-allocation')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              navigate('/settings/payment-allocation');
            }
          }}
          className="group relative flex items-center justify-between rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs hover:border-[#006052]/50 hover:shadow-md transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#006052] focus:ring-offset-2"
        >
          <div className="flex items-start gap-4 sm:gap-5 min-w-0 pr-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-[#006052] border border-teal-100 group-hover:bg-[#006052] group-hover:text-white transition-colors duration-200">
              <ArrowDownUp className="h-6 w-6" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 group-hover:text-[#006052] transition-colors duration-200 leading-snug">
                Payment Allocation Settings
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 font-normal mt-1 leading-relaxed">
                Configure how partial customer payments are allocated between interest and principal.
              </p>
            </div>
          </div>

          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-400 group-hover:bg-teal-50 group-hover:text-[#006052] transition-colors duration-200">
            <ChevronRight className="h-5 w-5 group-hover:translate-x-0.5 transition-transform duration-200" />
          </div>
        </div>

        {/* 4. Re-Loan Configuration */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate('/settings/re-loan')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              navigate('/settings/re-loan');
            }
          }}
          className="group relative flex items-center justify-between rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs hover:border-[#006052]/50 hover:shadow-md transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#006052] focus:ring-offset-2"
        >
          <div className="flex items-start gap-4 sm:gap-5 min-w-0 pr-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 border border-blue-100 group-hover:bg-[#006052] group-hover:text-white transition-colors duration-200">
              <RefreshCw className="h-6 w-6" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 group-hover:text-[#006052] transition-colors duration-200 leading-snug">
                Re-Loan Configuration
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 font-normal mt-1 leading-relaxed">
                Configure customer outstanding balance policies and assessment rules for re-loans.
              </p>
            </div>
          </div>

          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-400 group-hover:bg-blue-50 group-hover:text-[#006052] transition-colors duration-200">
            <ChevronRight className="h-5 w-5 group-hover:translate-x-0.5 transition-transform duration-200" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsOverview;
