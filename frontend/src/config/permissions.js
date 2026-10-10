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
