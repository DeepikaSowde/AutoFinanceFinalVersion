import React from 'react';
import { Bike, Plus } from 'lucide-react';
import VehicleCard from './VehicleCard';

/**
 * Responsive Vehicle Card Grid matching reference:
 * - Desktop: 4 cards per row (grid-cols-1 sm:grid-cols-2 lg:grid-cols-4)
 * - Tablet: 2 cards per row
 * - Mobile: 1 card per row
 * - Includes clean empty state if no records match
 */
const VehicleCardGrid = ({ vehicles = [], onViewDetails, onAddVehicle }) => {
  if (vehicles.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200/90 p-12 text-center shadow-2xs w-full flex flex-col items-center justify-center min-h-[320px]">
        <div className="h-14 w-14 rounded-full bg-emerald-50 text-[#006052] flex items-center justify-center mb-3.5 border border-emerald-100/60 shadow-2xs">
          <Bike className="h-7 w-7" strokeWidth={1.8} />
        </div>
        <h3 className="text-base font-bold text-slate-800 tracking-tight">
          No vehicles found
        </h3>
        <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-sm mx-auto">
          No vehicle records match your selected tab or search query.
        </p>
        {onAddVehicle && (
          <button
            type="button"
            onClick={onAddVehicle}
            className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#006052] hover:bg-[#004d42] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>New Loan / Add Vehicle</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 w-full">
      {vehicles.map((record, index) => {
        const key =
          record.vehicleId ||
          record.vehicle?.regNo ||
          record.loanId ||
          `vehicle-${index}`;
        return (
          <VehicleCard
            key={key}
            vehicleRecord={record}
            onViewDetails={onViewDetails}
          />
        );
      })}
    </div>
  );
};

export default VehicleCardGrid;
