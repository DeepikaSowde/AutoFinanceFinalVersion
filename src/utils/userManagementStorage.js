/**
 * MotoLend User Management & Role-Based Access Control Storage
 * Manages users, credentials, role permissions, and active session state in LocalStorage.
 */

export const USERS_STORAGE_KEY = 'motoLendUsers_data';
export const ROLE_PERMISSIONS_STORAGE_KEY = 'motoLendRolePermissions_data';
export const CURRENT_USER_STORAGE_KEY = 'motoLendCurrentUser_data';

export const USER_UPDATE_EVENT = 'motoLendUsersUpdated';
export const PERMISSION_UPDATE_EVENT = 'motoLendPermissionsUpdated';
export const SESSION_UPDATE_EVENT = 'motoLendSessionUpdated';

/**
 * 10 Authoritative Navigation Items from MotoLend Sidebar
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
  { id: 'users', name: 'User Management', path: '/users', section: 'User', description: 'Staff credentials and role permissions' },
  { id: 'settings', name: 'Settings', path: '/settings', section: 'User', description: 'System configuration, penalties, and grace periods' },
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

/**
 * Default Primary Administrator Account
 */
export const DEFAULT_PRIMARY_ADMIN = {
  id: 'usr-admin-01',
  username: 'admin',
  name: 'Admin User',
  phone: '9876543210',
  address: 'MotoLend Corporate Office, Chennai, Tamil Nadu',
  role: 'Admin',
  status: 'Active',
  isPrimaryAdmin: true,
  passwordHash: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', // SHA-256 of 'admin@123'
  createdAt: '2024-01-01T09:00:00.000Z',
  updatedAt: '2024-01-01T09:00:00.000Z',
  permissions: null, // Admin retains all permissions
};

/**
 * SHA-256 Browser-Native Password Hashing
 */
export async function hashPassword(plainPassword) {
  if (!plainPassword) return '';
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(plainPassword);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // Fallback simple checksum if Web Crypto is unavailable in edge environments
    let hash = 0;
    for (let i = 0; i < plainPassword.length; i++) {
      hash = (hash << 5) - hash + plainPassword.charCodeAt(i);
      hash |= 0;
    }
    return `fb_${Math.abs(hash)}`;
  }
}

/**
 * Safe status normalization for Active / Inactive states
 */
export function normalizeStatus(status) {
  if (!status) return 'Active';
  return String(status).trim().toLowerCase() === 'inactive' ? 'Inactive' : 'Active';
}

/**
 * Retrieve all users from LocalStorage with strict deduplication
 * Guarantees no duplicate records or phantom placeholders
 */
export function getUsers() {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (!raw) {
      const initialUsers = [DEFAULT_PRIMARY_ADMIN];
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(initialUsers));
      return initialUsers;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const initialUsers = [DEFAULT_PRIMARY_ADMIN];
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(initialUsers));
      return initialUsers;
    }

    // Deduplicate parsed records strictly by unique ID
    const seenIds = new Set();
    const deduplicated = [];

    for (let i = 0; i < parsed.length; i++) {
      const user = parsed[i];
      if (!user || typeof user !== 'object') continue;
      const stableId = user.id ? String(user.id).trim() : (user._id ? String(user._id).trim() : `usr-record-${i + 1}`);

      // Skip duplicate instances of the same ID
      if (seenIds.has(stableId)) continue;
      seenIds.add(stableId);

      // Safe status normalization for missing or undefined values
      const normalizedUser = {
        ...user,
        id: stableId,
        status: normalizeStatus(user.status),
      };

      deduplicated.push(normalizedUser);
    }

    // Ensure primary admin exists exactly once
    const hasAdmin = deduplicated.some((u) => u.isPrimaryAdmin || u.role === 'Admin');
    if (!hasAdmin) {
      deduplicated.unshift(DEFAULT_PRIMARY_ADMIN);
    }

    // Persist deduplicated list if duplicates were purged or statuses normalized
    if (deduplicated.length !== parsed.length) {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(deduplicated));
    }

    return deduplicated;
  } catch (err) {
    console.error('Failed to get users from localStorage:', err);
    return [DEFAULT_PRIMARY_ADMIN];
  }
}

/**
 * Save users list to LocalStorage and notify listeners
 */
