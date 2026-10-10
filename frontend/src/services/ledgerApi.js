import { apiGet, apiPost } from './api'
import { loadCustomerEntries } from './customerApi'
import { loadInvestorData } from './investorApi'
import { loadPayments } from './collectionApi'

// Everything the Ledger, Income and Expense views show, in the shapes those
// views were written against.

const toIncome = (income) => ({
  id: income.id,
  type: income.category,
  amount: income.amount,
  date: income.incomeDate,
  mode: income.paymentMode,
  remarks: income.remarks,
})

const toExpense = (expense) => ({
  id: expense.id,
  category: expense.category,
  amount: expense.amount,
  date: expense.expenseDate,
  mode: expense.paymentMode,
  remarks: expense.remarks,
})

export const loadIncomes = async () => {
  return (await apiGet('/incomes')).map(toIncome)
}

export const loadExpenses = async () => {
  return (await apiGet('/expenses')).map(toExpense)
}

export const loadLedgerData = async () => {
  const [investorData, customers, payments, incomeData, expenseData] = await Promise.all([
    loadInvestorData(),
    loadCustomerEntries(),
    loadPayments(),
    loadIncomes(),
    loadExpenses(),
  ])

  return { investors: investorData.investors, customers, payments, incomeData, expenseData }
}

export const addIncome = ({ type, amount, date, mode, remarks }) =>
  apiPost('/incomes', {
    category: type,
    amount,
    incomeDate: date,
    paymentMode: mode,
    remarks,
    status: 'Received',
  })

export const addExpense = ({ category, amount, date, mode, remarks }) =>
  apiPost('/expenses', {
    category,
    amount,
    expenseDate: date,
    paymentMode: mode,
    remarks,
    status: 'Paid',
  })
