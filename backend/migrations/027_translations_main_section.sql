-- 027: the sidebar's "MAIN" section label reads "முதன்மைப் பிரிவு" in Tamil
-- (replacing "முதன்மை" from the Loan Details View 2 sheet, which it overrides).
-- Same sheet and key as frontend/src/i18n/motolendTamil.js.

INSERT INTO translations (sheet, english, tamil) VALUES
  ('MotoLend_Missing_Tamil_Translations.docx', 'MAIN', 'முதன்மைப் பிரிவு')
ON CONFLICT (sheet, english) DO UPDATE SET tamil = EXCLUDED.tamil, updated_at = now();
