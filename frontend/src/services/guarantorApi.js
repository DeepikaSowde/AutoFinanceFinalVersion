import { apiGet, apiPost } from './api'

// The Guarantor / Referral register. Lists come without document contents;
// load one record to view its documents or copy it into a loan.

export const loadGuarantorReferrals = () => apiGet('/guarantor-referrals')

export const loadGuarantorReferral = (id) => apiGet(`/guarantor-referrals/${id}`)

export const addGuarantorReferral = (record) => apiPost('/guarantor-referrals', record)
