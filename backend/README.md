# Auto Finance API

Express + PostgreSQL backend for the Auto Finance app. All application data —
customers, vehicles, loans, installments, collections, investors, expenses,
re-loan rules and login — lives in the database.

## Stack

- **Express** — REST API
- **PostgreSQL** via [`pg`](https://node-postgres.com). Developed against
  PostgreSQL 18 on [Neon](https://neon.tech); any PostgreSQL 13+ works.
- **Node.js 22+**

## Setup

```bash
cd backend
npm install
cp .env.example .env
# edit .env and set DATABASE_URL to your connection string
npm run dev            # or: npm start
```

On startup the API creates any missing tables (`src/db/schema.sql` is
idempotent) and seeds the two demo users, then listens on
`http://localhost:4000`.

**`.env` holds your database password and is gitignored — never commit it.**
If a connection string is ever exposed, reset the role password in your
provider's console.

### Connection security

For hosted databases the pool enforces full TLS certificate verification
(`verify-full`) and SCRAM channel binding. Neon issues `sslmode=require`,
which node-postgres flags as ambiguous, so `src/db/connection.js` upgrades it
explicitly rather than silently accepting a weaker mode.

## Login

The two demo accounts the frontend shipped with are seeded on first run, with
their passwords **scrypt-hashed** instead of stored in plaintext:

| Username | Password   | Role  |
|----------|------------|-------|
| `admin`  | `admin123` | admin |
| `staff`  | `staff123` | staff |

Auth is a bearer token: `POST /api/auth/login` returns `{ token, user }` and
every other endpoint expects `Authorization: Bearer <token>`.

## Data model

Relational tables with foreign keys and cascading deletes; JSON columns only
for genuinely free-form sub-objects (KYC fields, document metadata, insurance,
charges, allocation snapshots). See `src/db/schema.sql`.

```
users ─< sessions
customers ─┬─< guarantors
           ├─< vehicles ─┬─< rc_details
           │             └─< vehicle_events      (seizure/release/sale history)
           └─< loans ────┬─< installments
                         ├─< payment_allocations
                         └─< collections
```

Notable decisions:

- **One vehicle status vocabulary.** The frontend had grown three competing
  vehicle stores with two different status spellings. The database keeps a
  single enum (`ACTIVE / SEIZED / PENDING_SALE / RELEASED / SOLD`) and the
  client maps it to display labels.
- **Loan figures are always recomputed server-side** from the raw terms
  (`loanCalculator.js`), and the repayment schedule is generated server-side
  (`repaymentSchedule.js`). A calculation submitted by a client is ignored.
- **The schedule ties out exactly.** The final installment absorbs rounding
  drift so the rows sum to the loan total to the paisa — the last payment
  actually closes the loan.
- **Uploaded file contents are never persisted** — only metadata (name, type,
  size). This matches what the prototype did; real file storage is future work.

## Payments

`POST /api/collections` records a staff submission as `Pending`. Approving it
is the only thing that moves money, and it happens in one transaction
(`src/services/repaymentEngine.js`):

1. allocate the payment — penalty → interest → principal, oldest installment
   first, with any remainder booked as advance/excess;
2. update the affected installments;
3. write one `payment_allocations` row per bucket;
4. recompute the loan's status and outstanding.

Guards: a closed or foreclosed loan refuses payment, a non-positive amount is
rejected, and a collection can never post twice. Reversing an approved
collection unwinds its postings and recomputes the schedule.

### Concurrency

Unlike SQLite, PostgreSQL runs writes in parallel, so the money paths lock
explicitly:

- **Approval** takes `SELECT … FOR UPDATE` on the collection and its loan, so
  two admins approving at once cannot both post against the same balances.
- **Loan funding** holds a transaction-scoped advisory lock on the investment
  pool, so simultaneous disbursements cannot together overdraw it.
- **One allocation per loan** is also a partial unique index, returned as
  `409` if a race ever reaches it.

These were verified by firing concurrent requests: 10 simultaneous approvals
of one collection post exactly once; 5 simultaneous ₹3,00,000 draws on a
₹10,00,000 pool succeed exactly 3 times.

## API

| Method | Path | Notes |
|---|---|---|
| POST | /api/auth/login, /api/auth/logout | |
| GET | /api/auth/me | current user |
| GET | /api/customers, /api/customers/:id | full nested record |
| POST/PUT/DELETE | /api/customers[/:id] | admin |
| POST | /api/customers/:id/loans | additional loan (re-loan) |
| GET | /api/loans, /api/loans/:id, /api/loans/:id/collections | |
| GET | /api/vehicles, /api/vehicles/counts, /api/vehicles/:id, /api/vehicles/:id/events | |
| POST | /api/vehicles/:id/{seize,release,pending-sale,complete-sale,cancel-sale} | admin |
| GET | /api/collections, /api/collections/:id | |
| POST | /api/collections | admin + staff |
| POST | /api/collections/:id/{approve,reject,reverse} | admin |
| GET | /api/health | |

## Frontend integration

`src/services/customerStorage.js`, `vehicleStorage.js`, `collectionStorage.js`
and `authStorage.js` call this API through `src/services/api.js`. Set
`VITE_API_BASE_URL` in the frontend `.env` if the API is not on
`http://localhost:4000/api`.

## Investors, expenses and re-loan

- **Investors** (`investors`, `investor_transactions`): transactions are the
  ledger of record — invested / allocated / available are summed from them,
  never stored, so they cannot drift. Funding a loan draws on the pool as a
  whole (it is not attributed to one investor, matching how this app has
  always worked), and a unique index enforces one allocation per loan.
- **Expenses** (`expenses`): the fields that get filtered and summed are real
  columns; anything else the UI attaches travels in `details_json`.
- **Re-loan** (`reloan_rules`, `reloan_eligibility_checks`): a single settings
  row plus a write-once audit trail of each eligibility check.
- **Ledger** is a read model, not a table — it aggregates approved
  collections, vehicle sales and expenses at query time.

Only two modules still touch browser storage, and both are dead code no page
imports: `src/services/customerService.js` and `vehicleSaleStorage.js`.
