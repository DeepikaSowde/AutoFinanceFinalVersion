# Auto Finance

- `frontend/` — React + Vite UI (`cd frontend && npm install && npm run dev`). Set `VITE_API_BASE_URL` (see `frontend/.env.example`); it defaults to `http://localhost:4000/api`.
- `backend/` — Express + PostgreSQL (Neon) API (`cd backend && npm install`, copy `.env.example` to `.env`, set `DATABASE_URL`, `npm run dev`). Creates its tables on first start; see `backend/README.md`.

All data — investors, customers and loans, collections, income and expenses — is stored in the database. Each page talks to the API through an adapter in `frontend/src/services/` that converts between the API's records and the shapes the page uses. The only thing kept in the browser is an unsubmitted New Loan form.

Deployed: API on Render, frontend on Vercel.
