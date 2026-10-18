import { useState, useEffect } from 'react';
import { DATA_CHANGED_EVENT, apiGet } from '../services/api';
import { loadLedgerData } from '../services/ledgerApi';
import { calculateLoanOutstanding, calculateTotalPortfolioOutstanding, isEligiblePayment } from '../utils/loanCalculations.js';
import { calculateVehicleLoanOverdue } from '../utils/vehicleOverdueCalculation.js';
import { formatDate, getLocalDateString } from '../utils/dateUtils.js';
import { matchesDashboardDate, rememberDashboardData } from '../components/dashboard/MonthYearFilter.jsx';

export const useDashboardData = (filterParam = { filterType: 'all' }) => {
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
        const dateFilter = filterParam?.filterType ? filterParam : (filterParam?.dateFilter || {
          filterType: (filterParam?.selectedMonth && filterParam.selectedMonth !== 'All') || (filterParam?.selectedYear && filterParam.selectedYear !== 'All') ? 'month' : 'all',
          selectedMonth: filterParam?.selectedMonth || 'All',
          selectedYear: filterParam?.selectedYear || 'All',
        });

        // Loans, payments, investors, income, expenses and vehicle sales from the API.
        const { customers, payments, investors, incomeData, expenseData, vehicleSales } = await loadLedgerData();
        if (!active) return;
        rememberDashboardData({ customers, payments, investors, incomeData, expenseData, vehicleSales });

        const isFilterActive = dateFilter && dateFilter.filterType !== 'all';
        const matchesDate = (dateStr) => matchesDashboardDate(dateStr, dateFilter);

        const today = new Date();
        const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
        const formatMonth = (date) => date.toLocaleString('default', { month: 'short' });
        const customerKey = (record) =>
          String(record.customerId || record.customer?.customerId || record.customer?.mobile || '').trim().toLowerCase();

        // 1. Filtered or full customers list
        const disbursedCustomers = customers.filter(cust => {
          const loanDate = cust.customer?.applicationDate || cust.loan?.applicationDate || cust.createdAt || cust.date;
          return matchesDate(loanDate);
        });

        const activeCustomersList = isFilterActive ? disbursedCustomers : customers;

        // 2. Filtered or full payments list
        const filteredPayments = payments.filter(pay => matchesDate(pay.date || pay.createdAt));
        const targetPayments = isFilterActive ? filteredPayments : payments;

        // 3. Filtered or full income list
        const filteredIncome = incomeData.filter(inc => matchesDate(inc.date));
        const targetIncome = isFilterActive ? filteredIncome : incomeData;

        // 4. Filtered or full expense list
        const filteredExpenses = expenseData.filter(exp => matchesDate(exp.date));
        const targetExpenses = isFilterActive ? filteredExpenses : expenseData;

        // 5. Sold repossessed vehicles (net proceeds count as money in)
        const targetVehicleSales = isFilterActive ? vehicleSales.filter(sale => matchesDate(sale.date)) : vehicleSales;
        const vehicleSaleProceeds = targetVehicleSales.reduce((sum, sale) => sum + Number(sale.amount || 0), 0);

        // Loan calculations
        const loanCalculations = activeCustomersList.map((record) => ({
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
            if (isFilterActive && !matchesDate(installment.dueDate)) return;
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

        // Payment mode totals (based on targetPayments for the filtered period)
        const paymentModeTotals = targetPayments.reduce((totals, payment) => {
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

        // Disbursed & Repaid
        let totalDisbursed = 0;
        let totalRepaid = 0;

        activeCustomersList.forEach(cust => {
          totalDisbursed += Number(cust.loanAmount || 0);
        });

        targetPayments.forEach(pay => {
          totalRepaid += Number(pay.amount || 0);
        });

        // Portfolio Outstanding
        // A balance, so every payment on these loans counts, not only the period's.
        const portfolio = calculateTotalPortfolioOutstanding(activeCustomersList, payments);
        const totalOutstanding = portfolio.totalOutstanding;

        // Total Income & Expense
        let totalIncome = 0;
        targetIncome.forEach(inc => totalIncome += Number(inc.amount || 0));

        let totalExpense = 0;
        targetExpenses.forEach(exp => {
          if (exp.category !== 'Investor Withdrawal') {
            totalExpense += Number(exp.amount || 0);
          }
        });

        // Investor Transactions
        let totalOpeningBalance = 0;
        let investorMoneyIn = 0;
        let investorMoneyOut = 0;

        investors.forEach(inv => {
          const openingTx = inv.transactions?.find(t => t.type === "Opening Balance");
          if (openingTx && (!isFilterActive || matchesDate(openingTx.date))) {
            totalOpeningBalance += Number(openingTx.amount || 0);
          }

          if (inv.transactions) {
            inv.transactions.forEach(tx => {
              if (!isFilterActive || matchesDate(tx.date)) {
                if (tx.type === "New Investment" || tx.type === "Re-Investment") investorMoneyIn += Number(tx.amount || 0);
                if (tx.type === "Debit") investorMoneyOut += Number(tx.amount || 0);
              }
            });
          }
        });

        // Account for any unlinked investor withdrawals in targetExpenses
        targetExpenses.forEach(exp => {
          if (exp.category === 'Investor Withdrawal') {
            const isLinked = investors.some(inv => inv.transactions?.some(t => t.id === exp.transactionId || t.expenseId === exp.id));
            if (!isLinked) {
              investorMoneyOut += Number(exp.amount || 0);
            }
          }
        });

        // Total Credit: Repayments + Manual Income + Investor Capital + Opening Balance + Vehicle Sales
        const totalCredit = totalOpeningBalance + investorMoneyIn + totalRepaid + totalIncome + vehicleSaleProceeds;

        // Total Debit: Disbursed Loans + Manual Expenses + Investor Withdrawals
        const totalDebit = totalDisbursed + totalExpense + investorMoneyOut;

        // Closing Balance and Capital Position are positions (cash on hand,
        // capital in), so under a date filter they count everything up to
        // the end of the period, not only the period's movement. Total
        // Credit / Debit above stay the period's movement.
        const periodEnd = isFilterActive ? dateFilter.endDate || null : null;
        const upToEnd = (dateStr) => {
          if (!periodEnd) return true;
          const day = getLocalDateString(dateStr);
          return Boolean(day) && day <= periodEnd;
        };
        const loanDateOf = (cust) => cust.customer?.applicationDate || cust.loan?.applicationDate || cust.createdAt || cust.date;
        const sumUpToEnd = (list, dateOf, amountOf = (item) => item.amount, keep = () => true) =>
          list.reduce((sum, item) => (keep(item) && upToEnd(dateOf(item)) ? sum + Number(amountOf(item) || 0) : sum), 0);
        const isLinkedWithdrawal = (exp) =>
          investors.some((inv) => inv.transactions?.some((t) => t.id === exp.transactionId || t.expenseId === exp.id));
        const investorTxs = investors.flatMap((inv) => inv.transactions || []);

        const positionOpening = sumUpToEnd(investorTxs, (t) => t.date, undefined, (t) => t.type === "Opening Balance");
        const positionInvestIn = sumUpToEnd(investorTxs, (t) => t.date, undefined, (t) => t.type === "New Investment" || t.type === "Re-Investment");
        const positionInvestOut =
          sumUpToEnd(investorTxs, (t) => t.date, undefined, (t) => t.type === "Debit") +
          sumUpToEnd(expenseData, (e) => e.date, undefined, (e) => e.category === "Investor Withdrawal" && !isLinkedWithdrawal(e));
        const positionDisbursed = sumUpToEnd(customers, loanDateOf, (c) => c.loanAmount);
        const positionCredit =
          positionOpening + positionInvestIn +
          sumUpToEnd(payments, (p) => p.date || p.createdAt) +
          sumUpToEnd(incomeData, (i) => i.date) +
          sumUpToEnd(vehicleSales, (v) => v.date);
        const positionDebit =
          positionDisbursed + positionInvestOut +
          sumUpToEnd(expenseData, (e) => e.date, undefined, (e) => e.category !== "Investor Withdrawal");

        const closingBalance = positionCredit - positionDebit;

        // Group Monthly Data
        const monthlyMap = {};
        const processDate = (dateStr, amount, type) => {
          if (!dateStr) return;
          if (isFilterActive && !matchesDate(dateStr)) return;
          const date = new Date(dateStr);
          if (isNaN(date.getTime())) return;
          const monthYear = `${date.toLocaleString('default', { month: 'short' })}-${date.getFullYear().toString().slice(-2)}`;
          if (!monthlyMap[monthYear]) {
            monthlyMap[monthYear] = {
              name: monthYear,
              Debit: 0,
              Credit: 0,
              sortTime: new Date(date.getFullYear(), date.getMonth(), 1).getTime()
            };
          }
          if (type === 'credit') monthlyMap[monthYear].Credit += Number(amount);
          if (type === 'debit') monthlyMap[monthYear].Debit += Number(amount);
        };

        activeCustomersList.forEach(cust => {
          const loanAmount = Number(cust.loanAmount || 0);
          processDate(cust.customer?.applicationDate || cust.loan?.applicationDate || cust.createdAt || cust.date, loanAmount, 'debit');
        });
        targetExpenses.forEach(exp => {
          if (exp.category !== 'Investor Withdrawal') {
            processDate(exp.date, exp.amount, 'debit');
          }
        });
        targetPayments.forEach(pay => processDate(pay.date, pay.amount, 'credit'));
        targetIncome.forEach(inc => processDate(inc.date, inc.amount, 'credit'));
        targetVehicleSales.forEach(sale => processDate(sale.date, sale.amount, 'credit'));
        investors.forEach(inv => {
          if (inv.transactions) {
            inv.transactions.forEach(tx => {
              if (!isFilterActive || matchesDate(tx.date)) {
                if (tx.type === 'Opening Balance' || tx.type === "New Investment" || tx.type === "Re-Investment") processDate(tx.date, tx.amount, 'credit');
                if (tx.type === 'Debit') processDate(tx.date, tx.amount, 'debit');
              }
            });
          }
        });
        targetExpenses.forEach(exp => {
          if (exp.category === 'Investor Withdrawal') {
            const isLinked = investors.some(inv => inv.transactions?.some(t => t.id === exp.transactionId || t.expenseId === exp.id));
            if (!isLinked) {
              processDate(exp.date, exp.amount, 'debit');
            }
          }
        });

        const monthlyData = Object.values(monthlyMap).sort((a, b) => a.sortTime - b.sortTime);

        // Income Breakdown
        const incomeBreakdownMap = {
          'Repayment': totalRepaid,
          'Vehicle Sales': vehicleSaleProceeds,
        };
        targetIncome.forEach(inc => {
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
        targetExpenses.forEach(exp => {
          const cat = exp.category || 'Other';
          expenseBreakdownMap[cat] = (expenseBreakdownMap[cat] || 0) + Number(exp.amount || 0);
        });

        const expenseBreakdown = Object.entries(expenseBreakdownMap)
          .filter(([, value]) => value > 0)
          .map(([name, value]) => ({ name, value }));

        // Capital Position
        const investorCapital = positionOpening + positionInvestIn - positionInvestOut;
        const capitalData = {
          totalCapital: investorCapital,
          openingCapital: positionOpening,
          deployed: positionDisbursed,
          available: investorCapital - positionDisbursed > 0 ? investorCapital - positionDisbursed : 0,
          closingBalance: closingBalance
        };

        // Chit Data for Dashboard ChitOverviewCard
        let chitData = null;
        try {
          // Chit transactions from the API; someone without income/expense
          // access just gets no chit card figures.
          const rawChitTxs = await apiGet('/chits/transactions').catch(() => []);
          const chitTxs = isFilterActive ? rawChitTxs.filter(t => matchesDate(t.date)) : rawChitTxs;
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

        // Calculate Actual Recorded Interest Earned
        const eligiblePayments = (targetPayments || []).filter(isEligiblePayment);
        const loansWithRecordedPayments = new Set();
        eligiblePayments.forEach((p) => {
          if (p.loanId) loansWithRecordedPayments.add(String(p.loanId).trim().toLowerCase());
          if (p.customerId) loansWithRecordedPayments.add(String(p.customerId).trim().toLowerCase());
        });

        const interestFromPayments = eligiblePayments.reduce((sum, p) => {
          if (p.interest !== undefined && p.interest !== null) {
            return sum + Number(p.interest || 0);
          }
          if (Array.isArray(p.allocations) && p.allocations.length > 0) {
            return sum + p.allocations.reduce((aSum, a) => aSum + Number(a.interestPaid || 0), 0);
          }
          return sum;
        }, 0);

        let interestFromSchedulesOnly = 0;
        activeCustomersList.forEach((cust) => {
          const lId = String(cust.loanId || '').trim().toLowerCase();
          const cId = String(cust.customerId || '').trim().toLowerCase();
          const hasRecordedPayment =
            (lId && loansWithRecordedPayments.has(lId)) ||
            (cId && loansWithRecordedPayments.has(cId));

          if (!hasRecordedPayment && Array.isArray(cust.repaymentSchedule)) {
            cust.repaymentSchedule.forEach((inst) => {
              if (!isFilterActive || matchesDate(inst.dueDate)) {
                interestFromSchedulesOnly += Number(inst.interestPaid || 0);
              }
            });
          }
        });

        const totalInterestEarned = Math.round((interestFromPayments + interestFromSchedulesOnly) * 100) / 100;

        setData({
          totalOutstanding,
          totalCredit,
          totalDebit,
          interestEarned: totalInterestEarned,
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
          repaymentVsInterest: [],
          operational: {
            keyMetrics: {
              totalLoans: activeCustomersList.length,
              activeCustomers: new Set(activeCustomersList.map(customerKey).filter(Boolean)).size,
              totalOutstanding,
              overdueAmount: overdueLoans.reduce((sum, loan) => sum + loan.overdueAmount, 0),
            },
            loanActivity: {
              newLoans: Math.max(activeCustomersList.length - reloanCount, 0),
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
            // All loans and payments (API), for the Operational Dashboard,
            // which applies the date filter itself.
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
    // Reload after any save anywhere in the app.
    window.addEventListener(DATA_CHANGED_EVENT, fetchData);
    return () => {
      active = false;
      window.removeEventListener(DATA_CHANGED_EVENT, fetchData);
    };
  }, [
    filterParam?.filterType,
    filterParam?.startDate,
    filterParam?.endDate,
    filterParam?.selectedMonth,
    filterParam?.selectedYear,
    filterParam?.label,
    filterParam?.dateFilter
  ]);

  return { data, loading };
};
