// src/services/investorRepository.js
//
// Investors and their transactions. Transactions are the ledger of record:
// every invested / allocated / available figure is summed from them rather
// than stored, so the numbers cannot drift out of sync.

import { query, withTransaction } from "../db/connection.js";

const roundMoney = (value) => {
  const number = Number(value);

  return Number.isFinite(number) ? Math.round((number + Number.EPSILON) * 100) / 100 : 0;
};

const pad = (number, length = 4) => String(number).padStart(length, "0");

const iso = (value) => (value ? new Date(value).toISOString() : "");

class InvestorError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "InvestorError";
    this.statusCode = statusCode;
  }
}

/* =========================================================
   MAPPING
========================================================= */

const mapTransaction = (row) => ({
  id: row.id,
  investorId: row.investor_id || "",
  type: row.type,
  amount: row.amount,
  date: row.date || "",
  reference: row.reference || "",
  investmentMode: row.investment_mode || "",
  kind: row.kind || "",
  paymentMode: row.payment_mode || "",
  reason: row.reason || "",
  locked: Boolean(row.locked),
  notes: row.notes || "",
  loanId: row.loan_id || "",
  loanNumber: row.loan_number || "",
  createdAt: iso(row.created_at),
});

const SELECT_TRANSACTIONS = `
  SELECT
    investor_transactions.*,
    investors.id AS investor_id,
    loans.id AS loan_id
  FROM investor_transactions
  LEFT JOIN investors ON investors.pk = investor_transactions.investor_pk
  LEFT JOIN loans ON loans.pk = investor_transactions.loan_pk
`;

/*
 * One query that returns every investor with their totals already summed,
 * rather than a round trip per investor.
 */
const SELECT_INVESTORS_WITH_TOTALS = `
  SELECT
    investors.*,
    COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'Investment'), 0) AS total_invested,
    COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'Loan Allocation'), 0) AS total_allocated,
    COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'Withdrawal'), 0) AS total_withdrawn
  FROM investors
  LEFT JOIN investor_transactions t ON t.investor_pk = investors.pk
`;

