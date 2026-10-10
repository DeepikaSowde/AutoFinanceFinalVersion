import { apiGet, apiPost } from './api'

// The API stores each investor with nested bank/investment details and keeps
// transactions in their own table. The Investors screen works with one flat
// object per investor that carries its transactions, so convert here.

const toTransaction = (tx) => ({
  id: tx.id,
  type: tx.kind,
  amount: tx.amount,
  date: tx.date,
  transferMode: tx.investmentMode,
  paymentMode: tx.paymentMode,
  reason: tx.reason,
  remarks: tx.notes,
  locked: tx.locked,
})

const toInvestor = (investor, transactions) => ({
  id: investor.id,
  name: investor.name,
  mobile: investor.mobileNumber,
  email: investor.email,
  aadhaar: investor.investment?.aadhaar || '',
  pan: investor.pan,
  accountNumber: investor.bankDetails?.accountNumber || '',
  accountHolder: investor.bankDetails?.accountName || '',
  type: investor.investment?.origin || 'New Investor',
  status: investor.status,
  createdAt: investor.createdAt,
  transactions: transactions.filter((tx) => tx.investorId === investor.id && tx.kind).map(toTransaction),
})

const formatFreezeDate = (isoDate) => {
  if (!isoDate) return null
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .format(new Date(isoDate))
    .replace(/ /g, '-')
}

export const loadInvestorData = async () => {
  const [investors, transactions, summary] = await Promise.all([
    apiGet('/investors'),
    apiGet('/investors/transactions'),
    apiGet('/investors/summary'),
  ])

  return {
    investors: investors.map((investor) => toInvestor(investor, transactions)),
    freezeInfo: {
      frozen: Boolean(summary.openingFreeze?.frozen),
      date: formatFreezeDate(summary.openingFreeze?.date),
    },
    availablePool: summary.availableInvestmentBalance,
  }
}

export const addInvestor = ({ origin, form }) =>
  apiPost('/investors/entries', {
    origin,
    name: form.name,
    mobileNumber: form.mobile,
    email: form.email,
    aadhaar: form.aadhaar,
    pan: form.pan,
    accountNumber: form.accountNumber,
    accountHolder: form.accountHolder,
    amount: origin === 'Opening' ? form.openingBalance : form.investmentAmount,
    date: origin === 'Opening' ? form.openingDate : form.investmentDate,
    transferMode: form.transferMode,
  })

export const reinvest = (investorId, form) =>
  apiPost(`/investors/${investorId}/investments`, {
    amount: form.investmentAmount,
    date: form.investmentDate,
    investmentMode: form.transferMode,
    kind: 'Re-Investment',
  })

export const debitInvestor = (investorId, form) =>
  apiPost(`/investors/${investorId}/debits`, {
    amount: form.debitAmount,
    date: form.debitDate,
    paymentMode: form.paymentMode,
    reason: form.reason,
    remarks: form.remarks,
  })

export const freezeOpeningBalances = () => apiPost('/investors/freeze-opening')
