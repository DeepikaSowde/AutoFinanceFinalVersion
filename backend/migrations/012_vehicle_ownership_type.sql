-- 012: the vehicle's ownership type, entered on New Loan -> Vehicle
-- ("New", "Second-hand" or "Third-hand"); the Foreclosure analytics group
-- sold vehicles by it. Empty for vehicles recorded before it was asked.

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS ownership_type TEXT NOT NULL DEFAULT '';
