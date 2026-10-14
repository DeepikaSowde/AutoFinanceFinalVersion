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
  // Set on server-recorded document-charge income (INC-DOC-<loan id>).
  description: income.description || '',
  loanId: income.loanId || '',
  customerId: income.customerId || '',
  customerName: income.customerName || income.receivedFrom || '',
  isDocumentCharge: Boolean(income.isDocumentCharge),
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

// A sold repossessed vehicle brings its net proceeds (price less sale costs) back in.
export const loadVehicleSales = async () =>
  (await apiGet('/vehicles?status=SOLD')).map((vehicle) => ({
    id: `SALE-${vehicle.id}`,
    date: vehicle.sale?.soldAt || vehicle.sale?.updatedAt,
    amount: Number(vehicle.sale?.netSaleProceeds || 0),
    salePrice: Number(vehicle.sale?.salePrice || 0),
    saleExpenses: Number(vehicle.sale?.saleExpenses || 0),
    regNo: vehicle.registrationNumber,
    customerName: vehicle.customerName,
    loanId: vehicle.loanId,
  }))

export const loadLedgerData = async () => {
  const [investorData, customers, payments, incomeData, expenseData, vehicleSales] = await Promise.all([
    loadInvestorData(),
    loadCustomerEntries(),
    loadPayments(),
    loadIncomes(),
    loadExpenses(),
    loadVehicleSales(),
  ])

  return { investors: investorData.investors, customers, payments, incomeData, expenseData, vehicleSales }
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