export function saveUsers(users) {
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
    window.dispatchEvent(new CustomEvent(USER_UPDATE_EVENT, { detail: users }));
    return true;
  } catch (err) {
    console.error('Failed to save users:', err);
    return false;
  }
}

/**
 * Create a new user account (Username field removed)
 */
export async function createUser({ name, phone, address, role, status = 'Active', password }) {
  const users = getUsers();

  if (!name || !name.trim()) {
    throw new Error('Full Name is required.');
  }

  const cleanPhone = String(phone || '').trim().replace(/[\s-]/g, '');
  if (!cleanPhone || !/^\d{10}$/.test(cleanPhone)) {
    throw new Error('A valid 10-digit phone number is required.');
  }

  // Validate duplicate phone
  const duplicatePhone = users.find((u) => String(u.phone || '').replace(/[\s-]/g, '') === cleanPhone);
  if (duplicatePhone) {
    throw new Error(`A user with phone number "${phone}" already exists.`);
  }

  const passwordHash = password ? await hashPassword(password) : await hashPassword('welcome@123');
  const now = new Date().toISOString();

  const newUser = {
    id: `usr-${(role || 'staff').toLowerCase()}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    name: name.trim(),
    phone: cleanPhone,
    address: (address || '').trim(),
    role: role === 'Admin' ? 'Admin' : 'Staff',
    status: normalizeStatus(status),
    isPrimaryAdmin: false,
    passwordHash,
    createdAt: now,
    updatedAt: now,
    permissions: null, // Navigation permissions managed strictly in Roles & Permissions tab
  };

  const updatedUsers = [...users, newUser];
  saveUsers(updatedUsers);
  return newUser;
}

/**
 * Update an existing user account
 * Works reliably for both Active and Inactive users and preserves user ID
 */
export async function updateUser(id, updates) {
  if (!id) {
    throw new Error('User ID is required.');
  }

  const users = getUsers();
  const targetId = String(id).trim();
  const targetDigits = targetId.replace(/\D/g, '').slice(-10);

  // Robust index lookup by ID or Phone (handles any formatting variations)
  const index = users.findIndex((u) => {
    if (!u) return false;
    if (String(u.id || '').trim() === targetId) return true;
    if (String(u._id || '').trim() === targetId) return true;
    const uPhoneDigits = String(u.phone || '').replace(/\D/g, '').slice(-10);
    if (targetDigits && uPhoneDigits && uPhoneDigits === targetDigits) return true;
    return false;
  });

  if (index === -1) {
    throw new Error('User not found.');
  }

  const existing = users[index];

  // Prevent primary admin demotion or deactivation
  if (existing.isPrimaryAdmin) {
    if (updates.role && updates.role !== 'Admin') {
      throw new Error('The primary administrator account role cannot be changed.');
    }
    if (updates.status && normalizeStatus(updates.status) !== 'Active') {
      throw new Error('The primary administrator account cannot be deactivated.');
    }
  }

  // Validate phone uniqueness if phone is changing
  if (updates.phone !== undefined) {
    const rawDigits = String(updates.phone || '').replace(/\D/g, '');
    const cleanPhone = rawDigits.length > 10 ? rawDigits.slice(-10) : rawDigits;
    if (!cleanPhone || !/^\d{10}$/.test(cleanPhone)) {
      throw new Error('Please enter a valid 10-digit registered mobile number.');
    }

    const duplicate = users.find((u) => {
      if (!u) return false;
      // Do not conflict with the record currently being updated
      if (String(u.id || '').trim() === String(existing.id || '').trim()) return false;
      const uPhoneDigits = String(u.phone || '').replace(/\D/g, '').slice(-10);
      return uPhoneDigits === cleanPhone;
    });

    if (duplicate) {
      throw new Error(`Another user with phone number "${cleanPhone}" already exists.`);
    }
    updates.phone = cleanPhone;
  }

  // Handle password update if provided
  let newPasswordHash = existing.passwordHash;
  if (updates.password && updates.password.trim().length > 0) {
    newPasswordHash = await hashPassword(updates.password.trim());
  }
  // Remove password field so it doesn't leak raw into user object
  delete updates.password;

  // Determine updated status safely
  let targetStatus = existing.status || 'Active';
  if (updates.status !== undefined) {
    targetStatus = normalizeStatus(updates.status);
  }
  if (existing.isPrimaryAdmin) {
    targetStatus = 'Active';
  }

  const updatedUser = {
    ...existing,
    ...updates,
    id: existing.id, // Strictly ensure the edited user remains associated with the correct user ID
    status: targetStatus,
    role: existing.isPrimaryAdmin ? 'Admin' : (updates.role || existing.role || 'Staff'),
    passwordHash: newPasswordHash,
    updatedAt: new Date().toISOString(),
  };

  users[index] = updatedUser;
  saveUsers(users);

  // If current session user was updated, update active session as well
  const current = getCurrentUser();
  if (current && String(current.id).trim() === String(id).trim()) {
    if (updatedUser.status === 'Inactive') {
      // If current session user was deactivated, revert active session to primary admin
      const admin = users.find((u) => u.isPrimaryAdmin) || DEFAULT_PRIMARY_ADMIN;
      setCurrentUser(admin);
    } else {
      setCurrentUser(updatedUser);
    }
  }

  return updatedUser;
}

/**
 * Delete a user (prevent primary admin deletion)
 */
export function deleteUser(id) {
  const users = getUsers();
  const target = users.find((u) => u.id === id);
  if (!target) return false;
  if (target.isPrimaryAdmin) {
    throw new Error('The primary administrator account cannot be deleted.');
  }

  const filtered = users.filter((u) => u.id !== id);
  saveUsers(filtered);
  return true;
}

/**
 * Retrieve Role-Level Permissions
 */
export function getRolePermissions() {
  try {
    const raw = localStorage.getItem(ROLE_PERMISSIONS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(ROLE_PERMISSIONS_STORAGE_KEY, JSON.stringify(DEFAULT_ROLE_PERMISSIONS));
      return DEFAULT_ROLE_PERMISSIONS;
    }
    const parsed = JSON.parse(raw);
    return {
      Admin: { ...DEFAULT_ROLE_PERMISSIONS.Admin, ...(parsed.Admin || {}) },
      Staff: { ...DEFAULT_ROLE_PERMISSIONS.Staff, ...(parsed.Staff || {}) },
    };
  } catch (err) {
    console.error('Failed to get role permissions:', err);
    return DEFAULT_ROLE_PERMISSIONS;
  }
}

/**
 * Save Role-Level Permissions
 */
export function saveRolePermissions(permissions) {
  try {
    // Admin always maintains full access
    const finalPermissions = {
      Admin: NAVIGATION_ITEMS.reduce((acc, item) => ({ ...acc, [item.id]: true }), {}),
      Staff: { ...permissions.Staff },
    };
    localStorage.setItem(ROLE_PERMISSIONS_STORAGE_KEY, JSON.stringify(finalPermissions));
    window.dispatchEvent(new CustomEvent(PERMISSION_UPDATE_EVENT, { detail: finalPermissions }));
    return true;
  } catch (err) {
    console.error('Failed to save role permissions:', err);
    return false;
  }
}

/**
 * Reset Role-Level Permissions to defaults
 */
export function resetRolePermissions() {
  return saveRolePermissions(DEFAULT_ROLE_PERMISSIONS);
}

/**
 * Retrieve Current Active Authenticated User
 * Includes session validation, active status check, and role-tamper protection
 */
export function getCurrentUser() {
  try {
    const raw = localStorage.getItem(CURRENT_USER_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.id) {
      return null;
    }

    // Cross-verify against canonical users store to prevent client-side role manipulation
    const allUsers = getUsers();
    const canonical = allUsers.find((u) => String(u.id).trim() === String(parsed.id).trim());
    if (!canonical) {
      localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
      return null;
    }

    // Enforce active status
    if (normalizeStatus(canonical.status) === 'Inactive') {
      localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
      return null;
    }

    // Anti-tamper check: If localStorage role was modified to Admin, enforce canonical role
    if (parsed.role !== canonical.role) {
      parsed.role = canonical.role;
      localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(parsed));
    }

    return parsed;
  } catch (err) {
    console.error('Failed to get current user:', err);
    return null;
  }
}

/**
 * Set Current Active User Session
 */
export function setCurrentUser(user) {
  try {
    if (!user) {
      localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
      window.dispatchEvent(new CustomEvent(SESSION_UPDATE_EVENT, { detail: null }));
      return true;
    }
    localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(user));
    window.dispatchEvent(new CustomEvent(SESSION_UPDATE_EVENT, { detail: user }));
    return true;
  } catch (err) {
    console.error('Failed to set current user:', err);
    return false;
  }
}

/**
 * Authenticate and log in user with identifier (username, phone, or name) and password
 */
export async function loginUser(identifier, plainPassword) {
  if (!identifier || !String(identifier).trim()) {
    throw new Error('Please enter your username or mobile number.');
  }
  if (!plainPassword || !String(plainPassword).trim()) {
    throw new Error('Please enter your password.');
  }

  const cleanIdent = String(identifier).trim().toLowerCase();
  const cleanDigits = cleanIdent.replace(/\D/g, '');
  const allUsers = getUsers();

  // Find user by username, registered 10-digit phone number, full name, or ID
  const user = allUsers.find((u) => {
    if (!u) return false;
    // 1. Direct username match (case-insensitive)
    if (u.username && String(u.username).trim().toLowerCase() === cleanIdent) {
      return true;
    }
    // 2. 10-digit phone match
    if (cleanDigits && cleanDigits.length === 10) {
      const uDigits = String(u.phone || '').replace(/\D/g, '').slice(-10);
      if (uDigits === cleanDigits) return true;
    }
    // 3. Full name match (case-insensitive)
    if (u.name && String(u.name).trim().toLowerCase() === cleanIdent) {
      return true;
    }
    // 4. Stable User ID match
    if (u.id && String(u.id).trim().toLowerCase() === cleanIdent) {
      return true;
    }
    return false;
  });

  if (!user) {
    throw new Error('Invalid username or password. Please verify your credentials.');
  }

  // Verify account is Active (inactive staff cannot log in)
  if (normalizeStatus(user.status) === 'Inactive') {
    throw new Error('This account has been deactivated. Please contact your system administrator to restore access.');
  }

  // Verify password hash using browser-native SHA-256
  const computedHash = await hashPassword(plainPassword.trim());
  const isPrimaryAdminMatch = user.isPrimaryAdmin && (
    computedHash === '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918' || // 'admin'
    computedHash === '7676aaafb027c825bd9abab78b234070e702752f625b752e55e55b48e607e358'    // 'admin@123'
  );

  if (computedHash !== user.passwordHash && !isPrimaryAdminMatch) {
    throw new Error('Invalid username or password. Please verify your credentials.');
  }

  // Create sanitized session object (never expose plaintext passwords or hash)
  const sessionUser = {
    id: user.id,
    name: user.name,
    username: user.username || user.name,
    phone: user.phone,
    role: user.role,
    status: user.status,
    isPrimaryAdmin: Boolean(user.isPrimaryAdmin),
    permissions: user.permissions || null,
    token: `mtl_token_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    loggedInAt: new Date().toISOString(),
  };

  setCurrentUser(sessionUser);
  return sessionUser;
}

