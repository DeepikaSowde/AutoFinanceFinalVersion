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
})

// Posted payments only; reversed or rejected collections moved no money.
export const loadPayments = async () => {
  const collections = await apiGet('/collections')
  return collections.filter((item) => item.status === 'Approved').map(toPayment)
}

// clientRef is made once per payment attempt (when the dialog opens) so a
// double click or a retry after a lost response does not post twice.
export const recordCollection = ({ entry, amount, paymentMode, remarks, dueAmount, clientRef, collectedDate }) =>
  apiPost('/collections', {
    loanId: entry.loanId,
    customerId: entry.customerId,
    amount,
    payMode: paymentMode,
    remarks,
    dueAmount,
    collectedDate: collectedDate || new Date().toISOString(),
    clientRef,
  })
