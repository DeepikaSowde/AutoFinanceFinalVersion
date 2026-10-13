-- 003: every query now sets and filters tenant_id, so it becomes required.
--
-- Rows written between 002 and this release (before queries set the
-- column) still have no tenant; they belong to the first tenant, like the
-- rest of the data that existed before multi-tenancy.

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
    EXECUTE format('UPDATE %I SET tenant_id = $1 WHERE tenant_id IS NULL', business_table) USING default_tenant;
    EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET NOT NULL', business_table);
  END LOOP;
END $$;

-- Settings were one value per key for the whole app; now one per lender.
ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_pkey;
ALTER TABLE app_settings ADD PRIMARY KEY (tenant_id, key);

-- Category names are unique within a lender, not across all lenders.
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_type_name_key;
ALTER TABLE categories ADD CONSTRAINT categories_tenant_type_name_key UNIQUE (tenant_id, type, name);

-- Re-loan rules were a single row (pk = 1); now one row per lender.
ALTER TABLE reloan_rules DROP COLUMN IF EXISTS pk;
ALTER TABLE reloan_rules ADD PRIMARY KEY (tenant_id);
