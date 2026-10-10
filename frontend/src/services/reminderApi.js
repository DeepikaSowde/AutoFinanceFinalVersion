import { apiGet, apiPost, apiPut } from './api'
import { loadCustomerEntries } from './customerApi'

// One reminder record per loan holds the follow-up history: who was
// contacted, the outcome, and when to follow up next.

export const loadReminderData = async () => {
  const [entries, reminders] = await Promise.all([loadCustomerEntries(), apiGet('/reminders')])
  return { entries, reminders }
}

/*
 * Adds a follow-up to the loan's reminder record, creating the record on
 * the first follow-up. History is kept newest first.
 */
export const logFollowUp = ({ entry, existing, outcome, note, nextReminderDate, by }) => {
  const item = { at: new Date().toISOString(), by: by || '', outcome, note: note || '' }
  const history = [item, ...(existing?.history || [])]
  const body = {
    loanId: entry.loanId,
    customerId: entry.customerId,
    customerName: entry.customer?.name || '',
    nextReminderDate: nextReminderDate || '',
    status: outcome === 'Paid' ? 'Closed' : 'Active',
    lastOutcome: outcome,
    lastNote: note || '',
    history,
  }

  return existing ? apiPut(`/reminders/${existing.id}`, body) : apiPost('/reminders', body)
}
