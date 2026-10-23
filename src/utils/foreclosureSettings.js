/**
 * Foreclosure & Vehicle Sale Settings Storage & Management
 */

export const FORECLOSURE_SETTINGS_STORAGE_KEY = 'motoLendForeclosureSettings_data';
export const FORECLOSURE_UPDATE_EVENT = 'motoLend_foreclosure_settings_updated';

export const SEIZED_PERIOD_BASIS_OPTIONS = {
  OPTION_A: 'Option A', // Include Within-Tenure Period + Post-Tenure Period
  OPTION_B: 'Option B', // Additional Post-Tenure Period Only
};

export const DEFAULT_FORECLOSURE_SETTINGS = {
  includeOutstanding: true, // Always enabled and non-editable
  includeVehicleExpenses: true,
  includeSeizedPeriodInterest: true,
  seizedPeriodBasis: 'Option A', // 'Option A' or 'Option B'
  includePenalty: true,
};

/**
 * Retrieves the current Foreclosure & Vehicle Sale settings.
 * Safely defaults to all components enabled and Option A.
 */
export const getForeclosureSettings = () => {
  try {
    const raw = localStorage.getItem(FORECLOSURE_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_FORECLOSURE_SETTINGS };
    }
    const parsed = JSON.parse(raw);
    return {
      includeOutstanding: true, // Always true and non-editable
      includeVehicleExpenses: parsed.includeVehicleExpenses !== undefined ? Boolean(parsed.includeVehicleExpenses) : true,
      includeSeizedPeriodInterest: parsed.includeSeizedPeriodInterest !== undefined ? Boolean(parsed.includeSeizedPeriodInterest) : true,
      seizedPeriodBasis: parsed.seizedPeriodBasis === 'Option B' ? 'Option B' : 'Option A',
      includePenalty: parsed.includePenalty !== undefined ? Boolean(parsed.includePenalty) : true,
    };
  } catch (err) {
    console.error('Failed to load foreclosure settings, using defaults:', err);
    return { ...DEFAULT_FORECLOSURE_SETTINGS };
  }
};

/**
 * Saves Foreclosure & Vehicle Sale settings and emits an update event.
 */
export const saveForeclosureSettings = (settings) => {
  try {
    const cleanSettings = {
      includeOutstanding: true, // Non-editable requirement
      includeVehicleExpenses: Boolean(settings?.includeVehicleExpenses),
      includeSeizedPeriodInterest: Boolean(settings?.includeSeizedPeriodInterest),
      seizedPeriodBasis: settings?.seizedPeriodBasis === 'Option B' ? 'Option B' : 'Option A',
      includePenalty: Boolean(settings?.includePenalty),
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem(FORECLOSURE_SETTINGS_STORAGE_KEY, JSON.stringify(cleanSettings));

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(FORECLOSURE_UPDATE_EVENT, { detail: cleanSettings }));
      window.dispatchEvent(new Event('storage'));
    }

    return cleanSettings;
  } catch (err) {
    console.error('Failed to save foreclosure settings:', err);
    return getForeclosureSettings();
  }
};

/**
 * Resets settings to default values.
 */
export const resetForeclosureSettings = () => {
  return saveForeclosureSettings(DEFAULT_FORECLOSURE_SETTINGS);
};
