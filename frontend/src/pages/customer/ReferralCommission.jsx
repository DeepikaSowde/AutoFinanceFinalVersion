import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Search,
  Plus,
  Coins,
  CheckCircle2,
  Clock,
  Wallet,
  Users,
  X,
  FileText,
  Phone,
  Filter,
  DollarSign,
  Calendar,
  Building2,
  Check,
  ChevronDown,
  Undo2,
  Pencil,
  Percent,
} from "lucide-react";

import { DATA_CHANGED_EVENT, apiGet, apiPost } from "../../services/api";
import { loadCustomerEntries } from "../../services/customerApi";
import { markReferralCommissionPaid, updateReferralCommissionRate } from "../../utils/guarantorReferralStorage";


// Helper: Format Currency
const formatCurrency = (amount) => {
  const val = Math.round(Number(amount || 0));
  return `₹${val.toLocaleString("en-IN")}`;
};

// Summary KPI Card
const SummaryCard = ({ icon: Icon, title, value, subtitle }) => {
  return (
    <div className="min-h-[96px] h-full rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs transition-shadow hover:shadow-md min-w-0 w-full">
      <div className="flex h-full items-center gap-3.5 sm:gap-4 min-w-0">
        <div className="flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
          <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-700" strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm font-medium text-slate-500 mb-0.5 sm:mb-1 leading-snug break-words">
            {title}
          </p>
          <p className="text-base sm:text-lg lg:text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap leading-tight">
            {value}
          </p>
          {subtitle && (
            <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
};

const ReferralCommission = () => {
  const navigate = useNavigate();

  const [commissions, setCommissions] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All"); // "All" | "Pending" | "Paid"
  
  // Modal states
  const [payModalItem, setPayModalItem] = useState(null);
  const [payMode, setPayMode] = useState("Cash");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payNotes, setPayNotes] = useState("");

  // Edit / Add Commission Rate Modal
  const [editModalItem, setEditModalItem] = useState(null);
  const [editPercentage, setEditPercentage] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newCommission, setNewCommission] = useState({
    referrerName: "",
    referrerPhone: "",
    customerName: "",
    loanId: "",
    loanAmount: "",
    percentage: "2",
    commissionAmount: "",
    notes: "",
  });

  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleOpenEditModal = (item) => {
    setEditModalItem(item);
    setEditPercentage(item.percentage ? String(item.percentage) : "");
    setEditNotes(item.notes || "");
  };

  const editCalculatedAmount = useMemo(() => {
    if (!editModalItem) return 0;
    const loanAmt = Number(editModalItem.loanAmount || 0);
    const pct = Number(editPercentage || 0);
    if (loanAmt > 0 && pct > 0) {
      return Math.round((loanAmt * pct) / 100);
    }
    return 0;
  }, [editModalItem, editPercentage]);

  // Saves the new percentage on the server, which recalculates the amount and,
  // for a paid commission, updates its existing expense. A referral noted on
  // an older loan gets its commission record first (as Pay does).
  const handleSaveCommissionRate = async (e) => {
    e.preventDefault();
    if (!editModalItem || saving) return;

    const numPct = Number(editPercentage);
    if (isNaN(numPct) || numPct < 0) {
      alert("Please enter a valid non-negative commission percentage.");
      return;
    }

    setSaving(true);
    try {
      let commissionId = editModalItem.id;
      if (editModalItem.legacy) {
        const created = await apiPost("/referrals", {
          agentName: editModalItem.referrerName,
          customerName: editModalItem.customerName,
          loanNumber: editModalItem.loanId,
          loanAmount: editModalItem.loanAmount,
          amount: editModalItem.commissionAmount,
          remarks: editModalItem.notes,
        });
        commissionId = created.id;
      }

      await updateReferralCommissionRate({
        commissionId,
        loanId: editModalItem.loanId,
        percentage: numPct,
        commissionAmount: editCalculatedAmount,
        notes: editNotes,
      });

      await loadCommissions();
      setEditModalItem(null);
    } catch (err) {
      alert(err.message || "Could not update the commission percentage.");
    } finally {
      setSaving(false);
    }
  };

  // Commissions from the API, plus referrals noted on older loans that have
  // no commission record yet (paying one creates its record first).
  const loadCommissions = async () => {
    try {
      const [referrals, entries] = await Promise.all([apiGet("/referrals"), loadCustomerEntries()]);

      const items = referrals.map((r) => ({
        id: r.id,
        referralId: r.personId || "",
        referrerName: r.agentName || "Referrer",
        referrerPhone: r.agentPhone || "—",
        customerName: r.customerName || "—",
        customerId: r.customerId || "—",
        loanId: r.loanId || "—",
        loanAmount: Number(r.loanAmount) || 0,
        percentage: Number(r.percentage) || 0,
        commissionAmount: Number(r.amount) || 0,
        status: r.status,
        paidDate: r.paidDate || null,
        paymentMode: r.paymentMode || null,
        notes: r.remarks || "",
        createdAt: r.commissionDate || r.createdAt,
      }));

      entries.forEach((c) => {
        const refName = (c.loan?.referredBy || "").trim();
        const amount = Number(c.referredByCommission || 0);
        if (!refName || !(amount > 0) || items.some((item) => item.loanId === c.loanId)) return;
        items.push({
          id: `legacy-${c.loanId}`,
          legacy: true,
          referralId: "",
          referrerName: refName,
          referrerPhone: "—",
          customerName: c.customer?.name || "Customer",
          customerId: c.customerId || "—",
          loanId: c.loanId,
          loanAmount: Number(c.loanAmount) || 0,
          percentage: 0,
          commissionAmount: amount,
          status: "Pending",
          paidDate: null,
          paymentMode: null,
          notes: "Commission recorded from loan referral",
          createdAt: c.customer?.applicationDate || c.createdAt,
        });
      });

      setCommissions(items);
      setLoadError("");
    } catch (err) {
      console.error("Failed to load referral commissions:", err);
      setLoadError(err.message || "Could not load referral commissions.");
    }
  };

  useEffect(() => {
    loadCommissions();
    window.addEventListener(DATA_CHANGED_EVENT, loadCommissions);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, loadCommissions);
  }, []);

  // Filtered commissions
  const filteredCommissions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return commissions.filter((c) => {
      const matchSearch =
        !q ||
        c.referrerName?.toLowerCase().includes(q) ||
        c.referrerPhone?.includes(q) ||
        c.customerName?.toLowerCase().includes(q) ||
        c.loanId?.toLowerCase().includes(q);

      const matchStatus = statusFilter === "All" || c.status === statusFilter;

      return matchSearch && matchStatus;
    });
  }, [commissions, search, statusFilter]);

  // KPI Metrics
  const totalCommission = useMemo(
    () => commissions.reduce((sum, c) => sum + Number(c.commissionAmount || 0), 0),
    [commissions]
  );

  const totalPaid = useMemo(
    () =>
      commissions
        .filter((c) => c.status === "Paid")
        .reduce((sum, c) => sum + Number(c.commissionAmount || 0), 0),
    [commissions]
  );

  const totalPending = useMemo(
    () =>
      commissions
        .filter((c) => c.status === "Pending")
        .reduce((sum, c) => sum + Number(c.commissionAmount || 0), 0),
    [commissions]
  );

  const uniqueReferrersCount = useMemo(() => {
    const names = new Set(commissions.map((c) => c.referrerName?.toLowerCase().trim()).filter(Boolean));
    return names.size;
  }, [commissions]);

  // Handle Mark as Paid — the server books the Referral Commission expense.
  const handleConfirmPayment = async () => {
    if (!payModalItem || saving) return;

    setSaving(true);
    try {
      let commissionId = payModalItem.id;
      if (payModalItem.legacy) {
        const created = await apiPost("/referrals", {
          agentName: payModalItem.referrerName,
          customerName: payModalItem.customerName,
          loanNumber: payModalItem.loanId,
          loanAmount: payModalItem.loanAmount,
          amount: payModalItem.commissionAmount,
          remarks: payModalItem.notes,
        });
        commissionId = created.id;
      }

      await markReferralCommissionPaid({
        commissionId,
        paidDate: payDate,
        paymentMode: payMode,
        notes: payNotes || `Commission paid to ${payModalItem.referrerName} for loan ${payModalItem.loanId}`,
      });

      setPayModalItem(null);
      setPayNotes("");
    } catch (err) {
      alert(err.message || "Could not record the payment.");
    } finally {
      setSaving(false);
    }
  };

  // Handle Add Manual Commission — recorded as Pending; paying it books the expense.
  const handleSaveNewCommission = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!newCommission.referrerName.trim() || !newCommission.commissionAmount) {
      alert("Please enter referrer name and commission amount.");
      return;
    }

    setSaving(true);
    try {
      await apiPost("/referrals", {
        agentName: newCommission.referrerName.trim(),
        agentPhone: newCommission.referrerPhone.trim(),
        customerName: newCommission.customerName.trim(),
        loanNumber: newCommission.loanId.trim(),
        loanAmount: Number(newCommission.loanAmount) || 0,
        percentage: Number(newCommission.percentage) || 0,
        amount: Number(newCommission.commissionAmount) || 0,
        remarks: newCommission.notes || "Manual referral commission entry",
      });
    } catch (err) {
      alert(err.message || "Could not save the commission.");
      return;
    } finally {
      setSaving(false);
    }

    setIsAddModalOpen(false);
    setNewCommission({
      referrerName: "",
      referrerPhone: "",
      customerName: "",
      loanId: "",
      loanAmount: "",
      percentage: "2",
      commissionAmount: "",
      notes: "",
    });
  };

  return (
    <div className="min-h-screen bg-white px-3 pb-8 pt-2 sm:px-6 lg:px-8">
      {loadError && (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          Could not load referral commissions: {loadError}
        </div>
      )}
      {/* =========================================================
          PAGE HEADER
      ========================================================= */}
      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/customers")}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-2xs transition-all duration-150 hover:border-slate-300 hover:bg-slate-50 hover:text-[#06483f] focus:border-[#006052] focus:outline-none focus:ring-2 focus:ring-[#006052]/20 active:scale-95 active:bg-slate-100 cursor-pointer"
            aria-label="Back to Customers"
            title="Back to Customers"
          >
            <Undo2 className="h-4 w-4" strokeWidth={2.2} />
          </button>
          <div>
            <h1 className="page-title">
              Referral Commission
            </h1>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#006052] px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-[#004d42] active:bg-[#003d34] transition-colors focus:outline-none focus:ring-2 focus:ring-[#006052] focus:ring-offset-1 cursor-pointer shrink-0"
          >
            <Plus className="h-4 w-4" strokeWidth={2.2} />
            <span>Add Commission</span>
          </button>
        </div>
      </div>

      {/* =========================================================
          KPI SUMMARY CARDS
      ========================================================= */}
      <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <SummaryCard
          icon={Coins}
          title="Total Commission"
          value={formatCurrency(totalCommission)}
          subtitle="All referred loan commissions"
        />
        <SummaryCard
          icon={CheckCircle2}
          title="Commission Paid"
          value={formatCurrency(totalPaid)}
          subtitle="Disbursed to referrers"
        />
        <SummaryCard
          icon={Clock}
          title="Pending Payouts"
          value={formatCurrency(totalPending)}
          subtitle="Awaiting disbursement"
        />
        <SummaryCard
          icon={Users}
          title="Active Referrers"
          value={uniqueReferrersCount.toString()}
          subtitle="Distinct referral partners"
        />
      </div>

      {/* =========================================================
          FILTER & SEARCH TOOLBAR
      ========================================================= */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Referrer, Customer, Loan ID, or Mobile..."
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-4 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#006052] focus:outline-none focus:ring-1 focus:ring-[#006052]/30 shadow-2xs"
          />
        </div>

        {/* Status Filter Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs font-semibold text-slate-500 mr-1 flex items-center gap-1">
            <Filter className="h-3.5 w-3.5" />
            <span>Status:</span>
          </span>
          {["All", "Pending", "Paid"].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                statusFilter === st
                  ? "bg-[#006052] text-white shadow-2xs"
                  : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* =========================================================
          COMMISSION RECORDS TABLE
      ========================================================= */}
      <div className="mt-4 rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                <th className="px-4 py-3.5">Referrer</th>
                <th className="px-4 py-3.5">Customer & Loan</th>
                <th className="px-4 py-3.5 text-right">Loan Amount</th>
                <th className="px-4 py-3.5 text-center">Rate</th>
                <th className="px-4 py-3.5 text-right">Commission</th>
                <th className="px-4 py-3.5 text-center">Status</th>
                <th className="px-4 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCommissions.length > 0 ? (
                filteredCommissions.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Referrer */}
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-slate-900">{row.referrerName}</div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <Phone className="h-3 w-3 text-slate-400" />
                        <span>{row.referrerPhone || "—"}</span>
                      </div>
                    </td>

                    {/* Customer & Loan */}
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-slate-800">{row.customerName}</div>
                      <div className="font-mono text-[11px] font-bold text-[#006052] bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded w-fit mt-0.5">
                        {row.loanId}
                      </div>
                    </td>

                    {/* Loan Amount */}
                    <td className="px-4 py-3.5 text-right font-medium text-slate-700">
                      {formatCurrency(row.loanAmount)}
                    </td>

                    {/* Rate */}
                    <td className="px-4 py-3.5 text-center">
                      <div className="inline-flex items-center gap-1">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 border border-slate-200">
                          {row.percentage ? `${row.percentage}%` : "—"}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(row)}
                          className="p-1 text-slate-400 hover:text-[#006052] hover:bg-emerald-50 rounded transition cursor-pointer"
                          title="Edit Commission Rate (%)"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      </div>
                    </td>

                    {/* Commission Amount */}
                    <td className="px-4 py-3.5 text-right font-bold text-slate-900">
                      {formatCurrency(row.commissionAmount)}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3.5 text-center">
                      {row.status === "Paid" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                          <Check className="h-3 w-3" strokeWidth={2.5} />
                          <span>Paid</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                          <Clock className="h-3 w-3" strokeWidth={2.5} />
                          <span>Pending</span>
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {row.status === "Pending" ? (
                          <>
                            {Number(row.commissionAmount || 0) > 0 ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setPayModalItem(row);
                                  setPayDate(new Date().toISOString().slice(0, 10));
                                  setPayMode("Cash");
                                  setPayNotes("");
                                }}
                                className="inline-flex items-center gap-1 rounded-md bg-[#006052] px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-[#004d42] transition cursor-pointer"
                              >
                                <Coins className="h-3 w-3" />
                                <span>Pay Commission</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(row)}
                                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 transition cursor-pointer"
                              >
                                <Plus className="h-3 w-3" />
                                <span>Add Commission</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(row)}
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition cursor-pointer"
                              title="Edit Commission (%)"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="text-[11px] text-slate-500 text-right">
                              <div>Paid on {row.paidDate || "—"}</div>
                              <div className="font-semibold text-slate-600">via {row.paymentMode || "Cash"}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(row)}
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition cursor-pointer"
                              title="Edit Commission Rate (Preserves Payment)"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center text-[#006052] mb-3 border border-emerald-100">
                        <Coins className="h-6 w-6" />
                      </div>
                      <h4 className="text-sm font-bold text-slate-800">No commission records found</h4>
                      <p className="text-xs text-slate-500 mt-1 max-w-sm">
                        {search || statusFilter !== "All"
                          ? "No commission entries match your current search or status filter."
                          : "Referrals from customer applications will automatically appear here with calculated commissions."}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =========================================================
          PAY COMMISSION MODAL
      ========================================================= */}
      {payModalItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity"
          onClick={() => setPayModalItem(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-100 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 bg-emerald-50/70">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-[#006052]">
                  <Coins className="h-4 w-4" />
                </span>
                <h3 className="text-sm font-bold text-slate-900">Record Commission Payment</h3>
              </div>
              <button
                type="button"
                onClick={() => setPayModalItem(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-200/80 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Referrer:</span>
                  <span className="font-bold text-slate-900">{payModalItem.referrerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Referred Loan:</span>
                  <span className="font-mono font-bold text-[#006052]">{payModalItem.loanId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Customer:</span>
                  <span className="font-semibold text-slate-800">{payModalItem.customerName}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200">
                  <span className="text-slate-600 font-semibold">Commission Payout:</span>
                  <span className="text-sm font-bold text-[#006052]">
                    {formatCurrency(payModalItem.commissionAmount)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Payment Date
                </label>
                <input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs sm:text-sm text-slate-800 focus:border-[#006052] focus:outline-none focus:ring-1 focus:ring-[#006052]/30"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Payment Mode
                </label>
                <select
                  value={payMode}
                  onChange={(e) => setPayMode(e.target.value)}
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs sm:text-sm text-slate-800 focus:border-[#006052] focus:outline-none focus:ring-1 focus:ring-[#006052]/30"
                >
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer (NEFT/IMPS)</option>
                  <option value="UPI">UPI</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reference Note (Optional)
                </label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="e.g. UPI Ref / Cash voucher number"
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs sm:text-sm text-slate-800 focus:border-[#006052] focus:outline-none focus:ring-1 focus:ring-[#006052]/30"
                />
              </div>
            </div>

            <div className="border-t border-slate-100 bg-slate-50 px-5 py-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPayModalItem(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPayment}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#006052] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#004d42] transition cursor-pointer"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Confirm Payment</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          ADD MANUAL COMMISSION MODAL
      ========================================================= */}
      {isAddModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity"
          onClick={() => setIsAddModalOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-100 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 bg-emerald-50/70">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-[#006052]">
                  <Plus className="h-4 w-4" />
                </span>
                <h3 className="text-sm font-bold text-slate-900">Add Referral Commission</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveNewCommission} className="p-5 space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Referrer Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newCommission.referrerName}
                    onChange={(e) =>
                      setNewCommission({ ...newCommission, referrerName: e.target.value })
                    }
                    placeholder="Enter referrer name"
                    className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs sm:text-sm text-slate-800 focus:border-[#006052] focus:outline-none focus:ring-1 focus:ring-[#006052]/30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Referrer Phone
                  </label>
                  <input
                    type="tel"
                    value={newCommission.referrerPhone}
                    onChange={(e) =>
                      setNewCommission({ ...newCommission, referrerPhone: e.target.value })
                    }
                    placeholder="10-digit mobile"
                    className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs sm:text-sm font-mono text-slate-800 focus:border-[#006052] focus:outline-none focus:ring-1 focus:ring-[#006052]/30"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Customer Name
                  </label>
                  <input
                    type="text"
                    value={newCommission.customerName}
                    onChange={(e) =>
                      setNewCommission({ ...newCommission, customerName: e.target.value })
                    }
                    placeholder="Referred customer"
                    className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs sm:text-sm text-slate-800 focus:border-[#006052] focus:outline-none focus:ring-1 focus:ring-[#006052]/30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Loan ID
                  </label>
                  <input
                    type="text"
                    value={newCommission.loanId}
                    onChange={(e) =>
                      setNewCommission({ ...newCommission, loanId: e.target.value })
                    }
                    placeholder="e.g. LN00001"
                    className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs sm:text-sm font-mono text-slate-800 focus:border-[#006052] focus:outline-none focus:ring-1 focus:ring-[#006052]/30"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Loan Amount
                  </label>
                  <input
                    type="number"
                    value={newCommission.loanAmount}
                    onChange={(e) => {
                      const lAmt = e.target.value;
                      const pct = Number(newCommission.percentage) || 0;
                      const cAmt = lAmt && pct ? Math.round((Number(lAmt) * pct) / 100) : newCommission.commissionAmount;
                      setNewCommission({
                        ...newCommission,
                        loanAmount: lAmt,
                        commissionAmount: cAmt.toString(),
                      });
                    }}
                    placeholder="₹ 50,000"
                    className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs sm:text-sm text-slate-800 focus:border-[#006052] focus:outline-none focus:ring-1 focus:ring-[#006052]/30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Commission (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={newCommission.percentage}
                    onChange={(e) => {
                      const pct = e.target.value;
                      const lAmt = Number(newCommission.loanAmount) || 0;
                      const cAmt = lAmt && pct ? Math.round((lAmt * Number(pct)) / 100) : newCommission.commissionAmount;
                      setNewCommission({
                        ...newCommission,
                        percentage: pct,
                        commissionAmount: cAmt.toString(),
                      });
                    }}
                    placeholder="2%"
                    className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs sm:text-sm text-slate-800 focus:border-[#006052] focus:outline-none focus:ring-1 focus:ring-[#006052]/30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Commission (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    value={newCommission.commissionAmount}
                    onChange={(e) =>
                      setNewCommission({ ...newCommission, commissionAmount: e.target.value })
                    }
                    placeholder="₹ 1,000"
                    className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs sm:text-sm font-bold text-[#006052] focus:border-[#006052] focus:outline-none focus:ring-1 focus:ring-[#006052]/30"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Notes
                </label>
                <input
                  type="text"
                  value={newCommission.notes}
                  onChange={(e) =>
                    setNewCommission({ ...newCommission, notes: e.target.value })
                  }
                  placeholder="Additional remarks"
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs sm:text-sm text-slate-800 focus:border-[#006052] focus:outline-none focus:ring-1 focus:ring-[#006052]/30"
                />
              </div>

              <div className="border-t border-slate-100 pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#006052] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#004d42] transition cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Save Record</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================
          EDIT COMMISSION RATE MODAL
      ========================================================= */}
      {editModalItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity"
          onClick={() => setEditModalItem(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-100 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 bg-emerald-50/70">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-[#006052]">
                  <Percent className="h-4 w-4" />
                </span>
                <h3 className="text-sm font-bold text-slate-900">
                  {Number(editModalItem.commissionAmount || 0) > 0 ? "Edit Referral Commission" : "Add Referral Commission"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditModalItem(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCommissionRate}>
              <div className="p-5 space-y-4">
                <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-200/80 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Referrer:</span>
                    <span className="font-bold text-slate-900">{editModalItem.referrerName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Referred Loan:</span>
                    <span className="font-mono font-bold text-[#006052]">{editModalItem.loanId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Customer:</span>
                    <span className="font-semibold text-slate-800">{editModalItem.customerName}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-200">
                    <span className="text-slate-600 font-semibold">Associated Loan Amount:</span>
                    <span className="font-bold text-slate-900">
                      {formatCurrency(editModalItem.loanAmount)}
                    </span>
                  </div>
                </div>

                {editModalItem.status === "Paid" && (
                  <div className="rounded-lg bg-emerald-50/70 p-3 border border-emerald-200 text-xs text-emerald-900">
                    <p className="font-semibold">Payment Status: Paid on {editModalItem.paidDate || "—"}</p>
                    <p className="mt-0.5 text-[11px] text-emerald-700">
                      Editing the percentage recalculates the payout without overwriting payment records or creating duplicate expenses.
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Commission (%) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      required
                      value={editPercentage}
                      onChange={(e) => setEditPercentage(e.target.value)}
                      placeholder="e.g. 2.0"
                      className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 pr-8 text-xs sm:text-sm text-slate-800 focus:border-[#006052] focus:outline-none focus:ring-1 focus:ring-[#006052]/30"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      %
                    </span>
                  </div>
                </div>

                {/* Real-time Dynamic Calculation */}
                <div className="rounded-lg bg-emerald-50/50 p-3 border border-emerald-100 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Calculated Commission Amount</span>
                    <span className="text-[11px] font-mono text-slate-400">
                      ₹{Number(editModalItem.loanAmount || 0).toLocaleString("en-IN")} × {editPercentage || 0}% ÷ 100
                    </span>
                  </div>
                  <span className="text-sm font-bold text-[#006052]">
                    {formatCurrency(editCalculatedAmount)}
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Notes (Optional)
                  </label>
                  <input
                    type="text"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="e.g. Standard referral commission"
                    className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs sm:text-sm text-slate-800 focus:border-[#006052] focus:outline-none focus:ring-1 focus:ring-[#006052]/30"
                  />
                </div>
              </div>

              <div className="border-t border-slate-100 bg-slate-50 px-5 py-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditModalItem(null)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#006052] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#004d42] transition cursor-pointer"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Save Commission</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReferralCommission;
