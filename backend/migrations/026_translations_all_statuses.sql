-- 026: the Loans page's status filter option "All Statuses" reads
-- "அனைத்து நிலைகளும்" in Tamil (the same Tamil the workbook gives "All Status").
-- Same sheet and key as frontend/src/i18n/motolendTamil.js.

INSERT INTO translations (sheet, english, tamil) VALUES
  ('MotoLend_Missing_Tamil_Translations.docx', 'All Statuses', 'அனைத்து நிலைகளும்')
ON CONFLICT (sheet, english) DO UPDATE SET tamil = EXCLUDED.tamil, updated_at = now();
