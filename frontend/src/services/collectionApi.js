import { apiGet, apiPost } from './api'

// Payments are recorded as collections. The server applies each one to the
// loan's installments (oldest first, interest before principal) in the same
// transaction that saves it, so the schedule is always in step.

const toPayment = (collection) => ({
  id: collection.id,
  customerId: collection.customerId,
  loanId: collection.loanId,
  date: collection.collectedDate || collection.createdAt,
  amount: collection.amount,
  principal: collection.amountTowardPrincipal || 0,
  interest: collection.allocation?.interest ?? 0,
  penalty: collection.amountTowardPenalty || 0,
  advance: collection.amountTowardAdvance || 0,
  mode: collection.payMode,
  remarks: collection.remarks,
  transactionId: collection.transactionId || '',
  // Which installments this payment went to (from the server's allocation),
  // for the Installment No. column. Deliberately not "allocations": the
  // schedule views must not re-apply a payment the server already applied.
  installmentNumbers: [...new Set(
    (collection.allocation?.items || [])
      .filter((item) => Number(item.amount) > 0 && Number(item.installmentNumber) > 0)
      .map((item) => Number(item.installmentNumber))
  )].sort((a, b) => a - b),
})

// Posted payments only; reversed or rejected collections moved no money.
export const loadPayments = async () => {
  const collections = await apiGet('/collections')
  return collections.filter((item) => item.status === 'Approved').map(toPayment)
}

// clientRef is made once per payment attempt (when the dialog opens) so a
// double click or a retry after a lost response does not post twice.
export const recordCollection = ({ entry, amount, paymentMode, remarks, dueAmount, clientRef, collectedDate, transactionId }) =>
  apiPost('/collections', {
    loanId: entry.loanId,
    customerId: entry.customerId,
    amount,
    payMode: paymentMode,
    remarks,
    dueAmount,
    collectedDate: collectedDate || new Date().toISOString(),
    clientRef,
    // Bank / UPI reference of a non-cash payment.
    transactionId: paymentMode && paymentMode !== 'Cash' ? (transactionId || '').trim() : '',
  })
