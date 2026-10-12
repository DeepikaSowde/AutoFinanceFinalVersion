import { useState, useEffect } from 'react';
import { DATA_CHANGED_EVENT } from '../services/api';
import { loadLedgerData } from '../services/ledgerApi';
import { calculateTotalPortfolioOutstanding } from '../utils/loanCalculations.js';

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
    repaymentVsInterest: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const fetchData = async () => {
      try {
        const { customers, payments, investors, incomeData, expenseData, vehicleSales } = await loadLedgerData();
        if (!active) return;

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
            .filter(([_, value]) => value > 0)
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
            .filter(([_, value]) => value > 0)
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
            chitData: null, // No chit data in standard app
            outstandingOverview: {
                totalOutstanding,
                debit: totalDebit,
                credit: totalCredit,
                balance: closingBalance
            },
            repaymentVsInterest: [] // No pure interest data
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
