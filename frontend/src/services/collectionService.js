/**
 * Collector identity on collections (Option B role-based visibility).
 *
 * The server stamps every collection with the signed-in user who recorded it
 * (collectedByUserId / collectedByName / collectedByRole) and lists only a
 * staff user's own collections with collectionApi.loadPayments({ mine: true }).
 * These helpers only shape what the pages show.
 */

/**
 * The collections `user` may see from an already-loaded list: all of them for
 * an admin, only their own for staff.
 */
export function getAuthorizedCollections(user, payments = []) {
  if (!user) return [];
  if (user.role === 'Admin') return payments;
  const userId = String(user.id || '').trim();
  return payments.filter((record) => String(record?.collectedByUserId || '').trim() === userId);
}

/**
 * Collector details for tables, cards and receipts; collections recorded
 * before collectors were tracked are "Legacy Record".
 * @returns {Object} { name, role, userId, isLegacy, isStaff, isAdmin }
 */
export function getCollectorInfo(tx) {
  if (tx?.collectedByName && String(tx.collectedByName).trim()) {
    const role = tx.collectedByRole || 'Staff';
    return {
      name: String(tx.collectedByName).trim(),
      role,
      userId: tx.collectedByUserId || null,
      isLegacy: false,
      isStaff: role === 'Staff',
      isAdmin: role === 'Admin',
    };
  }
  return {
    name: tx ? 'Legacy Record' : 'Unknown',
    role: 'Unknown',
    userId: null,
    isLegacy: true,
    isStaff: false,
    isAdmin: false,
  };
}
