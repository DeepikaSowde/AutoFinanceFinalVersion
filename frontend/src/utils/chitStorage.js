/**
 * motoLend Chit Investment — shared state for the Chit Investment page and the
 * Dashboard's Chit Overview card, backed by the API (/api/chits).
 *
 * Keeps the last copy of companies (with their chit schemes) and chit
 * transactions loaded from the server, so the getters answer immediately,
 * and fires "motoLendStorageUpdate" whenever a fresh copy arrives (the page
 * and card already listen for it). Writes go to the server, which books a
 * "Chit Paid" as an expense and a "Chit Income" as income in the same
 * transaction, then the copy is refreshed.
 */

import { DATA_CHANGED_EVENT, apiGet, apiPost } from "../services/api";

export const CHIT_UPDATE_EVENT = "motoLendStorageUpdate";

let companies = [];
let transactions = [];
let loading = null;
let loadedOnce = false;

export const notifyStorageChange = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHIT_UPDATE_EVENT));
};

/** Reloads companies and transactions from the API; concurrent calls share one request. */
export const refreshChitData = () => {
  if (!loading) {
    loading = Promise.all([apiGet("/chits/companies"), apiGet("/chits/transactions")])
      .then(([c, t]) => {
        companies = Array.isArray(c) ? c : [];
        transactions = Array.isArray(t) ? t : [];
        loadedOnce = true;
        notifyStorageChange();
        return { companies, transactions };
      })
      .finally(() => {
        loading = null;
      });
  }
  return loading;
};

// Any save anywhere in the app may have touched chit data.
if (typeof window !== "undefined") {
  window.addEventListener(DATA_CHANGED_EVENT, () => {
    if (loadedOnce) refreshChitData().catch(() => {});
  });
}

const ensureLoaded = () => {
  if (!loadedOnce && !loading) {
    refreshChitData().catch((error) => console.error("Failed to load chit data:", error));
  }
};

/** Companies (each with its `chits`) as last loaded; the first call starts loading. */
export const getChitCompanies = () => {
  ensureLoaded();
  return companies;
};

/** Chit transactions, newest first, as last loaded. */
export const getChitTransactions = () => {
  ensureLoaded();
  return transactions;
};

/**
 * Saves the page's edited company list: a company not on the server yet is
 * created with its schemes; schemes added to an existing company are appended
 * to it (its earlier schemes are untouched). Rejects with the server's
 * message (e.g. a duplicate company name).
 */
export const saveChitCompanies = async (list = []) => {
  const schemeFields = (ch) => ({
    name: ch.name,
    totalValue: ch.totalValue,
    paymentFrequency: ch.paymentFrequency,
    totalPayments: ch.totalPayments,
  });

  for (const company of list) {
    const existing = companies.find((c) => c.id === company.id);
    if (!existing) {
      await apiPost("/chits/companies", { name: company.name, chits: (company.chits || []).map(schemeFields) });
      continue;
    }
    const added = (company.chits || []).filter((ch) => !(existing.chits || []).some((e) => e.id === ch.id));
    if (added.length) {
      await apiPost(`/chits/companies/${existing.id}/schemes`, { chits: added.map(schemeFields) });
    }
  }
  await refreshChitData();
};

/**
 * Records a "Chit Paid" (expense) or "Chit Income" (income) against a chit
 * scheme; the server books the expense / income with it.
 */
export const saveChitTransaction = async ({ type, chitId, amount, date, paymentType = "Cash" }) => {
  const saved = await apiPost("/chits/transactions", { type, chitId, amount, date, paymentType });
  await refreshChitData();
  return saved;
};
