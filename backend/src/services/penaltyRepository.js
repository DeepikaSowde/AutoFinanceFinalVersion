// src/services/penaltyRepository.js
//
// Late-payment penalties, on the company-wide rules from Settings -> Penalty &
// Grace (one rule per repayment frequency: grace days, then either a fixed
// amount once per overdue instalment or a daily rate per day past the grace
// period).
//
// A Pending penalty is worked out live from those rules and the instalment's
// state, so it follows payments and settings changes without being rewritten.
// A row in penalty_records exists only once someone acts on the penalty:
//   Frozen    - amount locked, not collectable until unfrozen;
//   Cancelled - never charged, never recreated;
//   Collected - settled by a penalty-only payment (penalty_transactions),
//               which books one "Penalty" income row and never touches
//               principal or interest;
//   Pending   - unfrozen again; the amount is live once more.
// Every query is tenant-scoped; actions lock the loan row.

import { randomUUID } from "node:crypto";

import { query, withTransaction } from "../db/connection.js";
import { currentTenantId } from "../db/tenantContext.js";
import { insertIncome } from "./incomeRepository.js";

const roundMoney = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round((number + Number.EPSILON) * 100) / 100 : 0;
};
const iso = (value) => (value ? new Date(value).toISOString() : null);
const httpError = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

export const PENALTY_INCOME_CATEGORY = "Penalty";
export const PENALTY_TYPES = ["Fixed Penalty", "Daily Increasing"];
const FREQUENCIES = ["Daily", "Weekly", "Monthly"];

export const DEFAULT_PENALTY_SETTINGS = {
  Daily: { enabled: false, gracePeriodDays: 0, penaltyType: "Fixed Penalty", fixedAmount: 0, dailyRate: 0 },
  Weekly: { enabled: false, gracePeriodDays: 0, penaltyType: "Fixed Penalty", fixedAmount: 0, dailyRate: 0 },
  Monthly: { enabled: true, gracePeriodDays: 0, penaltyType: "Fixed Penalty", fixedAmount: 0, dailyRate: 0 },
};

/* ---------- rules ---------- */

export const normalizeFrequency = (frequency) => {
  const s = String(frequency || "").trim().toLowerCase();
  if (s.includes("day") || s.includes("daily")) return "Daily";
  if (s.includes("week")) return "Weekly";
  return "Monthly";
};

const cleanRule = (raw = {}, fallback) => {
  const grace = Number.parseInt(raw.gracePeriodDays, 10);
  return {
    enabled: raw.enabled === undefined ? fallback.enabled : Boolean(raw.enabled),
    gracePeriodDays: Number.isFinite(grace) && grace > 0 ? grace : 0,
    penaltyType: PENALTY_TYPES.includes(raw.penaltyType) ? raw.penaltyType : "Fixed Penalty",
    fixedAmount: Math.max(0, roundMoney(raw.fixedAmount)),
    dailyRate: Math.max(0, roundMoney(raw.dailyRate)),
  };
};

const normaliseSettings = (raw = {}) =>
  Object.fromEntries(FREQUENCIES.map((f) => [f, cleanRule(raw?.[f], DEFAULT_PENALTY_SETTINGS[f])]));

// Rejects (rather than quietly fixing) a rule an admin typed wrongly.
const validateSettings = (raw = {}) => {
  for (const f of FREQUENCIES) {
    const rule = raw?.[f];
    if (!rule) continue;
    const grace = Number(rule.gracePeriodDays ?? 0);
    if (!Number.isInteger(grace) || grace < 0 || grace > 365) {
      throw httpError(`${f}: grace period must be a whole number of days between 0 and 365.`);
    }
    if (rule.penaltyType !== undefined && !PENALTY_TYPES.includes(rule.penaltyType)) {
      throw httpError(`${f}: penalty type must be "Fixed Penalty" or "Daily Increasing".`);
    }
    for (const key of ["fixedAmount", "dailyRate"]) {
      const value = Number(rule[key] ?? 0);
      if (!Number.isFinite(value) || value < 0) throw httpError(`${f}: ${key} must be 0 or more.`);
    }
  }
};

// Penalties count calendar days in the lender's time zone (the app is used in
// India), not the server's, so "today" matches what staff see.
const BUSINESS_TIME_ZONE = process.env.BUSINESS_TIMEZONE || "Asia/Kolkata";

export const businessToday = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

