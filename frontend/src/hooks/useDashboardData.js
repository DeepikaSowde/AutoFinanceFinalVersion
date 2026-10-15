import { useState, useEffect } from 'react';
import { DATA_CHANGED_EVENT, apiGet } from '../services/api';
import { loadLedgerData } from '../services/ledgerApi';
import { calculateLoanOutstanding, calculateTotalPortfolioOutstanding } from '../utils/loanCalculations.js';
import { calculateVehicleLoanOverdue } from '../utils/vehicleOverdueCalculation.js';

export const useDashboardData = () => {
  const [data, setData] = useState({
    totalOutstanding: 0,
    totalCredit: 0,
    totalDebit: 0,
    interestEarned: 0,
    closingBalance: 0,
    monthlyData: [],
    incomeBreakdown: [],
    expenseBreakdown: [],
    capitalData: null,
    chitData: null,
    outstandingOverview: null,
    repaymentVsInterest: [],
    operational: null
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const fetchData = async () => {
      try {
        const { customers, payments, investors, incomeData, expenseData, vehicleSales } = await loadLedgerData();
        if (!active) return;

        const today = new Date();
        const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
        const formatMonth = (date) => date.toLocaleString('default', { month: 'short' });
        const formatDate = (value) => {
          if (!value) return '—';
          const date = new Date(value);
          return Number.isNaN(date.getTime())
            ? '—'
            : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        };
        const customerKey = (record) =>
          String(record.customerId || record.customer?.customerId || record.customer?.mobile || '').trim().toLowerCase();
        const loanCalculations = customers.map((record) => ({
          record,
          calculation: calculateLoanOutstanding(record, payments),
          overdue: calculateVehicleLoanOverdue(record, payments),
        }));
        const expectedByMonth = {};
        const collectedByMonth = {};
        loanCalculations.forEach(({ calculation }) => {
          calculation.effectiveSchedule.forEach((installment) => {
            const dueDate = new Date(installment.dueDate);
            if (Number.isNaN(dueDate.getTime()) || dueDate.getTime() > dayStart) return;
            const month = `${formatMonth(dueDate)}-${String(dueDate.getFullYear()).slice(-2)}`;
            expectedByMonth[month] = (expectedByMonth[month] || 0) + Number(installment.emi || 0);
            collectedByMonth[month] = (collectedByMonth[month] || 0) + Number(installment.amountPaid || 0);
          });
        });
        const collectionTrend = Object.keys(expectedByMonth).map((name) => ({
          name,
          expected: expectedByMonth[name],
          collected: collectedByMonth[name] || 0,
        }));
        const expectedCollections = collectionTrend.reduce((sum, item) => sum + item.expected, 0);
        const collectedCollections = collectionTrend.reduce((sum, item) => sum + item.collected, 0);
        const paymentModeTotals = payments.reduce((totals, payment) => {
          if (Number(payment.amount || 0) <= 0) return totals;
          const rawMode = payment.paymentMode || payment.mode || payment.transferMode || 'Cash';
          const mode = String(rawMode).toLowerCase();
          const key = mode.includes('upi') ? 'upi' : mode.includes('bank') || mode.includes('transfer') ? 'bankTransfer' : 'cash';
          totals[key] += Number(payment.amount || 0);
          return totals;
        }, { cash: 0, upi: 0, bankTransfer: 0 });
        const loanStatuses = loanCalculations.map(({ record, calculation, overdue }) => {
          const rawStatus = String(record.status || record.loan?.status || '').toLowerCase();
          const vehicleStatus = String(record.vehicleStatus || record.vehicle?.status || '').toLowerCase();
          const status = rawStatus === 'foreclosed'
            ? 'Closed'
            : rawStatus === 'closed' || calculation.outstandingAmount <= 0.01
            ? 'Closed'
            : overdue.hasOverdue
            ? 'Overdue'
            : 'Active';
          return { record, calculation, overdue, status, vehicleStatus };
        });
        const seenCustomers = new Set();
        let reloanCount = 0;
        loanStatuses.forEach(({ record }) => {
          const key = customerKey(record);
          if (key && seenCustomers.has(key)) reloanCount += 1;
          if (key) seenCustomers.add(key);
        });
        const overdueLoans = loanStatuses
          .filter(({ overdue }) => overdue.hasOverdue)
          .map(({ record, overdue }) => ({
            id: record.loanId || record.customerId || record.customer?.mobile,
            customerName: record.customer?.name || 'Unknown Customer',
            mobile: record.customer?.mobile || '—',
            overdueCount: overdue.overdueCount,
            overdueAmount: overdue.overdueAmount,
            nextDueDate: overdue.overdueInstallments[0]?.dueDate,
          }))
          .sort((a, b) => b.overdueAmount - a.overdueAmount);
        const totalMoneyMovement = paymentModeTotals.cash + paymentModeTotals.upi + paymentModeTotals.bankTransfer;

        let totalDisbursed = 0;
        let totalRepaid = 0;

        customers.forEach(cust => {
            totalDisbursed += Number(cust.loanAmount || 0);
        });

        payments.forEach(pay => {
            totalRepaid += Number(pay.amount || 0);
        });

        // Calculate Total Outstanding across all loans (Remaining Principal + Remaining Interest)
        const portfolio = calculateTotalPortfolioOutstanding(customers, payments);
        const totalOutstanding = portfolio.totalOutstanding;
        const interestEarned = payments.reduce((sum, pay) => sum + Number(pay.interest || 0), 0);

        let totalIncome = 0;
        incomeData.forEach(inc => totalIncome += Number(inc.amount || 0));
        // Net proceeds from sold repossessed vehicles count as money in.
        const vehicleSaleProceeds = vehicleSales.reduce((sum, sale) => sum + Number(sale.amount || 0), 0);

        let totalExpense = 0;
        expenseData.forEach(exp => {
            if (exp.category !== 'Investor Withdrawal') {
                totalExpense += Number(exp.amount || 0);
            }
        });
        
        let totalOpeningBalance = 0;
        let investorMoneyIn = 0;
        let investorMoneyOut = 0;

        investors.forEach(inv => {
            const openingTx = inv.transactions?.find(t => t.type === "Opening Balance");
            totalOpeningBalance += Number(openingTx?.amount || 0);

            if (inv.transactions) {
                inv.transactions.forEach(tx => {
                    if (tx.type === "New Investment" || tx.type === "Re-Investment") investorMoneyIn += Number(tx.amount || 0);
                    if (tx.type === "Debit") investorMoneyOut += Number(tx.amount || 0);
                });
            }
        });

        // Account for any unlinked investor withdrawals in expenseData
        expenseData.forEach(exp => {
            if (exp.category === 'Investor Withdrawal') {
                const isLinked = investors.some(inv => inv.transactions?.some(t => t.id === exp.transactionId || t.expenseId === exp.id));
                if (!isLinked) {
                    investorMoneyOut += Number(exp.amount || 0);
                }
            }
        });

        // Credit: Repayments + Manual Income + Investor Capital (New Investment + Re-Investment) + Opening Balance
        const totalCredit = totalOpeningBalance + investorMoneyIn + totalRepaid + totalIncome + vehicleSaleProceeds;

        // Debit: Disbursed Loans + Manual Expenses + Investor Withdrawals
        const totalDebit = totalDisbursed + totalExpense + investorMoneyOut;

        const closingBalance = totalCredit - totalDebit;

        // Group Monthly Data
        const monthlyMap = {};
        
        const processDate = (dateStr, amount, type) => {
            if (!dateStr) return;
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return;
            const monthYear = `${date.toLocaleString('default', { month: 'short' })}-${date.getFullYear().toString().slice(-2)}`;
            if (!monthlyMap[monthYear]) {
                monthlyMap[monthYear] = { name: monthYear, Debit: 0, Credit: 0 };
            }
            if (type === 'credit') monthlyMap[monthYear].Credit += Number(amount);
            if (type === 'debit') monthlyMap[monthYear].Debit += Number(amount);
        };

        customers.forEach(cust => {
            const loanAmount = Number(cust.loanAmount || 0);
            processDate(cust.customer?.applicationDate, loanAmount, 'debit');
        });
        expenseData.forEach(exp => {
            if (exp.category !== 'Investor Withdrawal') {
                processDate(exp.date, exp.amount, 'debit');
            }
        });
        payments.forEach(pay => processDate(pay.date, pay.amount, 'credit'));
        incomeData.forEach(inc => processDate(inc.date, inc.amount, 'credit'));
        vehicleSales.forEach(sale => processDate(sale.date, sale.amount, 'credit'));
        investors.forEach(inv => {
            if (inv.transactions) {
                inv.transactions.forEach(tx => {
                    if (tx.type === 'Opening Balance' || tx.type === "New Investment" || tx.type === "Re-Investment") processDate(tx.date, tx.amount, 'credit');
                    if (tx.type === 'Debit') processDate(tx.date, tx.amount, 'debit');
                });
            }
        });
        // Process any unlinked investor withdrawals for monthly map
        expenseData.forEach(exp => {
            if (exp.category === 'Investor Withdrawal') {
                const isLinked = investors.some(inv => inv.transactions?.some(t => t.id === exp.transactionId || t.expenseId === exp.id));
                if (!isLinked) {
                    processDate(exp.date, exp.amount, 'debit');
                }
            }
        });

        const monthlyData = Object.values(monthlyMap);

        // Income Breakdown
        const incomeBreakdownMap = {
            'Repayment': totalRepaid,
            'Vehicle Sales': vehicleSaleProceeds,
        };
        incomeData.forEach(inc => {
            const type = inc.type || 'Other';
            incomeBreakdownMap[type] = (incomeBreakdownMap[type] || 0) + Number(inc.amount || 0);
        });

        const incomeBreakdown = Object.entries(incomeBreakdownMap)
            .filter(([, value]) => value > 0)
            .map(([name, value]) => ({ name, value }));

        // Expense Breakdown
        const expenseBreakdownMap = {
            'Loan Amount Given': totalDisbursed,
        };
        expenseData.forEach(exp => {
            const cat = exp.category || 'Other';
            expenseBreakdownMap[cat] = (expenseBreakdownMap[cat] || 0) + Number(exp.amount || 0);
        });

        const expenseBreakdown = Object.entries(expenseBreakdownMap)
            .filter(([, value]) => value > 0)
            .map(([name, value]) => ({ name, value }));

        // Capital Position
        const investorCapital = totalOpeningBalance + investorMoneyIn - investorMoneyOut;
        const capitalData = {
            totalCapital: investorCapital,
            openingCapital: totalOpeningBalance,
            deployed: totalDisbursed,
            available: investorCapital - totalDisbursed > 0 ? investorCapital - totalDisbursed : 0,
            closingBalance: closingBalance
        };

        // Chit Data for Dashboard ChitOverviewCard
        let chitData = null;
        try {
          // Chit transactions from the API; someone without income/expense
          // access just gets no chit card figures.
          const chitTxs = await apiGet('/chits/transactions').catch(() => []);
          const chitPaid = chitTxs
            .filter((t) => t.type === "Chit Paid" || t.category === "Expense")
            .reduce((sum, t) => sum + Number(t.amount || 0), 0);
          const chitInward = chitTxs
            .filter((t) => t.type === "Chit Income" || t.category === "Income")
            .reduce((sum, t) => sum + Number(t.amount || 0), 0);
          
          if (chitTxs.length > 0 || chitPaid > 0 || chitInward > 0) {
            chitData = {
              paid: chitPaid,
              amount: chitPaid + chitInward,
              investment: chitPaid,
              inward: chitInward
            };
          }
        } catch {
          chitData = null;
        }

        setData({
            totalOutstanding,
            totalCredit,
            totalDebit,
            interestEarned,
            closingBalance,
            monthlyData,
            incomeBreakdown,
            expenseBreakdown,
            capitalData,
            chitData,
            outstandingOverview: {
                totalOutstanding,
                debit: totalDebit,
                credit: totalCredit,
                balance: closingBalance
            },
            repaymentVsInterest: [], // No pure interest data
            operational: {
              keyMetrics: {
                totalLoans: customers.length,
                activeCustomers: new Set(customers.map(customerKey).filter(Boolean)).size,
                totalOutstanding,
                overdueAmount: overdueLoans.reduce((sum, loan) => sum + loan.overdueAmount, 0),
              },
              loanActivity: {
                newLoans: Math.max(customers.length - reloanCount, 0),
                reLoans: reloanCount,
              },
              collection: {
                trend: collectionTrend,
                expected: expectedCollections,
                collected: collectedCollections,
                achievement: expectedCollections > 0 ? (collectedCollections / expectedCollections) * 100 : 0,
              },
              moneyMovement: { ...paymentModeTotals, total: totalMoneyMovement },
              portfolio: {
                active: loanStatuses.filter(({ status }) => status === 'Active').length,
                overdue: loanStatuses.filter(({ status }) => status === 'Overdue').length,
                closed: loanStatuses.filter(({ status }) => status === 'Closed').length,
                seized: loanStatuses.filter(({ vehicleStatus }) => vehicleStatus === 'seized').length,
              },
              overdueLoans: overdueLoans.map((loan) => ({ ...loan, nextDueDate: formatDate(loan.nextDueDate) })),
              // The loans and payments these figures came from (API), for the
              // Operational Dashboard's own breakdowns.
              records: customers,
              payments,
            }
        });

      } catch (error) {
        console.error("Error calculating dashboard data:", error);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchData();
    window.addEventListener(DATA_CHANGED_EVENT, fetchData);

    return () => {
      active = false;
      window.removeEventListener(DATA_CHANGED_EVENT, fetchData);
    };
  }, []);

  return { data, loading };
};
