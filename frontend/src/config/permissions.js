// Staff permissions, as shown in User Management. Mirrors the catalog in
// backend/src/services/permissions.js — keep the two in sync. Admins have
// every permission; the server enforces all of these.

export const PERMISSION_MODULES = [
  { key: 'dashboard', label: 'Dashboard', actions: ['view'] },
  { key: 'customers', label: 'Customers', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'loans', label: 'Loans', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'reloan', label: 'Re-loans', actions: ['view', 'add', 'edit'] },
  { key: 'collections', label: 'Collections', actions: ['view', 'add', 'approve'] },
  { key: 'vehicles', label: 'Vehicles', actions: ['view', 'edit'] },
  { key: 'ledger', label: 'Ledger', actions: ['view'] },
  { key: 'investor', label: 'Investors', actions: ['view', 'add'] },
  { key: 'income', label: 'Income', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'expense', label: 'Expenses', actions: ['view', 'add', 'edit', 'delete', 'approve'] },
  { key: 'reminders', label: 'Reminders', actions: ['view', 'add', 'edit'] },
]

export const ACTION_LABELS = {
  view: 'View',
  add: 'Add',
  edit: 'Edit',
  delete: 'Delete',
  approve: 'Approve / Reverse',
}

// Matches the server's default for a new staff account.
export const DEFAULT_STAFF_PERMISSIONS = { collections: { view: true, add: true } }

// The permission that opens each page, chosen so every API call the page
// makes is allowed (e.g. the Ledger also reads investors, which ledger.view
// covers). Admins open everything; /users is admin-only.
// Order matters: a user opens on the first page here they can see, so
// Dashboard comes first (anyone without dashboard access falls to Loans).
export const PAGE_ACCESS = {
  '/dashboard': ['dashboard.view'],
  '/loans': ['loans.view', 'loans.add'],
  '/newloan': ['loans.add'],
  '/collection': ['collections.view'],
  // Chit Investment (reached from the Dashboard's Chit Overview card).
  '/chit-investment': ['expense.view', 'income.view'],
  '/customers': ['customers.view'],
  '/guarantor-referral': ['customers.view', 'loans.add'],
  // Re-Loan assessment for an existing customer (creating the loan needs loans.add).
  '/re-loan': ['customers.view'],
  '/referral-commission': ['customers.view', 'expense.view'],
  '/ledger': ['ledger.view'],
  '/investors': ['investor.view'],
  '/vehicle': ['vehicles.view'],
  '/reminders': ['reminders.view'],
  '/users': [],
  // Smart Search looks across customers, loans and payments.
  '/smart-search': ['customers.view'],
  // Company-wide penalty and grace settings: admin-only.
  '/settings': [],
}

export const canOpen = (user, path) => {
  if (user?.role === 'admin') return true
  return (PAGE_ACCESS[path] || []).some((permission) => {
    const [module, action] = permission.split('.')
    return user?.permissions?.[module]?.[action] === true
  })
}

// Where to land after sign-in: the first page allowed (Loans for admins).
export const homePageFor = (user) => Object.keys(PAGE_ACCESS).find((path) => canOpen(user, path)) || null
