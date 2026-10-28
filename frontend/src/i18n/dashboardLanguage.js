import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { MOTOLEND_TAMIL } from './motolendTamil';

// English/Tamil switch for the Dashboard only. It is separate from the app's
// i18next language on purpose: switching here must not change other pages.

const STORAGE_KEY = 'motolend-dashboard-language';

// The workbook sheets written for the Dashboard, searched first.
const DASHBOARD_SHEETS = [
  'Dashboard Module',
  'Dashboard KPI',
  'Dashboard Charts',
  'Operational Dashboard',
  'Capital, Chit & Outstanding',
];
const GLOSSARY_SHEET = 'Sheet1';

// Tamil for an English text found in other sheets only when every sheet that
// has it gives the same Tamil; if they disagree there is no approved mapping.
const agreedTamil = (english) => {
  const values = new Set();
  Object.values(MOTOLEND_TAMIL).forEach((sheet) => {
    if (Object.prototype.hasOwnProperty.call(sheet, english)) values.add(sheet[english]);
  });
  return values.size === 1 ? [...values][0] : undefined;
};

// Lookup order: the component's own sheet, the other Dashboard sheets, the
// Sheet1 glossary, then any sheet that agrees. No match keeps the English.
export const findTamil = (english, sheet) => {
  const order = [sheet, ...DASHBOARD_SHEETS, GLOSSARY_SHEET].filter(Boolean);
  for (const name of order) {
    const value = MOTOLEND_TAMIL[name]?.[english];
    if (value !== undefined) return value;
  }
  return agreedTamil(english);
};

// Fills a template such as 'Year ${year}' with values given in the order the
// placeholders appear in the English text.
const fillTemplate = (text, englishTemplate, values) => {
  const placeholders = englishTemplate.match(/\$\{[^}]+\}/g) || [];
  return placeholders.reduce(
    (result, placeholder, index) => result.split(placeholder).join(String(values[index] ?? '')),
    text
  );
};

export const translateDashboardText = (language, sheet) => {
  const t = (english) => (language === 'ta' ? findTamil(english, sheet) ?? english : english);
  t.template = (englishTemplate, ...values) => fillTemplate(t(englishTemplate), englishTemplate, values);
  return t;
};

const DashboardLanguageContext = createContext('en');
export const DashboardLanguageProvider = DashboardLanguageContext.Provider;

export const useDashboardLanguageState = () => {
  const [language, setLanguageState] = useState(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === 'ta' ? 'ta' : 'en';
    } catch {
      return 'en';
    }
  });
  const setLanguage = useCallback((next) => {
    setLanguageState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The choice still applies for this visit.
    }
  }, []);
  return [language, setLanguage];
};

export const useDashboardLanguage = () => useContext(DashboardLanguageContext);

export const useDashboardText = (sheet) => {
  const language = useDashboardLanguage();
  return useMemo(() => translateDashboardText(language, sheet), [language, sheet]);
};
