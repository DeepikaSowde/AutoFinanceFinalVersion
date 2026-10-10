import { apiGet, apiPost } from './api'

// Vehicle lifecycle: ACTIVE -> SEIZED -> RELEASED, or SEIZED -> PENDING_SALE
// -> SOLD. The server checks every move and records it in the vehicle's
// history; completing a sale also forecloses the loan.

export const VEHICLE_STATUS_LABELS = {
  ACTIVE: 'Active',
  SEIZED: 'Seized',
  PENDING_SALE: 'Pending sale',
  RELEASED: 'Released',
  SOLD: 'Sold',
}

export const loadVehicles = () => apiGet('/vehicles')

export const loadVehicleEvents = (vehicleId) => apiGet(`/vehicles/${vehicleId}/events`)

const ACTION_PATHS = {
  seize: 'seize',
  release: 'release',
  pendingSale: 'pending-sale',
  completeSale: 'complete-sale',
  cancelSale: 'cancel-sale',
}

export const runVehicleAction = (vehicleId, action, details) =>
  apiPost(`/vehicles/${vehicleId}/${ACTION_PATHS[action]}`, details)