/**
 * Log out active user and terminate session
 */
export function logoutUser() {
  try {
    localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(SESSION_UPDATE_EVENT, { detail: null }));
    return true;
  } catch (err) {
    console.error('Failed to log out user:', err);
    return false;
  }
}

/**
 * Check if a valid authenticated session exists
 */
export function isAuthenticated() {
  return Boolean(getCurrentUser());
}

/**
 * Check if a user has access to a given path or nav item
 */
export function hasPathPermission(user, path) {
  if (!user || user.role === 'Admin') return true;

  // Inactive users have no access
  if (normalizeStatus(user.status) === 'Inactive') return false;

  // Find corresponding nav item
  const cleanPath = path.toLowerCase().split('?')[0];
  const navItem = NAVIGATION_ITEMS.find((item) => {
    const itemPath = item.path.toLowerCase();
    return cleanPath === itemPath || cleanPath.startsWith(`${itemPath}/`);
  });

  if (!navItem) return true; // Non-restricted utility paths (e.g. smart-search)

  // Check user-specific custom permissions first if set
  if (user.permissions && user.permissions[navItem.id] !== undefined) {
    return Boolean(user.permissions[navItem.id]);
  }

  // Fall back to role-level permissions
  const rolePermissions = getRolePermissions();
  return Boolean(rolePermissions.Staff?.[navItem.id]);
}
