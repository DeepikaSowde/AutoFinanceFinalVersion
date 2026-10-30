-- 016: workbook rows whose Tamil is the English itself.
--
-- MotoLend-English-to-Tamil.xlsx keeps some text in English on purpose (the
-- "Moto" / "Lend" of the logo on the Login sheet). 015 left those rows out;
-- the app needs them to know that the English was chosen, so another sheet's
-- Tamil for the same text is not used instead.

INSERT INTO translations (sheet, english, tamil) VALUES
  ('Login Module', 'Moto', 'Moto'),
  ('Login Module', 'Lend', 'Lend'),
  ('Customer List', 'ellipsis-${idx}', 'ellipsis-${idx}'),
  ('Dashboard Module', 'flex flex-col items-center justify-center text-center p-6 my-auto select-none ${className}', 'flex flex-col items-center justify-center text-center p-6 my-auto select-none ${className}'),
  ('Dashboard Module', 'prev-${i}', 'prev-${i}'),
  ('Dashboard Module', 'curr-${dayNum}', 'curr-${dayNum}'),
  ('Dashboard Module', '${monthNameList[monthIndex].short} ${year}', '${monthNameList[monthIndex].short} ${year}'),
  ('Dashboard Charts', 'cell-${index}', 'cell-${index}'),
  ('Loan Details View 2', '${monthNameList[monthIndex].short} ${year}', '${monthNameList[monthIndex].short} ${year}')
ON CONFLICT (sheet, english) DO NOTHING;
