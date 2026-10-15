import { useState, useMemo, useEffect, useRef } from "react";
import { 
  Search, 
  Calendar as CalendarIcon, 
  CheckCircle2, 
  X, 
  Wallet, 
  AlertCircle, 
  CheckCircle, 
  ChevronDown, 
  CreditCard, 
  Banknote, 
  Building2, 
  Printer, 
  Clock, 
  ArrowRight,
  User,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  FileText,
  Car,
  IndianRupee,
  Layers,
  Users,
  Hash,
  Percent
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { generateSchedule, getRepaymentColumnLabel } from "../../components/RepaymentScheduleTable";

const formatCurrency = (value) => `₹${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;

const formatDate = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

// Helper: Calculate if a date is today, past, or future relative to reference date (timezone-safe)
const getDayDiff = (targetDateStr, referenceDateStr) => {
  if (!targetDateStr) return 0;
  const ref = new Date(referenceDateStr);
  ref.setHours(0, 0, 0, 0);

  let target;
  if (typeof targetDateStr === "string" && /^\d{4}-\d{2}-\d{2}$/.test(targetDateStr)) {
    const [y, m, d] = targetDateStr.split("-").map(Number);
    target = new Date(y, m - 1, d);
  } else {
    target = new Date(targetDateStr);
  }
  target.setHours(0, 0, 0, 0);

  return Math.round((target.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24));
};

const SummaryCard = ({ icon: Icon, title, value, subtext, accentClass, className = "" }) => (
  <div className={`rounded-xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-2xs hover:shadow-xs transition-shadow duration-200 min-w-0 w-full h-full flex flex-col justify-center ${className}`}>
    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
      <div className={`flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl ${accentClass}`}>
        <Icon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs sm:text-sm font-semibold text-slate-500 leading-snug truncate">{title}</p>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mt-0.5 sm:mt-1 min-w-0">
          <p className="text-base sm:text-lg lg:text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap leading-tight">
            {value}
          </p>
          {subtext && (
            <span className="text-xs font-medium text-slate-500 shrink-0 whitespace-nowrap">
              {subtext}
            </span>
          )}
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
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const [customers, setCustomers] = useState([]);

  // Collect Payment Modal states
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [collectAmount, setCollectAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [transactionId, setTransactionId] = useState("");
  const [remarks, setRemarks] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [schedulePage, setSchedulePage] = useState(1);
  const submittingRef = useRef(false);

  // Collection Details Modal state (Shared between Today and Overdue)
  const [detailsCustomer, setDetailsCustomer] = useState(null);

  // Amount Collected Successfully Modal state
  const [confirmedTransaction, setConfirmedTransaction] = useState(null);

  // Load customer data
  const loadCustomers = () => {
    try {
      const list = JSON.parse(localStorage.getItem("motoLendCustomersList_data") || "[]");
      setCustomers(list);
    } catch {
      setCustomers([]);
    }
  };

  useEffect(() => {
    loadCustomers();
    const handleStorageChange = () => loadCustomers();
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  // Lock background body scroll when any modal is open, and restore when closed
  useEffect(() => {
    if (selectedCustomer || confirmedTransaction || detailsCustomer) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [selectedCustomer, confirmedTransaction, detailsCustomer]);

  // Compute processed customers and schedules
  const processedCustomers = useMemo(() => {
    return customers.map((c) => {
      let schedule = c.repaymentSchedule;
      if (!schedule || schedule.length === 0) {
        const P = Number(c.loanAmount || (Number(c.loan?.vehicleAmount) - Number(c.loan?.downPayment || 0)) || 0);
        if (P > 0 && c.loan?.interestRate && c.loan?.tenure) {
          schedule = generateSchedule({
            loanAmount: P,
            interestRate: c.loan.interestRate,
            tenure: c.loan.tenure,
            tenureUnit: c.loan.tenureUnit || "Months",
            paymentFrequency: c.loan.paymentFrequency || c.paymentFrequency || "Monthly",
            interestType: c.loan.interestType || "Reducing Balance",
            repaymentMethod: c.loan.repaymentMethod || "EMI",
            firstDueDate: c.loan.firstDueDate || c.nextDueDate,
          });
        } else {
          schedule = [];
        }
      }

      // Check installments
      const overdueInstalls = schedule.filter(
        (s) => s.status !== "Collected" && s.status !== "Paid" && s.emi - (s.amountPaid || 0) > 0.01 && getDayDiff(s.dueDate, date) < 0
      );
      const todayInstalls = schedule.filter(
        (s) => s.status !== "Collected" && s.status !== "Paid" && s.emi - (s.amountPaid || 0) > 0.01 && getDayDiff(s.dueDate, date) === 0
      );
      const allUnpaidInstalls = schedule.filter(
        (s) => s.status !== "Collected" && s.status !== "Paid" && s.emi - (s.amountPaid || 0) > 0.01
      );

      const isDueToday = todayInstalls.length > 0;
      const isOverdue = overdueInstalls.length > 0;

      const totalDueToday = todayInstalls.reduce((sum, s) => sum + Math.max(0, s.emi - (s.amountPaid || 0)), 0);
      const totalOverdue = overdueInstalls.reduce((sum, s) => sum + Math.max(0, s.emi - (s.amountPaid || 0)), 0);
      const totalUnpaidInstallmentAmount = allUnpaidInstalls.reduce(
        (sum, s) => sum + Math.max(0, s.emi - (s.amountPaid || 0)),
        0
      );

      const originalDueToday = todayInstalls.reduce((sum, s) => sum + s.emi, 0);
      const originalOverdue = overdueInstalls.reduce((sum, s) => sum + s.emi, 0);

      const activeInstalls = [...overdueInstalls, ...todayInstalls];
      let statusText = "Pending";

      if (activeInstalls.length > 0) {
        const allCollected = activeInstalls.every((s) => s.status === "Collected" || s.status === "Paid" || (s.amountPaid || 0) >= s.emi);
        const anyPartial = activeInstalls.some(
          (s) => s.status === "Partial" || ((s.amountPaid || 0) > 0 && (s.amountPaid || 0) < s.emi)
        );

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
        totalUnpaidInstallmentAmount,
        originalDueToday,
        originalOverdue,
        currentTotalDue: totalDueToday + totalOverdue,
        statusText,
        overdueInstalls,
        todayInstalls,
        allUnpaidInstalls,
        fullSchedule: schedule,
      };
    }).filter((c) => c.isDueToday || c.isOverdue);
  }, [customers, date]);

  const todayList = processedCustomers.filter((c) => c.isDueToday);
  const overdueList = processedCustomers.filter((c) => c.isOverdue);

  // Search and Filter
  const getFilteredList = (list) => {
    return list.filter((c) => {
      if (activeTab === "Overdue" && overdueFilter !== "All") {
        if (overdueFilter === "1" && c.overdueCount !== 1) return false;
        if (overdueFilter === "2" && c.overdueCount !== 2) return false;
        if (overdueFilter === "3+" && c.overdueCount < 3) return false;
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

  const currentDisplayList = getFilteredList(activeTab === "Today" ? todayList : overdueList);

  // KPIs for main Collection page
  const totalTodayDueAmount = todayList.reduce((sum, c) => sum + c.totalDueToday, 0);
  const totalOverdueAmount = overdueList.reduce((sum, c) => sum + c.totalOverdue, 0);

  const paymentHistory = JSON.parse(localStorage.getItem("motoLendPaymentHistory") || "[]");
  const todaysPayments = paymentHistory.filter((p) => p.date && p.date.startsWith(date));
  const collectedTodayAmount = todaysPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const collectedTodayCount = todaysPayments.length;

  const handleCollectClick = (c) => {
    setSelectedCustomer(c);
    // Prefill with current total due (overdue + today)
    const initialAmount = c.currentTotalDue > 0 ? c.currentTotalDue : (c.totalUnpaidInstallmentAmount || "");
    setCollectAmount(String(initialAmount || ""));
    setPaymentDate(date);
    setPaymentMode("Cash");
    setTransactionId("");
    setRemarks("");
    setSchedulePage(1);
    setIsSubmitting(false);
  };

  // Live Payment Allocation Preview computation for selected customer
  const allocationPreview = useMemo(() => {
    if (!selectedCustomer || !collectAmount || isNaN(Number(collectAmount)) || Number(collectAmount) <= 0) {
      return { allocations: [], unappliedAdvance: 0, paymentType: "NONE" };
    }

    const amt = Number(collectAmount);
    let remainingToAllocate = amt;
    const allocations = [];

    // Sort full schedule chronologically by installment number
    const sortedSchedule = [...selectedCustomer.fullSchedule].sort(
      (a, b) => a.installmentNumber - b.installmentNumber
    );

    for (const s of sortedSchedule) {
      if (remainingToAllocate <= 0.001) break;
      const due = Math.max(0, s.emi - (s.amountPaid || 0));
      if (due <= 0.001) continue;

      const alloc = Math.min(due, remainingToAllocate);
      remainingToAllocate -= alloc;

      // Internal interest-first allocation
      const interestDue = Math.max(0, s.interest - (s.interestPaid || 0));
      const intAlloc = Math.min(interestDue, alloc);
      const prinAlloc = alloc - intAlloc;

      const newAmountPaid = (s.amountPaid || 0) + alloc;
      const newBalance = Math.max(0, s.emi - newAmountPaid);
      const statusAfter = newBalance <= 0.01 ? "Paid" : "Partial";

      const diff = getDayDiff(s.dueDate, date);
      const isAdvance = diff > 0;

      allocations.push({
        installmentNumber: s.installmentNumber,
        dueDate: s.dueDate,
        allocated: alloc,
        interestPaid: intAlloc,
        principalPaid: prinAlloc,
        balanceAfter: newBalance,
        statusAfter,
        isAdvance,
      });
    }

    const unappliedAdvance = remainingToAllocate > 0.001 ? remainingToAllocate : 0;
    const currentDue = selectedCustomer.currentTotalDue || 0;

    let paymentType = "PARTIAL";
    if (Math.abs(amt - currentDue) < 0.01) {
      paymentType = "FULL";
    } else if (amt > currentDue) {
      paymentType = "EXCESS";
    }

    return { allocations, unappliedAdvance, paymentType };
  }, [selectedCustomer, collectAmount, date]);

  // Handle Confirm Payment Submission
  const handleConfirmPayment = () => {
    if (submittingRef.current || isSubmitting) return;

    if (!collectAmount || isNaN(collectAmount) || Number(collectAmount) <= 0) {
      alert("Please enter a valid payment amount greater than 0.");
      return;
    }

    if (!selectedCustomer) return;

    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      const amt = Number(collectAmount);
      let remainingToAllocate = amt;
      let totalPrincipalRecovered = 0;
      let totalInterestEarned = 0;
      const appliedAllocations = [];

      // Sort entire schedule chronologically to guarantee oldest unpaid first
      const schedule = selectedCustomer.fullSchedule.map((s) => ({ ...s }));
      schedule.sort((a, b) => a.installmentNumber - b.installmentNumber);

      for (let i = 0; i < schedule.length; i++) {
        const s = schedule[i];
        if (remainingToAllocate <= 0.001) break;

        const due = Math.max(0, s.emi - (s.amountPaid || 0));
        if (due <= 0.001) continue;

        const alloc = Math.min(due, remainingToAllocate);
        remainingToAllocate -= alloc;

        // Interest first, then principal
        const interestDue = Math.max(0, s.interest - (s.interestPaid || 0));
        const intAlloc = Math.min(interestDue, alloc);
        const prinAlloc = alloc - intAlloc;

        totalInterestEarned += intAlloc;
        totalPrincipalRecovered += prinAlloc;

        const priorAmountPaid = s.amountPaid || 0;
        const newAmountPaid = priorAmountPaid + alloc;
        const newPrincipalPaid = (s.principalPaid || 0) + prinAlloc;
        const newInterestPaid = (s.interestPaid || 0) + intAlloc;
        const newBalance = Math.max(0, s.emi - newAmountPaid);
        const statusAfter = newBalance <= 0.01 ? "Paid" : "Partial";

        s.amountPaid = newAmountPaid;
        s.principalPaid = newPrincipalPaid;
        s.interestPaid = newInterestPaid;
        s.balance = newBalance;
        s.status = statusAfter;

        appliedAllocations.push({
          installmentNumber: s.installmentNumber,
          dueDate: s.dueDate,
          scheduledEmi: s.emi,
          previousAmountPaid: priorAmountPaid,
          previousRemainingDue: due,
          allocated: alloc,
          interestPaid: intAlloc,
          principalPaid: prinAlloc,
          balanceAfter: newBalance,
          statusAfter,
        });
      }

      // Any excess beyond all installments is customer advance
      const unappliedAdvance = remainingToAllocate > 0.001 ? remainingToAllocate : 0;

      // Recalculate loan-level outstanding across ALL installments of the loan
      const totalPrincipalOutstanding = Math.max(
        0,
        schedule.reduce((sum, s) => sum + Math.max(0, s.principal - (s.principalPaid || 0)), 0) - unappliedAdvance
      );
      const totalInterestOutstanding = schedule.reduce(
        (sum, s) => sum + Math.max(0, s.interest - (s.interestPaid || 0)),
        0
      );
      const totalLoanOutstanding = totalPrincipalOutstanding + totalInterestOutstanding;

      // Determine next due date and loan closure status
      let nextDueDate = "Completed";
      let loanStatus = "Closed";
      const nextUnpaid = schedule.find((s) => s.emi - (s.amountPaid || 0) > 0.01);
      if (nextUnpaid) {
        nextDueDate = nextUnpaid.dueDate;
        loanStatus = "Active";
      }

      // 1. Clean customer record and update schedule & balances
      const {
        fullSchedule,
        overdueInstalls,
        todayInstalls,
        allUnpaidInstalls,
        isDueToday,
        isOverdue,
        overdueCount,
        totalDueToday,
        totalOverdue,
        totalUnpaidInstallmentAmount,
        originalDueToday,
        originalOverdue,
        currentTotalDue,
        statusText,
        ...cleanCustomer
      } = selectedCustomer;

      const updatedCustomer = {
        ...cleanCustomer,
        repaymentSchedule: schedule,
        outstandingAmount: totalLoanOutstanding,
        totalPrincipalOutstanding,
        totalInterestOutstanding,
        totalLoanOutstanding,
        advanceBalance: (selectedCustomer.advanceBalance || 0) + unappliedAdvance,
        status: loanStatus,
        nextDueDate: nextDueDate,
      };

      const existingCustomers = JSON.parse(localStorage.getItem("motoLendCustomersList_data") || "[]");
      const updatedCustomersList = existingCustomers.map((c) =>
        (c.loanId && c.loanId.trim().toLowerCase() === selectedCustomer.loanId?.trim().toLowerCase())
          ? updatedCustomer
          : c
      );
      localStorage.setItem("motoLendCustomersList_data", JSON.stringify(updatedCustomersList));

      // 2. Add single transaction to payment history
      const txId = `PAY-${Date.now()}`;
      const txnRef = `TXN-${Date.now().toString().slice(-8)}`;
      const paymentRecord = {
        id: txId,
        transactionRef: txnRef,
        customerId: selectedCustomer.customerId,
        customerName: selectedCustomer.customer?.name || "Customer",
        loanId: selectedCustomer.loanId,
        installmentNumber: appliedAllocations.length === 1
          ? appliedAllocations[0]?.installmentNumber
          : (appliedAllocations.map((a) => a.installmentNumber).join(", ") || appliedAllocations[0]?.installmentNumber),
        installmentNumbers: appliedAllocations.map((a) => a.installmentNumber),
        date: paymentDate || new Date().toISOString(),
        amount: amt,
        principal: totalPrincipalRecovered,
        interest: totalInterestEarned,
        advance: unappliedAdvance,
        mode: paymentMode,
        transactionId: paymentMode !== "Cash" ? (transactionId ? transactionId.trim() : "") : "",
        remarks: remarks || "Collection Payment",
        allocations: appliedAllocations,
        totalPrincipalOutstandingAfter: totalPrincipalOutstanding,
        totalInterestOutstandingAfter: totalInterestOutstanding,
        totalLoanOutstandingAfter: totalLoanOutstanding,
      };

      const existingHistory = JSON.parse(localStorage.getItem("motoLendPaymentHistory") || "[]");
      existingHistory.push(paymentRecord);
      localStorage.setItem("motoLendPaymentHistory", JSON.stringify(existingHistory));

      // 3. Synchronize storage event across tabs and state
      window.dispatchEvent(new Event("storage"));
      setCustomers(updatedCustomersList);

      // 4. Close collect modal and display Amount Collected Successfully popup
      setSelectedCustomer(null);
      setConfirmedTransaction({
        ...paymentRecord,
        customerName: selectedCustomer.customer?.name || "Customer",
        customerId: selectedCustomer.customerId,
        loanId: selectedCustomer.loanId,
        loanAmount: selectedCustomer.loanAmount,
        paymentFrequency: selectedCustomer.paymentFrequency || selectedCustomer.loan?.paymentFrequency || "Monthly",
        totalPrincipalOutstanding,
        totalInterestOutstanding,
        totalLoanOutstanding,
        allocations: appliedAllocations,
        advanceCreated: unappliedAdvance,
      });
    } catch (error) {
      console.error("Payment failed to process:", error);
      alert("Payment processing failed. No changes were made.");
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleView = (c, contextTab) => {
    setDetailsCustomer({
      customer: c,
      context: contextTab || activeTab,
    });
  };

  return (
    <div className="flex flex-col flex-1 min-h-screen w-full max-w-full overflow-x-hidden bg-slate-50 px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-8">
      {/* HEADER + SEARCH + DATE ROW */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between shrink-0 mb-5 sm:mb-6 gap-3.5 sm:gap-4">
        <div>
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-slate-900 sm:text-3xl">Collection</h1>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-[240px] md:w-[260px]">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Customer / Vehicle..."
              className="h-10 sm:h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 text-xs sm:text-[14px] text-slate-800 outline-none placeholder:text-slate-400 focus:border-[#006052] focus:ring-1 focus:ring-[#006052] shadow-2xs transition-all"
            />
          </div>

          <div className="relative w-full sm:w-[160px]">
            <CalendarIcon className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-10 sm:h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 sm:pr-4 text-xs sm:text-[14px] font-medium text-slate-700 shadow-2xs outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052] transition-all cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* SEGMENTED SWITCH & FILTERS ROW */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center mb-5 sm:mb-6 gap-3 sm:gap-4 shrink-0">
        <div className="flex w-full sm:w-auto bg-slate-100 p-1 rounded-xl shadow-2xs border border-slate-200 shrink-0">
          <button
            onClick={() => setActiveTab("Today")}
            className={`flex-1 sm:flex-none flex justify-center items-center gap-1.5 sm:gap-2 px-3 sm:px-5 md:px-6 py-2 sm:py-2.5 text-xs sm:text-[14px] font-bold rounded-lg transition-all duration-200 ${
              activeTab === "Today"
                ? "bg-[#006052] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
            }`}
          >
            <span className="truncate">Today's Collection</span>
            <span
              className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[11px] sm:text-[12px] font-semibold shrink-0 ${
                activeTab === "Today" ? "bg-white/20 text-white" : "bg-white text-slate-500 shadow-2xs"
              }`}
            >
              {todayList.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("Overdue")}
            className={`flex-1 sm:flex-none flex justify-center items-center gap-1.5 sm:gap-2 px-3 sm:px-5 md:px-6 py-2 sm:py-2.5 text-xs sm:text-[14px] font-bold rounded-lg transition-all duration-200 ${
              activeTab === "Overdue"
                ? "bg-[#006052] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
            }`}
          >
            <span className="truncate">Overdue Collection</span>
            <span
              className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[11px] sm:text-[12px] font-semibold shrink-0 ${
                activeTab === "Overdue" ? "bg-white/20 text-white" : "bg-white text-slate-500 shadow-2xs"
              }`}
            >
              {overdueList.length}
            </span>
          </button>
        </div>

        {activeTab === "Overdue" && (
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
            {["All", "1", "2", "3+"].map((f) => (
              <button
                key={f}
                onClick={() => setOverdueFilter(f)}
                className={`flex-1 sm:flex-none px-3 sm:px-4 py-1.5 text-xs sm:text-[13px] font-semibold rounded-full transition-all border text-center ${
                  overdueFilter === f
                    ? "bg-slate-800 border-slate-800 text-white shadow-2xs"
                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                {f === "All" ? "All" : `${f} Overdue`}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* RESPONSIVE KPIS: 1 Col on Mobile, 2 Cols on Tablet, 3 Cols (Row) on Desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4 shrink-0 mb-6">
        <SummaryCard
          icon={Wallet}
          title="Today's Due"
          value={formatCurrency(totalTodayDueAmount)}
          subtext={`${todayList.length} ${todayList.length === 1 ? "Customer" : "Customers"}`}
          accentClass="bg-emerald-50 text-emerald-600 border border-emerald-100"
        />
        <SummaryCard
          icon={AlertCircle}
          title="Overdue"
          value={formatCurrency(totalOverdueAmount)}
          subtext={`${overdueList.length} ${overdueList.length === 1 ? "Customer" : "Customers"}`}
          accentClass="bg-red-50 text-red-600 border border-red-100"
        />
        <SummaryCard
          icon={CheckCircle}
          title="Collected Today"
          value={formatCurrency(collectedTodayAmount)}
          subtext={`${collectedTodayCount} ${collectedTodayCount === 1 ? "Payment" : "Payments"}`}
          accentClass="bg-teal-50 text-teal-600 border border-teal-100"
          className="sm:col-span-2 lg:col-span-1"
        />
      </div>

      {/* MOBILE CARDS VIEW (<md) */}
      <div className="block md:hidden space-y-3 mb-6">
        {currentDisplayList.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8 text-center shadow-2xs">
            <div className="flex flex-col items-center justify-center text-slate-400">
              <p className="text-sm font-semibold text-slate-600">No collections for this date</p>
              <p className="text-xs mt-1">There are no pending collections for the selected date.</p>
            </div>
          </div>
        ) : (
          currentDisplayList.map((c) => {
            const dueAmt = c.statusText === "Collected"
              ? (activeTab === "Today" ? c.originalDueToday : c.originalOverdue)
              : (activeTab === "Today" ? c.totalDueToday : c.totalOverdue);

            return (
              <div key={c.loanId} className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3 transition-shadow hover:shadow-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate">{c.customer?.name}</h3>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 mt-0.5">
                      <span className="font-medium text-slate-600">{c.customerId}</span>
                      <span>•</span>
                      <span className="font-semibold text-slate-700">{c.loanId}</span>
                      {c.vehicle?.regNo && (
                        <>
                          <span>•</span>
                          <span className="truncate">{c.vehicle?.regNo}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {c.statusText === "Pending" && (
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700 ring-1 ring-inset ring-slate-500/20">
                        Pending
                      </span>
                    )}
                    {c.statusText === "Collected" && (
                      <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                        Collected
                      </span>
                    )}
                    {c.statusText === "Partial" && (
                      <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                        Partial
                      </span>
                    )}
                  </div>
                </div>

                <div className="rounded-lg bg-slate-50 p-2.5 flex items-center justify-between border border-slate-100">
                  <span className="text-xs font-semibold text-slate-500">
                    {activeTab === "Today" ? "Due Amount" : "Overdue Amount"}
                  </span>
                  <span className="text-base font-bold text-slate-900">
                    {formatCurrency(dueAmt)}
                  </span>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  {c.statusText !== "Collected" && (
                    <button
                      onClick={() => handleCollectClick(c)}
                      className="flex-1 rounded-lg bg-[#006052] py-2 px-3 text-xs font-bold text-white shadow-2xs hover:bg-[#004d43] transition-colors text-center"
                    >
                      Collect Payment
                    </button>
                  )}
                  <button
                    onClick={() => handleView(c, activeTab)}
                    className="flex-1 rounded-lg bg-white border border-slate-300 py-2 px-3 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors text-center"
                  >
                    View Details
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* DESKTOP/TABLET TABLE VIEW (hidden md:block) */}
      <div className="hidden md:block rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-slate-50 z-10 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5 text-[12px] font-bold uppercase tracking-wider text-slate-600 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200">
                  Customer ID
                </th>
                <th className="px-6 py-3.5 text-[12px] font-bold uppercase tracking-wider text-slate-600 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200">
                  Customer
                </th>
                <th className="px-6 py-3.5 text-[12px] font-bold uppercase tracking-wider text-slate-600 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200">
                  {activeTab === "Today" ? "Due Amount" : "Overdue Amount"}
                </th>
                <th className="px-6 py-3.5 text-[12px] font-bold uppercase tracking-wider text-slate-600 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200">
                  Status
                </th>
                <th className="px-6 py-3.5 text-[12px] font-bold uppercase tracking-wider text-slate-600 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200 text-right">
                  Action
                </th>
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
              ) : (
                currentDisplayList.map((c) => (
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
                          ? `${formatCurrency(activeTab === "Today" ? c.originalDueToday : c.originalOverdue)}`
                          : formatCurrency(activeTab === "Today" ? c.totalDueToday : c.totalOverdue)}
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
                          <button
                            onClick={() => handleCollectClick(c)}
                            className="rounded-md bg-[#006052] px-5 py-2.5 text-[13px] font-bold text-white shadow-sm hover:bg-[#004d43] transition-colors"
                          >
                            Collect Payment
                          </button>
                        )}
                        <button
                          onClick={() => handleView(c, activeTab)}
                          className="rounded-md bg-white border border-slate-300 px-5 py-2.5 text-[13px] font-bold text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900 transition-colors"
                        >
                          View Details
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =========================================================================
          1. COLLECT PAYMENT POPUP (REDESIGNED MATCHING REFERENCE IMAGE)
      ========================================================================= */}
      {selectedCustomer && (() => {
        const amountReceived = Number(collectAmount) || 0;
        const unpaidSchedule = selectedCustomer.allUnpaidInstalls || [];
        const fullSchedule = selectedCustomer.fullSchedule || [];
        
        // Pagination for Repayment Schedule (4 rows per page matching reference image)
        const pageSize = 4;
        const totalPages = Math.max(1, Math.ceil(fullSchedule.length / pageSize));
        const currentPage = Math.min(Math.max(1, schedulePage), totalPages);
        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = Math.min(startIndex + pageSize, fullSchedule.length);
        const paginatedSchedule = fullSchedule.slice(startIndex, endIndex);

        // Values for KPI Cards and dynamic Quick Actions
        const totalOutstanding = selectedCustomer.totalUnpaidInstallmentAmount || 0;
        const overdueAmount = selectedCustomer.totalOverdue || 0;
        const dueTodayAmount = selectedCustomer.totalDueToday || 0;
        const currentTotalDue = selectedCustomer.currentTotalDue || 0;
        const overdueCount = selectedCustomer.overdueInstalls?.length || 0;
        const unpaidCount = unpaidSchedule.length;

        // Map of preview allocations keyed by installmentNumber for O(1) lookups
        const previewAllocationMap = new Map(
          (allocationPreview?.allocations || []).map((al) => [al.installmentNumber, al])
        );

        // Conditions for Dynamic Quick Action buttons
        const hasOverdue = overdueAmount > 0;
        const hasDueToday = dueTodayAmount > 0;
        const hasAnyCurrentOrOverdue = hasOverdue || hasDueToday;
        const hasUnpaidFutureOnly = !hasAnyCurrentOrOverdue && totalOutstanding > 0;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 sm:p-4 md:p-6 backdrop-blur-xs overflow-y-auto overscroll-contain">
            <div className="w-full max-w-4xl max-h-[calc(100dvh-1rem)] sm:max-h-[92vh] rounded-2xl bg-white shadow-2xl relative flex flex-col border border-slate-200 overflow-hidden my-auto">
              {/* Header (Sticky top) */}
              <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 bg-white sticky top-0 z-20 shrink-0">
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
                    <Banknote className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-tight truncate">Collect Payment</h3>
                    <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5 truncate">
                      {selectedCustomer.customer?.name} &nbsp;·&nbsp; {selectedCustomer.loanId} &nbsp;·&nbsp; {selectedCustomer.customerId}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCustomer(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors shrink-0"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Main Body (Scrollable with momentum touch scrolling on mobile) */}
              <div className="px-4 sm:px-6 py-4 space-y-3.5 overflow-y-auto flex-1 overscroll-contain [webkit-overflow-scrolling:touch]">
                {/* 1. KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Card 1: TOTAL OUTSTANDING */}
                  <div className="rounded-xl border border-slate-200 bg-white p-3.5 flex items-start gap-3 shadow-2xs">
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 shrink-0 mt-0.5">
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        TOTAL OUTSTANDING
                      </p>
                      <p className="text-xl font-bold text-slate-900 mt-0.5">
                        {formatCurrency(totalOutstanding)}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {unpaidCount} Unpaid {unpaidCount === 1 ? "Installment" : "Installments"}
                      </p>
                    </div>
                  </div>

                  {/* Card 2: OVERDUE */}
                  <div className="rounded-xl border border-red-200/80 bg-red-50/30 p-3.5 flex items-start gap-3 shadow-2xs">
                    <div className="p-2 rounded-lg bg-red-50 text-red-600 shrink-0 mt-0.5">
                      <Clock className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-red-600">
                        OVERDUE
                      </p>
                      <p className="text-xl font-bold text-red-600 mt-0.5">
                        {formatCurrency(overdueAmount)}
                      </p>
                      <p className="text-[11px] text-red-500 mt-0.5">
                        {overdueCount} Overdue {overdueCount === 1 ? "Installment" : "Installments"}
                      </p>
                    </div>
                  </div>

                  {/* Card 3: DUE TODAY */}
                  <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/30 p-3.5 flex items-start gap-3 shadow-2xs">
                    <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700 shrink-0 mt-0.5">
                      <CalendarIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                        DUE TODAY
                      </p>
                      <p className="text-xl font-bold text-emerald-700 mt-0.5">
                        {formatCurrency(dueTodayAmount)}
                      </p>
                      <p className="text-[11px] text-emerald-600 mt-0.5">
                        {selectedCustomer.todayInstalls?.length > 0 ? "Due Today" : "None Due Today"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 2. Customer & Loan Summary Bar */}
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 divide-y md:divide-y-0 md:divide-x divide-slate-100">
                    {/* Customer */}
                    <div className="flex items-center gap-2.5 min-w-0 pt-2 first:pt-0 md:pt-0">
                      <User className="h-4 w-4 text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <span className="text-[11px] text-slate-400 block font-medium">Customer</span>
                        <span className="text-xs font-bold text-slate-800 truncate block">
                          {selectedCustomer.customer?.name || "—"}
                        </span>
                      </div>
                    </div>

                    {/* Loan ID */}
                    <div className="flex items-center gap-2.5 min-w-0 pt-2 md:pt-0 md:pl-4">
                      <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <span className="text-[11px] text-slate-400 block font-medium">Loan ID</span>
                        <span className="text-xs font-bold text-slate-800 truncate block">
                          {selectedCustomer.loanId || "—"}
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          Amount: {formatCurrency(selectedCustomer.loanAmount)}
                        </span>
                      </div>
                    </div>

                    {/* Vehicle */}
                    <div className="flex items-center gap-2.5 min-w-0 pt-2 md:pt-0 md:pl-4">
                      <Car className="h-4 w-4 text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <span className="text-[11px] text-slate-400 block font-medium">Vehicle</span>
                        <span className="text-xs font-bold text-slate-800 truncate block">
                          {selectedCustomer.vehicle?.regNo || selectedCustomer.vehicle?.model || "—"}
                        </span>
                      </div>
                    </div>

                    {/* Frequency */}
                    <div className="flex items-center gap-2.5 min-w-0 pt-2 md:pt-0 md:pl-4">
                      <IndianRupee className="h-4 w-4 text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <span className="text-[11px] text-slate-400 block font-medium">Frequency</span>
                        <span className="text-xs font-bold text-slate-800 truncate block">
                          {selectedCustomer.paymentFrequency || selectedCustomer.loan?.paymentFrequency || "Monthly"}
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          EMI: {formatCurrency(selectedCustomer.emiAmount || selectedCustomer.fullSchedule?.[0]?.emi || 0)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Payment Amount and Dynamic Quick Actions */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
                  {/* Amount Input (approx 4 cols) */}
                  <div className="lg:col-span-4">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                      PAYMENT AMOUNT <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">₹</span>
                      <input
                        type="number"
                        value={collectAmount}
                        onChange={(e) => setCollectAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/60 py-2.5 pl-8 pr-3 text-base font-bold text-slate-900 outline-none transition-colors focus:border-[#006052] focus:bg-white focus:ring-1 focus:ring-[#006052]"
                      />
                    </div>
                  </div>

                  {/* Quick Action Buttons (approx 8 cols) */}
                  <div className="lg:col-span-8">
                    <div className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
                      {/* Scenario A: Overdue and current dues exist -> Pay Overdue, Pay Current, Pay Total, Pay All */}
                      {hasOverdue && hasDueToday && (
                        <>
                          <button
                            type="button"
                            onClick={() => setCollectAmount(String(dueTodayAmount))}
                            className="flex-1 min-w-[110px] rounded-xl border border-[#006052] bg-[#006052] text-white p-2 text-center transition-transform active:scale-[0.98] shadow-2xs hover:bg-[#004d43]"
                          >
                            <div className="flex items-center justify-center gap-1.5 text-xs font-semibold">
                              <CreditCard className="h-3.5 w-3.5 opacity-90" />
                              <span>Pay Current</span>
                            </div>
                            <div className="text-sm font-bold mt-0.5">{formatCurrency(dueTodayAmount)}</div>
                          </button>

                          <button
                            type="button"
                            onClick={() => setCollectAmount(String(overdueAmount))}
                            className="flex-1 min-w-[110px] rounded-xl border border-slate-200 bg-white text-slate-700 p-2 text-center transition-colors hover:bg-slate-50 shadow-2xs"
                          >
                            <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-500">
                              <Clock className="h-3.5 w-3.5" />
                              <span>Pay Overdue</span>
                            </div>
                            <div className="text-sm font-bold text-slate-800 mt-0.5">{formatCurrency(overdueAmount)}</div>
                          </button>

                          <button
                            type="button"
                            onClick={() => setCollectAmount(String(currentTotalDue))}
                            className="flex-1 min-w-[110px] rounded-xl border border-emerald-200 bg-emerald-50/50 text-emerald-800 p-2 text-center transition-colors hover:bg-emerald-100/50 shadow-2xs"
                          >
                            <div className="flex items-center justify-center gap-1.5 text-xs font-semibold">
                              <Layers className="h-3.5 w-3.5 text-emerald-700" />
                              <span>Pay Total</span>
                            </div>
                            <div className="text-sm font-bold mt-0.5">{formatCurrency(currentTotalDue)}</div>
                          </button>

                          <button
                            type="button"
                            onClick={() => setCollectAmount(String(totalOutstanding))}
                            className="flex-1 min-w-[110px] rounded-xl border border-slate-200 bg-white text-slate-700 p-2 text-center transition-colors hover:bg-slate-50 shadow-2xs"
                          >
                            <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-emerald-700">
                              <Users className="h-3.5 w-3.5" />
                              <span>Pay All</span>
                            </div>
                            <div className="text-sm font-bold text-emerald-800 mt-0.5">{formatCurrency(totalOutstanding)}</div>
                          </button>
                        </>
                      )}

                      {/* Scenario B: Only Overdue exists -> Pay Overdue, Pay All */}
                      {hasOverdue && !hasDueToday && (
                        <>
                          <button
                            type="button"
                            onClick={() => setCollectAmount(String(overdueAmount))}
                            className="flex-1 min-w-[130px] rounded-xl border border-[#006052] bg-[#006052] text-white p-2 text-center transition-transform active:scale-[0.98] shadow-2xs hover:bg-[#004d43]"
                          >
                            <div className="flex items-center justify-center gap-1.5 text-xs font-semibold">
                              <Clock className="h-3.5 w-3.5 opacity-90" />
                              <span>Pay Overdue</span>
                            </div>
                            <div className="text-sm font-bold mt-0.5">{formatCurrency(overdueAmount)}</div>
                          </button>

                          <button
                            type="button"
                            onClick={() => setCollectAmount(String(totalOutstanding))}
                            className="flex-1 min-w-[130px] rounded-xl border border-slate-200 bg-white text-slate-700 p-2 text-center transition-colors hover:bg-slate-50 shadow-2xs"
                          >
                            <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-emerald-700">
                              <Users className="h-3.5 w-3.5" />
                              <span>Pay All</span>
                            </div>
                            <div className="text-sm font-bold text-emerald-800 mt-0.5">{formatCurrency(totalOutstanding)}</div>
                          </button>
                        </>
                      )}

                      {/* Scenario C: Only Current (Due Today) exists -> Pay Current, Pay All */}
                      {!hasOverdue && hasDueToday && (
                        <>
                          <button
                            type="button"
                            onClick={() => setCollectAmount(String(dueTodayAmount))}
                            className="flex-1 min-w-[130px] rounded-xl border border-[#006052] bg-[#006052] text-white p-2 text-center transition-transform active:scale-[0.98] shadow-2xs hover:bg-[#004d43]"
                          >
                            <div className="flex items-center justify-center gap-1.5 text-xs font-semibold">
                              <CreditCard className="h-3.5 w-3.5 opacity-90" />
                              <span>Pay Current</span>
                            </div>
                            <div className="text-sm font-bold mt-0.5">{formatCurrency(dueTodayAmount)}</div>
                          </button>

                          <button
                            type="button"
                            onClick={() => setCollectAmount(String(totalOutstanding))}
                            className="flex-1 min-w-[130px] rounded-xl border border-slate-200 bg-white text-slate-700 p-2 text-center transition-colors hover:bg-slate-50 shadow-2xs"
                          >
                            <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-emerald-700">
                              <Users className="h-3.5 w-3.5" />
                              <span>Pay All</span>
                            </div>
                            <div className="text-sm font-bold text-emerald-800 mt-0.5">{formatCurrency(totalOutstanding)}</div>
                          </button>
                        </>
                      )}

                      {/* Scenario D: Neither overdue nor current dues exist -> Pay All if unpaid future remain */}
                      {hasUnpaidFutureOnly && (
                        <button
                          type="button"
                          onClick={() => setCollectAmount(String(totalOutstanding))}
                          className="flex-1 min-w-[130px] rounded-xl border border-[#006052] bg-[#006052] text-white p-2 text-center transition-transform active:scale-[0.98] shadow-2xs hover:bg-[#004d43]"
                        >
                          <div className="flex items-center justify-center gap-1.5 text-xs font-semibold">
                            <Users className="h-3.5 w-3.5 opacity-90" />
                            <span>Pay All</span>
                          </div>
                          <div className="text-sm font-bold mt-0.5">{formatCurrency(totalOutstanding)}</div>
                        </button>
                      )}

                      {/* If fully paid */}
                      {!hasAnyCurrentOrOverdue && !hasUnpaidFutureOnly && (
                        <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 font-medium text-center">
                          No pending dues for this loan.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 4. Payment Date, Payment Method, Transaction ID */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                  {/* Payment Date (3 cols) */}
                  <div className="md:col-span-3">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                      PAYMENT DATE <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                      <input
                        type="date"
                        value={paymentDate}
                        onChange={(e) => setPaymentDate(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/60 py-2 pl-9 pr-3 text-xs font-medium text-slate-800 outline-none focus:border-[#006052] focus:bg-white focus:ring-1 focus:ring-[#006052]"
                      />
                    </div>
                  </div>

                  {/* Payment Method (5 cols) */}
                  <div className="md:col-span-5">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                      PAYMENT METHOD <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {/* Cash */}
                      <button
                        type="button"
                        onClick={() => setPaymentMode("Cash")}
                        className={`rounded-xl border py-2 px-2 text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                          paymentMode === "Cash"
                            ? "bg-[#006052] border-[#006052] text-white shadow-xs"
                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <Banknote className="h-3.5 w-3.5 shrink-0" />
                        <span>Cash</span>
                      </button>

                      {/* UPI */}
                      <button
                        type="button"
                        onClick={() => setPaymentMode("UPI")}
                        className={`rounded-xl border py-2 px-2 text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                          paymentMode === "UPI"
                            ? "bg-[#006052] border-[#006052] text-white shadow-xs"
                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 -rotate-45" />
                        <span>UPI</span>
                      </button>

                      {/* Bank Transfer */}
                      <button
                        type="button"
                        onClick={() => setPaymentMode("Bank Transfer")}
                        className={`rounded-xl border py-2 px-2 text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                          paymentMode === "Bank Transfer"
                            ? "bg-[#006052] border-[#006052] text-white shadow-xs"
                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <Building2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">Bank Transfer</span>
                      </button>
                    </div>
                  </div>

                  {/* Transaction ID (4 cols) */}
                  <div className="md:col-span-4">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                      TRANSACTION ID
                    </label>
                    <div className="relative">
                      {paymentMode === "Cash" && (
                        <AlertCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                      )}
                      <input
                        type="text"
                        value={transactionId}
                        onChange={(e) => setTransactionId(e.target.value)}
                        disabled={paymentMode === "Cash"}
                        placeholder={
                          paymentMode === "Cash"
                            ? "Not applicable for Cash"
                            : "Enter transaction ID"
                        }
                        className={`w-full rounded-xl border py-2 text-xs outline-none transition-all ${
                          paymentMode === "Cash"
                            ? "border-slate-200 bg-slate-50/70 text-slate-400 pl-8 pr-3 cursor-not-allowed placeholder:text-slate-400"
                            : "border-slate-200 bg-white text-slate-800 px-3 placeholder:text-slate-400 focus:border-[#006052] focus:ring-1 focus:ring-[#006052]"
                        }`}
                      />
                    </div>
                  </div>
                </div>

                {/* 5. Remarks */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    REMARKS
                  </label>
                  <div className="relative">
                    <FileText className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      placeholder="Add remarks (optional)"
                      className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052]"
                    />
                  </div>
                </div>

                {/* 6. Repayment Schedule (Mandatory, with compact pagination, Live Payment Allocation Preview) */}
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                  {/* Schedule Header */}
                  <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded-md bg-emerald-50 text-emerald-700">
                        <CalendarIcon className="h-4 w-4" />
                      </div>
                      <h4 className="text-xs font-bold text-slate-800">
                        Repayment Schedule
                      </h4>
                      {previewAllocationMap.size > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-700 ring-1 ring-purple-600/20">
                          <span className="h-1.5 w-1.5 rounded-full bg-purple-600 animate-pulse"></span>
                          Payment Preview Active
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 font-medium">
                      <span>
                        {fullSchedule.length > 0 
                          ? `${startIndex + 1} - ${endIndex} of ${fullSchedule.length} installments`
                          : "0 of 0 installments"}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setSchedulePage((p) => Math.max(1, p - 1))}
                          disabled={currentPage <= 1}
                          className="h-6 w-6 rounded border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setSchedulePage((p) => Math.min(totalPages, p + 1))}
                          disabled={currentPage >= totalPages}
                          className="h-6 w-6 rounded border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Desktop / Tablet Table View (hidden on small mobile screens to prevent cramped horizontal scrolling) */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-xs text-left min-w-[580px] border-separate border-spacing-y-0.5">
                      <thead className="bg-slate-50/70 border-b border-slate-100 text-slate-600 font-semibold text-[11px]">
                        <tr>
                          <th className="px-4 py-2">Installment</th>
                          <th className="px-4 py-2">Due Date</th>
                          <th className="px-4 py-2 text-right">Installment Amount</th>
                          <th className="px-4 py-2 text-right">Amount Paid (Preview)</th>
                          <th className="px-4 py-2 text-right">Remaining Due (Preview)</th>
                          <th className="px-4 py-2 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {paginatedSchedule.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-4 text-center text-slate-400">
                              No schedule records found.
                            </td>
                          </tr>
                        ) : (
                          paginatedSchedule.map((s) => {
                            const preview = previewAllocationMap.get(s.installmentNumber);
                            const isAffected = !!preview;

                            // Actual values without preview
                            const actualPaid = s.amountPaid || 0;
                            const actualRemainingDue = Math.max(0, s.emi - actualPaid);
                            const actualIsPaid = actualRemainingDue <= 0.01;
                            const actualIsOverdue = !actualIsPaid && getDayDiff(s.dueDate, date) < 0;
                            const actualIsToday = !actualIsPaid && getDayDiff(s.dueDate, date) === 0;
                            const actualIsPartial = !actualIsPaid && actualPaid > 0.01;
                            const actualIsUpcoming = !actualIsPaid && !actualIsOverdue && !actualIsToday && !actualIsPartial;

                            // Displayed values (preview if affected, else actual)
                            const displayedPaid = isAffected ? actualPaid + preview.allocated : actualPaid;
                            const displayedRemainingDue = isAffected ? preview.balanceAfter : actualRemainingDue;
                            const displayedStatus = isAffected ? preview.statusAfter : null;

                            return (
                              <tr 
                                key={s.installmentNumber} 
                                className={`transition-all duration-150 ${
                                  isAffected 
                                    ? "bg-[#F3E8FF] shadow-xs text-purple-950 font-medium" 
                                    : "hover:bg-slate-50/60 text-slate-800"
                                }`}
                                style={isAffected ? { outline: "2px solid #7E22CE", outlineOffset: "-1px" } : {}}
                              >
                                <td className="px-4 py-2.5 font-medium">
                                  <div className="flex items-center gap-1.5">
                                    <span className={isAffected ? "font-bold text-purple-900" : "text-slate-700"}>
                                      {s.installmentNumber}
                                    </span>
                                    {isAffected && (
                                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded font-extrabold bg-[#7E22CE] text-white tracking-wider">
                                        Preview
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className={`px-4 py-2.5 ${isAffected ? "text-purple-900 font-medium" : "text-slate-600"}`}>
                                  {formatDate(s.dueDate)}
                                </td>
                                <td className={`px-4 py-2.5 text-right font-medium ${isAffected ? "text-purple-950" : "text-slate-700"}`}>
                                  {formatCurrency(s.emi)}
                                </td>
                                <td className="px-4 py-2.5 text-right">
                                  {isAffected ? (
                                    <span className="font-bold text-purple-900">
                                      {formatCurrency(displayedPaid)}
                                    </span>
                                  ) : (
                                    <span className="text-slate-600">{formatCurrency(actualPaid)}</span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-right font-semibold">
                                  {isAffected ? (
                                    <span className="font-black text-purple-950">
                                      {formatCurrency(displayedRemainingDue)}
                                    </span>
                                  ) : (
                                    <span className="text-slate-800">{formatCurrency(actualRemainingDue)}</span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  {isAffected ? (
                                    displayedStatus === "Paid" ? (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-[10px] font-bold text-purple-800 ring-1 ring-purple-600/40">
                                        <span className="h-1.5 w-1.5 rounded-full bg-purple-600"></span>
                                        Paid
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-[10px] font-bold text-purple-800 ring-1 ring-purple-600/40">
                                        <span className="h-1.5 w-1.5 rounded-full bg-purple-600"></span>
                                        Partial
                                      </span>
                                    )
                                  ) : actualIsPaid ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-600/20">
                                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                                      Paid
                                    </span>
                                  ) : actualIsOverdue ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-[10px] font-bold text-red-700 ring-1 ring-red-600/20">
                                      <span className="h-1.5 w-1.5 rounded-full bg-red-500"></span>
                                      Overdue
                                    </span>
                                  ) : actualIsToday ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-600/20">
                                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                                      Due Today
                                    </span>
                                  ) : actualIsPartial ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-600/20">
                                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                                      Partial
                                    </span>
                                  ) : actualIsUpcoming ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-400/20">
                                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
                                      Upcoming
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-400/20">
                                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
                                      Due
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Compact Cards View (shown on xs/small phones, fully readable and responsive) */}
                  <div className="block sm:hidden divide-y divide-slate-100 bg-white">
                    {paginatedSchedule.length === 0 ? (
                      <p className="py-4 text-center text-xs text-slate-400">No schedule records found.</p>
                    ) : (
                      paginatedSchedule.map((s) => {
                        const preview = previewAllocationMap.get(s.installmentNumber);
                        const isAffected = !!preview;

                        const actualPaid = s.amountPaid || 0;
                        const actualRemainingDue = Math.max(0, s.emi - actualPaid);
                        const actualIsPaid = actualRemainingDue <= 0.01;
                        const actualIsOverdue = !actualIsPaid && getDayDiff(s.dueDate, date) < 0;
                        const actualIsToday = !actualIsPaid && getDayDiff(s.dueDate, date) === 0;
                        const actualIsPartial = !actualIsPaid && actualPaid > 0.01;
                        const actualIsUpcoming = !actualIsPaid && !actualIsOverdue && !actualIsToday && !actualIsPartial;

                        const displayedPaid = isAffected ? actualPaid + preview.allocated : actualPaid;
                        const displayedRemainingDue = isAffected ? preview.balanceAfter : actualRemainingDue;
                        const displayedStatus = isAffected ? preview.statusAfter : null;

                        return (
                          <div
                            key={s.installmentNumber}
                            className={`p-3 space-y-2 transition-all ${
                              isAffected
                                ? "bg-[#F3E8FF] border-l-4 border-l-[#7E22CE]"
                                : "hover:bg-slate-50/60"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <span className={`text-xs font-bold ${isAffected ? "text-purple-950" : "text-slate-800"}`}>
                                  Installment #{s.installmentNumber}
                                </span>
                                {isAffected && (
                                  <span className="text-[9px] uppercase px-1.5 py-0.2 rounded font-extrabold bg-[#7E22CE] text-white tracking-wider">
                                    Preview
                                  </span>
                                )}
                              </div>
                              <div>
                                {isAffected ? (
                                  displayedStatus === "Paid" ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-800 ring-1 ring-purple-600/40">
                                      <span className="h-1.5 w-1.5 rounded-full bg-purple-600"></span>
                                      Paid
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-800 ring-1 ring-purple-600/40">
                                      <span className="h-1.5 w-1.5 rounded-full bg-purple-600"></span>
                                      Partial
                                    </span>
                                  )
                                ) : actualIsPaid ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-600/20">
                                    Paid
                                  </span>
                                ) : actualIsOverdue ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 ring-1 ring-red-600/20">
                                    Overdue
                                  </span>
                                ) : actualIsToday ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-600/20">
                                    Due Today
                                  </span>
                                ) : actualIsPartial ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-600/20">
                                    Partial
                                  </span>
                                ) : actualIsUpcoming ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-400/20">
                                    Upcoming
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-400/20">
                                    Due
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-100">
                              <div>
                                <span className="text-slate-400 block text-[10px]">Due Date</span>
                                <span className="font-medium text-slate-700">{formatDate(s.dueDate)}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-slate-400 block text-[10px]">Installment Amount</span>
                                <span className="font-semibold text-slate-800">{formatCurrency(s.emi)}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[10px]">
                                  {isAffected ? "Amount Paid (Preview)" : "Amount Paid"}
                                </span>
                                <span className={`font-bold ${isAffected ? "text-purple-900" : "text-slate-700"}`}>
                                  {formatCurrency(displayedPaid)}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="text-slate-400 block text-[10px]">
                                  {isAffected ? "Remaining (Preview)" : "Remaining Due"}
                                </span>
                                <span className={`font-bold ${isAffected ? "text-purple-950" : "text-slate-800"}`}>
                                  {formatCurrency(displayedRemainingDue)}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Excess Advance Notice (if amount exceeds all installments) */}
                  {allocationPreview.unappliedAdvance > 0 && (
                    <div className="px-4 py-2 bg-blue-50/80 border-t border-blue-200/60 flex items-center justify-between text-xs text-blue-900 font-semibold">
                      <span>Unapplied Advance (exceeds all remaining installments):</span>
                      <span className="font-bold text-blue-800">{formatCurrency(allocationPreview.unappliedAdvance)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer (Sticky bottom so Confirm Collection is always reachable) */}
              <div className="flex items-center justify-end gap-2.5 sm:gap-3 px-4 sm:px-6 py-3 sm:py-3.5 bg-white border-t border-slate-100 sticky bottom-0 z-20 shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedCustomer(null)}
                  disabled={isSubmitting}
                  className="rounded-xl border border-slate-200 bg-white px-4 sm:px-5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPayment}
                  disabled={amountReceived <= 0 || isSubmitting}
                  className="rounded-xl bg-[#006052] px-5 sm:px-6 py-2 text-xs font-bold text-white shadow-2xs hover:bg-[#004d43] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSubmitting ? "Processing Payment..." : "Confirm Collection"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* =========================================================================
          2. AMOUNT COLLECTED SUCCESSFULLY CONFIRMATION POPUP (REDESIGNED TO MATCH REFERENCE)
          Displays transaction details, loan-level outstanding (Principal, Interest, Total),
          and installment allocations clearly separated.
      ========================================================================= */}
      {confirmedTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 sm:p-4 md:p-6 backdrop-blur-xs overflow-y-auto overscroll-contain">
          <div className="w-full max-w-4xl max-h-[calc(100dvh-1rem)] sm:max-h-[92vh] rounded-2xl bg-white shadow-2xl relative flex flex-col border border-slate-200 overflow-hidden my-auto">
            {/* Header (Sticky top) */}
            <div className="flex items-center justify-between px-5 sm:px-6 pt-5 pb-3 border-b border-slate-100 bg-white sticky top-0 z-20 shrink-0">
              <div className="flex items-center gap-3.5">
                <div className="relative flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100/90 text-emerald-800 shadow-2xs ring-4 ring-emerald-50">
                  <CheckCircle2 className="h-6 w-6 sm:h-7 sm:w-7" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">Amount Collected Successfully</h3>
                  <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5">
                    Transaction recorded and synchronized across Ledger, Loan, and Dashboard
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmedTransaction(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="px-5 sm:px-6 py-4 space-y-3.5 overflow-y-auto flex-1 overscroll-contain [webkit-overflow-scrolling:touch]">
              {/* 1. Transaction Summary Strip */}
              <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
                {/* Left side items in a grid/flex */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 flex-1 items-center divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
                  {/* TRANSACTION AMOUNT */}
                  <div className="flex items-center gap-2.5 pt-2 first:pt-0 sm:pt-0">
                    <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 shrink-0">
                      <CreditCard className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                        TRANSACTION AMOUNT
                      </span>
                      <p className="text-base sm:text-lg font-bold text-emerald-800 leading-snug">
                        {formatCurrency(confirmedTransaction.amount)}
                      </p>
                    </div>
                  </div>

                  {/* CUSTOMER */}
                  <div className="flex items-center gap-2.5 pt-2 sm:pt-0 sm:pl-3 min-w-0">
                    <User className="h-4 w-4 text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                        CUSTOMER
                      </span>
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {confirmedTransaction.customerName}
                      </p>
                      {confirmedTransaction.customerId && (
                        <span className="text-[10px] text-slate-400 block font-mono truncate">
                          {confirmedTransaction.customerId}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* LOAN ID */}
                  <div className="flex items-center gap-2.5 pt-2 sm:pt-0 sm:pl-3 min-w-0">
                    <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                        LOAN ID
                      </span>
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {confirmedTransaction.loanId}
                      </p>
                      {confirmedTransaction.loanAmount > 0 && (
                        <span className="text-[10px] text-slate-500 block">
                          Amount: {formatCurrency(confirmedTransaction.loanAmount)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* PAYMENT DATE */}
                  <div className="flex items-center gap-2.5 pt-2 sm:pt-0 sm:pl-3 min-w-0">
                    <CalendarIcon className="h-4 w-4 text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                        PAYMENT DATE
                      </span>
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {formatDate(confirmedTransaction.date)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Right side box: PAYMENT METHOD */}
                <div className="rounded-xl border border-slate-200 bg-white p-2.5 sm:px-3 sm:py-2 shrink-0 md:min-w-[130px] flex flex-col justify-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    PAYMENT METHOD
                  </span>
                  <div className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 border border-emerald-200 w-fit">
                    {confirmedTransaction.mode === "Cash" ? (
                      <Banknote className="h-3.5 w-3.5 text-emerald-700" />
                    ) : confirmedTransaction.mode === "UPI" ? (
                      <ArrowRight className="h-3.5 w-3.5 text-emerald-700 -rotate-45" />
                    ) : (
                      <Building2 className="h-3.5 w-3.5 text-emerald-700" />
                    )}
                    <span>{confirmedTransaction.mode || "Cash"}</span>
                  </div>
                  {confirmedTransaction.transactionId && (
                    <span className="text-[10px] font-mono text-slate-500 mt-1 block truncate">
                      ID: {confirmedTransaction.transactionId}
                    </span>
                  )}
                </div>
              </div>

              {/* 2. OVERALL LOAN BALANCE AFTER PAYMENT */}
              <div className="rounded-xl border border-emerald-200/90 bg-emerald-50/25 p-3.5 sm:p-4 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-1">
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded-md bg-emerald-100 text-emerald-800">
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-950">
                        OVERALL LOAN BALANCE AFTER PAYMENT
                      </h4>
                      <p className="text-[11px] text-emerald-800/80 font-medium">
                        Customer's entire remaining loan obligation across all installments
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200/80 w-fit self-start sm:self-auto">
                    Loan Level
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* TOTAL PRINCIPAL OUTSTANDING */}
                  <div className="rounded-xl bg-white border border-slate-200 p-3 sm:p-3.5 flex items-start gap-3 shadow-2xs">
                    <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 shrink-0 mt-0.5">
                      <Layers className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 truncate">
                        TOTAL PRINCIPAL OUTSTANDING
                      </p>
                      <p className="text-lg font-bold text-slate-900 mt-0.5 truncate">
                        {formatCurrency(confirmedTransaction.totalPrincipalOutstanding)}
                      </p>
                    </div>
                  </div>

                  {/* TOTAL INTEREST OUTSTANDING */}
                  <div className="rounded-xl bg-white border border-slate-200 p-3 sm:p-3.5 flex items-start gap-3 shadow-2xs">
                    <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 shrink-0 mt-0.5">
                      <Percent className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 truncate">
                        TOTAL INTEREST OUTSTANDING
                      </p>
                      <p className="text-lg font-bold text-slate-900 mt-0.5 truncate">
                        {formatCurrency(confirmedTransaction.totalInterestOutstanding)}
                      </p>
                    </div>
                  </div>

                  {/* TOTAL LOAN OUTSTANDING */}
                  <div className="rounded-xl bg-white border border-emerald-200 p-3 sm:p-3.5 flex items-start gap-3 shadow-2xs">
                    <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 shrink-0 mt-0.5">
                      <IndianRupee className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-900 truncate">
                        TOTAL LOAN OUTSTANDING
                      </p>
                      <p className="text-lg font-bold text-emerald-800 mt-0.5 truncate">
                        {formatCurrency(confirmedTransaction.totalLoanOutstanding)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. INSTALLMENT PAYMENT BREAKDOWN */}
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
                {/* Section Header */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-slate-500" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      INSTALLMENT PAYMENT BREAKDOWN
                    </h4>
                  </div>
                  <span className="text-[11px] text-slate-400 font-medium">
                    {confirmedTransaction.allocations?.length || 0} Installment(s) applied
                  </span>
                </div>

                {/* Table for Tablet / Desktop */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-xs text-left min-w-[580px]">
                    <thead className="bg-slate-50/70 border-b border-slate-100 text-slate-600 font-semibold text-[11px]">
                      <tr>
                        <th className="px-4 py-2">Installment</th>
                        <th className="px-4 py-2">Due Date</th>
                        <th className="px-4 py-2 text-right">Remaining Due</th>
                        <th className="px-4 py-2 text-right">Amount Received</th>
                        <th className="px-4 py-2 text-right">Interest / Principal Paid</th>
                        <th className="px-4 py-2 text-right">Remaining Balance</th>
                        <th className="px-4 py-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {confirmedTransaction.allocations?.map((al) => {
                        const preRemainingDue = al.previousRemainingDue !== undefined 
                          ? al.previousRemainingDue 
                          : al.allocated + (al.balanceAfter || 0);

                        return (
                          <tr key={al.installmentNumber} className="hover:bg-slate-50/60">
                            <td className="px-4 py-2.5 font-bold text-slate-900">#{al.installmentNumber}</td>
                            <td className="px-4 py-2.5 text-slate-600">{formatDate(al.dueDate)}</td>
                            <td className="px-4 py-2.5 text-right font-medium text-slate-700">
                              {formatCurrency(preRemainingDue)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-bold text-emerald-800">
                              {formatCurrency(al.allocated)}
                            </td>
                            <td className="px-4 py-2.5 text-right text-slate-500 whitespace-nowrap">
                              {formatCurrency(al.interestPaid)} / {formatCurrency(al.principalPaid)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-bold text-slate-900">
                              {formatCurrency(al.balanceAfter)}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {al.statusAfter === "Paid" ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-600/20">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                                  Paid
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-600/20">
                                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                                  Partial
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View (shown on xs screens) */}
                <div className="block sm:hidden divide-y divide-slate-100 bg-white">
                  {confirmedTransaction.allocations?.map((al) => {
                    const preRemainingDue = al.previousRemainingDue !== undefined 
                      ? al.previousRemainingDue 
                      : al.allocated + (al.balanceAfter || 0);

                    return (
                      <div key={al.installmentNumber} className="p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900">
                            Installment #{al.installmentNumber}
                          </span>
                          <div>
                            {al.statusAfter === "Paid" ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-600/20">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                                Paid
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-600/20">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                                Partial
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-100">
                          <div>
                            <span className="text-slate-400 block text-[10px]">Due Date</span>
                            <span className="font-medium text-slate-700">{formatDate(al.dueDate)}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-slate-400 block text-[10px]">Remaining Due</span>
                            <span className="font-medium text-slate-700">{formatCurrency(preRemainingDue)}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px]">Amount Received</span>
                            <span className="font-bold text-emerald-800">{formatCurrency(al.allocated)}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-slate-400 block text-[10px]">Remaining Balance</span>
                            <span className="font-bold text-slate-900">{formatCurrency(al.balanceAfter)}</span>
                          </div>
                          <div className="col-span-2 text-slate-500 text-[10px] pt-0.5">
                            Interest / Principal Paid: <span className="font-semibold text-slate-700">{formatCurrency(al.interestPaid)} / {formatCurrency(al.principalPaid)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {confirmedTransaction.advanceCreated > 0 && (
                  <div className="px-4 py-2 bg-blue-50/80 border-t border-blue-200/60 flex items-center justify-between text-xs text-blue-900 font-semibold">
                    <span>Excess Advance Created:</span>
                    <span className="font-bold text-blue-800">{formatCurrency(confirmedTransaction.advanceCreated)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Buttons (Sticky bottom) */}
            <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-3.5 bg-white border-t border-slate-100 sticky bottom-0 z-20 shrink-0">
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-xl border border-slate-200 bg-white px-4 sm:px-5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2 shadow-2xs"
              >
                <Printer className="h-4 w-4" />
                <span>Print Receipt</span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmedTransaction(null)}
                className="rounded-xl bg-[#006052] px-6 sm:px-8 py-2 text-xs font-bold text-white shadow-2xs hover:bg-[#004d43] transition-colors flex items-center gap-2"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          3. SHARED COLLECTION DETAILS POPUP (FOR TODAY & OVERDUE SECTIONS)
      ========================================================================= */}
      {detailsCustomer && (() => {
        const c = detailsCustomer.customer;
        const isToday = detailsCustomer.context === "Today";

        // Relevant Due Amount and scheduled items based on originating section
        const relevantDueAmount = isToday ? c.totalDueToday : c.totalOverdue;
        const relevantOriginalScheduled = isToday ? c.originalDueToday : c.originalOverdue;
        const relevantCollected = Math.max(0, relevantOriginalScheduled - relevantDueAmount);
        const relevantInstalls = isToday ? (c.todayInstalls || []) : (c.overdueInstalls || []);

        // Dynamic status for the selected context
        let statusBadge = "Pending";
        if (relevantDueAmount <= 0.01) {
          statusBadge = "Paid";
        } else if (relevantCollected > 0.01) {
          statusBadge = "Partial";
        } else if (!isToday) {
          statusBadge = "Overdue";
        }

        const canCollect = relevantDueAmount > 0.01 && c.statusText !== "Collected";

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 md:p-6 backdrop-blur-xs overflow-y-auto overscroll-contain">
            <div className="w-full max-w-xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[90vh] rounded-2xl bg-white shadow-2xl relative flex flex-col border border-slate-200 overflow-hidden my-auto">
              {/* Header */}
              <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100 bg-white sticky top-0 z-20 shrink-0">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    isToday ? "bg-teal-50 text-[#006052] ring-4 ring-teal-50/50" : "bg-red-50 text-red-700 ring-4 ring-red-50/50"
                  }`}>
                    {isToday ? <CalendarIcon className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                        Collection Details
                      </h3>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                        isToday ? "bg-teal-50 text-teal-800 border border-teal-200" : "bg-red-50 text-red-800 border border-red-200"
                      }`}>
                        {isToday ? "Today Collection" : "Overdue Collection"}
                      </span>
                    </div>
                    <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5">
                      {isToday ? "Current installment details scheduled for today" : "Overdue installment status and outstanding breakdown"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailsCustomer(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors shrink-0"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
                {/* A. Customer Information Card */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2.5">
                    Customer Information
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Customer Name</span>
                      <p className="text-xs sm:text-sm font-bold text-slate-900 truncate mt-0.5">{c.customer?.name || "Customer"}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Customer ID</span>
                      <p className="text-xs sm:text-sm font-bold text-slate-700 font-mono mt-0.5">{c.customerId}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Loan ID</span>
                      <p className="text-xs sm:text-sm font-bold text-slate-700 font-mono mt-0.5">{c.loanId}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Loan Status</span>
                      <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/20 mt-0.5">
                        {c.loanStatus || (c.totalUnpaidInstallmentAmount > 0 ? "Active" : "Closed")}
                      </span>
                    </div>
                  </div>
                </div>

                {/* B. Outstanding Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      Total Loan Outstanding
                    </span>
                    <p className="text-lg sm:text-xl font-bold text-slate-900">
                      {formatCurrency(c.totalUnpaidInstallmentAmount || c.outstandingAmount || 0)}
                    </p>
                    <span className="text-[11px] text-slate-400 mt-0.5 block">
                      Remaining principal & interest across all installments
                    </span>
                  </div>

                  <div className={`rounded-xl border p-3.5 shadow-2xs ${
                    isToday ? "bg-teal-50/50 border-teal-200" : "bg-red-50/50 border-red-200"
                  }`}>
                    <span className={`text-[10px] font-bold uppercase tracking-wider block mb-1 ${
                      isToday ? "text-teal-800" : "text-red-800"
                    }`}>
                      {isToday ? "Today's Due Amount" : "Applicable Overdue Amount"}
                    </span>
                    <p className={`text-lg sm:text-xl font-bold ${
                      isToday ? "text-[#006052]" : "text-red-700"
                    }`}>
                      {formatCurrency(relevantDueAmount)}
                    </p>
                    <span className={`text-[11px] mt-0.5 block ${
                      isToday ? "text-teal-700/80" : "text-red-600/80"
                    }`}>
                      {isToday ? "Amount payable for today's installment" : `${c.overdueCount || relevantInstalls.length} installment(s) overdue`}
                    </span>
                  </div>
                </div>

                {/* C. Collection Summary Section */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      {isToday ? "Today's Installment Breakdown" : "Overdue Installments Breakdown"}
                    </span>
                    <div>
                      {statusBadge === "Paid" && (
                        <span className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                          Paid
                        </span>
                      )}
                      {statusBadge === "Partial" && (
                        <span className="inline-flex items-center rounded-md bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                          Partial
                        </span>
                      )}
                      {statusBadge === "Overdue" && (
                        <span className="inline-flex items-center rounded-md bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-700 ring-1 ring-inset ring-red-600/20">
                          Overdue
                        </span>
                      )}
                      {statusBadge === "Pending" && (
                        <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700 ring-1 ring-inset ring-slate-500/20">
                          Pending
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5 text-center py-1">
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Scheduled
                      </span>
                      <p className="text-sm font-bold text-slate-800 mt-1">
                        {formatCurrency(relevantOriginalScheduled)}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-100">
                      <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">
                        Collected
                      </span>
                      <p className="text-sm font-bold text-emerald-800 mt-1">
                        {formatCurrency(relevantCollected)}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-amber-50/60 border border-amber-100">
                      <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">
                        Remaining Due
                      </span>
                      <p className="text-sm font-bold text-amber-900 mt-1">
                        {formatCurrency(relevantDueAmount)}
                      </p>
                    </div>
                  </div>

                  {/* Installments List */}
                  {relevantInstalls.length > 0 && (
                    <div className="pt-2 border-t border-slate-100">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                        Installment Details
                      </span>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {relevantInstalls.map((inst, idx) => {
                          const instDue = Math.max(0, inst.emi - (inst.amountPaid || 0));
                          const isInstPartial = (inst.amountPaid || 0) > 0 && instDue > 0;
                          return (
                            <div
                              key={inst.installmentNumber || idx}
                              className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-50/80 border border-slate-100"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-800 font-mono">
                                  Installment #{inst.installmentNumber}
                                </span>
                                <span className="text-slate-400">•</span>
                                <span className="text-slate-500 text-[11px]">
                                  Due: {formatDate(inst.dueDate)}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-right">
                                {isInstPartial && (
                                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                    Paid: {formatCurrency(inst.amountPaid)}
                                  </span>
                                )}
                                <span className="font-bold text-slate-900">
                                  Due: {formatCurrency(instDue)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* D. Footer Actions */}
              <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-3.5 bg-white border-t border-slate-100 sticky bottom-0 z-20 shrink-0">
                <button
                  type="button"
                  onClick={() => setDetailsCustomer(null)}
                  className="rounded-xl border border-slate-200 bg-white px-5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
                >
                  Close
                </button>
                {canCollect && (
                  <button
                    type="button"
                    onClick={() => {
                      const cust = detailsCustomer.customer;
                      setDetailsCustomer(null);
                      handleCollectClick(cust);
                    }}
                    className="rounded-xl bg-[#006052] px-6 sm:px-7 py-2 text-xs font-bold text-white shadow-2xs hover:bg-[#004d43] transition-colors flex items-center gap-2"
                  >
                    <span>Collect Payment</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default Collection;
