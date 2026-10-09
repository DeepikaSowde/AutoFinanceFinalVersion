# Auto Finance

- `frontend/` — React + Vite UI (`cd frontend && npm install && npm run dev`)
- `backend/` — Express + PostgreSQL (Neon) API (`cd backend && npm install`, copy `.env.example` to `.env`, set `DATABASE_URL`, `npm run dev`). Creates its tables on first start; see `backend/README.md`.

The frontend pages still read/write browser localStorage; they are not yet switched over to the API.
