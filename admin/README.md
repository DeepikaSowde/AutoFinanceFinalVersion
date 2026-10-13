# MotoLend super admin app

A separate React + Vite + Tailwind app for the product owner: lenders
(tenants), plans, subscription payments and the audit log. It talks only to
`/api/superadmin` on the MotoLend API and has its own build and deployment;
it is not part of the lender web app.

## Run locally

```bash
npm install
cp .env.example .env     # VITE_API_BASE_URL=http://localhost:4000
npm run dev              # http://localhost:5174
```

The API must allow this origin: `ADMIN_APP_ORIGIN=http://localhost:5174`
(its default). Sign in with the super admin created from `SUPERADMIN_EMAIL` /
`SUPERADMIN_PASSWORD` (see the root README).

`npm run build` writes a static site to `dist/`; `npm run lint` checks the code.

## Deploy on DigitalOcean (own domain)

The app is a static site, so it runs on DigitalOcean App Platform's static
site hosting.

1. **Apps → Create App →** GitHub, pick this repository and branch.
2. Edit the detected component (or add one) as a **Static Site**:
   - **Source directory:** `admin`
   - **Build command:** `npm ci && npm run build`
   - **Output directory:** `dist`
   - **Catchall document:** `index.html` (so `/tenants/12` loads after a refresh)
3. **Environment variables** (build time): `VITE_API_BASE_URL` = the API's
   address, e.g. `https://api.yourdomain.in` (no trailing slash).
4. **Settings → Domains → Add domain:** e.g. `admin.yourdomain.in`. Add the
   CNAME record DigitalOcean shows at your DNS provider; HTTPS is issued
   automatically.
5. On the **API** (Render → Environment) set
   `ADMIN_APP_ORIGIN=https://admin.yourdomain.in` and redeploy, otherwise the
   browser blocks the admin app's requests (CORS).

The page sets `noindex`, and the API only accepts super admin sessions, so a
lender account cannot use this app.
