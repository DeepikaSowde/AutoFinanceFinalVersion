-- 013: staff profile and status for User Management.
--
-- Staff are added with a name, a 10-digit mobile number (they can sign in
-- with it instead of a username) and an address, and can be made Inactive:
-- an Inactive account cannot sign in and its sessions end. One mobile
-- number per user within a lender.

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Active';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('Active', 'Inactive'));

CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_phone_uniq
  ON users (tenant_id, phone) WHERE phone <> '';
