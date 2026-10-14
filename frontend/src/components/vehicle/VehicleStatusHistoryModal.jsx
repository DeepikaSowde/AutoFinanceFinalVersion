import React, { useEffect, useMemo } from 'react';
import {
  X,
  History,
  CheckCircle2,
  ShieldAlert,
  KeyRound,
  DollarSign,
  Calendar,
  User,
  MapPin,
  Clock,
  Car,
  Bike,
  FileText,
  Tag,
  ArrowRight,
} from 'lucide-react';

/**
 * Format timestamp into human-readable string
 */
const formatDateTime = (dateStr) => {
  if (!dateStr) return 'Not recorded';
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
  if (!dateStr) return 'Not recorded';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const formatCurrency = (val) => {
  if (val === undefined || val === null || isNaN(Number(val))) return null;
  return `₹${Math.round(Number(val)).toLocaleString('en-IN')}`;
};

/**
 * Builds a chronological list of events for a vehicle starting from its initial Active status
 */
export const getChronologicalVehicleHistory = (vehicleRecord) => {
  if (!vehicleRecord) return [];

  const vehicle = vehicleRecord.vehicle || {};
  const customer = vehicleRecord.customer || {};
  const loan = vehicleRecord.loan || {};

  const currentStatusRaw = (vehicleRecord.vehicleStatus || vehicle.status || 'Active').trim();
  const normalizedCurrentStatus = currentStatusRaw.toLowerCase() === 'released' ? 'Active' : currentStatusRaw;

  const rawHistory = Array.isArray(vehicleRecord.statusHistory)
    ? vehicleRecord.statusHistory
    : Array.isArray(vehicle.statusHistory)
    ? vehicle.statusHistory
    : [];

  const timeline = [];

  // 1. Initial Creation / Active Event
  const hasCreation = rawHistory.some((h) => h.eventType === 'initial' || h.eventType === 'created');

  if (!hasCreation) {
    const initialDate =
      vehicle.regDate ||
      loan.disbursementDate ||
      customer.applicationDate ||
      vehicleRecord.applicationDate ||
      vehicleRecord.createdAt ||
      'Initial Onboarding';

    timeline.push({
      id: 'evt-initial',
      eventType: 'initial',
      fromStatus: null,
      toStatus: 'Active',
      statusBadge: 'Active',
      badgeColor: 'bg-[#2563EB] text-white',
      title: 'Vehicle Registered & Activated',
      eventDate: initialDate,
      date: vehicleRecord.createdAt || loan.disbursementDate || '1970-01-01T00:00:00.000Z',
      reason: 'Vehicle onboarding completed and initial status set to Active',
      notes: vehicleRecord.loanId ? `Linked with Loan ID: ${vehicleRecord.loanId}` : 'Vehicle active in fleet',
      customerName: customer.name || 'Customer',
      vehicleDetails: `${vehicle.regNo || 'Unregistered'} • ${[vehicle.brand, vehicle.model].filter(Boolean).join(' ')}`,
      performedBy: 'System',
    });
  }

  // 2. Map rawHistory entries
  rawHistory.forEach((item, index) => {
    const eventType = item.eventType || (
      item.toStatus === 'Seized'
        ? 'seizure'
        : item.toStatus === 'Released' || (item.toStatus === 'Active' && item.fromStatus === 'Seized')
        ? 'release'
        : item.toStatus === 'Sold'
        ? 'sale'
        : 'status_change'
    );

    const fromStatus = item.fromStatus || (eventType === 'seizure' ? 'Active' : eventType === 'release' ? 'Seized' : 'Active');
    let toStatus = item.toStatus || (eventType === 'seizure' ? 'Seized' : eventType === 'release' ? 'Active' : 'Active');
    if (toStatus.toLowerCase() === 'released') toStatus = 'Active';

    let title = 'Status Updated';
    let badgeColor = 'bg-slate-600 text-white';
    let statusBadge = toStatus;

    if (eventType === 'seizure' || toStatus === 'Seized') {
      title = 'Vehicle Seized';
      statusBadge = 'Seized';
      badgeColor = 'bg-[#EA580C] text-white';
    } else if (eventType === 'release' || (toStatus === 'Active' && fromStatus === 'Seized')) {
      title = 'Vehicle Released';
      statusBadge = 'Active (Released)';
      badgeColor = 'bg-[#006052] text-white';
    } else if (eventType === 'sale' || toStatus === 'Sold') {
      title = 'Vehicle Sold';
      statusBadge = 'Sold';
      badgeColor = 'bg-[#64748B] text-white';
    } else if (eventType === 'initial' || eventType === 'created') {
      title = 'Vehicle Registered & Activated';
      statusBadge = 'Active';
      badgeColor = 'bg-[#2563EB] text-white';
    }

    timeline.push({
      id: `evt-${index}-${item.date || index}`,
      eventType,
      fromStatus,
      toStatus,
      statusBadge,
      badgeColor,
      title,
      eventDate: item.seizureDate || item.releaseDate || item.saleDate || item.date,
      date: item.date || item.seizureDate || item.releaseDate || item.saleDate || new Date().toISOString(),
      reason: item.reason,
      storageLocation: item.storageLocation,
      condition: item.condition,
      releasedTo: item.releasedTo || item.recipient,
      clearedAmount: item.clearedAmount,
      salePrice: item.salePrice,
      buyerName: item.buyerName,
      buyerPhone: item.buyerPhone,
      proceedsReceived: item.proceedsReceived,
      notes: item.notes,
      performedBy: item.performedBy || 'Admin',
    });
  });

  // Sort in chronological order (oldest to newest)
  // Ensure the initial creation event is always first
  timeline.sort((a, b) => {
    if (a.eventType === 'initial') return -1;
    if (b.eventType === 'initial') return 1;
    const timeA = new Date(a.date).getTime() || 0;
    const timeB = new Date(b.date).getTime() || 0;
    return timeA - timeB;
  });

  return timeline;
};

const VehicleStatusHistoryModal = ({ isOpen, onClose, vehicleRecord }) => {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const vehicle = vehicleRecord?.vehicle || {};
  const customer = vehicleRecord?.customer || {};

  const regNo = vehicle.regNo || vehicleRecord?.regNo || 'Unregistered';
  const makeModel = [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || 'Unknown Vehicle';
  const customerName = customer.name || 'Not linked';

  // Read actual current status (normalized)
  const currentStatusRaw = (vehicleRecord?.vehicleStatus || vehicle.status || 'Active').trim();
  const currentStatus = currentStatusRaw.toLowerCase() === 'released' ? 'Active' : currentStatusRaw;

  // Build full timeline
  const timeline = useMemo(() => {
    return getChronologicalVehicleHistory(vehicleRecord);
  }, [vehicleRecord]);

  if (!isOpen || !vehicleRecord) return null;

  const isBike = !vehicle.type || vehicle.type === 'Two Wheeler';
  const VehicleIcon = isBike ? Bike : Car;

  const currentStatusConfig = {
    Active: {
      badgeBg: 'bg-[#006052] text-white',
      borderBg: 'border-emerald-200 bg-[#F0FDF4]',
      cardBg: 'bg-emerald-500 text-white',
      desc: 'Vehicle is currently operational and in active service with customer.',
    },
    Seized: {
      badgeBg: 'bg-[#EA580C] text-white',
      borderBg: 'border-orange-200 bg-[#FFF7ED]',
      cardBg: 'bg-[#EA580C] text-white',
      desc: 'Vehicle is currently seized and placed in repossession custody.',
    },
    Sold: {
      badgeBg: 'bg-slate-700 text-white',
      borderBg: 'border-slate-200 bg-slate-50',
      cardBg: 'bg-slate-700 text-white',
      desc: 'Vehicle was seized, sold, and liquidated.',
    },
  }[currentStatus] || {
    badgeBg: 'bg-[#006052] text-white',
    borderBg: 'border-emerald-200 bg-[#F0FDF4]',
    cardBg: 'bg-emerald-500 text-white',
    desc: 'Vehicle is currently active.',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in-50 duration-150"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden text-slate-800 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* =========================================================
            HEADER BAR
        ========================================================= */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100 bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-emerald-100 text-[#006052] flex items-center justify-center shadow-2xs">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight leading-tight">
                Vehicle Status History
              </h2>
              <p className="text-xs text-slate-500 leading-tight mt-0.5">
                {regNo} • {makeModel}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* =========================================================
            SCROLLABLE BODY
        ========================================================= */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* =========================================================
              1. SEPARATE CURRENT STATUS CARD
              (Requirement: Display the current vehicle status separately from historical events)
          ========================================================= */}
          <div className={`rounded-xl border p-4 sm:p-4.5 ${currentStatusConfig.borderBg} shadow-2xs`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={`h-11 w-11 rounded-full flex items-center justify-center shrink-0 shadow-2xs ${currentStatusConfig.cardBg}`}
                >
                  <VehicleIcon className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-600">Current Status:</span>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-extrabold shadow-2xs ${currentStatusConfig.badgeBg}`}
                    >
                      {currentStatus}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 font-medium mt-1">
                    {currentStatusConfig.desc}
                  </p>
                </div>
              </div>

              <div className="sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200/60 text-xs">
                <span className="text-slate-500 block">Linked Customer:</span>
                <span className="font-bold text-slate-900">{customerName}</span>
              </div>
            </div>
          </div>

          {/* =========================================================
              2. CHRONOLOGICAL TIMELINE
          ========================================================= */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <Clock className="h-4 w-4 text-[#006052]" />
                <span>Complete Status Timeline (Chronological)</span>
              </h3>
              <span className="text-xs text-slate-500">
                {timeline.length} {timeline.length === 1 ? 'event recorded' : 'events recorded'}
              </span>
            </div>

            <div className="relative pl-6 sm:pl-7 border-l-2 border-slate-200 space-y-6">
              {timeline.map((event, idx) => {
                const isLatest = idx === timeline.length - 1;

                let NodeIcon = CheckCircle2;
                let nodeBg = 'bg-blue-600';

                if (event.eventType === 'seizure' || event.toStatus === 'Seized') {
                  NodeIcon = ShieldAlert;
                  nodeBg = 'bg-[#EA580C]';
                } else if (event.eventType === 'release' || event.statusBadge.includes('Released')) {
                  NodeIcon = KeyRound;
                  nodeBg = 'bg-[#006052]';
                } else if (event.eventType === 'sale' || event.toStatus === 'Sold') {
                  NodeIcon = DollarSign;
                  nodeBg = 'bg-slate-700';
                } else if (event.eventType === 'initial') {
                  NodeIcon = CheckCircle2;
                  nodeBg = 'bg-[#2563EB]';
                }

                return (
                  <div key={event.id || idx} className="relative group">
                    {/* Timeline Node Bullet */}
                    <div
                      className={`absolute -left-[31px] sm:-left-[35px] top-1.5 h-6 w-6 rounded-full border-2 border-white shadow-xs flex items-center justify-center text-white ${nodeBg}`}
                    >
                      <NodeIcon className="h-3.5 w-3.5" />
                    </div>

                    {/* Event Card */}
                    <div
                      className={`bg-white rounded-xl border p-4 shadow-2xs space-y-2 transition-shadow hover:shadow-xs ${
                        isLatest ? 'border-emerald-200 ring-1 ring-emerald-500/20' : 'border-slate-200'
                      }`}
                    >
                      {/* Top Header of Card */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs sm:text-sm font-extrabold text-slate-900">
                            {event.title}
                          </span>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${event.badgeColor}`}
                          >
                            {event.statusBadge}
                          </span>
                          {isLatest && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-100 text-[#006052]">
                              Current State
                            </span>
                          )}
                        </div>

                        <span className="text-[11px] font-medium text-slate-500">
                          {formatDateTime(event.date)}
                        </span>
                      </div>

                      {/* Transition Pill (from → to) */}
                      {event.fromStatus && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 pt-0.5">
                          <span className="font-semibold text-slate-500">Transition:</span>
                          <span className="font-bold text-slate-700">{event.fromStatus}</span>
                          <ArrowRight className="h-3 w-3 text-slate-400" />
                          <span className="font-bold text-[#006052]">{event.toStatus}</span>
                        </div>
                      )}

                      {/* Event Specific Attributes Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-slate-600 pt-1">
                        {/* Seizure Event Details */}
                        {event.eventType === 'seizure' && (
                          <>
                            {event.eventDate && (
                              <div>
                                <span className="text-slate-500">Seizure Date:</span>{' '}
                                <span className="font-semibold text-slate-800">{formatDateOnly(event.eventDate)}</span>
                              </div>
                            )}
                            {event.reason && (
                              <div>
                                <span className="text-slate-500">Reason:</span>{' '}
                                <span className="font-semibold text-slate-800">{event.reason}</span>
                              </div>
                            )}
                            {event.storageLocation && (
                              <div>
                                <span className="text-slate-500">Storage Location:</span>{' '}
                                <span className="font-semibold text-slate-800">{event.storageLocation}</span>
                              </div>
                            )}
                            {event.condition && (
                              <div>
                                <span className="text-slate-500">Condition:</span>{' '}
                                <span className="font-semibold text-slate-800">{event.condition}</span>
                              </div>
                            )}
                          </>
                        )}

                        {/* Release Event Details */}
                        {event.eventType === 'release' && (
                          <>
                            {event.eventDate && (
                              <div>
                                <span className="text-slate-500">Release Date:</span>{' '}
                                <span className="font-semibold text-slate-800">{formatDateOnly(event.eventDate)}</span>
                              </div>
                            )}
                            {event.releasedTo && (
                              <div>
                                <span className="text-slate-500">Released To / Recipient:</span>{' '}
                                <span className="font-bold text-slate-900">{event.releasedTo}</span>
                              </div>
                            )}
                            {event.clearedAmount && (
                              <div>
                                <span className="text-slate-500">Settled Amount:</span>{' '}
                                <span className="font-semibold text-emerald-700">
                                  {formatCurrency(event.clearedAmount)}
                                </span>
                              </div>
                            )}
                          </>
                        )}

                        {/* Sale Event Details */}
                        {event.eventType === 'sale' && (
                          <>
                            {event.eventDate && (
                              <div>
                                <span className="text-slate-500">Sale Date:</span>{' '}
                                <span className="font-semibold text-slate-800">{formatDateOnly(event.eventDate)}</span>
                              </div>
                            )}
                            {event.salePrice && (
                              <div>
                                <span className="text-slate-500">Sale Price:</span>{' '}
                                <span className="font-extrabold text-slate-900">
                                  {formatCurrency(event.salePrice)}
                                </span>
                              </div>
                            )}
                            {event.buyerName && (
                              <div>
                                <span className="text-slate-500">Buyer:</span>{' '}
                                <span className="font-semibold text-slate-800">
                                  {event.buyerName} {event.buyerPhone ? `(${event.buyerPhone})` : ''}
                                </span>
                              </div>
                            )}
                            {event.proceedsReceived && (
                              <div>
                                <span className="text-slate-500">Proceeds:</span>{' '}
                                <span className="font-semibold text-emerald-700">
                                  {formatCurrency(event.proceedsReceived)}
                                </span>
                              </div>
                            )}
                          </>
                        )}

                        {/* Initial Onboarding Details */}
                        {event.eventType === 'initial' && (
                          <>
                            <div>
                              <span className="text-slate-500">Registration Date:</span>{' '}
                              <span className="font-semibold text-slate-800">{formatDateOnly(event.eventDate)}</span>
                            </div>
                            <div>
                              <span className="text-slate-500">Initial Status:</span>{' '}
                              <span className="font-bold text-[#2563EB]">Active</span>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Event Notes Callout */}
                      {event.notes && (
                        <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-600 bg-slate-50/70 p-2.5 rounded-lg">
                          <span className="font-semibold text-slate-700">Notes:</span> {event.notes}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* =========================================================
            FOOTER BAR
        ========================================================= */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-[#006052] hover:bg-[#004d42] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
          >
            Close History
          </button>
        </div>
      </div>
    </div>
  );
};

export default VehicleStatusHistoryModal;
