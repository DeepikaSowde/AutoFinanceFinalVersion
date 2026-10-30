import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowDownUp,
  Save,
  RotateCcw,
  CheckCircle2,
  GripVertical,
  Percent,
  Landmark,
  AlertTriangle,
  X,
  HelpCircle,
  ArrowRight,
  Info,
  Check,
} from 'lucide-react';
import {
  getPaymentAllocationSettings,
  loadPaymentAllocationSettings,
  savePaymentAllocationSettings,
  COMPONENT_TYPES,
  DEFAULT_ALLOCATION_ORDER,
} from '../../utils/paymentAllocationSettings';

const COMPONENT_DETAILS = {
  [COMPONENT_TYPES.INTEREST]: {
    id: COMPONENT_TYPES.INTEREST,
    name: 'Interest',
    icon: Percent,
    iconBg: 'bg-emerald-50 text-[#006052] border border-emerald-100',
    description: 'Loan interest charges. Collected towards the interest portion of the installment.',
    colorTag: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  },
  [COMPONENT_TYPES.PRINCIPAL]: {
    id: COMPONENT_TYPES.PRINCIPAL,
    name: 'Principal',
    icon: Landmark,
    iconBg: 'bg-blue-50 text-blue-700 border border-blue-100',
    description: 'Core loan principal balance. Directly reduces the outstanding principal debt.',
    colorTag: 'text-blue-700 bg-blue-50 border-blue-200',
  },
};

