// src/services/reloanRepository.js
//
// Re-loan configuration and the eligibility audit trail. The eligibility
// decision itself is computed in the frontend from loan/customer data it
// already holds; what lives here is the rule set it decides against and a
// write-once record of each check.

import { query, withTransaction } from "../db/connection.js";

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
  const result = await query("SELECT rules FROM reloan_rules WHERE pk = 1");

  return { ...DEFAULT_RELOAN_RULES, ...(result.rows[0]?.rules ?? {}) };
};

export const saveReLoanRules = async (rules = {}) => {
  const merged = { ...(await getReLoanRules()), ...rules };

  await query(
    `INSERT INTO reloan_rules (pk, rules, updated_at)
     VALUES (1, $1, now())
     ON CONFLICT (pk) DO UPDATE SET rules = EXCLUDED.rules, updated_at = now()`,
    [JSON.stringify(merged)]
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
        `${SELECT_CHECKS} WHERE loans.id = $1 ORDER BY reloan_eligibility_checks.pk DESC`,
        [loanId]
      )
    : await query(`${SELECT_CHECKS} ORDER BY reloan_eligibility_checks.pk DESC`);

  return result.rows.map(mapCheck);
};

export const saveEligibilityCheck = async (result = {}) => {
  const checkId = await withTransaction(async (client) => {
    const [customerResult, loanResult] = await Promise.all([
      result.customerId
        ? client.query("SELECT pk FROM customers WHERE id = $1", [result.customerId])
        : Promise.resolve({ rows: [] }),
      result.loanId
        ? client.query("SELECT pk FROM loans WHERE id = $1", [result.loanId])
        : Promise.resolve({ rows: [] }),
    ]);

    const insert = await client.query(
      `INSERT INTO reloan_eligibility_checks
        (id, customer_pk, loan_pk, eligible, status, result, checked_at)
       VALUES ('', $1, $2, $3, $4, $5, COALESCE($6::timestamptz, now()))
       RETURNING pk`,
      [
        customerResult.rows[0]?.pk ?? null,
        loanResult.rows[0]?.pk ?? null,
        Boolean(result.eligible),
        result.status || "NOT_ELIGIBLE",
        JSON.stringify(result),
        result.checkedAt || null,
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
