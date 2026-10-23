/**
 * Vehicle Sale Accounting Utility
 * 
 * Synchronizes vehicle sale transactions into MotoLend's canonical accounting records:
 * 1. Income Collection (motoLendIncome_data) - records the Sale Amount as income.
 * 2. Expenses Collection (motoLendExpense_data) - records Vehicle Expenses as a business expense.
 * 
 * Guarantees:
 * - Exactly one income entry and at most one expense entry per vehicle sale.
 * - Idempotency: Re-opening or re-submitting the form updates existing records in-place without duplicate creation.
 * - Rich linkage: Associates registration number, customer name/ID, loan ID, and buyer information.
 * - Automatic real-time notification across all active views via storage events.
 */

export const syncVehicleSaleAccounting = ({
  record,
  saleDate,
  salePrice,
  vehicleExpenses,
  buyerName = '',
  buyerPhone = '',
  saleNotes = '',
}) => {
  if (!record) return;

  const vehicle = record.vehicle || {};
  const customer = record.customer || {};
  const regNo = vehicle.regNo || record.regNo || 'Unregistered';
  const cleanRegKey = regNo.replace(/[^a-zA-Z0-9]/g, '_');
  const loanId = record.loanId || '';
  const customerId = record.customerId || customer.customerId || '';
  const customerName = customer.name || record.customerName || '';
  const dateVal = saleDate ? String(saleDate).slice(0, 10) : new Date().toISOString().slice(0, 10);
  const saleAmountNum = Number(salePrice) || 0;
  const vehicleExpensesNum = Number(vehicleExpenses) || 0;

  // -------------------------------------------------------------
  // 1. Record Sale Amount as Income in motoLendIncome_data
  // -------------------------------------------------------------
  try {
    const rawIncome = localStorage.getItem('motoLendIncome_data');
    const incomeList = rawIncome ? JSON.parse(rawIncome) : [];

    // Stable deterministic ID for this vehicle's sale income
    const incomeId = `INC-SALE-${loanId || cleanRegKey}`;

    const existingIncomeIndex = incomeList.findIndex(
      (inc) =>
        inc.id === incomeId ||
        (inc.isVehicleSale && inc.loanId && inc.loanId === loanId && loanId !== '—') ||
        (inc.type === 'Vehicle Sale' && inc.regNo && inc.regNo.toLowerCase() === regNo.toLowerCase())
    );

    const incomeEntry = {
      id: incomeId,
      type: 'Vehicle Sale',
      amount: saleAmountNum,
      date: dateVal,
      mode: 'Cash',
      remarks: `Vehicle Sale – ${regNo}`,
      vehicleRegNo: regNo,
      regNo: regNo,
      loanId: loanId || '—',
      customerId: customerId || '—',
      customerName: customerName || '—',
      buyerName: buyerName ? buyerName.trim() : '',
      buyerPhone: buyerPhone ? buyerPhone.trim() : '',
      notes: saleNotes ? saleNotes.trim() : '',
      isVehicleSale: true,
      updatedAt: new Date().toISOString(),
    };

    if (existingIncomeIndex >= 0) {
      incomeList[existingIncomeIndex] = {
        ...incomeList[existingIncomeIndex],
        ...incomeEntry,
      };
    } else {
      incomeList.push(incomeEntry);
    }

    localStorage.setItem('motoLendIncome_data', JSON.stringify(incomeList));
  } catch (err) {
    console.error('Failed to sync vehicle sale income:', err);
  }

  // -------------------------------------------------------------
  // 2. Record Vehicle Expenses in motoLendExpense_data
  // -------------------------------------------------------------
  try {
    const rawExpense = localStorage.getItem('motoLendExpense_data');
    const expenseList = rawExpense ? JSON.parse(rawExpense) : [];

    // Stable deterministic ID for this vehicle's sale expense
    const expenseId = `EXP-VEH-${loanId || cleanRegKey}`;

    // Calculate previously recorded expenses for this vehicle excluding this specific sale expense entry
    const priorVehicleExpenses = expenseList
      .filter((exp) => {
        if (exp.id === expenseId || exp.isSaleVehicleExpense) return false;
        if (exp.category !== 'Vehicle Expense' && !exp.isVehicleExpense) return false;
        const matchesLoan = loanId && (exp.loanId === loanId || exp.vehicleId === loanId);
        const matchesReg = regNo && (
          (exp.vehicleRegNo && exp.vehicleRegNo.toLowerCase() === regNo.toLowerCase()) ||
          (exp.regNo && exp.regNo.toLowerCase() === regNo.toLowerCase())
        );
        return matchesLoan || matchesReg;
      })
      .reduce((sum, exp) => sum + Number(exp.amount || 0), 0);

    // Only record additional amount if the entered vehicleExpenses exceeds prior recorded expenses
    const additionalAmount = Math.max(0, vehicleExpensesNum - priorVehicleExpenses);

    const existingExpenseIndex = expenseList.findIndex(
      (exp) =>
        exp.id === expenseId ||
        (exp.isSaleVehicleExpense && exp.loanId && exp.loanId === loanId && loanId !== '—')
    );

    if (additionalAmount > 0) {
      const expenseEntry = {
        id: expenseId,
        category: 'Vehicle Expense',
        amount: additionalAmount,
        date: dateVal,
        mode: 'Cash',
        remarks: priorVehicleExpenses > 0
          ? `Vehicle Sale Additional Expenses – ${regNo}`
          : `Vehicle Expenses – ${regNo}`,
        regNo: regNo,
        vehicleRegNo: regNo,
        loanId: loanId || '—',
        customerId: customerId || '—',
        customerName: customerName || '—',
        buyerName: buyerName ? buyerName.trim() : '',
        notes: saleNotes ? saleNotes.trim() : '',
        isVehicleExpense: true,
        isSaleVehicleExpense: true,
        updatedAt: new Date().toISOString(),
      };

      if (existingExpenseIndex >= 0) {
        expenseList[existingExpenseIndex] = {
          ...expenseList[existingExpenseIndex],
          ...expenseEntry,
        };
      } else {
        expenseList.push(expenseEntry);
      }
    } else {
      // If no additional expense is needed (fully covered by existing records), remove prior sale expense entry if any
      if (existingExpenseIndex >= 0) {
        expenseList.splice(existingExpenseIndex, 1);
      }
    }

    localStorage.setItem('motoLendExpense_data', JSON.stringify(expenseList));
  } catch (err) {
    console.error('Failed to sync vehicle sale expense:', err);
  }

  // -------------------------------------------------------------
  // 3. Dispatch storage events to refresh all components & views
  // -------------------------------------------------------------
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new Event('motoLendStorageUpdate'));
  }
};
