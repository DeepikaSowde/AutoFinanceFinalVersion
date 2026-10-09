// src/services/repaymentEngine.js
//
// Server-side port of the payment waterfall that used to live in the
// browser (src/services/repaymentStorage.js: normalizeSchedule,
// buildPaymentAllocation, processRepayment).
//
// A payment is applied oldest-installment-first, and within an
// installment: penalty -> interest -> principal. Anything left over after
// every open installment is satisfied becomes advance/excess.

export const ALLOCATION_TYPE = {
  PENALTY: "Penalty",
  INTEREST: "Interest",
  PRINCIPAL: "Principal",
  ADVANCE: "Advance",
  EXCESS: "Excess",
};

export const INSTALLMENT_STATUS = {
  PENDING: "Pending",
  PARTIALLY_PAID: "Partially Paid",
  PAID: "Paid",
  OVERDUE: "Overdue",
};

export const LOAN_STATUS = {
  ACTIVE: "Active",
  OVERDUE: "Overdue",
  CLOSED: "Closed",
  FORECLOSED: "Foreclosed",
};

export const roundMoney = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const startOfDay = (value) => {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setHours(0, 0, 0, 0);

  return date;
};

/*
 * Derives the live paid/remaining/status view of an installment row.
 * Mirrors the frontend's normalizeSchedule().
 */
export const describeInstallment = (row, referenceDate = new Date()) => {
  const principal = roundMoney(row.principal);
  const interest = roundMoney(row.interest);
  const paidPrincipal = roundMoney(row.paid_principal ?? row.paidPrincipal ?? 0);
  const paidInterest = roundMoney(row.paid_interest ?? row.paidInterest ?? 0);

  const remainingPrincipal = roundMoney(Math.max(principal - paidPrincipal, 0));
  const remainingInterest = roundMoney(Math.max(interest - paidInterest, 0));

  const paymentAmount = roundMoney(principal + interest);
  const paidAmount = roundMoney(paidPrincipal + paidInterest);
  const remainingAmount = roundMoney(remainingPrincipal + remainingInterest);

  const dueDate = startOfDay(row.due_date ?? row.dueDate);
  const today = startOfDay(referenceDate);

  let status;

  if (remainingAmount <= 0 && paymentAmount > 0) {
    status = INSTALLMENT_STATUS.PAID;
  } else if (paidAmount > 0) {
    status = INSTALLMENT_STATUS.PARTIALLY_PAID;
  } else if (dueDate && today && dueDate < today) {
    status = INSTALLMENT_STATUS.OVERDUE;
  } else {
    status = INSTALLMENT_STATUS.PENDING;
  }

  return {
    installmentNumber: row.installment_number ?? row.installmentNumber,
    dueDate: row.due_date ?? row.dueDate ?? "",
    openingBalance: roundMoney(row.opening_balance ?? row.openingBalance ?? 0),
    closingBalance: roundMoney(row.closing_balance ?? row.closingBalance ?? 0),
    principal,
    interest,
    paymentAmount,
    paidPrincipal,
    paidInterest,
    paidAmount,
    remainingPrincipal,
    remainingInterest,
    remainingAmount,
    balance: remainingAmount,
    penaltyPaidAmount: roundMoney(row.penalty_paid_amount ?? row.penaltyPaidAmount ?? 0),
    status,
  };
};

const isOverdue = (installment, referenceDate) => {
  const dueDate = startOfDay(installment.dueDate);
  const today = startOfDay(referenceDate);

  return Boolean(dueDate && today && dueDate < today && installment.remainingAmount > 0);
};

/*
 * Builds the allocation plan for a payment without mutating anything.
 * Returns the individual postings plus per-bucket totals.
 */
export const buildAllocation = ({
  installments = [],
  paymentAmount = 0,
  penaltyAmount = 0,
  referenceDate = new Date(),
  allowAdvance = true,
} = {}) => {
  let remaining = roundMoney(paymentAmount);

  const items = [];
  const totals = { penalty: 0, interest: 0, principal: 0, advance: 0, excess: 0 };

  if (remaining <= 0) {
    return { items, ...totals, allocated: 0, unallocated: 0 };
  }

  const open = installments
    .filter((installment) => installment.remainingAmount > 0)
    .sort((a, b) => a.installmentNumber - b.installmentNumber);

  // 1. Penalty comes off the top, attributed to the oldest overdue row.
  const penaltyDue = roundMoney(Math.max(penaltyAmount, 0));

  if (penaltyDue > 0) {
    const penaltyPaid = roundMoney(Math.min(penaltyDue, remaining));

    if (penaltyPaid > 0) {
      const target = open.find((installment) => isOverdue(installment, referenceDate)) || open[0];

      items.push({
        installmentNumber: target?.installmentNumber ?? null,
        dueDate: target?.dueDate ?? "",
        amount: penaltyPaid,
        type: ALLOCATION_TYPE.PENALTY,
        isPenalty: true,
        isInterest: false,
        isPrincipal: false,
      });

      totals.penalty = penaltyPaid;
      remaining = roundMoney(remaining - penaltyPaid);
    }
  }

  // 2. Oldest installment first: interest, then principal.
  for (const installment of open) {
    if (remaining <= 0) {
      break;
    }

    const isAdvance = !isOverdue(installment, referenceDate) && !hasDueArrived(installment, referenceDate);

    if (isAdvance && !allowAdvance) {
      break;
    }

    if (installment.remainingInterest > 0) {
      const applied = roundMoney(Math.min(installment.remainingInterest, remaining));

      if (applied > 0) {
        items.push({
          installmentNumber: installment.installmentNumber,
          dueDate: installment.dueDate,
          amount: applied,
          type: isAdvance ? ALLOCATION_TYPE.ADVANCE : ALLOCATION_TYPE.INTEREST,
          isPenalty: false,
          isInterest: true,
          isPrincipal: false,
        });

        totals.interest = roundMoney(totals.interest + applied);

        if (isAdvance) {
          totals.advance = roundMoney(totals.advance + applied);
        }

        remaining = roundMoney(remaining - applied);
      }
    }

    if (remaining <= 0) {
      break;
    }

    if (installment.remainingPrincipal > 0) {
      const applied = roundMoney(Math.min(installment.remainingPrincipal, remaining));

      if (applied > 0) {
        items.push({
          installmentNumber: installment.installmentNumber,
          dueDate: installment.dueDate,
          amount: applied,
          type: isAdvance ? ALLOCATION_TYPE.ADVANCE : ALLOCATION_TYPE.PRINCIPAL,
          isPenalty: false,
          isInterest: false,
          isPrincipal: true,
        });

        totals.principal = roundMoney(totals.principal + applied);

        if (isAdvance) {
          totals.advance = roundMoney(totals.advance + applied);
        }

        remaining = roundMoney(remaining - applied);
      }
    }
  }

  // 3. Nothing left to satisfy — the remainder is excess (overpayment).
  if (remaining > 0) {
    items.push({
      installmentNumber: null,
      dueDate: "",
      amount: remaining,
      type: ALLOCATION_TYPE.EXCESS,
      isPenalty: false,
      isInterest: false,
      isPrincipal: false,
    });

    totals.excess = remaining;
  }

  const allocated = roundMoney(totals.penalty + totals.interest + totals.principal);

  return { items, ...totals, allocated, unallocated: roundMoney(totals.excess) };
};

