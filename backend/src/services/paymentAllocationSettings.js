// src/services/paymentAllocationSettings.js
//
// Settings -> Payment Allocation: within each instalment a payment goes to
// interest first, then principal (the default), or principal first. Penalty
// is always separate. Stored per lender in app_settings; the repayment
// engine applies it when a payment is posted. Payments already posted keep
// the split they were posted with.

import { query } from "../db/connection.js";
import { currentTenantId } from "../db/tenantContext.js";
import { DEFAULT_ALLOCATION_ORDER, normalizeAllocationOrder } from "./repaymentEngine.js";

const KEY = "payment_allocation";

export const getPaymentAllocationSettings = async (db = { query }) => {
  const result = await db.query("SELECT value FROM app_settings WHERE tenant_id = $1 AND key = $2", [
    currentTenantId(),
    KEY,
  ]);
  const value = result.rows[0]?.value || {};
  return {
    allocationOrder: normalizeAllocationOrder(value.allocationOrder || DEFAULT_ALLOCATION_ORDER),
    updatedAt: value.updatedAt || null,
    updatedBy: value.updatedBy || null,
  };
};

export const savePaymentAllocationSettings = async (raw = {}, updatedBy = "") => {
  const value = {
    allocationOrder: normalizeAllocationOrder(raw.allocationOrder),
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy || null,
  };
  await query(
    `INSERT INTO app_settings (tenant_id, key, value) VALUES ($1, $2, $3)
     ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value`,
    [currentTenantId(), KEY, JSON.stringify(value)]
  );
  return getPaymentAllocationSettings();
};
