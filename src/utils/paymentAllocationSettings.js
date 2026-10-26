/**
 * Payment Allocation Settings & Settlement Engine
 * 
 * Manages the priority order for allocating normal loan customer payments
 * between Interest and Principal.
 * 
 * Default Priority:
 * 1. Interest
 * 2. Principal
 * 
 * Configurable Priority:
 * - Interest -> Principal (Default)
 * - Principal -> Interest
 * 
 * Note: Penalty remains completely separate with its own collection workflows.
 */

export const PAYMENT_ALLOCATION_STORAGE_KEY = 'motoLendPaymentAllocationSettings_data';
export const PAYMENT_ALLOCATION_UPDATE_EVENT = 'motoLend_payment_allocation_settings_updated';

export const COMPONENT_TYPES = {
  INTEREST: 'Interest',
  PRINCIPAL: 'Principal',
};

export const DEFAULT_ALLOCATION_ORDER = [
  COMPONENT_TYPES.INTEREST,
  COMPONENT_TYPES.PRINCIPAL,
];

export const DEFAULT_ALLOCATION_SETTINGS = {
  allocationOrder: [...DEFAULT_ALLOCATION_ORDER],
  updatedAt: null,
};

/**
 * Validates and normalizes an allocation order array.
 * Must contain exactly 'Interest' and 'Principal' with no duplicates.
 */
export function normalizeAllocationOrder(order) {
  if (!Array.isArray(order) || order.length !== 2) {
    return [...DEFAULT_ALLOCATION_ORDER];
  }

  const hasInterest = order.includes(COMPONENT_TYPES.INTEREST);
  const hasPrincipal = order.includes(COMPONENT_TYPES.PRINCIPAL);

  if (!hasInterest || !hasPrincipal) {
    return [...DEFAULT_ALLOCATION_ORDER];
  }

  return order[0] === COMPONENT_TYPES.PRINCIPAL
    ? [COMPONENT_TYPES.PRINCIPAL, COMPONENT_TYPES.INTEREST]
    : [COMPONENT_TYPES.INTEREST, COMPONENT_TYPES.PRINCIPAL];
}

/**
 * Retrieves the current Payment Allocation Settings from storage.
 * Safely defaults to Interest -> Principal if no settings are saved.
 */
export function getPaymentAllocationSettings() {
  try {
    const raw = localStorage.getItem(PAYMENT_ALLOCATION_STORAGE_KEY);
    if (!raw) {
      return {
        allocationOrder: [...DEFAULT_ALLOCATION_ORDER],
        updatedAt: null,
      };
    }

    const parsed = JSON.parse(raw);
    const allocationOrder = normalizeAllocationOrder(parsed?.allocationOrder);

    return {
      allocationOrder,
      updatedAt: parsed?.updatedAt || null,
    };
  } catch (err) {
    console.error('Failed to load payment allocation settings, using defaults:', err);
    return {
      allocationOrder: [...DEFAULT_ALLOCATION_ORDER],
      updatedAt: null,
    };
  }
}

/**
 * Saves the payment allocation settings to storage and emits change events.
 * @param {Object} settings - { allocationOrder: string[] }
 * @returns {Object} Clean saved settings
 */
export function savePaymentAllocationSettings(settings) {
  try {
    const cleanOrder = normalizeAllocationOrder(settings?.allocationOrder);
    const cleanSettings = {
      allocationOrder: cleanOrder,
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem(PAYMENT_ALLOCATION_STORAGE_KEY, JSON.stringify(cleanSettings));

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(PAYMENT_ALLOCATION_UPDATE_EVENT, { detail: cleanSettings })
      );
      window.dispatchEvent(new Event('storage'));
    }

    return cleanSettings;
  } catch (err) {
    console.error('Failed to save payment allocation settings:', err);
    return getPaymentAllocationSettings();
  }
}

/**
 * Resets the payment allocation settings to default (Interest -> Principal).
 */
export function resetPaymentAllocationSettings() {
  return savePaymentAllocationSettings(DEFAULT_ALLOCATION_SETTINGS);
}

/**
 * Core Payment Allocation Engine
 * 
 * Allocates a payment amount to an installment's outstanding interest and principal
 * according to the specified (or persisted) priority order.
 * 
 * Rules:
 * 1. Supports partial and full payments.
 * 2. Never allocates more than the outstanding balance of a component.
 * 3. Never allocates more than the amount available to allocate.
 * 4. Skips components that have no outstanding balance.
 * 5. Handles calculations accurately to two decimal places.
 * 6. Preserves separate tracking for interest and principal.
 * 
 * @param {number} availableAmount - The payment amount available to allocate to this installment
 * @param {number} interestDue - Outstanding interest balance on the installment
 * @param {number} principalDue - Outstanding principal balance on the installment
 * @param {string[]|null} customOrder - Optional explicit order ['Interest', 'Principal'] or ['Principal', 'Interest']
 * @returns {Object} { interestPaid, principalPaid, allocated, remainingPayment }
 */
export function allocateInstallmentPayment(
  availableAmount,
  interestDue,
  principalDue,
  customOrder = null
) {
  const amountToAllocate = Math.max(0, Number(availableAmount) || 0);
  const intDue = Math.max(0, Math.round(((Number(interestDue) || 0) + Number.EPSILON) * 100) / 100);
  const prinDue = Math.max(0, Math.round(((Number(principalDue) || 0) + Number.EPSILON) * 100) / 100);

  if (amountToAllocate <= 0 || (intDue <= 0 && prinDue <= 0)) {
    return {
      interestPaid: 0,
      principalPaid: 0,
      allocated: 0,
      remainingPayment: amountToAllocate,
    };
  }

  const order = customOrder
    ? normalizeAllocationOrder(customOrder)
    : getPaymentAllocationSettings().allocationOrder;

  let remaining = amountToAllocate;
  let interestPaid = 0;
  let principalPaid = 0;

  for (const component of order) {
    if (remaining <= 0.0001) break;

    if (component === COMPONENT_TYPES.INTEREST) {
      if (intDue > 0) {
        const intAlloc = Math.min(intDue, remaining);
        interestPaid = Math.round((intAlloc + Number.EPSILON) * 100) / 100;
        remaining = Math.max(0, Math.round((remaining - interestPaid + Number.EPSILON) * 100) / 100);
      }
    } else if (component === COMPONENT_TYPES.PRINCIPAL) {
      if (prinDue > 0) {
        const prinAlloc = Math.min(prinDue, remaining);
        principalPaid = Math.round((prinAlloc + Number.EPSILON) * 100) / 100;
        remaining = Math.max(0, Math.round((remaining - principalPaid + Number.EPSILON) * 100) / 100);
      }
    }
  }

  const allocated = Math.round((interestPaid + principalPaid + Number.EPSILON) * 100) / 100;

  return {
    interestPaid,
    principalPaid,
    allocated,
    remainingPayment: remaining,
  };
}
