import React from 'react';
import { User, Phone, Bike, Car } from 'lucide-react';
import { useVehicleImage } from '../../utils/vehicleImageHelper';
import { getEffectiveVehicleStatus } from '../../utils/vehicleStatusHelper';

/**
 * Status Badge configuration:
 * Active/Normal: blue
 * Seized: orange
 * Released: green
 * Sold: grey
 * Inactive: slate/gray
 */
const STATUS_STYLES = {
  Active: 'bg-[#2563EB] text-white',
  Normal: 'bg-[#2563EB] text-white',
  Seized: 'bg-[#EA580C] text-white',
  Released: 'bg-[#16A34A] text-white',
  Sold: 'bg-[#64748B] text-white',
  Inactive: 'bg-slate-500 text-white',
};

const VehicleCard = ({ vehicleRecord, onViewDetails }) => {
  const vehicle = vehicleRecord.vehicle || {};
  const customer = vehicleRecord.customer || {};

  const regNo = vehicle.regNo || vehicleRecord.regNo || 'Unregistered';
  const makeModel = [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || 'Unknown Model';

  const customerName = customer.name || 'Customer not linked';
  const customerMobile = customer.mobile || 'Mobile not available';

  const status = getEffectiveVehicleStatus(vehicleRecord);
  const badgeStyle = STATUS_STYLES[status] || STATUS_STYLES.Active;

  // Resolves customer uploaded photo if available, otherwise vehicle-type default image
  const { imageSrc, handleImageError } = useVehicleImage(vehicleRecord);

  const isBike = !vehicle.type || vehicle.type === 'Two Wheeler';
  const FallbackIcon = isBike ? Bike : Car;

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-md transition-all duration-200 flex flex-col overflow-hidden min-w-0">
      {/* Top Image Container with Status Badge */}
      <div className="relative w-full h-44 bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center overflow-hidden border-b border-slate-100">
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={makeModel}
            onError={handleImageError}
            className="w-full h-full object-cover object-center transition-transform duration-300 hover:scale-105"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-slate-300 p-4">
            <FallbackIcon className="h-16 w-16 stroke-1 text-slate-300" />
          </div>
        )}

        {/* Top-Right Status Badge */}
        <div className="absolute top-3 right-3 z-10">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide shadow-2xs ${badgeStyle}`}
          >
            {status}
          </span>
        </div>
      </div>

      {/* Card Content */}
      <div className="p-4 sm:p-4.5 flex-1 flex flex-col justify-between space-y-3.5">
        {/* Vehicle Information */}
        <div>
          <h3 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight leading-snug truncate">
            {regNo}
          </h3>
          <p className="text-xs font-medium text-slate-500 mt-0.5 truncate">
            {makeModel}
          </p>
        </div>

        {/* Customer Information */}
        <div className="space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-3">
          <div className="flex items-center gap-2 min-w-0">
            <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span className="truncate font-medium text-slate-700">{customerName}</span>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span className="truncate text-slate-500">{customerMobile}</span>
          </div>
        </div>

        {/* Full-width View Details button with green outline matching screenshot */}
        <button
          type="button"
          onClick={() => onViewDetails(vehicleRecord)}
          className="w-full py-2 px-3 rounded-lg border border-[#006052] text-[#006052] hover:bg-[#006052] hover:text-white text-xs font-bold transition-all duration-150 text-center shadow-2xs active:scale-[0.99] cursor-pointer"
        >
          View Details
        </button>
      </div>
    </div>
  );
};

export default VehicleCard;
