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

/*
 * User Management -> Roles & Permissions sets staff access per page (one
 * switch per sidebar item, for every staff account). A page that is on
 * grants these module actions; deleting and approving / reversing stay with
 * admins. User Management and Settings are admin-only and cannot be granted.
 */
export const STAFF_PAGE_PERMISSIONS = {
  dashboard: { dashboard: ["view"] },
  loans: { loans: ["view", "add", "edit"], reloan: ["view", "add", "edit"] },
  collection: { collections: ["view", "add"] },
  vehicle: { vehicles: ["view", "edit"] },
  ledger: { ledger: ["view"], income: ["view", "add", "edit"], expense: ["view", "add", "edit"] },
  customers: { customers: ["view", "add", "edit"] },
  investors: { investor: ["view", "add"] },
  reminders: { reminders: ["view", "add", "edit"] },
  users: {},
  settings: {},
};

export const ADMIN_ONLY_PAGES = ["users", "settings"];

// The staff role's defaults (as Oviya's Roles & Permissions tab ships them).
export const DEFAULT_STAFF_PAGES = {
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
};

export const normalizeStaffPages = (input) =>
  Object.fromEntries(
    Object.keys(STAFF_PAGE_PERMISSIONS).map((page) => [
      page,
      ADMIN_ONLY_PAGES.includes(page) ? false : Boolean(input?.[page] ?? DEFAULT_STAFF_PAGES[page]),
    ])
  );

// The module-action permissions a staff account gets from the page switches.
export const permissionsFromPages = (pages) => {
  const granted = {};
  for (const [page, on] of Object.entries(normalizeStaffPages(pages))) {
    if (!on) continue;
    for (const [module, actions] of Object.entries(STAFF_PAGE_PERMISSIONS[page])) {
      granted[module] ||= {};
      for (const action of actions) granted[module][action] = true;
    }
  }
  return normalizePermissions(granted);
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
