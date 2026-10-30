import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { apiGet, apiPut, getToken } from '../services/api';
import { applyTamil } from './domTranslator';
import { LanguageContext } from './languageContext';
import { DEFAULT_DICTIONARY, buildDictionary } from './tamil';

// The app's English | தமிழ் language, set from the switch on the Dashboard
// and applied to every page. It is kept in this browser and, once signed in,
// on the user's account (users.dashboard_language via /api/dashboard-language)
// so it follows them to other devices. The Tamil text is the approved
// workbook: the server's translations table, with the bundled copy used
// until it loads or when it cannot.

const STORAGE_KEY = 'motolend-language';
const OLD_STORAGE_KEY = 'motolend-dashboard-language';

const readStoredLanguage = () => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(OLD_STORAGE_KEY);
    return stored === 'ta' ? 'ta' : 'en';
  } catch {
    return 'en';
  }
};

const storeLanguage = (language) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // The account copy still holds it.
  }
};

export const LanguageProvider = ({ children }) => {
  const [language, setLanguageState] = useState(readStoredLanguage);
  const [dictionary, setDictionary] = useState(DEFAULT_DICTIONARY);
  const loadedFor = useRef(null);
  const { pathname } = useLocation();

  // Once per sign-in: the account's language and the server's translations.
  useEffect(() => {
    const token = getToken();
    if (!token || token === loadedFor.current) return;
    loadedFor.current = token;
    apiGet('/dashboard-language')
      .then((data) => {
        if (!['en', 'ta'].includes(data?.language)) return;
        setLanguageState(data.language);
        storeLanguage(data.language);
      })
      .catch(() => {});
    apiGet('/dashboard-language/translations')
      .then((data) => {
        if (data?.sheets && Object.keys(data.sheets).length) setDictionary(buildDictionary(data.sheets));
      })
      .catch(() => {});
  }, [pathname]);

  useEffect(() => {
    applyTamil(language === 'ta' ? dictionary : null);
  }, [language, dictionary]);

  // Another MotoLend tab switched language: follow it.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === STORAGE_KEY && ['en', 'ta'].includes(event.newValue)) setLanguageState(event.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setLanguage = useCallback((next) => {
    setLanguageState(next);
    storeLanguage(next);
    if (getToken()) apiPut('/dashboard-language', { language: next }, { quiet: true }).catch(() => {});
  }, []);

  const value = useMemo(() => ({ language, setLanguage }), [language, setLanguage]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};
