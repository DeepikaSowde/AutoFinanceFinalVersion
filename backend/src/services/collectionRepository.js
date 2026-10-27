// src/services/collectionRepository.js
//
// A collection is a payment recorded against a loan. Recording one runs the
// allocation waterfall and posts the result against the loan's installments
// immediately, inside a single transaction (status Approved) — there is no
// review step. A posted collection can later be Reversed.
//
// Pending / Rejected only exist for collections submitted before posting
// became automatic: approveCollection / rejectCollection remain so those can
// still be cleared, and no new collection is ever left Pending.

import { query, withTransaction } from "../db/connection.js";
import { currentTenantId } from "../db/tenantContext.js";
import { buildLoan, getCustomerRow } from "./customerRepository.js";
import {
  ALLOCATION_TYPE,
  LOAN_STATUS,
  applyAllocation,
  buildAllocation,
  deriveLoanStatus,
  derivePaymentType,
  describeInstallment,
  roundMoney,
  summariseOutstanding,
} from "./repaymentEngine.js";
import { getPaymentAllocationSettings } from "./paymentAllocationSettings.js";

export const COLLECTION_STATUS = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  REVERSED: "Reversed",
};

const pad = (number, length = 4) => String(number).padStart(length, "0");

const iso = (value) => (value ? new Date(value).toISOString() : "");

class CollectionError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "CollectionError";
    this.statusCode = statusCode;
  }
}

