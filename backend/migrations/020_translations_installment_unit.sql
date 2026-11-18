-- 020: the Loans table's Installment column ("₹6,883 / Month", "₹3,015 / Week")
-- reads "/ மாதம்" and "/ வாரம்" in Tamil; the amount is kept.
-- Same sheet and keys as frontend/src/i18n/motolendTamil.js.

INSERT INTO translations (sheet, english, tamil) VALUES
  ('MotoLend_Missing_Tamil_Translations.docx', '₹${amount} / Month', '₹${amount} / மாதம்'),
  ('MotoLend_Missing_Tamil_Translations.docx', '₹${amount} / Week', '₹${amount} / வாரம்'),
  ('MotoLend_Missing_Tamil_Translations.docx', '— / Month', '— / மாதம்'),
  ('MotoLend_Missing_Tamil_Translations.docx', '— / Week', '— / வாரம்')
ON CONFLICT (sheet, english) DO UPDATE SET tamil = EXCLUDED.tamil, updated_at = now();
