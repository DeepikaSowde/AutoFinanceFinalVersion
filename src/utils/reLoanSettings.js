/**
 * MotoLend — Re-Loan Configuration Rules and Storage
 *
 * Provides persistent storage and retrieval for Re-Loan policies.
 * Policies:
 * 1. 'zero_outstanding': Outstanding Must Be Zero
 * 2. 'allow_with_outstanding': Allow Re-Loan With Outstanding
 */

export const RELOAN_SETTINGS_STORAGE_KEY = 'motoLendReLoanSettings_data';
export const RELOAN_SETTINGS_UPDATE_EVENT = 'motoLend_reloan_settings_updated';

export const RELOAN_POLICY = {
  ZERO_OUTSTANDING: 'zero_outstanding',
  ALLOW_WITH_OUTSTANDING: 'allow_with_outstanding',
};

export const DEFAULT_RELOAN_SETTINGS = {
  policy: RELOAN_POLICY.ZERO_OUTSTANDING,
  updatedAt: null,
};

/**
 * Loads Re-Loan configuration from localStorage or returns default.
 */
export function getReLoanSettings() {
  try {
    const raw = localStorage.getItem(RELOAN_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_RELOAN_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      policy: parsed.policy === RELOAN_POLICY.ALLOW_WITH_OUTSTANDING
        ? RELOAN_POLICY.ALLOW_WITH_OUTSTANDING
        : RELOAN_POLICY.ZERO_OUTSTANDING,
      updatedAt: parsed.updatedAt || null,
    };
  } catch (err) {
    console.error('Failed to load Re-Loan settings, using defaults:', err);
    return { ...DEFAULT_RELOAN_SETTINGS };
  }
}

/**
 * Persists Re-Loan configuration to localStorage and notifies listeners.
 */
export function saveReLoanSettings(settings) {
  try {
    const policy = settings?.policy === RELOAN_POLICY.ALLOW_WITH_OUTSTANDING
      ? RELOAN_POLICY.ALLOW_WITH_OUTSTANDING
      : RELOAN_POLICY.ZERO_OUTSTANDING;

    const dataToSave = {
      policy,
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem(RELOAN_SETTINGS_STORAGE_KEY, JSON.stringify(dataToSave));

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(RELOAN_SETTINGS_UPDATE_EVENT, { detail: dataToSave }));
      window.dispatchEvent(new Event('storage'));
    }

    return dataToSave;
  } catch (err) {
    console.error('Failed to save Re-Loan settings:', err);
    return getReLoanSettings();
  }
}
