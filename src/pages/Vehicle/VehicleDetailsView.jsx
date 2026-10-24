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
  Receipt,
  Scale,
  TrendingUp,
  TrendingDown,
  Coins,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  ArrowRight,
  Calculator,
  BarChart3,
} from 'lucide-react';
import { calculateVehicleLoanOverdue } from '../../utils/vehicleOverdueCalculation';
import { calculateLoanOutstanding } from '../../utils/loanCalculations';
import VehicleStatusHistoryModal, { getChronologicalVehicleHistory } from '../../components/vehicle/VehicleStatusHistoryModal';
import RepaymentScheduleModal from '../../components/RepaymentScheduleModal';
import { useVehicleImage } from '../../utils/vehicleImageHelper';
import { syncVehicleSaleAccounting } from '../../utils/vehicleSaleAccounting';
import { getEffectiveVehicleStatus } from '../../utils/vehicleStatusHelper';
import { getForeclosureSettings, FORECLOSURE_UPDATE_EVENT } from '../../utils/foreclosureSettings';
import { getPenaltySettings, PENALTY_UPDATE_EVENT } from '../../utils/penaltyRules';
import { calculateForeclosureSale, syncForeclosureSettlementAccounting } from '../../utils/foreclosureCalculations';

import { formatDate, formatDateTime, isDateOnlyString } from '../../utils/dateUtils';
import ForeclosureDetailsView from './ForeclosureDetailsView';

const formatCurrency = (val) => {
  if (val === undefined || val === null || isNaN(Number(val))) return '₹0';
  return `₹${Math.round(Number(val)).toLocaleString('en-IN')}`;
};

const STATUS_BADGES = {
  Active: 'bg-[#2563EB] text-white',
  Normal: 'bg-[#2563EB] text-white',
  Seized: 'bg-[#EA580C] text-white',
  Released: 'bg-[#16A34A] text-white',
  Sold: 'bg-[#64748B] text-white',
  Foreclosed: 'bg-purple-100/90 text-purple-900 border border-purple-300',
  Inactive: 'bg-slate-500 text-white',
};

const FieldItem = ({ label, value }) => (
  <div className="py-2.5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs sm:text-sm">
    <span className="text-slate-500 font-medium">{label}</span>
    <span className="font-semibold text-slate-800 text-left sm:text-right break-words">{value || 'Not recorded'}</span>
  </div>
);