const mapInvestor = (row) => {
  const totalInvested = roundMoney(row.total_invested);
  const allocatedAmount = roundMoney(row.total_allocated);
  const withdrawnAmount = roundMoney(row.total_withdrawn);
  const remainingCapital = roundMoney(Math.max(0, totalInvested - withdrawnAmount));

  return {
    id: row.id,
    name: row.name,
    mobileNumber: row.mobile_number || "",
    email: row.email || "",
    address: row.address || "",
    city: row.city || "",
    state: row.state || "",
    pincode: row.pincode || "",
    investorType: row.investor_type,
    pan: row.pan || "",
    bankDetails: row.bank_details ?? {},
    investment: {
      ...(row.investment ?? {}),
      totalInvested,
      allocatedAmount,
      withdrawnAmount,
      remainingCapital,
      availableBalance: remainingCapital,
    },
    status: row.status,
    remarks: row.remarks || "",
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
};

/* =========================================================
   READS
========================================================= */

export const getInvestors = async () => {
  const result = await query(
    `${SELECT_INVESTORS_WITH_TOTALS} GROUP BY investors.pk ORDER BY investors.pk ASC`
  );

  return result.rows.map(mapInvestor);
};

export const getInvestorById = async (investorId) => {
  const result = await query(
    `${SELECT_INVESTORS_WITH_TOTALS} WHERE investors.id = $1 GROUP BY investors.pk`,
    [investorId]
  );

  return result.rows[0] ? mapInvestor(result.rows[0]) : null;
};

export const getInvestorTransactions = async (investorId) => {
  if (!investorId) {
    const result = await query(`${SELECT_TRANSACTIONS} ORDER BY investor_transactions.pk ASC`);

    return result.rows.map(mapTransaction);
  }

  const result = await query(
    `${SELECT_TRANSACTIONS} WHERE investors.id = $1 ORDER BY investor_transactions.pk ASC`,
    [investorId]
  );

  return result.rows.map(mapTransaction);
};

/*
 * Pool-wide funding position: what onboarding checks before disbursing.
 */
export const getFundingSummary = async (client) => {
  const run = client ? client.query.bind(client) : query;

  const result = await run(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE type = 'Investment'), 0) AS invested,
       COALESCE(SUM(amount) FILTER (WHERE type = 'Loan Allocation'), 0) AS allocated,
       COALESCE(SUM(amount) FILTER (WHERE type = 'Withdrawal'), 0) AS withdrawn,
       (SELECT COUNT(*)::int FROM investors) AS investor_count
     FROM investor_transactions`
  );

  const row = result.rows[0];
  const totalInvestment = roundMoney(row.invested);
  const distributedToLoans = roundMoney(row.allocated);
  const withdrawn = roundMoney(row.withdrawn);

  const freeze = await run("SELECT value FROM app_settings WHERE key = 'opening_freeze'");

  return {
    totalInvestors: row.investor_count,
    totalInvestment,
    withdrawn,
    distributedToLoans,
    availableInvestmentBalance: roundMoney(
      Math.max(0, totalInvestment - withdrawn - distributedToLoans)
    ),
    openingFreeze: freeze.rows[0]?.value ?? { frozen: false, date: null },
  };
};

/* =========================================================
   VALIDATION
========================================================= */

const validateInvestor = (input) => {
  const name = String(input?.name || "").trim();
  const amount = Number(input?.investment?.initialAmount);

  if (!name) {
    throw new InvestorError("Investor name is required.");
  }

  if (!String(input?.mobileNumber || "").trim()) {
    throw new InvestorError("Investor mobile number is required.");
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new InvestorError("Initial investment amount must be greater than zero.");
  }

  if (!input?.investment?.investmentDate) {
    throw new InvestorError("Investment date is required.");
  }

  if (input?.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(String(input.pan).trim())) {
    throw new InvestorError("Enter a valid PAN.");
  }

  if (
    input?.bankDetails?.ifsc &&
    !/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(String(input.bankDetails.ifsc).trim())
  ) {
    throw new InvestorError("Enter a valid IFSC code.");
  }

  if (
    input?.bankDetails?.accountNumber &&
    !/^\d{6,20}$/.test(String(input.bankDetails.accountNumber).trim())
  ) {
    throw new InvestorError("Enter a valid bank account number.");
  }
};

const insertTransaction = async (
  client,
  {
    investorPk = null,
    type,
    amount,
    date,
    reference = "",
    investmentMode = "",
    notes = "",
    loanPk = null,
    loanNumber = "",
    kind = "",
    paymentMode = "",
    reason = "",
  }
) => {
  const result = await client.query(
    `INSERT INTO investor_transactions
      (id, investor_pk, type, amount, date, reference, investment_mode, notes, loan_pk, loan_number,
       kind, payment_mode, reason)
     VALUES ('', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING pk`,
    [
      investorPk,
      type,
      roundMoney(amount),
      date || new Date().toISOString(),
      reference,
      investmentMode,
      notes,
      loanPk,
      loanNumber,
      kind,
      paymentMode,
      reason,
    ]
  );

  const pk = result.rows[0].pk;
  const id = `ITX-${pad(pk)}`;

  await client.query("UPDATE investor_transactions SET id = $1 WHERE pk = $2", [id, pk]);

  return id;
};

/* =========================================================
   WRITES
========================================================= */

export const createInvestor = async (input = {}) => {
  validateInvestor(input);

  const amount = roundMoney(input.investment.initialAmount);

  const investorId = await withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO investors
        (id, name, mobile_number, email, address, city, state, pincode, investor_type,
         pan, bank_details, investment, status, remarks)
       VALUES ('', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'Active', $12)
       RETURNING pk`,
      [
        String(input.name).trim(),
        String(input.mobileNumber || "").trim(),
        String(input.email || "").trim(),
        String(input.address || "").trim(),
        String(input.city || "").trim(),
        String(input.state || "").trim(),
        String(input.pincode || "").trim(),
        input.investorType || "Individual",
        String(input.pan || "").trim().toUpperCase(),
        JSON.stringify({
          accountName: String(input.bankDetails?.accountName || "").trim(),
          accountNumber: String(input.bankDetails?.accountNumber || "").trim(),
          ifsc: String(input.bankDetails?.ifsc || "").trim().toUpperCase(),
        }),
        JSON.stringify({
          initialAmount: amount,
          investmentDate: input.investment.investmentDate,
          referenceNumber: String(input.investment.referenceNumber || "").trim(),
          investmentMode: input.investment.investmentMode || "Bank Transfer",
        }),
        String(input.remarks || "").trim(),
      ]
    );

    const investorPk = result.rows[0].pk;
    const id = `INV-${pad(investorPk)}`;

    await client.query("UPDATE investors SET id = $1 WHERE pk = $2", [id, investorPk]);

    await insertTransaction(client, {
      investorPk,
      type: "Investment",
      amount,
      date: input.investment.investmentDate,
      reference: String(input.investment.referenceNumber || "").trim(),
      investmentMode: input.investment.investmentMode || "Bank Transfer",
      notes: String(input.remarks || "").trim() || "Initial investment",
    });

    return id;
  });

  return getInvestorById(investorId);
};

