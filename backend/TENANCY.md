# Tenancy (lenders)

Every lender is a **tenant**. Business data belongs to exactly one tenant and
no request can read or change another tenant's data.

## How a request is scoped

```
requireAuth  ->  loadTenant  ->  route  ->  repository queries
```

- `requireAuth` resolves the session token to a user; each user has a
  `tenant_id`.
- `loadTenant` (`src/middleware/tenant.js`) loads the tenant, its plan and
  features (plan features + `tenant_feature_overrides`), refuses the request
  when the tenant is **suspended**, **expired** or past `valid_until` plus its
  `grace_days` (set per tenant by the super admin, default 0), and
  runs the rest of the request inside `runWithTenant(tenantId)`.
- Repositories call `currentTenantId()` (`src/db/tenantContext.js`) and add it
  to every query. Outside a tenant request it throws, so a forgotten filter
  fails loudly instead of leaking data.
- Sign-in is refused for suspended / expired tenants with the same message.
  `GET /api/auth/me` still answers (it returns the tenant status), so the app
  can explain why.
- Renewal banner: `GET /api/auth/me` returns `tenant.subscription`
  (`daysLeft`, `graceDays`, `graceEndsOn`, `inGrace`) and `supportContact`
  (env `SUPPORT_CONTACT`). The lender app (`SubscriptionBanner.jsx`) shows
  every user a banner from 30 days before `valid_until` until the grace days
  run out. A request refused mid-session for an expired / suspended tenant
  signs the user out to the sign-in page with the reason.

## Plan features and limits

- `requireFeature(key)` — 403 `{ error: "Upgrade your plan to use this feature" }`
  unless the tenant has the feature.
- `checkUsageLimit(key)` — counts one use in `usage_counters` for the current
  month (Asia/Kolkata); 429 once the plan's `plan_limits.monthly_limit` is
  reached. The increment and the limit check are one statement, so two
  requests cannot both take the last unit. No limit row = unlimited.
- Feature keys: `web_app`, `mobile_app`, `whatsapp_reminders`, `vahan_lookup`.

**Not attached yet:** there is no server-side WhatsApp or VAHAN route. The
Reminders page's WhatsApp button is a `wa.me` link opened in the browser and
the New Loan "Fetch Vehicle Details" button is a placeholder. When those
integrations are built, put them behind:

```js
router.post("/vahan/lookup", requireFeature("vahan_lookup"), checkUsageLimit("vahan_lookup"), handler);
```

## Which tables carry `tenant_id`

Tables read directly: users, customers, vehicles, loans, collections,
investors, investor_transactions, expenses, incomes, categories,
referral_commissions, reminders, loan_drafts, guarantor_referrals,
reloan_rules, reloan_eligibility_checks, app_settings (`NOT NULL`, migration
003), and guarantor_referral_links (created `NOT NULL` in migration 004; it
records which register person guaranteed or referred which loan).

Child tables — guarantors, rc_details, installments, payment_allocations,
vehicle_events — have no column: they are only ever reached through their
parent's internal `pk`, taken from a row already filtered by tenant.

Per-tenant keys: `app_settings (tenant_id, key)`, `reloan_rules (tenant_id)`,
`categories UNIQUE (tenant_id, type, name)`. Public ids (CUS-00001, LN-00001,
…) stay globally unique.

## Query audit (step c, 2026-10-13)

Before this change **no query** filtered by tenant (the app was single-lender).
All 152 statements in `src/` were reviewed:

| Kind | Count |
|---|---|
| Filter on `tenant_id` (incl. the shared `SELECT_*` constants, every use of which adds the filter) | 71 |
| By an internal `pk` taken from a tenant-scoped row (or just inserted) | 37 |
| Child-table rows reached through their parent | 22 |
| Not business data (sessions, plans, tenants, migrations) | 12 |
| Deliberately global | 5 |

The deliberately global ones, all in `services/auth.js`:

- `SELECT * FROM users WHERE username = $1` — sign-in; usernames are unique
  across all lenders and the user's own `tenant_id` decides the tenant.
- `SELECT pk FROM users WHERE username = $1` — "username already taken".
- `SELECT COALESCE(MAX(pk), 0) FROM users` — user id numbering.
- `SELECT COUNT(*) FROM users` — demo users are seeded only into an empty
  database.
- session lookup by token.

Re-run the audit after adding queries: every new statement on a table above
needs `tenant_id = currentTenantId()` (or must go through a scoped parent).
