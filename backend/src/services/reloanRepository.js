// src/services/reloanRepository.js
//
// Re-loan configuration and the eligibility audit trail. The eligibility
// decision itself is computed in the frontend from loan/customer data it
// already holds; what lives here is the rule set it decides against and a
// write-once record of each check.

import { query, withTransaction } from "../db/connection.js";
import { currentTenantId } from "../db/tenantContext.js";

const pad = (number, length = 4) => String(number).padStart(length, "0");

export const DEFAULT_RELOAN_RULES = {
  minimumPaidInstallmentPercentage: 75,
  maximumOverdueAmount: 5000,
  maximumOverdueDays: 30,
  allowActiveLoan: true,
  allowClosedLoan: true,
  allowForeclosedLoan: false,
  allowSeizedVehicle: false,
  allowSoldVehicle: false,
  requireCustomerVerification: true,
  requireDocuments: true,
};

export const getReLoanRules = async () => {
  const result = await query("SELECT rules FROM reloan_rules WHERE tenant_id = $1", [currentTenantId()]);

  return { ...DEFAULT_RELOAN_RULES, ...(result.rows[0]?.rules ?? {}) };
};

export const saveReLoanRules = async (rules = {}) => {
  const merged = { ...(await getReLoanRules()), ...rules };

  await query(
    `INSERT INTO reloan_rules (tenant_id, rules, updated_at)
     VALUES ($2, $1, now())
     ON CONFLICT (tenant_id) DO UPDATE SET rules = EXCLUDED.rules, updated_at = now()`,
    [JSON.stringify(merged), currentTenantId()]
  );

  return merged;
};

const mapCheck = (row) => ({
  ...(row.result ?? {}),
  id: row.id,
  customerId: row.customer_id || "",
  loanId: row.loan_id || "",
  eligible: Boolean(row.eligible),
  status: row.status,
  checkedAt: new Date(row.checked_at).toISOString(),
});

const SELECT_CHECKS = `
  SELECT
    reloan_eligibility_checks.*,
    customers.id AS customer_id,
    loans.id AS loan_id
  FROM reloan_eligibility_checks
  LEFT JOIN customers ON customers.pk = reloan_eligibility_checks.customer_pk
  LEFT JOIN loans ON loans.pk = reloan_eligibility_checks.loan_pk
`;

export const getEligibilityChecks = async (loanId) => {
  const result = loanId
    ? await query(
        `${SELECT_CHECKS} WHERE loans.id = $1 AND reloan_eligibility_checks.tenant_id = $2 ORDER BY reloan_eligibility_checks.pk DESC`,
        [loanId, currentTenantId()]
      )
    : await query(
        `${SELECT_CHECKS} WHERE reloan_eligibility_checks.tenant_id = $1 ORDER BY reloan_eligibility_checks.pk DESC`,
        [currentTenantId()]
      );

  return result.rows.map(mapCheck);
};

export const saveEligibilityCheck = async (result = {}) => {
  const checkId = await withTransaction(async (client) => {
    const [customerResult, loanResult] = await Promise.all([
      result.customerId
        ? client.query("SELECT pk FROM customers WHERE id = $1 AND tenant_id = $2", [result.customerId, currentTenantId()])
        : Promise.resolve({ rows: [] }),
      result.loanId
        ? client.query("SELECT pk FROM loans WHERE id = $1 AND tenant_id = $2", [result.loanId, currentTenantId()])
        : Promise.resolve({ rows: [] }),
    ]);

    const insert = await client.query(
      `INSERT INTO reloan_eligibility_checks
        (id, customer_pk, loan_pk, eligible, status, result, checked_at, tenant_id)
       VALUES ('', $1, $2, $3, $4, $5, COALESCE($6::timestamptz, now()), $7)
       RETURNING pk`,
      [
        customerResult.rows[0]?.pk ?? null,
        loanResult.rows[0]?.pk ?? null,
        Boolean(result.eligible),
        result.status || "NOT_ELIGIBLE",
        JSON.stringify(result),
        result.checkedAt || null,
        currentTenantId(),
      ]
    );

    const pk = insert.rows[0].pk;
    const id = `RLC-${pad(pk)}`;

    await client.query("UPDATE reloan_eligibility_checks SET id = $1 WHERE pk = $2", [id, pk]);

    return id;
  });

  const checks = await getEligibilityChecks();

  return checks.find((check) => check.id === checkId) || null;
};
