-- 018: the customer count under the Collection page's summary cards
-- ("1 Customer", "2 Customers") reads "<count> வாடிக்கையாளர்" in Tamil, for
-- one and for many. Same sheet and keys as frontend/src/i18n/motolendTamil.js.

INSERT INTO translations (sheet, english, tamil) VALUES
  ('MotoLend_Missing_Tamil_Translations.docx', '${n} Customer', '${n} வாடிக்கையாளர்'),
  ('MotoLend_Missing_Tamil_Translations.docx', '${n} Customers', '${n} வாடிக்கையாளர்')
ON CONFLICT (sheet, english) DO UPDATE SET tamil = EXCLUDED.tamil, updated_at = now();
