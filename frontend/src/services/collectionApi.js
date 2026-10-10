import { apiGet, apiPost } from './api'

// Payments are recorded as collections. The server applies each one to the
// loan's installments (oldest first, interest before principal) in the same
// transaction that saves it, so the schedule is always in step.

const LEGACY_PAYMENTS_KEY = 'motoLendPaymentHistory'

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

/*
 * Ledger and Dashboard still read payments from localStorage; keep a copy
 * there until they are moved to the API.
 */
const writeLegacyMirror = (payments) => {
  try {
    localStorage.setItem(LEGACY_PAYMENTS_KEY, JSON.stringify(payments))
  } catch {
    // Quota or private mode: those pages simply show stale data.
  }
}

// Posted payments only; reversed or rejected collections moved no money.
export const loadPayments = async () => {
  const collections = await apiGet('/collections')
  const payments = collections.filter((item) => item.status === 'Approved').map(toPayment)
  writeLegacyMirror(payments)
  return payments
}

// clientRef is made once per payment attempt (when the dialog opens) so a
// double click or a retry after a lost response does not post twice.
export const recordCollection = ({ entry, amount, paymentMode, remarks, dueAmount, clientRef }) =>
  apiPost('/collections', {
    loanId: entry.loanId,
    customerId: entry.customerId,
    amount,
    payMode: paymentMode,
    remarks,
    dueAmount,
    collectedDate: new Date().toISOString(),
    clientRef,
  })
