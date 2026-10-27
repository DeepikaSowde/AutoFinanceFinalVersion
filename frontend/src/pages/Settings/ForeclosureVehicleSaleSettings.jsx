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
  AlertCircle,
  Receipt,
  Clock,
  ShieldAlert,
  Coins,
  Check,
} from 'lucide-react';
import {
  getForeclosureSettings,
  loadForeclosureSettings,
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

  // The saved settings from the server.
  useEffect(() => {
    let active = true;
    loadForeclosureSettings()
      .then((loaded) => {
        if (!active) return;
        setSettings(loaded);
        setInitialSettings(loaded);
      })
      .catch((err) => active && showToast(`Could not load the settings: ${err.message}`));
    return () => {
      active = false;
    };
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

  const handleSave = async () => {
    try {
      const saved = await saveForeclosureSettings(settings);
      setSettings(saved);
      setInitialSettings(saved);
      showToast('Foreclosure & Vehicle Sale settings saved successfully!');
    } catch (err) {
      showToast(`Could not save the settings: ${err.message}`);
    }
  };

  const handleDiscard = () => {
    setSettings(initialSettings);
    showToast('Unsaved changes discarded.');
  };

  const handleRestoreDefaults = async () => {
    try {
      const defaults = await resetForeclosureSettings();
      setSettings(defaults);
      setInitialSettings(defaults);
      showToast('Safe default settings restored.');
    } catch (err) {
      showToast(`Could not restore the defaults: ${err.message}`);
    }
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
                Configure calculation components, seized-period interest basis, and profit/loss breakdown rules.
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
            className="text-xs font-bold text-emerald-700 hover:text-emerald-900 px-2 py-0.5"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Settings Form */}
      <div className="max-w-4xl space-y-6">
        {/* Section 1: Calculation Components */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="px-5 sm:px-6 py-4 border-b border-slate-100 bg-slate-50/70">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
              Foreclosure Calculation Components
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Choose which financial items contribute to the Total Foreclosure Cost and vehicle sale profit/loss.
            </p>
          </div>

          <div className="p-5 sm:p-6 divide-y divide-slate-100 space-y-4">
            {/* 1. Outstanding Principal + Interest at Sale (Always Enabled & Non-editable) */}
            <div className="flex items-start justify-between gap-4 pt-1">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-900">
                    Outstanding Principal + Interest at Sale
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    <Lock className="h-3 w-3" />
                    <span>Always Enabled (Non-Editable)</span>
                  </span>
                </div>
                <p className="text-xs text-slate-500 max-w-xl leading-relaxed">
                  The primary loan balance remaining at vehicle sale time. Always included in the foreclosure cost breakdown and cannot be excluded.
                </p>
              </div>

              {/* Locked Toggle Switch */}
              <div className="relative inline-flex h-6 w-11 shrink-0 cursor-not-allowed rounded-full border-2 border-transparent bg-[#006052] opacity-90">
                <span className="translate-x-5 inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out" />
              </div>
            </div>

            {/* 2. Vehicle Expenses */}
            <div className="flex items-start justify-between gap-4 pt-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-[#006052]" />
                  <span className="text-sm font-bold text-slate-900">
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
                <p className="text-xs text-slate-500 max-w-xl leading-relaxed">
                  Include recorded yard storage, towing, repossession fees, and maintenance costs in the foreclosure cost. When disabled, expenses are excluded from the foreclosure settlement breakdown.
                </p>
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
            <div className="pt-4 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-[#006052]" />
                    <span className="text-sm font-bold text-slate-900">
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
                  <p className="text-xs text-slate-500 max-w-xl leading-relaxed">
                    Charge applicable interest during the period the vehicle was repossessed and stored before being sold.
                  </p>
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

              {/* Mutually Exclusive Configuration: Seized-Period Calculation Basis */}
              {settings.includeSeizedPeriodInterest && (
                <div className="mt-3 p-4 rounded-xl border border-emerald-100 bg-emerald-50/40 space-y-3.5 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-950 uppercase tracking-wider">
                      Seized-Period Calculation Basis
                    </span>
                    <span className="text-[11px] font-medium text-emerald-800">
                      Mutually Exclusive Options
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Option A Card */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => handleBasisChange('Option A')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleBasisChange('Option A');
                        }
                      }}
                      className={`p-4 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between ${
                        settings.seizedPeriodBasis === 'Option A'
                          ? 'border-[#006052] bg-white ring-2 ring-[#006052]/20 shadow-xs'
                          : 'border-slate-200 bg-white/70 hover:bg-white'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-bold text-xs sm:text-sm text-slate-900">
                            Option A — Include Within-Tenure Period
                          </span>
                          <input
                            type="radio"
                            name="seizedPeriodBasis"
                            value="Option A"
                            checked={settings.seizedPeriodBasis === 'Option A'}
                            onChange={() => handleBasisChange('Option A')}
                            className="text-[#006052] focus:ring-[#006052]"
                          />
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          Includes the eligible overdue/seized period within the original loan tenure, <strong>plus</strong> the additional period after the original tenure expires until the vehicle is sold.
                        </p>
                      </div>
                      <div className="mt-3 pt-2 border-t border-slate-100 text-[11px] text-emerald-800 font-medium">
                        Example: 5 within-tenure months + 4 post-tenure months = <strong>9 months total</strong>
                      </div>
                    </div>

                    {/* Option B Card */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => handleBasisChange('Option B')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleBasisChange('Option B');
                        }
                      }}
                      className={`p-4 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between ${
                        settings.seizedPeriodBasis === 'Option B'
                          ? 'border-[#006052] bg-white ring-2 ring-[#006052]/20 shadow-xs'
                          : 'border-slate-200 bg-white/70 hover:bg-white'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-bold text-xs sm:text-sm text-slate-900">
                            Option B — Additional Post-Tenure Period Only
                          </span>
                          <input
                            type="radio"
                            name="seizedPeriodBasis"
                            value="Option B"
                            checked={settings.seizedPeriodBasis === 'Option B'}
                            onChange={() => handleBasisChange('Option B')}
                            className="text-[#006052] focus:ring-[#006052]"
                          />
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          Includes <strong>only</strong> the eligible additional period after the original loan tenure expires. Excludes the overdue/seized period falling within the original tenure.
                        </p>
                      </div>
                      <div className="mt-3 pt-2 border-t border-slate-100 text-[11px] text-emerald-800 font-medium">
                        Example: Only the <strong>4 additional post-tenure months</strong>
                      </div>
                    </div>
                  </div>

                  {/* Context Note */}
                  <div className="flex items-start gap-2 pt-1 text-[11px] text-slate-600 leading-relaxed">
                    <AlertCircle className="h-3.5 w-3.5 text-emerald-700 shrink-0 mt-0.5" />
                    <span>
                      Uses actual dates: original tenure end date, seizure date, and sale date. Overlapping or duplicate periods are automatically prevented. Daily, weekly, and monthly repayment frequencies adhere to existing interest calculation rules.
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* 4. Applicable Penalty */}
            <div className="flex items-start justify-between gap-4 pt-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Coins className="h-4 w-4 text-[#006052]" />
                  <span className="text-sm font-bold text-slate-900">
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
                <p className="text-xs text-slate-500 max-w-xl leading-relaxed">
                  Include eligible overdue penalties in the foreclosure cost. Also respects the master <strong>Penalty &amp; Grace Period Settings</strong> (grace days, frequency, and Fixed/Daily Increasing method). If penalties are disabled or ineligible under Penalty Settings, they will be excluded automatically.
                </p>
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

        {/* Section 2: Active Rules Summary Card */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 sm:p-6 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-[#006052]" />
            <h3 className="text-sm sm:text-base font-bold text-slate-900">
              Active Foreclosure Formula
            </h3>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 font-mono text-xs text-slate-800 leading-relaxed">
            <span className="font-bold text-[#006052]">Total Foreclosure Cost</span> = Outstanding Principal + Unpaid Interest
            {settings.includeVehicleExpenses && <span className="text-emerald-700"> + Vehicle Expenses</span>}
            {settings.includeSeizedPeriodInterest && (
              <span className="text-purple-700"> + Seized-Period Interest ({settings.seizedPeriodBasis})</span>
            )}
            {settings.includePenalty && <span className="text-amber-700"> + Applicable Penalty</span>}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
            <div className="p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-100 text-center">
              <span className="text-[11px] text-slate-500 block">Principal + Interest</span>
              <span className="font-bold text-emerald-800">Always Enabled</span>
            </div>
            <div className={`p-2.5 rounded-lg border text-center ${settings.includeVehicleExpenses ? 'bg-emerald-50/60 border-emerald-100 text-emerald-800 font-bold' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
              <span className="text-[11px] text-slate-500 block">Vehicle Expenses</span>
              <span>{settings.includeVehicleExpenses ? 'Included' : 'Excluded'}</span>
            </div>
            <div className={`p-2.5 rounded-lg border text-center ${settings.includeSeizedPeriodInterest ? 'bg-purple-50/60 border-purple-100 text-purple-900 font-bold' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
              <span className="text-[11px] text-slate-500 block">Seized-Period Int.</span>
              <span>{settings.includeSeizedPeriodInterest ? settings.seizedPeriodBasis : 'Excluded'}</span>
            </div>
            <div className={`p-2.5 rounded-lg border text-center ${settings.includePenalty ? 'bg-amber-50/60 border-amber-100 text-amber-900 font-bold' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
              <span className="text-[11px] text-slate-500 block">Penalty</span>
              <span>{settings.includePenalty ? 'Included' : 'Excluded'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForeclosureVehicleSaleSettings;
