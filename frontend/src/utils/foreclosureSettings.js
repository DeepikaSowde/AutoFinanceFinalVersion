/**
 * Foreclosure & Vehicle Sale settings, backed by the API (/api/settings/foreclosure).
 *
 * The settings are company-wide and the server applies them when it works
 * out a sale's foreclosure cost. This module keeps the last copy loaded from
 * the server so getForeclosureSettings() answers immediately during render,
 * and fires FORECLOSURE_UPDATE_EVENT whenever a fresh copy arrives.
 */

import { useEffect, useState } from 'react';
import { apiGet, apiPut } from '../services/api';

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

let cache = { ...DEFAULT_FORECLOSURE_SETTINGS };
let loading = null;
let loadedOnce = false;

const store = (settings) => {
  cache = { ...DEFAULT_FORECLOSURE_SETTINGS, ...(settings || {}), includeOutstanding: true };
  loadedOnce = true;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(FORECLOSURE_UPDATE_EVENT, { detail: cache }));
  }
  return cache;
};

/** Reloads the settings from the server; concurrent calls share one request. */
export const loadForeclosureSettings = () => {
  if (!loading) {
    loading = apiGet('/settings/foreclosure')
      .then(store)
      .finally(() => {
        loading = null;
      });
  }
  return loading;
};

/** The current settings (last loaded copy; defaults until the first load). */
export const getForeclosureSettings = () => {
  if (!loadedOnce) loadForeclosureSettings().catch(() => {});
  return cache;
};

/** Loads the settings on first use and returns them, re-rendering on each fresh copy. */
export const useForeclosureSettings = () => {
  const [current, setCurrent] = useState(cache);
  useEffect(() => {
    const update = () => setCurrent(cache);
    window.addEventListener(FORECLOSURE_UPDATE_EVENT, update);
    loadForeclosureSettings().catch(() => {});
    return () => window.removeEventListener(FORECLOSURE_UPDATE_EVENT, update);
  }, []);
  return current;
};

/** Saves the settings (admins only) and resolves to the saved copy. */
export const saveForeclosureSettings = async (settings) =>
  store(
    await apiPut('/settings/foreclosure', {
      includeVehicleExpenses: Boolean(settings?.includeVehicleExpenses),
      includeSeizedPeriodInterest: Boolean(settings?.includeSeizedPeriodInterest),
      seizedPeriodBasis: settings?.seizedPeriodBasis === 'Option B' ? 'Option B' : 'Option A',
      includePenalty: Boolean(settings?.includePenalty),
    })
  );

/** Resets the settings to the defaults. */
export const resetForeclosureSettings = () => saveForeclosureSettings(DEFAULT_FORECLOSURE_SETTINGS);
