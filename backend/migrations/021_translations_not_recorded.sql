-- 021: "Not Recorded" / "Not recorded" (vehicle ownership, details and buyer
-- phone when no value was entered) reads "பதிவு செய்யப்படவில்லை" in Tamil.
-- Same sheet and keys as frontend/src/i18n/motolendTamil.js.

INSERT INTO translations (sheet, english, tamil) VALUES
  ('MotoLend_Missing_Tamil_Translations.docx', 'Not Recorded', 'பதிவு செய்யப்படவில்லை'),
  ('MotoLend_Missing_Tamil_Translations.docx', 'Not recorded', 'பதிவு செய்யப்படவில்லை')
ON CONFLICT (sheet, english) DO UPDATE SET tamil = EXCLUDED.tamil, updated_at = now();
