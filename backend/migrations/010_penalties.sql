-- 010: late-payment penalties.
--
-- penalty_settings: one row per lender with the company-wide grace period and
-- penalty rule for each repayment frequency (Daily / Weekly / Monthly), as set
-- on Settings -> Penalty & Grace.
--
-- penalty_records: the per-instalment penalty once someone has acted on it.
-- A Pending penalty is worked out live from the settings and the instalment
-- (days past due beyond the grace period), so it only gets a row when it is
-- Frozen (amount locked), Cancelled (never charged), Collected, or unfrozen
-- back to Pending. One row per instalment.
--
-- penalty_transactions: one penalty-only payment, covering one or more
-- instalments' penalties. It books one "Penalty Income" income row in the same
-- transaction; principal and interest are never touched.

CREATE TABLE IF NOT EXISTS penalty_settings (
  tenant_id   INTEGER PRIMARY KEY REFERENCES tenants (id),
  settings    JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS penalty_transactions (
  pk                      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id                      TEXT UNIQUE NOT NULL,
  tenant_id               INTEGER NOT NULL REFERENCES tenants (id),
  loan_pk                 INTEGER NOT NULL REFERENCES loans (pk) ON DELETE CASCADE,
  transaction_ref         TEXT NOT NULL,
  client_ref              TEXT,
  collection_date         TEXT NOT NULL,
  installment_numbers     INTEGER[] NOT NULL DEFAULT '{}',
  actual_penalty_amount   NUMERIC(14, 2) NOT NULL DEFAULT 0,
  collected_amount        NUMERIC(14, 2) NOT NULL CHECK (collected_amount > 0),
  payment_mode            TEXT NOT NULL DEFAULT 'Cash',
  income_id               TEXT,
  created_by              TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS penalty_transactions_ref_uniq
  ON penalty_transactions (tenant_id, transaction_ref);
CREATE UNIQUE INDEX IF NOT EXISTS penalty_transactions_client_ref_uniq
  ON penalty_transactions (tenant_id, client_ref) WHERE client_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS penalty_transactions_loan_idx ON penalty_transactions (loan_pk);

CREATE TABLE IF NOT EXISTS penalty_records (
  pk                      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id               INTEGER NOT NULL REFERENCES tenants (id),
  loan_pk                 INTEGER NOT NULL REFERENCES loans (pk) ON DELETE CASCADE,
  installment_number      INTEGER NOT NULL,
  status                  TEXT NOT NULL CHECK (status IN ('Pending', 'Frozen', 'Cancelled', 'Collected')),
  due_date                TEXT,
  repayment_frequency     TEXT,
  grace_period            INTEGER NOT NULL DEFAULT 0,
  penalty_type            TEXT,
  configured_amount       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  eligible_days           INTEGER NOT NULL DEFAULT 0,
  calculated_amount       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  actual_amount_collected NUMERIC(14, 2) NOT NULL DEFAULT 0,
  collection_date         TEXT,
  transaction_pk          INTEGER REFERENCES penalty_transactions (pk) ON DELETE SET NULL,
  cancellation_date       TIMESTAMPTZ,
  cancellation_reason     TEXT,
  audit_trail             JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (loan_pk, installment_number)
);

CREATE INDEX IF NOT EXISTS penalty_records_tenant_idx ON penalty_records (tenant_id);
