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
export const PAGE_ACCESS = {
  '/loans': ['loans.view', 'loans.add'],
  '/dashboard': ['dashboard.view'],
  '/newloan': ['loans.add'],
  '/collection': ['collections.view'],
  '/customers': ['customers.view'],
  '/ledger': ['ledger.view'],
  '/investors': ['investor.view'],
  '/vehicle': ['vehicles.view'],
  '/reminders': ['reminders.view'],
  '/users': [],
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