const mapCollection = (row) => {
  const personal = row.personal ?? {};

  return {
    id: row.id,
    customerId: row.customer_id || "",
    customerName: personal.name || "",
    mobileNumber: personal.mobileNumber || "",
    loanId: row.loan_id || "",
    loanNumber: row.loan_number || "",

    status: row.status,

    amount: row.amount,
    dueAmount: row.due_amount,
    penaltyAmount: row.penalty_amount,
    totalPayable: row.total_payable,

    paymentType: row.payment_type || "",
    payMode: row.pay_mode || "",
    paymentMode: row.pay_mode || "",
    receiptNumber: row.receipt_number || "",
    transactionId: row.transaction_ref || "",
    dueDate: row.due_date || "",
    installment: row.installment_number,

    staffName: row.staff_name || "",
    // The signed-in user who recorded it (none on older collections).
    collectedByUserId: row.collected_by_user_id || "",
    collectedByName: row.collected_by_user_id ? row.staff_name || "" : "",
    collectedByRole:
      row.collected_by_role === "admin" ? "Admin" : row.collected_by_role === "staff" ? "Staff" : "",
    location: row.location || "",
    remarks: row.remarks || "",

    overdueDays: row.overdue_days,
    graceDays: row.grace_days,

    amountTowardDue: row.amount_toward_due,
    amountTowardPenalty: row.amount_toward_penalty,
    amountTowardPrincipal: row.amount_toward_principal,
    amountTowardAdvance: row.amount_toward_advance,
    amountExcess: row.amount_excess,

    allocation: row.allocation ?? null,
    repaymentProcessed: Boolean(row.repayment_processed),
    repaymentProcessedAt: iso(row.repayment_processed_at),
    repaymentProcessingStatus: row.repayment_processing_status,
    repaymentError: row.repayment_error || "",

    submittedAt: iso(row.submitted_at),
    collectedDate: row.collected_date || "",
    approvedAt: iso(row.approved_at),
    approvedBy: row.approved_by || "",
    rejectedAt: iso(row.rejected_at),
    rejectedBy: row.rejected_by || "",
    rejectionRemarks: row.rejection_remarks || "",
    reversedAt: iso(row.reversed_at),
    reversedBy: row.reversed_by || "",
    reversalReason: row.reversal_reason || "",

    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
};

/*
 * Collections carry denormalised customer/loan identifiers because the UI
 * lists them standalone; the join keeps them accurate.
 */
const SELECT_COLLECTIONS = `
  SELECT
    collections.*,
    customers.id AS customer_id,
    customers.personal AS personal,
    loans.id AS loan_id,
    loans.loan_number AS loan_number
  FROM collections
  LEFT JOIN customers ON customers.pk = collections.customer_pk
  LEFT JOIN loans ON loans.pk = collections.loan_pk
`;

// Who took the payment, from the signed-in session (never from the request
// body): the Collection page shows it, and staff see their own collections.
const stampCollector = (client, pk, user) =>
  user?.userId
    ? client.query(
        "UPDATE collections SET collected_by_user_id = $2, collected_by_role = $3, staff_name = $4 WHERE pk = $1",
        [pk, user.userId, user.role || "", user.name || user.username || ""]
      )
    : null;

// Every collection, or only those `collectedByUserId` took.
export const getCollections = async ({ collectedByUserId = null } = {}) => {
  const result = await query(
    `${SELECT_COLLECTIONS} WHERE collections.tenant_id = $1
       AND ($2::text IS NULL OR collections.collected_by_user_id = $2)
     ORDER BY collections.pk DESC`,
    [currentTenantId(), collectedByUserId]
  );

  return result.rows.map(mapCollection);
};

export const getCollectionById = async (collectionId) => {
  const result = await query(`${SELECT_COLLECTIONS} WHERE collections.id = $1 AND collections.tenant_id = $2`, [
    collectionId,
    currentTenantId(),
  ]);

  return result.rows[0] ? mapCollection(result.rows[0]) : null;
};

export const createCollection = async (payload = {}, submittedBy) => {
  // A repeated request (double tap, or a retry after a lost response) carries
  // the same clientRef and must not post a second time.
  const clientRef = String(payload.clientRef || "").trim().slice(0, 120) || null;

  const findByClientRef = async () => {
    if (!clientRef) {
      return null;
    }

    const existing = await query("SELECT id FROM collections WHERE client_ref = $1 AND tenant_id = $2", [clientRef, currentTenantId()]);

    return existing.rows[0] ? getCollectionById(existing.rows[0].id) : null;
  };

  const duplicate = await findByClientRef();

  if (duplicate) {
    return duplicate;
  }

  const [customerRow, loanResult] = await Promise.all([
    payload.customerId ? getCustomerRow(payload.customerId) : Promise.resolve(null),
    payload.loanId
      ? query("SELECT * FROM loans WHERE id = $1 AND tenant_id = $2", [payload.loanId, currentTenantId()])
      : Promise.resolve({ rows: [] }),
  ]);

  const loanRow = loanResult.rows[0];

  if (!loanRow) {
    throw new CollectionError("A valid loanId is required.", 404);
  }

  const amount = roundMoney(payload.amount || 0);

  if (amount <= 0) {
    throw new CollectionError("Collection amount must be greater than zero.");
  }

  let collectionId;

  try {
    collectionId = await withTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO collections
          (id, customer_pk, loan_pk, status, amount, due_amount, penalty_amount, total_payable,
           payment_type, pay_mode, receipt_number, due_date, installment_number,
           staff_name, location, remarks, overdue_days, grace_days, collected_date, client_ref, tenant_id,
           transaction_ref)
         VALUES ('', $1, $2, 'Pending', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
         RETURNING pk`,
        [
          customerRow?.pk ?? loanRow.customer_pk,
          loanRow.pk,
          amount,
          roundMoney(payload.dueAmount || 0),
          roundMoney(payload.penaltyAmount || 0),
          roundMoney(payload.totalPayable || payload.dueAmount || 0),
          payload.paymentType || "",
          payload.payMode || payload.paymentMode || "",
          payload.receiptNumber || payload.receiptNo || "",
          payload.dueDate || "",
          payload.installment ?? payload.installmentNumber ?? null,
          payload.staffName || submittedBy?.name || "",
          payload.location || "",
          payload.remarks || "",
          Number(payload.overdueDays) || 0,
          Number(payload.graceDays) || 0,
          payload.collectedDate || new Date().toISOString(),
          clientRef,
          currentTenantId(),
          // UPI ref / UTR / cheque no. of a non-cash payment; none for cash.
          String(payload.transactionId || payload.transactionRef || "").trim().slice(0, 120) || null,
        ]
      );

      const pk = result.rows[0].pk;
      const id = `COL-${pad(pk)}`;

      await client.query("UPDATE collections SET id = $1 WHERE pk = $2", [id, pk]);
      await stampCollector(client, pk, submittedBy);

      // Post it in the same transaction: if posting fails, nothing is saved.
      const locked = await client.query("SELECT * FROM collections WHERE pk = $1 FOR UPDATE", [pk]);

      await postCollection(client, locked.rows[0], submittedBy, { allowExcess: false });

      return id;
    });
  } catch (error) {
    // Two identical requests raced and the other one won; return its collection.
    if (error.code === "23505" && clientRef) {
      const winner = await findByClientRef();

      if (winner) {
        return winner;
      }
    }

    throw error;
  }

  return getCollectionById(collectionId);
};

const CLOSED_LOAN_STATUSES = new Set(["closed", "paid", "settled", "completed", "foreclosed", "midway closed"]);

export const MIDWAY_CLOSURE_PAYMENT_TYPE = "MIDWAY_CLOSURE";

/*
 * Midway closure: settles a loan early, in one transaction.
 *
 * Collects all remaining principal plus the remaining interest of the next N
 * unpaid instalments (in due-date order) that still carry interest; interest
 * on every other remaining instalment is waived (installments.waived_interest).
 * It is recorded as one Approved collection (payment_type MIDWAY_CLOSURE) with
 * its payment_allocations, every remaining instalment is settled and marked
 * midway_closed, and the loan becomes "Midway Closed" (no further payments).
 * Figures come from the database schedule; the client's preview is not trusted.
 * Reversing the collection reopens the loan (see reverseCollection).
 */
export const closeLoanMidway = async (loanId, payload = {}, closedBy) => {
  const clientRef = String(payload.clientRef || "").trim().slice(0, 120) || null;
  if (clientRef) {
    const existing = await query("SELECT id FROM collections WHERE client_ref = $1 AND tenant_id = $2", [clientRef, currentTenantId()]);
    if (existing.rows[0]) return { collection: await getCollectionById(existing.rows[0].id), duplicate: true };
  }

  const count = Number(payload.interestInstalments ?? 0);
  if (!Number.isInteger(count) || count < 0) {
    throw new CollectionError("Interest instalments must be a whole number, 0 or more.");
  }

  const collectionId = await withTransaction(async (client) => {
    const loanResult = await client.query("SELECT * FROM loans WHERE id = $1 AND tenant_id = $2 FOR UPDATE", [
      loanId,
      currentTenantId(),
    ]);
    const loanRow = loanResult.rows[0];
    if (!loanRow) throw new CollectionError("Loan not found.", 404);
    if (CLOSED_LOAN_STATUSES.has(String(loanRow.status || "").toLowerCase())) {
      throw new CollectionError(`Loan is ${loanRow.status}; it cannot be closed again.`, 409);
    }

    const referenceDate = new Date();
    const rows = (await client.query(
      "SELECT * FROM installments WHERE loan_pk = $1 ORDER BY installment_number ASC",
      [loanRow.pk]
    )).rows.map((row) => describeInstallment(row, referenceDate));

    const remaining = rows.filter((r) => r.remainingAmount > 0.009);
    if (!remaining.length) throw new CollectionError("Nothing is outstanding on this loan.", 409);

    const eligible = remaining.filter((r) => r.remainingInterest > 0.009);
    if (count > eligible.length) {
      throw new CollectionError(`Only ${eligible.length} instalment(s) with interest remain; choose between 0 and ${eligible.length}.`);
    }
    const charged = new Set(eligible.slice(0, count).map((r) => r.installmentNumber));

    const items = [];
    let principal = 0;
    let interest = 0;
    let waived = 0;
    for (const r of remaining) {
      if (r.remainingPrincipal > 0.009) {
        items.push({ installmentNumber: r.installmentNumber, dueDate: r.dueDate, amount: r.remainingPrincipal,
          type: ALLOCATION_TYPE.PRINCIPAL, isPenalty: false, isInterest: false, isPrincipal: true });
        principal = roundMoney(principal + r.remainingPrincipal);
      }
      if (r.remainingInterest > 0.009) {
        if (charged.has(r.installmentNumber)) {
          items.push({ installmentNumber: r.installmentNumber, dueDate: r.dueDate, amount: r.remainingInterest,
            type: ALLOCATION_TYPE.INTEREST, isPenalty: false, isInterest: true, isPrincipal: false });
          interest = roundMoney(interest + r.remainingInterest);
        } else {
          waived = roundMoney(waived + r.remainingInterest);
        }
      }
    }
    const total = roundMoney(principal + interest);
    if (!(total > 0)) throw new CollectionError("The closure amount must be greater than zero.");

    const chargedNumbers = [...charged].sort((a, b) => a - b);
    const range = !chargedNumbers.length
      ? "None"
      : chargedNumbers.length === 1
        ? `Instalment #${chargedNumbers[0]}`
        : `Instalments #${chargedNumbers[0]} – #${chargedNumbers[chargedNumbers.length - 1]}`;
    const collectedDate = String(payload.paymentDate || payload.collectedDate || "").slice(0, 10) || referenceDate.toISOString().slice(0, 10);
    const payMode = String(payload.paymentMode || "Cash").trim() || "Cash";

    const inserted = await client.query(
      `INSERT INTO collections
        (id, customer_pk, loan_pk, status, amount, due_amount, penalty_amount, total_payable,
         payment_type, pay_mode, remarks, collected_date, client_ref, tenant_id, transaction_ref,
         staff_name, approved_at, approved_by, amount_toward_due, amount_toward_penalty,
         amount_toward_principal, amount_toward_advance, amount_excess, allocation,
         repayment_processed, repayment_processed_at, repayment_processing_status)
       VALUES ('', $1, $2, 'Approved', $3, $3, 0, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), $12, $3, 0, $13,
               0, 0, $14, true, now(), 'Processed')
       RETURNING pk`,
      [
        loanRow.customer_pk,
        loanRow.pk,
        total,
        MIDWAY_CLOSURE_PAYMENT_TYPE,
        payMode,
        String(payload.remarks || "").trim() || `Midway Closure Settlement: ${range}`,
        collectedDate,
        clientRef,
        currentTenantId(),
        payMode !== "Cash" ? String(payload.transactionId || "").trim().slice(0, 120) || null : null,
        closedBy?.name || "",
        closedBy?.username || "",
        principal,
        JSON.stringify({ items, principal, interest, penalty: 0, advance: 0, excess: 0, midwayClosure: true,
          interestInstalments: count, chargedInstalments: chargedNumbers, waivedInterest: waived }),
      ]
    );
    const pk = inserted.rows[0].pk;
    const id = `COL-${pad(pk)}`;
    await client.query("UPDATE collections SET id = $1 WHERE pk = $2", [id, pk]);
    await stampCollector(client, pk, closedBy);

    for (const [index, item] of items.entries()) {
      await client.query(
        `INSERT INTO payment_allocations
          (id, loan_pk, collection_pk, installment_number, due_date, amount, type, is_penalty, is_interest, is_principal)
         VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8, $9)`,
        [`PAY-${id}-${index + 1}`, loanRow.pk, pk, item.installmentNumber, item.dueDate || "", item.amount, item.type,
          item.isInterest, item.isPrincipal]
      );
    }

    // Settle every remaining instalment: principal in full, the chosen
    // interest paid, the rest of the interest waived.
    for (const r of remaining) {
      const isCharged = charged.has(r.installmentNumber);
      await client.query(
        `UPDATE installments SET
           paid_principal = principal,
           paid_interest = paid_interest + $3,
           waived_interest = waived_interest + $4,
           midway_closed = true,
           status = 'Paid'
         WHERE loan_pk = $1 AND installment_number = $2`,
        [loanRow.pk, r.installmentNumber, isCharged ? r.remainingInterest : 0, isCharged ? 0 : r.remainingInterest]
      );
    }

    await client.query(
      `UPDATE loans SET status = $2, foreclosure_status = $2, foreclosed_at = now(), foreclosure_reason = $3,
         repayment_meta = $4, updated_at = now()
       WHERE pk = $1`,
      [
        loanRow.pk,
        LOAN_STATUS.MIDWAY_CLOSED,
        `Midway closure (${range}; interest waived on the rest)`,
        JSON.stringify({
          repaymentMeta: {
            lastPaymentAt: referenceDate.toISOString(),
            lastPaymentAmount: total,
            lastPaymentType: MIDWAY_CLOSURE_PAYMENT_TYPE,
            lastInterestPaid: interest,
            lastPrincipalPaid: principal,
            outstanding: 0,
            principalOutstanding: 0,
            interestOutstanding: 0,
          },
          midwayClosure: { collectionId: id, closedAt: referenceDate.toISOString(), paymentDate: collectedDate,
            principal, interest, total, waivedInterest: waived, interestInstalments: count,
            chargedInstalments: chargedNumbers, range },
        }),
      ]
    );

    return id;
  });

  return { collection: await getCollectionById(collectionId), duplicate: false };
};

/*
 * The one path that actually moves money.
 *
 * Expects the collection row to be locked (SELECT ... FOR UPDATE) by the
 * caller's transaction. The loan is locked here for the same transaction, so
 * two payments landing on one loan at the same moment cannot both read the
 * same installment balances and double-post.
 */
const postCollection = async (client, collectionRow, postedBy, { allowExcess }) => {
  // Idempotency guard: a collection may never post twice.
  const posted = await client.query(
    "SELECT COUNT(*)::int AS count FROM payment_allocations WHERE collection_pk = $1",
    [collectionRow.pk]
  );

  if (posted.rows[0].count > 0) {
    throw new CollectionError("This collection has already been processed.", 409);
  }

  const loanResult = await client.query("SELECT * FROM loans WHERE pk = $1 FOR UPDATE", [
    collectionRow.loan_pk,
  ]);

  const loanRow = loanResult.rows[0];

  if (!loanRow) {
    throw new CollectionError("The loan for this collection no longer exists.", 404);
  }

  if (CLOSED_LOAN_STATUSES.has(String(loanRow.status || "").toLowerCase())) {
    throw new CollectionError(
      `Loan is ${loanRow.status}; it cannot take further payments.`,
      409
    );
  }

  const referenceDate = new Date();

  const installmentResult = await client.query(
    "SELECT * FROM installments WHERE loan_pk = $1 ORDER BY installment_number ASC",
    [loanRow.pk]
  );

  const installments = installmentResult.rows.map((row) =>
    describeInstallment(row, referenceDate)
  );

  const { allocationOrder } = await getPaymentAllocationSettings(client);
  const allocation = buildAllocation({
    installments,
    paymentAmount: collectionRow.amount,
    penaltyAmount: collectionRow.penalty_amount,
    referenceDate,
    allocationOrder,
  });

  // Nobody reviews a collection before it posts, so an amount larger than the
  // loan owes (a mistyped figure) is refused rather than recorded as excess.
  if (!allowExcess && roundMoney(allocation.excess) > 0.009) {
    throw new CollectionError(
      `That is ${roundMoney(allocation.excess)} more than is owed on this loan. Check the amount.`,
      400
    );
  }

  const updated = applyAllocation({ installments, items: allocation.items, referenceDate });
  const outstanding = summariseOutstanding(updated);
  const loanStatus = deriveLoanStatus(updated, referenceDate);
  const paymentType = derivePaymentType(allocation, installments, referenceDate);

  for (const installment of updated) {
    await client.query(
      `UPDATE installments SET
        paid_principal = $3, paid_interest = $4, penalty_paid_amount = $5, status = $6
       WHERE loan_pk = $1 AND installment_number = $2`,
      [
        loanRow.pk,
        installment.installmentNumber,
        installment.paidPrincipal,
        installment.paidInterest,
        installment.penaltyPaidAmount,
        installment.status,
      ]
    );
  }

  for (const [index, item] of allocation.items.entries()) {
    await client.query(
      `INSERT INTO payment_allocations
        (id, loan_pk, collection_pk, installment_number, due_date, amount, type,
         is_penalty, is_interest, is_principal)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        `PAY-${collectionRow.id}-${index + 1}`,
        loanRow.pk,
        collectionRow.pk,
        item.installmentNumber,
        item.dueDate || "",
        item.amount,
        item.type,
        Boolean(item.isPenalty),
        Boolean(item.isInterest),
        Boolean(item.isPrincipal),
      ]
    );
  }

  await client.query(
    "UPDATE loans SET status = $2, repayment_meta = $3, updated_at = now() WHERE pk = $1",
    [
      loanRow.pk,
      loanStatus,
      JSON.stringify({
        repaymentMeta: {
          lastPaymentAt: referenceDate.toISOString(),
          lastPaymentAmount: collectionRow.amount,
          lastPaymentType: paymentType,
          lastPenaltyPaid: allocation.penalty,
          lastInterestPaid: allocation.interest,
          lastPrincipalPaid: allocation.principal,
          outstanding: outstanding.outstanding,
          principalOutstanding: outstanding.principalOutstanding,
          interestOutstanding: outstanding.interestOutstanding,
        },
      }),
    ]
  );

  await client.query(
    `UPDATE collections SET
      status = 'Approved', approved_at = now(), approved_by = $2, payment_type = $3,
      amount_toward_due = $4, amount_toward_penalty = $5, amount_toward_principal = $6,
      amount_toward_advance = $7, amount_excess = $8, allocation = $9,
      repayment_processed = true, repayment_processed_at = now(),
      repayment_processing_status = 'Processed', repayment_error = NULL, updated_at = now()
     WHERE pk = $1`,
    [
      collectionRow.pk,
      postedBy?.username || "",
      paymentType,
      roundMoney(allocation.interest + allocation.principal - allocation.advance),
      allocation.penalty,
      allocation.principal,
      allocation.advance,
      allocation.excess,
      JSON.stringify(allocation),
    ]
  );

  return { loanPk: loanRow.pk, allocation };
};

/*
 * Posts a collection that is still Pending (one submitted before posting
 * became automatic).
 */
export const approveCollection = async (collectionId, approvedBy) => {
  const outcome = await withTransaction(async (client) => {
    const collectionResult = await client.query(
      "SELECT * FROM collections WHERE id = $1 AND tenant_id = $2 FOR UPDATE",
      [collectionId, currentTenantId()]
    );

    const collectionRow = collectionResult.rows[0];

    if (!collectionRow) {
      throw new CollectionError("Collection not found.", 404);
    }

    if (collectionRow.status !== COLLECTION_STATUS.PENDING) {
      throw new CollectionError(
        `Only pending collections can be approved (this one is ${collectionRow.status}).`,
        409
      );
    }

    return postCollection(client, collectionRow, approvedBy, { allowExcess: true });
  });

  const loanResult = await query("SELECT * FROM loans WHERE pk = $1", [outcome.loanPk]);

  return {
    collection: await getCollectionById(collectionId),
    loan: await buildLoan(loanResult.rows[0]),
    allocation: outcome.allocation,
  };
};

export const rejectCollection = async (collectionId, { remarks = "", rejectedBy } = {}) => {
  await withTransaction(async (client) => {
    const result = await client.query(
      "SELECT * FROM collections WHERE id = $1 AND tenant_id = $2 FOR UPDATE",
      [collectionId, currentTenantId()]
    );

    const row = result.rows[0];

    if (!row) {
      throw new CollectionError("Collection not found.", 404);
    }

    if (row.status !== COLLECTION_STATUS.PENDING) {
      throw new CollectionError("Only pending collections can be rejected.", 409);
    }

    await client.query(
      `UPDATE collections SET
        status = 'Rejected', rejected_at = now(), rejected_by = $2, rejection_remarks = $3,
        repayment_processing_status = 'Rejected', updated_at = now()
       WHERE pk = $1`,
      [row.pk, rejectedBy?.username || "", remarks]
    );
  });

  return getCollectionById(collectionId);
};

/*
 * Reversing an approved collection unwinds its postings: the allocation
 * rows are removed and the affected installments recomputed from what
 * remains, so the loan returns to its pre-approval state.
 */
export const reverseCollection = async (collectionId, { reason = "", reversedBy } = {}) => {
  await withTransaction(async (client) => {
    const result = await client.query(
      "SELECT * FROM collections WHERE id = $1 AND tenant_id = $2 FOR UPDATE",
      [collectionId, currentTenantId()]
    );

    const row = result.rows[0];

    if (!row) {
      throw new CollectionError("Collection not found.", 404);
    }

    if (row.status !== COLLECTION_STATUS.APPROVED) {
      throw new CollectionError("Only approved collections can be reversed.", 409);
    }

    await client.query("SELECT pk FROM loans WHERE pk = $1 FOR UPDATE", [row.loan_pk]);

    const postings = await client.query(
      "SELECT * FROM payment_allocations WHERE collection_pk = $1",
      [row.pk]
    );

    for (const posting of postings.rows) {
      if (posting.installment_number == null) {
        continue;
      }

      await client.query(
        `UPDATE installments SET
          paid_principal = GREATEST(paid_principal - $3, 0),
          paid_interest = GREATEST(paid_interest - $4, 0),
          penalty_paid_amount = GREATEST(penalty_paid_amount - $5, 0)
         WHERE loan_pk = $1 AND installment_number = $2`,
        [
          row.loan_pk,
          posting.installment_number,
          posting.is_principal ? posting.amount : 0,
          posting.is_interest ? posting.amount : 0,
          posting.is_penalty ? posting.amount : 0,
        ]
      );
    }

    await client.query("DELETE FROM payment_allocations WHERE collection_pk = $1", [row.pk]);

    // Undoing a midway closure also lifts its interest waiver and reopens the loan.
    if (row.payment_type === MIDWAY_CLOSURE_PAYMENT_TYPE) {
      await client.query(
        "UPDATE installments SET waived_interest = 0, midway_closed = false WHERE loan_pk = $1 AND midway_closed",
        [row.loan_pk]
      );
      await client.query(
        "UPDATE loans SET foreclosure_status = NULL, foreclosed_at = NULL, foreclosure_reason = NULL WHERE pk = $1",
        [row.loan_pk]
      );
    }

    const referenceDate = new Date();

    const refreshedResult = await client.query(
      "SELECT * FROM installments WHERE loan_pk = $1 ORDER BY installment_number ASC",
      [row.loan_pk]
    );

    const refreshed = refreshedResult.rows.map((installment) =>
      describeInstallment(installment, referenceDate)
    );

    for (const installment of refreshed) {
      await client.query(
        "UPDATE installments SET status = $3 WHERE loan_pk = $1 AND installment_number = $2",
        [row.loan_pk, installment.installmentNumber, installment.status]
      );
    }

    await client.query("UPDATE loans SET status = $2, updated_at = now() WHERE pk = $1", [
      row.loan_pk,
      deriveLoanStatus(refreshed, referenceDate),
    ]);

    await client.query(
      `UPDATE collections SET
        status = 'Reversed', reversed_at = now(), reversed_by = $2, reversal_reason = $3,
        repayment_processed = false, repayment_processing_status = 'Pending', updated_at = now()
       WHERE pk = $1`,
      [row.pk, reversedBy?.username || "", reason]
    );
  });

  return getCollectionById(collectionId);
};

export const getCollectionsForLoan = async (loanId) => {
  const result = await query(
    `${SELECT_COLLECTIONS} WHERE loans.id = $1 AND collections.tenant_id = $2 ORDER BY collections.pk DESC`,
    [loanId, currentTenantId()]
  );

  return result.rows.map(mapCollection);
};

export { CollectionError };
