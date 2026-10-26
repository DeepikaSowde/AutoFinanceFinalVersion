import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Scale,
  Save,
  RotateCcw,
  CheckCircle2,
  Lock,
  Calendar,
  Receipt,
  Coins,
} from 'lucide-react';
import {
  getForeclosureSettings,
  saveForeclosureSettings,
  resetForeclosureSettings,
  DEFAULT_FORECLOSURE_SETTINGS,
} from '../../utils/foreclosureSettings';

const ForeclosureVehicleSaleSettings = () => {
  const navigate = useNavigate();

  // Settings State
  const [settings, setSettings] = useState(() => getForeclosureSettings());
  const [initialSettings, setInitialSettings] = useState(() => getForeclosureSettings());
  const [toastMessage, setToastMessage] = useState(null);

  useEffect(() => {
    const loaded = getForeclosureSettings();
    setSettings(loaded);
    setInitialSettings(loaded);
  }, []);

  const hasChanges = JSON.stringify(settings) !== JSON.stringify(initialSettings);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleToggle = (key) => {
    if (key === 'includeOutstanding') return; // Always enabled and non-editable
    setSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleBasisChange = (basis) => {
    setSettings((prev) => ({
      ...prev,
      seizedPeriodBasis: basis,
    }));
  };

  const handleSave = () => {
    const saved = saveForeclosureSettings(settings);
    setSettings(saved);
    setInitialSettings(saved);
    showToast('Foreclosure & Vehicle Sale settings saved successfully!');
  };

  const handleDiscard = () => {
    setSettings(initialSettings);
    showToast('Unsaved changes discarded.');
  };

  const handleRestoreDefaults = () => {
    const defaults = resetForeclosureSettings();
    setSettings(defaults);
    setInitialSettings(defaults);
    showToast('Safe default settings restored.');
  };

  return (
    <div className="flex flex-col flex-1 min-h-screen w-full max-w-full overflow-x-hidden bg-slate-50/60 px-4 sm:px-6 lg:px-8 py-5 sm:py-7">
      {/* Top Breadcrumb */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#006052] hover:text-[#004d42] transition-colors mb-2 cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Settings</span>
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl bg-[#006052] text-white shadow-sm">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 leading-tight">
                Foreclosure &amp; Vehicle Sale Settings
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
                Configure calculation components and seized-period interest basis.
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 sm:self-center">
          <button
            type="button"
            onClick={handleRestoreDefaults}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
            <span>Defaults</span>
          </button>

          {hasChanges && (
            <button
              type="button"
              onClick={handleDiscard}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            >
              <span>Discard</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer ${
              hasChanges
                ? 'bg-[#006052] hover:bg-[#004d42] text-white hover:shadow'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Save className="h-3.5 w-3.5" />
            <span>Save Settings</span>
          </button>
        </div>
      </div>

      {/* Success Notification */}
      {toastMessage && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between shadow-2xs animate-in fade-in slide-in-from-top-2 duration-200">
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

      {/* Main Settings Form */}
      <div className="max-w-4xl space-y-6">
        {/* Calculation Components Card */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="px-5 sm:px-6 py-4 border-b border-slate-100 bg-slate-50/70">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
              Foreclosure Calculation Components
            </h2>
          </div>

          <div className="p-5 sm:p-6 divide-y divide-slate-100">
            {/* 1. Outstanding Principal + Interest at Sale (Always Enabled & Non-editable) */}
            <div className="flex items-center justify-between gap-4 py-3.5 first:pt-0">
              <div className="flex items-center gap-2.5">
                <span className="text-sm font-semibold text-slate-900">
                  Outstanding Principal + Interest at Sale
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <Lock className="h-3 w-3" />
                  <span>Always Enabled (Non-Editable)</span>
                </span>
              </div>

              {/* Locked Toggle Switch */}
              <div
                className="relative inline-flex h-6 w-11 shrink-0 cursor-not-allowed rounded-full border-2 border-transparent bg-[#006052] opacity-90"
                title="Always included in foreclosure calculation"
              >
                <span className="translate-x-5 inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out" />
              </div>
            </div>

            {/* 2. Vehicle Expenses */}
            <div className="flex items-center justify-between gap-4 py-3.5">
              <div className="flex items-center gap-2.5">
                <Receipt className="h-4 w-4 text-[#006052]" />
                <span className="text-sm font-semibold text-slate-900">
                  Vehicle Expenses
                </span>
                {settings.includeVehicleExpenses ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    Enabled
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                    Disabled
                  </span>
                )}
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={settings.includeVehicleExpenses}
                onClick={() => handleToggle('includeVehicleExpenses')}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#006052] focus:ring-offset-2 ${
                  settings.includeVehicleExpenses ? 'bg-[#006052]' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    settings.includeVehicleExpenses ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* 3. Seized-Period Interest */}
            <div className="py-3.5 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <Calendar className="h-4 w-4 text-[#006052]" />
                  <span className="text-sm font-semibold text-slate-900">
                    Seized-Period Interest
                  </span>
                  {settings.includeSeizedPeriodInterest ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                      Enabled
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                      Disabled
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.includeSeizedPeriodInterest}
                  onClick={() => handleToggle('includeSeizedPeriodInterest')}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#006052] focus:ring-offset-2 ${
                    settings.includeSeizedPeriodInterest ? 'bg-[#006052]' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      settings.includeSeizedPeriodInterest ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Seized-Period Calculation Basis */}
              {settings.includeSeizedPeriodInterest && (
                <div className="p-3.5 rounded-xl border border-emerald-100 bg-emerald-50/30 space-y-2.5 animate-in fade-in duration-150">
                  <span className="text-xs font-bold text-emerald-950 uppercase tracking-wider block">
                    Seized-Period Calculation Basis
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {/* Option A Card */}
                    <label
                      className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                        settings.seizedPeriodBasis === 'Option A'
                          ? 'border-[#006052] bg-white ring-1 ring-[#006052]/30 shadow-2xs'
                          : 'border-slate-200 bg-white/80 hover:bg-white text-slate-700'
                      }`}
                    >
                      <span className="text-xs sm:text-sm font-semibold text-slate-800">
                        Option A — Include Within-Tenure Period
                      </span>
                      <input
                        type="radio"
                        name="seizedPeriodBasis"
                        value="Option A"
                        checked={settings.seizedPeriodBasis === 'Option A'}
                        onChange={() => handleBasisChange('Option A')}
                        className="text-[#006052] focus:ring-[#006052] h-4 w-4 shrink-0 ml-2"
                      />
                    </label>

                    {/* Option B Card */}
                    <label
                      className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                        settings.seizedPeriodBasis === 'Option B'
                          ? 'border-[#006052] bg-white ring-1 ring-[#006052]/30 shadow-2xs'
                          : 'border-slate-200 bg-white/80 hover:bg-white text-slate-700'
                      }`}
                    >
                      <span className="text-xs sm:text-sm font-semibold text-slate-800">
                        Option B — Additional Post-Tenure Period Only
                      </span>
                      <input
                        type="radio"
                        name="seizedPeriodBasis"
                        value="Option B"
                        checked={settings.seizedPeriodBasis === 'Option B'}
                        onChange={() => handleBasisChange('Option B')}
                        className="text-[#006052] focus:ring-[#006052] h-4 w-4 shrink-0 ml-2"
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* 4. Applicable Penalty */}
            <div className="flex items-center justify-between gap-4 py-3.5">
              <div className="flex items-center gap-2.5">
                <Coins className="h-4 w-4 text-[#006052]" />
                <span className="text-sm font-semibold text-slate-900">
                  Applicable Penalty
                </span>
                {settings.includePenalty ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    Enabled
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                    Disabled
                  </span>
                )}
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={settings.includePenalty}
                onClick={() => handleToggle('includePenalty')}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#006052] focus:ring-offset-2 ${
                  settings.includePenalty ? 'bg-[#006052]' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    settings.includePenalty ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForeclosureVehicleSaleSettings;
