import { apiGet, apiPost, apiPut } from './api'

// Vehicle lifecycle: Active -> Seized -> Released, or Seized -> Sold. The
// server checks every move and records it in the vehicle's history; selling
// also forecloses the loan.

export const loadVehicles = () => apiGet('/vehicles')

export const loadVehicleEvents = (vehicleId) => apiGet(`/vehicles/${vehicleId}/events`)

export const seizeVehicle = (vehicleId, { seizureDate, reason, storageLocation, condition, notes }) =>
  apiPost(`/vehicles/${vehicleId}/seize`, { seizureDate, reason, storageLocation, condition, notes })

// Corrects the seizure details while the vehicle is still held.
export const updateSeizure = (vehicleId, { seizureDate, reason, storageLocation, condition, notes }) =>
  apiPut(`/vehicles/${vehicleId}/seizure`, { seizureDate, reason, storageLocation, condition, notes })

export const releaseVehicle = (vehicleId, { releaseDate, releasedTo, reason, clearedAmount, notes }) =>
  apiPost(`/vehicles/${vehicleId}/release`, { releaseDate, releasedTo, reason, clearedAmount, notes })

// The foreclosure cost and profit / loss of selling at these figures, on the
// Foreclosure & Vehicle Sale settings; nothing is saved. Leave vehicleExpenses
// empty to use the expenses already booked against the vehicle.
// (A GET, so asking does not make open views reload.)
export const previewForeclosure = (vehicleId, { salePrice, saleDate, vehicleExpenses }) => {
  const params = new URLSearchParams({ salePrice: String(Number(salePrice) || 0), saleDate: saleDate || '' })
  if (vehicleExpenses !== '' && vehicleExpenses != null) params.set('vehicleExpenses', String(Number(vehicleExpenses) || 0))
  return apiGet(`/vehicles/${vehicleId}/foreclosure-preview?${params}`)
}

// The settlement with the customer once sold: decision is recovery (collect
// part or all of a shortfall), waiver, payout (pay the profit) or retained,
// or breakeven. The server books the income / expense for money that moves.
export const settleVehicleSale = (vehicleId, { decision, amount, notes }) =>
  apiPost(`/vehicles/${vehicleId}/settlement`, { decision, amount: Number(amount) || 0, notes })

// "Proceeds received" is what is left of the price after sale costs; the
// server records price and costs and works out the foreclosure cost and the
// profit or shortfall against what the loan owes.
export const sellVehicle = (vehicleId, { saleDate, salePrice, saleExpenses, buyerName, buyerPhone, proceedsReceived, notes }) => {
  const price = Number(salePrice) || 0
  const proceeds = proceedsReceived === '' || proceedsReceived == null ? price : Number(proceedsReceived) || 0
  // The Vehicle module sends its "Vehicle Expenses" as saleExpenses; older
  // callers send proceeds received instead.
  const costs = saleExpenses != null && saleExpenses !== '' ? Math.max(0, Number(saleExpenses) || 0) : Math.max(0, price - proceeds)
  return apiPost(`/vehicles/${vehicleId}/complete-sale`, {
    salePrice: price,
    saleExpenses: costs,
    buyerName,
    buyerPhone,
    soldAt: saleDate,
    notes,
  })
}
