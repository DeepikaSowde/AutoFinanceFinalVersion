/**
 * MotoLend Collection Service & Role-Based Access Control
 * Enforces Option B role-based collection visibility:
 * - Admin: Full visibility across all collections (Admin, Staff 01, Staff 02, Legacy records)
 * - Staff: Strictly restricted to collections recorded by the authenticated staff user
 */

import { getCurrentUser } from '../utils/userManagementStorage.js';

export const PAYMENT_HISTORY_STORAGE_KEY = 'motoLendPaymentHistory';

/**
 * Retrieve Authorized Collection History
 * Enforces role-based visibility at the data access layer:
 * @param {Object|null} user - The authenticated user session
 * @returns {Array} List of authorized payment/collection records
 */
export function getAuthorizedCollections(user = undefined) {
  const activeUser = user !== undefined ? user : getCurrentUser();
  if (!activeUser) return [];

  let allPayments = [];
  try {
    const raw = localStorage.getItem(PAYMENT_HISTORY_STORAGE_KEY);
    allPayments = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(allPayments)) {
      allPayments = [];
    }
  } catch (err) {
    console.error('Failed to parse collection history from storage:', err);
    allPayments = [];
  }

  // Admin has complete visibility over all collections
  if (activeUser.role === 'Admin') {
    return allPayments;
  }

  // Staff user: strictly filter records where collectedByUserId matches authenticated user ID
  const activeUserId = String(activeUser.id || '').trim();
  return allPayments.filter((record) => {
    if (!record) return false;
    const collectorId = String(record.collectedByUserId || '').trim();
    return collectorId === activeUserId;
  });
}

/**
 * Format collector details for display on UI tables, cards, and receipts
 * Handles new tracked collections and historical legacy records safely
 * @param {Object} tx - The collection transaction record
 * @returns {Object} { name, role, isLegacy, isStaff, isAdmin }
 */
export function getCollectorInfo(tx) {
  if (!tx) {
    return {
      name: 'Unknown',
      role: 'Unknown',
      isLegacy: true,
      isStaff: false,
      isAdmin: false,
    };
  }

  // Check if explicit collector name is recorded
  if (tx.collectedByName && String(tx.collectedByName).trim()) {
    const role = tx.collectedByRole || (tx.collectedByUserId?.includes('admin') ? 'Admin' : 'Staff');
    return {
      name: String(tx.collectedByName).trim(),
      role: role,
      userId: tx.collectedByUserId || null,
      isLegacy: false,
      isStaff: role === 'Staff',
      isAdmin: role === 'Admin',
    };
  }

  // Legacy records without collector identity
  return {
    name: 'Legacy Record',
    role: 'Unknown',
    userId: null,
    isLegacy: true,
    isStaff: false,
    isAdmin: false,
  };
}

/**
 * Persist a newly collected payment with automatic collector identification
 * Stamps authenticated collector identity automatically from session
 * @param {Object} paymentRecord - The payment record data
 * @param {Object|null} user - The authenticated session user
 * @returns {Object} The complete stamped payment record
 */
export function saveAuthorizedCollection(paymentRecord, user = null) {
  const activeUser = user || getCurrentUser();
  if (!activeUser) {
    throw new Error('Authentication required: Cannot record collection without an active session.');
  }

  const nowIso = new Date().toISOString();

  // Strictly enforce collector fields from active authenticated session
  const stampedRecord = {
    ...paymentRecord,
    collectedByUserId: activeUser.id,
    collectedByName: activeUser.name,
    collectedByRole: activeUser.role,
    collectedAt: paymentRecord.collectedAt || nowIso,
  };

  try {
    const raw = localStorage.getItem(PAYMENT_HISTORY_STORAGE_KEY);
    const existingHistory = raw ? JSON.parse(raw) : [];
    existingHistory.push(stampedRecord);
    localStorage.setItem(PAYMENT_HISTORY_STORAGE_KEY, JSON.stringify(existingHistory));
    window.dispatchEvent(new Event('storage'));
    return stampedRecord;
  } catch (err) {
    console.error('Failed to save collection to storage:', err);
    throw new Error('Failed to persist collection record.');
  }
}
