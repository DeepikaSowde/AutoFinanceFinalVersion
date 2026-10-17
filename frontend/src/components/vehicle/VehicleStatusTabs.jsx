import React from 'react';

/**
 * Status Navigation Tabs matching MotoLend reference styling:
 * - All Vehicles (active default with dark green background #006052 / emerald-800)
 * - Seized
 * - Released
 * - Sold
 * Inactive tabs have subtle light-grey background
 */
const VehicleStatusTabs = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: 'all', label: 'All Vehicles' },
    { id: 'seized', label: 'Seized' },
    { id: 'sold', label: 'Sold' },
    { id: 'inactive', label: 'Inactive' },
  ];

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`px-4 sm:px-5 py-2 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-all duration-200 cursor-pointer ${
              isActive
                ? 'bg-[#006052] text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};

export default VehicleStatusTabs;