const dayNumber = (value) => {
  const text = String(value || "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (m) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;
};

const isUnpaid = (inst) =>
  roundMoney(Number(inst.principal) + Number(inst.interest) - Number(inst.paid_principal) - Number(inst.paid_interest) - Number(inst.waived_interest || 0)) > 0.009 &&
  !inst.midway_closed &&
  String(inst.status || "") !== "Paid";

// The penalty an instalment attracts today under `settings`, or null.
const evaluate = (inst, frequency, settings, today) => {
  const rule = settings[frequency];
  if (!rule?.enabled || !isUnpaid(inst)) return null;
  const due = dayNumber(inst.due_date);
  const now = dayNumber(today);
  if (due === null || now === null) return null;
  const daysPastDue = now - due;
  if (daysPastDue <= rule.gracePeriodDays) return null;
  const eligibleDays = daysPastDue - rule.gracePeriodDays;
  const daily = rule.penaltyType === "Daily Increasing";
  const amount = daily ? Math.round(rule.dailyRate * eligibleDays) : rule.fixedAmount;
  if (!(amount > 0)) return null;
  return {
    gracePeriod: rule.gracePeriodDays,
    penaltyType: rule.penaltyType,
    configuredAmount: daily ? rule.dailyRate : rule.fixedAmount,
    eligibleDays,
    amount: roundMoney(amount),
  };
};

/* ---------- shapes the pages read ---------- */

const recordShape = (loan, inst, fields) => ({
  id: `PEN-${loan.loan_id}-${fields.installmentNumber}`,
  loanId: loan.loan_id,
  customerId: loan.customer_id,
  customerName: loan.customer_name || "Customer",
  repaymentFrequency: loan.frequency,
  dueDate: inst?.due_date || fields.dueDate || "",
  actualAmountCollected: 0,
  collectionDate: null,
  transactionRef: null,
  cancellationDate: null,
  cancellationReason: null,
  auditTrail: [],
  ...fields,
});

const fromRow = (loan, inst, row) =>
  recordShape(loan, inst, {
    installmentNumber: row.installment_number,
    dueDate: row.due_date || inst?.due_date || "",
    status: row.status,
    gracePeriod: row.grace_period,
    penaltyType: row.penalty_type,
    configuredAmount: Number(row.configured_amount),
    eligibleDays: row.eligible_days,
    calculatedAmount: Number(row.calculated_amount),
    actualAmountCollected: Number(row.actual_amount_collected),
    collectionDate: row.collection_date,
    transactionRef: row.transaction_ref || null,
    cancellationDate: iso(row.cancellation_date),
    cancellationReason: row.cancellation_reason,
    auditTrail: row.audit_trail || [],
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  });

// The penalty as it stands today: a stored Frozen / Cancelled / Collected row
// is final; otherwise (no row, or an unfrozen Pending row) the amount is live.
const resolve = (loan, inst, row, settings, today) => {
  if (row && row.status !== "Pending") return fromRow(loan, inst, row);
  const live = inst ? evaluate(inst, loan.frequency, settings, today) : null;
  if (!live) {
    // An unfrozen penalty that is no longer due (paid, or grace extended) shows as 0.
    return row ? { ...fromRow(loan, inst, row), calculatedAmount: 0, eligibleDays: 0 } : null;
  }
  const base = row
    ? fromRow(loan, inst, row)
    : recordShape(loan, inst, { installmentNumber: inst.installment_number, createdAt: null, updatedAt: null });
  return {
    ...base,
    installmentNumber: inst.installment_number,
    status: "Pending",
    gracePeriod: live.gracePeriod,
    penaltyType: live.penaltyType,
    configuredAmount: live.configuredAmount,
    eligibleDays: live.eligibleDays,
    calculatedAmount: live.amount,
  };
};

const mapTransaction = (row) => ({
  id: row.id,
  transactionRef: row.transaction_ref,
  loanId: row.loan_id,
  customerId: row.customer_id,
  customerName: row.customer_name || "Customer",
  date: row.collection_date,
  installmentNumbers: row.installment_numbers || [],
  installmentDisplay: (row.installment_numbers || []).join(", "),
  actualPenaltyAmount: Number(row.actual_penalty_amount),
  calculatedPenaltyAmount: Number(row.actual_penalty_amount),
  collectedAmount: Number(row.collected_amount),
  status: "Collected",
  paymentMode: row.payment_mode,
  incomeId: row.income_id,
  createdBy: row.created_by,
  createdAt: iso(row.created_at),
});

/* ---------- reads ---------- */

const LOAN_SELECT = `
  SELECT l.pk, l.id AS loan_id, l.repayment_frequency, l.status,
         c.id AS customer_id, c.personal->>'name' AS customer_name
    FROM loans l JOIN customers c ON c.pk = l.customer_pk
   WHERE l.tenant_id = $1`;

const withFrequency = (row) => ({ ...row, frequency: normalizeFrequency(row.repayment_frequency) });

const readSettings = async (db = { query }) => {
  const result = await db.query("SELECT settings, updated_at, updated_by FROM penalty_settings WHERE tenant_id = $1", [
    currentTenantId(),
  ]);
  const row = result.rows[0];
  return {
    ...normaliseSettings(row?.settings),
    updatedAt: iso(row?.updated_at),
    updatedBy: row?.updated_by || null,
  };
};

export const getPenaltySettings = () => readSettings();

// Loans with their instalments and stored penalty rows, keyed for resolve().
const loadLoans = async (db, { loanId = null, lock = false } = {}) => {
  const params = [currentTenantId()];
  let sql = LOAN_SELECT;
  if (loanId) {
    params.push(loanId);
    sql += " AND l.id = $2";
  }
  if (lock) sql += " FOR UPDATE OF l";
  const loans = (await db.query(sql, params)).rows.map(withFrequency);
  if (!loans.length) return [];
  const pks = loans.map((l) => l.pk);

  const [insts, rows] = await Promise.all([
    db.query("SELECT * FROM installments WHERE loan_pk = ANY($1) ORDER BY loan_pk, installment_number", [pks]),
    db.query(
      `SELECT r.*, t.transaction_ref FROM penalty_records r
         LEFT JOIN penalty_transactions t ON t.pk = r.transaction_pk
        WHERE r.loan_pk = ANY($1)`,
      [pks]
    ),
  ]);

  const byLoan = new Map(loans.map((l) => [l.pk, { loan: l, insts: new Map(), rows: new Map() }]));
  insts.rows.forEach((i) => byLoan.get(i.loan_pk)?.insts.set(i.installment_number, i));
  rows.rows.forEach((r) => byLoan.get(r.loan_pk)?.rows.set(r.installment_number, r));
  return [...byLoan.values()];
};

const resolveAll = (entries, settings, today) => {
  const records = [];
  for (const { loan, insts, rows } of entries) {
    // A foreclosed loan (its vehicle sold) owes no further penalties: pending
    // and frozen ones lapse; collected and cancelled ones stay on record.
    const foreclosed = loan.status === "Foreclosed";
    const numbers = new Set([...insts.keys(), ...rows.keys()]);
    for (const n of [...numbers].sort((a, b) => a - b)) {
      const rec = resolve(loan, insts.get(n), rows.get(n), settings, today);
      if (foreclosed && rec && !["Collected", "Cancelled"].includes(rec.status)) continue;
      if (rec && (rows.has(n) || rec.calculatedAmount > 0)) records.push(rec);
    }
  }
  return records;
};

const readTransactions = async (db, loanId = null) => {
  const params = [currentTenantId()];
  let sql = `
    SELECT t.*, l.id AS loan_id, c.id AS customer_id, c.personal->>'name' AS customer_name
      FROM penalty_transactions t
      JOIN loans l ON l.pk = t.loan_pk
      JOIN customers c ON c.pk = l.customer_pk
     WHERE t.tenant_id = $1`;
  if (loanId) {
    params.push(loanId);
    sql += " AND l.id = $2";
  }
  sql += " ORDER BY t.pk";
  return (await db.query(sql, params)).rows.map(mapTransaction);
};

// Everything the penalty screens need: the rules, every penalty that is due
// or has been acted on (optionally for one loan), and the penalty payments.
export const getPenalties = async ({ loanId = null } = {}) => {
  const today = businessToday();
  const [settings, entries, transactions] = await Promise.all([
    readSettings(),
    loadLoans({ query }, { loanId }),
    readTransactions({ query }, loanId),
  ]);
  return { settings, today, records: resolveAll(entries, settings, today), transactions };
};

// One loan's penalties as they stand on `asOf` (a YYYY-MM-DD business date):
// the pending total and how many instalments are pending / frozen /
// cancelled, with the rule for the loan's frequency. Used for the penalty
// part of a foreclosure cost. `beforeForeclosure` counts a loan that is
// already foreclosed as it stood before its vehicle was sold (rebuilding the
// cost of an earlier sale), since foreclosing drops its pending penalties.
export const pendingPenaltySummary = async (db, loanId, asOf = businessToday(), { beforeForeclosure = false } = {}) => {
  const [settings, loaded] = await Promise.all([readSettings(db), loadLoans(db, { loanId })]);
  const entries = beforeForeclosure
    ? loaded.map((entry) =>
        entry.loan.status === "Foreclosed" ? { ...entry, loan: { ...entry.loan, status: "Active" } } : entry
      )
    : loaded;
  const frequency = entries[0]?.loan.frequency || "Monthly";
  const records = resolveAll(entries, settings, asOf);
  const pending = records.filter((r) => r.status === "Pending" && r.calculatedAmount > 0);
  return {
    frequency,
    rule: settings[frequency],
    pendingAmount: roundMoney(pending.reduce((sum, r) => sum + r.calculatedAmount, 0)),
    pendingCount: pending.length,
    frozenCount: records.filter((r) => r.status === "Frozen").length,
    cancelledCount: records.filter((r) => r.status === "Cancelled").length,
  };
};

/* ---------- settings ---------- */

// Saves the rules. Pending penalties follow them at once (they are live);
// Frozen, Cancelled and Collected ones are untouched. Returns how many
// pending penalties changed amount.
export const savePenaltySettings = async (raw = {}, updatedBy = "") => {
  validateSettings(raw);
  const next = normaliseSettings(raw);
  const today = businessToday();

  return withTransaction(async (client) => {
    const before = await readSettings(client);
    const entries = await loadLoans(client);
    const amounts = (settings) =>
      new Map(resolveAll(entries, settings, today).filter((r) => r.status === "Pending").map((r) => [r.id, r.calculatedAmount]));
    const oldAmounts = amounts(before);
    const newAmounts = amounts(next);
    let changesCount = 0;
    for (const id of new Set([...oldAmounts.keys(), ...newAmounts.keys()])) {
      if ((oldAmounts.get(id) || 0) !== (newAmounts.get(id) || 0)) changesCount += 1;
    }

    await client.query(
      `INSERT INTO penalty_settings (tenant_id, settings, updated_by, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (tenant_id) DO UPDATE SET settings = EXCLUDED.settings, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [currentTenantId(), JSON.stringify(next), updatedBy || null]
    );

    return { settings: await readSettings(client), changesCount };
  });
};

/* ---------- actions ---------- */

const parseNumbers = (value) => {
  const list = (Array.isArray(value) ? value : [value]).map(Number);
  if (!list.length || list.some((n) => !Number.isInteger(n) || n < 1)) {
    throw httpError("installmentNumbers must be a list of instalment numbers.");
  }
  return [...new Set(list)].sort((a, b) => a - b);
};

const auditEntry = (action, amount, reason, by, extra = {}) => ({
  timestamp: new Date().toISOString(),
  action,
  amount: roundMoney(amount),
  reason,
  by: by || null,
  ...extra,
});

const upsertRecord = (client, loanPk, rec, row, changes) => {
  const merged = { ...rec, ...changes };
  return client.query(
    `INSERT INTO penalty_records
       (tenant_id, loan_pk, installment_number, status, due_date, repayment_frequency, grace_period, penalty_type,
        configured_amount, eligible_days, calculated_amount, actual_amount_collected, collection_date, transaction_pk,
        cancellation_date, cancellation_reason, audit_trail, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, now())
     ON CONFLICT (loan_pk, installment_number) DO UPDATE SET
       status = EXCLUDED.status, due_date = EXCLUDED.due_date, repayment_frequency = EXCLUDED.repayment_frequency,
       grace_period = EXCLUDED.grace_period, penalty_type = EXCLUDED.penalty_type,
       configured_amount = EXCLUDED.configured_amount, eligible_days = EXCLUDED.eligible_days,
       calculated_amount = EXCLUDED.calculated_amount, actual_amount_collected = EXCLUDED.actual_amount_collected,
       collection_date = EXCLUDED.collection_date, transaction_pk = EXCLUDED.transaction_pk,
       cancellation_date = EXCLUDED.cancellation_date, cancellation_reason = EXCLUDED.cancellation_reason,
       audit_trail = EXCLUDED.audit_trail, updated_at = now()`,
    [
      currentTenantId(),
      loanPk,
      merged.installmentNumber,
      merged.status,
      merged.dueDate || null,
      merged.repaymentFrequency || null,
      Number(merged.gracePeriod) || 0,
      merged.penaltyType || null,
      roundMoney(merged.configuredAmount),
      Number(merged.eligibleDays) || 0,
      roundMoney(merged.calculatedAmount),
      roundMoney(merged.actualAmountCollected),
      merged.collectionDate || null,
      merged.transactionPk ?? row?.transaction_pk ?? null,
      merged.cancellationDate || null,
      merged.cancellationReason || null,
      JSON.stringify([...(row?.audit_trail || []), ...(changes.audit ? [changes.audit] : [])]),
    ]
  );
};

// Locks the loan and resolves the named instalments' penalties as of today.
const withLoanPenalties = (loanId, numbers, work) =>
  withTransaction(async (client) => {
    const [entry] = await loadLoans(client, { loanId, lock: true });
    if (!entry) throw httpError("Loan not found.", 404);
    const settings = await readSettings(client);
    const today = businessToday();
    const targets = numbers.map((n) => ({
      n,
      row: entry.rows.get(n),
      rec: resolve(entry.loan, entry.insts.get(n), entry.rows.get(n), settings, today),
    }));
    const missing = targets.filter((t) => !t.rec).map((t) => t.n);
    if (missing.length) throw httpError(`No penalty is due on instalment ${missing.join(", ")}.`, 409);
    return work(client, entry, targets, today);
  });

const resultFor = async (loanId) => (await getPenalties({ loanId })).records;

export const freezePenalties = async (loanId, body = {}, by = "") => {
  const numbers = parseNumbers(body.installmentNumbers);
  await withLoanPenalties(loanId, numbers, async (client, entry, targets) => {
    for (const { rec, row } of targets) {
      if (rec.status === "Frozen") continue;
      if (rec.status !== "Pending" || !(rec.calculatedAmount > 0)) {
        throw httpError(`Instalment ${rec.installmentNumber}: a ${rec.status.toLowerCase()} penalty cannot be frozen.`, 409);
      }
      await upsertRecord(client, entry.loan.pk, rec, row, {
        status: "Frozen",
        audit: auditEntry("FROZEN", rec.calculatedAmount, "Penalty frozen", by),
      });
    }
  });
  return resultFor(loanId);
};

export const unfreezePenalties = async (loanId, body = {}, by = "") => {
  const numbers = parseNumbers(body.installmentNumbers);
  await withLoanPenalties(loanId, numbers, async (client, entry, targets) => {
    for (const { rec, row } of targets) {
      if (rec.status === "Pending") continue;
      if (rec.status !== "Frozen") {
        throw httpError(`Instalment ${rec.installmentNumber}: only a frozen penalty can be unfrozen.`, 409);
      }
      await upsertRecord(client, entry.loan.pk, rec, row, {
        status: "Pending",
        audit: auditEntry("UNFROZEN", rec.calculatedAmount, "Penalty unfrozen to Pending", by),
      });
    }
  });
  return resultFor(loanId);
};

export const cancelPenalties = async (loanId, body = {}, by = "") => {
  const numbers = parseNumbers(body.installmentNumbers);
  const reason = String(body.reason || "").trim().slice(0, 500) || "Cancelled by Administrator";
  await withLoanPenalties(loanId, numbers, async (client, entry, targets) => {
    for (const { rec, row } of targets) {
      if (rec.status === "Cancelled") continue;
      if (rec.status === "Collected") {
        throw httpError(`Instalment ${rec.installmentNumber}: a collected penalty cannot be cancelled.`, 409);
      }
      await upsertRecord(client, entry.loan.pk, rec, row, {
        status: "Cancelled",
        cancellationDate: new Date().toISOString(),
        cancellationReason: reason,
        audit: auditEntry("CANCELLED", rec.calculatedAmount, reason, by),
      });
    }
  });
  return resultFor(loanId);
};

const findTransaction = async (clientRef, transactionRef) => {
  const result = await query(
    `SELECT id FROM penalty_transactions
      WHERE tenant_id = $1 AND (($2::text IS NOT NULL AND client_ref = $2) OR transaction_ref = $3)`,
    [currentTenantId(), clientRef, transactionRef || ""]
  );
  return result.rows[0]?.id || null;
};

// One penalty-only payment covering the named instalments' pending
// penalties. The amount may differ from the total due (the collector can
// edit it); every covered penalty is marked Collected, and one Penalty income
// row is booked. A repeat with the same clientRef / transaction reference
// returns the first payment instead of charging twice.
export const collectPenalties = async (loanId, body = {}, by = "") => {
  const numbers = parseNumbers(body.installmentNumbers);
  const amount = roundMoney(body.amount);
  if (!(amount > 0)) throw httpError("Penalty amount must be greater than zero.");
  const clientRef = String(body.clientRef || "").trim().slice(0, 120) || null;
  const givenRef = String(body.transactionRef || "").trim().slice(0, 120) || null;
  const paymentMode = String(body.paymentMode || "Cash").trim().slice(0, 40) || "Cash";
  const collectionDate = String(body.collectionDate || "").trim() || new Date().toISOString();
  if (Number.isNaN(new Date(collectionDate).getTime())) throw httpError("Collection date is not a valid date.");

  const earlier = await findTransaction(clientRef, givenRef);
  if (earlier) {
    const [transaction] = (await readTransactions({ query }, loanId)).filter((t) => t.id === earlier);
    if (!transaction) throw httpError("That transaction reference is already used on another loan.", 409);
    return { transaction, records: await resultFor(loanId), duplicate: true };
  }

  let txId;
  try {
    txId = await recordCollection(loanId, numbers, { amount, clientRef, givenRef, paymentMode, collectionDate }, by);
  } catch (error) {
    // A simultaneous repeat of the same payment lost the race on the unique
    // reference: hand back the one that was saved.
    const saved = error.code === "23505" ? await findTransaction(clientRef, givenRef) : null;
    if (!saved) throw error;
    txId = saved;
  }

  const [transaction] = (await readTransactions({ query }, loanId)).filter((t) => t.id === txId);
  return { transaction, records: await resultFor(loanId), duplicate: false };
};

const recordCollection = (loanId, numbers, { amount, clientRef, givenRef, paymentMode, collectionDate }, by) =>
  withLoanPenalties(loanId, numbers, async (client, entry, targets) => {
    for (const { rec } of targets) {
      if (rec.status !== "Pending") {
        throw httpError(
          `Instalment ${rec.installmentNumber}: only a pending penalty can be collected (this one is ${rec.status.toLowerCase()}).`,
          409
        );
      }
      if (!(rec.calculatedAmount > 0)) {
        throw httpError(`Instalment ${rec.installmentNumber}: no penalty is due any more (it is paid or within the grace period).`, 409);
      }
    }
    const applicable = roundMoney(targets.reduce((sum, t) => sum + t.rec.calculatedAmount, 0));

    const inserted = await client.query(
      `INSERT INTO penalty_transactions
         (id, tenant_id, loan_pk, transaction_ref, client_ref, collection_date, installment_numbers,
          actual_penalty_amount, collected_amount, payment_mode, created_by)
       VALUES ('', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING pk`,
      [currentTenantId(), entry.loan.pk, givenRef || `pending-${randomUUID()}`, clientRef, collectionDate, numbers,
        applicable, amount, paymentMode, by || null]
    );
    const pk = inserted.rows[0].pk;
    const id = `PTX-${String(pk).padStart(4, "0")}`;
    const transactionRef = givenRef || `TX-PEN-${String(pk).padStart(4, "0")}`;
    const display = numbers.join(", ");

    const incomeId = await insertIncome(client, {
      amount,
      status: "Received",
      category: PENALTY_INCOME_CATEGORY,
      incomeDate: collectionDate,
      paymentMode,
      receivedFrom: entry.loan.customer_name || "Customer",
      reference: transactionRef,
      remarks: `Penalty collection for Installment ${display}`,
      createdBy: by,
      loanId: entry.loan.loan_id,
      customerId: entry.loan.customer_id,
      customerName: entry.loan.customer_name || "Customer",
      installmentNumber: display,
      installmentNumbers: numbers,
      penaltyTransactionId: id,
      actualPenaltyAmount: applicable,
      penaltyType: targets[0].rec.penaltyType,
      gracePeriod: targets[0].rec.gracePeriod,
      isPenaltyIncome: true,
    });

    await client.query("UPDATE penalty_transactions SET id = $1, transaction_ref = $2, income_id = $3 WHERE pk = $4", [
      id,
      transactionRef,
      incomeId,
      pk,
    ]);

    // Split what was paid across the covered penalties in proportion to
    // each one's amount (the last takes the rounding), for the audit trail.
    let left = amount;
    for (const [index, { rec, row }] of targets.entries()) {
      const share = index === targets.length - 1 ? left : roundMoney((amount * rec.calculatedAmount) / applicable);
      left = roundMoney(left - share);
      await upsertRecord(client, entry.loan.pk, rec, row, {
        status: "Collected",
        actualAmountCollected: share,
        collectionDate,
        transactionPk: pk,
        audit: auditEntry("COLLECTED", share, "Penalty collected", by, { transactionRef }),
      });
    }
    return id;
  });