export const addInvestorInvestment = async ({
  investorId,
  amount,
  date,
  reference = "",
  investmentMode = "Bank Transfer",
  notes = "Additional investment",
  kind = "Re-Investment",
} = {}) => {
  const value = Number(amount);

  const investorResult = await query("SELECT pk FROM investors WHERE id = $1", [investorId]);
  const investorRow = investorResult.rows[0];

  if (!investorRow) {
    throw new InvestorError("Investor not found.", 404);
  }

  if (!Number.isFinite(value) || value <= 0) {
    throw new InvestorError("Investment amount must be greater than zero.");
  }

  if (!date) {
    throw new InvestorError("Investment date is required.");
  }

  const transactionId = await withTransaction((client) =>
    insertTransaction(client, {
      investorPk: investorRow.pk,
      type: "Investment",
      amount: value,
      date,
      reference,
      investmentMode,
      notes,
      kind,
    })
  );

  const transactions = await getInvestorTransactions(investorId);

  return {
    transaction: transactions.find((item) => item.id === transactionId),
    investor: await getInvestorById(investorId),
  };
};

/*
 * Lenient investor creation used by the Investors screen: an "Opening"
 * investor carries the balance brought forward, a "New Investor" a fresh
 * investment. Only the name, amount and date are mandatory.
 */
export const createInvestorEntry = async (input = {}) => {
  const origin = input.origin === "Opening" ? "Opening" : "New Investor";
  const name = String(input.name || "").trim();
  const amount = Number(input.amount);

  if (!name) {
    throw new InvestorError("Investor name is required.");
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new InvestorError("Amount must be greater than zero.");
  }

  if (!input.date) {
    throw new InvestorError("Date is required.");
  }

  if (input.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(String(input.pan).trim())) {
    throw new InvestorError("Enter a valid PAN.");
  }

  const investorId = await withTransaction(async (client) => {
    if (origin === "Opening") {
      const frozen = await client.query("SELECT value FROM app_settings WHERE key = 'opening_freeze'");

      if (frozen.rows[0]?.value?.frozen) {
        throw new InvestorError("Opening Balance Setup is frozen.", 409);
      }
    }

    const result = await client.query(
      `INSERT INTO investors
        (id, name, mobile_number, email, pan, bank_details, investment, status)
       VALUES ('', $1, $2, $3, $4, $5, $6, 'Active')
       RETURNING pk`,
      [
        name,
        String(input.mobileNumber || "").trim(),
        String(input.email || "").trim(),
        String(input.pan || "").trim().toUpperCase(),
        JSON.stringify({
          accountName: String(input.accountHolder || "").trim(),
          accountNumber: String(input.accountNumber || "").trim(),
        }),
        JSON.stringify({
          origin,
          aadhaar: String(input.aadhaar || "").trim(),
          initialAmount: roundMoney(amount),
          investmentDate: input.date,
        }),
      ]
    );

    const investorPk = result.rows[0].pk;
    const id = `INV-${pad(investorPk)}`;

    await client.query("UPDATE investors SET id = $1 WHERE pk = $2", [id, investorPk]);

    await insertTransaction(client, {
      investorPk,
      type: "Investment",
      amount,
      date: input.date,
      investmentMode: input.transferMode || "",
      kind: origin === "Opening" ? "Opening Balance" : "New Investment",
      notes: origin === "Opening" ? "Opening balance" : "Initial investment",
    });

    return id;
  });

  return getInvestorById(investorId);
};

/*
 * Pays capital back to an investor. Checked against both the investor's own
 * remaining capital and the pool's available balance, under the same lock
 * that serialises loan funding so the pool cannot be overdrawn.
 */
