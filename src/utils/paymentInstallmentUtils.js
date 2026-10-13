/**
 * Utility for resolving and formatting installment sequence numbers (EMI 1, EMI 3, EMI 4, etc.)
 * from customer payment records and repayment schedules in MotoLend.
 */

/**
 * Resolves the actual installment sequence number(s) associated with a payment record.
 * Formats as "EMI 1", "EMI 3, EMI 4", or "Not Assigned".
 *
 * @param {Object} payment - The recorded payment transaction object
 * @param {Array} baseSchedule - Optional loan repayment schedule
 * @returns {string} Formatted installment string (e.g., "EMI 1", "EMI 3, EMI 4", or "Not Assigned")
 */
export const getPaymentInstallmentLabel = (payment, baseSchedule = []) => {
  if (!payment || typeof payment !== "object") return "Not Assigned";

  const installmentNumbers = new Set();

  // 1. Check explicit allocations array (stored by Collection & LoanDetailsView)
  if (Array.isArray(payment.allocations) && payment.allocations.length > 0) {
    payment.allocations.forEach((alloc) => {
      const amt = alloc.allocated !== undefined ? Number(alloc.allocated) : (alloc.amount !== undefined ? Number(alloc.amount) : null);
      if (amt === null || amt > 0.001) {
        const num = Number(alloc.installmentNumber);
        if (!isNaN(num) && num > 0) {
          installmentNumbers.add(num);
        }
      }
    });
  }

  // 2. Check explicit installmentNumbers array
  if (Array.isArray(payment.installmentNumbers) && payment.installmentNumbers.length > 0) {
    payment.installmentNumbers.forEach((n) => {
      const num = Number(n);
      if (!isNaN(num) && num > 0) {
        installmentNumbers.add(num);
      }
    });
  }

  // 3. Check explicit single installmentNumber property
  if (installmentNumbers.size === 0 && payment.installmentNumber !== undefined && payment.installmentNumber !== null) {
    const num = Number(payment.installmentNumber);
    if (!isNaN(num) && num > 0) {
      installmentNumbers.add(num);
    } else {
      const matches = String(payment.installmentNumber).match(/\d+/g);
      if (matches) {
        matches.forEach((m) => {
          const parsed = Number(m);
          if (!isNaN(parsed) && parsed > 0) installmentNumbers.add(parsed);
        });
      }
    }
  }

  // 4. Check explicit installment reference fields (installmentRef, installmentSequence, emiNo)
  if (installmentNumbers.size === 0) {
    const ref = payment.installmentRef || payment.installmentSequence || payment.emiNo || payment.emiNumber;
    if (ref !== undefined && ref !== null && String(ref).trim() !== "") {
      const matches = String(ref).match(/\d+/g);
      if (matches) {
        matches.forEach((m) => {
          const parsed = Number(m);
          if (!isNaN(parsed) && parsed > 0) installmentNumbers.add(parsed);
        });
      }
    }
  }

  // 5. Check if base repayment schedule has explicit link to this payment by ID or receipt
  if (installmentNumbers.size === 0 && Array.isArray(baseSchedule) && baseSchedule.length > 0) {
    baseSchedule.forEach((inst) => {
      const pId = payment.id;
      const rNo = payment.receiptNo || payment.referenceNo || payment.transactionRef;
      const hasDirectIdMatch = (pId && inst.paymentId === pId) || (rNo && inst.receiptNo === rNo);
      const hasListMatch = Array.isArray(inst.paymentsList) && inst.paymentsList.some(
        (ep) => (pId && ep?.id === pId) || (rNo && (ep?.receiptNo === rNo || ep?.referenceNo === rNo || ep?.transactionRef === rNo))
      );
      if (hasDirectIdMatch || hasListMatch) {
        const num = Number(inst.installmentNumber);
        if (!isNaN(num) && num > 0) {
          installmentNumbers.add(num);
        }
      }
    });
  }

  // If no reliable allocation data found, do NOT guess or derive from payment date!
  if (installmentNumbers.size === 0) {
    return "Not Assigned";
  }

  // Sort and format as "EMI 1" or "EMI 3, EMI 4"
  const sorted = Array.from(installmentNumbers).sort((a, b) => a - b);
  return sorted.map((n) => `EMI ${n}`).join(", ");
};
