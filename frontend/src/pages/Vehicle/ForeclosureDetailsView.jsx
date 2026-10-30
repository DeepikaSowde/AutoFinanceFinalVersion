import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Phone,
  User,
  FileText,
  FileCheck,
  IndianRupee,
  Calendar,
  Car,
  ShieldCheck,
  Check,
  AlertCircle,
  AlertTriangle,
  Clock,
  Database,
  ChevronRight,
  Receipt,
  X,
  ExternalLink,
  CheckCircle2,
  ArrowLeft,
  Coins,
  Calculator,
} from 'lucide-react';
import { formatDate } from '../../utils/dateUtils';
import { settleVehicleSale } from '../../services/vehicleApi';

const formatCurrency = (val) => {
  if (val === undefined || val === null || isNaN(Number(val))) return '₹0';
  return `₹${Math.round(Number(val)).toLocaleString('en-IN')}`;
};

/**
 * ForeclosureDetailsView — Three-Column Foreclosure Overview UI
 *
 * Requirements:
 * 1. Compact responsive three-column layout (Profile, Overview, Records & Actions).
 * 2. Clean page gutters (16-24px), no breadcrumbs, fits content naturally.
 * 3. Records & Actions: 3 buttons (Sale Details, Cost Breakdown, Accounting & Ledger) opening independent modal dialogs.
 *    - Sale Details dialog has "View Ledger Entry" removed.
 * 4. Customer Settlement KPI: Display-only card (not clickable as a whole), with a distinct "Manage Settlement" / "View Settlement" action button.
 * 5. Settlement Dialog: Mutually exclusive options based on financial outcome (Collect, Pay, Do Not Collect / Retain), with strict Pending accuracy and ledger integration.
 */
