import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en/translation.json";
import ta from "./locales/ta/translation.json";

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        translation: en,
      },
      ta: {
        translation: ta,
      },
    },

    // Always English: the Tamil the app shows comes only from the approved
    // workbook (see LanguageProvider), not from locales/ta, whose text was
    // not taken from it.
    lng: "en",
    fallbackLng: "en",
    supportedLngs: ["en", "ta"],

    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;