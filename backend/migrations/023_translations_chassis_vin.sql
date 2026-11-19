-- 023: the Vehicle step's field label is now "Chassis Number (VIN)". It keeps
-- the approved Tamil for "Chassis Number" and the acronym VIN.
-- Same sheet and key as frontend/src/i18n/motolendTamil.js.

INSERT INTO translations (sheet, english, tamil) VALUES
  ('MotoLend_Missing_Tamil_Translations.docx', 'Chassis Number (VIN)', 'சேசிஸ் எண் (VIN)')
ON CONFLICT (sheet, english) DO UPDATE SET tamil = EXCLUDED.tamil, updated_at = now();
