import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  RotateCcw,
  Save,
  CheckCircle2,
  ShieldAlert,
  ShieldCheck,
  Info,
  Lock,
} from 'lucide-react';
import {
  getReLoanSettings,
  loadReLoanSettings,
  saveReLoanSettings,
  RELOAN_POLICY,
  DEFAULT_RELOAN_SETTINGS,
} from '../../utils/reLoanSettings';

const ReLoanSettings = () => {
  const navigate = useNavigate();

  const [savedSettings, setSavedSettings] = useState(() => getReLoanSettings());
  const [selectedPolicy, setSelectedPolicy] = useState(() => getReLoanSettings().policy);
  const [toastMessage, setToastMessage] = useState(null);

  // The saved policy from the server.
  useEffect(() => {
    let active = true;
    loadReLoanSettings()
      .then((loaded) => {
        if (!active) return;
        setSavedSettings(loaded);
        setSelectedPolicy(loaded.policy);
      })
      .catch((err) => active && showToast(`Could not load the settings: ${err.message}`));
    return () => {
      active = false;
    };
  }, []);

  const hasChanges = selectedPolicy !== savedSettings.policy;

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleRestoreDefaults = () => {
    setSelectedPolicy(DEFAULT_RELOAN_SETTINGS.policy);
    if (savedSettings.policy === DEFAULT_RELOAN_SETTINGS.policy) {
      showToast('Policy is already set to defaults (Outstanding Must Be Zero).');
    }
  };

  const handleCancelChanges = () => {
    setSelectedPolicy(savedSettings.policy);
    showToast('Unsaved changes discarded.');
  };

  const handleSave = async () => {
    if (!hasChanges) return;
    try {
      const updated = await saveReLoanSettings({ policy: selectedPolicy });
      setSavedSettings(updated);
      showToast('Re-Loan configuration saved successfully!');
    } catch (err) {
      showToast(`Could not save the Re-Loan configuration: ${err.message}`);
    }
  };

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

      {/* Page Header */}
      <div className="mb-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-200/80">
        <div className="flex items-start sm:items-center gap-3.5">
          <div>
            <h1 className="page-title">
              Re-Loan Configuration
            </h1>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 self-start md:self-center shrink-0">
          <button
            type="button"
            onClick={handleRestoreDefaults}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            title="Reset to default: Outstanding Must Be Zero"
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
            onClick={handleSave}
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

      {/* Notification Toast */}
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

      {/* Main Settings Card */}
      <div className="max-w-3xl space-y-4">
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          {/* Header */}
          <div className="px-5 sm:px-6 py-4 border-b border-slate-100 bg-white">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
              Customer Outstanding Balance Policy
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Select how previous loan outstanding balances are treated during customer re-loan assessment.
            </p>
          </div>

          {/* Options */}
          <div className="p-4 sm:p-5 space-y-3.5">
            {/* Option 1: Outstanding Must Be Zero */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setSelectedPolicy(RELOAN_POLICY.ZERO_OUTSTANDING)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedPolicy(RELOAN_POLICY.ZERO_OUTSTANDING);
                }
              }}
              className={`relative flex items-start gap-4 p-4 rounded-xl border transition-all duration-200 cursor-pointer select-none ${
                selectedPolicy === RELOAN_POLICY.ZERO_OUTSTANDING
                  ? 'border-[#006052] bg-emerald-50/30 ring-1 ring-[#006052]/20 shadow-xs'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
              }`}
            >
              {/* Radio Indicator */}
              <div className="pt-0.5">
                <div
                  className={`h-4.5 w-4.5 rounded-full border flex items-center justify-center transition-colors ${
                    selectedPolicy === RELOAN_POLICY.ZERO_OUTSTANDING
                      ? 'border-[#006052] bg-[#006052]'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  {selectedPolicy === RELOAN_POLICY.ZERO_OUTSTANDING && (
                    <div className="h-1.5 w-1.5 rounded-full bg-white" />
                  )}
                </div>
              </div>

              {/* Icon */}
              <div
                className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border ${
                  selectedPolicy === RELOAN_POLICY.ZERO_OUTSTANDING
                    ? 'bg-emerald-100 text-[#006052] border-emerald-200'
                    : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}
              >
                <ShieldCheck className="h-5 w-5" strokeWidth={2} />
              </div>

              {/* Text Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-slate-900">
                    Option 1: Outstanding Must Be Zero
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Strict Policy
                  </span>
                </div>

                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  The customer's existing loan outstanding must be zero to meet this configured policy.
                </p>

                <ul className="mt-2 space-y-1 text-[11px] text-slate-500 list-disc list-inside">
                  <li>If the customer has an outstanding balance, a clear policy warning is shown during the Re-Loan assessment.</li>
                  <li>Outstanding balances are never silently cleared or automatically settled.</li>
                  <li>The final lending decision remains strictly with the Admin through the existing authorization workflow.</li>
                </ul>
              </div>
            </div>

            {/* Option 2: Allow Re-Loan With Outstanding */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setSelectedPolicy(RELOAN_POLICY.ALLOW_WITH_OUTSTANDING)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedPolicy(RELOAN_POLICY.ALLOW_WITH_OUTSTANDING);
                }
              }}
              className={`relative flex items-start gap-4 p-4 rounded-xl border transition-all duration-200 cursor-pointer select-none ${
                selectedPolicy === RELOAN_POLICY.ALLOW_WITH_OUTSTANDING
                  ? 'border-[#006052] bg-emerald-50/30 ring-1 ring-[#006052]/20 shadow-xs'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
              }`}
            >
              {/* Radio Indicator */}
              <div className="pt-0.5">
                <div
                  className={`h-4.5 w-4.5 rounded-full border flex items-center justify-center transition-colors ${
                    selectedPolicy === RELOAN_POLICY.ALLOW_WITH_OUTSTANDING
                      ? 'border-[#006052] bg-[#006052]'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  {selectedPolicy === RELOAN_POLICY.ALLOW_WITH_OUTSTANDING && (
                    <div className="h-1.5 w-1.5 rounded-full bg-white" />
                  )}
                </div>
              </div>

              {/* Icon */}
              <div
                className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border ${
                  selectedPolicy === RELOAN_POLICY.ALLOW_WITH_OUTSTANDING
                    ? 'bg-blue-100 text-blue-700 border-blue-200'
                    : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}
              >
                <ShieldAlert className="h-5 w-5" strokeWidth={2} />
              </div>

              {/* Text Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-slate-900">
                    Option 2: Allow Re-Loan With Outstanding
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    Flexible Policy
                  </span>
                </div>

                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Allows the Re-Loan assessment and application process to proceed even when previous loans have outstanding balances.
                </p>

                <ul className="mt-2 space-y-1 text-[11px] text-slate-500 list-disc list-inside">
                  <li>Displays each previous loan's outstanding principal and interest separately for transparent risk review.</li>
                  <li>Does not combine or merge previous outstanding balances into the new loan amount.</li>
                  <li>The Admin makes the final lending decision through the existing approval workflow.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Footer Note */}
          <div className="px-5 sm:px-6 py-3 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-600">Active Policy:</span>
              <span className="font-bold text-[#006052]">
                {selectedPolicy === RELOAN_POLICY.ZERO_OUTSTANDING
                  ? 'Outstanding Must Be Zero'
                  : 'Allow Re-Loan With Outstanding'}
              </span>
            </div>

            {hasChanges ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                Unsaved changes
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                Saved &amp; Active
              </span>
            )}
          </div>
        </div>

        {/* Administrative Guidance Banner */}
        <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-100 text-xs text-blue-900 flex items-start gap-2.5 leading-relaxed">
          <Info className="h-4.5 w-4.5 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block text-blue-950 mb-0.5">Administrative Workflow Protection:</span>
            Re-Loan configuration guides risk assessment transparency. It never auto-approves or auto-rejects loans, nor does it alter calculation formulas, penalties, or repayment schedules.
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReLoanSettings;
