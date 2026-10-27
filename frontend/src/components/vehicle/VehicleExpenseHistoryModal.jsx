import React, { useState, useEffect } from 'react';
import { X, Receipt, Car, Bike, Calendar, Clock, CreditCard, ArrowDownRight } from 'lucide-react';
import { formatDateTime, formatDate, IST_TIMEZONE } from '../../utils/dateUtils';
import { DATA_CHANGED_EVENT } from '../../services/api';
import { loadVehicleExpenses } from '../../services/ledgerApi';

const formatCurrency = (value) => `₹${Math.round(Number(value || 0)).toLocaleString('en-IN')}`;

/**
 * VehicleExpenseHistoryModal
 * 
 * Displays the complete, vehicle-specific expense history for a selected vehicle.
 * - Shows Vehicle Reg No, Make/Model, Customer Name, Customer ID, and Total Recorded Expenses.
 * - Displays a structured table: Date & Time, Description, Amount, Payment Mode, Category.
 * - Sorted newest first.
 * - Reloads after any save.
 */
const VehicleExpenseHistoryModal = ({ isOpen, onClose, vehicleRecord }) => {
  const [expenses, setExpenses] = useState([]);

  useEffect(() => {
    if (!isOpen || !vehicleRecord) return;

    // The Vehicle Expense rows booked against this vehicle (by its server id),
    // newest first; reloaded after any save.
    let active = true;
    const vehicleId = vehicleRecord.vehicle?.vehicleId || '';
    const load = () =>
      loadVehicleExpenses(vehicleId)
        .then((list) => active && setExpenses(list))
        .catch((err) => {
          console.error('Failed to load vehicle expenses:', err);
          if (active) setExpenses([]);
        });

    load();
    window.addEventListener(DATA_CHANGED_EVENT, load);
    return () => {
      active = false;
      window.removeEventListener(DATA_CHANGED_EVENT, load);
    };
  }, [isOpen, vehicleRecord]);

  if (!isOpen || !vehicleRecord) return null;

  const vehicle = vehicleRecord.vehicle || {};
  const customer = vehicleRecord.customer || {};

  const regNo = vehicle.regNo || vehicleRecord.regNo || 'Unregistered';
  const makeModel = [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || 'Vehicle Details';
  const customerName = customer.name || vehicleRecord.customerName || vehicleRecord.name || 'Not Linked';
  const customerId = vehicleRecord.customerId || customer.customerId || '—';

  const totalExpenseAmount = expenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);

  const isBike = !vehicle.type || vehicle.type === 'Two Wheeler';
  const VehicleIcon = isBike ? Bike : Car;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl flex flex-col overflow-hidden max-h-[92vh] border border-slate-100 animate-in fade-in-50 zoom-in-95 duration-150">
        
        {/* =========================================================
            1. MODAL HEADER
        ========================================================= */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 text-[#006052] flex items-center justify-center border border-emerald-100/60 shrink-0">
              <Receipt className="h-5 w-5" strokeWidth={2} />
            </div>
            <div>
              <h2 className="font-bold text-base sm:text-lg text-slate-900 leading-tight">
                Vehicle Expense History
              </h2>
              <p className="text-[12px] text-slate-500 font-medium">
                Detailed transaction records linked to this vehicle
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* =========================================================
            2. VEHICLE SUMMARY CARD
        ========================================================= */}
        <div className="px-5 sm:px-6 py-4 bg-gradient-to-r from-emerald-50/60 via-slate-50/60 to-white border-b border-slate-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 items-center">
            
            {/* Vehicle Info */}
            <div className="lg:col-span-2 min-w-0 flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 shrink-0 shadow-2xs">
                <VehicleIcon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Registration & Model</span>
                <p className="font-extrabold text-sm sm:text-base text-slate-900 truncate tracking-tight">{regNo}</p>
                <p className="text-xs text-slate-500 font-medium truncate">{makeModel}</p>
              </div>
            </div>

            {/* Customer Info */}
            <div className="lg:col-span-2 min-w-0 border-t sm:border-t-0 sm:border-l border-slate-200/80 pt-2 sm:pt-0 sm:pl-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Customer</span>
              <p className="font-bold text-xs sm:text-sm text-slate-800 truncate">{customerName}</p>
              <p className="text-[11px] text-slate-500 font-medium truncate">ID: <span className="font-mono font-semibold text-slate-700">{customerId}</span></p>
            </div>

            {/* Total Expense KPI */}
            <div className="lg:col-span-1 min-w-0 border-t lg:border-t-0 lg:border-l border-slate-200/80 pt-2 lg:pt-0 lg:pl-3 flex flex-col justify-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#006052] block">Total Expenses</span>
              <p className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight leading-tight">
                {formatCurrency(totalExpenseAmount)}
              </p>
              <span className="text-[10px] text-slate-400 font-semibold">{expenses.length} record{expenses.length === 1 ? '' : 's'}</span>
            </div>

          </div>
        </div>

        {/* =========================================================
            3. EXPENSE HISTORY TABLE / LIST
        ========================================================= */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-[220px]">
          {expenses.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-12 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
              <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                <Receipt className="h-6 w-6 stroke-1" />
              </div>
              <h4 className="font-bold text-sm text-slate-800">
                No expenses recorded for this vehicle yet
              </h4>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                Expenses added with category &quot;Vehicle Expense&quot; for this vehicle will automatically appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                    <th className="py-3 px-3 sm:px-4 whitespace-nowrap">Date &amp; Time</th>
                    <th className="py-3 px-3 sm:px-4">Description</th>
                    <th className="py-3 px-3 sm:px-4 whitespace-nowrap">Category</th>
                    <th className="py-3 px-3 sm:px-4 whitespace-nowrap">Payment Mode</th>
                    <th className="py-3 px-3 sm:px-4 whitespace-nowrap text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {expenses.map((exp, idx) => {
                    const formattedDateTime = formatDateTime(exp.createdAt || exp.date, exp);
                    const amount = Number(exp.amount || 0);

                    return (
                      <tr key={exp.id || `veh-exp-${idx}`} className="hover:bg-slate-50/70 transition-colors">
                        {/* Date & Time */}
                        <td className="py-3 px-3 sm:px-4 whitespace-nowrap font-medium text-slate-600">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span>{formattedDateTime}</span>
                          </div>
                        </td>

                        {/* Description */}
                        <td className="py-3 px-3 sm:px-4 text-slate-800">
                          <p className="font-semibold text-slate-800 leading-snug">
                            {exp.remarks || exp.description || 'Vehicle Expense'}
                          </p>
                          {exp.id && (
                            <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                              ID: {exp.id}
                            </span>
                          )}
                        </td>

                        {/* Category */}
                        <td className="py-3 px-3 sm:px-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-200">
                            {exp.category || 'Vehicle Expense'}
                          </span>
                        </td>

                        {/* Payment Mode */}
                        <td className="py-3 px-3 sm:px-4 whitespace-nowrap text-slate-600 font-medium">
                          <span className="inline-flex items-center gap-1">
                            <CreditCard className="h-3 w-3 text-slate-400" />
                            <span>{exp.mode || exp.paymentMode || 'Cash'}</span>
                          </span>
                        </td>

                        {/* Amount */}
                        <td className="py-3 px-3 sm:px-4 whitespace-nowrap text-right font-bold text-red-600 text-xs sm:text-sm">
                          {formatCurrency(amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50/80 border-t-2 border-slate-200 font-bold text-xs sm:text-sm text-slate-900">
                    <td colSpan={4} className="py-3 px-3 sm:px-4 text-right uppercase tracking-wider text-slate-600">
                      Total Vehicle Expenses:
                    </td>
                    <td className="py-3 px-3 sm:px-4 text-right text-base text-red-600 font-extrabold">
                      {formatCurrency(totalExpenseAmount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* =========================================================
            4. MODAL FOOTER
        ========================================================= */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/60">
          <p className="text-[11px] text-slate-500 font-medium">
            Vehicle expenses are linked directly to <span className="font-bold text-slate-700">{regNo}</span>
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 transition-colors shadow-2xs cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};

export default VehicleExpenseHistoryModal;
