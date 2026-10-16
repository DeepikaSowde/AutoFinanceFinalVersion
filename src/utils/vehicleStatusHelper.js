/**
 * Helper utility for determining and managing vehicle status in MotoLend.
 *
 * Rules:
 * - If a loan is Closed or Midway Closed, associated vehicle status is 'Inactive',
 *   UNLESS the vehicle was Seized or Sold (existing physical states preserved).
 * - For active loans, preserves Seized, Released, Active.
 */

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

  // Check if loan is Closed or Midway Closed
  const loanStatus = (customerOrLoan.status || customerOrLoan.loanStatus || '').toString().trim();
  const isMidwayClosed = customerOrLoan.isMidwayClosed === true || loanStatus.toLowerCase() === 'midway closed';
  const isClosed = isMidwayClosed || loanStatus.toLowerCase() === 'closed';

  if (isClosed) {
    return 'Inactive';
  }

  // If vehicle was marked Released or Active
  if (rawStatus.toLowerCase() === 'released') return 'Released';
  if (rawStatus.toLowerCase() === 'inactive') return 'Inactive';

  return rawStatus || 'Active';
};

/**
 * Syncs the local storage customer records to ensure that any Closed or Midway Closed
 * loans have their associated vehicleStatus and vehicle.status set to Inactive
 * (without unintentionally overwriting Seized or Sold).
 *
 * Returns updated array if changes were made, or the original array.
 */
export const syncVehiclesWithClosedLoans = (records) => {
  if (!Array.isArray(records)) return records;

  let hasChanged = false;

  const updatedRecords = records.map((record) => {
    if (!record) return record;

    const loanStatus = (record.status || record.loanStatus || '').toString().trim();
    const isMidwayClosed = record.isMidwayClosed === true || loanStatus.toLowerCase() === 'midway closed';
    const isClosed = isMidwayClosed || loanStatus.toLowerCase() === 'closed';

    if (isClosed) {
      const currentVehicleStatus = (record.vehicleStatus || (record.vehicle && record.vehicle.status) || '').toString().trim();
      // Do not overwrite Seized or Sold
      if (currentVehicleStatus.toLowerCase() !== 'seized' && currentVehicleStatus.toLowerCase() !== 'sold') {
        if (record.vehicleStatus !== 'Inactive' || (record.vehicle && record.vehicle.status !== 'Inactive')) {
          hasChanged = true;
          return {
            ...record,
            vehicleStatus: 'Inactive',
            vehicle: record.vehicle
              ? { ...record.vehicle, status: 'Inactive' }
              : { status: 'Inactive' },
          };
        }
      }
    }

    return record;
  });

  if (hasChanged) {
    try {
      localStorage.setItem('motoLendCustomersList_data', JSON.stringify(updatedRecords));
      window.dispatchEvent(new Event('customersDataUpdated'));
    } catch (e) {
      console.error('Failed to persist vehicle status updates to localStorage', e);
    }
    return updatedRecords;
  }

  return records;
};
