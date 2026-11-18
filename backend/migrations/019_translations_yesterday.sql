-- 019: the Collection page's "Yesterday" date tab reads "நேற்று" in Tamil,
-- like the tabs beside it. Same sheet and key as frontend/src/i18n/motolendTamil.js.

INSERT INTO translations (sheet, english, tamil) VALUES
  ('MotoLend_Missing_Tamil_Translations.docx', 'Yesterday', 'நேற்று')
ON CONFLICT (sheet, english) DO UPDATE SET tamil = EXCLUDED.tamil, updated_at = now();
