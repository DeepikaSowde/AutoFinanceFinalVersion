-- 004: who guaranteed or referred which loan, and commissions tied to them.
--
-- A person in the Guarantor / Referral register can stand behind many loans,
-- as guarantor on some and referrer on others. Each pairing is one link row.
-- Referral commissions gain the register person, customer and loan they are
-- for, so a person's commission history and the loan's referral can be read
-- back without matching on names.

CREATE TABLE IF NOT EXISTS guarantor_referral_links (
  pk             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id      INTEGER NOT NULL REFERENCES tenants (id),
  person_pk      INTEGER NOT NULL REFERENCES guarantor_referrals (pk) ON DELETE CASCADE,
  link_type      TEXT NOT NULL CHECK (link_type IN ('Guarantor', 'Referral')),
  customer_pk    INTEGER REFERENCES customers (pk) ON DELETE CASCADE,
  loan_pk        INTEGER REFERENCES loans (pk) ON DELETE CASCADE,
  associated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (person_pk, link_type, loan_pk)
);

CREATE INDEX IF NOT EXISTS guarantor_referral_links_tenant_idx ON guarantor_referral_links (tenant_id);
CREATE INDEX IF NOT EXISTS guarantor_referral_links_loan_idx ON guarantor_referral_links (loan_pk);

ALTER TABLE referral_commissions
  ADD COLUMN IF NOT EXISTS person_pk    INTEGER REFERENCES guarantor_referrals (pk) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_pk  INTEGER REFERENCES customers (pk) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS loan_pk      INTEGER REFERENCES loans (pk) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS agent_phone  TEXT,
  ADD COLUMN IF NOT EXISTS percentage   NUMERIC(8, 4),
  ADD COLUMN IF NOT EXISTS loan_amount  NUMERIC(14, 2);

CREATE INDEX IF NOT EXISTS referral_commissions_person_idx ON referral_commissions (person_pk);
