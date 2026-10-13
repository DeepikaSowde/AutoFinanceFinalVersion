-- 001: subscription plans, tenants (lenders), super admins, payments, audit.
--
-- Feature access comes from plan_features (+ per-tenant overrides), never
-- from plan names. Feature keys:
--   web_app, mobile_app, whatsapp_reminders, vahan_lookup

CREATE TABLE plans (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Stable key for code and seeding; the display name can change.
  code           TEXT UNIQUE NOT NULL,
  name           TEXT NOT NULL,
  price_monthly  NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (price_monthly >= 0),
  is_active      BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE plan_features (
  plan_id      INTEGER NOT NULL REFERENCES plans (id) ON DELETE CASCADE,
  feature_key  TEXT NOT NULL,
  PRIMARY KEY (plan_id, feature_key)
);

CREATE TABLE plan_limits (
  plan_id        INTEGER NOT NULL REFERENCES plans (id) ON DELETE CASCADE,
  feature_key    TEXT NOT NULL,
  monthly_limit  INTEGER NOT NULL CHECK (monthly_limit >= 0),
  PRIMARY KEY (plan_id, feature_key)
);

CREATE TABLE tenants (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         TEXT NOT NULL,
  owner_name   TEXT,
  phone        TEXT,
  email        TEXT,
  plan_id      INTEGER NOT NULL REFERENCES plans (id),
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'expired')),
  valid_until  DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tenants_plan ON tenants (plan_id);
CREATE INDEX idx_tenants_status_valid ON tenants (status, valid_until);

-- Turns a single feature on or off for one tenant, whatever its plan says.
CREATE TABLE tenant_feature_overrides (
  tenant_id    INTEGER NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  feature_key  TEXT NOT NULL,
  enabled      BOOLEAN NOT NULL,
  PRIMARY KEY (tenant_id, feature_key)
);

-- One row per tenant, feature and calendar month ('YYYY-MM').
CREATE TABLE usage_counters (
  tenant_id    INTEGER NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  feature_key  TEXT NOT NULL,
  month        CHAR(7) NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  count        INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  UNIQUE (tenant_id, feature_key, month)
);

-- The product owner's own accounts, separate from lender users. Passwords
-- are scrypt-hashed like lender users' (hash + per-user salt).
CREATE TABLE super_admins (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name           TEXT NOT NULL,
  email          TEXT UNIQUE NOT NULL,
  password_hash  TEXT NOT NULL,
  password_salt  TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Super admin sign-ins. Kept apart from lender `sessions`, so a token from
-- one can never be accepted by the other's routes.
CREATE TABLE super_admin_sessions (
  token           TEXT PRIMARY KEY,
  super_admin_id  INTEGER NOT NULL REFERENCES super_admins (id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_super_admin_sessions_admin ON super_admin_sessions (super_admin_id);

-- What lenders pay the product owner. Recorded by hand for UPI / bank
-- transfer today; the gateway columns are for Razorpay later.
CREATE TABLE payments (
  id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id           INTEGER NOT NULL REFERENCES tenants (id) ON DELETE RESTRICT,
  amount              NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  method              TEXT NOT NULL CHECK (method IN ('upi', 'bank_transfer', 'cheque', 'cash', 'razorpay')),
  reference_no        TEXT,
  paid_on             DATE NOT NULL,
  period_from         DATE NOT NULL,
  period_to           DATE NOT NULL,
  invoice_no          TEXT UNIQUE,
  gateway_payment_id  TEXT UNIQUE,
  notes               TEXT,
  recorded_by         INTEGER REFERENCES super_admins (id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_to >= period_from)
);

CREATE INDEX idx_payments_tenant ON payments (tenant_id, paid_on DESC);

CREATE TABLE audit_logs (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id    INTEGER REFERENCES super_admins (id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  tenant_id   INTEGER REFERENCES tenants (id) ON DELETE SET NULL,
  details     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_created ON audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_tenant ON audit_logs (tenant_id, created_at DESC);

/* ---------- seed: the two plans ---------- */
-- Prices start at 0; set them on the admin app's Plans page.

INSERT INTO plans (code, name, price_monthly) VALUES
  ('basic', 'Basic', 0),
  ('premium', 'Premium', 0);

INSERT INTO plan_features (plan_id, feature_key)
SELECT p.id, f.feature_key
FROM plans p
JOIN (VALUES
  ('basic', 'web_app'),
  ('basic', 'mobile_app'),
  ('premium', 'web_app'),
  ('premium', 'mobile_app'),
  ('premium', 'whatsapp_reminders'),
  ('premium', 'vahan_lookup')
) AS f (plan_code, feature_key) ON f.plan_code = p.code;

INSERT INTO plan_limits (plan_id, feature_key, monthly_limit)
SELECT p.id, l.feature_key, l.monthly_limit
FROM plans p
JOIN (VALUES
  ('premium', 'whatsapp_reminders', 500),
  ('premium', 'vahan_lookup', 200)
) AS l (plan_code, feature_key, monthly_limit) ON l.plan_code = p.code;
