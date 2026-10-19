-- 011: subscription grace period per tenant.
--
-- A lender past valid_until keeps using the app for grace_days more days
-- (with a red "expired" banner) before sign-in is refused. The super admin
-- sets it by hand per tenant; 0 = locked out the day after valid_until.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS grace_days INTEGER NOT NULL DEFAULT 0
    CHECK (grace_days BETWEEN 0 AND 90);
