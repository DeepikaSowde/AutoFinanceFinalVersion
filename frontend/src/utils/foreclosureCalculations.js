/**
 * Foreclosure & Vehicle Sale calculations now live on the server
 * (backend/src/services/foreclosureRepository.js):
 *
 *   Total Foreclosure Cost = Outstanding Principal + Unpaid Interest
 *                          + Enabled Vehicle Expenses
 *                          + Enabled Seized-Period Interest
 *                          + Enabled Applicable Penalty
 *   Profit/Loss            = Vehicle Sale Amount − Total Foreclosure Cost
 *
 * The Mark as Sold form asks for it with vehicleApi.previewForeclosure; the
 * sale saves it as record.foreclosure.finalizedCalculation, in the shape this
 * module used to return. Settlement decisions go through
 * vehicleApi.settleVehicleSale, which books the payout expense / shortfall
 * recovery income itself.
 */

// Kept so older callers still work: the server books the settlement's
// income / expense when the decision is saved, so there is nothing to sync.
export const syncForeclosureSettlementAccounting = () => {};
