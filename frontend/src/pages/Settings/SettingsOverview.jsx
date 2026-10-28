import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings,
  Clock,
  Scale,
  ArrowDownUp,
  RotateCcw,
  ArrowRight,
} from 'lucide-react';

const SettingsOverview = () => {
  const navigate = useNavigate();

  const settingsCards = [
    {
      id: 'penalty-grace',
      title: 'Penalty & Grace Period',
      description:
        'Configure grace days and penalty rules for Daily, Weekly and Monthly loans.',
      category: 'Loan Rules',
      icon: Clock,
      route: '/settings/penalty-grace',
      accentColor: 'bg-emerald-500',
      badgeStyles: 'bg-emerald-50/90 text-emerald-800 border-emerald-200/80',
      iconContainerStyles:
        'bg-emerald-50 text-emerald-700 border-emerald-100 group-hover:bg-emerald-600 group-hover:text-white',
      arrowButtonHoverStyles:
        'group-hover:bg-emerald-600 group-hover:text-white group-hover:border-emerald-600',
    },
    {
      id: 'foreclosure-vehicle-sale',
      title: 'Foreclosure & Vehicle Sale Settings',
      description:
        'Configure calculation components, seized-period interest basis, and profit/loss rules.',
      category: 'Vehicle & Recovery',
      icon: Scale,
      route: '/settings/foreclosure-vehicle-sale',
      accentColor: 'bg-purple-500',
      badgeStyles: 'bg-purple-50/90 text-purple-800 border-purple-200/80',
      iconContainerStyles:
        'bg-purple-50 text-purple-700 border-purple-100 group-hover:bg-purple-600 group-hover:text-white',
      arrowButtonHoverStyles:
        'group-hover:bg-purple-600 group-hover:text-white group-hover:border-purple-600',
    },
    {
      id: 'payment-allocation',
      title: 'Payment Allocation Settings',
      description:
        'Configure how partial customer payments are allocated between interest and principal.',
      category: 'Collections',
      icon: ArrowDownUp,
      route: '/settings/payment-allocation',
      accentColor: 'bg-teal-500',
      badgeStyles: 'bg-teal-50/90 text-teal-800 border-teal-200/80',
      iconContainerStyles:
        'bg-teal-50 text-teal-700 border-teal-100 group-hover:bg-teal-600 group-hover:text-white',
      arrowButtonHoverStyles:
        'group-hover:bg-teal-600 group-hover:text-white group-hover:border-teal-600',
    },
    {
      id: 're-loan',
      title: 'Re-Loan Configuration',
      description:
        'Configure customer outstanding balance policies and assessment rules for re-loans.',
      category: 'Re-loan',
      icon: RotateCcw,
      route: '/settings/re-loan',
      accentColor: 'bg-blue-500',
      badgeStyles: 'bg-blue-50/90 text-blue-800 border-blue-200/80',
      iconContainerStyles:
        'bg-blue-50 text-blue-700 border-blue-100 group-hover:bg-blue-600 group-hover:text-white',
      arrowButtonHoverStyles:
        'group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600',
    },
  ];

  return (
    <div className="flex flex-col flex-1 min-h-screen w-full max-w-full overflow-x-hidden bg-[#F8FAFC] px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <div className="w-full max-w-6xl mx-auto flex flex-col">
        {/* Settings Page Header */}
        <div className="mb-6 sm:mb-8 pb-5 sm:pb-6 border-b border-slate-200/80">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-[#006052] border border-emerald-100/90 shadow-2xs">
              <Settings className="h-6 w-6 stroke-[2.2]" />
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

        {/* Configuration Cards: Responsive Two-Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 w-full items-stretch">
          {settingsCards.map((card) => {
            const IconComponent = card.icon;
            return (
              <div
                key={card.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(card.route)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(card.route);
                  }
                }}
                className="group relative flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-6 sm:p-7 shadow-xs hover:border-slate-300 hover:shadow-md transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#006052] focus:ring-offset-2 overflow-hidden"
              >
                {/* Small colored accent line along the top edge */}
                <div
                  className={`absolute top-0 left-0 right-0 h-1 ${card.accentColor}`}
                />

                {/* Card Top: Icon & Category Badge */}
                <div>
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border transition-colors duration-200 ${card.iconContainerStyles}`}
                    >
                      <IconComponent className="h-6 w-6 stroke-[2]" />
                    </div>

                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-semibold border ${card.badgeStyles}`}
                    >
                      {card.category}
                    </span>
                  </div>

                  {/* Card Main: Title & Description */}
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 group-hover:text-[#006052] transition-colors duration-200 leading-snug">
                    {card.title}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 font-normal mt-2 leading-relaxed">
                    {card.description}
                  </p>
                </div>

                {/* Card Bottom: Configure Action & Circular Arrow Button */}
                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 group-hover:text-[#006052] transition-colors duration-200">
                    Configure rules
                  </span>

                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-50 border border-slate-200/90 text-slate-400 transition-all duration-200 shadow-2xs ${card.arrowButtonHoverStyles}`}
                  >
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform duration-200" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SettingsOverview;
