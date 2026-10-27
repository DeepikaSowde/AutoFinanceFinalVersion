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
  // Set on penalty income (category "Penalty"), booked by a penalty payment.
  installmentNumber: income.installmentNumber || '',
  installmentNumbers: income.installmentNumbers || [],
  penaltyType: income.penaltyType || '',
  gracePeriod: income.gracePeriod ?? '',
  transactionRef: income.reference || '',
  // Set on a foreclosure shortfall recovered from the customer.
  isForeclosureRecovery: Boolean(income.isForeclosureRecovery),
  vehicleRegNo: income.vehicleRegNo || '',
})

const toExpense = (expense) => ({
  id: expense.id,
  category: expense.category,
  amount: expense.amount,
  date: expense.expenseDate,
  mode: expense.paymentMode,
  remarks: expense.remarks,
  description: expense.description || '',
  createdAt: expense.createdAt,
  // Set on a Vehicle Expense: the vehicle (and its loan) it was spent on.
  vehicleId: expense.vehicleId || '',
  vehicleRegNo: expense.vehicleRegNo || '',
  regNo: expense.vehicleRegNo || '',
  vehicleMakeModel: expense.vehicleMakeModel || '',
  loanId: expense.loanId || '',
  customerId: expense.customerId || '',
  customerName: expense.customerName || '',
  isVehicleExpense: Boolean(expense.vehicleId),
  // Set on a foreclosure customer payout (EXP-PAYOUT-<loan id>).
  isForeclosurePayout: Boolean(expense.isForeclosurePayout),
})

export const loadIncomes = async () => {
  return (await apiGet('/incomes')).map(toIncome)
}

export const loadExpenses = async () => {
  return (await apiGet('/expenses')).map(toExpense)
}

// A sold repossessed vehicle brings its net proceeds back in: the price less
// the sale's own costs. Vehicle expenses already booked while it was held are
// in the expense list, so only the part of the sale costs above them counts here.
export const loadVehicleSales = async () =>
  (await apiGet('/vehicles?status=SOLD')).map((vehicle) => ({
    id: `SALE-${vehicle.id}`,
    date: vehicle.sale?.soldAt || vehicle.sale?.updatedAt,
    amount: Number(vehicle.sale?.netSaleProceeds || 0),
    salePrice: Number(vehicle.sale?.salePrice || 0),
    saleExpenses: Number(vehicle.sale?.additionalSaleExpenses ?? vehicle.sale?.saleExpenses ?? 0),
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

export const addExpense = ({ category, amount, date, mode, remarks, vehicleLink = null }) =>
  apiPost('/expenses', {
    category,
    amount,
    expenseDate: date,
    paymentMode: mode,
    remarks,
    status: 'Paid',
    ...(vehicleLink || {}),
  })

// The Vehicle Expense rows booked against one vehicle, newest first.
export const loadVehicleExpenses = async (vehicleId) =>
  (await loadExpenses())
    .filter((expense) => expense.category === 'Vehicle Expense' && vehicleId && expense.vehicleId === vehicleId)
    .sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)))
