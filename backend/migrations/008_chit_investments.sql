-- 008: chit investments.
--
-- The lender puts money into chit funds run by other companies. A company
-- runs several chit schemes (total value, Monthly / Weekly, number of
-- payments). Each chit transaction is money paid into a scheme ("Chit Paid",
-- booked as an expense) or money received from it ("Chit Income", booked as
-- income); the linked expense / income row is written in the same
-- transaction, so it appears in the Ledger, Income and Expense views exactly
-- once.

CREATE TABLE IF NOT EXISTS chit_companies (
  pk          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id          TEXT UNIQUE NOT NULL,
  tenant_id   INTEGER NOT NULL REFERENCES tenants (id),
  name        TEXT NOT NULL,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One company name per lender (case-insensitive), so "add a scheme to an
-- existing company" never creates a duplicate company.
CREATE UNIQUE INDEX IF NOT EXISTS chit_companies_tenant_name_uniq
  ON chit_companies (tenant_id, lower(name));

CREATE TABLE IF NOT EXISTS chit_schemes (
  pk                 INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id                 TEXT UNIQUE NOT NULL,
  tenant_id          INTEGER NOT NULL REFERENCES tenants (id),
  company_pk         INTEGER NOT NULL REFERENCES chit_companies (pk) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  total_value        NUMERIC(14, 2) NOT NULL CHECK (total_value > 0),
  payment_frequency  TEXT NOT NULL CHECK (payment_frequency IN ('Monthly', 'Weekly')),
  total_payments     INTEGER NOT NULL CHECK (total_payments > 0),
  payment_amount     NUMERIC(14, 2) NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chit_schemes_company_idx ON chit_schemes (company_pk);

CREATE TABLE IF NOT EXISTS chit_transactions (
  pk            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id            TEXT UNIQUE NOT NULL,
  tenant_id     INTEGER NOT NULL REFERENCES tenants (id),
  scheme_pk     INTEGER NOT NULL REFERENCES chit_schemes (pk) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('Chit Paid', 'Chit Income')),
  amount        NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  txn_date      TEXT NOT NULL,
  payment_mode  TEXT NOT NULL DEFAULT 'Cash',
  expense_id    TEXT,
  income_id     TEXT,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chit_transactions_tenant_idx ON chit_transactions (tenant_id);
CREATE INDEX IF NOT EXISTS chit_transactions_scheme_idx ON chit_transactions (scheme_pk);
