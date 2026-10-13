import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Phone,
  CheckCircle2,
  CarFront,
  History,
  AlertTriangle,
  Bike,
  Car,
  Calendar,
  MapPin,
  FileText,
  ChevronLeft,
} from 'lucide-react';

/**
 * Format date for history timeline
 */
const formatDateTime = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDateOnly = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const ActiveVehicleModal = ({ isOpen, onClose, vehicleRecord, onSeizureSuccess }) => {
  // Modal Views: 'details' (main) | 'seize' (seizure form) | 'history' (status history)
  const [currentView, setCurrentView] = useState('details');

  // Image load error fallback
  const [imgError, setImgError] = useState(false);

  // Seizure Form state
  const [seizureDate, setSeizureDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [seizureReason, setSeizureReason] = useState('');
  const [storageLocation, setStorageLocation] = useState('');
  const [vehicleCondition, setVehicleCondition] = useState('Good');
  const [seizureNotes, setSeizureNotes] = useState('');
  const [formErrors, setFormErrors] = useState({});

  // Reset view and errors when modal opens or vehicleRecord changes
  useEffect(() => {
    if (isOpen) {
      setCurrentView('details');
      setImgError(false);
      setSeizureDate(new Date().toISOString().split('T')[0]);
      setSeizureReason('');
      setStorageLocation('');
      setVehicleCondition('Good');
      setSeizureNotes('');
      setFormErrors({});
    }
  }, [isOpen, vehicleRecord]);

  // Handle ESC key and backdrop scroll lock
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (currentView !== 'details') {
          setCurrentView('details');
        } else {
          onClose();
        }
      }
    };

    // Lock background scroll
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, currentView, onClose]);

  if (!isOpen || !vehicleRecord) return null;

  const vehicle = vehicleRecord.vehicle || {};
  const customer = vehicleRecord.customer || {};

  const regNo = vehicle.regNo || vehicleRecord.regNo || 'Unregistered';
  const makeModel = [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || 'Unknown Model';
  const customerName = customer.name || 'Customer not linked';
  const customerMobile = customer.mobile || 'Mobile not available';

  const photoSrc =
    !imgError && (vehicle.photo?.data || vehicle.photo || vehicle.photoFile || vehicleRecord.photo || null);

  const isBike = !vehicle.type || vehicle.type === 'Two Wheeler';
  const FallbackIcon = isBike ? Bike : Car;

  // Retrieve existing status history
  const statusHistory = vehicleRecord.statusHistory || vehicle.statusHistory || [];

  // Seizure submission handler
  const handleConfirmSeizure = (e) => {
    e.preventDefault();

    const errors = {};
    if (!seizureDate) errors.seizureDate = 'Seizure date is required';
    if (!seizureReason.trim()) errors.seizureReason = 'Reason for seizure is required';
    if (!storageLocation.trim()) errors.storageLocation = 'Storage location is required';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    try {
      const customersList = JSON.parse(localStorage.getItem('motoLendCustomersList_data') || '[]');
      const targetLoanId = vehicleRecord.loanId;
      const targetRegNo = vehicle.regNo;

      const newHistoryEntry = {
        fromStatus: 'Active',
        toStatus: 'Seized',
        date: new Date().toISOString(),
        seizureDate,
        reason: seizureReason.trim(),
        storageLocation: storageLocation.trim(),
        condition: vehicleCondition,
        notes: seizureNotes.trim(),
      };

      const updatedCustomers = customersList.map((entry) => {
        const entryReg = entry.vehicle?.regNo;
        const matches =
          (targetLoanId && entry.loanId === targetLoanId) ||
          (targetRegNo && entryReg && entryReg.toLowerCase() === targetRegNo.toLowerCase());

        if (matches) {
          const currentHist = entry.statusHistory || entry.vehicle?.statusHistory || [];
          const updatedHist = [newHistoryEntry, ...currentHist];

          return {
            ...entry,
            vehicleStatus: 'Seized',
            statusHistory: updatedHist,
            vehicle: {
              ...(entry.vehicle || {}),
              status: 'Seized',
              statusHistory: updatedHist,
              seizureDetails: {
                seizureDate,
                reason: seizureReason.trim(),
                storageLocation: storageLocation.trim(),
                condition: vehicleCondition,
                notes: seizureNotes.trim(),
                recordedAt: new Date().toISOString(),
              },
            },
          };
        }
        return entry;
      });

      localStorage.setItem('motoLendCustomersList_data', JSON.stringify(updatedCustomers));
      window.dispatchEvent(new Event('storage'));

      if (onSeizureSuccess) {
        onSeizureSuccess();
      }
      onClose();
    } catch (err) {
      console.error('Failed to mark vehicle as seized:', err);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in-50 duration-150"
      onClick={onClose}
    >
      {/* Modal Dialog Card */}
      <div
        className="relative w-full max-w-[680px] max-h-[85vh] bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden text-slate-800 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Bar with Close (X) button */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-2">
            {currentView !== 'details' && (
              <button
                type="button"
                onClick={() => setCurrentView('details')}
                className="p-1 -ml-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/50 transition-colors cursor-pointer"
                aria-label="Back to vehicle summary"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              {currentView === 'seize'
                ? 'Mark Vehicle as Seized'
                : currentView === 'history'
                ? 'Vehicle Status History'
                : 'Active Vehicle Details'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close popup"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Body Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* =========================================================
              VIEW 1: DETAILS (DEFAULT ACTIVE VEHICLE VIEW)
          ========================================================= */}
          {currentView === 'details' && (
            <>
              {/* 2. Vehicle Summary Section: Compact horizontal layout */}
              <div className="bg-slate-50/80 rounded-xl border border-slate-200/80 p-4 sm:p-4.5 flex flex-col sm:flex-row gap-4 sm:gap-5 items-center sm:items-start">
                {/* Photo / Placeholder */}
                <div className="w-full sm:w-36 h-32 sm:h-28 rounded-lg bg-white border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center shadow-2xs">
                  {photoSrc ? (
                    <img
                      src={photoSrc}
                      alt={makeModel}
                      onError={() => setImgError(true)}
                      className="w-full h-full object-cover object-center"
                    />
                  ) : (
                    <FallbackIcon className="h-12 w-12 text-slate-300 stroke-1" />
                  )}
                </div>

                {/* Information Column */}
                <div className="flex-1 min-w-0 w-full space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight truncate">
                      {regNo}
                    </h3>
                    {/* Active Status Badge */}
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#2563EB] text-white shadow-2xs shrink-0">
                      Active
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm font-semibold text-slate-600 truncate">
                    {makeModel}
                  </p>

                  <div className="pt-2 border-t border-slate-200/60 space-y-1.5 text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="text-slate-500">Customer:</span>
                      <span className="font-semibold text-slate-800 truncate">{customerName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="text-slate-500">Mobile:</span>
                      <span className="font-medium text-slate-700">{customerMobile}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Vehicle Status Section */}
              <div className="rounded-xl border border-emerald-100 bg-[#F0FDF4] p-4 flex items-center gap-3.5 shadow-2xs">
                <div className="h-10 w-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-2xs">
                  <CheckCircle2 className="h-5 w-5" strokeWidth={2.2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900">Vehicle Status</h4>
                    <span className="inline-flex items-center px-2 py-0.2 rounded-full text-[10px] font-bold bg-[#2563EB] text-white">
                      Active
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-emerald-900 font-medium mt-0.5">
                    This vehicle is currently active.
                  </p>
                </div>
              </div>
            </>
          )}

          {/* =========================================================
              VIEW 2: MARK AS SEIZED FORM
          ========================================================= */}
          {currentView === 'seize' && (
            <form onSubmit={handleConfirmSeizure} className="space-y-4">
              <div className="p-3.5 rounded-lg bg-orange-50/80 border border-orange-200/80 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
                <div className="text-xs text-orange-900">
                  <span className="font-bold">Vehicle: {regNo}</span> ({makeModel})
                  <p className="mt-0.5 text-orange-800">
                    Recording a seizure will update this vehicle&apos;s status to <strong>Seized</strong> and create a status audit record.
                  </p>
                </div>
              </div>

              <div className="space-y-3 text-xs sm:text-sm">
                {/* Seizure Date */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Seizure Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={seizureDate}
                    onChange={(e) => setSeizureDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#006052]/20 focus:border-[#006052]"
                  />
                  {formErrors.seizureDate && (
                    <p className="text-[11px] text-rose-500 mt-1">{formErrors.seizureDate}</p>
                  )}
                </div>

                {/* Reason for Seizure */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Reason for Seizure <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={seizureReason}
                    onChange={(e) => setSeizureReason(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#006052]/20 focus:border-[#006052]"
                  >
                    <option value="">Select a reason</option>
                    <option value="Non-Payment / Persistent Default">Non-Payment / Persistent Default</option>
                    <option value="Customer Untraceable">Customer Untraceable</option>
                    <option value="Voluntary Surrender">Voluntary Surrender</option>
                    <option value="Breach of Agreement">Breach of Agreement</option>
                    <option value="Vehicle Misuse / Unauthorized Transfer">Vehicle Misuse / Unauthorized Transfer</option>
                    <option value="Other">Other</option>
                  </select>
                  {formErrors.seizureReason && (
                    <p className="text-[11px] text-rose-500 mt-1">{formErrors.seizureReason}</p>
                  )}
                </div>

                {/* Storage Location */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Storage Location / Yard <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={storageLocation}
                    onChange={(e) => setStorageLocation(e.target.value)}
                    placeholder="e.g. Central Yard, Warehouse #3, Regional Branch"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#006052]/20 focus:border-[#006052]"
                  />
                  {formErrors.storageLocation && (
                    <p className="text-[11px] text-rose-500 mt-1">{formErrors.storageLocation}</p>
                  )}
                </div>

                {/* Vehicle Condition */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Vehicle Condition
                  </label>
                  <select
                    value={vehicleCondition}
                    onChange={(e) => setVehicleCondition(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#006052]/20 focus:border-[#006052]"
                  >
                    <option value="Excellent">Excellent</option>
                    <option value="Good">Good (Minor Wear)</option>
                    <option value="Fair">Fair (Scratch / Dent)</option>
                    <option value="Poor">Poor (Accidental / Damaged)</option>
                    <option value="Non-Running">Non-Running / Mechanical Issue</option>
                  </select>
                </div>

                {/* Additional Notes */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Notes / Remarks (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={seizureNotes}
                    onChange={(e) => setSeizureNotes(e.target.value)}
                    placeholder="Provide additional details regarding repossession, keys, meter reading, or belongings..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#006052]/20 focus:border-[#006052]"
                  />
                </div>
              </div>

              {/* Form Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setCurrentView('details')}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto px-5 py-2 rounded-lg bg-[#EA580C] hover:bg-[#c2410c] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <CarFront className="h-4 w-4" />
                  <span>Confirm Seizure</span>
                </button>
              </div>
            </form>
          )}

          {/* =========================================================
              VIEW 3: STATUS HISTORY VIEW
          ========================================================= */}
          {currentView === 'history' && (
            <div className="space-y-4">
              {statusHistory.length === 0 ? (
                <div className="py-12 px-4 text-center rounded-xl bg-slate-50/80 border border-slate-100">
                  <div className="h-10 w-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2.5">
                    <History className="h-5 w-5" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-700">No status changes recorded</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                    This vehicle has maintained its initial Active status since onboarding.
                  </p>
                </div>
              ) : (
                <div className="relative pl-6 border-l-2 border-slate-200 space-y-6">
                  {statusHistory.map((item, idx) => (
                    <div key={idx} className="relative">
                      {/* Timeline Bullet */}
                      <div className="absolute -left-[31px] top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#006052] shadow-xs" />

                      <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/80 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-900">
                            {item.fromStatus} → {item.toStatus}
                          </span>
                          <span className="text-[11px] text-slate-500 font-medium">
                            {formatDateTime(item.date)}
                          </span>
                        </div>

                        {item.reason && (
                          <p className="text-slate-600">
                            <span className="font-semibold text-slate-700">Reason:</span> {item.reason}
                          </p>
                        )}
                        {item.storageLocation && (
                          <p className="text-slate-600">
                            <span className="font-semibold text-slate-700">Storage:</span>{' '}
                            {item.storageLocation}
                          </p>
                        )}
                        {item.condition && (
                          <p className="text-slate-600">
                            <span className="font-semibold text-slate-700">Condition:</span>{' '}
                            {item.condition}
                          </p>
                        )}
                        {item.notes && (
                          <p className="text-slate-500 italic mt-1 pt-1 border-t border-slate-200/60">
                            &quot;{item.notes}&quot;
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setCurrentView('details')}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Back to Details
                </button>
              </div>
            </div>
          )}
        </div>

        {/* =========================================================
            4. ACTIONS FOOTER (ONLY IN MAIN DETAILS VIEW)
        ========================================================= */}
        {currentView === 'details' && (
          <div className="px-5 sm:px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 shrink-0">
            {/* Secondary Button: View Status History */}
            <button
              type="button"
              onClick={() => setCurrentView('history')}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-[#006052] bg-white text-[#006052] hover:bg-emerald-50/60 text-xs sm:text-sm font-bold shadow-2xs transition-colors cursor-pointer order-2 sm:order-1"
            >
              <History className="h-4 w-4" />
              <span>View Status History</span>
            </button>

            {/* Primary Button: Mark as Seized */}
            <button
              type="button"
              onClick={() => setCurrentView('seize')}
              className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-lg bg-[#006052] hover:bg-[#004d42] text-white text-xs sm:text-sm font-bold shadow-xs transition-colors cursor-pointer order-1 sm:order-2"
            >
              <CarFront className="h-4 w-4" />
              <span>Mark as Seized</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActiveVehicleModal;
