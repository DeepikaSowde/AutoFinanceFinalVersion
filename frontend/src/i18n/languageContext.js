import { createContext, useContext } from 'react';

// { language: 'en' | 'ta', setLanguage } — provided by LanguageProvider.
export const LanguageContext = createContext({ language: 'en', setLanguage: () => {} });

export const useLanguage = () => useContext(LanguageContext);