const VehicleDetailsView = ({ vehicleRecord, onBack, onViewExpenseHistory, backLabel }) => {
  // Current live vehicle data
  const [record, setRecord] = useState(vehicleRecord);
  const [allPayments, setAllPayments] = useState([]);

  // Vehicle image selection (customer uploaded photo priority -> vehicle-type default image -> fallback)
  const { imageSrc, handleImageError } = useVehicleImage(record);

  // Modal states for Seized Vehicle Actions
  const [activeModal, setActiveModal] = useState(null); // 'release' | 'sold' | 'editSeizure' | 'history' | null

  // Release Form State
  const [releaseDate, setReleaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [releasedTo, setReleasedTo] = useState('');
  const [clearedAmount, setClearedAmount] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [releaseSuccessToast, setReleaseSuccessToast] = useState(false);

  // Sale Form State
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0]);
  const [salePrice, setSalePrice] = useState('');
  const [vehicleExpenses, setVehicleExpenses] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [proceedsReceived, setProceedsReceived] = useState('');
  const [saleNotes, setSaleNotes] = useState('');

  // Foreclosure & Penalty Settings State
  const [foreclosureSettings, setForeclosureSettings] = useState(() => getForeclosureSettings());
  const [penaltySettings, setPenaltySettings] = useState(() => getPenaltySettings());

  // Settlement & Recovery Section State in Sold Vehicle Details View
  const [settlementMode, setSettlementMode] = useState(''); // 'recovery' | 'waive_loss' | 'payout' | 'retain_profit' | 'waive_profit'
  const [settlementAmountInput, setSettlementAmountInput] = useState('');
  const [settlementNotesInput, setSettlementNotesInput] = useState('');
  const [settlementActionError, setSettlementActionError] = useState('');
  const [settlementSuccessAlert, setSettlementSuccessAlert] = useState('');
  const [isModifyingSettlement, setIsModifyingSettlement] = useState(false);

  // Sold View Details State (expand/collapse calculation breakdown on already sold vehicle)
  const [showSoldCalcBreakdown, setShowSoldCalcBreakdown] = useState(false);
  const [showSalesDetails, setShowSalesDetails] = useState(false);
  const [showAccountingReferences, setShowAccountingReferences] = useState(false);

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

  // Load latest payments & vehicle record from localStorage
  const refreshData = () => {
    try {
      const savedPayments = JSON.parse(localStorage.getItem('motoLendPaymentHistory') || '[]');
      setAllPayments(savedPayments);
    } catch (e) {
      console.error('Failed to load payments history:', e);
      setAllPayments([]);
    }

    try {
      const customersList = JSON.parse(localStorage.getItem('motoLendCustomersList_data') || '[]');
      const targetLoanId = vehicleRecord?.loanId;
      const targetRegNo = vehicleRecord?.vehicle?.regNo;

      const found = customersList.find((entry) => {
        const entryReg = entry.vehicle?.regNo;
        return (
          (targetLoanId && entry.loanId === targetLoanId) ||
          (targetRegNo && entryReg && entryReg.toLowerCase() === targetRegNo.toLowerCase())
        );
      });

      if (found) {
        const normStat = getEffectiveVehicleStatus(found);
        setRecord((prev) => ({
          ...prev,
          ...found,
          vehicleStatus: normStat,
          statusHistory: found.statusHistory || found.vehicle?.statusHistory || prev.statusHistory,
          vehicle: {
            ...(prev.vehicle || {}),
            ...(found.vehicle || {}),
            status: normStat,
          },
        }));
      }
    } catch (err) {
      console.error('Failed to refresh vehicle data:', err);
    }
  };

  useEffect(() => {
    refreshData();
    const handleStorage = () => refreshData();
    const handleForeclosureUpdate = (e) => setForeclosureSettings(e.detail || getForeclosureSettings());
    const handlePenaltyUpdate = (e) => setPenaltySettings(e.detail || getPenaltySettings());

    window.addEventListener('storage', handleStorage);
    window.addEventListener(FORECLOSURE_UPDATE_EVENT, handleForeclosureUpdate);
    window.addEventListener(PENALTY_UPDATE_EVENT, handlePenaltyUpdate);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(FORECLOSURE_UPDATE_EVENT, handleForeclosureUpdate);
      window.removeEventListener(PENALTY_UPDATE_EVENT, handlePenaltyUpdate);
    };
  }, [vehicleRecord]);

  const vehicle = record?.vehicle || {};
  const customer = record?.customer || {};
  const loan = record?.loan || {};

  const currentStatus = getEffectiveVehicleStatus(record);
  const isSeized = currentStatus.toLowerCase() === 'seized';
  const isSold = currentStatus === 'Sold' || record?.status === 'Foreclosed' || record?.isForeclosed;

  const regNo = vehicle.regNo || record?.regNo || 'Unregistered';
  const makeModel = [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || 'Unknown Vehicle';
  const customerName = customer.name || 'Not linked';
  const customerMobile = customer.mobile || 'Not available';

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

  // Calculate Loan Outstanding Amount strictly from loan calculations
  const loanOutstandingInfo = useMemo(() => {
    return calculateLoanOutstanding(record, allPayments);
  }, [record, allPayments]);

  // Formatted seizure date handling: display actual date & time if recorded, otherwise strictly date without fake default time
  const formattedSeizureDate = useMemo(() => {
    const rawTimestamp = seizureDetails.timestamp || seizureDetails.recordedAt || seizureDetails.createdAt;
    const rawDate = seizureDetails.seizureDate || seizureDetails.date;
    if (rawTimestamp && !isDateOnlyString(rawTimestamp)) {
      return formatDateTime(rawTimestamp, seizureDetails);
    }
    if (rawDate) {
      if (!isDateOnlyString(rawDate)) {
        return formatDateTime(rawDate, seizureDetails);
      }
      return formatDate(rawDate);
    }
    return 'Not recorded';
  }, [seizureDetails]);

  // Loan details for RepaymentScheduleModal
  const loanDetailsForModal = useMemo(() => {
    const loan = record?.loan || {};
    return {
      ...loan,
      ...record,
      loanAmount: record?.loanAmount || loan.loanAmount || record?.vehicle?.amount || 0,
      interestRate: loan.interestRate || record?.interestRate || 0,
      tenure: loan.tenure || record?.tenure || 0,
      tenureUnit: loan.tenureUnit || record?.tenureUnit || 'Months',
      paymentFrequency: loan.paymentFrequency || record?.paymentFrequency || 'Monthly',
      interestType: loan.interestType || record?.interestType || 'Flat',
      repaymentMethod: loan.repaymentMethod || record?.repaymentMethod || 'EMI',
      repaymentSchedule: loanOutstandingInfo?.effectiveSchedule || record?.repaymentSchedule || [],
    };
  }, [record, loanOutstandingInfo]);

  // Calculate Foreclosure Sale metrics according to active Foreclosure & Penalty Settings
  const foreclosureCalc = useMemo(() => {
    return calculateForeclosureSale({
      record,
      salePrice: Number(salePrice) || 0,
      saleDate: saleDate || new Date().toISOString().split('T')[0],
      vehicleExpensesInput: vehicleExpenses !== '' && !isNaN(Number(vehicleExpenses)) ? Number(vehicleExpenses) : null,
      foreclosureSettings,
      penaltySettings,
      allPayments,
    });
  }, [record, salePrice, saleDate, vehicleExpenses, foreclosureSettings, penaltySettings, allPayments]);

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
    setReleasedTo(customer.name || '');
    setClearedAmount(overdueInfo.overdueAmount > 0 ? String(overdueInfo.overdueAmount) : '');
    setReleaseNotes('');
    setFormErrors({});
    setActiveModal('release');
  };

  // Handle open Sold modal
  const handleOpenSold = () => {
    // Refresh latest settings from storage on modal open
    setForeclosureSettings(getForeclosureSettings());
    setPenaltySettings(getPenaltySettings());

    const existingSale = record.vehicle?.saleDetails || record.saleDetails || {};
    setSaleDate(existingSale.saleDate || new Date().toISOString().split('T')[0]);
    setSalePrice(existingSale.salePrice ? String(existingSale.salePrice) : '');

    // Read existing recorded expenses for this vehicle to pre-populate if not already set
    let defaultExp = '';
    if (existingSale.vehicleExpenses !== undefined && existingSale.vehicleExpenses !== null) {
      defaultExp = String(existingSale.vehicleExpenses);
    } else if (existingSale.saleExpenses !== undefined && existingSale.saleExpenses !== null) {
      defaultExp = String(existingSale.saleExpenses);
    } else {
      try {
        const rawExp = localStorage.getItem('motoLendExpense_data');
        const allExp = rawExp ? JSON.parse(rawExp) : [];
        const tLoan = record.loanId;
        const tReg = (record.vehicle?.regNo || record.regNo || '').trim().toLowerCase();
        const tVehId = (record.vehicleId || '').trim();
        const existingExpTotal = allExp
          .filter(e => {
            if (e.category !== 'Vehicle Expense' && !e.isVehicleExpense) return false;
            if (tLoan && (e.loanId === tLoan || e.vehicleId === tLoan)) return true;
            if (tVehId && e.vehicleId === tVehId) return true;
            if (tReg) {
              const eReg = (e.vehicleRegNo || e.regNo || '').trim().toLowerCase();
              if (eReg && eReg === tReg) return true;
            }
            return false;
          })
          .reduce((sum, e) => sum + Number(e.amount || 0), 0);
        if (existingExpTotal > 0) {
          defaultExp = String(existingExpTotal);
        }
      } catch (err) {
        console.error('Failed to read existing expenses:', err);
      }
    }
    setVehicleExpenses(defaultExp);

    setBuyerName(existingSale.buyerName || '');
    setBuyerPhone(existingSale.buyerPhone || '');
    setProceedsReceived(existingSale.proceedsReceived ? String(existingSale.proceedsReceived) : '');
    setSaleNotes(existingSale.notes || '');
    setFormErrors({});
    setActiveModal('sold');
  };

  // Helper to persist updates to localStorage
  const updateVehicleInStorage = (transformRecord) => {
    try {
      const customersList = JSON.parse(localStorage.getItem('motoLendCustomersList_data') || '[]');
      const targetLoanId = record.loanId;
      const targetRegNo = vehicle.regNo;

      const updatedCustomers = customersList.map((entry) => {
        const entryReg = entry.vehicle?.regNo;
        const matches =
          (targetLoanId && entry.loanId === targetLoanId) ||
          (targetRegNo && entryReg && entryReg.toLowerCase() === targetRegNo.toLowerCase());

        if (matches) {
          return transformRecord(entry);
        }
        return entry;
      });

      localStorage.setItem('motoLendCustomersList_data', JSON.stringify(updatedCustomers));
      window.dispatchEvent(new Event('storage'));
      refreshData();
    } catch (err) {
      console.error('Failed to update vehicle record:', err);
    }
  };

  // Save Edit Seizure Details
  const handleSaveEditSeizure = (e) => {
    e.preventDefault();
    const errors = {};
    if (!editSeizureDate) errors.editSeizureDate = 'Seizure date is required';
    if (!editReason.trim()) errors.editReason = 'Reason for seizure is required';
    if (!editStorageLocation.trim()) errors.editStorageLocation = 'Storage location is required';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    updateVehicleInStorage((entry) => {
      const updatedSeizureDetails = {
        ...(entry.vehicle?.seizureDetails || {}),
        seizureDate: editSeizureDate,
        reason: editReason.trim(),
        storageLocation: editStorageLocation.trim(),
        condition: editCondition,
        notes: editNotes.trim(),
        updatedAt: new Date().toISOString(),
      };

      // Also update the latest Seized entry in history
      const currentHist = entry.statusHistory || entry.vehicle?.statusHistory || [];
      const updatedHist = currentHist.map((h, i) => {
        if (i === 0 && h.toStatus === 'Seized') {
          return {
            ...h,
            seizureDate: editSeizureDate,
            reason: editReason.trim(),
            storageLocation: editStorageLocation.trim(),
            condition: editCondition,
            notes: editNotes.trim(),
          };
        }
        return h;
      });

      return {
        ...entry,
        statusHistory: updatedHist,
        vehicle: {
          ...(entry.vehicle || {}),
          statusHistory: updatedHist,
          seizureDetails: updatedSeizureDetails,
        },
      };
    });

    setActiveModal(null);
  };

  // Save Release Vehicle
  const handleConfirmRelease = (e) => {
    e.preventDefault();
    const errors = {};
    if (!releaseDate) errors.releaseDate = 'Release date is required';
    if (!releasedTo.trim()) errors.releasedTo = 'Released to / recipient name is required';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const newHistoryEntry = {
      vehicleId: record.loanId || record.vehicleId || vehicle.regNo || '',
      fromStatus: 'Seized',
      toStatus: 'Active',
      eventType: 'release',
      date: new Date().toISOString(),
      releaseDate,
      releasedTo: releasedTo.trim(),
      recipient: releasedTo.trim(),
      clearedAmount: clearedAmount ? Number(clearedAmount) : null,
      notes: releaseNotes.trim(),
      reason: releaseNotes.trim()
        ? `Released to ${releasedTo.trim()} - ${releaseNotes.trim()}`
        : `Released to ${releasedTo.trim()}`,
      performedBy: 'Admin',
    };

    updateVehicleInStorage((entry) => {
      const currentHist = Array.isArray(entry.statusHistory)
        ? entry.statusHistory
        : (Array.isArray(entry.vehicle?.statusHistory) ? entry.vehicle.statusHistory : []);
      const updatedHist = [...currentHist, newHistoryEntry];

      return {
        ...entry,
        vehicleStatus: 'Active',
        statusHistory: updatedHist,
        vehicle: {
          ...(entry.vehicle || {}),
          status: 'Active',
          statusHistory: updatedHist,
          releaseDetails: {
            releaseDate,
            releasedTo: releasedTo.trim(),
            recipient: releasedTo.trim(),
            notes: releaseNotes.trim(),
            clearedAmount: clearedAmount ? Number(clearedAmount) : null,
            recordedAt: new Date().toISOString(),
          },
          // Preserve the vehicle's previous seizure details and all earlier history
          seizureDetails: entry.vehicle?.seizureDetails || entry.seizureDetails,
        },
      };
    });

    setActiveModal(null);
    setReleaseSuccessToast(true);
    setTimeout(() => setReleaseSuccessToast(false), 5000);
  };

  // Save Mark as Sold & Foreclosure Finalization (Independent of later settlement decisions)
  const handleConfirmSold = (e) => {
    e.preventDefault();
    const errors = {};
    if (!saleDate) errors.saleDate = 'Sale date is required';
    if (!salePrice || isNaN(Number(salePrice)) || Number(salePrice) <= 0) {
      errors.salePrice = 'Valid sale amount is required';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const saleAmountNum = Number(salePrice) || 0;
    const cost = foreclosureCalc.totalForeclosureCost;
    const profitLoss = foreclosureCalc.profitLoss;
    const timestamp = new Date().toISOString();

    const isProfit = foreclosureCalc.isProfit;
    const isLoss = foreclosureCalc.isLoss;
    const isBreakEven = foreclosureCalc.isBreakEven;

    // Initial settlement state: Pending later decision in Sold Vehicles view (or Settled if break-even)
    const settlementObj = {
      status: isBreakEven ? 'Settled' : 'Pending',
      type: isBreakEven ? 'breakeven' : isProfit ? 'surplus_pending' : 'shortfall_pending',
      action: isBreakEven ? 'Break-even Foreclosure' : 'Pending Settlement Decision',
      amount: 0,
      settlementAmount: 0,
      shortfall: foreclosureCalc.shortfall,
      profitLoss: profitLoss,
      isProfit: isProfit,
      isLoss: isLoss,
      createdAt: timestamp,
      notes: isBreakEven
        ? 'Finalized at break-even (Total Foreclosure Cost matches Sale Amount)'
        : 'Pending settlement decision in Sold Vehicles section',
    };

    const vehicleRefId = record.loanId || record.vehicleId || vehicle.regNo || '';

    // 1. Vehicle Sale Lifecycle Entry
    const saleHistoryEntry = {
      vehicleId: vehicleRefId,
      fromStatus: currentStatus,
      toStatus: 'Sold',
      eventType: 'sale',
      date: timestamp,
      saleDate,
      salePrice: saleAmountNum,
      saleAmount: saleAmountNum,
      vehicleExpenses: foreclosureCalc.vehicleExpenses,
      totalForeclosureCost: cost,
      profitLoss: profitLoss,
      isProfit: foreclosureCalc.isProfit,
      buyerName: buyerName.trim(),
      buyerPhone: buyerPhone.trim(),
      proceedsReceived: proceedsReceived ? Number(proceedsReceived) : saleAmountNum,
      notes: saleNotes.trim(),
      reason: `Vehicle Sold for ₹${saleAmountNum.toLocaleString('en-IN')} (Total Foreclosure Cost: ₹${Math.round(cost).toLocaleString('en-IN')})`,
      performedBy: 'Admin',
    };

    // 2. Foreclosure Finalized Lifecycle Entry
    const foreclosureHistoryEntry = {
      vehicleId: vehicleRefId,
      toStatus: 'Foreclosed',
      eventType: 'foreclosure_completed',
      date: new Date(Date.now() + 1000).toISOString(),
      reason: `Foreclosure Finalized & Loan Account Closed. Status: Foreclosed. Profit/Loss: ${profitLoss >= 0 ? '+' : ''}₹${Math.round(profitLoss).toLocaleString('en-IN')}`,
      totalCost: cost,
      salePrice: saleAmountNum,
      netSettlement: 0,
      performedBy: 'Admin',
    };

    updateVehicleInStorage((entry) => {
      const currentHist = Array.isArray(entry.statusHistory)
        ? entry.statusHistory
        : (Array.isArray(entry.vehicle?.statusHistory) ? entry.vehicle.statusHistory : []);
      const updatedHist = [...currentHist, saleHistoryEntry, foreclosureHistoryEntry];

      return {
        ...entry,
        status: 'Foreclosed',
        isForeclosed: true,
        vehicleStatus: 'Sold',
        statusHistory: updatedHist,
        loan: {
          ...(entry.loan || {}),
          status: 'Foreclosed',
          isForeclosed: true,
          closedDate: saleDate,
        },
        foreclosure: {
          completedAt: timestamp,
          saleDate,
          salePrice: saleAmountNum,
          finalizedCalculation: foreclosureCalc,
          settlement: settlementObj,
          buyerName: buyerName.trim(),
          buyerPhone: buyerPhone.trim(),
          notes: saleNotes.trim(),
        },
        vehicle: {
          ...(entry.vehicle || {}),
          status: 'Sold',
          statusHistory: updatedHist,
          saleDetails: {
            saleDate,
            salePrice: saleAmountNum,
            saleAmount: saleAmountNum,
            vehicleExpenses: foreclosureCalc.vehicleExpenses,
            netSaleAmount: Math.max(0, saleAmountNum - foreclosureCalc.vehicleExpenses),
            buyerName: buyerName.trim(),
            buyerPhone: buyerPhone.trim(),
            proceedsReceived: proceedsReceived ? Number(proceedsReceived) : saleAmountNum,
            notes: saleNotes.trim(),
            recordedAt: timestamp,
          },
          seizureDetails: entry.vehicle?.seizureDetails || entry.seizureDetails,
        },
      };
    });

    // 1. Synchronize Vehicle Sale Income in Ledger
    syncVehicleSaleAccounting({
      record,
      saleDate,
      salePrice: saleAmountNum,
      vehicleExpenses: foreclosureCalc.vehicleExpenses,
      buyerName: buyerName.trim(),
      buyerPhone: buyerPhone.trim(),
      saleNotes: saleNotes.trim(),
    });

    // DO NOT call syncForeclosureSettlementAccounting here! Settlement decisions are made later in Sold Vehicles view.

    setActiveModal(null);
  };

  // -------------------------------------------------------------
  // POST-SALE SETTLEMENT & RECOVERY HANDLERS (Sold Vehicles View)
  // -------------------------------------------------------------

  // 1. Collect Shortfall from Customer
  const handleConfirmRecovery = (recoveryAmount, notes = '') => {
    setSettlementActionError('');
    const fData = record.foreclosure || {};
    const calc = fData.finalizedCalculation || {};
    const shortfall = Number(calc.shortfall !== undefined ? calc.shortfall : Math.abs(calc.profitLoss || 0));
    const numAmt = Math.round(Number(recoveryAmount) || 0);

    if (numAmt <= 0) {
      setSettlementActionError('Please enter a valid amount greater than ₹0.');
      return;
    }
    if (numAmt > shortfall) {
      setSettlementActionError(`Amount collected cannot exceed total shortfall of ₹${shortfall.toLocaleString('en-IN')}.`);
      return;
    }

    const timestamp = new Date().toISOString();
    const settlementObj = {
      type: 'recovery',
      action: 'Shortfall Collected from Customer',
      amount: numAmt,
      settlementAmount: numAmt,
      shortfall,
      profitLoss: calc.profitLoss,
      status: 'Completed',
      timestamp,
      notes: notes.trim() || `Shortfall of ₹${numAmt.toLocaleString('en-IN')} collected from customer (Total shortfall: ₹${shortfall.toLocaleString('en-IN')})`,
    };

    const vehicleRefId = record.loanId || record.vehicleId || record.vehicle?.regNo || '';
    const historyEntry = {
      vehicleId: vehicleRefId,
      eventType: 'settlement',
      date: timestamp,
      settlementType: 'recovery',
      amount: numAmt,
      status: 'Completed',
      notes: settlementObj.notes,
      reason: settlementObj.action,
      performedBy: 'Admin',
    };

    updateVehicleInStorage((entry) => {
      const currentHist = Array.isArray(entry.statusHistory)
        ? entry.statusHistory
        : (Array.isArray(entry.vehicle?.statusHistory) ? entry.vehicle.statusHistory : []);
      const updatedHist = [...currentHist, historyEntry];

      return {
        ...entry,
        statusHistory: updatedHist,
        foreclosure: {
          ...(entry.foreclosure || {}),
          settlement: settlementObj,
        },
        vehicle: {
          ...(entry.vehicle || {}),
          statusHistory: updatedHist,
        },
      };
    });

    // Record Income in Ledger only after explicit confirmation
    syncForeclosureSettlementAccounting({
      record,
      settlement: settlementObj,
      saleDate: fData.saleDate || new Date().toISOString().split('T')[0],
    });

    setIsModifyingSettlement(false);
    setSettlementMode('');
    setSettlementAmountInput('');
    setSettlementNotesInput('');
    setSettlementSuccessAlert(`Shortfall collection of ₹${numAmt.toLocaleString('en-IN')} confirmed and recorded as Income in Ledger (INC-RECOVERY-${record.loanId || 'VEH'}).`);
    setTimeout(() => setSettlementSuccessAlert(''), 6000);
  };

  // 2. Do Not Collect from Customer
  const handleConfirmLossWaiver = (notes = '') => {
    setSettlementActionError('');
    const fData = record.foreclosure || {};
    const calc = fData.finalizedCalculation || {};
    const shortfall = Number(calc.shortfall !== undefined ? calc.shortfall : Math.abs(calc.profitLoss || 0));
    const timestamp = new Date().toISOString();

    const settlementObj = {
      type: 'waiver',
      action: 'Do Not Collect from Customer',
      amount: 0,
      settlementAmount: 0,
      shortfall,
      profitLoss: calc.profitLoss,
      status: 'Waived',
      timestamp,
      recoveryWaivedAt: timestamp,
      notes: notes.trim() || `Shortfall of ₹${shortfall.toLocaleString('en-IN')} will not be collected from customer. No income transaction created.`,
    };

    const vehicleRefId = record.loanId || record.vehicleId || record.vehicle?.regNo || '';
    const historyEntry = {
      vehicleId: vehicleRefId,
      eventType: 'settlement',
      date: timestamp,
      settlementType: 'waiver',
      amount: 0,
      status: 'Waived',
      notes: settlementObj.notes,
      reason: settlementObj.action,
      performedBy: 'Admin',
    };

    updateVehicleInStorage((entry) => {
      const currentHist = Array.isArray(entry.statusHistory)
        ? entry.statusHistory
        : (Array.isArray(entry.vehicle?.statusHistory) ? entry.vehicle.statusHistory : []);
      const updatedHist = [...currentHist, historyEntry];

      return {
        ...entry,
        statusHistory: updatedHist,
        foreclosure: {
          ...(entry.foreclosure || {}),
          settlement: settlementObj,
        },
        vehicle: {
          ...(entry.vehicle || {}),
          statusHistory: updatedHist,
        },
      };
    });

    // Waivers create NO financial transaction in Ledger
    syncForeclosureSettlementAccounting({
      record,
      settlement: settlementObj,
      saleDate: fData.saleDate || new Date().toISOString().split('T')[0],
    });

    setIsModifyingSettlement(false);
    setSettlementMode('');
    setSettlementAmountInput('');
    setSettlementNotesInput('');
    setSettlementSuccessAlert(`Decision confirmed: Shortfall will not be collected from customer. Vehicle history updated without creating any Ledger financial transaction.`);
    setTimeout(() => setSettlementSuccessAlert(''), 6000);
  };

  // 3. Confirm Customer Profit Payment
  const handleConfirmProfitPayout = (payoutAmount, notes = '') => {
    setSettlementActionError('');
    const fData = record.foreclosure || {};
    const calc = fData.finalizedCalculation || {};
    const profitLoss = Number(calc.profitLoss || 0);
    const numAmt = Math.round(Number(payoutAmount) || 0);

    if (numAmt <= 0) {
      setSettlementActionError('Please enter a valid payout amount greater than ₹0.');
      return;
    }
    if (numAmt > profitLoss) {
      setSettlementActionError(`Payment amount cannot exceed total profit surplus of ₹${profitLoss.toLocaleString('en-IN')}.`);
      return;
    }

    const timestamp = new Date().toISOString();
    const settlementObj = {
      type: 'payout',
      action: 'Customer Profit Paid',
      amount: numAmt,
      settlementAmount: numAmt,
      profitLoss,
      status: 'Completed',
      timestamp,
      notes: notes.trim() || `Customer profit payment of ₹${numAmt.toLocaleString('en-IN')} paid to customer from vehicle sale profit of ₹${profitLoss.toLocaleString('en-IN')}`,
    };

    const vehicleRefId = record.loanId || record.vehicleId || record.vehicle?.regNo || '';
    const historyEntry = {
      vehicleId: vehicleRefId,
      eventType: 'settlement',
      date: timestamp,
      settlementType: 'payout',
      amount: numAmt,
      status: 'Completed',
      notes: settlementObj.notes,
      reason: settlementObj.action,
      performedBy: 'Admin',
    };

    updateVehicleInStorage((entry) => {
      const currentHist = Array.isArray(entry.statusHistory)
        ? entry.statusHistory
        : (Array.isArray(entry.vehicle?.statusHistory) ? entry.vehicle.statusHistory : []);
      const updatedHist = [...currentHist, historyEntry];

      return {
        ...entry,
        statusHistory: updatedHist,
        foreclosure: {
          ...(entry.foreclosure || {}),
          settlement: settlementObj,
        },
        vehicle: {
          ...(entry.vehicle || {}),
          statusHistory: updatedHist,
        },
      };
    });

    // Record Expense in Ledger only after explicit confirmation
    syncForeclosureSettlementAccounting({
      record,
      settlement: settlementObj,
      saleDate: fData.saleDate || new Date().toISOString().split('T')[0],
    });

    setIsModifyingSettlement(false);
    setSettlementMode('');
    setSettlementAmountInput('');
    setSettlementNotesInput('');
    setSettlementSuccessAlert(`Customer profit payment of ₹${numAmt.toLocaleString('en-IN')} confirmed and recorded as Expense in Ledger (EXP-PAYOUT-${record.loanId || 'VEH'}).`);
    setTimeout(() => setSettlementSuccessAlert(''), 6000);
  };

  // 4. Do Not Pay Customer Profit (Profit Retained / Waived)
  const handleConfirmRetainProfit = (notes = '') => {
    handleConfirmProfitWaiver(notes);
  };

  // 5. Do Not Pay Customer Profit
  const handleConfirmProfitWaiver = (notes = '') => {
    setSettlementActionError('');
    const fData = record.foreclosure || {};
    const calc = fData.finalizedCalculation || {};
    const profitLoss = Number(calc.profitLoss || 0);
    const timestamp = new Date().toISOString();

    const settlementObj = {
      type: 'waiver',
      action: 'Do Not Pay Customer Profit',
      amount: 0,
      settlementAmount: 0,
      profitLoss,
      status: 'Waived',
      timestamp,
      settlementWaivedAt: timestamp,
      notes: notes.trim() || `Customer profit of ₹${profitLoss.toLocaleString('en-IN')} will not be paid to customer. No expense transaction created.`,
    };

    const vehicleRefId = record.loanId || record.vehicleId || record.vehicle?.regNo || '';
    const historyEntry = {
      vehicleId: vehicleRefId,
      eventType: 'settlement',
      date: timestamp,
      settlementType: 'waiver',
      amount: 0,
      status: 'Waived',
      notes: settlementObj.notes,
      reason: settlementObj.action,
      performedBy: 'Admin',
    };

    updateVehicleInStorage((entry) => {
      const currentHist = Array.isArray(entry.statusHistory)
        ? entry.statusHistory
        : (Array.isArray(entry.vehicle?.statusHistory) ? entry.vehicle.statusHistory : []);
      const updatedHist = [...currentHist, historyEntry];

      return {
        ...entry,
        statusHistory: updatedHist,
        foreclosure: {
          ...(entry.foreclosure || {}),
          settlement: settlementObj,
        },
        vehicle: {
          ...(entry.vehicle || {}),
          statusHistory: updatedHist,
        },
      };
    });

    // Waivers create NO payment transaction
    syncForeclosureSettlementAccounting({
      record,
      settlement: settlementObj,
      saleDate: fData.saleDate || new Date().toISOString().split('T')[0],
    });

    setIsModifyingSettlement(false);
    setSettlementMode('');
    setSettlementAmountInput('');
    setSettlementNotesInput('');
    setSettlementSuccessAlert(`Decision confirmed: Customer profit will not be paid. Vehicle history updated without creating any Ledger financial transaction.`);
    setTimeout(() => setSettlementSuccessAlert(''), 6000);
  };

  if (isSold) {
    return (
      <>
        <ForeclosureDetailsView
          record={record}
          loanOutstandingInfo={loanOutstandingInfo}
          allPayments={allPayments}
          onBack={onBack}
          backLabel={backLabel}
          onViewExpenseHistory={onViewExpenseHistory}
          onOpenStatusHistory={() => setActiveModal('history')}
          handleConfirmRecovery={handleConfirmRecovery}
          handleConfirmLossWaiver={handleConfirmLossWaiver}
          handleConfirmProfitPayout={handleConfirmProfitPayout}
          handleConfirmProfitWaiver={handleConfirmProfitWaiver}
          imageSrc={imageSrc}
          handleImageError={handleImageError}
          refreshData={refreshData}
        />
        <VehicleStatusHistoryModal
          isOpen={activeModal === 'history'}
          onClose={() => setActiveModal(null)}
          vehicleRecord={record}
          allPayments={allPayments}
        />
      </>
    );
  }

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
          <span>{backLabel || 'Back to Vehicle Management'}</span>
        </button>

        {/* Current Status Pill & Action */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">Current Status:</span>
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold shadow-2xs ${STATUS_BADGES[currentStatus] || STATUS_BADGES.Active
              }`}
          >
            {currentStatus}
          </span>
          <button
            type="button"
            onClick={() => onViewExpenseHistory && onViewExpenseHistory(record)}
            className="ml-1 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-emerald-600/30 bg-emerald-50/50 hover:bg-emerald-100/70 text-[#006052] text-xs font-bold shadow-2xs transition-colors cursor-pointer"
          >
            <Receipt className="h-3.5 w-3.5" />
            <span>Expense History</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveModal('history')}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-[#006052] bg-white hover:bg-emerald-50/70 text-[#006052] text-xs font-bold shadow-2xs transition-colors cursor-pointer"
          >
            <History className="h-3.5 w-3.5" />
            <span>View Status History</span>
          </button>
        </div>
      </div>

      {/* Success Notification Banner for Release */}
      {releaseSuccessToast && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between shadow-2xs animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Check className="h-4.5 w-4.5" />
            </div>
            <div>
              <p className="text-sm font-bold text-emerald-950">
                Vehicle Successfully Released!
              </p>
              <p className="text-xs text-emerald-800">
                Current status has been changed to <strong>Active</strong>. The release event has been saved to the permanent history timeline.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setReleaseSuccessToast(false)}
            className="text-emerald-700 hover:text-emerald-900 p-1 rounded-lg cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* =========================================================
          1. COMPACT VEHICLE SUMMARY
      ========================================================= */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4 sm:p-5 flex flex-col md:flex-row gap-4 sm:gap-5 items-start">
        {/* Photo Container */}
        <div className="w-full md:w-44 h-36 md:h-32 rounded-xl bg-slate-50 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center shadow-2xs">
          {imageSrc ? (
            <img
              src={imageSrc}
              alt={makeModel}
              onError={handleImageError}
              className="w-full h-full object-cover object-center"
            />
          ) : (
            <FallbackIcon className="h-14 w-14 text-slate-300 stroke-1" />
          )}
        </div>

        {/* Header Details */}
        <div className="flex-1 min-w-0 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              {regNo}
            </h1>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold shadow-2xs ${
                STATUS_BADGES[currentStatus] || STATUS_BADGES.Sold
              }`}
            >
              {currentStatus}
            </span>
            {(isSold || record?.status === 'Foreclosed' || record?.isForeclosed) && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-900 border border-purple-200 shadow-2xs">
                Foreclosed
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm font-semibold text-slate-600">{makeModel}</p>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2.5 pt-2.5 border-t border-slate-100 text-xs">
            <div>
              <span className="text-slate-400 block text-[11px] font-medium">Customer Name</span>
              <span className="font-semibold text-slate-800 truncate block">{customerName}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px] font-medium">Customer Mobile</span>
              <span className="font-semibold text-slate-800 truncate block">{customerMobile}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px] font-medium">Customer ID</span>
              <span className="font-semibold text-slate-800 truncate block">{record.customerId || customer.customerId || '—'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px] font-medium">Loan ID</span>
              <span className="font-semibold text-slate-800 truncate block">{record.loanId || loan.loanId || '—'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px] font-medium">Loan Amount</span>
              <span className="font-semibold text-slate-800 truncate block">
                {formatCurrency(record?.loanAmount || loan.loanAmount || record?.loan?.loanAmount || loanOutstandingInfo?.principal || 0)}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px] font-medium">Foreclosure Date</span>
              <span className="font-semibold text-slate-800 truncate block">
                {formatDate(record.foreclosure?.saleDate || record.vehicle?.saleDetails?.saleDate || record.saleDetails?.saleDate || record.foreclosure?.completedAt || record.foreclosureDate || record.closedDate) || '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================
          FORECLOSURE & VEHICLE SALE SETTLEMENT (For Sold / Foreclosed)
      ========================================================= */}
      {(currentStatus === 'Sold' || record?.status === 'Foreclosed' || record?.isForeclosed) && (() => {
        const fData = record.foreclosure || {};
        const saleDetails = record.vehicle?.saleDetails || record.saleDetails || {};
        const calc = fData.finalizedCalculation || {};
        const saleAmt = Number(fData.salePrice || saleDetails.salePrice || saleDetails.saleAmount || 0);
        const totalCost = Number(calc.totalForeclosureCost !== undefined ? calc.totalForeclosureCost : (Number(saleDetails.vehicleExpenses || 0) + Number(loanOutstandingInfo?.outstandingAmount || 0)));
        const profitLoss = calc.profitLoss !== undefined ? Number(calc.profitLoss) : (saleAmt - totalCost);
        const isProfit = profitLoss > 0;
        const isLoss = profitLoss < 0;
        const isBreakEven = profitLoss === 0;
        const shortfall = calc.shortfall !== undefined ? Number(calc.shortfall) : Math.abs(profitLoss);
        const settlement = fData.settlement || {};
        const recoveredAmt = settlement.type === 'recovery' && settlement.status === 'Completed'
          ? Number(settlement.amount || 0)
          : (settlement.type === 'recovery' ? Number(settlement.amount || 0) : 0);
        const remainingShortfall = Math.max(0, shortfall - recoveredAmt);
        const vehicleExpensesVal = calc.vehicleExpenses !== undefined ? Number(calc.vehicleExpenses) : Number(saleDetails.vehicleExpenses || 0);
        const seizedInterestVal = Number(calc.seizedPeriodInterest || calc.components?.seizedPeriodInterest?.amount || 0);
        const penaltyVal = Number(calc.penalty || calc.components?.penalty?.amount || 0);
        const vehicleExpensesEnabled = Boolean(calc.components?.vehicleExpenses?.enabled || Number(saleDetails.vehicleExpenses || 0) > 0);
        const penaltyEnabled = Boolean(calc.components?.applicablePenalty?.enabled || Number(calc.penalty || 0) > 0);
        const seizedInterestEnabled = Boolean(calc.components?.seizedPeriodInterest?.enabled || Number(calc.seizedPeriodInterest || calc.components?.seizedPeriodInterest?.amount || 0) > 0);

        // Total Outstanding strictly from outstanding loan balance at sale (principal + unpaid interest)
        const totalOutstanding = (calc.outstandingPrincipal !== undefined && calc.unpaidInterest !== undefined)
          ? (Number(calc.outstandingPrincipal) + Number(calc.unpaidInterest))
          : (calc.components?.outstandingPrincipalAndInterest?.total !== undefined)
            ? Number(calc.components.outstandingPrincipalAndInterest.total)
            : (loanOutstandingInfo?.outstandingAmount !== undefined)
              ? Number(loanOutstandingInfo.outstandingAmount)
              : (Number(calc.outstandingPrincipal || 0) + Number(calc.unpaidInterest || 0));

        // Heights for vertical bar comparison chart (Image 2 style)
        const totalRequired = Math.max(0, totalCost);
        const maxBarVal = Math.max(saleAmt, totalCost, 1);
        const saleBarHeightPct = Math.max(12, Math.min(100, Math.round((saleAmt / maxBarVal) * 100)));
        const requiredBarHeightPct = Math.max(12, Math.min(100, Math.round((totalCost / maxBarVal) * 100)));

        // Component cards data for Shortfall Summary (Matching Image 1)
        const shortfallComponents = (() => {
          let unallocated = saleAmt;
          const list = [];

          // 1. Principal + Interest
          const pDue = totalOutstanding;
          const pSat = Math.min(unallocated, pDue);
          const pRem = Math.max(0, pDue - pSat);
          unallocated = Math.max(0, unallocated - pSat);
          list.push({
            name: 'Principal + Interest',
            due: pDue,
            satisfied: pSat,
            remaining: pRem,
            status: pRem === 0 ? 'Satisfied' : 'Not Satisfied',
          });

          // 2. Vehicle Expenses
          const veDue = vehicleExpensesVal;
          const veSat = Math.min(unallocated, veDue);
          const veRem = Math.max(0, veDue - veSat);
          unallocated = Math.max(0, unallocated - veSat);
          list.push({
            name: 'Vehicle Expenses',
            due: veDue,
            satisfied: veSat,
            remaining: veRem,
            status: veRem === 0 ? 'Satisfied' : 'Not Satisfied',
          });

          // 3. Penalty Charges
          const penDue = penaltyVal;
          const penSat = Math.min(unallocated, penDue);
          const penRem = Math.max(0, penDue - penSat);
          unallocated = Math.max(0, unallocated - penSat);
          list.push({
            name: 'Penalty Charges',
            due: penDue,
            satisfied: penSat,
            remaining: penRem,
            status: penRem === 0 ? 'Satisfied' : 'Not Satisfied',
          });

          // 4. Processing / Legal Charges (or Seizure-period Interest)
          const spiDue = seizedInterestVal;
          const spiSat = Math.min(unallocated, spiDue);
          const spiRem = Math.max(0, spiDue - spiSat);
          list.push({
            name: seizedInterestVal > 0 ? 'Seizure-period Interest' : 'Processing / Legal Charges',
            due: spiDue,
            satisfied: spiSat,
            remaining: spiRem,
            status: spiRem === 0 ? 'Satisfied' : 'Not Satisfied',
          });

          return list;
        })();

        const loanId = record.loanId || 'VEH';
        const saleTxId = `INC-SALE-${loanId}`;
        const recoveryTxId = `INC-RECOVERY-${loanId}`;
        const payoutTxId = `EXP-PAYOUT-${loanId}`;

        return (
          <div className="space-y-4 lg:space-y-5 w-full">
            <div className="flex flex-col lg:flex-row items-start gap-4 lg:gap-5 w-full">
              {/* =========================================================
                  LEFT COLUMN (~44% width)
                  1. Foreclosure Summary (4 concise KPI cards)
                  2. Sale vs Required Amount (Vertical Bar Chart)
                  3. Sale Details (Collapsible)
              ========================================================= */}
              <div className="w-full lg:w-[44%] space-y-4">
                {/* 1. FORECLOSURE SUMMARY */}
                <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Scale className="h-4 w-4 text-[#006052]" />
                      <h2 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">
                        Foreclosure Summary
                      </h2>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-200">
                      Foreclosed
                    </span>
                  </div>

                  <div className="p-3.5 sm:p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* KPI 1: Total Outstanding */}
                      <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between min-h-[82px]">
                        <span className="text-xs font-semibold text-slate-500">Total Outstanding</span>
                        <p className="text-lg sm:text-xl font-bold text-slate-900 mt-1">
                          {formatCurrency(totalOutstanding)}
                        </p>
                      </div>

                      {/* KPI 2: Vehicle Sale Amount */}
                      <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between min-h-[82px]">
                        <span className="text-xs font-semibold text-slate-500">Vehicle Sale Amount</span>
                        <p className="text-lg sm:text-xl font-bold text-[#006052] mt-1">
                          {formatCurrency(saleAmt)}
                        </p>
                      </div>

                      {/* KPI 3: Foreclosure Profit / Loss */}
                      <div
                        className={`p-3.5 rounded-xl border flex flex-col justify-between min-h-[82px] ${
                          isProfit
                            ? 'bg-emerald-50/80 border-emerald-200'
                            : isLoss
                              ? 'bg-red-50/80 border-red-200'
                              : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <span
                          className={`text-xs font-bold ${
                            isProfit ? 'text-emerald-800' : isLoss ? 'text-red-800' : 'text-slate-600'
                          }`}
                        >
                          {isProfit ? 'Foreclosure Profit' : isLoss ? 'Foreclosure Loss' : 'Break-even'}
                        </span>
                        <p
                          className={`text-lg sm:text-xl font-extrabold mt-1 ${
                            isProfit ? 'text-emerald-700' : isLoss ? 'text-red-700' : 'text-slate-800'
                          }`}
                        >
                          {isProfit ? `+${formatCurrency(profitLoss)}` : isLoss ? `-${formatCurrency(shortfall)}` : '₹0'}
                        </p>
                      </div>

                      {/* KPI 4: Customer Settlement */}
                      <div className="p-3.5 rounded-xl border border-purple-200 bg-purple-50/60 flex flex-col justify-between min-h-[82px]">
                        <span className="text-xs font-bold text-purple-900">Customer Settlement</span>
                        <p className="text-base sm:text-lg font-bold text-purple-950 mt-1 truncate">
                          {settlement.type === 'payout'
                            ? `Paid: ${formatCurrency(settlement.amount)}`
                            : settlement.type === 'recovery'
                              ? `Collected: ${formatCurrency(settlement.amount)}`
                              : settlement.type === 'waiver'
                                ? (isLoss ? 'Not Collected' : 'Not Paid')
                                : settlement.type === 'retained'
                                  ? 'Not Paid'
                                  : settlement.status || (isBreakEven ? 'Break-Even' : 'Pending')}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. SALE VS REQUIRED AMOUNT — VERTICAL BAR COMPARISON CHART (Matching Reference Image 2) */}
                <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-[#006052]" />
                      <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                        Sale vs Required Amount
                      </h3>
                    </div>
                  </div>

                  <div className="p-3.5 sm:p-4 space-y-3.5">
                    {/* Vertical Bar Chart Area */}
                    <div className="w-full flex flex-col justify-end pt-2 pb-1">
                      <div className="h-44 sm:h-48 flex items-end justify-center gap-14 sm:gap-20 px-4 pb-2">
                        {/* Sale Amount Bar Column (Green) */}
                        <div className="flex flex-col items-center justify-end h-full w-28">
                          <span className="text-xs sm:text-sm font-bold text-[#006052] mb-2 whitespace-nowrap">
                            {formatCurrency(saleAmt)}
                          </span>
                          <div
                            className="w-14 sm:w-16 rounded-t-lg bg-[#006052] shadow-2xs transition-all duration-300"
                            style={{ height: `${saleBarHeightPct}%` }}
                          />
                        </div>

                        {/* Required Amount Bar Column (Red) */}
                        <div className="flex flex-col items-center justify-end h-full w-28">
                          <span className="text-xs sm:text-sm font-bold text-rose-600 mb-2 whitespace-nowrap">
                            {formatCurrency(totalCost)}
                          </span>
                          <div
                            className="w-14 sm:w-16 rounded-t-lg bg-[#e11d48] shadow-2xs transition-all duration-300"
                            style={{ height: `${requiredBarHeightPct}%` }}
                          />
                        </div>
                      </div>

                      {/* Base Divider Line */}
                      <div className="w-full border-t border-slate-200" />

                      {/* Category Names Below Bars */}
                      <div className="flex items-center justify-center gap-14 sm:gap-20 px-4 pt-3 pb-1">
                        <div className="w-28 text-center">
                          <span className="text-xs sm:text-sm font-bold text-slate-800">Sale Amount</span>
                        </div>
                        <div className="w-28 text-center">
                          <span className="text-xs sm:text-sm font-bold text-slate-800">Required Amount</span>
                        </div>
                      </div>
                    </div>

                    {/* Three Summary Cards Directly Below */}
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-xs">
                      <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/60">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="h-2 w-2 rounded-full bg-[#006052] shrink-0" />
                          <span className="text-[11px] font-semibold text-slate-500 truncate">Sale Amount</span>
                        </div>
                        <p className="text-xs sm:text-sm font-bold text-[#006052] truncate">
                          {formatCurrency(saleAmt)}
                        </p>
                      </div>

                      <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/60">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="h-2 w-2 rounded-full bg-slate-600 shrink-0" />
                          <span className="text-[11px] font-semibold text-slate-500 truncate">Total Required</span>
                        </div>
                        <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                          {formatCurrency(totalCost)}
                        </p>
                      </div>

                      <div
                        className={`p-2.5 rounded-lg border ${
                          isLoss
                            ? 'border-red-200 bg-red-50/50'
                            : isProfit
                              ? 'border-emerald-200 bg-emerald-50/50'
                              : 'border-slate-200 bg-slate-50/60'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span
                            className={`h-2 w-2 rounded-full shrink-0 ${
                              isLoss ? 'bg-red-600' : isProfit ? 'bg-emerald-600' : 'bg-slate-400'
                            }`}
                          />
                          <span
                            className={`text-[11px] font-semibold truncate ${
                              isLoss ? 'text-red-700' : isProfit ? 'text-emerald-700' : 'text-slate-500'
                            }`}
                          >
                            {isLoss ? 'Shortfall / Loss' : isProfit ? 'Surplus' : 'Net Balance'}
                          </span>
                        </div>
                        <p
                          className={`text-xs sm:text-sm font-bold truncate ${
                            isLoss ? 'text-red-700' : isProfit ? 'text-emerald-700' : 'text-slate-800'
                          }`}
                        >
                          {isLoss ? formatCurrency(shortfall) : isProfit ? `+${formatCurrency(profitLoss)}` : '₹0'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. SALE DETAILS (Collapsible: Default Closed) */}
                <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-[#006052]" />
                      <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                        Sale Details
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowSalesDetails((prev) => !prev)}
                      className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
                    >
                      <span>{showSalesDetails ? 'Close' : 'View Sale Details'}</span>
                      {showSalesDetails ? <ChevronUp className="h-3.5 w-3.5 text-slate-500" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-500" />}
                    </button>
                  </div>

                  {showSalesDetails && (
                    <div className="p-4 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
                        <div className="py-1.5 border-b border-slate-100 flex items-center justify-between">
                          <span className="text-slate-500 font-medium">Sale Date</span>
                          <span className="font-bold text-slate-800">{formatDate(fData.saleDate || saleDetails.saleDate)}</span>
                        </div>
                        <div className="py-1.5 border-b border-slate-100 flex items-center justify-between">
                          <span className="text-slate-500 font-medium">Vehicle Sale Amount</span>
                          <span className="font-bold text-[#006052]">{formatCurrency(saleAmt)}</span>
                        </div>
                        <div className="py-1.5 border-b border-slate-100 flex items-center justify-between">
                          <span className="text-slate-500 font-medium">Buyer Name</span>
                          <span className="font-bold text-slate-800 truncate max-w-[150px] text-right">{fData.buyerName || saleDetails.buyerName || 'Direct Sale / Auction'}</span>
                        </div>
                        <div className="py-1.5 border-b border-slate-100 flex items-center justify-between">
                          <span className="text-slate-500 font-medium">Buyer Mobile</span>
                          <span className="font-bold text-slate-800">{fData.buyerPhone || saleDetails.buyerPhone || 'Not recorded'}</span>
                        </div>
                        <div className="py-1.5 border-b border-slate-100 flex items-center justify-between">
                          <span className="text-slate-500 font-medium">Sale Method</span>
                          <span className="font-bold text-slate-800">{fData.saleMethod || saleDetails.saleMethod || 'Direct Sale'}</span>
                        </div>
                        <div className="py-1.5 border-b border-slate-100 flex items-center justify-between sm:col-span-2">
                          <span className="text-slate-500 font-medium">Loan Account Status</span>
                          <span className="font-bold text-purple-700">Foreclosed (Account Closed)</span>
                        </div>
                      </div>

                      {/* Optional Sale Notes */}
                      {(fData.notes || saleDetails.notes) && (
                        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 text-xs text-slate-700">
                          <span className="font-semibold text-slate-600 block text-[11px] mb-0.5">Sale Notes:</span>
                          <p className="text-slate-700 text-xs leading-relaxed">{fData.notes || saleDetails.notes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* =========================================================
                  RIGHT COLUMN (~56% width)
                  1. Settlement & Recovery
                  2. Cost Breakdown (collapsed by default)
                  3. Accounting & Ledger Transaction References
              ========================================================= */}
              <div className="w-full lg:w-[56%] space-y-4">
              {/* 1. SETTLEMENT & RECOVERY */}
              <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Coins className="h-4 w-4 text-[#006052]" />
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                      Settlement &amp; Recovery
                    </h3>
                  </div>

                  {/* Settlement Status Badge */}
                  <div>
                    {settlement.status === 'Completed' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        <span>
                          {settlement.type === 'payout'
                            ? `Paid: ${formatCurrency(settlement.amount)}`
                            : settlement.type === 'recovery'
                              ? `Collected: ${formatCurrency(settlement.amount)}`
                              : 'Completed'}
                        </span>
                      </span>
                    ) : settlement.status === 'Waived' || settlement.status === 'Retained' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-800 border border-purple-200">
                        <ShieldCheck className="h-3.5 w-3.5 text-purple-600" />
                        <span>{isLoss ? 'Not Collected' : 'Not Paid'}</span>
                      </span>
                    ) : isBreakEven ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        <Scale className="h-3.5 w-3.5 text-slate-600" />
                        <span>Break-Even</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        <Clock className="h-3.5 w-3.5 text-amber-600" />
                        <span>Pending Settlement</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-4 space-y-3.5">
                  {/* Feedback Messages */}
                  {settlementSuccessAlert && (
                    <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium flex items-center gap-2 animate-in fade-in duration-150">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>{settlementSuccessAlert}</span>
                    </div>
                  )}

                  {settlementActionError && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-900 text-xs font-medium flex items-center gap-2 animate-in fade-in duration-150">
                      <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                      <span>{settlementActionError}</span>
                    </div>
                  )}

                  {/* 1. LOSS SHORTFALL WORKFLOW */}
                  {isLoss && (
                    <div className="space-y-3.5">
                      {/* Shortfall Summary Strip */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 bg-red-50/50 rounded-xl border border-red-200/80 text-xs">
                        <div>
                          <span className="text-slate-500 font-medium block">Total Shortfall (Loss):</span>
                          <span className="text-sm sm:text-base font-extrabold text-red-700">
                            {formatCurrency(shortfall)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 font-medium block">Amount Collected:</span>
                          <span className="text-sm sm:text-base font-extrabold text-slate-800">
                            {formatCurrency(settlement.type === 'recovery' ? settlement.amount : 0)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 font-medium block">Outstanding Shortfall:</span>
                          <span className="text-sm sm:text-base font-extrabold text-red-800">
                            {formatCurrency(
                              Math.max(
                                0,
                                shortfall - (settlement.type === 'recovery' ? Number(settlement.amount || 0) : 0)
                              )
                            )}
                          </span>
                        </div>
                      </div>

                      {/* If already settled & not editing, show resolved view */}
                      {(settlement.status === 'Completed' || settlement.status === 'Waived' || settlement.status === 'Retained') && !isModifyingSettlement ? (
                        <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                              <span className="font-bold text-slate-900">
                                {settlement.status === 'Completed'
                                  ? `Shortfall Collected from Customer: ${formatCurrency(settlement.amount)} Recorded in Ledger`
                                  : 'Do Not Collect from Customer: Shortfall Not Collected'}
                              </span>
                            </div>
                            <p className="text-slate-500">
                              {settlement.notes}
                            </p>
                            {settlement.timestamp && (
                              <p className="text-[11px] text-slate-400">
                                Recorded on {formatDate(settlement.timestamp)} • Ledger Reference: {settlement.type === 'recovery' ? `INC-RECOVERY-${record.loanId || 'VEH'}` : 'None (No income transaction)'}
                              </p>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setIsModifyingSettlement(true);
                              setSettlementMode(settlement.type === 'recovery' ? 'recovery' : 'waive_loss');
                              setSettlementAmountInput(settlement.amount ? String(settlement.amount) : '');
                              setSettlementNotesInput(settlement.notes || '');
                            }}
                            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer shrink-0"
                          >
                            Modify Settlement
                          </button>
                        </div>
                      ) : (
                        /* Interactive Action Section for Loss */
                        <div className="space-y-3 pt-1">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {/* Option 1: Collect Shortfall from Customer */}
                            <label
                              className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between gap-1.5 text-xs ${(settlementMode || 'recovery') === 'recovery'
                                  ? 'bg-red-50/40 border-red-500 ring-2 ring-red-500/20'
                                  : 'bg-white border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  name="lossSettlementMode"
                                  value="recovery"
                                  checked={(settlementMode || 'recovery') === 'recovery'}
                                  onChange={() => setSettlementMode('recovery')}
                                  className="text-red-600 focus:ring-red-500"
                                />
                                <span className="font-bold text-slate-900">Collect Shortfall from Customer</span>
                              </div>
                            </label>

                            {/* Option 2: Do Not Collect from Customer */}
                            <label
                              className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between gap-1.5 text-xs ${settlementMode === 'waive_loss'
                                  ? 'bg-purple-50/40 border-purple-500 ring-2 ring-purple-500/20'
                                  : 'bg-white border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  name="lossSettlementMode"
                                  value="waive_loss"
                                  checked={settlementMode === 'waive_loss'}
                                  onChange={() => setSettlementMode('waive_loss')}
                                  className="text-purple-600 focus:ring-purple-500"
                                />
                                <span className="font-bold text-slate-900">Do Not Collect from Customer</span>
                              </div>
                            </label>
                          </div>

                          {/* Option 1 Sub-form: Collect Shortfall from Customer */}
                          {(settlementMode || 'recovery') === 'recovery' && (
                            <div className="p-3.5 rounded-xl border border-red-200 bg-red-50/20 space-y-3 text-xs animate-in fade-in duration-150">
                              <div>
                                <label className="block font-semibold text-slate-700 mb-1">
                                  Amount Collected from Customer (₹) <span className="text-red-500">*</span>
                                </label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    min="1"
                                    max={shortfall}
                                    step="any"
                                    value={settlementAmountInput !== '' ? settlementAmountInput : shortfall}
                                    onChange={(e) => setSettlementAmountInput(e.target.value)}
                                    placeholder={`Up to ${shortfall}`}
                                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 text-xs"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setSettlementAmountInput(String(Math.round(shortfall)))}
                                    className="px-2.5 py-1.5 rounded-lg border border-red-300 bg-red-50 text-red-800 text-xs font-bold hover:bg-red-100 whitespace-nowrap cursor-pointer"
                                  >
                                    Full Shortfall
                                  </button>
                                </div>
                              </div>

                              <div>
                                <label className="block font-semibold text-slate-700 mb-1">
                                  Recovery Notes <span className="text-slate-400 font-normal">(Optional)</span>
                                </label>
                                <input
                                  type="text"
                                  value={settlementNotesInput}
                                  onChange={(e) => setSettlementNotesInput(e.target.value)}
                                  placeholder="Cash receipt number, UPI ref, customer acknowledgment..."
                                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 text-xs"
                                />
                              </div>

                              <div className="flex items-center justify-between pt-1">
                                {isModifyingSettlement ? (
                                  <button
                                    type="button"
                                    onClick={() => setIsModifyingSettlement(false)}
                                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs cursor-pointer"
                                  >
                                    Cancel Editing
                                  </button>
                                ) : <div />}

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleConfirmRecovery(
                                      settlementAmountInput !== '' ? settlementAmountInput : shortfall,
                                      settlementNotesInput
                                    )
                                  }
                                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white font-bold text-xs shadow-2xs transition-colors cursor-pointer"
                                >
                                  <Check className="h-4 w-4" />
                                  <span>
                                    Collect Shortfall from Customer ({formatCurrency(Number(settlementAmountInput !== '' ? settlementAmountInput : shortfall) || 0)})
                                  </span>
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Option 2 Sub-form: Do Not Collect from Customer */}
                          {settlementMode === 'waive_loss' && (
                            <div className="p-3.5 rounded-xl border border-purple-200 bg-purple-50/20 space-y-3 text-xs animate-in fade-in duration-150">
                              <div>
                                <label className="block font-semibold text-slate-700 mb-1">
                                  Notes / Reason <span className="text-slate-400 font-normal">(Optional)</span>
                                </label>
                                <input
                                  type="text"
                                  value={settlementNotesInput}
                                  onChange={(e) => setSettlementNotesInput(e.target.value)}
                                  placeholder="Management approval, reason for non-collection..."
                                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-xs"
                                />
                              </div>

                              <div className="flex items-center justify-between pt-1">
                                {isModifyingSettlement ? (
                                  <button
                                    type="button"
                                    onClick={() => setIsModifyingSettlement(false)}
                                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs cursor-pointer"
                                  >
                                    Cancel Editing
                                  </button>
                                ) : <div />}

                                <button
                                  type="button"
                                  onClick={() => handleConfirmLossWaiver(settlementNotesInput)}
                                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs shadow-2xs transition-colors cursor-pointer"
                                >
                                  <ShieldCheck className="h-4 w-4" />
                                  <span>Confirm Do Not Collect from Customer</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 2. PROFIT SURPLUS WORKFLOW */}
                  {isProfit && (
                    <div className="space-y-3.5">
                      {/* Surplus Summary Strip */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 bg-emerald-50/50 rounded-xl border border-emerald-200/80 text-xs">
                        <div>
                          <span className="text-slate-500 font-medium block">Total Sale Surplus:</span>
                          <span className="text-sm sm:text-base font-extrabold text-emerald-800">
                            +{formatCurrency(profitLoss)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 font-medium block">Customer Profit Payment:</span>
                          <span className="text-sm sm:text-base font-extrabold text-slate-800">
                            {formatCurrency(settlement.type === 'payout' ? settlement.amount : 0)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 font-medium block">Profit Retained:</span>
                          <span className="text-sm sm:text-base font-extrabold text-[#006052]">
                            {settlement.type === 'payout'
                              ? formatCurrency(Math.max(0, profitLoss - Number(settlement.amount || 0)))
                              : formatCurrency(profitLoss)}
                          </span>
                        </div>
                      </div>

                      {/* If already settled & not editing, show resolved view */}
                      {(settlement.status === 'Completed' || settlement.status === 'Waived' || settlement.status === 'Retained') && !isModifyingSettlement ? (
                        <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                              <span className="font-bold text-slate-900">
                                {settlement.status === 'Completed'
                                  ? `Customer Profit Payment Finalized: ${formatCurrency(settlement.amount)} Recorded as Expense in Ledger`
                                  : 'Do Not Pay Customer Profit (No Expense Recorded)'}
                              </span>
                            </div>
                            <p className="text-slate-500">
                              {settlement.notes}
                            </p>
                            {settlement.timestamp && (
                              <p className="text-[11px] text-slate-400">
                                Recorded on {formatDate(settlement.timestamp)} • Ledger Reference: {settlement.type === 'payout' ? `EXP-PAYOUT-${record.loanId || 'VEH'}` : 'None (No expense transaction)'}
                              </p>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setIsModifyingSettlement(true);
                              setSettlementMode(settlement.type === 'payout' ? 'payout' : 'waive_profit');
                              setSettlementAmountInput(settlement.amount ? String(settlement.amount) : '');
                              setSettlementNotesInput(settlement.notes || '');
                            }}
                            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer shrink-0"
                          >
                            Modify Settlement
                          </button>
                        </div>
                      ) : (
                        /* Interactive Action Section for Profit */
                        <div className="space-y-3 pt-1">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {/* Option 1: Customer Profit Payment */}
                            <label
                              className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between gap-1.5 text-xs ${(settlementMode || 'payout') === 'payout'
                                  ? 'bg-emerald-50/40 border-[#006052] ring-2 ring-[#006052]/20 font-semibold'
                                  : 'bg-white border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  name="profitSettlementMode"
                                  value="payout"
                                  checked={(settlementMode || 'payout') === 'payout'}
                                  onChange={() => setSettlementMode('payout')}
                                  className="text-[#006052] focus:ring-[#006052]"
                                />
                                <span className="font-bold text-slate-900">Pay Customer Profit</span>
                              </div>
                            </label>

                            {/* Option 2: Do Not Pay Customer Profit */}
                            <label
                              className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between gap-1.5 text-xs ${settlementMode === 'waive_profit'
                                  ? 'bg-purple-50/40 border-purple-500 ring-2 ring-purple-500/20 font-semibold'
                                  : 'bg-white border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  name="profitSettlementMode"
                                  value="waive_profit"
                                  checked={settlementMode === 'waive_profit'}
                                  onChange={() => setSettlementMode('waive_profit')}
                                  className="text-purple-600 focus:ring-purple-500"
                                />
                                <span className="font-bold text-slate-900">Do Not Pay Customer Profit</span>
                              </div>
                            </label>
                          </div>

                          {/* Option 1 Sub-form: Pay Customer Profit */}
                          {(settlementMode || 'payout') === 'payout' && (
                            <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/20 space-y-3 text-xs animate-in fade-in duration-150">
                              <div>
                                <label className="block font-semibold text-slate-700 mb-1">
                                  Amount to Pay Customer (₹) <span className="text-red-500">*</span>
                                </label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    min="1"
                                    max={profitLoss}
                                    step="any"
                                    value={settlementAmountInput !== '' ? settlementAmountInput : profitLoss}
                                    onChange={(e) => setSettlementAmountInput(e.target.value)}
                                    placeholder={`Up to ${profitLoss}`}
                                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#006052]/20 focus:border-[#006052] text-xs"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setSettlementAmountInput(String(Math.round(profitLoss)))}
                                    className="px-2.5 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 text-xs font-bold hover:bg-emerald-100 whitespace-nowrap cursor-pointer"
                                  >
                                    Full Surplus
                                  </button>
                                </div>
                              </div>

                              <div>
                                <label className="block font-semibold text-slate-700 mb-1">
                                  Payout Notes <span className="text-slate-400 font-normal">(Optional)</span>
                                </label>
                                <input
                                  type="text"
                                  value={settlementNotesInput}
                                  onChange={(e) => setSettlementNotesInput(e.target.value)}
                                  placeholder="Disbursement voucher, bank transfer ID, customer receipt..."
                                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#006052]/20 focus:border-[#006052] text-xs"
                                />
                              </div>

                              <div className="flex items-center justify-between pt-1">
                                {isModifyingSettlement ? (
                                  <button
                                    type="button"
                                    onClick={() => setIsModifyingSettlement(false)}
                                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs cursor-pointer"
                                  >
                                    Cancel Editing
                                  </button>
                                ) : <div />}

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleConfirmProfitPayout(
                                      settlementAmountInput !== '' ? settlementAmountInput : profitLoss,
                                      settlementNotesInput
                                    )
                                  }
                                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#006052] hover:bg-[#004d42] text-white font-bold text-xs shadow-2xs transition-colors cursor-pointer"
                                >
                                  <Check className="h-4 w-4" />
                                  <span>
                                    Pay Customer Profit ({formatCurrency(Number(settlementAmountInput !== '' ? settlementAmountInput : profitLoss) || 0)})
                                  </span>
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Option 2 Sub-form: Do Not Pay Customer Profit */}
                          {settlementMode === 'waive_profit' && (
                            <div className="p-3.5 rounded-xl border border-purple-200 bg-purple-50/20 space-y-3 text-xs animate-in fade-in duration-150">
                              <div>
                                <label className="block font-semibold text-slate-700 mb-1">
                                  Notes / Reason <span className="text-slate-400 font-normal">(Optional)</span>
                                </label>
                                <input
                                  type="text"
                                  value={settlementNotesInput}
                                  onChange={(e) => setSettlementNotesInput(e.target.value)}
                                  placeholder="Management approval, reason for non-payment..."
                                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-xs"
                                />
                              </div>

                              <div className="flex items-center justify-between pt-1">
                                {isModifyingSettlement ? (
                                  <button
                                    type="button"
                                    onClick={() => setIsModifyingSettlement(false)}
                                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs cursor-pointer"
                                  >
                                    Cancel Editing
                                  </button>
                                ) : <div />}

                                <button
                                  type="button"
                                  onClick={() => handleConfirmProfitWaiver(settlementNotesInput)}
                                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs shadow-2xs transition-colors cursor-pointer"
                                >
                                  <ShieldCheck className="h-4 w-4" />
                                  <span>Confirm Do Not Pay Customer Profit</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 3. BREAK-EVEN WORKFLOW */}
                  {isBreakEven && (
                    <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/60 text-xs text-blue-900 flex items-center gap-3">
                      <Scale className="h-5 w-5 text-blue-700 shrink-0" />
                      <div>
                        <p className="font-bold">Foreclosure Break-Even Finalized</p>
                        <p className="text-blue-800 mt-0.5">
                          Sale proceeds match the foreclosure cost exactly ({formatCurrency(saleAmt)}). No customer payout or shortfall recovery is required.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 2. COST BREAKDOWN (COLLAPSED BY DEFAULT, MOVED TO RIGHT COLUMN) */}
              <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowSoldCalcBreakdown((prev) => !prev)}
                  className="w-full px-4 py-3 bg-slate-50/70 hover:bg-slate-100/70 flex items-center justify-between text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Calculator className="h-4 w-4 text-[#006052]" />
                    <span className="text-xs sm:text-sm font-bold text-slate-900">
                      Cost Breakdown
                    </span>
                    <span className="text-[11px] text-slate-500 font-normal hidden sm:inline">
                      (Components contributing to Foreclosure Cost)
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <span>{showSoldCalcBreakdown ? 'Close' : 'View Breakdown'}</span>
                    {showSoldCalcBreakdown ? (
                      <ChevronUp className="h-3.5 w-3.5 text-slate-500" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                    )}
                  </div>
                </button>

                {showSoldCalcBreakdown && (
                  <div className="p-4 space-y-2.5 text-xs bg-white border-t border-slate-100 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 text-xs font-bold text-slate-800">
                      <span>Foreclosure Cost Breakdown (At Sale)</span>
                      <span className="text-slate-500 font-normal">Component Contribution</span>
                    </div>

                    {/* Principal + Interest */}
                    <div className="flex items-center justify-between py-1 border-b border-slate-200/60">
                      <div>
                        <span className="font-semibold text-slate-800">
                          Outstanding at Sale
                        </span>
                        <span className="block text-[11px] text-slate-500">
                          Always included • Principal: {formatCurrency(calc.outstandingPrincipal || calc.components?.outstandingPrincipalAndInterest?.principal || 0)} + Unpaid Interest: {formatCurrency(calc.unpaidInterest || calc.components?.outstandingPrincipalAndInterest?.unpaidInterest || 0)}
                        </span>
                      </div>
                      <span className="font-bold text-slate-900">
                        {formatCurrency(
                          (calc.outstandingPrincipal || calc.components?.outstandingPrincipalAndInterest?.principal || 0) +
                          (calc.unpaidInterest || calc.components?.outstandingPrincipalAndInterest?.unpaidInterest || 0)
                        )}
                      </span>
                    </div>

                    {/* Vehicle Expenses */}
                    {(calc.components?.vehicleExpenses?.enabled || Number(saleDetails.vehicleExpenses || 0) > 0) && (
                      <div className="flex items-center justify-between py-1 border-b border-slate-200/60">
                        <div>
                          <span className="font-semibold text-slate-800">Vehicle Expenses</span>
                          <span className="block text-[11px] text-slate-500">
                            Storage, towing, repairs, repossession charges
                          </span>
                        </div>
                        <span className="font-bold text-slate-900">
                          {formatCurrency(calc.vehicleExpenses !== undefined ? calc.vehicleExpenses : saleDetails.vehicleExpenses)}
                        </span>
                      </div>
                    )}

                    {/* Seized-Period Interest */}
                    {calc.components?.seizedPeriodInterest?.enabled && (
                      <div className="flex items-center justify-between py-1 border-b border-slate-200/60">
                        <div>
                          <span className="font-semibold text-slate-800">Seized-Period Interest</span>
                          <span className="block text-[11px] text-slate-500">
                            Basis: {calc.components?.seizedPeriodInterest?.basis || 'Option A'}
                            {calc.components?.seizedPeriodInterest?.details?.duration &&
                              ` • ${calc.components.seizedPeriodInterest.details.duration} ${calc.components.seizedPeriodInterest.details.unit || 'Months'}`}
                          </span>
                        </div>
                        <span className="font-bold text-slate-900">
                          {formatCurrency(calc.seizedPeriodInterest || calc.components?.seizedPeriodInterest?.amount || 0)}
                        </span>
                      </div>
                    )}

                    {/* Applicable Penalty */}
                    {(calc.components?.applicablePenalty?.enabled || Number(calc.penalty || 0) > 0) && (
                      <div className="flex items-center justify-between py-1 border-b border-slate-200/60">
                        <div>
                          <span className="font-semibold text-slate-800">Applicable Penalty</span>
                          <span className="block text-[11px] text-slate-500">
                            {calc.components?.applicablePenalty?.reason ||
                              (Number(calc.penalty || 0) > 0
                                ? 'Overdue penalty calculated per Penalty Settings'
                                : 'No overdue penalty due or eligible')}
                          </span>
                        </div>
                        <span className="font-bold text-slate-900">
                          {formatCurrency(calc.penalty || 0)}
                        </span>
                      </div>
                    )}

                    {/* Total Cost Row */}
                    <div className="flex items-center justify-between pt-2 text-slate-900 font-bold text-xs sm:text-sm">
                      <span>Total Foreclosure Cost:</span>
                      <span className="text-[#006052] font-extrabold">{formatCurrency(totalCost)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. ACCOUNTING & LEDGER REFERENCES (Collapsible: Default Closed) */}
              <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileCheck className="h-4 w-4 text-[#006052]" />
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                      Accounting &amp; Ledger References
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAccountingReferences((prev) => !prev)}
                    className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
                  >
                    <span>{showAccountingReferences ? 'Close' : 'View'}</span>
                    {showAccountingReferences ? <ChevronUp className="h-3.5 w-3.5 text-slate-500" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-500" />}
                  </button>
                </div>

                {showAccountingReferences && (
                  <div className="p-3.5 sm:p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {/* 1. Vehicle Sale Income */}
                      <div className="p-3 bg-slate-50/70 rounded-lg border border-slate-200/80 shadow-2xs space-y-1 flex flex-col justify-between min-h-[96px]">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-slate-800">Vehicle Sale Proceeds</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              Ledger Income
                            </span>
                          </div>
                          <p className="text-slate-600 font-medium">
                            Ref: <code className="bg-white px-1 py-0.5 rounded text-[11px] font-mono font-bold text-slate-800 border border-slate-200">{saleTxId}</code>
                          </p>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1.5 border-t border-slate-200/60 mt-1">
                          <span>Amount: <strong className="text-slate-800">{formatCurrency(saleAmt)}</strong></span>
                          <span>{formatDate(fData.saleDate || saleDetails.saleDate)}</span>
                        </div>
                      </div>

                      {/* 2. Foreclosure Settlement Transaction */}
                      <div className="p-3 bg-slate-50/70 rounded-lg border border-slate-200/80 shadow-2xs space-y-1 flex flex-col justify-between min-h-[96px]">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-slate-800">Settlement Transaction</span>
                            {settlement.status === 'Completed' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                {settlement.type === 'payout' ? 'Ledger Expense' : 'Ledger Income'}
                              </span>
                            ) : settlement.status === 'Waived' || settlement.status === 'Retained' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-800 border border-purple-200">
                                {isLoss ? 'Do Not Collect' : 'Do Not Pay'}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                Pending
                              </span>
                            )}
                          </div>

                          {settlement.status === 'Completed' ? (
                            <p className="text-slate-600 font-medium">
                              Ref: <code className="bg-white px-1 py-0.5 rounded text-[11px] font-mono font-bold text-slate-800 border border-slate-200">
                                {settlement.type === 'payout' ? payoutTxId : recoveryTxId}
                              </code>
                            </p>
                          ) : (
                            <p className="text-slate-600 text-[11px] line-clamp-2">
                              {settlement.notes || (isLoss ? 'Shortfall will not be collected. No income transaction.' : isProfit ? 'Profit will not be paid. No expense transaction.' : 'Pending decision.')}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1.5 border-t border-slate-200/60 mt-1">
                          {settlement.status === 'Completed' ? (
                            <>
                              <span>
                                {settlement.type === 'payout' ? 'Paid: ' : 'Collected: '}
                                <strong className="text-slate-800">{formatCurrency(settlement.amount)}</strong>
                              </span>
                              <span>{formatDate(settlement.timestamp)}</span>
                            </>
                          ) : (
                            <span className="text-slate-400">No financial entries created</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* =========================================================
              SHORTFALL SUMMARY (Displayed ONLY when actual loss exists)
              Placed below the two columns spanning full width
          ========================================================= */}
          {/* =========================================================
              SHORTFALL SUMMARY (Displayed ONLY when actual loss exists)
              4 Status Cards Grid matching Reference Image 1
          ========================================================= */}
          {isLoss && (
            <div className="w-full bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-rose-500" />
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                    Shortfall Summary
                  </h3>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-600 border border-rose-200/70">
                  Loss
                </span>
              </div>

              <div className="p-4 sm:p-5 space-y-4">
                {/* 4 Status Cards Row matching Reference Image 1 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  {shortfallComponents.map((comp, idx) => {
                    const isSatisfied = comp.status === 'Satisfied';
                    const displayAmount = isSatisfied
                      ? (comp.due > 0 ? comp.due : comp.satisfied)
                      : comp.remaining;

                    return (
                      <div
                        key={idx}
                        className={`rounded-2xl border p-3.5 sm:p-4 flex items-center gap-3.5 transition-all ${
                          isSatisfied
                            ? 'bg-[#f0fbf7] border-emerald-200/80 shadow-2xs'
                            : 'bg-[#fff5f5] border-rose-200/80 shadow-2xs'
                        }`}
                      >
                        {/* Circular Icon Container */}
                        <div
                          className={`h-11 w-11 rounded-full flex items-center justify-center shrink-0 ${
                            isSatisfied
                              ? 'bg-emerald-100/90 text-emerald-600'
                              : 'bg-rose-100/90 text-rose-500'
                          }`}
                        >
                          {isSatisfied ? (
                            <Check className="h-5 w-5 stroke-[2.5]" />
                          ) : (
                            <AlertCircle className="h-5 w-5 stroke-[2.5]" />
                          )}
                        </div>

                        {/* Text Information */}
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-semibold text-slate-500 truncate block">
                            {comp.name}
                          </span>
                          <p
                            className={`text-lg sm:text-xl font-black mt-0.5 tracking-tight truncate ${
                              isSatisfied ? 'text-emerald-700' : 'text-rose-600'
                            }`}
                          >
                            {formatCurrency(displayAmount)}
                          </p>
                          <div className="mt-1.5">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                isSatisfied
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200/80'
                                  : 'bg-rose-100 text-rose-700 border border-rose-200/80'
                              }`}
                            >
                              {isSatisfied ? 'Satisfied' : 'Not Satisfied'}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Recovery distinction (if any recovery recorded) */}
                {recoveredAmt > 0 && (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-slate-600">
                    <span>
                      Total Loss: <strong className="text-slate-800">{formatCurrency(shortfall)}</strong> • Amount Recovered: <strong className="text-emerald-700">{formatCurrency(recoveredAmt)}</strong>
                    </span>
                    <span>
                      Net Outstanding Shortfall: <strong className="text-red-700">{formatCurrency(remainingShortfall)}</strong>
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      );
    })()}


      {/* =========================================================
          2 & 3. SEIZURE DETAILS & OVERDUE SECTION (For Seized Status)
      ========================================================= */}
      {isSeized && (
        <div className="space-y-4">
          {/* Four Compact Financial KPI Cards Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* KPI 1: Principal Outstanding */}
            <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-3.5 sm:p-4 flex flex-col justify-between min-h-[96px]">
              <div className="flex items-center justify-between">
                <span className="text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Principal Outstanding
                </span>
                <Banknote className="h-4 w-4 text-slate-400" />
              </div>
              <div className="mt-2">
                <p className="text-base sm:text-xl font-bold text-slate-900 tracking-tight">
                  {formatCurrency(loanOutstandingInfo?.remainingPrincipal || 0)}
                </p>
                <span className="text-[11px] text-slate-500">Remaining unpaid principal</span>
              </div>
            </div>

            {/* KPI 2: Interest Outstanding */}
            <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-3.5 sm:p-4 flex flex-col justify-between min-h-[96px]">
              <div className="flex items-center justify-between">
                <span className="text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Interest Outstanding
                </span>
                <TrendingUp className="h-4 w-4 text-slate-400" />
              </div>
              <div className="mt-2">
                <p className="text-base sm:text-xl font-bold text-slate-900 tracking-tight">
                  {formatCurrency(loanOutstandingInfo?.remainingInterest || 0)}
                </p>
                <span className="text-[11px] text-slate-500">Remaining unpaid interest</span>
              </div>
            </div>

            {/* KPI 3: Total Outstanding (Primary Metric with Green Accent) */}
            <div className="bg-emerald-50/50 rounded-xl border border-emerald-200/90 shadow-2xs p-3.5 sm:p-4 flex flex-col justify-between min-h-[96px]">
              <div className="flex items-center justify-between">
                <span className="text-[11px] sm:text-xs font-bold text-[#006052] uppercase tracking-wider">
                  Total Outstanding
                </span>
                <Scale className="h-4 w-4 text-[#006052]" />
              </div>
              <div className="mt-2">
                <p className="text-base sm:text-xl font-extrabold text-[#006052] tracking-tight">
                  {formatCurrency(loanOutstandingInfo?.outstandingAmount || 0)}
                </p>
                <span className="text-[11px] text-emerald-800 font-medium">Principal + Interest</span>
              </div>
            </div>

            {/* KPI 4: View Schedule Action Card */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setActiveModal('schedule')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveModal('schedule');
                }
              }}
              className="bg-white rounded-xl border border-slate-200/90 hover:border-[#006052]/50 hover:bg-slate-50/80 shadow-2xs p-3.5 sm:p-4 flex flex-col justify-between min-h-[96px] cursor-pointer transition-all group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] sm:text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Repayment Schedule
                </span>
                <Calendar className="h-4 w-4 text-[#006052] group-hover:scale-110 transition-transform" />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div>
                  <p className="text-sm sm:text-base font-bold text-slate-900 group-hover:text-[#006052] transition-colors">
                    View Schedule
                  </p>
                  <span className="text-[11px] text-slate-500">
                    {loanOutstandingInfo?.effectiveSchedule?.length || record.loan?.tenure || 0} installments plan
                  </span>
                </div>
                <span className="p-1.5 rounded-lg bg-emerald-50 text-[#006052] group-hover:bg-[#006052] group-hover:text-white transition-colors">
                  <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </div>
          </div>

          {/* Two-Column Layout: Left (~40%) Financial Summary, Right (~60%) Seizure Details */}
          <div className="flex flex-col lg:flex-row items-start gap-4 lg:gap-5 w-full">
            {/* LEFT COLUMN: ~40% width */}
            <div className="w-full lg:w-[40%] space-y-4">
              <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Banknote className="h-4 w-4 text-[#006052]" />
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                      Loan &amp; Overdue Summary
                    </h3>
                  </div>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {record.loanId || 'Active Loan'}
                  </span>
                </div>

                <div className="p-4 space-y-3">
                  <div className="space-y-2 text-xs">
                    <div className="py-1.5 border-b border-slate-100 flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Original Loan Amount</span>
                      <span className="font-bold text-slate-800">
                        {formatCurrency(loanOutstandingInfo?.principal || record.loanAmount || 0)}
                      </span>
                    </div>

                    <div className="py-1.5 border-b border-slate-100 flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Total Repaid So Far</span>
                      <span className="font-bold text-slate-800">
                        {formatCurrency(loanOutstandingInfo?.totalRepaid || 0)}
                      </span>
                    </div>

                    <div className="py-1.5 border-b border-slate-100 flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Overdue Installments</span>
                      {overdueInfo.isDataMissing ? (
                        <span className="font-semibold text-amber-600">
                          {overdueInfo.missingReason || 'Schedule data unavailable'}
                        </span>
                      ) : overdueInfo.hasOverdue ? (
                        <span className="font-bold text-red-600">
                          {overdueInfo.overdueCount} {overdueInfo.overdueCount === 1 ? 'installment' : 'installments'} overdue
                        </span>
                      ) : (
                        <span className="font-semibold text-emerald-700">No overdue</span>
                      )}
                    </div>

                    <div className="py-1.5 border-b border-slate-100 flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Overdue Amount</span>
                      {overdueInfo.isDataMissing ? (
                        <span className="font-semibold text-amber-600">Unavailable</span>
                      ) : overdueInfo.hasOverdue ? (
                        <span className="font-extrabold text-red-600">
                          {formatCurrency(overdueInfo.overdueAmount)}
                        </span>
                      ) : (
                        <span className="font-bold text-emerald-700">₹0</span>
                      )}
                    </div>

                    {Number(loanOutstandingInfo?.advanceBalance || 0) > 0 && (
                      <div className="py-1.5 border-b border-slate-100 flex items-center justify-between">
                        <span className="text-slate-500 font-medium">Advance Balance</span>
                        <span className="font-bold text-emerald-700">
                          {formatCurrency(loanOutstandingInfo.advanceBalance)}
                        </span>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveModal('schedule')}
                    className="w-full mt-2 py-2 px-3 rounded-lg border border-slate-200 hover:border-[#006052]/40 bg-slate-50 hover:bg-slate-100/80 text-slate-700 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Calendar className="h-3.5 w-3.5 text-[#006052]" />
                    <span>View Full Repayment Schedule</span>
                  </button>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: ~60% width */}
            <div className="w-full lg:w-[60%] space-y-4">
              <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
                {/* Header */}
                <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-lg bg-orange-100 text-[#EA580C] flex items-center justify-center">
                      <ShieldAlert className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">
                        Seizure Details
                      </h2>
                      <p className="text-[11px] text-slate-500">
                        Repossession record, storage location, and vehicle condition
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

                <div className="p-4 sm:p-5 space-y-4">
                  {/* 2-Column Responsive Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                    <FieldItem
                      label="Seizure Date"
                      value={formattedSeizureDate}
                    />
                    <FieldItem
                      label="Reason for Seizure"
                      value={seizureDetails.reason || 'Payment Default'}
                    />
                    <FieldItem
                      label="Storage Location"
                      value={seizureDetails.storageLocation || 'Central Yard / Warehouse'}
                    />
                    <FieldItem
                      label="Vehicle Condition"
                      value={seizureDetails.condition || 'Good'}
                    />
                  </div>

                  {/* Seizure Notes */}
                  <div className="pt-1">
                    <span className="text-[11px] font-semibold text-slate-500 block mb-1">
                      Seizure Notes
                    </span>
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 text-xs text-slate-700 leading-relaxed">
                      {seizureDetails.notes || 'No specific notes recorded for this seizure.'}
                    </div>
                  </div>

                  {/* Actions Footer - duplicate View Status History removed */}
                  <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2.5">
                    {/* Release Vehicle - Primary Green Button */}
                    <button
                      type="button"
                      onClick={handleOpenRelease}
                      className="px-4 py-2 rounded-lg bg-[#006052] hover:bg-[#004d42] text-white text-xs font-bold shadow-xs hover:shadow transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      <span>Release Vehicle</span>
                    </button>

                    {/* Mark as Sold - Outlined Secondary Button */}
                    <button
                      type="button"
                      onClick={handleOpenSold}
                      className="px-4 py-2 rounded-lg border border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <DollarSign className="h-3.5 w-3.5 text-slate-500" />
                      <span>Mark as Sold</span>
                    </button>

                    {/* Edit Seizure Details */}
                    <button
                      type="button"
                      onClick={handleOpenEditSeizure}
                      className="px-3.5 py-2 rounded-lg border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Edit className="h-3.5 w-3.5 text-slate-500" />
                      <span>Edit Seizure Details</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
                  <p className="text-xs text-slate-500">Restore vehicle status from Seized to Active</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmRelease} className="p-5 space-y-4 text-xs sm:text-sm">
              {/* Vehicle Snapshot */}
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-500 font-medium">Releasing Vehicle:</span>
                  <p className="font-bold text-slate-900">{regNo} • {makeModel}</p>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#EA580C] text-white">
                  Currently Seized
                </span>
              </div>

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
                  Released To / Recipient Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={releasedTo}
                  onChange={(e) => setReleasedTo(e.target.value)}
                  placeholder="e.g. Rahul Sharma (Owner) / Authorized Representative"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#006052]/20 focus:border-[#006052]"
                />
                {formErrors.releasedTo && (
                  <p className="text-xs text-red-500 mt-1">{formErrors.releasedTo}</p>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Cleared / Settlement Amount (₹) <span className="text-slate-400 font-normal">(Optional)</span>
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
                  Release Notes <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={releaseNotes}
                  onChange={(e) => setReleaseNotes(e.target.value)}
                  placeholder="Handover person, gate pass number, condition upon release, etc."
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

      {/* 2. MARK AS SOLD & FORECLOSURE SETTLEMENT MODAL */}
      {activeModal === 'sold' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setActiveModal(null)}
          />
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150 my-6 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                  <Scale className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">
                    Mark Vehicle as Sold & Foreclosure
                  </h3>
                  <p className="text-xs text-slate-500">
                    Foreclosure settlement based on active calculation settings
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmSold} className="p-5 space-y-5 overflow-y-auto text-xs sm:text-sm flex-1">
              {/* Sale Inputs (2-col grid) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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
                    Vehicle Sale Amount (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                    placeholder="e.g. 75000"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#006052]/20 focus:border-[#006052]"
                  />
                  {formErrors.salePrice && (
                    <p className="text-xs text-red-500 mt-1">{formErrors.salePrice}</p>
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Buyer Name
                  </label>
                  <input
                    type="text"
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                    placeholder="Buyer / Dealer Name"
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

              {/* Vehicle Expenses Input */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-semibold text-slate-700">
                    Vehicle Expenses (₹)
                  </label>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${foreclosureSettings.includeVehicleExpenses
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}>
                    {foreclosureSettings.includeVehicleExpenses ? 'Enabled in Settings' : 'Disabled in Settings'}
                  </span>
                </div>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={vehicleExpenses}
                  onChange={(e) => setVehicleExpenses(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#006052]/20 focus:border-[#006052]"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  {foreclosureSettings.includeVehicleExpenses
                    ? 'Storage, towing, yard repairs. Included in Total Foreclosure Cost.'
                    : 'Excluded from Foreclosure Cost calculation per Foreclosure Settings.'}
                </p>
              </div>

              {/* =========================================================
                  FORECLOSURE CALCULATION BREAKDOWN
              ========================================================= */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                  <div className="flex items-center gap-1.5">
                    <Scale className="h-4 w-4 text-[#006052]" />
                    <span className="text-xs font-bold text-slate-800">
                      Foreclosure Calculation Breakdown
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-medium">
                    Live Settings Applied
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  {/* 1. Outstanding Principal + Interest at Sale: Always Enabled */}
                  <div className="flex items-center justify-between py-1.5 border-b border-slate-200/60">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800">
                          Outstanding Principal + Unpaid Interest
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 font-bold border border-emerald-200">
                          Always Enabled
                        </span>
                      </div>
                      <span className="block text-[11px] text-slate-500 mt-0.5">
                        Principal: {formatCurrency(foreclosureCalc.outstandingPrincipal)} + Unpaid Interest: {formatCurrency(foreclosureCalc.unpaidInterest)}
                      </span>
                    </div>
                    <span className="font-bold text-slate-900 text-sm">
                      {formatCurrency(foreclosureCalc.outstandingPrincipal + foreclosureCalc.unpaidInterest)}
                    </span>
                  </div>

                  {/* 2. Vehicle Expenses: Only if enabled */}
                  {foreclosureCalc.components.vehicleExpenses.enabled && (
                    <div className="flex items-center justify-between py-1.5 border-b border-slate-200/60">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800">
                            Vehicle Expenses
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 font-bold border border-emerald-200">
                            Included
                          </span>
                        </div>
                        <span className="block text-[11px] text-slate-500 mt-0.5">
                          Repossession, towing, garage & storage expenses
                        </span>
                      </div>
                      <span className="font-bold text-slate-900 text-sm">
                        {formatCurrency(foreclosureCalc.vehicleExpenses)}
                      </span>
                    </div>
                  )}

                  {/* 3. Seized-Period Interest: Only if enabled */}
                  {foreclosureCalc.components.seizedPeriodInterest.enabled && (
                    <div className="flex items-center justify-between py-1.5 border-b border-slate-200/60">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800">
                            Seized-Period Interest
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-800 font-bold border border-purple-200">
                            {foreclosureCalc.components.seizedPeriodInterest.basis}
                          </span>
                        </div>
                        <span className="block text-[11px] text-slate-500 mt-0.5">
                          {foreclosureCalc.components.seizedPeriodInterest.details?.duration
                            ? `Eligible: ${foreclosureCalc.components.seizedPeriodInterest.details.duration} ${foreclosureCalc.components.seizedPeriodInterest.details.unit} (${foreclosureCalc.components.seizedPeriodInterest.details.startDate} to ${foreclosureCalc.components.seizedPeriodInterest.details.endDate})`
                            : 'Eligible repossession duration'}
                        </span>
                      </div>
                      <span className="font-bold text-slate-900 text-sm">
                        {formatCurrency(foreclosureCalc.seizedPeriodInterest)}
                      </span>
                    </div>
                  )}

                  {/* 4. Applicable Penalty */}
                  {(foreclosureCalc.components?.applicablePenalty?.enabled || foreclosureCalc.components?.applicablePenalty?.reason || Number(foreclosureCalc.penalty || 0) > 0) && (
                    <div className="flex items-center justify-between py-1.5 border-b border-slate-200/60">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800">
                            Applicable Penalty
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${foreclosureCalc.penalty > 0 ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                            Penalty Settings
                          </span>
                        </div>
                        <span className="block text-[11px] text-slate-500 mt-0.5">
                          {foreclosureCalc.components?.applicablePenalty?.reason ||
                            (foreclosureCalc.penalty > 0
                              ? 'Calculated under active penalty rules'
                              : 'No overdue penalty due or eligible')}
                        </span>
                      </div>
                      <span className="font-bold text-slate-900 text-sm">
                        {formatCurrency(foreclosureCalc.penalty)}
                      </span>
                    </div>
                  )}

                  {/* Total Cost Row */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs sm:text-sm">
                    <span className="font-bold text-slate-700">Total Foreclosure Cost:</span>
                    <span className="font-extrabold text-[#006052] text-sm sm:text-base">
                      {formatCurrency(foreclosureCalc.totalForeclosureCost)}
                    </span>
                  </div>
                </div>

                {/* Final Profit / Loss Banner */}
                <div
                  className={`p-3 rounded-xl border flex items-center justify-between ${Number(salePrice) <= 0
                    ? 'bg-slate-100 border-slate-200 text-slate-600'
                    : foreclosureCalc.isProfit
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : foreclosureCalc.isLoss
                        ? 'bg-red-50 border-red-200 text-red-900'
                        : 'bg-blue-50 border-blue-200 text-blue-900'
                    }`}
                >
                  <div className="flex items-center gap-2">
                    {foreclosureCalc.isProfit ? (
                      <TrendingUp className="h-4 w-4 text-emerald-700 shrink-0" />
                    ) : foreclosureCalc.isLoss ? (
                      <TrendingDown className="h-4 w-4 text-red-700 shrink-0" />
                    ) : (
                      <Scale className="h-4 w-4 text-slate-500 shrink-0" />
                    )}
                    <span className="font-bold text-xs sm:text-sm">
                      {Number(salePrice) <= 0
                        ? 'Enter Sale Amount above'
                        : foreclosureCalc.isProfit
                          ? 'Foreclosure Sale Profit:'
                          : foreclosureCalc.isLoss
                            ? 'Foreclosure Shortfall (Loss):'
                            : 'Break-even'}
                    </span>
                  </div>
                  <span className="text-sm sm:text-base font-extrabold tracking-tight">
                    {Number(salePrice) <= 0
                      ? '—'
                      : foreclosureCalc.isProfit
                        ? `+${formatCurrency(foreclosureCalc.profitLoss)}`
                        : foreclosureCalc.isLoss
                          ? `-${formatCurrency(foreclosureCalc.shortfall)}`
                          : '₹0'}
                  </span>
                </div>
              </div>

              {/* Optional Sale Notes */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Sale Notes <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={saleNotes}
                  onChange={(e) => setSaleNotes(e.target.value)}
                  placeholder="Auction reference, transfer paperwork, buyer remarks..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#006052]/20 focus:border-[#006052]"
                />
              </div>

              {/* Modal Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-[#006052] hover:bg-[#004d42] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Check className="h-4 w-4" />
                  <span>Confirm Vehicle Sale &amp; Foreclosure</span>
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

      {/* 4. VEHICLE STATUS HISTORY MODAL */}
      <VehicleStatusHistoryModal
        isOpen={activeModal === 'history'}
        onClose={() => setActiveModal(null)}
        vehicleRecord={record}
      />

      {/* 5. REPAYMENT SCHEDULE MODAL */}
      <RepaymentScheduleModal
        isOpen={activeModal === 'schedule'}
        onClose={() => setActiveModal(null)}
        loanDetails={loanDetailsForModal}
      />
    </div>
  );
};

export default VehicleDetailsView;