const ForeclosureDetailsView = ({
  record,
  loanOutstandingInfo,
  onBack,
  backLabel,
  onViewExpenseHistory,
  imageSrc,
  handleImageError,
  refreshData,
}) => {
  const navigate = useNavigate();

  // Dialog states for Records & Actions buttons: 'sale' | 'cost' | 'accounting' | null
  const [activePopup, setActivePopup] = useState(null);

  // Settlement Dialog state
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [isModifyingSettlement, setIsModifyingSettlement] = useState(false);

  // Settlement Form State inside Modal
  const [selectedDecision, setSelectedDecision] = useState(''); // 'recovery' | 'payout' | 'waive_loss' | 'retain_profit'
  const [settlementAmountInput, setSettlementAmountInput] = useState('');
  const [settlementNotesInput, setSettlementNotesInput] = useState('');
  const [settlementActionError, setSettlementActionError] = useState('');
  const [settlementSuccessAlert, setSettlementSuccessAlert] = useState('');
  const [isSavingSettlement, setIsSavingSettlement] = useState(false);

  // Close modals on Escape key
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setActivePopup(null);
        setShowSettlementModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Data extraction
  const vehicle = record?.vehicle || {};
  const customer = record?.customer || {};
  const loan = record?.loan || {};
  const fData = record?.foreclosure || {};
  const saleDetails = record?.vehicle?.saleDetails || record?.saleDetails || {};
  const calc = fData?.finalizedCalculation || {};

  const customerName = customer.name || 'Not recorded';
  const customerMobile = customer.mobile || 'Not available';
  const customerId = record?.customerId || customer.customerId || '—';
  const loanId = record?.loanId || loan.loanId || 'LN00001';
  const loanAmount =
    record?.loanAmount || loan.loanAmount || record?.loan?.loanAmount || loanOutstandingInfo?.principal || 0;
  const rawForeclosureDate =
    fData.saleDate ||
    saleDetails.saleDate ||
    fData.completedAt ||
    record?.foreclosureDate ||
    record?.closedDate;
  const foreclosureDate = formatDate(rawForeclosureDate) || '—';
  const regNo = vehicle.regNo || record?.regNo || 'TN 09 AB 1234';

  // Financial metrics
  const saleAmt = Number(fData.salePrice || saleDetails.salePrice || saleDetails.saleAmount || 0);
  const totalCost = Number(
    calc.totalForeclosureCost !== undefined
      ? calc.totalForeclosureCost
      : Number(saleDetails.vehicleExpenses || 0) + Number(loanOutstandingInfo?.outstandingAmount || 0)
  );
  const profitLoss = calc.profitLoss !== undefined ? Number(calc.profitLoss) : saleAmt - totalCost;
  const isProfit = profitLoss > 0;
  const isLoss = profitLoss < 0;
  const isBreakEven = profitLoss === 0;
  const shortfall = calc.shortfall !== undefined ? Number(calc.shortfall) : Math.abs(profitLoss);

  // Settlement data
  const settlement = fData.settlement || {};
  const isSettled = Boolean(
    settlement.status &&
      settlement.status !== 'Pending' &&
      (settlement.status === 'Completed' ||
        settlement.status === 'Waived' ||
        settlement.status === 'Retained' ||
        settlement.status === 'Partially Collected')
  );

  const recoveredAmt =
    settlement.type === 'recovery' && settlement.amount
      ? Number(settlement.amount || 0)
      : 0;
  const remainingShortfall = Math.max(0, shortfall - recoveredAmt);

  const vehicleExpensesVal =
    calc.vehicleExpenses !== undefined
      ? Number(calc.vehicleExpenses)
      : Number(saleDetails.vehicleExpenses || 0);
  const seizedInterestVal = Number(
    calc.seizedPeriodInterest || calc.components?.seizedPeriodInterest?.amount || 0
  );
  const penaltyVal = Number(calc.penalty || calc.components?.penalty?.amount || 0);

  // Total Outstanding strictly from loan balance at sale
  const totalOutstanding =
    calc.outstandingPrincipal !== undefined && calc.unpaidInterest !== undefined
      ? Number(calc.outstandingPrincipal) + Number(calc.unpaidInterest)
      : calc.components?.outstandingPrincipalAndInterest?.total !== undefined
      ? Number(calc.components.outstandingPrincipalAndInterest.total)
      : loanOutstandingInfo?.outstandingAmount !== undefined
      ? Number(loanOutstandingInfo.outstandingAmount)
      : Number(calc.outstandingPrincipal || 0) + Number(calc.unpaidInterest || 0);

  // Visual bar comparison proportion
  const maxComparisonVal = Math.max(saleAmt, totalCost, 1);
  const saleBarPct = Math.min(100, Math.max(0, Math.round((saleAmt / maxComparisonVal) * 100)));

  // Shortfall Summary Components (4 categories)
  const shortfallComponents = (() => {
    let unallocated = saleAmt;
    const list = [];

    // 1. Principal + Interest
    const pDue = totalOutstanding;
    const pSat = Math.min(unallocated, pDue);
    const pRem = Math.max(0, pDue - pSat);
    unallocated = Math.max(0, unallocated - pSat);
    list.push({
      id: 'principal_interest',
      name: 'Principal + Interest',
      icon: IndianRupee,
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
      id: 'vehicle_expenses',
      name: 'Vehicle Expenses',
      icon: Car,
      due: veDue,
      satisfied: veSat,
      remaining: veRem,
      status: veRem === 0 ? 'Satisfied' : 'Not Satisfied',
    });

    // 3. Penalty Charges
    const penDue = penaltyVal;
    const penSat = Math.min(unallocated, penDue);
    const penRem = Math.max(0, penDue - penSat);
    unallocated = Math.max(0, penDue - penSat);
    list.push({
      id: 'penalty_charges',
      name: 'Penalty Charges',
      icon: FileText,
      due: penDue,
      satisfied: penSat,
      remaining: penRem,
      status: penRem === 0 ? 'Satisfied' : 'Not Satisfied',
    });

    // 4. Seizure-period Interest
    const spiDue = seizedInterestVal;
    const spiSat = Math.min(unallocated, spiDue);
    const spiRem = Math.max(0, spiDue - spiSat);
    list.push({
      id: 'seizure_period_interest',
      name: 'Seizure-period Interest',
      icon: Clock,
      due: spiDue,
      satisfied: spiSat,
      remaining: spiRem,
      status: spiRem === 0 ? 'Satisfied' : 'Not Satisfied',
    });

    return list;
  })();

  // Precise Settlement Status formatting
  const getSettlementStatusInfo = () => {
    if (!settlement.status || settlement.status === 'Pending') {
      if (isBreakEven) {
        return {
          text: 'Break-Even',
          badgeText: 'Break-Even',
          badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
          isPending: false,
        };
      }
      return {
        text: 'Pending Settlement',
        badgeText: 'Pending',
        badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
        isPending: true,
      };
    }

    if (settlement.type === 'recovery') {
      const isFull = remainingShortfall === 0;
      return {
        text: isFull
          ? `Collected: ${formatCurrency(settlement.amount)}`
          : `Partially Collected: ${formatCurrency(settlement.amount)}`,
        badgeText: isFull ? 'Settled' : 'Partial',
        badgeClass: isFull
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : 'bg-sky-50 text-sky-700 border-sky-200',
        isPending: !isFull,
      };
    }

    if (settlement.type === 'payout') {
      return {
        text: `Paid: ${formatCurrency(settlement.amount)}`,
        badgeText: 'Paid',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        isPending: false,
      };
    }

    if (settlement.type === 'waiver' || settlement.status === 'Waived') {
      return {
        text: 'Not Collected',
        badgeText: 'Waived',
        badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
        isPending: false,
      };
    }

    if (settlement.type === 'retained' || settlement.status === 'Retained') {
      return {
        text: 'Profit Retained',
        badgeText: 'Retained',
        badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
        isPending: false,
      };
    }

    return {
      text: settlement.status,
      badgeText: settlement.status,
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
      isPending: false,
    };
  };

  const settlementStatus = getSettlementStatusInfo();

  // Ledger references: the sale's income row, and the rows the server booked
  // for the settlement (one income row per shortfall collection).
  const saleTxId = `INC-SALE-${vehicle.vehicleId || loanId}`;
  const recoveryTxId =
    (settlement.collections || []).map((c) => c.incomeId).filter(Boolean).join(', ') || '—';
  const payoutTxId = settlement.expenseId || '—';

  // Open Settlement Modal with initial defaults
  const handleOpenSettlementModal = () => {
    setSettlementActionError('');
    setSettlementSuccessAlert('');
    setIsModifyingSettlement(false);

    if (isLoss) {
      if (settlement.type === 'recovery') {
        setSelectedDecision('recovery');
        setSettlementAmountInput(remainingShortfall > 0 ? String(remainingShortfall) : '');
      } else if (settlement.type === 'waiver') {
        setSelectedDecision('waive_loss');
        setSettlementAmountInput('');
      } else if (settlement.type === 'payout') {
        setSelectedDecision('payout');
        setSettlementAmountInput(settlement.amount ? String(settlement.amount) : '');
      } else {
        setSelectedDecision('recovery');
        setSettlementAmountInput(String(Math.round(remainingShortfall || shortfall)));
      }
    } else if (isProfit) {
      if (settlement.type === 'payout') {
        setSelectedDecision('payout');
        setSettlementAmountInput(settlement.amount ? String(settlement.amount) : String(Math.round(profitLoss)));
      } else if (settlement.type === 'retained' || settlement.type === 'waiver') {
        setSelectedDecision('retain_profit');
        setSettlementAmountInput('');
      } else {
        setSelectedDecision('payout');
        setSettlementAmountInput(String(Math.round(profitLoss)));
      }
    } else {
      setSelectedDecision('breakeven');
      setSettlementAmountInput('');
    }

    setSettlementNotesInput(settlement.notes || '');
    setShowSettlementModal(true);
  };

  // Confirm and persist settlement decision. The server re-checks the amount
  // against the sale's shortfall / profit, books the income (collection) or
  // expense (payout), and keeps the decision in the vehicle's history.
  const handleConfirmSettlement = async () => {
    if (isSavingSettlement) return;
    setSettlementActionError('');
    setSettlementSuccessAlert('');
    setIsSavingSettlement(true);

    try {
      const numAmt = Math.round(Number(settlementAmountInput) || 0);
      let decision;

      if (isLoss) {
        if (selectedDecision === 'recovery') {
          if (numAmt <= 0) {
            throw new Error('Please enter a collection amount greater than ₹0.');
          }
          if (numAmt > remainingShortfall) {
            throw new Error(
              `Amount cannot exceed the remaining recoverable shortfall of ₹${remainingShortfall.toLocaleString('en-IN')}.`
            );
          }
          decision = 'recovery';
        } else if (selectedDecision === 'payout') {
          if (numAmt <= 0) {
            throw new Error('Please enter a valid payout amount greater than ₹0.');
          }
          decision = 'payout';
        } else if (selectedDecision === 'waive_loss') {
          decision = 'waiver';
        } else {
          throw new Error('Please choose a valid settlement decision.');
        }
      } else if (isProfit) {
        if (selectedDecision === 'payout') {
          if (numAmt <= 0) {
            throw new Error('Please enter a valid payout amount greater than ₹0.');
          }
          if (numAmt > profitLoss) {
            throw new Error(
              `Payout amount cannot exceed the total surplus of ₹${profitLoss.toLocaleString('en-IN')}.`
            );
          }
          decision = 'payout';
        } else if (selectedDecision === 'retain_profit') {
          decision = 'retained';
        } else {
          throw new Error('Please choose a valid settlement decision.');
        }
      } else {
        decision = 'breakeven';
      }

      await settleVehicleSale(vehicle.vehicleId, {
        decision,
        amount: ['recovery', 'payout'].includes(decision) ? numAmt : 0,
        notes: settlementNotesInput.trim(),
      });

      if (typeof refreshData === 'function') {
        refreshData();
      }

      setSettlementSuccessAlert('Settlement decision confirmed and successfully saved.');
      setTimeout(() => {
        setShowSettlementModal(false);
        setIsModifyingSettlement(false);
        setSettlementSuccessAlert('');
        setIsSavingSettlement(false);
      }, 1000);
    } catch (err) {
      setSettlementActionError(err.message || 'Failed to save settlement decision.');
      setIsSavingSettlement(false);
    }
  };

  return (
    <div className="w-full bg-[#f8fafc] min-h-screen py-4 px-4 sm:px-6 text-slate-800 font-sans">
      <div className="w-full max-w-[1440px] mx-auto space-y-4">
        {/* =========================================================
            TOP BAR: BACK BUTTON & TITLE WITH FORECLOSED BADGE
            (Breadcrumb removed as requested; clean gutters preserved)
        ========================================================= */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5 text-slate-500" />
              <span>{backLabel || 'Back'}</span>
            </button>
            <div className="h-4 w-px bg-slate-300 hidden sm:block" />
            <h1 className="page-title">
              Foreclosure Overview
            </h1>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200/80">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Foreclosed</span>
            </span>
          </div>

          {/* Quick Expense History Button */}
          {onViewExpenseHistory && (
            <button
              type="button"
              onClick={() => onViewExpenseHistory(record)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-600/30 bg-white hover:bg-emerald-50/60 text-emerald-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            >
              <Receipt className="h-3.5 w-3.5" />
              <span>Vehicle Expense History</span>
            </button>
          )}
        </div>

        {/* =========================================================
            RESPONSIVE THREE-COLUMN LAYOUT
            1. Left: Customer Profile (~18-20%)
            2. Center: Foreclosure Overview (~58-60%)
            3. Right: Records & Actions (~20-22%)
        ========================================================= */}
        <div className="flex flex-col lg:flex-row items-start gap-4 sm:gap-5">
          {/* =========================================================
              A. LEFT COLUMN — CUSTOMER AND VEHICLE PROFILE
          ========================================================= */}
          <div className="w-full lg:w-[230px] xl:w-[250px] shrink-0">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs">
              {/* Vehicle Image Container */}
              <div className="w-full bg-[#f1f5f9] rounded-xl p-3 flex items-center justify-center border border-slate-100/90 aspect-4/3 overflow-hidden">
                {imageSrc ? (
                  <img
                    src={imageSrc}
                    alt={regNo}
                    onError={handleImageError}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <Car className="h-16 w-16 text-slate-300 stroke-1" />
                )}
              </div>

              {/* Customer Name */}
              <h2 className="text-xl font-bold text-slate-900 mt-3.5 mb-3.5 tracking-tight truncate">
                {customerName}
              </h2>

              {/* Customer & Loan Profile Items */}
              <div className="space-y-3 text-xs">
                {/* Mobile */}
                <div className="flex items-start gap-2.5">
                  <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="text-[10px] font-medium text-slate-400 block leading-tight">Mobile</span>
                    <span className="text-xs font-semibold text-slate-800 break-all">{customerMobile}</span>
                  </div>
                </div>

                {/* Customer ID */}
                <div className="flex items-start gap-2.5">
                  <User className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="text-[10px] font-medium text-slate-400 block leading-tight">Customer ID</span>
                    <span className="text-xs font-semibold text-slate-800 truncate block">{customerId}</span>
                  </div>
                </div>

                {/* Loan ID */}
                <div className="flex items-start gap-2.5">
                  <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="text-[10px] font-medium text-slate-400 block leading-tight">Loan ID</span>
                    <span className="text-xs font-semibold text-slate-800 truncate block">{loanId}</span>
                  </div>
                </div>

                {/* Loan Amount */}
                <div className="flex items-start gap-2.5">
                  <IndianRupee className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="text-[10px] font-medium text-slate-400 block leading-tight">Loan Amount</span>
                    <span className="text-xs font-semibold text-slate-800">{formatCurrency(loanAmount)}</span>
                  </div>
                </div>

                {/* Foreclosure Date */}
                <div className="flex items-start gap-2.5">
                  <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="text-[10px] font-medium text-slate-400 block leading-tight">Foreclosure Date</span>
                    <span className="text-xs font-semibold text-slate-800">{foreclosureDate}</span>
                  </div>
                </div>
              </div>

              {/* Subtle Horizontal Divider */}
              <div className="border-t border-slate-100 my-3.5" />

              {/* Vehicle Registration */}
              <div className="flex items-start gap-2.5 mb-3.5">
                <Car className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-medium text-slate-400 block mb-1">Vehicle Registration</span>
                  <span className="inline-block px-2.5 py-1 bg-slate-100 border border-slate-200/70 rounded-md font-bold text-xs text-slate-800 tracking-wide">
                    {regNo}
                  </span>
                </div>
              </div>

              {/* Status Badges: Sold and Foreclosed */}
              <div className="flex items-center gap-1.5 pt-0.5">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                  <span className="h-3 w-3 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[8px] font-bold">
                    ✓
                  </span>
                  <span>Sold</span>
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200/80">
                  <ShieldCheck className="h-3 w-3 text-purple-600" />
                  <span>Foreclosed</span>
                </span>
              </div>
            </div>
          </div>

          {/* =========================================================
              B. CENTER COLUMN — FORECLOSURE OVERVIEW
          ========================================================= */}
          <div className="w-full lg:flex-1 min-w-0 space-y-4">
            {/* =========================================================
                B1. FOUR KPI CARDS (Single row on desktop)
            ========================================================= */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {/* KPI 1: Total Outstanding */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-col justify-between min-h-[110px]">
                <div className="h-8 w-8 rounded-full bg-cyan-50 text-cyan-600 flex items-center justify-center mb-1.5">
                  <IndianRupee className="h-4 w-4" />
                </div>
                <div>
                  <span className="text-xs font-medium text-slate-500 block leading-tight">Total Outstanding</span>
                  <p className="text-lg sm:text-xl font-bold text-slate-900 mt-0.5 tracking-tight">
                    {formatCurrency(totalOutstanding)}
                  </p>
                </div>
              </div>

              {/* KPI 2: Vehicle Sale Amount */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-col justify-between min-h-[110px]">
                <div className="h-8 w-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-1.5">
                  <Car className="h-4 w-4" />
                </div>
                <div>
                  <span className="text-xs font-medium text-slate-500 block leading-tight">Vehicle Sale Amount</span>
                  <p className="text-lg sm:text-xl font-bold text-emerald-600 mt-0.5 tracking-tight">
                    {formatCurrency(saleAmt)}
                  </p>
                </div>
              </div>

              {/* KPI 3: Foreclosure Loss (or Profit / Net Balance) */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-col justify-between min-h-[110px]">
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center mb-1.5 ${
                    isProfit ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                  }`}
                >
                  <span
                    className={`h-4 w-4 rounded-full flex items-center justify-center text-white text-[10px] font-bold ${
                      isProfit ? 'bg-emerald-600' : 'bg-rose-600'
                    }`}
                  >
                    {isProfit ? '+' : '–'}
                  </span>
                </div>
                <div>
                  <span className="text-xs font-medium text-slate-500 block leading-tight">
                    {isProfit ? 'Foreclosure Profit' : isLoss ? 'Foreclosure Loss' : 'Net Balance'}
                  </span>
                  <p
                    className={`text-lg sm:text-xl font-bold mt-0.5 tracking-tight ${
                      isProfit ? 'text-emerald-600' : isLoss ? 'text-rose-600' : 'text-slate-900'
                    }`}
                  >
                    {isProfit
                      ? `+${formatCurrency(profitLoss)}`
                      : isLoss
                      ? `-${formatCurrency(shortfall)}`
                      : '₹0'}
                  </p>
                </div>
              </div>

              {/* KPI 4: Customer Settlement (Display-only summary card with distinct action button) */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-col justify-between min-h-[110px]">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="h-8 w-8 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center">
                    <User className="h-4 w-4" />
                  </div>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${settlementStatus.badgeClass}`}
                  >
                    {settlementStatus.badgeText}
                  </span>
                </div>

                <div className="my-1">
                  <span className="text-xs font-medium text-slate-500 block leading-tight">
                    Customer Settlement
                  </span>
                  <p className="text-sm sm:text-base font-bold text-slate-900 mt-0.5 truncate tracking-tight">
                    {settlementStatus.text}
                  </p>
                </div>

                {/* Distinct Action Button (Manage Settlement / View Settlement) */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleOpenSettlementModal}
                    className={`w-full py-1 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 shadow-2xs ${
                      settlementStatus.isPending
                        ? 'bg-purple-600 hover:bg-purple-700 text-white'
                        : 'border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700'
                    }`}
                  >
                    <span>{settlementStatus.isPending ? 'Manage Settlement' : 'View Settlement'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* =========================================================
                B2. SALE VS REQUIRED AMOUNT PANEL (Horizontal comparison)
            ========================================================= */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs">
              {/* Header */}
              <div className="flex items-center gap-2 mb-3.5">
                <div className="h-6 w-6 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200/60">
                  <FileCheck className="h-3.5 w-3.5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Sale vs Required Amount</h3>
              </div>

              {/* Comparison Row */}
              <div className="flex flex-col md:flex-row items-center gap-4">
                {/* Left Progress Bar Section */}
                <div className="flex-1 w-full space-y-1.5">
                  <div className="flex items-end justify-between">
                    <div>
                      <span className="text-[11px] font-medium text-slate-400 block leading-none">Sale Amount</span>
                      <span className="text-lg sm:text-xl font-bold text-emerald-600 mt-1 inline-block">
                        {formatCurrency(saleAmt)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] font-medium text-slate-400 block leading-none">Required Amount</span>
                      <span className="text-lg sm:text-xl font-bold text-slate-900 mt-1 inline-block">
                        {formatCurrency(totalCost)}
                      </span>
                    </div>
                  </div>

                  {/* Horizontal Bar with Target Marker */}
                  <div className="w-full h-3.5 bg-slate-100 rounded-full relative overflow-visible mt-1.5">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${saleBarPct}%` }}
                    />
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-slate-400 rounded-full shadow-2xs" />
                  </div>
                </div>

                {/* Right Deficit / Shortfall Card */}
                {isLoss ? (
                  <div className="w-full md:w-auto min-w-[150px] p-3 rounded-xl bg-rose-50/70 border border-rose-200/70 flex flex-col items-center justify-center text-center gap-0.5 shrink-0">
                    <div className="flex items-center gap-1.5 text-rose-600">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      <span className="text-xs font-semibold">Deficit / Shortfall</span>
                    </div>
                    <span className="text-base sm:text-lg font-black text-rose-600 tracking-tight">
                      -{formatCurrency(shortfall)}
                    </span>
                  </div>
                ) : isProfit ? (
                  <div className="w-full md:w-auto min-w-[150px] p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/70 flex flex-col items-center justify-center text-center gap-0.5 shrink-0">
                    <div className="flex items-center gap-1.5 text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      <span className="text-xs font-semibold">Surplus</span>
                    </div>
                    <span className="text-base sm:text-lg font-black text-emerald-700 tracking-tight">
                      +{formatCurrency(profitLoss)}
                    </span>
                  </div>
                ) : (
                  <div className="w-full md:w-auto min-w-[150px] p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col items-center justify-center text-center gap-0.5 shrink-0">
                    <span className="text-xs font-semibold text-slate-500">Break-Even</span>
                    <span className="text-base font-bold text-slate-700">₹0</span>
                  </div>
                )}
              </div>

              {/* =========================================================
                  B3. DATABASE LOCATION STRIP
              ========================================================= */}
              <div className="mt-4 p-3 rounded-xl bg-slate-50/90 border border-slate-100 flex items-center gap-3">
                <Database className="h-4.5 w-4.5 text-slate-600 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-slate-800 leading-snug">Database Location</p>
                  <p className="text-[11px] text-slate-400">Foreclosure records · Ledger synced</p>
                </div>
              </div>
            </div>

            {/* =========================================================
                B4. SHORTFALL SUMMARY PANEL (4 equal-width cards)
            ========================================================= */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs">
              {/* Header */}
              <div className="flex items-center gap-2 mb-3.5">
                <AlertTriangle className="h-4 w-4 text-rose-500" />
                <h3 className="text-sm font-bold text-slate-900">Shortfall Summary</h3>
              </div>

              {/* 4 Cards Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                {shortfallComponents.map((comp) => {
                  const isSatisfied = comp.status === 'Satisfied';
                  const CompIcon = comp.icon;
                  const displayAmount = comp.due;

                  return (
                    <div
                      key={comp.id}
                      className={`rounded-2xl border p-3.5 flex flex-col justify-between min-h-[125px] transition-all ${
                        isSatisfied
                          ? 'bg-[#f0fbf7] border-emerald-200/80 shadow-2xs'
                          : 'bg-[#fff5f5] border-rose-200/80 shadow-2xs'
                      }`}
                    >
                      <div>
                        <div
                          className={`h-7 w-7 rounded-full flex items-center justify-center mb-2 ${
                            isSatisfied
                              ? 'bg-emerald-100/90 text-emerald-700'
                              : 'bg-rose-100/90 text-rose-600'
                          }`}
                        >
                          <CompIcon className="h-3.5 w-3.5" />
                        </div>
                        <span className="text-xs font-medium text-slate-600 block leading-tight">
                          {comp.name}
                        </span>
                        <p
                          className={`text-base sm:text-lg font-bold mt-1 tracking-tight ${
                            isSatisfied ? 'text-slate-900' : 'text-rose-600'
                          }`}
                        >
                          {formatCurrency(displayAmount)}
                        </p>
                      </div>

                      {/* Status Pill at Bottom */}
                      <div className="mt-2.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isSatisfied
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200/80'
                              : 'bg-rose-100 text-rose-700 border border-rose-200/80'
                          }`}
                        >
                          {isSatisfied ? (
                            <>
                              <Check className="h-3 w-3 stroke-[2.5]" />
                              <span>Satisfied</span>
                            </>
                          ) : (
                            <>
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-600 inline-block" />
                              <span>Not Satisfied</span>
                            </>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* =========================================================
              C. RIGHT COLUMN — RECORDS & ACTIONS
              Replaced accordion controls with three distinct buttons
              that open independent modal popup dialogs.
          ========================================================= */}
          <div className="w-full lg:w-[230px] xl:w-[250px] shrink-0">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs">
              {/* Header */}
              <div className="flex items-center gap-2 mb-4">
                <FileText className="h-4.5 w-4.5 text-slate-700" />
                <h2 className="text-sm font-bold text-slate-900">Records & Actions</h2>
              </div>

              {/* Three Distinct Action Buttons */}
              <div className="space-y-3">
                {/* Button 1: Sale Details */}
                <button
                  type="button"
                  onClick={() => setActivePopup('sale')}
                  className="w-full p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-between text-left transition-all cursor-pointer group shadow-2xs hover:border-slate-300"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center shrink-0 group-hover:bg-sky-100 transition-colors">
                      <ShieldCheck className="h-4.5 w-4.5" />
                    </div>
                    <span className="text-xs sm:text-sm font-bold text-slate-800">Sale Details</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
                </button>

                {/* Button 2: Cost Breakdown */}
                <button
                  type="button"
                  onClick={() => setActivePopup('cost')}
                  className="w-full p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-between text-left transition-all cursor-pointer group shadow-2xs hover:border-slate-300"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:bg-emerald-100 transition-colors">
                      <IndianRupee className="h-4.5 w-4.5" />
                    </div>
                    <span className="text-xs sm:text-sm font-bold text-slate-800">Cost Breakdown</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
                </button>

                {/* Button 3: Accounting & Ledger */}
                <button
                  type="button"
                  onClick={() => setActivePopup('accounting')}
                  className="w-full p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-between text-left transition-all cursor-pointer group shadow-2xs hover:border-slate-300"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 group-hover:bg-purple-100 transition-colors">
                      <FileCheck className="h-4.5 w-4.5" />
                    </div>
                    <span className="text-xs sm:text-sm font-bold text-slate-800">Accounting & Ledger</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================
          POPUP DIALOG 1: SALE DETAILS
          (View Ledger Entry removed as requested)
      ========================================================= */}
      {activePopup === 'sale' && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setActivePopup(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg p-5 sm:p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-sky-600" />
                <h3 className="text-base sm:text-lg font-bold text-slate-900">Vehicle Sale Details</h3>
              </div>
              <button
                type="button"
                onClick={() => setActivePopup(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 bg-slate-50 rounded-lg">
                <span className="text-slate-400 block text-[11px] font-medium">Vehicle Reg No</span>
                <span className="font-bold text-slate-900">{regNo}</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg">
                <span className="text-slate-400 block text-[11px] font-medium">Sale Date</span>
                <span className="font-bold text-slate-900">
                  {formatDate(fData.saleDate || saleDetails.saleDate)}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg">
                <span className="text-slate-400 block text-[11px] font-medium">Sale Amount</span>
                <span className="font-bold text-emerald-600">{formatCurrency(saleAmt)}</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg">
                <span className="text-slate-400 block text-[11px] font-medium">Vehicle Expenses</span>
                <span className="font-bold text-slate-900">{formatCurrency(vehicleExpensesVal)}</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg">
                <span className="text-slate-400 block text-[11px] font-medium">Buyer Name</span>
                <span className="font-bold text-slate-900">
                  {fData.buyerName || saleDetails.buyerName || 'Direct Sale / Auction'}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg">
                <span className="text-slate-400 block text-[11px] font-medium">Buyer Mobile</span>
                <span className="font-bold text-slate-900">
                  {fData.buyerPhone || saleDetails.buyerPhone || 'Not recorded'}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg">
                <span className="text-slate-400 block text-[11px] font-medium">Sale Method</span>
                <span className="font-bold text-slate-900">
                  {fData.saleMethod || saleDetails.saleMethod || 'Direct Sale'}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg">
                <span className="text-slate-400 block text-[11px] font-medium">Account Status</span>
                <span className="font-bold text-purple-700">Foreclosed (Account Closed)</span>
              </div>
              {(fData.notes || saleDetails.notes) && (
                <div className="p-2.5 bg-slate-50 rounded-lg col-span-2">
                  <span className="text-slate-400 block text-[11px] font-medium">Sale Notes</span>
                  <p className="font-medium text-slate-700 mt-0.5">{fData.notes || saleDetails.notes}</p>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setActivePopup(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          POPUP DIALOG 2: COST BREAKDOWN
      ========================================================= */}
      {activePopup === 'cost' && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setActivePopup(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg p-5 sm:p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-emerald-600" />
                <h3 className="text-base sm:text-lg font-bold text-slate-900">Cost Breakdown</h3>
              </div>
              <button
                type="button"
                onClick={() => setActivePopup(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 text-xs font-bold text-slate-800">
                <span>Foreclosure Cost Categories (At Sale)</span>
                <span className="text-slate-400 font-normal">Amount</span>
              </div>

              {/* Principal + Interest */}
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <div>
                  <span className="font-semibold text-slate-800">Outstanding Principal & Interest</span>
                  <span className="block text-[11px] text-slate-400">
                    Principal: {formatCurrency(calc.outstandingPrincipal || 0)} + Unpaid Interest:{' '}
                    {formatCurrency(calc.unpaidInterest || 0)}
                  </span>
                </div>
                <span className="font-bold text-slate-900">{formatCurrency(totalOutstanding)}</span>
              </div>

              {/* Vehicle Expenses */}
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <div>
                  <span className="font-semibold text-slate-800">Vehicle Expenses</span>
                  <span className="block text-[11px] text-slate-400">Towing, repossession, storage, repairs</span>
                </div>
                <span className="font-bold text-slate-900">{formatCurrency(vehicleExpensesVal)}</span>
              </div>

              {/* Seized-Period Interest */}
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <div>
                  <span className="font-semibold text-slate-800">Seized-Period Interest</span>
                  <span className="block text-[11px] text-slate-400">
                    Basis: {calc.components?.seizedPeriodInterest?.basis || 'Option A'}
                    {calc.components?.seizedPeriodInterest?.details?.duration &&
                      ` • ${calc.components.seizedPeriodInterest.details.duration} ${
                        calc.components.seizedPeriodInterest.details.unit || 'Months'
                      }`}
                  </span>
                </div>
                <span className="font-bold text-slate-900">{formatCurrency(seizedInterestVal)}</span>
              </div>

              {/* Applicable Penalty */}
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <div>
                  <span className="font-semibold text-slate-800">Applicable Penalty</span>
                  <span className="block text-[11px] text-slate-400">Overdue charges per settings</span>
                </div>
                <span className="font-bold text-slate-900">{formatCurrency(penaltyVal)}</span>
              </div>

              {/* Total Required */}
              <div className="flex items-center justify-between pt-2 text-slate-900 font-bold text-sm">
                <span>Total Required Foreclosure Cost:</span>
                <span className="text-emerald-700 font-extrabold">{formatCurrency(totalCost)}</span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setActivePopup(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          POPUP DIALOG 3: ACCOUNTING & LEDGER
      ========================================================= */}
      {activePopup === 'accounting' && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setActivePopup(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg p-5 sm:p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileCheck className="h-5 w-5 text-purple-600" />
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  Accounting & Ledger References
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActivePopup(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Vehicle Sale Income Entry */}
              <div className="p-3 bg-slate-50 rounded-xl space-y-1.5 border border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">Vehicle Sale Proceeds</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    Ledger Income
                  </span>
                </div>
                <p className="text-slate-600 font-medium text-[11px]">
                  Ref:{' '}
                  <code className="bg-white px-1.5 py-0.5 rounded font-mono font-bold text-slate-800 border border-slate-200">
                    {saleTxId}
                  </code>
                </p>
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1.5 border-t border-slate-200/60 mt-1">
                  <span>
                    Amount: <strong className="text-slate-800">{formatCurrency(saleAmt)}</strong>
                  </span>
                  <span>{formatDate(fData.saleDate || saleDetails.saleDate)}</span>
                </div>
              </div>

              {/* Settlement Transaction Entry */}
              <div className="p-3 bg-slate-50 rounded-xl space-y-1.5 border border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">Customer Settlement Transaction</span>
                  {settlement.status === 'Completed' || settlement.status === 'Partially Collected' ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                      {settlement.type === 'payout' ? 'Ledger Expense' : 'Ledger Income'}
                    </span>
                  ) : settlement.status === 'Waived' || settlement.status === 'Retained' ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-800 border border-purple-200">
                      Confirmed (No Financial Entry)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                      Pending Decision
                    </span>
                  )}
                </div>

                {settlement.type === 'recovery' && settlement.amount > 0 ? (
                  <>
                    <p className="text-slate-600 font-medium text-[11px]">
                      Ref:{' '}
                      <code className="bg-white px-1.5 py-0.5 rounded font-mono font-bold text-slate-800 border border-slate-200">
                        {recoveryTxId}
                      </code>
                    </p>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1.5 border-t border-slate-200/60 mt-1">
                      <span>
                        Collected: <strong className="text-slate-800">{formatCurrency(settlement.amount)}</strong>
                      </span>
                      <span>{formatDate(settlement.timestamp)}</span>
                    </div>
                  </>
                ) : settlement.type === 'payout' && settlement.amount > 0 ? (
                  <>
                    <p className="text-slate-600 font-medium text-[11px]">
                      Ref:{' '}
                      <code className="bg-white px-1.5 py-0.5 rounded font-mono font-bold text-slate-800 border border-slate-200">
                        {payoutTxId}
                      </code>
                    </p>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1.5 border-t border-slate-200/60 mt-1">
                      <span>
                        Paid: <strong className="text-slate-800">{formatCurrency(settlement.amount)}</strong>
                      </span>
                      <span>{formatDate(settlement.timestamp)}</span>
                    </div>
                  </>
                ) : (
                  <p className="text-slate-500 text-[11px] leading-relaxed">
                    {settlement.notes ||
                      (isLoss
                        ? 'Shortfall has not been collected from the customer.'
                        : 'Settlement decision pending.')}
                  </p>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => navigate('/ledger')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
              >
                <span>Open in Ledger Module</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setActivePopup(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          POPUP DIALOG 4: CUSTOMER SETTLEMENT WORKFLOW
          (Dedicated modal dialog opened via Manage/View Settlement button)
      ========================================================= */}
      {showSettlementModal && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setShowSettlementModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-xl p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Coins className="h-5 w-5 text-purple-600" />
                <h3 className="text-base sm:text-lg font-bold text-slate-900">Customer Settlement</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSettlementModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Notifications */}
            {settlementSuccessAlert && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{settlementSuccessAlert}</span>
              </div>
            )}
            {settlementActionError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                <span>{settlementActionError}</span>
              </div>
            )}

            {/* Financial Summary Box */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Customer:</span>
                <span className="font-bold text-slate-900">
                  {customerName} ({regNo})
                </span>
              </div>

              {isLoss ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Total Foreclosure Shortfall (Loss):</span>
                    <span className="font-extrabold text-rose-600 text-sm">{formatCurrency(shortfall)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Amount Already Collected:</span>
                    <span className="font-bold text-slate-800">{formatCurrency(recoveredAmt)}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                    <span className="text-slate-600 font-bold">Outstanding Recoverable Shortfall:</span>
                    <span className="font-extrabold text-rose-700 text-sm">
                      {formatCurrency(remainingShortfall)}
                    </span>
                  </div>
                </>
              ) : isProfit ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Total Sale Surplus (Profit):</span>
                    <span className="font-extrabold text-emerald-700 text-sm">+{formatCurrency(profitLoss)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Customer Profit Paid:</span>
                    <span className="font-bold text-slate-800">
                      {formatCurrency(settlement.type === 'payout' ? settlement.amount : 0)}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Outcome:</span>
                  <span className="font-bold text-slate-800">Break-Even (Sale matches required cost)</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                <span className="text-slate-500 font-medium">Current Status:</span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${settlementStatus.badgeClass}`}
                >
                  {settlementStatus.text}
                </span>
              </div>
            </div>

            {/* View Mode (if already settled and not modifying) */}
            {isSettled && !isModifyingSettlement ? (
              <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2.5 text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="font-bold text-slate-900">
                    {settlement.action || settlement.notes || 'Settlement Decision Confirmed'}
                  </span>
                </div>
                {settlement.notes && <p className="text-slate-600 pl-6 leading-relaxed">{settlement.notes}</p>}
                {settlement.timestamp && (
                  <p className="text-[11px] text-slate-400 pl-6">
                    Recorded on {formatDate(settlement.timestamp)} •{' '}
                    {settlement.type === 'recovery'
                      ? `Ledger Reference: ${recoveryTxId}`
                      : settlement.type === 'payout'
                      ? `Ledger Reference: ${payoutTxId}`
                      : 'No financial transaction'}
                  </p>
                )}
                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setIsModifyingSettlement(true);
                      setSelectedDecision(settlement.type === 'recovery' ? 'recovery' : 'waive_loss');
                      setSettlementAmountInput(
                        remainingShortfall > 0 ? String(remainingShortfall) : String(settlement.amount || '')
                      );
                      setSettlementNotesInput(settlement.notes || '');
                    }}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    Modify Settlement Decision
                  </button>
                </div>
              </div>
            ) : (
              /* Interactive Settlement Decision Options */
              <div className="space-y-3.5 pt-1">
                <span className="text-xs font-bold text-slate-800 block">Select Settlement Decision:</span>

                {/* =========================================================
                    CASE A: WHEN FORECLOSURE HAS A SHORTFALL / LOSS
                ========================================================= */}
                {isLoss && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      {/* Option 1: Collect from Customer */}
                      <label
                        className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                          selectedDecision === 'recovery'
                            ? 'bg-rose-50/40 border-rose-500 ring-2 ring-rose-500/20'
                            : 'bg-white border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="settlementLossChoice"
                          value="recovery"
                          checked={selectedDecision === 'recovery'}
                          onChange={() => setSelectedDecision('recovery')}
                          className="mt-0.5 text-rose-600 focus:ring-rose-500"
                        />
                        <div className="flex-1 text-xs">
                          <span className="font-bold text-slate-900 block">Collect from Customer</span>
                          <span className="text-slate-500 text-[11px] block mt-0.5">
                            Recover shortfall from the customer. Creates an Income transaction in the Ledger.
                          </span>
                        </div>
                      </label>

                      {/* Option 2: Pay Customer */}
                      <label
                        className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                          selectedDecision === 'payout'
                            ? 'bg-sky-50/40 border-sky-500 ring-2 ring-sky-500/20'
                            : 'bg-white border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="settlementLossChoice"
                          value="payout"
                          checked={selectedDecision === 'payout'}
                          onChange={() => setSelectedDecision('payout')}
                          className="mt-0.5 text-sky-600 focus:ring-sky-500"
                        />
                        <div className="flex-1 text-xs">
                          <span className="font-bold text-slate-900 block">Pay Customer</span>
                          <span className="text-slate-500 text-[11px] block mt-0.5">
                            Customer refund/payout permitted per special policy. Creates an Expense transaction.
                          </span>
                        </div>
                      </label>

                      {/* Option 3: Do Not Collect / No Settlement */}
                      <label
                        className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                          selectedDecision === 'waive_loss'
                            ? 'bg-purple-50/40 border-purple-500 ring-2 ring-purple-500/20'
                            : 'bg-white border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="settlementLossChoice"
                          value="waive_loss"
                          checked={selectedDecision === 'waive_loss'}
                          onChange={() => setSelectedDecision('waive_loss')}
                          className="mt-0.5 text-purple-600 focus:ring-purple-500"
                        />
                        <div className="flex-1 text-xs">
                          <span className="font-bold text-slate-900 block">
                            Do Not Collect / No Settlement
                          </span>
                          <span className="text-slate-500 text-[11px] block mt-0.5">
                            The company waives recovery. No Income or Expense transaction will be created in the
                            Ledger.
                          </span>
                        </div>
                      </label>
                    </div>

                    {/* Sub-form when Collect from Customer is selected */}
                    {selectedDecision === 'recovery' && (
                      <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50/20 space-y-3 text-xs animate-in fade-in duration-150">
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">
                            Amount Collected from Customer (₹) <span className="text-rose-500">*</span>
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="1"
                              max={remainingShortfall}
                              step="any"
                              value={settlementAmountInput}
                              onChange={(e) => setSettlementAmountInput(e.target.value)}
                              placeholder={`Up to ${remainingShortfall}`}
                              className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                            />
                            <button
                              type="button"
                              onClick={() => setSettlementAmountInput(String(Math.round(remainingShortfall)))}
                              className="px-2.5 py-1.5 rounded-lg border border-rose-300 bg-rose-50 text-rose-800 text-xs font-bold whitespace-nowrap hover:bg-rose-100 cursor-pointer"
                            >
                              Full Shortfall
                            </button>
                          </div>
                          <span className="text-[10px] text-slate-400 mt-1 block">
                            Maximum recoverable: {formatCurrency(remainingShortfall)}
                          </span>
                        </div>

                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">
                            Recovery Notes (Optional)
                          </label>
                          <input
                            type="text"
                            value={settlementNotesInput}
                            onChange={(e) => setSettlementNotesInput(e.target.value)}
                            placeholder="Cash receipt number, UPI reference, remarks..."
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                          />
                        </div>
                      </div>
                    )}

                    {/* Sub-form when Pay Customer is selected */}
                    {selectedDecision === 'payout' && (
                      <div className="p-3.5 rounded-xl border border-sky-200 bg-sky-50/20 space-y-3 text-xs animate-in fade-in duration-150">
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">
                            Payout Amount (₹) <span className="text-sky-600">*</span>
                          </label>
                          <input
                            type="number"
                            min="1"
                            step="any"
                            value={settlementAmountInput}
                            onChange={(e) => setSettlementAmountInput(e.target.value)}
                            placeholder="Enter amount to pay customer"
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">
                            Payout Notes (Optional)
                          </label>
                          <input
                            type="text"
                            value={settlementNotesInput}
                            onChange={(e) => setSettlementNotesInput(e.target.value)}
                            placeholder="Approval notes, transfer reference..."
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                          />
                        </div>
                      </div>
                    )}

                    {/* Sub-form when Do Not Collect is selected */}
                    {selectedDecision === 'waive_loss' && (
                      <div className="p-3.5 rounded-xl border border-purple-200 bg-purple-50/20 space-y-2 text-xs animate-in fade-in duration-150">
                        <label className="block font-semibold text-slate-700">Reason / Notes (Optional)</label>
                        <input
                          type="text"
                          value={settlementNotesInput}
                          onChange={(e) => setSettlementNotesInput(e.target.value)}
                          placeholder="Management approval, non-recovery reason..."
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                        />
                        <span className="text-[11px] text-purple-700 block">
                          ✓ No amount required. Status will be recorded as <strong>Not Collected</strong> without
                          any Ledger transaction.
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* =========================================================
                    CASE B: WHEN FORECLOSURE HAS A SURPLUS
                ========================================================= */}
                {isProfit && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      {/* Option 1: Pay Customer */}
                      <label
                        className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                          selectedDecision === 'payout'
                            ? 'bg-emerald-50/40 border-emerald-500 ring-2 ring-emerald-500/20'
                            : 'bg-white border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="settlementProfitChoice"
                          value="payout"
                          checked={selectedDecision === 'payout'}
                          onChange={() => setSelectedDecision('payout')}
                          className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                        />
                        <div className="flex-1 text-xs">
                          <span className="font-bold text-slate-900 block">Pay Customer</span>
                          <span className="text-slate-500 text-[11px] block mt-0.5">
                            Pay sale surplus profit to the customer. Creates an Expense transaction in the Ledger.
                          </span>
                        </div>
                      </label>

                      {/* Option 2: Retain / No Customer Payout */}
                      <label
                        className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                          selectedDecision === 'retain_profit'
                            ? 'bg-purple-50/40 border-purple-500 ring-2 ring-purple-500/20'
                            : 'bg-white border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="settlementProfitChoice"
                          value="retain_profit"
                          checked={selectedDecision === 'retain_profit'}
                          onChange={() => setSelectedDecision('retain_profit')}
                          className="mt-0.5 text-purple-600 focus:ring-purple-500"
                        />
                        <div className="flex-1 text-xs">
                          <span className="font-bold text-slate-900 block">
                            Retain / No Customer Payout
                          </span>
                          <span className="text-slate-500 text-[11px] block mt-0.5">
                            Retain surplus profit. No Expense transaction will be created in the Ledger.
                          </span>
                        </div>
                      </label>
                    </div>

                    {/* Sub-form for Pay Customer */}
                    {selectedDecision === 'payout' && (
                      <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/20 space-y-3 text-xs animate-in fade-in duration-150">
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">
                            Amount to Pay Customer (₹) <span className="text-emerald-700">*</span>
                          </label>
                          <input
                            type="number"
                            min="1"
                            max={profitLoss}
                            step="any"
                            value={settlementAmountInput}
                            onChange={(e) => setSettlementAmountInput(e.target.value)}
                            placeholder={`Up to ${profitLoss}`}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                          />
                          <span className="text-[10px] text-slate-400 mt-1 block">
                            Maximum payable surplus: {formatCurrency(profitLoss)}
                          </span>
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">Notes (Optional)</label>
                          <input
                            type="text"
                            value={settlementNotesInput}
                            onChange={(e) => setSettlementNotesInput(e.target.value)}
                            placeholder="Voucher reference, bank transfer ID..."
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                          />
                        </div>
                      </div>
                    )}

                    {/* Sub-form for Retain Surplus */}
                    {selectedDecision === 'retain_profit' && (
                      <div className="p-3.5 rounded-xl border border-purple-200 bg-purple-50/20 space-y-2 text-xs animate-in fade-in duration-150">
                        <label className="block font-semibold text-slate-700">Reason / Notes (Optional)</label>
                        <input
                          type="text"
                          value={settlementNotesInput}
                          onChange={(e) => setSettlementNotesInput(e.target.value)}
                          placeholder="Management approval, policy reason..."
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                        />
                        <span className="text-[11px] text-purple-700 block">
                          ✓ No payment required. Status will be recorded as <strong>Profit Retained</strong> without
                          any Ledger expense.
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* =========================================================
                    CASE C: BREAK-EVEN
                ========================================================= */}
                {isBreakEven && (
                  <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/60 text-xs text-blue-900 space-y-1">
                    <p className="font-bold">No Settlement Required</p>
                    <p className="text-blue-800">
                      Sale proceeds equal total foreclosure cost. No shortfall recovery or customer payout is
                      needed.
                    </p>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setShowSettlementModal(false);
                      setIsModifyingSettlement(false);
                    }}
                    className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    disabled={isSavingSettlement}
                    onClick={handleConfirmSettlement}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    {isSavingSettlement ? (
                      <span>Saving...</span>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        <span>Confirm Settlement</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ForeclosureDetailsView;
