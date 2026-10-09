// src/services/permissions.js
//
// Per-user, per-action permissions for staff accounts. Admins always have
// every permission; staff only have what an admin toggled on in User
// Management. Mirrored on the frontend in src/config/permissions.js — keep
// the two catalogs in sync.

export const PERMISSION_MODULES = [
  { key: "dashboard", actions: ["view"] },
  { key: "customers", actions: ["view", "add", "edit", "delete"] },
  { key: "loans", actions: ["view", "add", "edit", "delete"] },
  { key: "reloan", actions: ["view", "add", "edit"] },
  { key: "collections", actions: ["view", "add", "approve"] },
  { key: "vehicles", actions: ["view", "edit"] },
  { key: "ledger", actions: ["view"] },
  { key: "investor", actions: ["view", "add"] },
  { key: "income", actions: ["view", "add", "edit", "delete"] },
  { key: "expense", actions: ["view", "add", "edit", "delete", "approve"] },
  { key: "reminders", actions: ["view", "add", "edit"] },
  { key: "control-center", actions: ["view"] },
];

// What a staff account starts with: the same access the old
// staff-only collection screen gave.
export const DEFAULT_STAFF_PERMISSIONS = {
  collections: { view: true, add: true },
};

/**
 * Drops unknown modules/actions and coerces values to booleans, so the
 * stored JSON can only ever hold catalog entries. Any action implies view.
 */
export const normalizePermissions = (input) => {
  const source = input && typeof input === "object" ? input : {};
  const result = {};

  for (const { key, actions } of PERMISSION_MODULES) {
    const moduleInput = source[key] && typeof source[key] === "object" ? source[key] : {};
    const granted = {};

    for (const action of actions) {
      if (moduleInput[action] === true) {
        granted[action] = true;
      }
    }

    if (Object.keys(granted).length > 0) {
      granted.view = true;
      result[key] = granted;
    }
  }

  return result;
};

export const hasPermission = (user, module, action = "view") => {
  if (!user) {
    return false;
  }

  if (user.role === "admin") {
    return true;
  }

  return user.permissions?.[module]?.[action] === true;
};
