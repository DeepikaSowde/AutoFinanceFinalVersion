import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ChevronRight,
  Clock,
  AlertCircle,
  CheckCircle2,
  Layers,
  ArrowLeft,
  RotateCcw,
  Save,
  Lock,
  Unlock,
} from 'lucide-react';
import {
  getPenaltySettings,
  savePenaltySettings,
  loadPenaltyData,
  getPenaltyRecords,
  DEFAULT_PENALTY_SETTINGS,
} from '../../utils/penaltyRules';
import { formatDateTime } from '../../utils/dateUtils';

const PenaltyGraceSettings = () => {
  const navigate = useNavigate();

  // Load initial settings
  const [persistedSettings, setPersistedSettings] = useState(() => getPenaltySettings());
  const [formData, setFormData] = useState({
    Monthly: { ...DEFAULT_PENALTY_SETTINGS.Monthly, enabled: true },
    Weekly: { ...DEFAULT_PENALTY_SETTINGS.Weekly, enabled: false },
    Daily: { ...DEFAULT_PENALTY_SETTINGS.Daily, enabled: false },
  });

  const [errors, setErrors] = useState({});
  const [saveSuccessMessage, setSaveSuccessMessage] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [affectedPendingCount, setAffectedPendingCount] = useState(0);

  // Sync form with the saved (server) settings on mount
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    let active = true;
    loadPenaltyData()
      .then(() => active && applySettings(getPenaltySettings()))
      .catch((err) => active && setLoadError(err.message || "Could not load the saved settings."));
    return () => {
      active = false;
    };
  }, []);

  function applySettings(current) {
    setPersistedSettings(current);
    setFormData({
      Monthly: {
        enabled: current.Monthly?.enabled !== undefined ? Boolean(current.Monthly.enabled) : true,
        gracePeriodDays: current.Monthly?.gracePeriodDays ?? 0,
        penaltyType: current.Monthly?.penaltyType || 'Fixed Penalty',
        fixedAmount: current.Monthly?.fixedAmount ?? 0,
        dailyRate: current.Monthly?.dailyRate ?? 0,
      },
      Weekly: {
        enabled: current.Weekly?.enabled !== undefined ? Boolean(current.Weekly.enabled) : false,
        gracePeriodDays: current.Weekly?.gracePeriodDays ?? 0,
        penaltyType: current.Weekly?.penaltyType || 'Fixed Penalty',
        fixedAmount: current.Weekly?.fixedAmount ?? 0,
        dailyRate: current.Weekly?.dailyRate ?? 0,
      },
      Daily: {
        enabled: current.Daily?.enabled !== undefined ? Boolean(current.Daily.enabled) : false,
        gracePeriodDays: current.Daily?.gracePeriodDays ?? 0,
        penaltyType: current.Daily?.penaltyType || 'Fixed Penalty',
        fixedAmount: current.Daily?.fixedAmount ?? 0,
        dailyRate: current.Daily?.dailyRate ?? 0,
      },
    });
  }

  // Check if form has unsaved modifications
  const isDirty = useMemo(() => {
    const frequencies = ['Monthly', 'Weekly', 'Daily'];
    return frequencies.some((freq) => {
      const f = formData[freq];
      const p = persistedSettings[freq] || DEFAULT_PENALTY_SETTINGS[freq];
      const pEnabled = freq === 'Monthly' ? (p.enabled ?? true) : (p.enabled ?? false);
      return (
        Boolean(f.enabled) !== Boolean(pEnabled) ||
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

  // Toggle independent frequency enabled/disabled state
  const handleToggleFrequency = (frequency) => {
    setSaveSuccessMessage(null);
    setFormData((prev) => ({
      ...prev,
      [frequency]: {
        ...prev[frequency],
        enabled: !prev[frequency].enabled,
      },
    }));

    // Clear validation errors for that frequency if disabling
    setErrors((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (key.startsWith(`${frequency}.`)) {
          delete next[key];
        }
      });
      return next;
    });
  };

  // Validate entire form across enabled frequencies
  const validateForm = () => {
    const newErrors = {};
    const frequencies = ['Monthly', 'Weekly', 'Daily'];

    frequencies.forEach((freq) => {
      const data = formData[freq];

      // Only validate enabled frequencies
      if (!data.enabled) return;

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
  const executeSave = async (recalculatedNotice = false) => {
    try {
      const sanitizedSettings = {
        Monthly: {
          enabled: Boolean(formData.Monthly.enabled),
          gracePeriodDays: Math.max(0, parseInt(formData.Monthly.gracePeriodDays, 10) || 0),
          penaltyType: formData.Monthly.penaltyType,
          fixedAmount: Math.max(0, Number(formData.Monthly.fixedAmount) || 0),
          dailyRate: Math.max(0, Number(formData.Monthly.dailyRate) || 0),
        },
        Weekly: {
          enabled: Boolean(formData.Weekly.enabled),
          gracePeriodDays: Math.max(0, parseInt(formData.Weekly.gracePeriodDays, 10) || 0),
          penaltyType: formData.Weekly.penaltyType,
          fixedAmount: Math.max(0, Number(formData.Weekly.fixedAmount) || 0),
          dailyRate: Math.max(0, Number(formData.Weekly.dailyRate) || 0),
        },
        Daily: {
          enabled: Boolean(formData.Daily.enabled),
          gracePeriodDays: Math.max(0, parseInt(formData.Daily.gracePeriodDays, 10) || 0),
          penaltyType: formData.Daily.penaltyType,
          fixedAmount: Math.max(0, Number(formData.Daily.fixedAmount) || 0),
          dailyRate: Math.max(0, Number(formData.Daily.dailyRate) || 0),
        },
      };

      // The server saves the rules; pending penalties follow them at once.
      const { settings: saved, changesCount } = await savePenaltySettings(sanitizedSettings);
      setPersistedSettings(saved);

      setShowConfirmModal(false);
      setSaveSuccessMessage({
        text: 'Penalty & grace period settings saved successfully.',
        recalculated: changesCount > 0 || recalculatedNotice,
        changesCount,
      });
    } catch (err) {
      console.error('Save failed:', err);
      alert(err.message || 'Failed to save settings. Please try again.');
    }
  };

  // Discard unsaved changes and restore persisted settings
  const handleCancel = () => {
    setFormData({
      Monthly: {
        enabled: persistedSettings.Monthly?.enabled !== undefined ? Boolean(persistedSettings.Monthly.enabled) : true,
        gracePeriodDays: persistedSettings.Monthly?.gracePeriodDays ?? 0,
        penaltyType: persistedSettings.Monthly?.penaltyType || 'Fixed Penalty',
        fixedAmount: persistedSettings.Monthly?.fixedAmount ?? 0,
        dailyRate: persistedSettings.Monthly?.dailyRate ?? 0,
      },
      Weekly: {
        enabled: persistedSettings.Weekly?.enabled !== undefined ? Boolean(persistedSettings.Weekly.enabled) : false,
        gracePeriodDays: persistedSettings.Weekly?.gracePeriodDays ?? 0,
        penaltyType: persistedSettings.Weekly?.penaltyType || 'Fixed Penalty',
        fixedAmount: persistedSettings.Weekly?.fixedAmount ?? 0,
        dailyRate: persistedSettings.Weekly?.dailyRate ?? 0,
      },
      Daily: {
        enabled: persistedSettings.Daily?.enabled !== undefined ? Boolean(persistedSettings.Daily.enabled) : false,
        gracePeriodDays: persistedSettings.Daily?.gracePeriodDays ?? 0,
        penaltyType: persistedSettings.Daily?.penaltyType || 'Fixed Penalty',
        fixedAmount: persistedSettings.Daily?.fixedAmount ?? 0,
        dailyRate: persistedSettings.Daily?.dailyRate ?? 0,
      },
    });
    setErrors({});
    setSaveSuccessMessage(null);
  };

  // Strictly reordered: 1. Monthly (enabled by default), 2. Weekly (locked by default), 3. Daily (locked by default)
  const frequenciesList = [
    { key: 'Monthly', label: 'Monthly Installments', description: 'Rules for loans paid on a monthly schedule' },
    { key: 'Weekly', label: 'Weekly Installments', description: 'Rules for loans paid on a weekly schedule' },
    { key: 'Daily', label: 'Daily Installments', description: 'Rules for loans paid on a daily schedule' },
  ];

  return (
    <div className="flex flex-col flex-1 min-h-screen w-full bg-white px-4 sm:px-6 lg:px-8 py-5 sm:py-7">
      <div className="w-full max-w-6xl mx-auto flex flex-col">
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
          <span className="text-slate-900 font-bold">Penalty Configuration</span>
        </nav>

        {loadError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {loadError}
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5 pb-5 border-b border-slate-200">
          <div>
            <h1 className="page-title">
              Penalty Configuration
            </h1>
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

        {/* Configuration Form: Centered 3-Column Responsive Layout */}
        <form onSubmit={handleSaveClick} className="w-full space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6 items-stretch">
            {frequenciesList.map(({ key, label, description }) => {
              const config = formData[key];
              const isEnabled = Boolean(config.enabled);
              const graceError = errors[`${key}.gracePeriodDays`];
              const amountError = errors[`${key}.fixedAmount`] || errors[`${key}.dailyRate`];

              return (
                <div
                  key={key}
                  className={`rounded-2xl border p-5 sm:p-6 transition-all duration-300 flex flex-col justify-between relative ${
                    isEnabled
                      ? 'border-slate-200/90 bg-white shadow-xs hover:border-emerald-300'
                      : 'border-slate-200/70 bg-slate-50/70 shadow-none'
                  }`}
                >
                  {/* Card Header with Enable/Disable Switch */}
                  <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors duration-200 ${
                          isEnabled
                            ? 'bg-emerald-50 text-[#006052] border-emerald-200'
                            : 'bg-slate-100 text-slate-400 border-slate-200'
                        }`}
                      >
                        {isEnabled ? (
                          <Unlock className="h-4 w-4 transition-transform duration-200" />
                        ) : (
                          <Lock className="h-4 w-4 transition-transform duration-200" />
                        )}
                      </div>
                      <div>
                        <h2 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
                          {label}
                        </h2>
                        <span
                          className={`text-[10.5px] font-semibold transition-colors duration-200 ${
                            isEnabled ? 'text-emerald-700' : 'text-slate-400'
                          }`}
                        >
                          {isEnabled ? 'Active & Enabled' : 'Disabled / Locked'}
                        </span>
                      </div>
                    </div>

                    {/* Enable/Disable Toggle Switch */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isEnabled}
                      onClick={() => handleToggleFrequency(key)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#006052] focus:ring-offset-2 ${
                        isEnabled ? 'bg-[#006052]' : 'bg-slate-300'
                      }`}
                      title={isEnabled ? `Disable ${key} configuration` : `Enable ${key} configuration`}
                    >
                      <span className="sr-only">Toggle {key}</span>
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                          isEnabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Card Main Content Area */}
                  <div className="relative flex-1 flex flex-col justify-between">
                    {/* Form Controls Container */}
                    <div
                      className={`space-y-4 transition-all duration-300 ${
                        !isEnabled
                          ? 'opacity-20 grayscale pointer-events-none select-none blur-[0.4px]'
                          : 'opacity-100'
                      }`}
                    >
                      {/* 1. Grace Period (Days) */}
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                          Grace Period (Days) <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          disabled={!isEnabled}
                          value={config.gracePeriodDays}
                          onChange={(e) => handleFieldChange(key, 'gracePeriodDays', e.target.value)}
                          placeholder="0"
                          className={`w-full rounded-xl border px-3 py-2 text-xs sm:text-sm font-semibold text-slate-900 outline-none transition-colors ${
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
                            Days after due date before penalty starts.
                          </p>
                        )}
                      </div>

                      {/* 2. Penalty Type Dropdown */}
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                          Penalty Type <span className="text-red-500">*</span>
                        </label>
                        <select
                          disabled={!isEnabled}
                          value={config.penaltyType}
                          onChange={(e) => handleFieldChange(key, 'penaltyType', e.target.value)}
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-semibold text-slate-900 outline-none transition-colors focus:border-[#006052] focus:ring-1 focus:ring-[#006052]"
                        >
                          <option value="Fixed Penalty">Fixed Penalty</option>
                          <option value="Daily Increasing">Daily Increasing</option>
                        </select>
                        <p className="text-[11px] text-slate-400 mt-1">
                          {config.penaltyType === 'Fixed Penalty'
                            ? 'Charged once per overdue installment'
                            : 'Rate × eligible days past grace period'}
                        </p>
                      </div>

                      {/* 3. Conditional Amount / Rate Field */}
                      <div>
                        {config.penaltyType === 'Fixed Penalty' ? (
                          <>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                              Penalty Amount (₹) <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs sm:text-sm font-bold text-slate-400">
                                ₹
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                disabled={!isEnabled}
                                value={config.fixedAmount}
                                onChange={(e) => handleFieldChange(key, 'fixedAmount', e.target.value)}
                                placeholder="0"
                                className={`w-full rounded-xl border pl-7 pr-3 py-2 text-xs sm:text-sm font-semibold text-slate-900 outline-none transition-colors ${
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
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs sm:text-sm font-bold text-slate-400">
                                ₹
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                disabled={!isEnabled}
                                value={config.dailyRate}
                                onChange={(e) => handleFieldChange(key, 'dailyRate', e.target.value)}
                                placeholder="0"
                                className={`w-full rounded-xl border pl-7 pr-3 py-2 text-xs sm:text-sm font-semibold text-slate-900 outline-none transition-colors ${
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

                    {/* Centered Lock Overlay when Disabled (Horizontally and Vertically Centered) */}
                    {!isEnabled && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-4 z-10 pointer-events-none transition-all duration-300 ease-in-out">
                        <div className="flex flex-col items-center justify-center p-4 sm:p-5 rounded-2xl bg-white/90 border border-slate-200/90 shadow-sm backdrop-blur-xs transition-transform duration-300">
                          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-600 mb-2 border border-slate-200">
                            <Lock className="h-5 w-5 text-slate-600 transition-transform duration-300" />
                          </div>
                          <p className="text-xs font-bold text-slate-800 tracking-tight">Locked &amp; Disabled</p>
                          <p className="text-[11px] text-slate-500 font-medium text-center mt-0.5">
                            Toggle switch above to enable
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Form Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={handleCancel}
              disabled={!isDirty}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="h-4 w-4 text-slate-500" />
              <span>Cancel</span>
            </button>

            <button
              type="submit"
              disabled={!isDirty}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#006052] hover:bg-[#004d43] text-white text-xs sm:text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm flex items-center justify-center gap-2 cursor-pointer"
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
                  className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => executeSave(true)}
                  className="px-5 py-2 rounded-xl bg-[#006052] hover:bg-[#004d43] text-white text-xs font-bold transition-colors shadow-2xs cursor-pointer"
                >
                  Confirm &amp; Recalculate
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PenaltyGraceSettings;
