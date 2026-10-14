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

// "Proceeds received" is what is left of the price after sale costs; the
// server records price and costs and works out the shortfall or surplus
// against what the loan owes.
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
