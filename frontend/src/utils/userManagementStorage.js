/**
 * MotoLend User Management & role-based access, backed by the API.
 *
 * Users, passwords and sessions live on the server (/api/auth): passwords
 * are hashed there, sign-in accepts a username or the account's mobile
 * number, and an Inactive account cannot sign in. Roles & Permissions sets
 * which pages staff can open; the server turns each page into module
 * permissions (config/permissions.js PAGE_ACCESS) and applies them to every
 * staff account. Admins can open everything.
 *
 * This module keeps the last copy of the users and the staff page switches
 * loaded from the server so the getters answer immediately during render,
 * and fires USER_UPDATE_EVENT / PERMISSION_UPDATE_EVENT when a fresh copy
 * arrives. The exports keep Oviya's names.
 */

import { apiDelete, apiGet, apiPost, apiPut, getSessionUser, login, logout } from '../services/api';
import { canOpen } from '../config/permissions';

export const USER_UPDATE_EVENT = 'motoLendUsersUpdated';
export const PERMISSION_UPDATE_EVENT = 'motoLendPermissionsUpdated';
export const SESSION_UPDATE_EVENT = 'motoLendSessionUpdated';

/**
 * 10 Authoritative Navigation Items from MotoLend Sidebar. User Management
 * and Settings are admin-only (adminOnly): staff can never be given them.
 */
export const NAVIGATION_ITEMS = [
  { id: 'dashboard', name: 'Dashboard', path: '/dashboard', section: 'Main', description: 'Business overview, KPIs, and collections summary' },
  { id: 'loans', name: 'Loan', path: '/loans', section: 'Modules', description: 'Loan creation, disbursements, and account details' },
  { id: 'collection', name: 'Collection', path: '/collection', section: 'Modules', description: 'Daily/monthly EMI collections and receipts' },
  { id: 'vehicle', name: 'Vehicle', path: '/vehicle', section: 'Modules', description: 'Vehicle inventory, seizing, releases, and foreclosures' },
  { id: 'ledger', name: 'Ledger', path: '/ledger', section: 'Modules', description: 'Accounting journal, income, and expense records' },
  { id: 'customers', name: 'Customer', path: '/customers', section: 'Modules', description: 'Customer profiles, KYC, and guarantor referrals' },
  { id: 'investors', name: 'Investor', path: '/investors', section: 'Modules', description: 'Investor portfolios, capital, and payouts' },
  { id: 'reminders', name: 'Reminder', path: '/reminders', section: 'Notifications', description: 'Due date alerts, overdue reminders, and notices' },
  { id: 'users', name: 'User Management', path: '/users', section: 'User', description: 'Staff credentials and role permissions', adminOnly: true },
  { id: 'settings', name: 'Settings', path: '/settings', section: 'User', description: 'System configuration, penalties, and grace periods', adminOnly: true },
];

/**
 * Default Role Permissions
 * Admin: Full access (unrestricted)
 * Staff: Operational access (Loan, Collection, Vehicle, Customer, Reminder, Dashboard)
 */
export const DEFAULT_ROLE_PERMISSIONS = {
  Admin: NAVIGATION_ITEMS.reduce((acc, item) => ({ ...acc, [item.id]: true }), {}),
  Staff: {
    dashboard: true,
    loans: true,
    collection: true,
    vehicle: true,
    ledger: false,
    customers: true,
    investors: false,
    reminders: true,
    users: false,
    settings: false,
  },
};

export function normalizeStatus(status) {
  return String(status || '').trim().toLowerCase() === 'inactive' ? 'Inactive' : 'Active';
}

const notify = (name, detail) => {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(name, { detail }));
};

const roleLabel = (role) => (String(role).toLowerCase() === 'staff' ? 'Staff' : 'Admin');

// A user from the API in the shape the User Management screens show.
const toUser = (user) => ({
  id: user.id,
  username: user.username,
  name: user.name,
  phone: user.phone || '',
  address: user.address || '',
  role: roleLabel(user.role),
  status: normalizeStatus(user.status),
  isPrimaryAdmin: Boolean(user.isPrimaryAdmin),
  permissions: null,
  createdAt: user.createdAt,
  updatedAt: user.createdAt,
});

/* ---------- users (admins only) ---------- */

let usersCache = [];
let usersLoading = null;
let usersLoaded = false;

/** Reloads the users from the server; concurrent calls share one request. */
export const loadUsers = () => {
  if (!usersLoading) {
    usersLoading = apiGet('/auth/users')
      .then((list) => {
        usersCache = list.map(toUser);
        usersLoaded = true;
        notify(USER_UPDATE_EVENT, usersCache);
        return usersCache;
      })
      .finally(() => {
        usersLoading = null;
      });
  }
  return usersLoading;
};

