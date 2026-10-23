import React from 'react';
import {
  Bike,
  Car,
  TrendingUp,
  TrendingDown,
  Scale,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  ArrowRight,
  Receipt,
  User,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import { formatDate } from '../../utils/dateUtils';
import { useVehicleImage } from '../../utils/vehicleImageHelper';

const formatINR = (val) => {
  if (val === undefined || val === null || isNaN(Number(val))) return '₹0';
  return `₹${Math.round(Number(val)).toLocaleString('en-IN')}`;
};

const SoldVehicleRow = ({ record, onViewDetails, onViewExpenseHistory }) => {
  const vehicle = record.vehicle || {};
  const customer = record.customer || {};
  const fData = record.foreclosure || {};
  const saleDetails = vehicle.saleDetails || record.saleDetails || {};
  const calc = fData.finalizedCalculation || {};

  const regNo = vehicle.regNo || record.regNo || 'Unregistered';
  const makeModel = [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || 'Unknown Model';
  const customerName = customer.name || record.customerName || 'Customer';
  const customerId = record.customerId || customer.customerId || '—';
  const customerMobile = customer.mobile || '—';

  const saleDate = fData.saleDate || saleDetails.saleDate;
  const saleAmt = Number(fData.salePrice || saleDetails.salePrice || saleDetails.saleAmount || 0);

  // Total Foreclosure Cost
  const totalCost = Number(
    calc.totalForeclosureCost !== undefined
      ? calc.totalForeclosureCost
      : Number(saleDetails.vehicleExpenses || 0)
  );

  // Profit / Loss calculation from saved calculation
  const profitLoss = calc.profitLoss !== undefined ? Number(calc.profitLoss) : saleAmt - totalCost;
  const isProfit = profitLoss > 0;
  const isLoss = profitLoss < 0;
  const isBreakEven = profitLoss === 0;
  const shortfall = calc.shortfall !== undefined ? Number(calc.shortfall) : Math.abs(profitLoss);

  // Settlement Status
  const settlement = fData.settlement || {};
  const settlementStatus = settlement.status || (isBreakEven ? 'Settled' : 'Pending');

  // Vehicle image
  const { imageSrc, handleImageError } = useVehicleImage(record);
  const isBike = !vehicle.type || vehicle.type === 'Two Wheeler';
  const FallbackIcon = isBike ? Bike : Car;

  return (
    <tr className="hover:bg-slate-50/70 transition-colors border-b border-slate-100 text-xs sm:text-sm">
      {/* 1. Vehicle & Photo */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
            {imageSrc ? (
              <img
                src={imageSrc}
                alt={regNo}
                onError={handleImageError}
                className="w-full h-full object-cover"
              />
            ) : (
              <FallbackIcon className="h-5 w-5 text-slate-400" />
            )}
          </div>
          <div className="min-w-0">
            <span className="font-extrabold text-slate-900 block truncate leading-snug">
              {regNo}
            </span>
            <span className="text-[11px] text-slate-500 block truncate">
              {makeModel}
            </span>
          </div>
        </div>
      </td>

      {/* 2. Customer */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <div className="min-w-0">
          <span className="font-bold text-slate-800 block truncate leading-snug">
            {customerName}
          </span>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
            <span className="font-semibold text-slate-600">{customerId}</span>
            {customerMobile !== '—' && (
              <>
                <span>•</span>
                <span>{customerMobile}</span>
              </>
            )}
          </div>
        </div>
      </td>

      {/* 3. Sale Date */}
      <td className="px-4 py-3.5 whitespace-nowrap font-medium text-slate-700">
        {formatDate(saleDate)}
      </td>

      {/* 4. Sale Amount */}
      <td className="px-4 py-3.5 whitespace-nowrap text-right font-bold text-slate-900">
        {formatINR(saleAmt)}
      </td>

      {/* 5. Foreclosure Cost */}
      <td className="px-4 py-3.5 whitespace-nowrap text-right font-semibold text-slate-700">
        {formatINR(totalCost)}
      </td>

      {/* 6. Result: Profit / Loss */}
      <td className="px-4 py-3.5 whitespace-nowrap text-right">
        <div className="flex flex-col items-end gap-0.5">
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
              isProfit
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : isLoss
                  ? 'bg-red-50 text-red-800 border border-red-200'
                  : 'bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            {isProfit ? (
              <TrendingUp className="h-3 w-3 shrink-0" />
            ) : isLoss ? (
              <TrendingDown className="h-3 w-3 shrink-0" />
            ) : (
              <Scale className="h-3 w-3 shrink-0" />
            )}
            <span>{isProfit ? 'Profit' : isLoss ? 'Shortfall' : 'Break-even'}</span>
          </span>
          <span
            className={`font-extrabold text-xs ${
              isProfit ? 'text-emerald-700' : isLoss ? 'text-red-700' : 'text-slate-700'
            }`}
          >
            {isProfit ? `+${formatINR(profitLoss)}` : isLoss ? `-${formatINR(shortfall)}` : '₹0'}
          </span>
        </div>
      </td>

      {/* 7. Settlement Status */}
      <td className="px-4 py-3.5 whitespace-nowrap text-center">
        {settlementStatus === 'Pending' ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs">
            <Clock className="h-3 w-3 text-amber-600" />
            <span>Pending Settlement</span>
          </span>
        ) : settlementStatus === 'Completed' ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            <span>
              {settlement.type === 'payout'
                ? `Paid: ${formatINR(settlement.amount)}`
                : settlement.type === 'recovery'
                  ? `Collected: ${formatINR(settlement.amount)}`
                  : 'Settled'}
            </span>
          </span>
        ) : settlementStatus === 'Waived' ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-50 text-purple-800 border border-purple-200 shadow-2xs">
            <ShieldCheck className="h-3 w-3 text-purple-600" />
            <span>{isLoss ? 'Not Collected' : isProfit ? 'Not Paid' : 'Waived'}</span>
          </span>
        ) : settlementStatus === 'Retained' ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-50 text-purple-800 border border-purple-200 shadow-2xs">
            <ShieldCheck className="h-3 w-3 text-purple-600" />
            <span>Not Paid</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs">
            <span>{settlementStatus}</span>
          </span>
        )}
      </td>

      {/* 8. Actions */}
      <td className="px-4 py-3.5 whitespace-nowrap text-right">
        <div className="flex items-center justify-end gap-1.5">
          {onViewExpenseHistory && (
            <button
              type="button"
              onClick={() => onViewExpenseHistory(record)}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              title="View Expense History"
            >
              <Receipt className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onViewDetails(record)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#006052] hover:bg-[#004d42] text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer"
          >
            <span>View Details</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
};

const SoldVehiclesTable = ({
  vehicles = [],
  onViewDetails,
  onViewExpenseHistory,
}) => {
  if (vehicles.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200/90 p-12 text-center shadow-2xs w-full flex flex-col items-center justify-center min-h-[320px]">
        <div className="h-14 w-14 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center mb-3.5 border border-slate-200 shadow-2xs">
          <Scale className="h-7 w-7 stroke-1" />
        </div>
        <h3 className="text-base font-bold text-slate-800 tracking-tight">
          No Sold Vehicles Found
        </h3>
        <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-sm mx-auto">
          No vehicles have been sold or finalized through foreclosure yet under your active search or filter.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 w-full">
      {/* Table Header Bar */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-slate-900">
            Sold Vehicles &amp; Foreclosure Settlements
          </h2>
          <p className="text-xs text-slate-500">
            Vehicles sold following seizure with finalized foreclosure costs and profit/loss status.
          </p>
        </div>
        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
          {vehicles.length} {vehicles.length === 1 ? 'vehicle' : 'vehicles'} sold
        </span>
      </div>

      {/* Responsive Table Container */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider">
                <th scope="col" className="px-4 py-3">Vehicle</th>
                <th scope="col" className="px-4 py-3">Customer</th>
                <th scope="col" className="px-4 py-3">Sale Date</th>
                <th scope="col" className="px-4 py-3 text-right">Sale Amount</th>
                <th scope="col" className="px-4 py-3 text-right">Foreclosure Cost</th>
                <th scope="col" className="px-4 py-3 text-right">Result (P/L)</th>
                <th scope="col" className="px-4 py-3 text-center">Settlement Status</th>
                <th scope="col" className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vehicles.map((record, index) => {
                const key =
                  record.vehicleId ||
                  record.vehicle?.regNo ||
                  record.loanId ||
                  `sold-vehicle-${index}`;
                return (
                  <SoldVehicleRow
                    key={key}
                    record={record}
                    onViewDetails={onViewDetails}
                    onViewExpenseHistory={onViewExpenseHistory}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SoldVehiclesTable;
