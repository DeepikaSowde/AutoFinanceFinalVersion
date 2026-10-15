# Super admin API

For the product owner: manage lenders (tenants), plans and subscription
payments. Base path **`/api/superadmin`**. Code: `src/superadmin/`.

## Sign-in and security

- `POST /auth/login` `{ email, password }` → `{ token, superAdmin, expiresAt }`.
  Rate limited: 5 failed attempts per email (20 per address) in 15 minutes →
  429 with `Retry-After`.
- Send `Authorization: Bearer <token>` on everything else. Sessions last 12
  hours; `POST /auth/logout` ends one; `GET /auth/me` returns the signed-in
  super admin (`role: "superadmin"`).
- Super admin sessions are stored apart from lender sessions
  (`super_admin_sessions` vs `sessions`), so a lender token is refused here
  (401) and a super admin token is refused on lender routes (401).
- Passwords are scrypt-hashed with a per-account salt (same scheme as lender
  users); hashes are never returned.
- CORS: only the origins in `ADMIN_APP_ORIGIN` may call this API from a
  browser. The lender API's CORS is unchanged.
- The first super admin comes from `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD`
  (see `.env.example`).
- Every change writes an `audit_logs` row in the same transaction.

Errors are `{ "error": "message" }` with 400 (invalid input), 401, 404, 409
(conflict) or 429.

## Endpoints

| Method | Path | Body / query | Notes |
|---|---|---|---|
| GET | `/dashboard` | | totals (tenants, active, expiringIn30Days, suspendedOrExpired), perPlan, perProduct, this month's usage vs limits, expiringSoon list |
| GET | `/tenants` | `search, product, planId, status (active\|suspended\|expired), page, pageSize` | `{ items, total, page, pageSize }`; each item has plan, effectiveStatus, validUntil, daysLeft, usage |
| POST | `/tenants` | `{ name, ownerName, phone, email, product, planId, validUntil? }` | the plan must belong to the product; the product cannot change later. Valid one month from today when no date is given |
| GET | `/tenants/:id` | | + features (effective), planFeatures, overrides, limits, usage, admins, userCount |
| PATCH | `/tenants/:id` | `{ name?, ownerName?, phone?, email? }` | |
| POST | `/tenants/:id/create-admin` | `{ name, email, username? }` | the lender's first admin; returns `temporaryPassword` once. Username defaults to the email |
| POST | `/tenants/:id/admin/reset-password` | `{ userId? }` | new `temporaryPassword`; signs that user out everywhere |
| PATCH | `/tenants/:id/plan` | `{ planId }` | only a plan of the tenant's product |
| PATCH | `/tenants/:id/status` | `{ status }` | active / suspended / expired |
| PATCH | `/tenants/:id/extend` | `{ months }` or `{ validUntil }` | months count from the later of today and valid_until; "expired" becomes active |
| PUT | `/tenants/:id/features` | `{ features: { vahan_lookup: true, … } }` | the wanted state per feature (only the tenant's product's features); only differences from the plan are stored as overrides |
| GET | `/tenants/:id/usage` | `month=YYYY-MM` (default this month) | used / limit per limited feature |
| POST | `/tenants/:id/payments` | `{ amount, method, referenceNo?, paidOn, periodFrom, periodTo, invoiceNo?, notes? }` | saves the payment, moves valid_until to periodTo (never earlier), sets status active, audits. Invoice number `MLI-<year>-<id>` when none is given |
| GET | `/tenants/:id/payments` | | newest first |
| GET | `/plans` | `product?` | product, features, limits, tenantCount |
| POST | `/plans` | `{ product, name, priceMonthly?, features?, limits? }` | a new plan for that product; the code is made from the name (`gf_gold`) |
| PUT | `/plans/:id` | `{ name?, priceMonthly?, isActive?, features?, limits? }` | features replace the list; limits only for features the plan has. The product cannot change |
| GET | `/audit-logs` | `tenantId?, page, pageSize` | newest first, with actor and tenant name |

## Products

Two products, each with its own plans: `auto_finance` and `general_finance`.
Every tenant belongs to one (`tenants.product`), and its plan must be one of
that product's (a composite foreign key enforces it). Features per product:

- Auto Finance: `web_app`, `mobile_app`, `whatsapp_reminders`, `vahan_lookup`
- General Finance: `web_app`, `mobile_app`, `whatsapp_reminders`, `field_collection`

The lender `/api/auth/me` returns `tenant.product`. The lender app does not act
on it yet: General Finance mode (no vehicles, field collection) is still to
be built, so `field_collection` has no effect today.

Payment methods: `upi`, `bank_transfer`, `cheque`, `cash`, `razorpay`.
`gateway_payment_id` is stored for Razorpay later (null for manual payments).