const PaymentAllocationSettings = () => {
  const navigate = useNavigate();

  // Settings State
  const [savedSettings, setSavedSettings] = useState(() => getPaymentAllocationSettings());
  const [allocationOrder, setAllocationOrder] = useState(() => getPaymentAllocationSettings().allocationOrder);

  // UI States
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showHowItWorksModal, setShowHowItWorksModal] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // The saved order from the server.
  useEffect(() => {
    let active = true;
    loadPaymentAllocationSettings()
      .then((loaded) => {
        if (!active) return;
        setSavedSettings(loaded);
        setAllocationOrder(loaded.allocationOrder);
      })
      .catch((err) => active && showToast(`Could not load the settings: ${err.message}`));
    return () => {
      active = false;
    };
  }, []);

  // Handle Escape key to close modals
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showHowItWorksModal) setShowHowItWorksModal(false);
        if (showConfirmModal) setShowConfirmModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showHowItWorksModal, showConfirmModal]);

  const hasChanges = JSON.stringify(allocationOrder) !== JSON.stringify(savedSettings.allocationOrder);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Swap / Switch the two items
  const handleSwap = () => {
    setAllocationOrder((prev) => [prev[1], prev[0]]);
  };

  // HTML5 Drag and Drop handlers
  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newOrder = [...allocationOrder];
    const [movedItem] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, movedItem);

    setAllocationOrder(newOrder);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Discard unsaved changes
  const handleCancelChanges = () => {
    setAllocationOrder([...savedSettings.allocationOrder]);
    showToast('Unsaved changes discarded.');
  };

  // Reset to default settings
  const handleRestoreDefaults = () => {
    const defaultOrder = [...DEFAULT_ALLOCATION_ORDER];
    if (JSON.stringify(savedSettings.allocationOrder) === JSON.stringify(defaultOrder)) {
      setAllocationOrder(defaultOrder);
      showToast('Allocation priority is already set to defaults.');
      return;
    }
    setAllocationOrder(defaultOrder);
    setShowConfirmModal(true);
  };

  // Trigger Confirmation Modal before saving
  const handleInitiateSave = () => {
    if (!hasChanges) return;
    setShowConfirmModal(true);
  };

  // Confirm and Persist. The server applies the order to payments posted
  // from now on; payments already posted keep their split.
  const handleConfirmSave = async () => {
    try {
      const saved = await savePaymentAllocationSettings({ allocationOrder });
      setSavedSettings(saved);
      showToast('Payment allocation order updated successfully!');
    } catch (err) {
      showToast(`Could not save the allocation order: ${err.message}`);
    } finally {
      setShowConfirmModal(false);
    }
  };

  // Compute dynamic example values for "How It Works" modal
  const firstCompKey = allocationOrder[0];
  const secondCompKey = allocationOrder[1];

  const examplePayment = 2500;
  const initialInterestBal = 1000;
  const initialPrincipalBal = 3000;

  let step1Alloc = 0;
  let step1Remaining = 0;
  let step1Status = '';
  let step2Alloc = 0;
  let step2Remaining = 0;
  let step2Status = '';

  if (firstCompKey === COMPONENT_TYPES.INTEREST) {
    // Step 1: Interest
    step1Alloc = Math.min(examplePayment, initialInterestBal); // 1000
    step1Remaining = initialInterestBal - step1Alloc; // 0
    step1Status = 'Fully Settled';

    // Step 2: Principal
    const remForStep2 = examplePayment - step1Alloc; // 1500
    step2Alloc = Math.min(remForStep2, initialPrincipalBal); // 1500
    step2Remaining = initialPrincipalBal - step2Alloc; // 1500
    step2Status = 'Partially Settled';
  } else {
    // Step 1: Principal
    step1Alloc = Math.min(examplePayment, initialPrincipalBal); // 2500
    step1Remaining = initialPrincipalBal - step1Alloc; // 500
    step1Status = 'Partially Settled';

    // Step 2: Interest
    const remForStep2 = examplePayment - step1Alloc; // 0
    step2Alloc = Math.min(remForStep2, initialInterestBal); // 0
    step2Remaining = initialInterestBal - step2Alloc; // 1000
    step2Status = 'Unpaid';
  }

  const totalAlloc = step1Alloc + step2Alloc;
  const unallocatedAmount = examplePayment - totalAlloc;
  const remainingInterest = firstCompKey === COMPONENT_TYPES.INTEREST ? step1Remaining : step2Remaining;
  const remainingPrincipal = firstCompKey === COMPONENT_TYPES.PRINCIPAL ? step1Remaining : step2Remaining;

  return (
    <div className="flex flex-col flex-1 min-h-screen w-full max-w-full overflow-x-hidden bg-slate-50/60 px-4 sm:px-6 lg:px-8 py-5 sm:py-7 font-sans">
      {/* Back Button */}
      <div className="mb-3">
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#006052] hover:text-[#004d42] transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Settings</span>
        </button>
      </div>

      {/* 1. Page Header */}
      <div className="mb-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-200/80">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#006052] text-white shadow-xs">
            <ArrowDownUp className="h-5 w-5" />
          </div>
          <div>
            <h1 className="page-title">
              Payment Allocation Settings
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-normal mt-0.5 max-w-2xl">
              Configure how customer payments are distributed across installment components. Payment priority determines which balance is settled first.
            </p>
          </div>
        </div>

        {/* Action Controls on the Right */}
        <div className="flex items-center gap-2.5 self-start md:self-center shrink-0">
          <button
            type="button"
            onClick={handleRestoreDefaults}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            title="Reset to default: Interest → Principal"
          >
            <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
            <span>Defaults</span>
          </button>

          {hasChanges && (
            <button
              type="button"
              onClick={handleCancelChanges}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            >
              <span>Cancel</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleInitiateSave}
            disabled={!hasChanges}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer ${
              hasChanges
                ? 'bg-[#006052] hover:bg-[#004d42] text-white hover:shadow active:scale-95'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
            }`}
          >
            <Save className="h-3.5 w-3.5" />
            <span>Save Changes</span>
          </button>
        </div>
      </div>

      {/* Success Notification Toast */}
      {toastMessage && (
        <div className="mb-6 max-w-3xl p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between shadow-2xs animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 shrink-0" />
            <span className="text-xs sm:text-sm font-semibold">{toastMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-xs font-bold text-emerald-700 hover:text-emerald-900 px-2 py-0.5 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Layout Area */}
      <div className="max-w-3xl space-y-4">
        {/* 2. Allocation Priority Card */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          {/* Card Header with Switch Order action */}
          <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3 bg-white">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
                Allocation Priority
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Drag cards or use Switch Order to determine which component is settled first.
              </p>
            </div>

            <button
              type="button"
              onClick={handleSwap}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50/80 hover:bg-emerald-50 hover:border-emerald-200 hover:text-[#006052] text-xs font-semibold text-slate-700 transition-all cursor-pointer shadow-2xs active:scale-95"
              title="Quickly switch priority between Interest and Principal"
            >
              <ArrowDownUp className="h-3.5 w-3.5 text-slate-500" />
              <span>Switch Order</span>
            </button>
          </div>

          {/* Draggable Component Cards */}
          <div className="p-4 sm:p-5 space-y-3">
            {allocationOrder.map((componentKey, index) => {
              const details = COMPONENT_DETAILS[componentKey];
              const IconComp = details.icon;
              const isFirst = index === 0;
              const isDraggingThis = draggedIndex === index;
              const isDragOverThis = dragOverIndex === index;

              return (
                <div
                  key={componentKey}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`group relative flex items-center justify-between p-3.5 sm:p-4 rounded-xl border transition-all duration-200 select-none ${
                    isDraggingThis
                      ? 'opacity-40 border-dashed border-[#006052] bg-emerald-50/40'
                      : isDragOverThis
                        ? 'border-[#006052] ring-2 ring-[#006052]/20 bg-emerald-50/30 shadow-md'
                        : isFirst
                          ? 'border-emerald-300/80 bg-white ring-1 ring-emerald-500/10 shadow-xs hover:border-[#006052]/50'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-2xs'
                  }`}
                >
                  <div className="flex items-center gap-3 sm:gap-3.5 min-w-0 pr-3">
                    {/* Priority Number Badge */}
                    <div
                      className={`h-7 w-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs transition-colors ${
                        isFirst
                          ? 'bg-[#006052] text-white ring-1 ring-emerald-600/20'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {index + 1}
                    </div>

                    {/* Drag Handle */}
                    <div
                      className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 p-1 -ml-1 rounded transition-colors"
                      title="Drag to reorder"
                      aria-label="Drag handle"
                    >
                      <GripVertical className="h-4.5 w-4.5" />
                    </div>

                    {/* Component Icon */}
                    <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${details.iconBg}`}>
                      <IconComp className="h-4.5 w-4.5" strokeWidth={2} />
                    </div>

                    {/* Component Name & Short Description */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-900 group-hover:text-[#006052] transition-colors">
                          {details.name}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            isFirst
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {isFirst ? '1st Priority' : '2nd Priority'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 leading-snug truncate sm:whitespace-normal">
                        {details.description}
                      </p>
                    </div>
                  </div>

                  {/* Switch Action */}
                  <div className="shrink-0 pl-2">
                    <button
                      type="button"
                      onClick={handleSwap}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-200 text-slate-600 hover:text-[#006052] text-[11px] font-semibold transition-colors cursor-pointer shadow-2xs"
                      title={`Move ${details.name} to ${isFirst ? 'Priority 2' : 'Priority 1'}`}
                    >
                      <ArrowDownUp className="h-3 w-3" />
                      <span className="hidden sm:inline">{isFirst ? 'Move to #2' : 'Move to #1'}</span>
                      <span className="sm:hidden">{isFirst ? '#2' : '#1'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Active Priority Summary Footer */}
          <div className="px-5 sm:px-6 py-3 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-600">Active Priority:</span>
              <span className="inline-flex items-center gap-1.5 font-bold text-[#006052]">
                <span>1. {allocationOrder[0]}</span>
                <ArrowRight className="h-3 w-3 text-slate-400" />
                <span>2. {allocationOrder[1]}</span>
              </span>
            </div>

            {hasChanges ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                Unsaved changes
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                Saved
              </span>
            )}
          </div>
        </div>

        {/* 3. "View How It Works" Secondary Button */}
        <div className="flex items-center justify-start pt-0.5">
          <button
            type="button"
            onClick={() => setShowHowItWorksModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-700 hover:text-slate-900 text-xs font-semibold shadow-2xs transition-all cursor-pointer group"
          >
            <HelpCircle className="h-4 w-4 text-[#006052] group-hover:scale-105 transition-transform" />
            <span>View How It Works</span>
          </button>
        </div>
      </div>

      {/* 4. "How Payment Allocation Works" Modal */}
      {showHowItWorksModal && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowHowItWorksModal(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
        >
          <div className="bg-white w-full max-w-xl max-h-[90vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-start justify-between px-5 sm:px-6 py-4 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-teal-50 text-[#006052] border border-teal-100 flex items-center justify-center shrink-0">
                  <HelpCircle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 leading-tight">
                    How Payment Allocation Works
                  </h3>
                  <span className="text-xs text-slate-500 font-medium">
                    Illustrative walk-through based on current priority
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowHowItWorksModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Close modal (Esc)"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-4">
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                When a customer makes a payment, MotoLend allocates the amount according to your configured priority order.
              </p>

              {/* Example Scenario Card */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 text-xs text-slate-700 space-y-2">
                <div className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center justify-between">
                  <span>Example Scenario</span>
                  <span className="font-bold text-[#006052] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Payment: ₹2,500
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-slate-600 pt-0.5">
                  <div className="bg-white p-2 rounded-lg border border-slate-200/80">
                    <span className="text-[11px] text-slate-500 block">Outstanding Interest:</span>
                    <span className="text-xs font-bold text-slate-800">₹1,000</span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200/80">
                    <span className="text-[11px] text-slate-500 block">Outstanding Principal:</span>
                    <span className="text-xs font-bold text-slate-800">₹3,000</span>
                  </div>
                </div>
              </div>

              {/* Step-by-Step Visual Flow */}
              <div className="space-y-3 pt-1">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Allocation Steps
                </h4>

                {/* Step 1 Card */}
                <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/30 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="h-5 w-5 rounded-full bg-[#006052] text-white text-[10px] font-bold flex items-center justify-center">
                        1
                      </span>
                      <span className="text-xs font-bold text-slate-900">
                        Step 1 — First Priority: {firstCompKey}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        step1Status === 'Fully Settled'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}
                    >
                      {step1Status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                    <div>
                      <span className="text-slate-500 block text-[11px]">Amount allocated:</span>
                      <span className="font-extrabold text-[#006052] text-sm">
                        ₹{step1Alloc.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">
                        Remaining {firstCompKey.toLowerCase()}:
                      </span>
                      <span className="font-bold text-slate-800 text-sm">
                        ₹{step1Remaining.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Step 2 Card */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="h-5 w-5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold flex items-center justify-center">
                        2
                      </span>
                      <span className="text-xs font-bold text-slate-900">
                        Step 2 — Second Priority: {secondCompKey}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        step2Status === 'Fully Settled'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          : step2Status === 'Partially Settled'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {step2Status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                    <div>
                      <span className="text-slate-500 block text-[11px]">Amount allocated:</span>
                      <span className="font-extrabold text-slate-900 text-sm">
                        ₹{step2Alloc.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">
                        Remaining {secondCompKey.toLowerCase()}:
                      </span>
                      <span className="font-bold text-slate-800 text-sm">
                        ₹{step2Remaining.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Summary Table / Card */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2">
                <span className="font-bold text-slate-900 uppercase tracking-wider text-[11px] block">
                  Allocation Summary
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                  <div>
                    <span className="text-[11px] text-slate-500 block">Total payment:</span>
                    <span className="font-bold text-slate-900">₹{examplePayment.toLocaleString('en-IN')}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block">Total allocated:</span>
                    <span className="font-bold text-emerald-700">₹{totalAlloc.toLocaleString('en-IN')}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block">Unallocated payment:</span>
                    <span className="font-bold text-slate-900">₹{unallocatedAmount.toLocaleString('en-IN')}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block">Remaining interest:</span>
                    <span className="font-bold text-slate-800">₹{remainingInterest.toLocaleString('en-IN')}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block">Remaining principal:</span>
                    <span className="font-bold text-slate-800">₹{remainingPrincipal.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>

              {/* Compact Note */}
              <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-100 text-xs text-blue-900 flex items-start gap-2 leading-relaxed">
                <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  If the first-priority component is fully settled, the remaining payment moves to the next component.
                </span>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowHowItWorksModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog Modal for Save Changes */}
      {showConfirmModal && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowConfirmModal(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
        >
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-start justify-between px-5 sm:px-6 py-4 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 leading-tight">
                    Change Payment Allocation Order?
                  </h3>
                  <span className="text-xs text-slate-500 font-medium">
                    Review and confirm priority update
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 space-y-4">
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Changing the allocation order will affect how future customer payments are distributed between interest and principal. Existing payment records remain unchanged.
              </p>

              {/* Comparison Box */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-500 uppercase tracking-wider">
                    Current Order:
                  </span>
                  <span className="font-semibold text-slate-700">
                    1. {savedSettings.allocationOrder[0]} → 2. {savedSettings.allocationOrder[1]}
                  </span>
                </div>

                <div className="h-px bg-slate-200" />

                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#006052] uppercase tracking-wider">
                    New Order:
                  </span>
                  <span className="font-bold text-[#006052] bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    1. {allocationOrder[0]} → 2. {allocationOrder[1]}
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowConfirmModal(false);
                  handleCancelChanges();
                }}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-all cursor-pointer shadow-2xs"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmSave}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#006052] hover:bg-[#004d42] active:scale-95 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
              >
                <Save className="h-3.5 w-3.5" />
                <span>Confirm &amp; Save</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentAllocationSettings;
