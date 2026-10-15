-- 006: two products — Auto Finance and General Finance — each with its own
-- plans. A tenant belongs to one product; its plan must be one of that
-- product's plans (enforced by the composite foreign key below).
--
-- Feature keys by product:
--   auto_finance:    web_app, mobile_app, whatsapp_reminders, vahan_lookup
--   general_finance: web_app, mobile_app, whatsapp_reminders, field_collection

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS product TEXT NOT NULL DEFAULT 'auto_finance'
    CHECK (product IN ('auto_finance', 'general_finance'));

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS product TEXT NOT NULL DEFAULT 'auto_finance'
    CHECK (product IN ('auto_finance', 'general_finance'));

-- Existing plans and tenants are Auto Finance (the defaults above).

ALTER TABLE plans ADD CONSTRAINT plans_id_product_key UNIQUE (id, product);
ALTER TABLE tenants ADD CONSTRAINT tenants_plan_product_fkey
  FOREIGN KEY (plan_id, product) REFERENCES plans (id, product);

CREATE INDEX IF NOT EXISTS idx_tenants_product ON tenants (product);

/* ---------- seed: General Finance plans ---------- */
-- Prices start at 0; set them on the admin app's Plans page.

INSERT INTO plans (code, name, price_monthly, product) VALUES
  ('gf_basic', 'Basic', 0, 'general_finance'),
  ('gf_standard', 'Standard', 0, 'general_finance'),
  ('gf_premium', 'Premium', 0, 'general_finance')
ON CONFLICT (code) DO NOTHING;

INSERT INTO plan_features (plan_id, feature_key)
SELECT p.id, f.feature_key
FROM plans p
JOIN (VALUES
  ('gf_basic', 'web_app'),
  ('gf_standard', 'web_app'),
  ('gf_standard', 'mobile_app'),
  ('gf_standard', 'whatsapp_reminders'),
  ('gf_standard', 'field_collection'),
  ('gf_premium', 'web_app'),
  ('gf_premium', 'mobile_app'),
  ('gf_premium', 'whatsapp_reminders'),
  ('gf_premium', 'field_collection')
) AS f (plan_code, feature_key) ON f.plan_code = p.code
ON CONFLICT DO NOTHING;

INSERT INTO plan_limits (plan_id, feature_key, monthly_limit)
SELECT p.id, l.feature_key, l.monthly_limit
FROM plans p
JOIN (VALUES
  ('gf_standard', 'whatsapp_reminders', 500),
  ('gf_premium', 'whatsapp_reminders', 2000)
) AS l (plan_code, feature_key, monthly_limit) ON l.plan_code = p.code
ON CONFLICT DO NOTHING;
