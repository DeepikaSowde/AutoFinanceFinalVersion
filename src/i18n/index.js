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

    lng: window.localStorage.getItem("app-language") || "en",
    fallbackLng: "en",
    supportedLngs: ["en", "ta"],

    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;