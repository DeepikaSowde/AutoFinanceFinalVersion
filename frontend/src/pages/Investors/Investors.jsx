import { useMemo, useState, useEffect, useCallback } from "react";
import {
  Users,
  Database,
  Search,
  ChevronDown,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Lock,
  Eye,
  ArrowDownCircle,
  AlertTriangle,
  Wallet
} from "lucide-react";

import {
  addInvestor,
  debitInvestor,
  freezeOpeningBalances,
  loadInvestorData,
  reinvest,
} from "../../services/investorApi";

import { formatDate } from "../../utils/dateUtils";

const formatCurrency = (value) => `₹${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;

const Investors = () => {
  const [search, setSearch] = useState("");
  
  const [investors, setInvestors] = useState([]);
  const [freezeInfo, setFreezeInfo] = useState({ frozen: false, date: null });
  const [availablePool, setAvailablePool] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);

  const applyData = useCallback((data) => {
    setInvestors(data.investors);
    setFreezeInfo(data.freezeInfo);
    setAvailablePool(data.availablePool);
    setLoadError("");
  }, []);

  const refresh = useCallback(async () => {
    try {
      applyData(await loadInvestorData());
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setLoading(false);
    }
  }, [applyData]);

  useEffect(() => {
    let active = true;

    loadInvestorData()
      .then((data) => active && applyData(data))
      .catch((error) => active && setLoadError(error.message))
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [applyData]);

  const [successMessage, setSuccessMessage] = useState("");

  // Modals state
  const [activeModal, setActiveModal] = useState(null); 
  const [selectedInvestor, setSelectedInvestor] = useState(null);

  // Forms state
  const [form, setForm] = useState({});
  const [formError, setFormError] = useState("");

  const showSuccess = (msg) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(""), 4000);
  };

  const updateForm = (field, value) => setForm((curr) => ({ ...curr, [field]: value }));

  const openModal = (modalName, investor = null) => {
    setFormError("");
    const today = new Date().toISOString().slice(0, 10);
    setForm({
      investmentDate: today,
      debitDate: today,
      openingDate: today
    });
    setSelectedInvestor(investor);
    setActiveModal(modalName);
  };

  const closeModal = () => {
    setActiveModal(null);
    setSelectedInvestor(null);
  };

  // Helper calculations
  const getOpeningBalance = (inv) => inv.transactions.find(t => t.type === "Opening Balance")?.amount || 0;
  const getNewInvestments = (inv) => inv.transactions.filter(t => t.type === "New Investment" || t.type === "Re-Investment").reduce((sum, t) => sum + t.amount, 0);
  const getTotalAmountInvested = (inv) => getOpeningBalance(inv) + getNewInvestments(inv);
  const getInvestorDebits = (inv) => inv.transactions.filter(t => t.type === "Debit").reduce((sum, t) => sum + t.amount, 0);
  const getInvestorRemainingCapital = (inv) => getTotalAmountInvested(inv) - getInvestorDebits(inv);

  const filteredInvestors = useMemo(() => {
    const query = search.trim().toLowerCase();
    return investors.filter((inv) => {
      const matchSearch = !query || inv.name.toLowerCase().includes(query) || inv.id.toLowerCase().includes(query);
      return matchSearch;
    });
  }, [investors, search]);

  const openingInvestors = useMemo(() => investors.filter(inv => inv.type === "Opening"), [investors]);
  const totalOpeningBalance = openingInvestors.reduce((sum, inv) => sum + getOpeningBalance(inv), 0);

  const totalInvestedGlobal = investors.reduce((sum, inv) => sum + getTotalAmountInvested(inv), 0);
  // The server owns the pool balance: invested less withdrawals less loans funded.
  const totalAvailableBalance = availablePool;

  // Runs a write, reloads from the server, and reports the outcome. The
  // server re-checks every rule, so its message is what the user sees.
  const runAction = async (action, message, { keepModal = false } = {}) => {
    if (saving) return false;
    setSaving(true);
    setFormError("");
    try {
      await action();
      await refresh();
      showSuccess(message);
      if (!keepModal) closeModal();
      return true;
    } catch (error) {
      setFormError(error.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleAddOpeningInvestor = (e) => {
    e.preventDefault();
    if (!form.name?.trim() || !form.openingBalance || !form.openingDate) {
      setFormError("Please complete all required fields.");
      return;
    }
    runAction(
      () => addInvestor({ origin: "Opening", form }),
      `${form.name.trim()} added to Opening Balance list.`,
      { keepModal: true }
    ).then((saved) => {
      if (saved) setActiveModal("openingSetup");
    });
  };

  const handleAddNewInvestor = (e) => {
    e.preventDefault();
    if (!form.name?.trim() || !form.investmentAmount || !form.investmentDate || !form.transferMode) {
      setFormError("Please complete all required fields.");
      return;
    }
    runAction(() => addInvestor({ origin: "New Investor", form }), `${form.name.trim()} added successfully.`);
  };

  const handleReinvest = (e) => {
    e.preventDefault();
    if (!form.investmentAmount || !form.investmentDate || !form.transferMode) {
      setFormError("Please complete all required fields.");
      return;
    }
    runAction(
      () => reinvest(selectedInvestor.id, form),
      `Re-investment added for ${selectedInvestor.name}.`
    );
  };

  const handleDebit = (e) => {
    e.preventDefault();
    if (!form.debitAmount || !form.debitDate || !form.paymentMode || !form.reason) {
      setFormError("Please complete all required fields.");
      return;
    }

    const debitAmount = Number(form.debitAmount);
    if (debitAmount <= 0) {
      setFormError("Debit amount must be greater than zero.");
      return;
    }

    const remainingCapital = getInvestorRemainingCapital(selectedInvestor);
    if (debitAmount > remainingCapital) {
      setFormError(`Cannot debit. Debit Amount (₹${debitAmount.toLocaleString("en-IN")}) exceeds Investor Remaining Capital (₹${remainingCapital.toLocaleString("en-IN")}).`);
      return;
    }

    if (debitAmount > totalAvailableBalance) {
      setFormError(`Cannot debit. Debit Amount (₹${debitAmount.toLocaleString("en-IN")}) exceeds Total Available Pool (₹${totalAvailableBalance.toLocaleString("en-IN")}).`);
      return;
    }

    runAction(
      () => debitInvestor(selectedInvestor.id, form),
      `Debit of ₹${debitAmount.toLocaleString("en-IN")} processed for ${selectedInvestor.name}.`
    );
  };

  const handleFreeze = () => {
    runAction(() => freezeOpeningBalances(), "Opening Balance Setup has been frozen.");
  };

  return (
    <div className="flex flex-col flex-1 min-h-screen bg-white px-4 sm:px-6 lg:px-8 py-6 pb-8">
      
      {/* PAGE HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-[#06483f] sm:text-3xl">
            Investor Management
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => openModal('openingSetup')}
            className={`flex h-11 items-center justify-center gap-2 rounded-lg px-4 sm:px-5 text-sm font-semibold transition-colors border ${freezeInfo.frozen ? 'bg-slate-50 text-slate-500 border-slate-200 cursor-not-allowed' : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'}`}
          >
            {freezeInfo.frozen ? <Lock className="h-4 w-4" /> : <Database className="h-4 w-4" />}
            {freezeInfo.frozen ? (
              <span className="flex flex-col items-start leading-tight">
                <span>Opening Balance Setup</span>
                <span className="text-[10px] font-medium opacity-80 mt-[1px]">Frozen on {freezeInfo.date}</span>
              </span>
            ) : 'Opening Balance Setup'}
          </button>

          <button
            type="button"
            onClick={() => openModal('newInvestor')}
            className="flex h-11 items-center justify-center gap-2 rounded-lg bg-[#006052] px-4 sm:px-5 text-sm font-semibold text-white hover:bg-[#004d43] shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Add Investor
          </button>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3 sm:gap-4 shrink-0">
        <SummaryCard icon={Users} title="Total Investors" value={filteredInvestors.length} />
        <SummaryCard icon={Database} title="Total Amount Invested" value={formatCurrency(totalInvestedGlobal)} />
        <SummaryCard icon={Wallet} title="Total Available Balance" value={formatCurrency(totalAvailableBalance)} />
      </div>

      {/* MAIN TABLE CARD */}
      <div className="mt-6 flex-1 flex flex-col min-h-0 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        
        {/* SEARCH AND FILTERS */}
        <div className="p-4 sm:p-5 border-b border-slate-100 shrink-0 bg-slate-50/50">
          <div className="flex flex-col lg:flex-row lg:items-center w-full">
            <div className="relative min-w-0 w-full lg:max-w-md">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search investor name or ID..."
                className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-12 pr-4 text-[15px] text-slate-800 outline-none placeholder:text-slate-400 focus:border-[#006052] focus:ring-1 focus:ring-[#006052]"
              />
            </div>
          </div>
        </div>

        {/* TABLE CONTAINER */}
        <div className="flex-1 overflow-x-auto overflow-y-auto">
          <table className="w-full min-w-[950px] text-left border-collapse">
            <thead className="sticky top-0 bg-slate-100/80 backdrop-blur-sm z-10 shadow-[0_1px_0_0_#e2e8f0]">
              <tr>
                <TableHeader width="14%">Investor ID</TableHeader>
                <TableHeader width="30%">Investor</TableHeader>
                <TableHeader width="24%">Total Amount Invested</TableHeader>
                <TableHeader width="12%">Status</TableHeader>
                <TableHeader width="20%">Actions</TableHeader>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredInvestors.length === 0 ? (
                <tr>
                  <td colSpan={5} className="h-40 text-center text-[15px] text-slate-500">No investors found matching your search.</td>
                </tr>
              ) : filteredInvestors.map((inv) => (
                <tr key={inv.id} className="h-16 hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 font-medium text-slate-600 text-[15px]">{inv.id}</td>
                  <td className="px-5">
                    <div className="flex items-center gap-2.5">
                      <span className="font-semibold text-slate-900 text-base">{inv.name}</span>
                      <span className={`px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide rounded-md ${inv.type === 'Opening' ? 'bg-amber-100 text-amber-800' : 'bg-[#e5f0ef] text-[#006052]'}`}>
                        {inv.type === 'Opening' ? 'Opening' : 'New Investor'}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 font-semibold text-[#006052] text-base">{formatCurrency(getTotalAmountInvested(inv))}</td>
                  <td className="px-5">
                    <span className="inline-flex items-center rounded-full bg-slate-100 border border-slate-200 px-3 py-1 text-[13px] font-medium text-slate-700 shadow-sm">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-2"></span>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-5">
                    <div className="flex items-center gap-2">
                      {inv.status === 'Active' && (
                        <>
                          <button onClick={() => openModal('reinvest', inv)} className="flex items-center justify-center gap-1.5 border border-[#006052] text-[#006052] bg-white px-3.5 py-1.5 rounded-md hover:bg-emerald-50 transition-colors focus:outline-none focus:ring-2 focus:ring-[#006052] focus:ring-offset-1 font-medium shadow-sm">
                            <RotateCcw className="h-4 w-4" /> <span className="text-sm">Reinvest</span>
                          </button>
                          <button onClick={() => openModal('debit', inv)} className="flex items-center justify-center gap-1.5 border border-red-600 text-red-600 bg-white px-3.5 py-1.5 rounded-md hover:bg-red-50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-1 font-medium shadow-sm">
                            <ArrowDownCircle className="h-4 w-4" /> <span className="text-sm">Debit</span>
                          </button>
                        </>
                      )}
                      <button onClick={() => openModal('view', inv)} className="flex items-center justify-center gap-1.5 bg-amber-500 text-slate-900 px-4 py-1.5 rounded-md hover:bg-amber-600 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 font-semibold shadow-sm">
                        <Eye className="h-4 w-4 opacity-80" /> <span className="text-sm">View</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {loadError && (
        <div role="alert" className="mt-4 shrink-0 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load investors: {loadError}{" "}
          <button type="button" className="font-semibold underline" onClick={refresh}>Retry</button>
        </div>
      )}
      {loading && !loadError && <p className="mt-4 shrink-0 text-sm text-slate-500">Loading investors…</p>}

      {successMessage && (
        <div className="fixed right-6 bottom-6 z-[70] rounded-lg bg-[#006052] px-5 py-3.5 text-sm font-medium text-white shadow-xl flex items-center gap-3 border border-[#004d43] animate-in fade-in slide-in-from-bottom-5">
          <Database className="h-5 w-5 opacity-80" />
          {successMessage}
        </div>
      )}

      {/* MODALS */}
      {activeModal === 'openingSetup' && (
        <Modal title="Opening Balance Setup" desc="Add existing investors and their balances from the previous system. Once confirmed, opening balances will be frozen." onClose={closeModal}>
          <div className="p-5 sm:p-7 space-y-6">
            {!freezeInfo.frozen && (
              <div className="flex justify-between items-center bg-amber-50 p-4 rounded-xl border border-amber-200">
                <div className="flex gap-2 w-full justify-end">
                  <button onClick={() => openModal('openingAdd')} className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-700 flex items-center gap-1.5 shadow-sm">
                    <Plus className="h-4 w-4" /> Add Investor
                  </button>
                  <button onClick={() => openModal('freezeConfirm')} className="border border-amber-600 text-amber-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-100 flex items-center gap-1.5 bg-white shadow-sm">
                    <Lock className="h-4 w-4" /> Freeze Opening Balance
                  </button>
                </div>
              </div>
            )}
            {freezeInfo.frozen && (
              <div className="flex items-center gap-3 bg-[#e5f0ef] text-[#006052] p-4 rounded-xl border border-[#c1deda]">
                <Lock className="h-5 w-5" />
                <span className="font-medium text-[15px]">✓ Opening Balance Frozen (Frozen Date: {freezeInfo.date})</span>
              </div>
            )}
            
            <div className="flex justify-between items-center text-[15px] font-medium text-slate-700 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <span>Total Investors: <span className="font-bold text-slate-900 ml-1">{openingInvestors.length}</span></span>
              <span>Total Opening Balance: <span className="font-bold text-[#006052] ml-1">{formatCurrency(totalOpeningBalance)}</span></span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
              <table className="w-full text-left text-[15px] text-slate-700">
                <thead className="bg-slate-100/80 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3.5 font-semibold text-slate-800 text-sm">Investor ID</th>
                    <th className="px-5 py-3.5 font-semibold text-slate-800 text-sm">Investor</th>
                    <th className="px-5 py-3.5 font-semibold text-slate-800 text-sm">Opening Balance</th>
                    <th className="px-5 py-3.5 font-semibold text-slate-800 text-sm">Opening Date</th>
                    <th className="px-5 py-3.5 font-semibold text-slate-800 text-sm">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {openingInvestors.length === 0 && (
                    <tr><td colSpan={5} className="p-5 text-center text-slate-500">No opening balance investors added.</td></tr>
                  )}
                  {openingInvestors.map(inv => {
                    const openingTx = inv.transactions.find(t => t.type === "Opening Balance");
                    return (
                      <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-3.5 font-medium">{inv.id}</td>
                        <td className="px-5 py-3.5 font-semibold text-slate-900">{inv.name}</td>
                        <td className="px-5 py-3.5 text-[#006052] font-semibold">{formatCurrency(openingTx?.amount)}</td>
                        <td className="px-5 py-3.5 text-slate-600">{openingTx?.date}</td>
                        <td className="px-5 py-3.5">
                          {freezeInfo.frozen ? (
                            <span className="inline-flex items-center text-xs font-medium text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md shadow-sm"><Lock className="inline h-3 w-3 mr-1.5 opacity-70"/>Locked</span>
                          ) : (
                            <span className="inline-flex items-center text-xs font-medium text-amber-700 bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-md shadow-sm">Pending</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}

      {activeModal === 'freezeConfirm' && (
        <Modal title="Freeze Opening Balance" onClose={() => openModal('openingSetup')} size="sm">
          <div className="p-5 sm:p-7">
            <div className="flex flex-col gap-5 mb-7">
              <div className="flex gap-3 text-amber-800 bg-amber-50 p-4 rounded-xl border border-amber-200">
                <AlertTriangle className="h-6 w-6 shrink-0 text-amber-600" />
                <div className="text-[15px]">
                  <p className="font-bold mb-1 text-amber-900">Are you sure you want to freeze the opening balances?</p>
                  <p className="opacity-90 leading-relaxed">After freezing, these opening balances cannot be edited through the Opening Balance Setup.</p>
                </div>
              </div>
              <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 text-[15px] space-y-3 shadow-sm">
                <div className="flex justify-between items-center"><span className="text-slate-600 font-medium">Total Investors:</span><span className="font-bold text-slate-900 text-lg">{openingInvestors.length}</span></div>
                <div className="flex justify-between items-center border-t border-slate-200 pt-3"><span className="text-slate-600 font-medium">Total Opening Balance:</span><span className="font-bold text-[#006052] text-lg">{formatCurrency(totalOpeningBalance)}</span></div>
                <div className="flex justify-between items-center border-t border-slate-200 pt-3"><span className="text-slate-600 font-medium">Opening Balance Date:</span><span className="font-bold text-slate-900">{new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date()).replace(/ /g, '-')}</span></div>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <button onClick={() => openModal('openingSetup')} className="px-5 py-2.5 text-sm font-semibold text-slate-700 border border-slate-300 bg-white rounded-lg hover:bg-slate-50 shadow-sm transition-colors">Cancel</button>
              <button onClick={handleFreeze} className="px-5 py-2.5 text-sm font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 shadow-sm transition-colors">Confirm & Freeze</button>
            </div>
          </div>
        </Modal>
      )}

      {activeModal === 'openingAdd' && (
        <Modal title="Add Existing Investor" desc="Migrate an investor from the previous system." onClose={() => openModal('openingSetup')}>
          <form onSubmit={handleAddOpeningInvestor} className="space-y-7 p-5 sm:p-7">
            <FormSection title="Investor Details">
              <FormField label="Investor ID"><input value={`INV${String(investors.length + 1).padStart(3, "0")}`} disabled className={inputClass} /></FormField>
              <FormField label="Investor Name" required><input value={form.name || ''} onChange={(e) => updateForm("name", e.target.value)} className={inputClass} autoFocus /></FormField>
              <FormField label="Mobile Number"><input value={form.mobile || ''} onChange={(e) => updateForm("mobile", e.target.value)} className={inputClass} inputMode="tel" /></FormField>
              <FormField label="Email ID"><input type="email" value={form.email || ''} onChange={(e) => updateForm("email", e.target.value)} className={inputClass} /></FormField>
              <FormField label="Aadhaar Number"><input value={form.aadhaar || ''} onChange={(e) => updateForm("aadhaar", e.target.value)} className={inputClass} /></FormField>
              <FormField label="PAN Number"><input value={form.pan || ''} onChange={(e) => updateForm("pan", e.target.value)} className={inputClass} /></FormField>
            </FormSection>
            <FormSection title="Bank Details">
              <FormField label="Bank Account Number"><input value={form.accountNumber || ''} onChange={(e) => updateForm("accountNumber", e.target.value)} className={inputClass} /></FormField>
              <FormField label="Account Holder Name"><input value={form.accountHolder || ''} onChange={(e) => updateForm("accountHolder", e.target.value)} className={inputClass} /></FormField>
            </FormSection>
            <FormSection title="Opening Balance">
              <FormField label="Opening Balance Amount" required><input type="number" min="0" value={form.openingBalance || ''} onChange={(e) => updateForm("openingBalance", e.target.value)} className={inputClass} /></FormField>
              <FormField label="Opening Balance Date" required><input type="date" value={form.openingDate || ''} onChange={(e) => updateForm("openingDate", e.target.value)} className={inputClass} /></FormField>
            </FormSection>
            {formError && <p className="text-[15px] font-medium text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">{formError}</p>}
            <div className="flex justify-end gap-3 pt-6 border-t border-slate-200">
              <button type="button" onClick={() => openModal('openingSetup')} className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-[15px] font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition-colors">Cancel</button>
              <button type="submit" className="rounded-lg bg-amber-600 px-6 py-2.5 text-[15px] font-bold text-white hover:bg-amber-700 shadow-sm transition-colors">Add Investor</button>
            </div>
          </form>
        </Modal>
      )}

      {activeModal === 'newInvestor' && (
        <Modal title="Add New Investor" desc="Record a new investor post-migration." onClose={closeModal}>
          <form onSubmit={handleAddNewInvestor} className="space-y-7 p-5 sm:p-7">
            <FormSection title="Investor Details">
              <FormField label="Investor ID"><input value={`INV${String(investors.length + 1).padStart(3, "0")}`} disabled className={inputClass} /></FormField>
              <FormField label="Investor Name" required><input value={form.name || ''} onChange={(e) => updateForm("name", e.target.value)} className={inputClass} autoFocus /></FormField>
              <FormField label="Mobile Number"><input value={form.mobile || ''} onChange={(e) => updateForm("mobile", e.target.value)} className={inputClass} inputMode="tel" /></FormField>
              <FormField label="Email ID"><input type="email" value={form.email || ''} onChange={(e) => updateForm("email", e.target.value)} className={inputClass} /></FormField>
              <FormField label="Aadhaar Number"><input value={form.aadhaar || ''} onChange={(e) => updateForm("aadhaar", e.target.value)} className={inputClass} /></FormField>
              <FormField label="PAN Number"><input value={form.pan || ''} onChange={(e) => updateForm("pan", e.target.value)} className={inputClass} /></FormField>
            </FormSection>
            <FormSection title="Bank Details">
              <FormField label="Bank Account Number"><input value={form.accountNumber || ''} onChange={(e) => updateForm("accountNumber", e.target.value)} className={inputClass} /></FormField>
              <FormField label="Account Holder Name"><input value={form.accountHolder || ''} onChange={(e) => updateForm("accountHolder", e.target.value)} className={inputClass} /></FormField>
            </FormSection>
            <FormSection title="Investment Details">
              <FormField label="Investment Amount" required><input type="number" min="0" value={form.investmentAmount || ''} onChange={(e) => updateForm("investmentAmount", e.target.value)} className={inputClass} /></FormField>
              <FormField label="Amount Transfer Mode" required><select value={form.transferMode || 'Bank Transfer'} onChange={(e) => updateForm("transferMode", e.target.value)} className={inputClass}>{["Bank Transfer", "UPI", "Cheque", "Cash"].map((mode) => <option key={mode}>{mode}</option>)}</select></FormField>
              <FormField label="Investment Date" required><input type="date" value={form.investmentDate || new Date().toISOString().slice(0, 10)} onChange={(e) => updateForm("investmentDate", e.target.value)} className={inputClass} /></FormField>
            </FormSection>
            {formError && <p className="text-[15px] font-medium text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">{formError}</p>}
            <div className="flex justify-end gap-3 pt-6 border-t border-slate-200">
              <button type="button" onClick={closeModal} className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-[15px] font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition-colors">Cancel</button>
              <button type="submit" className="rounded-lg bg-[#006052] px-6 py-2.5 text-[15px] font-bold text-white hover:bg-[#004d43] shadow-sm transition-colors">Create Investor</button>
            </div>
          </form>
        </Modal>
      )}

      {activeModal === 'reinvest' && selectedInvestor && (
        <Modal title="Re-Investment" onClose={closeModal} size="sm">
          <form onSubmit={handleReinvest} className="space-y-5 p-5 sm:p-7">
            <div className="bg-slate-50 p-5 rounded-xl text-[15px] space-y-3 border border-slate-200 shadow-sm">
              <div className="flex justify-between items-center"><span className="text-slate-600 font-medium">Investor ID:</span><span className="font-bold text-slate-900">{selectedInvestor.id}</span></div>
              <div className="flex justify-between items-center"><span className="text-slate-600 font-medium">Investor Name:</span><span className="font-bold text-slate-900">{selectedInvestor.name}</span></div>
              <div className="flex justify-between items-center pt-3 border-t border-slate-200"><span className="text-slate-600 font-medium">Total Amount Invested:</span><span className="font-bold text-[#006052] text-lg">{formatCurrency(getTotalAmountInvested(selectedInvestor))}</span></div>
            </div>
            <div className="space-y-4 pt-2">
              <FormField label="Investment Amount" required><input type="number" min="1" value={form.investmentAmount || ''} onChange={(e) => updateForm("investmentAmount", e.target.value)} className={inputClass} autoFocus /></FormField>
              <FormField label="Transfer Mode" required><select value={form.transferMode || 'Bank Transfer'} onChange={(e) => updateForm("transferMode", e.target.value)} className={inputClass}>{["Bank Transfer", "UPI", "Cheque", "Cash"].map((mode) => <option key={mode}>{mode}</option>)}</select></FormField>
              <FormField label="Investment Date" required><input type="date" value={form.investmentDate || new Date().toISOString().slice(0, 10)} onChange={(e) => updateForm("investmentDate", e.target.value)} className={inputClass} /></FormField>
            </div>
            {formError && <p className="text-[15px] font-medium text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">{formError}</p>}
            <div className="flex justify-end gap-3 pt-6 border-t border-slate-200">
              <button type="button" onClick={closeModal} className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-[15px] font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition-colors">Cancel</button>
              <button type="submit" className="rounded-lg bg-[#006052] px-6 py-2.5 text-[15px] font-bold text-white hover:bg-[#004d43] shadow-sm transition-colors">Add Investment</button>
            </div>
          </form>
        </Modal>
      )}

      {activeModal === 'debit' && selectedInvestor && (
        <Modal title={`Debit: ${selectedInvestor.name}`} desc={`ID: ${selectedInvestor.id}`} onClose={closeModal} size="md">
          <form onSubmit={handleDebit} className="flex flex-col">
            <div className="p-5 sm:p-7 space-y-6">
              
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <p className="text-[12px] font-bold uppercase tracking-wider text-slate-500 mb-1">Investor Remaining Capital</p>
                  <p className="font-bold text-slate-900 text-xl">{formatCurrency(getInvestorRemainingCapital(selectedInvestor))}</p>
                </div>
                <div>
                  <p className="text-[12px] font-bold uppercase tracking-wider text-slate-500 mb-1">Total Available Pool</p>
                  <p className="font-bold text-slate-900 text-xl">{formatCurrency(totalAvailableBalance)}</p>
                </div>
              </div>

              {form.debitAmount && Number(form.debitAmount) > 0 && (
                <div className="grid grid-cols-2 gap-4 bg-red-50 p-4 rounded-xl border border-red-100">
                  <div>
                    <p className="text-[12px] font-bold uppercase tracking-wider text-red-600 mb-1">After Debit Capital</p>
                    <p className="font-bold text-red-700 text-xl">{formatCurrency(getInvestorRemainingCapital(selectedInvestor) - Number(form.debitAmount))}</p>
                  </div>
                  <div>
                    <p className="text-[12px] font-bold uppercase tracking-wider text-red-600 mb-1">After Debit Pool</p>
                    <p className="font-bold text-red-700 text-xl">{formatCurrency(totalAvailableBalance - Number(form.debitAmount))}</p>
                  </div>
                </div>
              )}

              <FormField label="Debit Amount" required>
                <input type="number" placeholder="Enter debit amount" value={form.debitAmount || ""} onChange={(e) => updateForm("debitAmount", e.target.value)} className={inputClass} />
              </FormField>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <FormField label="Debit Date" required>
                  <input type="date" value={form.debitDate || new Date().toISOString().slice(0, 10)} onChange={(e) => updateForm("debitDate", e.target.value)} className={inputClass} />
                </FormField>
                <FormField label="Payment Mode" required>
                  <select value={form.paymentMode || ""} onChange={(e) => updateForm("paymentMode", e.target.value)} className={inputClass}>
                    <option value="">Select Mode</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="UPI">UPI</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Cash">Cash</option>
                  </select>
                </FormField>
              </div>

              <FormField label="Reason" required>
                <select value={form.reason || ""} onChange={(e) => updateForm("reason", e.target.value)} className={inputClass}>
                  <option value="">Select Reason</option>
                  <option value="Withdrawal">Withdrawal</option>
                  <option value="Refund">Refund</option>
                  <option value="Other">Other</option>
                </select>
              </FormField>

              <FormField label="Remarks">
                <input type="text" placeholder="Optional remarks" value={form.remarks || ""} onChange={(e) => updateForm("remarks", e.target.value)} className={inputClass} />
              </FormField>
              
            </div>
            
            {formError && <div className="px-5 sm:px-7"><p className="text-[15px] font-medium text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">{formError}</p></div>}
            
            <div className="flex justify-end gap-3 px-5 py-5 sm:px-7 sm:py-6 border-t border-slate-200 mt-2">
              <button type="button" onClick={closeModal} className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-[15px] font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition-colors">Cancel</button>
              <button type="submit" disabled={!form.debitAmount || !form.debitDate || !form.paymentMode || !form.reason} className="rounded-lg bg-red-600 px-6 py-2.5 text-[15px] font-bold text-white hover:bg-red-700 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">Confirm Debit</button>
            </div>
          </form>
        </Modal>
      )}

      {activeModal === 'view' && selectedInvestor && (
        <Modal title="Investor Details" onClose={closeModal}>
          <div className="p-5 sm:p-7 space-y-8">
            <div>
              <h3 className="text-[13px] font-bold uppercase tracking-wider text-slate-500 mb-3.5">Investor Information</h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-5 bg-slate-50 p-5 rounded-xl border border-slate-200 shadow-sm">
                <div><p className="text-[13px] font-medium text-slate-500 mb-1.5">Investor ID</p><p className="font-bold text-slate-900 text-[15px]">{selectedInvestor.id}</p></div>
                <div><p className="text-[13px] font-medium text-slate-500 mb-1.5">Investor Name</p><p className="font-bold text-slate-900 text-[15px]">{selectedInvestor.name}</p></div>
                <div><p className="text-[13px] font-medium text-slate-500 mb-1.5">Mobile</p><p className="font-medium text-slate-800 text-[15px]">{selectedInvestor.mobile || '-'}</p></div>
                <div><p className="text-[13px] font-medium text-slate-500 mb-1.5">Email</p><p className="font-medium text-slate-800 text-[15px] truncate">{selectedInvestor.email || '-'}</p></div>
                <div><p className="text-[13px] font-medium text-slate-500 mb-1.5">Status</p><p className="font-medium text-slate-900"><span className="bg-[#e5f0ef] text-[#006052] border border-[#c1deda] px-3 py-1 rounded-full text-xs font-bold shadow-sm">{selectedInvestor.status}</span></p></div>
              </div>
            </div>

            <div>
              <h3 className="text-[13px] font-bold uppercase tracking-wider text-slate-500 mb-3.5">Account Summary</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
                  <p className="text-[13px] font-bold text-slate-500 uppercase tracking-wide">Total Amount Invested</p>
                  <p className="mt-2 font-bold text-slate-800 text-xl">{formatCurrency(getTotalAmountInvested(selectedInvestor))}</p>
                </div>
                <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
                  <p className="text-[13px] font-bold text-slate-500 uppercase tracking-wide">Total Previous Debits</p>
                  <p className="mt-2 font-bold text-red-600 text-xl">{formatCurrency(getInvestorDebits(selectedInvestor))}</p>
                </div>
                <div className="bg-[#006052] p-5 rounded-xl border border-[#004d43] shadow-md flex flex-col justify-center text-white relative overflow-hidden">
                  <div className="absolute -right-4 -top-4 opacity-10"><Wallet className="h-24 w-24" /></div>
                  <p className="text-[13px] font-bold text-emerald-100 uppercase tracking-wide relative z-10">Investor Remaining Capital</p>
                  <p className="mt-2 font-bold text-white text-2xl relative z-10">{formatCurrency(getInvestorRemainingCapital(selectedInvestor))}</p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-[13px] font-bold uppercase tracking-wider text-slate-500 mb-3.5">Transaction History</h3>
              <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
                <table className="w-full text-left text-[15px] text-slate-700">
                  <thead className="bg-slate-100/80 border-b border-slate-200">
                    <tr>
                      <th className="px-5 py-3.5 font-semibold text-slate-800 text-sm">Date</th>
                      <th className="px-5 py-3.5 font-semibold text-slate-800 text-sm">Transaction Type</th>
                      <th className="px-5 py-3.5 font-semibold text-slate-800 text-sm">Amount</th>
                      <th className="px-5 py-3.5 font-semibold text-slate-800 text-sm">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(() => {
                      let currentBal = 0;
                      return selectedInvestor.transactions.map((t, idx) => {
                        const isDebit = t.type === 'Debit';
                        currentBal += (isDebit ? -t.amount : t.amount);
                        return (
                          <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-5 py-4 text-slate-600">{formatDate(t.date)}</td>
                            <td className="px-5 py-4">
                              <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                                {t.type} {t.type === 'Opening Balance' && <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 bg-slate-200 px-2 py-0.5 rounded-md ml-2 border border-slate-300">Historical</span>}
                              </span>
                            </td>
                            <td className={`px-5 py-4 font-bold ${isDebit ? 'text-red-600' : 'text-slate-900'}`}>{isDebit ? '−' : '+'}{formatCurrency(t.amount)}</td>
                            <td className="px-5 py-4 font-bold text-[#006052]">{formatCurrency(currentBal)}</td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
};

// Sub-components
const Modal = ({ title, desc, onClose, children, size = 'lg' }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 sm:p-6" role="dialog" aria-modal="true">
    <div className={`max-h-[95vh] w-full ${size === 'sm' ? 'max-w-md' : 'max-w-4xl'} overflow-y-auto rounded-2xl bg-white shadow-2xl flex flex-col animate-in zoom-in-95 duration-200`}>
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-7 sticky top-0 bg-white/95 backdrop-blur z-10">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">{title}</h2>
          {desc && <p className="mt-1 text-[14px] text-slate-500 leading-relaxed">{desc}</p>}
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200">
          <X className="h-5 w-5" />
        </button>
      </div>
      {children}
    </div>
  </div>
);

const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-[15px] font-medium text-slate-900 outline-none focus:border-[#006052] focus:ring-2 focus:ring-[#006052]/20 transition-all shadow-sm placeholder:text-slate-400";

const FormField = ({ label, required, children }) => (
  <label className="block">
    <span className="mb-2 block text-[14px] font-semibold text-slate-700">{label}{required && <span className="ml-1 text-red-500">*</span>}</span>
    {children}
  </label>
);

const FormSection = ({ title, children }) => (
  <section>
    <h3 className="mb-4 text-[13px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2">{title}</h3>
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">{children}</div>
  </section>
);

const SummaryCard = ({ icon: Icon, title, value }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow min-w-0 w-full h-full">
    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
      <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-[#e5f0ef] text-[#006052]">
        <Icon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.5} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs sm:text-sm font-semibold text-slate-500 leading-snug break-words">{title}</p>
        <p
          className="mt-0.5 sm:mt-1 text-base sm:text-lg lg:text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap leading-tight"
        >
          {value}
        </p>
      </div>
    </div>
  </div>
);

const TableHeader = ({ children, width }) => (
  <th style={{ width }} className="whitespace-nowrap px-5 py-4 text-left text-[13px] font-bold uppercase tracking-wider text-slate-500">
    {children}
  </th>
);

export default Investors;