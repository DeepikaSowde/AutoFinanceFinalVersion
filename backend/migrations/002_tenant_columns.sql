-- 002: tenant_id on every table that business data is read from directly.
--
-- Child rows (guarantors, rc_details, installments, payment_allocations,
-- vehicle_events) are always reached through their parent, so they inherit
-- its tenant and get no column of their own.
--
-- The columns are nullable here and every existing row is put in a first
-- tenant, "MotoLend (default lender)". Once all queries set and filter on
-- tenant_id (step c), a later migration makes the columns NOT NULL.

-- The data already in the database belongs to the lender using the app today.
INSERT INTO tenants (name, plan_id, status, valid_until)
SELECT 'MotoLend (default lender)', p.id, 'active', (current_date + INTERVAL '1 year')::date
FROM plans p
WHERE p.code = 'premium'
  AND NOT EXISTS (SELECT 1 FROM tenants);

DO $$
DECLARE
  business_table TEXT;
  default_tenant INTEGER;
BEGIN
  SELECT min(id) INTO default_tenant FROM tenants;

  FOREACH business_table IN ARRAY ARRAY[
    'users',
    'customers',
    'vehicles',
    'loans',
    'collections',
    'investors',
    'investor_transactions',
    'expenses',
    'incomes',
    'categories',
    'referral_commissions',
    'reminders',
    'loan_drafts',
    'guarantor_referrals',
    'reloan_rules',
    'reloan_eligibility_checks',
    'app_settings'
  ]
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN tenant_id INTEGER REFERENCES tenants (id) ON DELETE RESTRICT',
      business_table
    );
    EXECUTE format('UPDATE %I SET tenant_id = $1', business_table) USING default_tenant;
    EXECUTE format('CREATE INDEX %I ON %I (tenant_id)', 'idx_' || business_table || '_tenant', business_table);
  END LOOP;
END $$;
