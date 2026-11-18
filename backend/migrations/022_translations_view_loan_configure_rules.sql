-- 022: the Reminder page's "View Loan" button reads "கடனைக் காண்க" and the
-- Settings cards' "Configure rules" link reads "விதியை அமைக்கவும்" in Tamil.
-- Same sheet and keys as frontend/src/i18n/motolendTamil.js.

INSERT INTO translations (sheet, english, tamil) VALUES
  ('MotoLend_Missing_Tamil_Translations.docx', 'View Loan', 'கடனைக் காண்க'),
  ('MotoLend_Missing_Tamil_Translations.docx', 'Configure rules', 'விதியை அமைக்கவும்'),
  ('MotoLend_Missing_Tamil_Translations.docx', 'Configure Rule', 'விதியை அமைக்கவும்')
ON CONFLICT (sheet, english) DO UPDATE SET tamil = EXCLUDED.tamil, updated_at = now();
