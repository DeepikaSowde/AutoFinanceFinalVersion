import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Scale,
  Save,
  RotateCcw,
  CheckCircle2,
  Lock,
  Settings,
  Percent,
  Car,
  Calendar,
  Link2,
} from 'lucide-react';
import {
  getForeclosureSettings,
  loadForeclosureSettings,
  saveForeclosureSettings,
  resetForeclosureSettings,
} from '../../utils/foreclosureSettings';

const ForeclosureVehicleSaleSettings = () => {
  const navigate = useNavigate();

  // Settings State
  const [settings, setSettings] = useState(() => getForeclosureSettings());
  const [initialSettings, setInitialSettings] = useState(() => getForeclosureSettings());
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

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
    <div className="flex flex-col flex-1 min-h-screen w-full max-w-full overflow-x-hidden bg-[#F7F9FC] px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <div className="w-full max-w-6xl mx-auto flex flex-col">
        {/* Back Navigation Link */}
        <div className="mb-3">
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#078B70] hover:text-[#056d58] transition-colors cursor-pointer group"
          >
            <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
            <span>Back to Settings</span>
          </button>
        </div>

        {/* Page Header: Left Title Section & Right Action Controls */}
        <div className="mb-6 sm:mb-8 pb-5 sm:pb-6 border-b border-[#E4EBF2] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-[#078B70] border border-emerald-100/90 shadow-2xs">
              <Scale className="h-6 w-6 stroke-[2.2]" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-[28px] font-extrabold tracking-tight text-[#163153] leading-tight">
                Foreclosure &amp; Vehicle Sale Settings
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
                Configure calculation components and seized-period interest basis.
              </p>
            </div>
          </div>

          {/* Action Buttons: Defaults, Discard & Save */}
          <div className="flex flex-wrap items-center gap-2.5 sm:self-center">
            <button
              type="button"
              onClick={handleRestoreDefaults}
              className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl border border-[#E4EBF2] bg-white hover:bg-slate-50 active:scale-[0.98] text-[#163153] text-xs sm:text-sm font-semibold shadow-2xs transition-all cursor-pointer"
            >
              <RotateCcw className="h-4 w-4 text-slate-500" />
              <span>Defaults</span>
            </button>

            {hasChanges && (
              <button
                type="button"
                onClick={handleDiscard}
                className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl border border-[#E4EBF2] bg-white hover:bg-slate-50 active:scale-[0.98] text-slate-600 text-xs sm:text-sm font-semibold shadow-2xs transition-all cursor-pointer"
              >
                <span>Discard</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={!hasChanges}
              className={`inline-flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-all cursor-pointer active:scale-[0.98] ${
                hasChanges
                  ? 'bg-[#078B70] hover:bg-[#056d58] text-white hover:shadow-md'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Save className="h-4 w-4" />
              <span>Save Settings</span>
            </button>
          </div>
        </div>

        {/* Success / Notification Alert */}
        {toastMessage && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between shadow-2xs animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-5 w-5 text-[#078B70] shrink-0" />
              <span className="text-xs sm:text-sm font-semibold">{toastMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              className="text-xs font-bold text-[#078B70] hover:text-[#056d58] px-2 py-0.5 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Main Configuration Card (Spanning Available Content Width) */}
        <div className="w-full bg-white rounded-2xl border border-[#E4EBF2] shadow-sm p-6 sm:p-8">
          {/* Card Heading with Settings Icon */}
          <div className="flex items-center gap-3.5 mb-6 sm:mb-8 pb-5 border-b border-[#E4EBF2]">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-[#078B70] border border-emerald-100/90 shadow-2xs">
              <Settings className="h-5 w-5 stroke-[2.2]" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-[#163153] leading-tight">
                Calculation Components
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
                Enable or configure the components used for foreclosure calculation.
              </p>
            </div>
          </div>

          {/* Configuration Rows */}
          <div className="space-y-4 sm:space-y-5">
            {/* Row 1: Outstanding Principal + Interest at Sale (Always Mandatory & Non-Editable) */}
            <div className="p-4 sm:p-5 rounded-2xl bg-[#F0FAF6]/80 border border-emerald-100/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                <div className="flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-100/70 text-[#078B70] border border-emerald-200/60 shadow-2xs">
                  <Percent className="h-5 w-5 stroke-[2.2]" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm sm:text-base font-bold text-[#163153]">
                      Outstanding Principal + Interest at Sale
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100/80 text-[#078B70] border border-emerald-200">
                      <Lock className="h-3 w-3" />
                      <span>Always Enabled (Non-Editable)</span>
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-500 font-normal mt-0.5 leading-relaxed">
                    Includes the principal amount and accrued interest up to the sale date.
                  </p>
                </div>
              </div>

              {/* Locked Toggle Switch */}
              <div
                className="relative inline-flex h-6 w-11 shrink-0 cursor-not-allowed rounded-full border-2 border-transparent bg-[#078B70] opacity-90 select-none self-end sm:self-center"
                title="Mandatory component - always included in foreclosure calculation"
              >
                <span className="translate-x-5 inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out" />
              </div>
            </div>

            {/* Row 2: Vehicle Expenses */}
            <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#E4EBF2] hover:border-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all duration-200 shadow-2xs">
              <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                <div className="flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-[#078B70] border border-emerald-100 shadow-2xs">
                  <Car className="h-5 w-5 stroke-[2.2]" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm sm:text-base font-bold text-[#163153]">
                      Vehicle Expenses
                    </span>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                        settings.includeVehicleExpenses
                          ? 'bg-emerald-50 text-[#078B70] border-emerald-200/80'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {settings.includeVehicleExpenses ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-500 font-normal mt-0.5 leading-relaxed">
                    Includes costs related to vehicle maintenance, storage and handling.
                  </p>
                </div>
              </div>

              {/* Toggle Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={settings.includeVehicleExpenses}
                onClick={() => handleToggle('includeVehicleExpenses')}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#078B70] focus:ring-offset-2 self-end sm:self-center ${
                  settings.includeVehicleExpenses ? 'bg-[#078B70]' : 'bg-[#E4EBF2]'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    settings.includeVehicleExpenses ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Row 3: Seized-Period Interest */}
            <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#E4EBF2] hover:border-slate-300 transition-all duration-200 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                  <div className="flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-[#078B70] border border-emerald-100 shadow-2xs">
                    <Calendar className="h-5 w-5 stroke-[2.2]" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm sm:text-base font-bold text-[#163153]">
                        Seized-Period Interest
                      </span>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                          settings.includeSeizedPeriodInterest
                            ? 'bg-emerald-50 text-[#078B70] border-emerald-200/80'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {settings.includeSeizedPeriodInterest ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-500 font-normal mt-0.5 leading-relaxed">
                      Interest accrued during the seized period before sale.
                    </p>
                  </div>
                </div>

                {/* Toggle Switch */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.includeSeizedPeriodInterest}
                  onClick={() => handleToggle('includeSeizedPeriodInterest')}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#078B70] focus:ring-offset-2 self-end sm:self-center ${
                    settings.includeSeizedPeriodInterest ? 'bg-[#078B70]' : 'bg-[#E4EBF2]'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      settings.includeSeizedPeriodInterest ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Nested Panel: Seized-Period Calculation Basis */}
              {settings.includeSeizedPeriodInterest && (
                <div className="mt-4 sm:mt-5 p-4 sm:p-5 rounded-2xl bg-[#F0FAF6] border border-emerald-200/70 space-y-3 animate-in fade-in duration-200">
                  <h3 className="text-xs sm:text-sm font-bold text-[#163153] tracking-wide">
                    Seized-Period Calculation Basis
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {/* Option A Card */}
                    <label
                      className={`flex items-start gap-3.5 p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
                        settings.seizedPeriodBasis === 'Option A'
                          ? 'border-[#078B70] bg-white ring-1 ring-[#078B70]/30 shadow-xs'
                          : 'border-[#E4EBF2] bg-white/80 hover:bg-white text-slate-700 shadow-2xs'
                      }`}
                    >
                      <input
                        type="radio"
                        name="seizedPeriodBasis"
                        value="Option A"
                        checked={settings.seizedPeriodBasis === 'Option A'}
                        onChange={() => handleBasisChange('Option A')}
                        className="mt-1 h-4 w-4 text-[#078B70] focus:ring-[#078B70] accent-[#078B70] shrink-0 cursor-pointer"
                      />
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-bold text-[#163153] leading-snug">
                          Option A — Include Within-Tenure Period
                        </div>
                        <p className="text-xs text-slate-500 font-normal mt-1 leading-relaxed">
                          Calculates interest for the entire tenure period, including within the contract period.
                        </p>
                      </div>
                    </label>

                    {/* Option B Card */}
                    <label
                      className={`flex items-start gap-3.5 p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
                        settings.seizedPeriodBasis === 'Option B'
                          ? 'border-[#078B70] bg-white ring-1 ring-[#078B70]/30 shadow-xs'
                          : 'border-[#E4EBF2] bg-white/80 hover:bg-white text-slate-700 shadow-2xs'
                      }`}
                    >
                      <input
                        type="radio"
                        name="seizedPeriodBasis"
                        value="Option B"
                        checked={settings.seizedPeriodBasis === 'Option B'}
                        onChange={() => handleBasisChange('Option B')}
                        className="mt-1 h-4 w-4 text-[#078B70] focus:ring-[#078B70] accent-[#078B70] shrink-0 cursor-pointer"
                      />
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-bold text-[#163153] leading-snug">
                          Option B — Additional Post-Tenure Period Only
                        </div>
                        <p className="text-xs text-slate-500 font-normal mt-1 leading-relaxed">
                          Calculates interest only for the period after the tenure period ends.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Row 4: Applicable Penalty */}
            <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#E4EBF2] hover:border-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all duration-200 shadow-2xs">
              <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                <div className="flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-[#078B70] border border-emerald-100 shadow-2xs">
                  <Link2 className="h-5 w-5 stroke-[2.2]" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm sm:text-base font-bold text-[#163153]">
                      Applicable Penalty
                    </span>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                        settings.includePenalty
                          ? 'bg-emerald-50 text-[#078B70] border-emerald-200/80'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {settings.includePenalty ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-500 font-normal mt-0.5 leading-relaxed">
                    Includes penalty charges as per applicable rules and regulations.
                  </p>
                </div>
              </div>

              {/* Toggle Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={settings.includePenalty}
                onClick={() => handleToggle('includePenalty')}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#078B70] focus:ring-offset-2 self-end sm:self-center ${
                  settings.includePenalty ? 'bg-[#078B70]' : 'bg-[#E4EBF2]'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
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
