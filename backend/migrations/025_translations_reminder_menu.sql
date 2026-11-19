-- 025: the sidebar's "Reminder" menu item reads "நினைவூட்டல்" in Tamil.
-- Same sheet and key as frontend/src/i18n/motolendTamil.js.

INSERT INTO translations (sheet, english, tamil) VALUES
  ('MotoLend_Missing_Tamil_Translations.docx', 'Reminder', 'நினைவூட்டல்')
ON CONFLICT (sheet, english) DO UPDATE SET tamil = EXCLUDED.tamil, updated_at = now();
