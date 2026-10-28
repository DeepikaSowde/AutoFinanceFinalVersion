import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiGet, apiPut } from '../services/api';
import { MOTOLEND_TAMIL } from './motolendTamil';

// English/Tamil switch for the Dashboard only. It is separate from the app's
// i18next language on purpose: switching here must not change other pages.
// The Tamil text and the user's choice come from the API (translations
// table, users.dashboard_language); the bundled copy of the Excel and the
// browser's last choice are used until it answers or when it cannot.

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
const agreedTamil = (english, table) => {
  const values = new Set();
  Object.values(table).forEach((sheet) => {
    if (Object.prototype.hasOwnProperty.call(sheet, english)) values.add(sheet[english]);
  });
  return values.size === 1 ? [...values][0] : undefined;
};

// Lookup order: the component's own sheet, the other Dashboard sheets, the
// Sheet1 glossary, then any sheet that agrees. No match keeps the English.
export const findTamil = (english, sheet, table = MOTOLEND_TAMIL) => {
  const order = [sheet, ...DASHBOARD_SHEETS, GLOSSARY_SHEET].filter(Boolean);
  for (const name of order) {
    const value = table[name]?.[english];
    if (value !== undefined) return value;
  }
  return agreedTamil(english, table);
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

export const translateDashboardText = (language, sheet, table = MOTOLEND_TAMIL) => {
  const t = (english) => (language === 'ta' ? findTamil(english, sheet, table) ?? english : english);
  t.template = (englishTemplate, ...values) => fillTemplate(t(englishTemplate), englishTemplate, values);
  return t;
};

const DashboardLanguageContext = createContext({ language: 'en', table: MOTOLEND_TAMIL });
export const DashboardLanguageProvider = DashboardLanguageContext.Provider;

const rememberLocally = (language) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // The account copy still holds it.
  }
};

// Server translations, loaded once per visit and shared by every Dashboard mount.
let serverTable = null;

// For the Dashboard page: returns { language, setLanguage, table, value } where
// value goes to DashboardLanguageProvider.
export const useDashboardLanguageState = () => {
  const [language, setLanguageState] = useState(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === 'ta' ? 'ta' : 'en';
    } catch {
      return 'en';
    }
  });
  const [table, setTable] = useState(() => serverTable || MOTOLEND_TAMIL);

  useEffect(() => {
    let cancelled = false;
    apiGet('/dashboard-language')
      .then((data) => {
        if (cancelled || !['en', 'ta'].includes(data?.language)) return;
        setLanguageState(data.language);
        rememberLocally(data.language);
      })
      .catch(() => {});
    if (!serverTable) {
      apiGet('/dashboard-language/translations')
        .then((data) => {
          if (!data?.sheets || !Object.keys(data.sheets).length) return;
          serverTable = data.sheets;
          if (!cancelled) setTable(serverTable);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const setLanguage = useCallback((next) => {
    setLanguageState(next);
    rememberLocally(next);
    apiPut('/dashboard-language', { language: next }, { quiet: true }).catch(() => {});
  }, []);

  const value = useMemo(() => ({ language, table }), [language, table]);
  return { language, setLanguage, table, value };
};

export const useDashboardLanguage = () => useContext(DashboardLanguageContext).language;

export const useDashboardText = (sheet) => {
  const { language, table } = useContext(DashboardLanguageContext);
  return useMemo(() => translateDashboardText(language, sheet, table), [language, sheet, table]);
};