/** The users (last loaded copy; loads them on first use). */
export function getUsers() {
  if (!usersLoaded) loadUsers().catch(() => {});
  return usersCache;
}

const toPayload = ({ name, phone, address, role, status, password }) => ({
  ...(name !== undefined ? { name } : {}),
  ...(phone !== undefined ? { phone } : {}),
  ...(address !== undefined ? { address } : {}),
  ...(role !== undefined ? { role: String(role).toLowerCase() === 'staff' ? 'staff' : 'admin' } : {}),
  ...(status !== undefined ? { status: normalizeStatus(status) } : {}),
  ...(password ? { password } : {}),
});

/** Creates a user (staff sign in with their mobile number). Resolves to the new user. */
export async function createUser(fields) {
  const created = toUser(await apiPost('/auth/users', toPayload(fields)));
  await loadUsers().catch(() => {});
  return created;
}

/** Saves changes to a user; a blank password keeps the current one. Resolves to the saved user. */
export async function updateUser(id, updates) {
  const saved = toUser(await apiPut(`/auth/users/${encodeURIComponent(id)}`, toPayload(updates)));
  await loadUsers().catch(() => {});
  return saved;
}

/** Removes a user. */
export async function deleteUser(id) {
  await apiDelete(`/auth/users/${encodeURIComponent(id)}`);
  await loadUsers().catch(() => {});
  return true;
}

/* ---------- staff role: page permissions (admins only) ---------- */

let rolesCache = { ...DEFAULT_ROLE_PERMISSIONS };
let rolesLoaded = false;

const storeRoles = (data) => {
  rolesCache = { Admin: DEFAULT_ROLE_PERMISSIONS.Admin, Staff: { ...DEFAULT_ROLE_PERMISSIONS.Staff, ...(data?.Staff || {}) } };
  rolesLoaded = true;
  notify(PERMISSION_UPDATE_EVENT, rolesCache);
  return rolesCache;
};

/** Reloads the staff page switches from the server. */
export const loadRolePermissions = () => apiGet('/auth/role-permissions').then(storeRoles);

/** { Admin, Staff } page switches (last loaded copy; loads on first use). */
export function getRolePermissions() {
  if (!rolesLoaded) loadRolePermissions().catch(() => {});
  return rolesCache;
}

/** Saves the staff page switches; the server applies them to every staff account. */
export async function saveRolePermissions(permissions) {
  return storeRoles(await apiPut('/auth/role-permissions', { Staff: permissions?.Staff || {} }));
}

/** Restores the default staff page switches. */
export function resetRolePermissions() {
  return saveRolePermissions(DEFAULT_ROLE_PERMISSIONS);
}

/* ---------- session ---------- */

/** The signed-in user (from the session), in the shape the screens use. */
export function getCurrentUser() {
  const user = getSessionUser();
  if (!user) return null;
  return {
    id: user.userId,
    name: user.name,
    username: user.username,
    phone: user.phone || '',
    role: roleLabel(user.role),
    status: normalizeStatus(user.status),
    permissions: user.permissions || null,
  };
}

/** The session is set by signing in; kept for older callers. */
export function setCurrentUser() {
  notify(SESSION_UPDATE_EVENT, getCurrentUser());
  return true;
}

/** Signs in with a username or mobile number; resolves to the signed-in user. */
export async function loginUser(identifier, plainPassword) {
  if (!identifier || !String(identifier).trim()) {
    throw new Error('Please enter your username or mobile number.');
  }
  if (!plainPassword || !String(plainPassword).trim()) {
    throw new Error('Please enter your password.');
  }
  await login(String(identifier).trim(), plainPassword);
  const user = getCurrentUser();
  notify(SESSION_UPDATE_EVENT, user);
  return user;
}

/** Signs out. */
export function logoutUser() {
  logout();
  notify(SESSION_UPDATE_EVENT, null);
  return true;
}

export function isAuthenticated() {
  return Boolean(getCurrentUser());
}

/** Whether the user can open a page (the server checks every request anyway). */
export function hasPathPermission(user, path) {
  if (!user) return false;
  if (user.role === 'Admin') return true;
  const cleanPath = String(path || '').toLowerCase().split('?')[0];
  const navItem = NAVIGATION_ITEMS.find(
    (item) => cleanPath === item.path || cleanPath.startsWith(`${item.path}/`)
  );
  return canOpen(getSessionUser(), navItem ? navItem.path : cleanPath);
}
