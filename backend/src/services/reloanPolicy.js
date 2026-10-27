// src/services/reloanPolicy.js
//
// Settings -> Re-Loan: whether an existing customer can take a new loan
// while they still owe on an earlier one.
//   zero_outstanding       - Outstanding Must Be Zero (default): only an admin
//                            can approve a re-loan for a customer who owes;
//   allow_with_outstanding - anyone who can add loans may proceed.
// The Re-Loan assessment screen shows the policy; the server applies it
// when the loan is created. A customer is matched across their records by
// mobile number (a re-loan on a different vehicle is a separate customer
// record).

import { query } from "../db/connection.js";
import { currentTenantId } from "../db/tenantContext.js";

export const RELOAN_POLICY = {
  ZERO_OUTSTANDING: "zero_outstanding",
  ALLOW_WITH_OUTSTANDING: "allow_with_outstanding",
};

const KEY = "reloan_policy";

const cleanPolicy = (policy) =>
  policy === RELOAN_POLICY.ALLOW_WITH_OUTSTANDING ? RELOAN_POLICY.ALLOW_WITH_OUTSTANDING : RELOAN_POLICY.ZERO_OUTSTANDING;

export const getReLoanPolicy = async () => {
  const result = await query("SELECT value FROM app_settings WHERE tenant_id = $1 AND key = $2", [currentTenantId(), KEY]);
  const value = result.rows[0]?.value || {};
  return { policy: cleanPolicy(value.policy), updatedAt: value.updatedAt || null, updatedBy: value.updatedBy || null };
};

export const saveReLoanPolicy = async (raw = {}, updatedBy = "") => {
  const value = { policy: cleanPolicy(raw.policy), updatedAt: new Date().toISOString(), updatedBy: updatedBy || null };
  await query(
    `INSERT INTO app_settings (tenant_id, key, value) VALUES ($1, $2, $3)
     ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value`,
    [currentTenantId(), KEY, JSON.stringify(value)]
  );
  return getReLoanPolicy();
};

// What the customer (all their records, by mobile number) still owes on
// open loans.
const customerOutstanding = async (customerId) => {
  const result = await query(
    `WITH target AS (
       SELECT personal->>'mobileNumber' AS mobile, pk FROM customers WHERE id = $1 AND tenant_id = $2
     )
     SELECT COALESCE(SUM(GREATEST(
              i.principal + i.interest - i.paid_principal - i.paid_interest - COALESCE(i.waived_interest, 0), 0)), 0) AS owed
       FROM customers c
       JOIN target t ON (c.pk = t.pk OR (COALESCE(t.mobile, '') <> '' AND c.personal->>'mobileNumber' = t.mobile))
       JOIN loans l ON l.customer_pk = c.pk
       JOIN installments i ON i.loan_pk = l.pk
      WHERE c.tenant_id = $2
        AND l.status NOT IN ('Closed', 'Foreclosed', 'Midway Closed')
        AND NOT COALESCE(i.midway_closed, false)`,
    [customerId, currentTenantId()]
  );
  return Math.round(Number(result.rows[0]?.owed || 0) * 100) / 100;
};

// Refuses a re-loan for a customer who still owes when the policy is
// Outstanding Must Be Zero, unless an admin is making it.
export const assertReLoanAllowed = async (customerId, user) => {
  if (!customerId || user?.role === "admin") return;
  const { policy } = await getReLoanPolicy();
  if (policy !== RELOAN_POLICY.ZERO_OUTSTANDING) return;
  const owed = await customerOutstanding(customerId);
  if (owed > 0.01) {
    throw Object.assign(
      new Error(
        `This customer still owes ₹${Math.round(owed).toLocaleString("en-IN")}. Under the "Outstanding Must Be Zero" re-loan policy only an admin can approve a new loan.`
      ),
      { statusCode: 403 }
    );
  }
};
