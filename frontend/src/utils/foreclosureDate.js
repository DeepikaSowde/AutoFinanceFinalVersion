// The Foreclosure Date shown for a loan: when the foreclosure was completed
// (recorded with the vehicle sale). The Sale Date typed on the sale is a
// separate figure; it is used only for a record with no completion time.
export const foreclosureDateOf = (record) =>
  record?.foreclosure?.foreclosedAt ||
  record?.foreclosure?.saleDate ||
  record?.vehicle?.saleDetails?.saleDate ||
  record?.saleDetails?.saleDate ||
  record?.foreclosure?.completedAt ||
  record?.foreclosedDate ||
  record?.foreclosureDate ||
  record?.closedDate ||
  ''
