# MotoLend (Auto Finance)

- `frontend/` — lender web app, React + Vite (`cd frontend && npm install && npm run dev`). Set `VITE_API_BASE_URL` (see `frontend/.env.example`); it defaults to `http://localhost:4000/api`.
- `backend/` — Express + PostgreSQL (Neon) API (`cd backend && npm install`, copy `.env.example` to `.env`, set `DATABASE_URL`, `npm run dev`). See `backend/README.md`.
- `admin/` — super admin app for the product owner, a separate React + Vite + Tailwind app. See `admin/README.md`.

All lender data — investors, customers and loans, collections, income and expenses — is stored in the database. Each lender page talks to the API through an adapter in `frontend/src/services/` that converts between the API's records and the shapes the page uses. The only thing kept in the browser is an unsubmitted New Loan form.

Deployed: API on Render, lender app on Vercel, admin app on DigitalOcean (see `admin/README.md`).

## Lenders (tenants), plans and the super admin

Each lender is a **tenant**; every business row carries `tenant_id` and every query is limited to the signed-in lender's tenant. Plans (Basic, Premium) grant **features** (`web_app`, `mobile_app`, `whatsapp_reminders`, `vahan_lookup`) with monthly limits. Details: `backend/TENANCY.md`; super admin API: `backend/SUPERADMIN.md`.

### Migrations

`backend/src/db/schema.sql` is the base schema and runs on every start. One-time changes live in `backend/migrations/NNN_*.sql`; each runs once (tracked in `schema_migrations`). They run automatically when the API starts, or by hand:

```bash
cd backend
npm run migrate
```

The first run puts all existing data into the tenant **"MotoLend (default lender)"** on Premium for one year — rename it and set its plan in the admin app.

### Create the super admin

Set in `backend/.env` (or on Render → Environment):

```
SUPERADMIN_EMAIL=you@example.com
SUPERADMIN_PASSWORD=<at least 12 characters>
SUPERADMIN_NAME=Your Name            # optional
ADMIN_APP_ORIGIN=https://admin.yourdomain.in   # the admin app's address (comma-separate several)
```

The account is created when the API starts, or with `npm run seed:superadmin`. An existing account with that email is never changed, so you can leave the variables set. To change the password later, delete the row from `super_admins` and start again (or ask for a change-password screen).

### Run the admin app

```bash
cd admin
npm install
cp .env.example .env          # VITE_API_BASE_URL=http://localhost:4000
npm run dev                   # http://localhost:5174
```

### Manual test checklist

Run the API and the admin app, sign in to the admin app, then:

1. **Tenants → Add tenant** on **Basic**. Open it, **Create admin user**, note the temporary password.
2. Sign in to the lender app as that admin. `GET /api/auth/me` returns the tenant and `features: ["mobile_app","web_app"]`.
3. Call a VAHAN-protected route (once one exists — see `backend/TENANCY.md`) → **403** "Upgrade your plan to use this feature".
4. In the admin app change the plan to **Premium** → **Save**. The VAHAN route now **works**.
5. **Record payment** for 3 months → the payment appears in history with an `MLI-…` invoice number, and **Valid until** moves to the period end. Dashboard and the audit log show it.
6. **Plans → Premium**: set the VAHAN limit to 2 → **Save Premium**. Call the VAHAN route 3 times → the 3rd returns **429**; the tenant's usage bar shows 2 / 2.
7. Tenant page → **Suspend** → every lender API call and lender sign-in returns **403** "account is suspended". **Reactivate** → works again.
8. Set **Valid until** in the past (record nothing, or edit the database) → lender APIs return **403** "subscription has expired"; **Extend by 1 month** → works again.
9. **Reset temporary password** → the lender admin is signed out; only the new password works.
10. **Audit log** lists every step above with who did it.
