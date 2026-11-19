-- 024: the sidebar's "Dashboard" menu item reads "முகப்புப்பலகை" in Tamil.
-- Same sheet and key as frontend/src/i18n/motolendTamil.js.

INSERT INTO translations (sheet, english, tamil) VALUES
  ('MotoLend_Missing_Tamil_Translations.docx', 'Dashboard', 'முகப்புப்பலகை')
ON CONFLICT (sheet, english) DO UPDATE SET tamil = EXCLUDED.tamil, updated_at = now();
