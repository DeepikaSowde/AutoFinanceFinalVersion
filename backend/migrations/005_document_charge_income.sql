-- 005: document charges as income.
--
-- A loan's document charge (loans.charges->>'documentCharge') is income, not
-- principal or interest. From now on saving a loan writes one income row for
-- it, id INC-DOC-<loan id> (see incomeRepository.syncDocumentChargeIncome).
-- This backfills that row for loans that already carry a charge.

INSERT INTO incomes
  (id, amount, status, category, income_date, payment_mode, received_from, reference,
   description, remarks, details, created_by, tenant_id)
SELECT
  'INC-DOC-' || l.id,
  (l.charges->>'documentCharge')::numeric,
  'Received',
  'Document Charge',
  to_char(l.created_at, 'YYYY-MM-DD'),
  COALESCE(NULLIF(l.collection->>'paymentMode', ''), 'Cash'),
  COALESCE(NULLIF(c.personal->>'name', ''), 'Customer'),
  l.id,
  'Document charge',
  'Document charge collected for loan ' || l.id || ' (' || COALESCE(NULLIF(c.personal->>'name', ''), 'Customer') || ')',
  jsonb_build_object(
    'loanId', l.id,
    'customerId', c.id,
    'customerName', COALESCE(NULLIF(c.personal->>'name', ''), 'Customer'),
    'isDocumentCharge', true
  ),
  'system',
  l.tenant_id
FROM loans l
JOIN customers c ON c.pk = l.customer_pk
WHERE (l.charges->>'documentCharge') ~ '^[0-9]+(\.[0-9]+)?$'
  AND (l.charges->>'documentCharge')::numeric > 0
ON CONFLICT (id) DO NOTHING;
