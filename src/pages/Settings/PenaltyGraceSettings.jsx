import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ChevronRight,
  Clock,
  AlertCircle,
  CheckCircle2,
  Info,
  Calendar,
  Layers,
  ArrowLeft,
  RotateCcw,
  Save,
  HelpCircle
} from 'lucide-react';
import {
  getPenaltySettings,
  savePenaltySettings,
  recalculateAllPendingPenalties,
  getPenaltyRecords,
  DEFAULT_PENALTY_SETTINGS
} from '../../utils/penaltyRules';
import { formatDateTime } from '../../utils/dateUtils';

const PenaltyGraceSettings = () => {
  const navigate = useNavigate();

  // Load initial settings
  const [persistedSettings, setPersistedSettings] = useState(() => getPenaltySettings());
  const [formData, setFormData] = useState({
    Daily: { ...DEFAULT_PENALTY_SETTINGS.Daily },
    Weekly: { ...DEFAULT_PENALTY_SETTINGS.Weekly },
    Monthly: { ...DEFAULT_PENALTY_SETTINGS.Monthly },
  });

  const [errors, setErrors] = useState({});
  const [saveSuccessMessage, setSaveSuccessMessage] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [affectedPendingCount, setAffectedPendingCount] = useState(0);

  // Sync form with persisted settings on mount or storage event
  useEffect(() => {
    const current = getPenaltySettings();
    setPersistedSettings(current);
    setFormData({
      Daily: {
        gracePeriodDays: current.Daily?.gracePeriodDays ?? 0,
        penaltyType: current.Daily?.penaltyType || 'Fixed Penalty',
        fixedAmount: current.Daily?.fixedAmount ?? 0,
        dailyRate: current.Daily?.dailyRate ?? 0,
      },
      Weekly: {
        gracePeriodDays: current.Weekly?.gracePeriodDays ?? 0,
        penaltyType: current.Weekly?.penaltyType || 'Fixed Penalty',
        fixedAmount: current.Weekly?.fixedAmount ?? 0,
        dailyRate: current.Weekly?.dailyRate ?? 0,
      },
      Monthly: {
        gracePeriodDays: current.Monthly?.gracePeriodDays ?? 0,
        penaltyType: current.Monthly?.penaltyType || 'Fixed Penalty',
        fixedAmount: current.Monthly?.fixedAmount ?? 0,
        dailyRate: current.Monthly?.dailyRate ?? 0,
      },
    });
  }, []);

  // Check if form has unsaved modifications
  const isDirty = useMemo(() => {
    const frequencies = ['Daily', 'Weekly', 'Monthly'];
    return frequencies.some((freq) => {
      const f = formData[freq];
      const p = persistedSettings[freq] || DEFAULT_PENALTY_SETTINGS[freq];
      return (
        Number(f.gracePeriodDays) !== Number(p.gracePeriodDays) ||
        f.penaltyType !== p.penaltyType ||
        Number(f.fixedAmount) !== Number(p.fixedAmount) ||
        Number(f.dailyRate) !== Number(p.dailyRate)
      );
    });
  }, [formData, persistedSettings]);

  // Handle section field updates
  const handleFieldChange = (frequency, field, value) => {
    setSaveSuccessMessage(null);
    setFormData((prev) => ({
      ...prev,
      [frequency]: {
        ...prev[frequency],
        [field]: value,
      },
    }));

    // Clear specific error
    if (errors[`${frequency}.${field}`]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[`${frequency}.${field}`];
        return next;
      });
    }
  };

  // Validate entire form across Daily, Weekly, and Monthly
  const validateForm = () => {
    const newErrors = {};
    const frequencies = ['Daily', 'Weekly', 'Monthly'];

    frequencies.forEach((freq) => {
      const data = formData[freq];

      // Validate Grace Period
      const graceRaw = String(data.gracePeriodDays ?? '').trim();
      if (graceRaw === '') {
        newErrors[`${freq}.gracePeriodDays`] = 'Grace period is required';
      } else {
        const graceNum = Number(graceRaw);
        if (isNaN(graceNum) || !Number.isInteger(graceNum) || graceNum < 0) {
          newErrors[`${freq}.gracePeriodDays`] = 'Must be an integer zero or greater';
        }
      }

      // Validate Conditional Amount
      if (data.penaltyType === 'Fixed Penalty') {
        const fixedRaw = String(data.fixedAmount ?? '').trim();
        if (fixedRaw === '') {
          newErrors[`${freq}.fixedAmount`] = 'Fixed penalty amount is required';
        } else {
          const fixedNum = Number(fixedRaw);
          if (isNaN(fixedNum) || fixedNum < 0) {
            newErrors[`${freq}.fixedAmount`] = 'Must be a valid non-negative amount';
          }
        }
      } else if (data.penaltyType === 'Daily Increasing') {
        const rateRaw = String(data.dailyRate ?? '').trim();
        if (rateRaw === '') {
          newErrors[`${freq}.dailyRate`] = 'Daily penalty rate is required';
        } else {
          const rateNum = Number(rateRaw);
          if (isNaN(rateNum) || rateNum < 0) {
            newErrors[`${freq}.dailyRate`] = 'Must be a valid non-negative rate';
          }
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Check if saved pending records might be altered
  const checkPendingPenaltiesAffected = () => {
    const existingRecords = getPenaltyRecords();
    const pendingRecords = existingRecords.filter((r) => r.status === 'Pending');
    return pendingRecords.length;
  };

  // Trigger Save Process
  const handleSaveClick = (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    if (!isDirty) {
      setSaveSuccessMessage({
        text: 'Settings are already up-to-date. No changes were made.',
        recalculated: false,
      });
      return;
    }

    const pendingCount = checkPendingPenaltiesAffected();
    if (pendingCount > 0) {
      setAffectedPendingCount(pendingCount);
      setShowConfirmModal(true);
    } else {
      executeSave(false);
    }
  };

  // Confirm and persist save
  const executeSave = (recalculatedNotice = false) => {
    try {
      const sanitizedSettings = {
        Daily: {
          gracePeriodDays: Math.max(0, parseInt(formData.Daily.gracePeriodDays, 10) || 0),
          penaltyType: formData.Daily.penaltyType,
          fixedAmount: Math.max(0, Number(formData.Daily.fixedAmount) || 0),
          dailyRate: Math.max(0, Number(formData.Daily.dailyRate) || 0),
        },
        Weekly: {
          gracePeriodDays: Math.max(0, parseInt(formData.Weekly.gracePeriodDays, 10) || 0),
          penaltyType: formData.Weekly.penaltyType,
          fixedAmount: Math.max(0, Number(formData.Weekly.fixedAmount) || 0),
          dailyRate: Math.max(0, Number(formData.Weekly.dailyRate) || 0),
        },
        Monthly: {
          gracePeriodDays: Math.max(0, parseInt(formData.Monthly.gracePeriodDays, 10) || 0),
          penaltyType: formData.Monthly.penaltyType,
          fixedAmount: Math.max(0, Number(formData.Monthly.fixedAmount) || 0),
          dailyRate: Math.max(0, Number(formData.Monthly.dailyRate) || 0),
        },
      };

      const saved = savePenaltySettings(sanitizedSettings);
      setPersistedSettings(saved);

      // Recalculate pending penalties across active customer loans
      const { changesCount } = recalculateAllPendingPenalties(saved);

      setShowConfirmModal(false);
      setSaveSuccessMessage({
        text: 'Penalty & grace period settings saved successfully.',
        recalculated: changesCount > 0 || recalculatedNotice,
        changesCount,
      });
    } catch (err) {
      console.error('Save failed:', err);
      alert('Failed to save settings. Please try again.');
    }
  };

  // Discard unsaved changes and restore persisted settings
  const handleCancel = () => {
    setFormData({
      Daily: {
        gracePeriodDays: persistedSettings.Daily?.gracePeriodDays ?? 0,
        penaltyType: persistedSettings.Daily?.penaltyType || 'Fixed Penalty',
        fixedAmount: persistedSettings.Daily?.fixedAmount ?? 0,
        dailyRate: persistedSettings.Daily?.dailyRate ?? 0,
      },
      Weekly: {
        gracePeriodDays: persistedSettings.Weekly?.gracePeriodDays ?? 0,
        penaltyType: persistedSettings.Weekly?.penaltyType || 'Fixed Penalty',
        fixedAmount: persistedSettings.Weekly?.fixedAmount ?? 0,
        dailyRate: persistedSettings.Weekly?.dailyRate ?? 0,
      },
      Monthly: {
        gracePeriodDays: persistedSettings.Monthly?.gracePeriodDays ?? 0,
        penaltyType: persistedSettings.Monthly?.penaltyType || 'Fixed Penalty',
        fixedAmount: persistedSettings.Monthly?.fixedAmount ?? 0,
        dailyRate: persistedSettings.Monthly?.dailyRate ?? 0,
      },
    });
    setErrors({});
    setSaveSuccessMessage(null);
  };

  const frequenciesList = [
    { key: 'Daily', label: 'Daily Installments', description: 'Rules for loans paid on a daily schedule' },
    { key: 'Weekly', label: 'Weekly Installments', description: 'Rules for loans paid on a weekly schedule' },
    { key: 'Monthly', label: 'Monthly Installments', description: 'Rules for loans paid on a monthly schedule' },
  ];

  return (
    <div className="flex flex-col flex-1 min-h-screen w-full max-w-full overflow-x-hidden bg-slate-50 px-4 sm:px-6 lg:px-8 py-5 sm:py-7">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-500 mb-4">
        <Link
          to="/settings"
          className="hover:text-[#006052] transition-colors flex items-center gap-1.5"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Settings</span>
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
        <span className="text-slate-900 font-bold">Penalty &amp; Grace Period</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6 sm:mb-8 pb-5 border-b border-slate-200">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 leading-tight">
            Penalty &amp; Grace Period
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
            Configure the grace period and penalty rules for each repayment frequency.
          </p>
        </div>

        {persistedSettings?.updatedAt && (
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs self-start sm:self-auto">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <span>Last Updated: <strong className="text-slate-700">{formatDateTime(persistedSettings.updatedAt)}</strong></span>
          </div>
        )}
      </div>

      {/* Success Notification */}
      {saveSuccessMessage && (
        <div className="mb-6 rounded-xl bg-emerald-50 border border-emerald-200 p-4 flex items-start gap-3 shadow-2xs animate-fade-in">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm text-emerald-900">
            <p className="font-bold">{saveSuccessMessage.text}</p>
            {saveSuccessMessage.recalculated && (
              <p className="text-emerald-700 mt-0.5 text-xs">
                Eligible pending penalty amounts have been recalculated based on the new rules. Collected and cancelled penalties remain unchanged.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Configuration Form */}
      <form onSubmit={handleSaveClick} className="space-y-6 max-w-4xl">
        {frequenciesList.map(({ key, label, description }) => {
          const config = formData[key];
          const graceError = errors[`${key}.gracePeriodDays`];
          const amountError = errors[`${key}.fixedAmount`] || errors[`${key}.dailyRate`];

          return (
            <div
              key={key}
              className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs hover:border-slate-300 transition-colors"
            >
              {/* Section Header */}
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-[#006052] border border-emerald-100">
                    <Layers className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">{label}</h2>
                    <p className="text-xs text-slate-400">{description}</p>
                  </div>
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                  {key}
                </span>
              </div>

              {/* Form Controls Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
                {/* 1. Grace Period (Days) */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Grace Period (Days) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={config.gracePeriodDays}
                    onChange={(e) => handleFieldChange(key, 'gracePeriodDays', e.target.value)}
                    placeholder="0"
                    className={`w-full rounded-xl border px-3.5 py-2 text-sm font-semibold text-slate-900 outline-none transition-colors ${
                      graceError
                        ? 'border-red-300 bg-red-50/40 focus:border-red-500'
                        : 'border-slate-300 bg-white focus:border-[#006052] focus:ring-1 focus:ring-[#006052]'
                    }`}
                  />
                  {graceError ? (
                    <p className="text-[11px] text-red-600 font-medium mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      <span>{graceError}</span>
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-400 mt-1">
                      Days after due date before penalty starts. (0 = no grace days)
                    </p>
                  )}
                </div>

                {/* 2. Penalty Type Dropdown */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Penalty Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={config.penaltyType}
                    onChange={(e) => handleFieldChange(key, 'penaltyType', e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 outline-none transition-colors focus:border-[#006052] focus:ring-1 focus:ring-[#006052]"
                  >
                    <option value="Fixed Penalty">Fixed Penalty</option>
                    <option value="Daily Increasing">Daily Increasing</option>
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {config.penaltyType === 'Fixed Penalty'
                      ? 'Charged once per eligible overdue installment'
                      : 'Charges rate × eligible days past grace period'}
                  </p>
                </div>

                {/* 3. Conditional Amount Field */}
                <div>
                  {config.penaltyType === 'Fixed Penalty' ? (
                    <>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                        Penalty Amount (₹) <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">₹</span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={config.fixedAmount}
                          onChange={(e) => handleFieldChange(key, 'fixedAmount', e.target.value)}
                          placeholder="0"
                          className={`w-full rounded-xl border pl-7 pr-3.5 py-2 text-sm font-semibold text-slate-900 outline-none transition-colors ${
                            amountError
                              ? 'border-red-300 bg-red-50/40 focus:border-red-500'
                              : 'border-slate-300 bg-white focus:border-[#006052] focus:ring-1 focus:ring-[#006052]'
                          }`}
                        />
                      </div>
                      {amountError ? (
                        <p className="text-[11px] text-red-600 font-medium mt-1 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3 shrink-0" />
                          <span>{amountError}</span>
                        </p>
                      ) : (
                        <p className="text-[11px] text-slate-400 mt-1">One-time penalty fee</p>
                      )}
                    </>
                  ) : (
                    <>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                        Daily Penalty Rate (₹) <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">₹</span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={config.dailyRate}
                          onChange={(e) => handleFieldChange(key, 'dailyRate', e.target.value)}
                          placeholder="0"
                          className={`w-full rounded-xl border pl-7 pr-3.5 py-2 text-sm font-semibold text-slate-900 outline-none transition-colors ${
                            amountError
                              ? 'border-red-300 bg-red-50/40 focus:border-red-500'
                              : 'border-slate-300 bg-white focus:border-[#006052] focus:ring-1 focus:ring-[#006052]'
                          }`}
                        />
                      </div>
                      {amountError ? (
                        <p className="text-[11px] text-red-600 font-medium mt-1 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3 shrink-0" />
                          <span>{amountError}</span>
                        </p>
                      ) : (
                        <p className="text-[11px] text-slate-400 mt-1">Multiplied per eligible overdue day</p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Informational Policy Summary */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs">
          <div className="flex items-start gap-3.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Info className="h-5 w-5" />
            </div>
            <div className="text-xs sm:text-[13px] text-slate-600 space-y-1.5 leading-relaxed">
              <p className="font-bold text-slate-800 text-sm">Policy &amp; Calculation Rules:</p>
              <ul className="list-disc list-inside space-y-1 pl-1 text-slate-600">
                <li>Configured settings apply to both new loans and existing loans of the corresponding frequency.</li>
                <li>Pending penalty calculations will dynamically use the latest saved configuration.</li>
                <li><strong>Collected penalties remain unchanged</strong> and will not be overwritten by subsequent configuration changes.</li>
                <li><strong>Cancelled penalties remain permanently cancelled</strong> and will not be recreated.</li>
                <li>Penalties are <strong>not</strong> treated as collected merely because they have been calculated.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Form Action Buttons */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-4 border-t border-slate-200">
          <button
            type="button"
            onClick={handleCancel}
            disabled={!isDirty}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs flex items-center justify-center gap-2"
          >
            <RotateCcw className="h-4 w-4 text-slate-500" />
            <span>Cancel</span>
          </button>

          <button
            type="submit"
            disabled={!isDirty}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#006052] hover:bg-[#004d43] text-white text-xs sm:text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm flex items-center justify-center gap-2"
          >
            <Save className="h-4 w-4" />
            <span>Save Changes</span>
          </button>
        </div>
      </form>

      {/* Save Confirmation Dialog Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 animate-scale-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 leading-tight">
                  Confirm Settings Update
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  {affectedPendingCount} Pending Penalty Record(s) Detected
                </p>
              </div>
            </div>

            <div className="text-xs sm:text-sm text-slate-600 space-y-2.5 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
              <p>
                Saving these changes may <strong>recalculate active pending penalty amounts</strong> on eligible overdue installments using the new grace periods or rates.
              </p>
              <p className="text-slate-500">
                • <strong>Already collected penalties</strong> will remain strictly unchanged.
                <br />
                • <strong>Cancelled penalties</strong> will remain permanently cancelled.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeSave(true)}
                className="px-5 py-2 rounded-xl bg-[#006052] hover:bg-[#004d43] text-white text-xs font-bold transition-colors shadow-2xs"
              >
                Confirm &amp; Recalculate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PenaltyGraceSettings;
