/**
 * Utility functions for consistent income and inflow calculations across MotoLend.
 * Used by Ledger, IncomeView, and Dashboard to ensure exact parity without duplicate
 * counting, missing transactions, or incorrect inclusion of Opening Balance.
 */

/**
 * Normalizes and returns all eligible income/inflow transactions.
 * Includes:
 * - Collections (payments from motoLendPaymentHistory)
 * - Recorded income (from motoLendIncome_data: penalties, vehicle sales, doc charges, chit investments, manual entries)
 * - Investor capital (New Investment, Re-Investment from motoLendInvestors_data that are not already in motoLendIncome_data)
 *
 * Excludes:
 * - Opening Balance capital (initial capital, not operational inflow)
 * - Duplicate investor transactions tracked in both investors and income data
 */
export const getEligibleIncomeTransactions = (rawIncomeData = [], payments = [], investors = [], customers = []) => {
  // 1. Manual / Recorded Income (motoLendIncome_data)
  const manualIncomeList = (rawIncomeData || []).map(inc => ({
    id: inc.id,
    date: inc.date || new Date().toISOString(),
    displayDate: (inc.date || '').slice(0, 10),
    type: inc.type || 'Other',
    source: inc.isCapital || inc.type === 'Investment' ? 'investor' : 'manual',
    amount: Number(inc.amount || 0),
    displayAmount: Number(inc.amount || 0),
    customerName: inc.customerName,
    customerId: inc.customerId,
    investorName: inc.investorName,
    investorId: inc.investorId,
    loanId: inc.loanId,
    remarks: inc.remarks,
    mode: inc.mode || 'Cash',
    isCapital: inc.isCapital || inc.type === 'Chit Investment' || inc.type === 'Investment',
    transactionId: inc.transactionId
  }));

  // 2. Collection Payments (motoLendPaymentHistory)
  const collectionList = (payments || []).map(p => {
    const cust = (customers || []).find(c => c.customerId === p.customerId || c.loanId === p.loanId);
    const cName = cust?.customer?.name || cust?.name || 'Unknown Customer';
    const rawAmt = Number(p.amount || 0);

    const hasStoredBreakdown = (p.principal !== undefined && p.principal !== null) || (p.interest !== undefined && p.interest !== null);
    const principal = hasStoredBreakdown ? Number(p.principal || 0) : null;
    const interest = hasStoredBreakdown ? Number(p.interest || 0) : null;

    return {
      id: p.id,
      date: p.date,
      displayDate: (p.date || '').slice(0, 10),
      type: 'Collection',
      source: 'collection',
      amount: rawAmt,
      displayAmount: rawAmt,
      principal,
      interest,
      hasBreakdown: hasStoredBreakdown,
      mode: p.mode || p.paymentMode || 'Cash',
      customerId: p.customerId,
      customerName: cName,
      loanId: p.loanId,
      installmentRef: p.installmentNumber ? `Installment #${p.installmentNumber}` : (p.remarks || 'EMI Collection'),
      frequency: cust?.loan?.paymentFrequency || cust?.paymentFrequency || '',
      remarks: p.remarks || 'EMI Collection'
    };
  });

  // 3. Unlinked Investor Capital Transactions (New Investment & Re-Investment ONLY)
  // Opening Balance is explicitly EXCLUDED from inflow / Money In
  const investmentList = [];
  (investors || []).forEach(inv => {
    if (inv.transactions && Array.isArray(inv.transactions)) {
      inv.transactions.forEach(tx => {
        if (tx.type === 'New Investment' || tx.type === 'Re-Investment') {
          // Avoid duplicate if already tracked in rawIncomeData with matching ID or details
          const alreadyInIncome = (rawIncomeData || []).some(inc =>
            (inc.transactionId && inc.transactionId === tx.id) ||
            (tx.incomeId && tx.incomeId === inc.id) ||
            (inc.type === 'Investment' && inc.investorId === inv.id && Number(inc.amount) === Number(tx.amount) && (inc.date || '').slice(0, 10) === (tx.date || '').slice(0, 10))
          );
          if (!alreadyInIncome) {
            const txAmount = Number(tx.amount || 0);
            investmentList.push({
              id: tx.id || `INV-${inv.id}-${tx.date}`,
              date: tx.date || new Date().toISOString(),
              displayDate: (tx.date || '').slice(0, 10),
              type: 'Investment',
              source: 'investor',
              subType: tx.type,
              amount: txAmount,
              displayAmount: txAmount,
              investorId: inv.id,
              investorName: inv.name,
              mode: tx.transferMode || tx.paymentMode || 'Bank Transfer',
              remarks: `${tx.type} received from ${inv.name}`,
              isCapital: true
            });
          }
        }
      });
    }
  });

  // Combine and sort chronologically (newest first)
  return [
    ...manualIncomeList,
    ...collectionList,
    ...investmentList
  ].sort((a, b) => new Date(b.date) - new Date(a.date));
};

/**
 * Calculates the total incoming funds across all income sources exactly once.
 * Ensures Total Inflow (Income page) and Money In (Ledger page) remain identical.
 */
export const calculateTotalInflow = (rawIncomeData = [], payments = [], investors = [], customers = []) => {
  const allIncome = getEligibleIncomeTransactions(rawIncomeData, payments, investors, customers);
  return allIncome.reduce((sum, item) => sum + item.displayAmount, 0);
};
