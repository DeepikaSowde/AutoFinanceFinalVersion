import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowLeft,
  Car,
  Bike,
  User,
  Phone,
  Calendar,
  AlertCircle,
  FileCheck,
  FileText,
  ShieldCheck,
  Banknote,
  Edit,
  Tag,
  Check,
  History,
  KeyRound,
  DollarSign,
  MapPin,
  Clock,
  CarFront,
  ShieldAlert,
  AlertTriangle,
  X,
} from 'lucide-react';
import { calculateVehicleLoanOverdue } from '../../utils/vehicleOverdueCalculation';
import { DATA_CHANGED_EVENT } from '../../services/api';
import { loadCustomerEntries } from '../../services/customerApi';
import { loadPayments } from '../../services/collectionApi';
import { releaseVehicle, sellVehicle, updateSeizure } from '../../services/vehicleApi';

const formatCurrency = (val) => {
  if (val === undefined || val === null || isNaN(Number(val))) return '₹0';
  return `₹${Math.round(Number(val)).toLocaleString('en-IN')}`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return 'Not recorded';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

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

const STATUS_BADGES = {
  Active: 'bg-[#2563EB] text-white',
  Normal: 'bg-[#2563EB] text-white',
  Seized: 'bg-[#EA580C] text-white',
  Released: 'bg-[#16A34A] text-white',
  Sold: 'bg-[#64748B] text-white',
};

const FieldItem = ({ label, value }) => (
  <div className="py-2.5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs sm:text-sm">
    <span className="text-slate-500 font-medium">{label}</span>
    <span className="font-semibold text-slate-800 text-left sm:text-right break-words">{value || 'Not recorded'}</span>
  </div>
);

const VehicleDetailsView = ({ vehicleRecord, onBack }) => {
  // Current live vehicle data
  const [record, setRecord] = useState(vehicleRecord);
  const [allPayments, setAllPayments] = useState([]);
  const [imgError, setImgError] = useState(false);

  // Modal states for Seized Vehicle Actions
  const [activeModal, setActiveModal] = useState(null); // 'release' | 'sold' | 'editSeizure' | null

  // Release Form State
  const [releaseDate, setReleaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [releaseReason, setReleaseReason] = useState('Payment Cleared');
  const [clearedAmount, setClearedAmount] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');

  // Sale Form State
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0]);
  const [salePrice, setSalePrice] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [proceedsReceived, setProceedsReceived] = useState('');
  const [saleNotes, setSaleNotes] = useState('');

  // Edit Seizure Form State
  const [editSeizureDate, setEditSeizureDate] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editStorageLocation, setEditStorageLocation] = useState('');
  const [editCondition, setEditCondition] = useState('Good');
  const [editNotes, setEditNotes] = useState('');

  const [formErrors, setFormErrors] = useState({});

  // Sync with prop
  useEffect(() => {
    setRecord(vehicleRecord);
  }, [vehicleRecord]);

  // Latest payments and vehicle record from the API.
  const refreshData = async () => {
    try {
      const [entries, payments] = await Promise.all([loadCustomerEntries(), loadPayments()]);
      setAllPayments(payments);

      const targetLoanId = vehicleRecord?.loanId;
      const targetRegNo = vehicleRecord?.vehicle?.regNo;
      const found = entries.find((entry) => {
        const entryReg = entry.vehicle?.regNo;
        return (
          (targetLoanId && entry.loanId === targetLoanId) ||
          (targetRegNo && entryReg && entryReg.toLowerCase() === targetRegNo.toLowerCase())
        );
      });

      if (found) {
        setRecord((prev) => ({
          ...prev,
          ...found,
          vehicle: {
            ...(prev.vehicle || {}),
            ...(found.vehicle || {}),
          },
        }));
      }
    } catch (err) {
      console.error('Failed to refresh vehicle data:', err);
    }
  };

  useEffect(() => {
    refreshData();
    window.addEventListener(DATA_CHANGED_EVENT, refreshData);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, refreshData);
  }, [vehicleRecord]);

  const vehicle = record?.vehicle || {};
  const customer = record?.customer || {};
  const loan = record?.loan || {};

  const currentStatus = (record?.vehicleStatus || vehicle?.status || 'Seized').trim();
  const isSeized = currentStatus.toLowerCase() === 'seized';

  const regNo = vehicle.regNo || record?.regNo || 'Unregistered';
  const makeModel = [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || 'Unknown Vehicle';
  const customerName = customer.name || 'Not linked';
  const customerMobile = customer.mobile || 'Not available';

  const photoSrc =
    !imgError && (vehicle.photo?.data || vehicle.photo || vehicle.photoFile || record?.photo || null);

  const isBike = !vehicle.type || vehicle.type === 'Two Wheeler';
  const FallbackIcon = isBike ? Bike : Car;

  // Retrieve seizure details from record
  const seizureDetails =
    vehicle.seizureDetails ||
    record?.seizureDetails ||
    (record?.statusHistory || []).find((h) => h.toStatus === 'Seized') ||
    {};

  // Status history list
  const statusHistory = useMemo(() => {
    const list = record?.statusHistory || vehicle.statusHistory || [];
    return Array.isArray(list) ? list : [];
  }, [record, vehicle]);

  // Calculate Overdue Details strictly from linked customer and loan schedule
  const overdueInfo = useMemo(() => {
    return calculateVehicleLoanOverdue(record, allPayments);
  }, [record, allPayments]);

  // Handle open Edit Seizure
  const handleOpenEditSeizure = () => {
    setEditSeizureDate(seizureDetails.seizureDate || seizureDetails.date?.split('T')[0] || new Date().toISOString().split('T')[0]);
    setEditReason(seizureDetails.reason || '');
    setEditStorageLocation(seizureDetails.storageLocation || '');
    setEditCondition(seizureDetails.condition || 'Good');
    setEditNotes(seizureDetails.notes || '');
    setFormErrors({});
    setActiveModal('editSeizure');
  };

  // Handle open Release modal
  const handleOpenRelease = () => {
    setReleaseDate(new Date().toISOString().split('T')[0]);
    setReleaseReason('Payment Cleared');
    setClearedAmount(overdueInfo.overdueAmount > 0 ? String(overdueInfo.overdueAmount) : '');
    setReleaseNotes('');
    setFormErrors({});
    setActiveModal('release');
  };

  // Handle open Sold modal
  const handleOpenSold = () => {
    setSaleDate(new Date().toISOString().split('T')[0]);
    setSalePrice('');
    setBuyerName('');
    setBuyerPhone('');
    setProceedsReceived('');
    setSaleNotes('');
    setFormErrors({});
    setActiveModal('sold');
  };

  // Save Edit Seizure Details
  const handleSaveEditSeizure = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!editSeizureDate) errors.editSeizureDate = 'Seizure date is required';
    if (!editReason.trim()) errors.editReason = 'Reason for seizure is required';
    if (!editStorageLocation.trim()) errors.editStorageLocation = 'Storage location is required';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    try {
      await updateSeizure((vehicle.vehicleId || record.vehicleId), {
        seizureDate: editSeizureDate,
        reason: editReason.trim(),
        storageLocation: editStorageLocation.trim(),
        condition: editCondition,
        notes: editNotes.trim(),
      });
      setActiveModal(null);
    } catch (err) {
      alert(err.message || 'Could not update the seizure details.');
    }
  };

  // Save Release Vehicle
  const handleConfirmRelease = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!releaseDate) errors.releaseDate = 'Release date is required';
    if (!releaseReason.trim()) errors.releaseReason = 'Release reason is required';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    try {
      await releaseVehicle((vehicle.vehicleId || record.vehicleId), {
        releaseDate,
        reason: releaseReason.trim(),
        clearedAmount: clearedAmount ? Number(clearedAmount) : null,
        notes: releaseNotes.trim(),
      });
      setActiveModal(null);
    } catch (err) {
      alert(err.message || 'Could not release the vehicle.');
    }
  };

  // Save Mark as Sold
  const handleConfirmSold = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!saleDate) errors.saleDate = 'Sale date is required';
    if (!salePrice || isNaN(Number(salePrice)) || Number(salePrice) <= 0) {
      errors.salePrice = 'Valid sale price is required';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    try {
      // Selling forecloses the loan; the server works out the shortfall or
      // surplus against what is still owed.
      await sellVehicle((vehicle.vehicleId || record.vehicleId), {
        saleDate,
        salePrice,
        buyerName: buyerName.trim(),
        buyerPhone: buyerPhone.trim(),
        proceedsReceived,
        notes: saleNotes.trim(),
      });
      setActiveModal(null);
    } catch (err) {
      alert(err.message || 'Could not record the sale.');
    }
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in-50 duration-200">
      {/* Top Breadcrumb / Back button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#006052] hover:text-[#004d42] transition-colors cursor-pointer w-fit"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Vehicle Management</span>
        </button>

        {/* Current Status Pill */}
        <div className="inline-flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">Current Status:</span>
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold shadow-2xs ${
              STATUS_BADGES[currentStatus] || STATUS_BADGES.Seized
            }`}
          >
            {currentStatus}
          </span>
        </div>
      </div>

      {/* =========================================================
          1. COMPACT VEHICLE SUMMARY (No redundant specifications)
      ========================================================= */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-5 sm:p-6 flex flex-col md:flex-row gap-6 items-start">
        {/* Photo Container */}
        <div className="w-full md:w-52 h-44 md:h-36 rounded-xl bg-slate-50 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center shadow-2xs">
          {photoSrc ? (
            <img
              src={photoSrc}
              alt={makeModel}
              onError={() => setImgError(true)}
              className="w-full h-full object-cover object-center"
            />
          ) : (
            <FallbackIcon className="h-16 w-16 text-slate-300 stroke-1" />
          )}
        </div>

        {/* Header Details */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              {regNo}
            </h1>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold shadow-2xs ${
                STATUS_BADGES[currentStatus] || STATUS_BADGES.Seized
              }`}
            >
              {currentStatus}
            </span>
          </div>
          <p className="text-sm font-semibold text-slate-600">{makeModel}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-100 text-xs sm:text-sm">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-slate-400 shrink-0" />
              <span className="text-slate-500">Linked Customer:</span>
              <span className="font-semibold text-slate-800 truncate">
                {customerName}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-slate-400 shrink-0" />
              <span className="text-slate-500">Customer Mobile:</span>
              <span className="font-semibold text-slate-800">
                {customerMobile}
              </span>
            </div>
            {record.loanId && (
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                <span className="text-slate-500">Loan ID:</span>
                <span className="font-semibold text-slate-800">
                  {record.loanId}
                </span>
              </div>
            )}
            {record.customerId && (
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-slate-400 shrink-0" />
                <span className="text-slate-500">Customer ID:</span>
                <span className="font-semibold text-slate-800">
                  {record.customerId}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* =========================================================
          2 & 3. SEIZURE DETAILS & OVERDUE SECTION (For Seized Status)
      ========================================================= */}
      {isSeized ? (
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
          {/* Section Header */}
          <div className="px-5 sm:px-6 py-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-orange-100 text-[#EA580C] flex items-center justify-center">
                <ShieldAlert className="h-4.5 w-4.5" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
                  Seizure Details
                </h2>
                <p className="text-xs text-slate-500">
                  Current repossession status, overdue metrics, and storage info
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleOpenEditSeizure}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            >
              <Edit className="h-3.5 w-3.5 text-slate-500" />
              <span>Edit Details</span>
            </button>
          </div>

          <div className="p-5 sm:p-6 space-y-6">
            {/* 2-Column Responsive Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1">
              <FieldItem
                label="Seizure Date"
                value={formatDate(seizureDetails.seizureDate || seizureDetails.date)}
              />
              <FieldItem
                label="Reason for Seizure"
                value={seizureDetails.reason || 'Payment Default'}
              />

              {/* Overdue Installments: Strictly calculated from loan schedule */}
              <div className="py-2.5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs sm:text-sm">
                <span className="text-slate-500 font-medium">Overdue Installments</span>
                {overdueInfo.isDataMissing ? (
                  <span className="font-semibold text-amber-600 text-left sm:text-right">
                    {overdueInfo.missingReason || 'Schedule data unavailable'}
                  </span>
                ) : overdueInfo.hasOverdue ? (
                  <span className="font-bold text-red-600 text-left sm:text-right">
                    {overdueInfo.overdueCount} {overdueInfo.overdueCount === 1 ? 'installment' : 'installments'} overdue
                  </span>
                ) : (
                  <span className="font-semibold text-emerald-700 text-left sm:text-right">
                    No overdue
                  </span>
                )}
              </div>

              {/* Overdue Amount: Strictly calculated from unpaid balance */}
              <div className="py-2.5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs sm:text-sm">
                <span className="text-slate-500 font-medium">Overdue Amount</span>
                {overdueInfo.isDataMissing ? (
                  <span className="font-semibold text-amber-600 text-left sm:text-right">
                    Unavailable
                  </span>
                ) : overdueInfo.hasOverdue ? (
                  <span className="font-extrabold text-red-600 text-left sm:text-right">
                    {formatCurrency(overdueInfo.overdueAmount)}
                  </span>
                ) : (
                  <span className="font-bold text-emerald-700 text-left sm:text-right">
                    ₹0
                  </span>
                )}
              </div>

              <FieldItem
                label="Storage Location"
                value={seizureDetails.storageLocation || 'Central Yard / Warehouse'}
              />
              <FieldItem
                label="Vehicle Condition"
                value={seizureDetails.condition || 'Good'}
              />
            </div>

            {/* Seizure Notes Callout */}
            <div className="pt-2">
              <span className="text-xs font-semibold text-slate-500 block mb-1">
                Seizure Notes
              </span>
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/80 text-xs text-slate-700 leading-relaxed">
                {seizureDetails.notes || 'No specific notes recorded for this seizure.'}
              </div>
            </div>

            {/* =========================================================
                4. VEHICLE ACTIONS (Release, Sold, Edit)
            ========================================================= */}
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
                {/* Release Vehicle - Primary Green Button */}
                <button
                  type="button"
                  onClick={handleOpenRelease}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-[#006052] hover:bg-[#004d42] text-white text-xs sm:text-sm font-bold shadow-xs hover:shadow transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <KeyRound className="h-4 w-4" />
                  <span>Release Vehicle</span>
                </button>

                {/* Mark as Sold - Outlined Secondary Button */}
                <button
                  type="button"
                  onClick={handleOpenSold}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-lg border border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold shadow-2xs transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  <DollarSign className="h-4 w-4 text-slate-500" />
                  <span>Mark as Sold</span>
                </button>
              </div>

              {/* Edit Seizure Details - Outlined Secondary Button with Edit Icon */}
              <button
                type="button"
                onClick={handleOpenEditSeizure}
                className="w-full sm:w-auto px-4 py-2.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold shadow-2xs transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <Edit className="h-4 w-4 text-slate-500" />
                <span>Edit Seizure Details</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Status Info Banner for Released / Sold / Active */
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-5">
          <h2 className="text-sm font-bold text-slate-800 mb-1">Status Overview</h2>
          <p className="text-xs text-slate-600">
            This vehicle is currently marked as <span className="font-bold">{currentStatus}</span>. Full repossession
            and seizure actions are accessible when a vehicle is under active seizure.
          </p>
        </div>
      )}

      {/* =========================================================
          5. VEHICLE STATUS HISTORY (Compact Timeline)
      ========================================================= */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="px-5 sm:px-6 py-3.5 border-b border-slate-100 bg-slate-50/60 flex items-center gap-2 font-bold text-slate-900 text-sm">
          <History className="h-4 w-4 text-[#006052]" />
          <span>Vehicle Status History</span>
        </div>

        <div className="p-5 sm:p-6">
          {statusHistory.length === 0 ? (
            <div className="py-8 text-center rounded-xl bg-slate-50/80 border border-slate-100">
              <div className="h-10 w-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2.5">
                <History className="h-5 w-5" />
              </div>
              <h4 className="text-sm font-bold text-slate-700">No status changes recorded</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                No previous status transitions have been logged for this vehicle.
              </p>
            </div>
          ) : (
            <div className="relative pl-6 border-l-2 border-slate-200 space-y-5">
              {statusHistory.map((item, idx) => (
                <div key={idx} className="relative">
                  {/* Timeline Bullet */}
                  <div
                    className={`absolute -left-[31px] top-1 h-3.5 w-3.5 rounded-full border-2 border-white shadow-xs ${
                      item.toStatus === 'Seized'
                        ? 'bg-[#EA580C]'
                        : item.toStatus === 'Released'
                        ? 'bg-[#16A34A]'
                        : item.toStatus === 'Sold'
                        ? 'bg-[#64748B]'
                        : 'bg-[#006052]'
                    }`}
                  />

                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 space-y-1.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">
                          {item.fromStatus ? `${item.fromStatus} → ` : ''}{item.toStatus || 'Status Change'}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            STATUS_BADGES[item.toStatus] || 'bg-slate-600 text-white'
                          }`}
                        >
                          {item.toStatus}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 font-medium">
                        {formatDateTime(item.date)}
                      </span>
                    </div>

                    {item.reason && (
                      <p className="text-slate-600">
                        <span className="font-semibold text-slate-700">Reason:</span> {item.reason}
                      </p>
                    )}
                    {item.seizureDate && (
                      <p className="text-slate-600">
                        <span className="font-semibold text-slate-700">Seizure Date:</span> {formatDate(item.seizureDate)}
                      </p>
                    )}
                    {item.releaseDate && (
                      <p className="text-slate-600">
                        <span className="font-semibold text-slate-700">Release Date:</span> {formatDate(item.releaseDate)}
                      </p>
                    )}
                    {item.saleDate && (
                      <p className="text-slate-600">
                        <span className="font-semibold text-slate-700">Sale Date:</span> {formatDate(item.saleDate)}
                      </p>
                    )}
                    {item.salePrice && (
                      <p className="text-slate-600">
                        <span className="font-semibold text-slate-700">Sale Price:</span> {formatCurrency(item.salePrice)}
                      </p>
                    )}
                    {item.buyerName && (
                      <p className="text-slate-600">
                        <span className="font-semibold text-slate-700">Buyer:</span> {item.buyerName}{' '}
                        {item.buyerPhone ? `(${item.buyerPhone})` : ''}
                      </p>
                    )}
                    {item.storageLocation && (
                      <p className="text-slate-600">
                        <span className="font-semibold text-slate-700">Storage:</span> {item.storageLocation}
                      </p>
                    )}
                    {item.condition && (
                      <p className="text-slate-600">
                        <span className="font-semibold text-slate-700">Condition:</span> {item.condition}
                      </p>
                    )}
                    {item.notes && (
                      <p className="text-slate-600">
                        <span className="font-semibold text-slate-700">Notes:</span> {item.notes}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* =========================================================
          MODALS / FORMS FOR SEIZED ACTIONS
      ========================================================= */}

      {/* 1. RELEASE VEHICLE MODAL */}
      {activeModal === 'release' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setActiveModal(null)}
          />
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-emerald-100 text-[#006052] flex items-center justify-center">
                  <KeyRound className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Release Vehicle</h3>
                  <p className="text-xs text-slate-500">Restore vehicle to Released status</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmRelease} className="p-5 space-y-4 text-xs sm:text-sm">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Release Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={releaseDate}
                  onChange={(e) => setReleaseDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#006052]/20 focus:border-[#006052]"
                />
                {formErrors.releaseDate && (
                  <p className="text-xs text-red-500 mt-1">{formErrors.releaseDate}</p>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Reason for Release <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={releaseReason}
                  onChange={(e) => setReleaseReason(e.target.value)}
                  placeholder="e.g. Full dues cleared, restructuring agreed, NOC issued"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#006052]/20 focus:border-[#006052]"
                />
                {formErrors.releaseReason && (
                  <p className="text-xs text-red-500 mt-1">{formErrors.releaseReason}</p>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Cleared / Settlement Amount (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={clearedAmount}
                  onChange={(e) => setClearedAmount(e.target.value)}
                  placeholder="e.g. 15000"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#006052]/20 focus:border-[#006052]"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Release Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={releaseNotes}
                  onChange={(e) => setReleaseNotes(e.target.value)}
                  placeholder="Handover person, gate pass number, inspection notes..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#006052]/20 focus:border-[#006052]"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[#006052] hover:bg-[#004d42] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <KeyRound className="h-4 w-4" />
                  <span>Confirm Release</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. MARK AS SOLD MODAL */}
      {activeModal === 'sold' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setActiveModal(null)}
          />
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                  <DollarSign className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Mark Vehicle as Sold</h3>
                  <p className="text-xs text-slate-500">Record auction or direct sale details</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmSold} className="p-5 space-y-4 text-xs sm:text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Sale Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={saleDate}
                    onChange={(e) => setSaleDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#006052]/20 focus:border-[#006052]"
                  />
                  {formErrors.saleDate && (
                    <p className="text-xs text-red-500 mt-1">{formErrors.saleDate}</p>
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Sale Price (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                    placeholder="e.g. 85000"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#006052]/20 focus:border-[#006052]"
                  />
                  {formErrors.salePrice && (
                    <p className="text-xs text-red-500 mt-1">{formErrors.salePrice}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Buyer Name
                  </label>
                  <input
                    type="text"
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                    placeholder="Buyer or Dealer Name"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#006052]/20 focus:border-[#006052]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Buyer Mobile
                  </label>
                  <input
                    type="tel"
                    value={buyerPhone}
                    onChange={(e) => setBuyerPhone(e.target.value)}
                    placeholder="10-digit mobile"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#006052]/20 focus:border-[#006052]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Proceeds Received (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={proceedsReceived}
                  onChange={(e) => setProceedsReceived(e.target.value)}
                  placeholder="Default equals sale price"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#006052]/20 focus:border-[#006052]"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Sale Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={saleNotes}
                  onChange={(e) => setSaleNotes(e.target.value)}
                  placeholder="Auction details, receipt ref, transfer paperwork..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#006052]/20 focus:border-[#006052]"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <DollarSign className="h-4 w-4" />
                  <span>Confirm Sale</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. EDIT SEIZURE DETAILS MODAL */}
      {activeModal === 'editSeizure' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setActiveModal(null)}
          />
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-orange-100 text-[#EA580C] flex items-center justify-center">
                  <Edit className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Edit Seizure Details</h3>
                  <p className="text-xs text-slate-500">Update repossession & storage record</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditSeizure} className="p-5 space-y-4 text-xs sm:text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Seizure Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={editSeizureDate}
                    onChange={(e) => setEditSeizureDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#006052]/20 focus:border-[#006052]"
                  />
                  {formErrors.editSeizureDate && (
                    <p className="text-xs text-red-500 mt-1">{formErrors.editSeizureDate}</p>
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Vehicle Condition
                  </label>
                  <select
                    value={editCondition}
                    onChange={(e) => setEditCondition(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#006052]/20 focus:border-[#006052]"
                  >
                    <option value="Excellent">Excellent</option>
                    <option value="Good">Good (Minor Wear)</option>
                    <option value="Fair">Fair (Scratch / Dent)</option>
                    <option value="Poor">Poor (Accidental / Damaged)</option>
                    <option value="Non-Running">Non-Running / Mechanical Issue</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Reason for Seizure <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="e.g. Overdue payment default (3 installments)"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#006052]/20 focus:border-[#006052]"
                />
                {formErrors.editReason && (
                  <p className="text-xs text-red-500 mt-1">{formErrors.editReason}</p>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Storage Location <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editStorageLocation}
                  onChange={(e) => setEditStorageLocation(e.target.value)}
                  placeholder="e.g. Yard 2, Sector 4, Hyderabad"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#006052]/20 focus:border-[#006052]"
                />
                {formErrors.editStorageLocation && (
                  <p className="text-xs text-red-500 mt-1">{formErrors.editStorageLocation}</p>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Seizure Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Repossession details, meter reading, accessories..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#006052]/20 focus:border-[#006052]"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[#EA580C] hover:bg-[#c2410c] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="h-4 w-4" />
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default VehicleDetailsView;
