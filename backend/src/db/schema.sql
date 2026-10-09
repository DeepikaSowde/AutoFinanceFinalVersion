-- Auto Finance — PostgreSQL schema.
--
-- Relational tables for anything queried, joined or aggregated. jsonb
-- columns only for genuinely free-form sub-objects (KYC fields, document
-- metadata, insurance, charges, allocation snapshots), mirroring the
-- nested shape the React app consumes.

/* =========================================================
   AUTH
========================================================= */

CREATE TABLE IF NOT EXISTS users (
  pk             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id             TEXT UNIQUE NOT NULL,
  username       TEXT UNIQUE NOT NULL,
  password_hash  TEXT NOT NULL,
  password_salt  TEXT NOT NULL,
  name           TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
  -- Staff only: { module: { view, add, edit, delete, approve } }.
  -- Admins ignore it and always have full access.
  permissions    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Databases created before per-user permissions existed: add the column
-- once, and give existing staff the collection access they already had.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'permissions'
  ) THEN
    ALTER TABLE users ADD COLUMN permissions JSONB NOT NULL DEFAULT '{}'::jsonb;

    UPDATE users
    SET permissions = '{"collections": {"view": true, "add": true}}'::jsonb
    WHERE role = 'staff';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_pk     INTEGER NOT NULL REFERENCES users (pk) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_pk ON sessions (user_pk);

/* =========================================================
   CUSTOMER
========================================================= */

