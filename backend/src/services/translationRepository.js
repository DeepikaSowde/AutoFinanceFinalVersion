// src/services/translationRepository.js
//
// English → Tamil UI text (the translations table, seeded from
// MotoLend-English-to-Tamil.xlsx) and each user's Dashboard language.
// Translations are shared by every lender; the language is per user.

import { query } from "../db/connection.js";

export const DASHBOARD_LANGUAGES = ["en", "ta"];

// { sheet: { english: tamil } } — the same shape as the frontend's bundled copy.
export const getTamilTranslations = async () => {
  const result = await query("SELECT sheet, english, tamil FROM translations ORDER BY sheet, english");

  const sheets = {};
  for (const row of result.rows) {
    (sheets[row.sheet] ||= {})[row.english] = row.tamil;
  }

  return sheets;
};

export const getDashboardLanguage = async (userId) => {
  const result = await query("SELECT dashboard_language FROM users WHERE id = $1", [userId]);

  return result.rows[0]?.dashboard_language || "en";
};

export const saveDashboardLanguage = async (userId, language) => {
  if (!DASHBOARD_LANGUAGES.includes(language)) {
    throw Object.assign(new Error("Language must be 'en' or 'ta'."), { statusCode: 400 });
  }

  await query("UPDATE users SET dashboard_language = $1 WHERE id = $2", [language, userId]);

  return language;
};
