import React from 'react';
import { Bike, ShieldAlert, Archive } from 'lucide-react';

/**
 * Summary KPI Cards matching screenshot:
 * 1. Total Vehicles (green icon container, light background)
 * 2. Seized Vehicles (orange-red icon container, light-orange background)
 * 3. Sold Vehicles (grey icon container, light-grey background)
 */
const VehicleSummaryCards = ({
  totalCount = 0,
  seizedCount = 0,
  soldCount = 0,
}) => {
  const cards = [
    {
      title: 'Total Vehicles',
      value: totalCount,
      icon: Bike,
      iconBg: 'bg-emerald-500 text-white',
      cardBg: 'bg-[#F2FAF7] border-emerald-100/80',
    },
    {
      title: 'Seized Vehicles',
      value: seizedCount,
      icon: ShieldAlert,
      iconBg: 'bg-[#EA580C] text-white',
      cardBg: 'bg-[#FFF7ED] border-orange-100/80',
    },
    {
      title: 'Sold Vehicles',
      value: soldCount,
      icon: Archive,
      iconBg: 'bg-slate-500 text-white',
      cardBg: 'bg-[#F8FAFC] border-slate-200/80',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4 w-full">
      {cards.map((card) => {
        const IconComponent = card.icon;
        return (
          <div
            key={card.title}
            className={`rounded-xl border p-4 sm:p-4.5 flex items-center gap-3.5 sm:gap-4 shadow-2xs transition-shadow hover:shadow-xs min-w-0 ${card.cardBg}`}
          >
            <div
              className={`h-11 w-11 rounded-full flex items-center justify-center shrink-0 shadow-2xs ${card.iconBg}`}
            >
              <IconComponent className="h-5 w-5" strokeWidth={2.2} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-600 leading-tight truncate">
                {card.title}
              </p>
              <p className="text-2xl font-extrabold text-slate-900 tracking-tight leading-none mt-1">
                {card.value.toLocaleString('en-IN')}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default VehicleSummaryCards;