const hasDueArrived = (installment, referenceDate) => {
  const dueDate = startOfDay(installment.dueDate);
  const today = startOfDay(referenceDate);

  if (!dueDate || !today) {
    return true;
  }

  return dueDate <= today;
};

/*
 * Applies an allocation plan to installment rows, returning the updated
 * paid/penalty figures per installment number.
 */
export const applyAllocation = ({ installments, items, referenceDate = new Date() }) => {
  const byNumber = new Map(
    installments.map((installment) => [
      installment.installmentNumber,
      { ...installment },
    ])
  );

  for (const item of items) {
    if (item.installmentNumber == null) {
      continue;
    }

    const installment = byNumber.get(item.installmentNumber);

    if (!installment) {
      continue;
    }

    if (item.isPenalty) {
      installment.penaltyPaidAmount = roundMoney(installment.penaltyPaidAmount + item.amount);
      continue;
    }

    if (item.isInterest) {
      installment.paidInterest = roundMoney(installment.paidInterest + item.amount);
      installment.remainingInterest = roundMoney(
        Math.max(installment.interest - installment.paidInterest, 0)
      );
    }

    if (item.isPrincipal) {
      installment.paidPrincipal = roundMoney(installment.paidPrincipal + item.amount);
      installment.remainingPrincipal = roundMoney(
        Math.max(installment.principal - installment.paidPrincipal, 0)
      );
    }

    installment.paidAmount = roundMoney(installment.paidInterest + installment.paidPrincipal);
    installment.remainingAmount = roundMoney(
      installment.remainingInterest + installment.remainingPrincipal
    );

    installment.status = describeInstallment(
      {
        installment_number: installment.installmentNumber,
        due_date: installment.dueDate,
        principal: installment.principal,
        interest: installment.interest,
        paid_principal: installment.paidPrincipal,
        paid_interest: installment.paidInterest,
        penalty_paid_amount: installment.penaltyPaidAmount,
      },
      referenceDate
    ).status;
  }

  return [...byNumber.values()];
};

/*
 * Loan-level status after a payment run.
 */
export const deriveLoanStatus = (installments, referenceDate = new Date()) => {
  if (!installments.length) {
    return LOAN_STATUS.ACTIVE;
  }

  const allPaid = installments.every((installment) => installment.remainingAmount <= 0);

  if (allPaid) {
    return LOAN_STATUS.CLOSED;
  }

  const anyOverdue = installments.some((installment) => isOverdue(installment, referenceDate));

  return anyOverdue ? LOAN_STATUS.OVERDUE : LOAN_STATUS.ACTIVE;
};

export const summariseOutstanding = (installments) => {
  const principalOutstanding = roundMoney(
    installments.reduce((sum, installment) => sum + installment.remainingPrincipal, 0)
  );

  const interestOutstanding = roundMoney(
    installments.reduce((sum, installment) => sum + installment.remainingInterest, 0)
  );

  return {
    principalOutstanding,
    interestOutstanding,
    outstanding: roundMoney(principalOutstanding + interestOutstanding),
  };
};

/*
 * Payment-type label for a collection, derived from where the money landed.
 * Mirrors the frontend's COLLECTION_PAYMENT_TYPE well enough for display.
 */
export const derivePaymentType = (allocation, installments, referenceDate = new Date()) => {
  const hadOverdue = installments.some((installment) => isOverdue(installment, referenceDate));

  if (allocation.excess > 0) {
    return "EXCESS";
  }

  if (allocation.advance > 0) {
    return hadOverdue ? "OVERDUE_DUE_ADVANCE" : "DUE_ADVANCE";
  }

  if (allocation.penalty > 0 && allocation.interest === 0 && allocation.principal === 0) {
    return "PENALTY";
  }

  return hadOverdue ? "OVERDUE" : "DUE";
};
