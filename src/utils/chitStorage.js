/**
 * motoLend Chit Investment Storage & Synchronization Utility
 *
 * Coordinates storage for:
 * 1. motoLendChitCompanies_data: Companies and their underlying chits
 * 2. motoLendChitTransactions_data: Raw Chit transactions (Chit Paid / Chit Income)
 * 3. motoLendExpense_data: Integration for "Chit Paid" as an Expense
 * 4. motoLendIncome_data: Integration for "Chit Income" as Income
 *
 * Dispatches standard "storage" and "motoLendStorageUpdate" window events so Ledger,
 * ExpenseView, IncomeView, and Dashboard update in real-time.
 */

export const CHIT_COMPANIES_STORAGE_KEY = "motoLendChitCompanies_data";
export const CHIT_TRANSACTIONS_STORAGE_KEY = "motoLendChitTransactions_data";
export const EXPENSES_STORAGE_KEY = "motoLendExpense_data";
export const INCOME_STORAGE_KEY = "motoLendIncome_data";

// Initial seed companies: Empty array so only actual saved company records are used
export const DEFAULT_COMPANIES = [];

export const getChitCompanies = () => {
  try {
    const raw = localStorage.getItem(CHIT_COMPANIES_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Purge hardcoded/demo companies (COMP-1 "Sri Murugan Chits Pvt Ltd", COMP-2 "Gokulam Chit Funds")
    const filtered = parsed.filter(
      (comp) =>
        comp.id !== "COMP-1" &&
        comp.id !== "COMP-2" &&
        comp.name !== "Sri Murugan Chits Pvt Ltd" &&
        comp.name !== "Gokulam Chit Funds"
    );

    // If default companies were present in localStorage, clean up localStorage immediately
    if (filtered.length !== parsed.length) {
      localStorage.setItem(CHIT_COMPANIES_STORAGE_KEY, JSON.stringify(filtered));
    }

    return filtered;
  } catch {
    return [];
  }
};

export const saveChitCompanies = (companies) => {
  localStorage.setItem(CHIT_COMPANIES_STORAGE_KEY, JSON.stringify(companies));
  notifyStorageChange();
};

export const getChitTransactions = () => {
  try {
    const raw = localStorage.getItem(CHIT_TRANSACTIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Purge transactions linked to default/demo companies
    const filtered = parsed.filter(
      (tx) =>
        tx.companyId !== "COMP-1" &&
        tx.companyId !== "COMP-2" &&
        tx.companyName !== "Sri Murugan Chits Pvt Ltd" &&
        tx.companyName !== "Gokulam Chit Funds"
    );

    if (filtered.length !== parsed.length) {
      localStorage.setItem(CHIT_TRANSACTIONS_STORAGE_KEY, JSON.stringify(filtered));
    }

    return filtered;
  } catch {
    return [];
  }
};

export const notifyStorageChange = () => {
  window.dispatchEvent(new Event("storage"));
  window.dispatchEvent(new Event("motoLendStorageUpdate"));
};

/**
 * Saves a Chit Transaction and automatically integrates with Expense or Income records
 *
 * @param {Object} txData
 * @param {string} txData.type - "Chit Paid" (Expense) or "Chit Income" (Income)
 * @param {string} txData.companyId
 * @param {string} txData.companyName
 * @param {string} txData.chitId
 * @param {string} txData.chitName
 * @param {number} txData.amount
 * @param {string} txData.date - "YYYY-MM-DD"
 * @param {string} txData.paymentType - "Cash" | "UPI" | "Bank Transfer" | "Cheque"
 */
export const saveChitTransaction = ({
  type, // "Chit Paid" | "Chit Income"
  companyId,
  companyName,
  chitId,
  chitName,
  amount,
  date,
  paymentType = "Cash"
}) => {
  const numAmount = Math.max(0, Number(amount) || 0);
  const txId = `CHIT-TXN-${Date.now()}`;
  const category = type === "Chit Paid" ? "Expense" : "Income";

  const chitTx = {
    id: txId,
    type, // "Chit Paid" | "Chit Income"
    category, // "Expense" | "Income"
    companyId,
    companyName,
    chitId,
    chitName,
    amount: numAmount,
    date: date || new Date().toISOString().slice(0, 10),
    paymentType,
    createdAt: new Date().toISOString()
  };

  // 1. Save to Chit Transactions table
  const existingChitTxs = getChitTransactions();
  const updatedChitTxs = [chitTx, ...existingChitTxs];
  localStorage.setItem(CHIT_TRANSACTIONS_STORAGE_KEY, JSON.stringify(updatedChitTxs));

  // 2. Financial Integration
  if (type === "Chit Paid") {
    // Record as Expense in motoLendExpense_data
    try {
      const expenses = JSON.parse(localStorage.getItem(EXPENSES_STORAGE_KEY) || "[]");
      const expenseItem = {
        id: `EXP-CHIT-${Date.now()}`,
        chitTxId: txId,
        category: "Chit Investment", // contains 'chit' for ExpenseView chit filter
        amount: numAmount,
        date: chitTx.date,
        mode: paymentType,
        remarks: `Chit Paid: ${companyName} (${chitName})`,
        companyId,
        companyName,
        chitId,
        chitName,
        isChitPayment: true
      };
      expenses.push(expenseItem);
      localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(expenses));
    } catch (err) {
      console.error("Failed to sync chit expense:", err);
    }
  } else {
    // Record as Income in motoLendIncome_data
    try {
      const incomeList = JSON.parse(localStorage.getItem(INCOME_STORAGE_KEY) || "[]");
      const incomeItem = {
        id: `INC-CHIT-${Date.now()}`,
        chitTxId: txId,
        type: "Chit Investment",
        amount: numAmount,
        date: chitTx.date,
        mode: paymentType,
        remarks: `Chit Income: ${companyName} (${chitName})`,
        companyId,
        companyName,
        chitId,
        chitName,
        isChitIncome: true
      };
      incomeList.push(incomeItem);
      localStorage.setItem(INCOME_STORAGE_KEY, JSON.stringify(incomeList));
    } catch (err) {
      console.error("Failed to sync chit income:", err);
    }
  }

  notifyStorageChange();
  return chitTx;
};
