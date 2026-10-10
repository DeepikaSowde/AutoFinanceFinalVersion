import { useState, useMemo, useEffect } from "react";
import { Search, Calendar as CalendarIcon, CheckCircle2, X, Wallet, AlertCircle, CheckCircle, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { loadCustomerEntries } from "../../services/customerApi";
import { loadPayments, recordCollection } from "../../services/collectionApi";

const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

// Helper: Calculate if a date is today, past, or future relative to reference date
const getDayDiff = (targetDateStr, referenceDateStr) => {
  const ref = new Date(referenceDateStr);
  ref.setHours(0,0,0,0);
  const target = new Date(targetDateStr);
  target.setHours(0,0,0,0);
  return Math.round((target - ref) / (1000 * 60 * 60 * 24));
};

const SummaryCard = ({ icon: Icon, title, value, subtext, accentClass }) => (
  <div className="flex-1 min-w-[200px] rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
    <div className="flex items-center gap-4">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${accentClass}`}>
        <Icon className="h-6 w-6" strokeWidth={2} />
      </div>
      <div>
        <p className="text-[14px] font-semibold text-slate-500">{title}</p>
        <div className="flex items-end gap-2 mt-1">
          <p className="text-2xl font-bold tracking-tight text-slate-900">{value}</p>
          <span className="text-[13px] font-medium text-slate-500 mb-1">{subtext}</span>
        </div>
      </div>
    </div>
  </div>
);

const Collection = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState("Today"); // "Today" or "Overdue"
  const [overdueFilter, setOverdueFilter] = useState("All"); // "All", "1", "2", "3+"
  const [search, setSearch] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0,10));

  const [customers, setCustomers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [clientRef, setClientRef] = useState("");
  
  // Modal state
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [collectAmount, setCollectAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [remarks, setRemarks] = useState("");

  useEffect(() => {
    let active = true;

    Promise.all([loadCustomerEntries(), loadPayments()])
      .then(([entries, posted]) => {
        if (!active) return;
        setCustomers(entries);
        setPayments(posted);
        setLoadError("");
      })
      .catch((error) => active && setLoadError(error.message))
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [reloadKey]);

  // Compute processed data
  const processedCustomers = useMemo(() => {
    return customers.map(c => {
      const schedule = c.repaymentSchedule || [];
      const overdueInstalls = schedule.filter(s => s.status !== 'Collected' && (s.emi - (s.amountPaid || 0)) > 0 && getDayDiff(s.dueDate, date) < 0);
      const todayInstalls = schedule.filter(s => getDayDiff(s.dueDate, date) === 0);
      
      const isDueToday = todayInstalls.length > 0;
      const isOverdue = overdueInstalls.length > 0;
      
      const totalDueToday = todayInstalls.reduce((sum, s) => sum + Math.max(0, s.emi - (s.amountPaid || 0)), 0);
      const totalOverdue = overdueInstalls.reduce((sum, s) => sum + Math.max(0, s.emi - (s.amountPaid || 0)), 0);
      
      const originalDueToday = todayInstalls.reduce((sum, s) => sum + s.emi, 0);
      const originalOverdue = overdueInstalls.reduce((sum, s) => sum + s.emi, 0);
      
      const activeInstalls = [...overdueInstalls, ...todayInstalls];
      let statusText = "Pending";
      
      if (activeInstalls.length > 0) {
        const allCollected = activeInstalls.every(s => s.status === 'Collected' || (s.amountPaid || 0) >= s.emi);
        const anyPartial = activeInstalls.some(s => s.status === 'Partial' || ((s.amountPaid || 0) > 0 && (s.amountPaid || 0) < s.emi));
        
        if (allCollected) {
          statusText = "Collected";
        } else if (anyPartial) {
          statusText = "Partial";
        }
      }

      return {
        ...c,
        isDueToday,
        isOverdue,
        overdueCount: overdueInstalls.length,
        totalDueToday,
        totalOverdue,
        originalDueToday,
        originalOverdue,
        currentTotalDue: totalDueToday + totalOverdue,
        statusText,
        overdueInstalls,
        todayInstalls,
        schedule
      };
    }).filter(c => c.isDueToday || c.isOverdue);
  }, [customers, date]);

  const todayList = processedCustomers.filter(c => c.isDueToday);
  const overdueList = processedCustomers.filter(c => c.isOverdue);
  
  // Search and Filter
  const getFilteredList = (list) => {
    return list.filter(c => {
      if (activeTab === 'Overdue' && overdueFilter !== 'All') {
        if (overdueFilter === '1' && c.overdueCount !== 1) return false;
        if (overdueFilter === '2' && c.overdueCount !== 2) return false;
        if (overdueFilter === '3+' && c.overdueCount < 3) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const name = c.customer?.name?.toLowerCase() || "";
        const loanId = c.loanId?.toLowerCase() || "";
        const vehicle = c.vehicle?.regNo?.toLowerCase() || "";
        if (!name.includes(q) && !loanId.includes(q) && !vehicle.includes(q)) return false;
      }
      return true;
    });
  };

  const currentDisplayList = getFilteredList(activeTab === 'Today' ? todayList : overdueList);

  // KPIs
  // KPIs
  const totalTodayDueAmount = todayList.reduce((sum, c) => sum + c.totalDueToday, 0);
  const totalOverdueAmount = overdueList.reduce((sum, c) => sum + c.totalOverdue, 0);
  
  const paymentHistory = payments;
  const todaysPayments = paymentHistory.filter(p => p.date && p.date.startsWith(date));
  const collectedTodayAmount = todaysPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const collectedTodayCount = todaysPayments.length;

  const handleCollectClick = (c) => {
    setSelectedCustomer(c);
    setCollectAmount(c.currentTotalDue || "");
    setPaymentMode("Cash");
    setRemarks("");
    setClientRef(crypto.randomUUID());
  };

  // The server splits the payment across installments (oldest first,
  // interest before principal) and updates the schedule in one step.
  const handleFinalSave = async () => {
    if (!collectAmount || isNaN(collectAmount) || Number(collectAmount) <= 0) {
      alert("Please enter a valid amount.");
      return;
    }
    if (saving) return;

    setSaving(true);
    try {
      await recordCollection({
        entry: selectedCustomer,
        amount: Number(collectAmount),
        paymentMode,
        remarks,
        dueAmount: selectedCustomer.currentTotalDue,
        clientRef,
      });
      setSelectedCustomer(null);
      setReloadKey((key) => key + 1);
    } catch (error) {
      alert(error.message || "Could not save the payment.");
    } finally {
      setSaving(false);
    }
  };

  const handleView = (c) => {
    navigate('/customers'); // Simplification: route to customers
  };

  return (
    <div className="flex flex-col flex-1 h-full bg-slate-50 px-4 sm:px-6 lg:px-8 py-6 pb-8">
      {loadError && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load collections: {loadError}{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => {
              setLoading(true);
              setReloadKey((key) => key + 1);
            }}
          >
            Retry
          </button>
        </div>
      )}
      {loading && !loadError && <p className="mb-4 text-sm text-slate-500">Loading collections…</p>}

      {/* HEADER + SEARCH + DATE ROW */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between shrink-0 mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-slate-900 sm:text-3xl">Collection</h1>
          <p className="mt-2 text-[15px] text-slate-500">Today's dues and overdue payments</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative w-full sm:w-[260px]">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search Customer / Vehicle No."
              className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 text-[14px] text-slate-800 outline-none placeholder:text-slate-400 focus:border-[#006052] focus:ring-1 focus:ring-[#006052] shadow-sm transition-all"
            />
          </div>
          
          <div className="relative w-full sm:w-[150px]">
            <CalendarIcon className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 text-[14px] font-medium text-slate-700 shadow-sm outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052] transition-all cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* SEGMENTED SWITCH & FILTERS ROW */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 shrink-0">
        <div className="flex w-full sm:w-auto bg-slate-100 p-1 rounded-xl shadow-sm border border-slate-200 shrink-0">
          <button
            onClick={() => setActiveTab('Today')}
            className={`flex-1 sm:flex-none flex justify-center items-center gap-2 px-6 py-2.5 text-[14px] font-bold rounded-lg transition-all duration-200 ${
              activeTab === 'Today' 
                ? 'bg-[#006052] text-white shadow-sm' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            Today's Collection
            <span className={`px-2 py-0.5 rounded-full text-[12px] font-semibold ${activeTab === 'Today' ? 'bg-white/20 text-white' : 'bg-white text-slate-500 shadow-sm'}`}>
              {todayList.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('Overdue')}
            className={`flex-1 sm:flex-none flex justify-center items-center gap-2 px-6 py-2.5 text-[14px] font-bold rounded-lg transition-all duration-200 ${
              activeTab === 'Overdue' 
                ? 'bg-[#006052] text-white shadow-sm' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            Overdue Collection
            <span className={`px-2 py-0.5 rounded-full text-[12px] font-semibold ${activeTab === 'Overdue' ? 'bg-white/20 text-white' : 'bg-white text-slate-500 shadow-sm'}`}>
              {overdueList.length}
            </span>
          </button>
        </div>

        {activeTab === 'Overdue' && (
          <div className="inline-flex flex-wrap gap-2 w-full sm:w-auto">
            {['All', '1', '2', '3+'].map(f => (
              <button
                key={f}
                onClick={() => setOverdueFilter(f)}
                className={`flex-1 sm:flex-none px-4 py-1.5 text-[13px] font-semibold rounded-full transition-all border ${
                  overdueFilter === f 
                    ? 'bg-slate-800 border-slate-800 text-white shadow-sm' 
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {f === 'All' ? 'All' : `${f} Overdue`}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="flex flex-col sm:flex-row gap-4 shrink-0 mb-4">
        <SummaryCard 
          icon={Wallet}
          title="Today's Due" 
          value={formatCurrency(totalTodayDueAmount)} 
          subtext={`${todayList.length} ${todayList.length === 1 ? 'Customer' : 'Customers'}`}
          accentClass="bg-emerald-50 text-emerald-600 border border-emerald-100"
        />
        <SummaryCard 
          icon={AlertCircle}
          title="Overdue" 
          value={formatCurrency(totalOverdueAmount)} 
          subtext={`${overdueList.length} ${overdueList.length === 1 ? 'Customer' : 'Customers'}`}
          accentClass="bg-red-50 text-red-600 border border-red-100"
        />
        <SummaryCard 
          icon={CheckCircle}
          title="Collected Today" 
          value={formatCurrency(collectedTodayAmount)} 
          subtext={`${collectedTodayCount} ${collectedTodayCount === 1 ? 'Payment' : 'Payments'}`}
          accentClass="bg-teal-50 text-teal-600 border border-teal-100"
        />
      </div>

      {/* TABLE */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-slate-50 z-10 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5 text-[12px] font-bold uppercase tracking-wider text-slate-600 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200">Customer ID</th>
                <th className="px-6 py-3.5 text-[12px] font-bold uppercase tracking-wider text-slate-600 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200">Customer</th>
                <th className="px-6 py-3.5 text-[12px] font-bold uppercase tracking-wider text-slate-600 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200">{activeTab === 'Today' ? 'Due Amount' : 'Overdue Amount'}</th>
                <th className="px-6 py-3.5 text-[12px] font-bold uppercase tracking-wider text-slate-600 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200">Status</th>
                <th className="px-6 py-3.5 text-[12px] font-bold uppercase tracking-wider text-slate-600 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {currentDisplayList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-400">
                      <p className="text-[15px] font-semibold text-slate-600">No collections for this date</p>
                      <p className="text-[13px] mt-1">There are no pending collections for the selected date.</p>
                    </div>
                  </td>
                </tr>
              ) : currentDisplayList.map(c => (
                <tr key={c.loanId} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <p className="text-[14px] text-slate-600 font-bold">{c.customerId}</p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <p className="font-bold text-[14px] text-slate-900">{c.customer?.name}</p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <p className="font-bold text-[14px] text-slate-900">
                      {c.statusText === "Collected" 
                        ? `${formatCurrency(activeTab === 'Today' ? c.originalDueToday : c.originalOverdue)}` 
                        : formatCurrency(activeTab === 'Today' ? c.totalDueToday : c.totalOverdue)}
                    </p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {c.statusText === "Pending" && (
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-[12px] font-bold text-slate-700 ring-1 ring-inset ring-slate-500/20">
                        Pending
                      </span>
                    )}
                    {c.statusText === "Collected" && (
                      <span className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-1 text-[12px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                        Collected
                      </span>
                    )}
                    {c.statusText === "Partial" && (
                      <span className="inline-flex items-center rounded-md bg-amber-50 px-2.5 py-1 text-[12px] font-bold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                        Partial
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right whitespace-nowrap">
                    <div className="flex justify-end gap-2">
                      {c.statusText !== "Collected" && (
                        <button onClick={() => handleCollectClick(c)} className="rounded-md bg-[#006052] px-5 py-2.5 text-[13px] font-bold text-white shadow-sm hover:bg-[#004d43] transition-colors">Collect Payment</button>
                      )}
                      <button onClick={() => handleView(c)} className="rounded-md bg-white border border-slate-300 px-5 py-2.5 text-[13px] font-bold text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900 transition-colors">View Details</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* COLLECTION MODAL */}
      {selectedCustomer && (() => {
        const totalDue = selectedCustomer.currentTotalDue;
        const amountReceived = Number(collectAmount) || 0;
        
        let paymentType = "";
        let remaining = 0;
        let advance = 0;
        
        if (amountReceived > 0) {
          if (amountReceived < totalDue) {
            paymentType = "PARTIAL";
            remaining = totalDue - amountReceived;
          } else if (amountReceived === totalDue) {
            paymentType = "FULL";
          } else {
            paymentType = "EXCESS";
            advance = amountReceived - totalDue;
          }
        }

        let remainingToAllocate = amountReceived;
        const installsToClear = activeTab === 'Today' ? [...selectedCustomer.overdueInstalls, ...selectedCustomer.todayInstalls] : selectedCustomer.overdueInstalls;
        
        const allocationPreview = installsToClear.map(s => {
          const due = s.emi - s.amountPaid;
          if (due <= 0) return { ...s, previewStatus: 'Collected', allocated: 0 };
          const alloc = Math.min(due, Math.max(0, remainingToAllocate));
          remainingToAllocate -= alloc;
          const newAmountPaid = s.amountPaid + alloc;
          const previewStatus = newAmountPaid >= s.emi ? 'Collected' : (newAmountPaid > s.amountPaid ? 'Partial' : 'Pending');
          return { ...s, previewStatus, allocated: alloc, dueAmount: due };
        });

        const isValid = amountReceived > 0;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-[480px] rounded-xl bg-white shadow-2xl relative max-h-[95vh] overflow-y-auto flex flex-col">
              
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 sticky top-0 bg-white z-10 rounded-t-xl">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Collect Payment</h3>
                  <p className="text-[14px] text-slate-500 mt-0.5">
                    <span className="font-semibold text-slate-800">{selectedCustomer.customer?.name}</span> · {selectedCustomer.loanId}
                  </p>
                </div>
                <button onClick={() => setSelectedCustomer(null)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 flex flex-col gap-6">
                
                {/* Payment Due Summary */}
                <div>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">Payment Summary</h4>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 overflow-hidden text-[13px] font-medium">
                    {(() => {
                      const originalDue = installsToClear.reduce((acc, s) => acc + s.emi, 0);
                      const alreadyPaid = installsToClear.reduce((acc, s) => acc + (s.amountPaid || 0), 0);
                      
                      return (
                        <>
                          <div className="flex justify-between px-4 py-3 border-b border-slate-100">
                            <span className="text-slate-600">Original Due</span>
                            <span className="text-slate-900">{formatCurrency(originalDue)}</span>
                          </div>
                          <div className="flex justify-between px-4 py-3 border-b border-slate-100">
                            <span className="text-slate-600">Already Paid</span>
                            <span className="text-slate-900">{formatCurrency(alreadyPaid)}</span>
                          </div>
                          <div className="flex justify-between px-4 py-3 bg-slate-100">
                            <span className="font-bold text-slate-700">Remaining</span>
                            <span className="text-[16px] font-black text-slate-900">{formatCurrency(totalDue)}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Amount Received Input */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Amount Received <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-medium text-slate-400">₹</span>
                    <input 
                      type="number" 
                      value={collectAmount} 
                      onChange={e => setCollectAmount(e.target.value)} 
                      className="w-full rounded-lg border border-slate-300 bg-white py-3 pl-8 pr-4 text-xl font-bold text-slate-900 shadow-sm outline-none transition-colors focus:border-[#006052] focus:ring-1 focus:ring-[#006052]" 
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {/* Automatic Detection */}
                {paymentType === "PARTIAL" && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="h-5 w-5 text-amber-600" />
                      <span className="font-bold text-amber-800">PARTIAL PAYMENT</span>
                    </div>
                    <div className="flex justify-between text-[13px] font-medium text-amber-900 mb-1">
                      <span>Received:</span>
                      <span>{formatCurrency(amountReceived)}</span>
                    </div>
                    <div className="flex justify-between text-[13px] font-bold text-amber-900">
                      <span>Remaining:</span>
                      <span>{formatCurrency(remaining)}</span>
                    </div>
                  </div>
                )}
                
                {paymentType === "FULL" && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      <span className="font-bold text-emerald-800">FULL PAYMENT</span>
                    </div>
                    <p className="text-[13px] font-medium text-emerald-900 mb-2">All current dues will be cleared.</p>
                    <div className="flex justify-between text-[13px] font-bold text-emerald-900">
                      <span>Remaining Due:</span>
                      <span>{formatCurrency(0)}</span>
                    </div>
                  </div>
                )}

                {paymentType === "EXCESS" && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="h-5 w-5 text-blue-600" />
                      <span className="font-bold text-blue-800">EXCESS / ADVANCE PAYMENT</span>
                    </div>
                    <p className="text-[13px] font-medium text-blue-900 mb-2">Current dues will be fully paid.</p>
                    <div className="flex justify-between text-[13px] font-bold text-blue-900">
                      <span>Advance Amount:</span>
                      <span>{formatCurrency(advance)}</span>
                    </div>
                  </div>
                )}

                {/* Allocation Preview */}
                {amountReceived > 0 && (
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">Payment Allocation</h4>
                    <div className="space-y-2">
                      {allocationPreview.map(s => (
                        <div key={s.id} className="flex items-center justify-between text-[13px]">
                          <span className="font-semibold text-slate-700 w-24">{new Date(s.dueDate).toLocaleDateString('en-GB', {month:'short', year:'numeric'})}</span>
                          <span className="text-slate-500 w-24 text-center">{formatCurrency(s.dueAmount)} due</span>
                          <span className="text-slate-900 font-bold w-24 text-right">{formatCurrency(s.allocated)} paid</span>
                          <span className={`w-20 text-right font-bold ${s.previewStatus === 'Collected' ? 'text-emerald-600' : (s.previewStatus === 'Partial' ? 'text-amber-600' : 'text-slate-400')}`}>
                            {s.previewStatus}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Form Controls */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Payment Mode</label>
                    <div className="relative">
                      <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)} className="w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-[14px] font-semibold text-slate-700 outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052]">
                        <option>Cash</option>
                        <option>UPI</option>
                        <option>Bank Transfer</option>
                        <option>Cheque</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Remarks</label>
                    <input type="text" value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional..." className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-[14px] text-slate-700 outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052]" />
                  </div>
                </div>

                {/* Final Summary */}
                {amountReceived > 0 && (
                  <div className="rounded-lg bg-slate-50 p-4 border border-slate-200">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">Payment Summary</h4>
                    <div className="space-y-2 text-[13px]">
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-medium">Amount Received</span>
                        <span className="font-bold text-slate-900">{formatCurrency(amountReceived)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-medium">Payment Type</span>
                        <span className="font-bold text-slate-900">
                          {paymentType === 'PARTIAL' ? 'Partial Payment' : (paymentType === 'FULL' ? 'Full Payment' : 'Excess / Advance')}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-medium">{paymentType === 'EXCESS' ? 'Advance Amount' : 'Remaining Due'}</span>
                        <span className="font-bold text-slate-900">{paymentType === 'EXCESS' ? formatCurrency(advance) : formatCurrency(remaining)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-medium">Payment Mode</span>
                        <span className="font-bold text-slate-900">{paymentMode}</span>
                      </div>
                    </div>
                  </div>
                )}
                
              </div>

              {/* Action Buttons */}
              <div className="border-t border-slate-100 p-6 flex gap-3 bg-slate-50 rounded-b-xl mt-auto">
                <button onClick={() => setSelectedCustomer(null)} className="flex-1 rounded-lg border border-slate-300 bg-white py-3 text-[14px] font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button 
                  onClick={handleFinalSave} 
                  disabled={!isValid || saving}
                  className="flex-1 rounded-lg bg-[#006052] py-3 text-[14px] font-bold text-white shadow-sm hover:bg-[#004d43] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? "Saving…" : "Collect Payment"}
                </button>
              </div>

            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default Collection;