export const debitInvestor = async ({
  investorId,
  amount,
  date,
  paymentMode = "",
  reason = "",
  remarks = "",
} = {}) => {
  const value = Number(amount);

  if (!Number.isFinite(value) || value <= 0) {
    throw new InvestorError("Debit amount must be greater than zero.");
  }

  if (!date || !paymentMode || !String(reason).trim()) {
    throw new InvestorError("Date, payment mode and reason are required.");
  }

  const transactionId = await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('investment_pool'))");

    const result = await client.query(
      `${SELECT_INVESTORS_WITH_TOTALS} WHERE investors.id = $1 GROUP BY investors.pk`,
      [investorId]
    );

    if (!result.rows[0]) {
      throw new InvestorError("Investor not found.", 404);
    }

    const investor = mapInvestor(result.rows[0]);
    const fmt = (n) => n.toLocaleString("en-IN");

    if (value > investor.investment.remainingCapital) {
      throw new InvestorError(
        `Debit amount (₹${fmt(value)}) exceeds the investor's remaining capital (₹${fmt(
          investor.investment.remainingCapital
        )}).`
      );
    }

    const summary = await getFundingSummary(client);

    if (value > summary.availableInvestmentBalance) {
      throw new InvestorError(
        `Debit amount (₹${fmt(value)}) exceeds the total available pool (₹${fmt(
          summary.availableInvestmentBalance
        )}).`
      );
    }

    return insertTransaction(client, {
      investorPk: result.rows[0].pk,
      type: "Withdrawal",
      amount: value,
      date,
      paymentMode,
      reason: String(reason).trim(),
      notes: String(remarks || "").trim(),
      kind: "Debit",
    });
  });

  const transactions = await getInvestorTransactions(investorId);

  return {
    transaction: transactions.find((item) => item.id === transactionId),
    investor: await getInvestorById(investorId),
    summary: await getFundingSummary(),
  };
};

/* Locks every opening balance; no more opening investors can be added. */
export const freezeOpeningBalances = async () => {
  const freeze = { frozen: true, date: new Date().toISOString().slice(0, 10) };

  await withTransaction(async (client) => {
    await client.query("UPDATE investor_transactions SET locked = true WHERE kind = 'Opening Balance'");
    await client.query(
      `INSERT INTO app_settings (key, value) VALUES ('opening_freeze', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(freeze)]
    );
  });

  return getFundingSummary();
};

/*
 * Funds a loan from the pool.
 *
 * The balance check and the insert run in one transaction under an
 * advisory lock. Without it, two loans disbursed at the same instant could
 * each see enough balance and together overdraw the pool. The unique index
 * still backstops the one-allocation-per-loan rule.
 */
/*
 * Draws a loan's principal from the pool inside the caller's transaction, so
 * creating a loan and funding it either both happen or neither does.
 */
export const fundLoanInTransaction = async (
  client,
  { amount, loanPk = null, loanId = "", loanNumber = "", date, notes = "Loan disbursement" } = {}
) => {
  const value = Number(amount);

  if (!Number.isFinite(value) || value <= 0) {
    throw new InvestorError("Loan amount must be greater than zero.");
  }

  if (!loanPk && !loanId && !loanNumber) {
    throw new InvestorError("Loan identity is required for funding allocation.");
  }

  // Serialises every pool allocation for the length of this transaction.
  await client.query("SELECT pg_advisory_xact_lock(hashtext('investment_pool'))");

  const loanResult = await client.query(
    "SELECT * FROM loans WHERE pk = $1 OR id = $2 OR loan_number = $3",
    [loanPk ?? -1, loanId || "", loanNumber || ""]
  );

  const loanRow = loanResult.rows[0];

  if (!loanRow) {
    throw new InvestorError("Loan not found.", 404);
  }

  const existing = await client.query(
    "SELECT COUNT(*)::int AS count FROM investor_transactions WHERE type = 'Loan Allocation' AND loan_pk = $1",
    [loanRow.pk]
  );

  if (existing.rows[0].count > 0) {
    throw new InvestorError("This loan already has an investor funding allocation.", 409);
  }

  const summary = await getFundingSummary(client);

  if (summary.availableInvestmentBalance < value) {
    throw new InvestorError(
      `Insufficient available balance for this loan. Available funding: ₹${summary.availableInvestmentBalance.toLocaleString(
        "en-IN"
      )}.`
    );
  }

  return insertTransaction(client, {
    type: "Loan Allocation",
    amount: value,
    date,
    notes,
    loanPk: loanRow.pk,
    loanNumber: loanRow.loan_number,
  });
};

export const allocateInvestmentPoolToLoan = async ({
  amount,
  loanId,
  loanNumber,
  date,
  notes = "Loan disbursement",
} = {}) => {
  const transactionId = await withTransaction((client) =>
    fundLoanInTransaction(client, { amount, loanId, loanNumber, date, notes })
  );

  const transactions = await getInvestorTransactions();

  return {
    transaction: transactions.find((item) => item.id === transactionId),
    summary: await getFundingSummary(),
  };
};

export { InvestorError };
