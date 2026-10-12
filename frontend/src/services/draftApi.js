import { apiDelete, apiGet, apiPost, apiPut } from './api'

// Saved New Loan applications, resumable on any device. Uploaded documents
// keep only their name and size on the server; the vehicle photo is kept.

export const listDrafts = () => apiGet('/drafts')

export const getDraft = (draftId) => apiGet(`/drafts/${draftId}`)

// Creates the draft the first time, then updates the same one.
export const saveDraft = (draftId, form) =>
  draftId ? apiPut(`/drafts/${draftId}`, { form }) : apiPost('/drafts', { form })

export const deleteDraft = (draftId) => apiDelete(`/drafts/${draftId}`)
