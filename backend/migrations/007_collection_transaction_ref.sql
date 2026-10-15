-- 007: the payment's own transaction reference.
--
-- A non-cash payment (UPI, bank transfer, card, cheque) carries the reference
-- the customer's bank or app gives it (UPI ref / UTR / cheque no.). The
-- Collection screen asks for it; it is stored with the payment so receipts
-- and payment history can show it. Cash payments leave it empty.

ALTER TABLE collections ADD COLUMN IF NOT EXISTS transaction_ref TEXT;
