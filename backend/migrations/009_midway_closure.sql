-- 009: midway closure (settling a loan early).
--
-- Closing a loan midway collects all remaining principal plus the interest of
-- the next N unpaid instalments the admin chooses; interest on the other
-- remaining instalments is waived. waived_interest records that waiver per
-- instalment (so the instalment counts as settled while its scheduled interest
-- stays on record), and midway_closed marks the instalments the closure
-- settled. Reversing the closure payment clears both.

ALTER TABLE installments
  ADD COLUMN IF NOT EXISTS waived_interest NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS midway_closed BOOLEAN NOT NULL DEFAULT false;
