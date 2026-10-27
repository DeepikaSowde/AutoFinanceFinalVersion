/**
 * MotoLend — Re-Loan Configuration Rules, backed by the API (/api/settings/reloan).
 *
 * Policies:
 * 1. 'zero_outstanding': Outstanding Must Be Zero (only an admin can approve
 *    a re-loan for a customer who still owes — the server checks this when
 *    the loan is created)
 * 2. 'allow_with_outstanding': Allow Re-Loan With Outstanding
 *
 * Keeps the last copy loaded from the server so getReLoanSettings() answers
 * immediately, and fires RELOAN_SETTINGS_UPDATE_EVENT when a fresh copy arrives.
 */

import { apiGet, apiPut } from '../services/api';

export const RELOAN_SETTINGS_UPDATE_EVENT = 'motoLend_reloan_settings_updated';

export const RELOAN_POLICY = {
  ZERO_OUTSTANDING: 'zero_outstanding',
  ALLOW_WITH_OUTSTANDING: 'allow_with_outstanding',
};

export const DEFAULT_RELOAN_SETTINGS = {
  policy: RELOAN_POLICY.ZERO_OUTSTANDING,
  updatedAt: null,
};

let cache = { ...DEFAULT_RELOAN_SETTINGS };
let loading = null;
let loadedOnce = false;

const store = (settings) => {
  cache = {
    policy:
      settings?.policy === RELOAN_POLICY.ALLOW_WITH_OUTSTANDING
        ? RELOAN_POLICY.ALLOW_WITH_OUTSTANDING
        : RELOAN_POLICY.ZERO_OUTSTANDING,
    updatedAt: settings?.updatedAt || null,
  };
  loadedOnce = true;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(RELOAN_SETTINGS_UPDATE_EVENT, { detail: cache }));
  }
  return cache;
};

/** Reloads the Re-Loan settings from the server; concurrent calls share one request. */
export const loadReLoanSettings = () => {
  if (!loading) {
    loading = apiGet('/settings/reloan')
      .then(store)
      .finally(() => {
        loading = null;
      });
  }
  return loading;
};

/** The current Re-Loan settings (last loaded copy; the default until loaded). */
export function getReLoanSettings() {
  if (!loadedOnce) loadReLoanSettings().catch(() => {});
  return cache;
}

/** Saves the Re-Loan policy (admins only) and resolves to the saved copy. */
export async function saveReLoanSettings(settings) {
  return store(await apiPut('/settings/reloan', { policy: settings?.policy }));
}