CREATE TABLE IF NOT EXISTS customers (
  pk               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id               TEXT UNIQUE NOT NULL,
  customer_number  TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'Active',
  personal         JSONB NOT NULL DEFAULT '{}'::jsonb,
  kyc              JSONB NOT NULL DEFAULT '{}'::jsonb,
  documents        JSONB NOT NULL DEFAULT '{}'::jsonb,
  photo            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS guarantors (
  pk             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_pk    INTEGER NOT NULL UNIQUE REFERENCES customers (pk) ON DELETE CASCADE,
  has_guarantor  BOOLEAN NOT NULL DEFAULT false,
  personal       JSONB NOT NULL DEFAULT '{}'::jsonb,
  kyc            JSONB NOT NULL DEFAULT '{}'::jsonb,
  documents      JSONB NOT NULL DEFAULT '{}'::jsonb,
  photo          JSONB NOT NULL DEFAULT '{}'::jsonb
);

/* =========================================================
   VEHICLE
   One unified table, replacing the three competing vehicle
   stores the frontend grew.
========================================================= */

CREATE TABLE IF NOT EXISTS vehicles (
  pk                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id                  TEXT UNIQUE NOT NULL,
  customer_pk         INTEGER NOT NULL REFERENCES customers (pk) ON DELETE CASCADE,
  vehicle_type        TEXT,
  brand               TEXT,
  model               TEXT,
  variant             TEXT,
  colour              TEXT,
  manufacturing_year  TEXT,
  fuel_type           TEXT,
  vehicle_value       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  photo               JSONB NOT NULL DEFAULT '{}'::jsonb,
  status              TEXT NOT NULL DEFAULT 'ACTIVE'
                      CHECK (status IN ('ACTIVE', 'SEIZED', 'PENDING_SALE', 'RELEASED', 'SOLD')),
  seizure             JSONB,
  release             JSONB,
  sale                JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_customer_pk ON vehicles (customer_pk);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles (status);

-- Append-only lifecycle history.
CREATE TABLE IF NOT EXISTS vehicle_events (
  pk            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id            TEXT UNIQUE NOT NULL,
  vehicle_pk    INTEGER NOT NULL REFERENCES vehicles (pk) ON DELETE CASCADE,
  event_type    TEXT NOT NULL
                CHECK (event_type IN ('SEIZURE', 'RELEASE', 'PENDING_SALE', 'SALE', 'SALE_CANCELLED')),
  from_status   TEXT,
  to_status     TEXT NOT NULL,
  details       JSONB NOT NULL DEFAULT '{}'::jsonb,
  performed_by  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_events_vehicle_pk ON vehicle_events (vehicle_pk);

CREATE TABLE IF NOT EXISTS rc_details (
  pk                    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vehicle_pk            INTEGER NOT NULL UNIQUE REFERENCES vehicles (pk) ON DELETE CASCADE,
  rc_book_number        TEXT,
  registration_number   TEXT,
  location              TEXT,
  date_of_registration  TEXT,
  chassis_number        TEXT,
  engine_number         TEXT,
  existing_financier    TEXT DEFAULT 'None',
  hypothecation         BOOLEAN NOT NULL DEFAULT false,
  tax_expiry            TEXT,
  permit_expiry         TEXT,
  fc_expiry             TEXT,
  insurance             JSONB NOT NULL DEFAULT '{}'::jsonb,
  endorsement           JSONB NOT NULL DEFAULT '{}'::jsonb,
  remarks               TEXT
);

CREATE INDEX IF NOT EXISTS idx_rc_registration ON rc_details (registration_number);

/* =========================================================
   LOAN
========================================================= */

CREATE TABLE IF NOT EXISTS loans (
  pk                   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id                   TEXT UNIQUE NOT NULL,
  loan_number          TEXT NOT NULL,
  customer_pk          INTEGER NOT NULL REFERENCES customers (pk) ON DELETE CASCADE,
  vehicle_pk           INTEGER REFERENCES vehicles (pk) ON DELETE SET NULL,
  previous_loan_pk     INTEGER REFERENCES loans (pk) ON DELETE SET NULL,
  is_primary           BOOLEAN NOT NULL DEFAULT true,

  vehicle_amount       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  down_payment         NUMERIC(14, 2) NOT NULL DEFAULT 0,
  loan_amount          NUMERIC(14, 2) NOT NULL DEFAULT 0,

  interest_rate        NUMERIC(8, 4) NOT NULL DEFAULT 0,
  interest_type        TEXT NOT NULL DEFAULT 'Flat',
  repayment_method     TEXT NOT NULL DEFAULT 'EMI',
  repayment_frequency  TEXT NOT NULL DEFAULT 'Monthly',
  tenure               NUMERIC(10, 2) NOT NULL DEFAULT 0,
  tenure_unit          TEXT NOT NULL DEFAULT 'Months',
  first_due_date       TEXT,

  calculation          JSONB NOT NULL DEFAULT '{}'::jsonb,
  charges              JSONB NOT NULL DEFAULT '{}'::jsonb,
  collection           JSONB NOT NULL DEFAULT '{}'::jsonb,
  funding              JSONB NOT NULL DEFAULT '{}'::jsonb,
  repayment_meta       JSONB NOT NULL DEFAULT '{}'::jsonb,

  remarks              TEXT,
  status               TEXT NOT NULL DEFAULT 'Active',

  foreclosure_status   TEXT,
  foreclosed_at        TIMESTAMPTZ,
  foreclosure_reason   TEXT,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loans_customer_pk ON loans (customer_pk);
CREATE INDEX IF NOT EXISTS idx_loans_vehicle_pk ON loans (vehicle_pk);
CREATE INDEX IF NOT EXISTS idx_loans_status ON loans (status);

CREATE TABLE IF NOT EXISTS installments (
  pk                   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  loan_pk              INTEGER NOT NULL REFERENCES loans (pk) ON DELETE CASCADE,
  installment_number   INTEGER NOT NULL,
  due_date             TEXT,
  opening_balance      NUMERIC(14, 2) NOT NULL DEFAULT 0,
  principal            NUMERIC(14, 2) NOT NULL DEFAULT 0,
  interest             NUMERIC(14, 2) NOT NULL DEFAULT 0,
  payment_amount       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  closing_balance      NUMERIC(14, 2) NOT NULL DEFAULT 0,
  paid_principal       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  paid_interest        NUMERIC(14, 2) NOT NULL DEFAULT 0,
  penalty_paid_amount  NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status               TEXT NOT NULL DEFAULT 'Pending',
  UNIQUE (loan_pk, installment_number)
);

CREATE INDEX IF NOT EXISTS idx_installments_loan_pk ON installments (loan_pk);

/* =========================================================
   COLLECTION (payment submission + approval workflow)
========================================================= */

CREATE TABLE IF NOT EXISTS collections (
  pk                           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id                           TEXT UNIQUE NOT NULL,
  customer_pk                  INTEGER REFERENCES customers (pk) ON DELETE SET NULL,
  loan_pk                      INTEGER REFERENCES loans (pk) ON DELETE SET NULL,

  status                       TEXT NOT NULL DEFAULT 'Pending'
                               CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Reversed')),

  amount                       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  due_amount                   NUMERIC(14, 2) NOT NULL DEFAULT 0,
  penalty_amount               NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_payable                NUMERIC(14, 2) NOT NULL DEFAULT 0,

  payment_type                 TEXT,
  pay_mode                     TEXT,
  receipt_number               TEXT,
  due_date                     TEXT,
  installment_number           INTEGER,

  staff_name                   TEXT,
  location                     TEXT,
  remarks                      TEXT,

  overdue_days                 INTEGER NOT NULL DEFAULT 0,
  grace_days                   INTEGER NOT NULL DEFAULT 0,

  amount_toward_due            NUMERIC(14, 2) NOT NULL DEFAULT 0,
  amount_toward_penalty        NUMERIC(14, 2) NOT NULL DEFAULT 0,
  amount_toward_principal      NUMERIC(14, 2) NOT NULL DEFAULT 0,
  amount_toward_advance        NUMERIC(14, 2) NOT NULL DEFAULT 0,
  amount_excess                NUMERIC(14, 2) NOT NULL DEFAULT 0,

  allocation                   JSONB,
  repayment_processed          BOOLEAN NOT NULL DEFAULT false,
  repayment_processed_at       TIMESTAMPTZ,
  repayment_processing_status  TEXT NOT NULL DEFAULT 'Pending',
  repayment_error              TEXT,

  -- Caller-generated reference for this submission. A repeated request with the
  -- same value returns the original collection instead of posting it twice.
  client_ref                   TEXT,

  submitted_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  collected_date               TEXT,
  approved_at                  TIMESTAMPTZ,
  approved_by                  TEXT,
  rejected_at                  TIMESTAMPTZ,
  rejected_by                  TEXT,
  rejection_remarks            TEXT,
  reversed_at                  TIMESTAMPTZ,
  reversed_by                  TEXT,
  reversal_reason              TEXT,

  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Databases created before client_ref existed.
ALTER TABLE collections ADD COLUMN IF NOT EXISTS client_ref TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_client_ref
  ON collections (client_ref) WHERE client_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_collections_loan_pk ON collections (loan_pk);
CREATE INDEX IF NOT EXISTS idx_collections_customer_pk ON collections (customer_pk);
CREATE INDEX IF NOT EXISTS idx_collections_status ON collections (status);

-- One row per allocation bucket actually posted: the ledger of record
-- for money applied to a loan.
CREATE TABLE IF NOT EXISTS payment_allocations (
  pk                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id                  TEXT UNIQUE NOT NULL,
  loan_pk             INTEGER NOT NULL REFERENCES loans (pk) ON DELETE CASCADE,
  collection_pk       INTEGER REFERENCES collections (pk) ON DELETE SET NULL,
  installment_number  INTEGER,
  due_date            TEXT,
  amount              NUMERIC(14, 2) NOT NULL DEFAULT 0,
  type                TEXT NOT NULL,
  is_penalty          BOOLEAN NOT NULL DEFAULT false,
  is_interest         BOOLEAN NOT NULL DEFAULT false,
  is_principal        BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_allocations_loan_pk ON payment_allocations (loan_pk);
CREATE INDEX IF NOT EXISTS idx_allocations_collection_pk ON payment_allocations (collection_pk);

/* =========================================================
   INVESTORS

   Transactions are the ledger of record: invested / allocated /
   available are summed from them, never stored as mutable columns.
========================================================= */

CREATE TABLE IF NOT EXISTS investors (
  pk             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id             TEXT UNIQUE NOT NULL,
  name           TEXT NOT NULL,
  mobile_number  TEXT NOT NULL,
  email          TEXT,
  address        TEXT,
  city           TEXT,
  state          TEXT,
  pincode        TEXT,
  investor_type  TEXT NOT NULL DEFAULT 'Individual',
  pan            TEXT,
  bank_details   JSONB NOT NULL DEFAULT '{}'::jsonb,
  investment     JSONB NOT NULL DEFAULT '{}'::jsonb,
  status         TEXT NOT NULL DEFAULT 'Active',
  remarks        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS investor_transactions (
  pk               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id               TEXT UNIQUE NOT NULL,
  -- Loan allocations draw on the whole pool, so they carry no investor.
  investor_pk      INTEGER REFERENCES investors (pk) ON DELETE CASCADE,
  type             TEXT NOT NULL CHECK (type IN ('Investment', 'Loan Allocation')),
  amount           NUMERIC(14, 2) NOT NULL DEFAULT 0,
  date             TEXT,
  reference        TEXT,
  investment_mode  TEXT,
  notes            TEXT,
  loan_pk          INTEGER REFERENCES loans (pk) ON DELETE SET NULL,
  loan_number      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_investor_tx_investor ON investor_transactions (investor_pk);
CREATE INDEX IF NOT EXISTS idx_investor_tx_type ON investor_transactions (type);

-- A loan can only ever be funded once.
CREATE UNIQUE INDEX IF NOT EXISTS idx_investor_tx_one_alloc_per_loan
  ON investor_transactions (loan_pk)
  WHERE type = 'Loan Allocation' AND loan_pk IS NOT NULL;

/* =========================================================
   EXPENSES

   Free-form in the UI, so the detail travels as jsonb while the
   fields that get filtered and summed are real columns.
========================================================= */

CREATE TABLE IF NOT EXISTS expenses (
  pk            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id            TEXT UNIQUE NOT NULL,
  amount        NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'Pending',
  category      TEXT,
  sub_category  TEXT,
  expense_date  TEXT,
  payment_mode  TEXT,
  paid_by       TEXT,
  vendor        TEXT,
  reference     TEXT,
  description   TEXT,
  remarks       TEXT,
  details       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses (status);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses (expense_date);

/* =========================================================
   RE-LOAN

   Rules are a single settings row; eligibility checks are a
   write-once audit trail.
========================================================= */

CREATE TABLE IF NOT EXISTS reloan_rules (
  pk          INTEGER PRIMARY KEY CHECK (pk = 1),
  rules       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reloan_eligibility_checks (
  pk           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id           TEXT UNIQUE NOT NULL,
  customer_pk  INTEGER REFERENCES customers (pk) ON DELETE CASCADE,
  loan_pk      INTEGER REFERENCES loans (pk) ON DELETE CASCADE,
  eligible     BOOLEAN NOT NULL DEFAULT false,
  status       TEXT NOT NULL,
  result       JSONB NOT NULL DEFAULT '{}'::jsonb,
  checked_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reloan_checks_loan ON reloan_eligibility_checks (loan_pk);

/* =========================================================
   INCOME

   Manual, non-loan income — mirrors "expenses" so the two can
   share the same list/form/report patterns.
========================================================= */

CREATE TABLE IF NOT EXISTS incomes (
  pk             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id             TEXT UNIQUE NOT NULL,
  amount         NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'Received',
  category       TEXT,
  sub_category   TEXT,
  income_date    TEXT,
  payment_mode   TEXT,
  received_from  TEXT,
  reference      TEXT,
  description    TEXT,
  remarks        TEXT,
  details        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incomes_status ON incomes (status);
CREATE INDEX IF NOT EXISTS idx_incomes_date ON incomes (income_date);

/* =========================================================
   CATEGORIES

   User-managed category lists for income/expense forms, kept
   separate from whatever categories already exist on past
   records so a category can be added before it's ever used.
========================================================= */

CREATE TABLE IF NOT EXISTS categories (
  pk          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id          TEXT UNIQUE NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (type, name)
);

/* =========================================================
   REFERRAL COMMISSIONS

   Payouts owed to agents / dealers who referred a loan. Marking one
   paid also books a matching row in expenses (expense_id).
========================================================= */

CREATE TABLE IF NOT EXISTS referral_commissions (
  pk               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id               TEXT UNIQUE NOT NULL,
  agent_name       TEXT NOT NULL,
  agent_type       TEXT NOT NULL DEFAULT 'Agent',
  customer_name    TEXT,
  loan_number      TEXT,
  amount           NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'Pending',
  commission_date  TEXT,
  paid_date        TEXT,
  payment_mode     TEXT,
  remarks          TEXT,
  expense_id       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_commissions_status ON referral_commissions (status);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_date ON referral_commissions (commission_date);

/* =========================================================
   REMINDERS

   Payment reminders sent to customers from the Reminders page.
   Everything the page tracks beyond these columns (amounts, follow-up
   settings, send count...) lives in details.
========================================================= */

CREATE TABLE IF NOT EXISTS reminders (
  pk                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id                  TEXT UNIQUE NOT NULL,
  loan_id             TEXT,
  loan_number         TEXT,
  customer_id         TEXT,
  status              TEXT NOT NULL DEFAULT 'Active',
  next_reminder_date  TEXT,
  details             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders (status);
CREATE INDEX IF NOT EXISTS idx_reminders_loan ON reminders (loan_id);
