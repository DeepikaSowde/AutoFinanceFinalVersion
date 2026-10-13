import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check } from 'lucide-react';
import { VEHICLE_TYPES } from '../../../Options';

/**
 * Search Bar and Vehicle-Type Filter matching reference screenshot:
 * - Search by registration number, customer name or mobile number...
 * - Custom Vehicle Type dropdown with All Vehicle Types reset option
 */
const VehicleSearchAndFilter = ({
  searchQuery,
  onSearchChange,
  selectedType,
  onTypeChange,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const typeOptions = ['All Vehicle Types', ...(VEHICLE_TYPES || ['Two Wheeler', 'Three Wheeler', 'Four Wheeler'])];

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full">
      {/* Search Input Container */}
      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by registration number, customer name or mobile number..."
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 bg-white text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#006052]/20 focus:border-[#006052] transition-colors shadow-2xs"
        />
      </div>

      {/* Vehicle Type Dropdown Filter */}
      <div className="relative shrink-0 sm:w-56" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setDropdownOpen((prev) => !prev)}
          className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg border border-slate-200 bg-white text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#006052]/20 focus:border-[#006052] transition-colors shadow-2xs cursor-pointer"
        >
          <span className="truncate">{selectedType || 'All Vehicle Types'}</span>
          <ChevronDown
            className={`h-4 w-4 text-slate-400 shrink-0 transition-transform duration-200 ${
              dropdownOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {dropdownOpen && (
          <div className="absolute right-0 top-full mt-1.5 w-full bg-white rounded-lg border border-slate-200 shadow-lg py-1 z-30 animate-in fade-in-50 zoom-in-95 duration-150">
            {typeOptions.map((opt) => {
              const isSelected =
                (opt === 'All Vehicle Types' && (!selectedType || selectedType === 'All Vehicle Types')) ||
                selectedType === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    onTypeChange(opt === 'All Vehicle Types' ? 'All Vehicle Types' : opt);
                    setDropdownOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2 text-xs sm:text-sm text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-50 text-[#006052] font-semibold'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="truncate">{opt}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 text-[#006052] shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default VehicleSearchAndFilter;
