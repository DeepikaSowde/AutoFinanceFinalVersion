/**
 * Helper utility for determining vehicle status in MotoLend.
 *
 * Rules:
 * - If a loan is Closed, Foreclosed or Midway Closed, its vehicle shows as
 *   'Inactive', UNLESS the vehicle was Seized or Sold (physical states kept).
 * - For active loans, the stored status stands (Active, Seized, Released...).
 *
 * "Inactive" is derived from the loan's status on the server, never stored,
 * so reversing a closure brings the vehicle back to its real status.
 */

const CLOSED_LOAN_STATUSES = ['closed', 'foreclosed', 'midway closed'];

const isClosedLoan = (record) => {
  const loanStatus = (record.status || record.loanStatus || record.loan?.status || '').toString().trim().toLowerCase();
  return record.isMidwayClosed === true || CLOSED_LOAN_STATUSES.includes(loanStatus);
};

export const getEffectiveVehicleStatus = (customerOrLoan) => {
  if (!customerOrLoan) return 'Active';

  const rawStatus = (
    customerOrLoan.vehicleStatus ||
    (customerOrLoan.vehicle && customerOrLoan.vehicle.status) ||
    'Active'
  ).toString().trim();

  // Seized and Sold take precedence because they represent distinct physical inventory/legal states
  if (rawStatus.toLowerCase() === 'seized') return 'Seized';
  if (rawStatus.toLowerCase() === 'sold') return 'Sold';

  if (isClosedLoan(customerOrLoan)) {
    return 'Inactive';
  }

  // If vehicle was marked Released or Active
  if (rawStatus.toLowerCase() === 'released') return 'Released';
  if (rawStatus.toLowerCase() === 'inactive') return 'Inactive';

  return rawStatus || 'Active';
};

/**
 * Returns the records with every closed loan's vehicle shown as Inactive
 * (Seized and Sold are left alone). Pure: nothing is saved — the loan status
 * on the server is the source of truth.
 */
export const syncVehiclesWithClosedLoans = (records) => {
  if (!Array.isArray(records)) return records;

  return records.map((record) => {
    if (!record || !isClosedLoan(record)) return record;

    const currentVehicleStatus = (record.vehicleStatus || (record.vehicle && record.vehicle.status) || '').toString().trim().toLowerCase();
    if (currentVehicleStatus === 'seized' || currentVehicleStatus === 'sold') return record;

    return {
      ...record,
      vehicleStatus: 'Inactive',
      vehicle: record.vehicle ? { ...record.vehicle, status: 'Inactive' } : { status: 'Inactive' },
    };
  });
};
