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
  ShieldCheck
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { generateSchedule } from "../../components/RepaymentScheduleTable";

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
  const [remarks, setRemarks] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);

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
    setRemarks("EMI Collection");
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

        const newAmountPaid = (s.amountPaid || 0) + alloc;
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

  const handleView = (c) => {
    navigate("/customers");
  };

  return (
    <div className="flex flex-col flex-1 min-h-screen w-full max-w-full overflow-x-hidden bg-slate-50 px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-8">
      {/* HEADER + SEARCH + DATE ROW */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between shrink-0 mb-5 sm:mb-6 gap-3.5 sm:gap-4">
        <div>
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-slate-900 sm:text-3xl">Collection</h1>
          <p className="mt-1 sm:mt-2 text-xs sm:text-[15px] text-slate-500">Today's dues and overdue payments</p>
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
                    onClick={() => handleView(c)}
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
                          onClick={() => handleView(c)}
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
          1. COLLECT PAYMENT POPUP
          Exactly 3 summary cards at the top, customer & loan details, unpaid schedule,
          payment form, allocation preview, Cancel & Confirm Payment buttons.
      ========================================================================= */}
      {selectedCustomer && (() => {
        const amountReceived = Number(collectAmount) || 0;
        const unpaidSchedule = selectedCustomer.allUnpaidInstalls || [];

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 sm:p-4 md:p-6 backdrop-blur-xs">
            <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl relative max-h-[94vh] sm:max-h-[92vh] overflow-y-auto flex flex-col border border-slate-200">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-200 px-4 sm:px-6 py-3.5 sm:py-4 sticky top-0 bg-white z-20 rounded-t-2xl shadow-2xs">
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
                    <Banknote className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate">Collect Payment</h3>
                    <p className="text-[11px] sm:text-xs text-slate-500 truncate">
                      {selectedCustomer.customer?.name} · {selectedCustomer.loanId} · {selectedCustomer.customerId}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="rounded-full p-1.5 sm:p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors shrink-0"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-4 sm:p-6 flex flex-col gap-4 sm:gap-5">
                {/* 3 SUMMARY CARDS AT THE TOP (EXACTLY 3 CARDS) */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
                  {/* Card 1: Total Installment Amount */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3.5 sm:p-4 shadow-2xs">
                    <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">
                      Total Installment Amount
                    </p>
                    <p className="text-lg sm:text-xl font-black text-slate-900 mt-0.5 sm:mt-1 truncate">
                      {formatCurrency(selectedCustomer.totalUnpaidInstallmentAmount)}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                      {unpaidSchedule.length} Unpaid {unpaidSchedule.length === 1 ? "Installment" : "Installments"}
                    </p>
                  </div>

                  {/* Card 2: Overdue Amount */}
                  <div className="rounded-xl border border-red-200 bg-red-50/60 p-3.5 sm:p-4 shadow-2xs">
                    <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-red-700 truncate">
                      Overdue Amount
                    </p>
                    <p className="text-lg sm:text-xl font-black text-red-700 mt-0.5 sm:mt-1 truncate">
                      {formatCurrency(selectedCustomer.totalOverdue)}
                    </p>
                    <p className="text-[11px] text-red-600 mt-0.5 truncate">
                      {selectedCustomer.overdueInstalls?.length || 0} Overdue {selectedCustomer.overdueInstalls?.length === 1 ? "Installment" : "Installments"}
                    </p>
                  </div>

                  {/* Card 3: Current Installment */}
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 sm:p-4 shadow-2xs">
                    <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-emerald-800 truncate">
                      Current Installment
                    </p>
                    <p className="text-lg sm:text-xl font-black text-emerald-800 mt-0.5 sm:mt-1 truncate">
                      {formatCurrency(selectedCustomer.totalDueToday)}
                    </p>
                    <p className="text-[11px] text-emerald-700 mt-0.5 truncate">
                      {selectedCustomer.todayInstalls?.length > 0 ? "Due Today" : "None Due Today"}
                    </p>
                  </div>
                </div>

                {/* Customer and Loan Details Strip */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:p-3.5 text-xs text-slate-600">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
                    <div className="min-w-0">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider truncate">Customer</span>
                      <span className="font-bold text-slate-800 text-xs mt-0.5 block truncate">{selectedCustomer.customer?.name}</span>
                      <span className="text-slate-500 text-[11px] block truncate">{selectedCustomer.customer?.mobile || "—"}</span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider truncate">Loan ID</span>
                      <span className="font-bold text-slate-800 text-xs mt-0.5 block truncate">{selectedCustomer.loanId}</span>
                      <span className="text-slate-500 text-[11px] block truncate">Amount: {formatCurrency(selectedCustomer.loanAmount)}</span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider truncate">Vehicle</span>
                      <span className="font-bold text-slate-800 text-xs mt-0.5 block truncate">
                        {selectedCustomer.vehicle?.regNo || selectedCustomer.vehicle?.model || "—"}
                      </span>
                      <span className="text-slate-500 text-[11px] block truncate">{selectedCustomer.vehicle?.brand || ""}</span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider truncate">Frequency</span>
                      <span className="font-bold text-slate-800 text-xs mt-0.5 block truncate">
                        {selectedCustomer.paymentFrequency || selectedCustomer.loan?.paymentFrequency || "Monthly"}
                      </span>
                      <span className="text-slate-500 text-[11px] block truncate">
                        EMI: {formatCurrency(selectedCustomer.emiAmount || selectedCustomer.fullSchedule[0]?.emi || 0)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Unpaid Installment Schedule */}
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-1">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Unpaid Installment Schedule
                    </h4>
                    <span className="text-[11px] text-slate-400">
                      Showing {unpaidSchedule.length} unpaid of {selectedCustomer.fullSchedule.length} total
                    </span>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-48 overflow-y-auto">
                    <table className="w-full text-xs text-left min-w-[520px]">
                      <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold z-10">
                        <tr>
                          <th className="px-3.5 py-2">Installment</th>
                          <th className="px-3.5 py-2">Due Date</th>
                          <th className="px-3.5 py-2 text-right">Installment Amount</th>
                          <th className="px-3.5 py-2 text-right">Amount Paid</th>
                          <th className="px-3.5 py-2 text-right">Remaining Due</th>
                          <th className="px-3.5 py-2 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {unpaidSchedule.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-6 text-center text-slate-400">
                              All installments are fully paid.
                            </td>
                          </tr>
                        ) : (
                          unpaidSchedule.map((s) => {
                            const remainingDue = Math.max(0, s.emi - (s.amountPaid || 0));
                            const isOverdue = getDayDiff(s.dueDate, date) < 0;
                            const isToday = getDayDiff(s.dueDate, date) === 0;

                            return (
                              <tr key={s.installmentNumber} className="hover:bg-slate-50/80">
                                <td className="px-3.5 py-2 font-bold text-slate-700">#{s.installmentNumber}</td>
                                <td className="px-3.5 py-2 font-medium text-slate-900">{formatDate(s.dueDate)}</td>
                                <td className="px-3.5 py-2 text-right font-semibold text-slate-800">
                                  {formatCurrency(s.emi)}
                                </td>
                                <td className="px-3.5 py-2 text-right text-slate-500">
                                  {formatCurrency(s.amountPaid || 0)}
                                </td>
                                <td className="px-3.5 py-2 text-right font-bold text-slate-900">
                                  {formatCurrency(remainingDue)}
                                </td>
                                <td className="px-3.5 py-2 text-center">
                                  {isOverdue ? (
                                    <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 ring-1 ring-red-600/20">
                                      Overdue
                                    </span>
                                  ) : isToday ? (
                                    <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-600/20">
                                      Due Today
                                    </span>
                                  ) : s.amountPaid > 0 ? (
                                    <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-600/20">
                                      Partial
                                    </span>
                                  ) : (
                                    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 ring-1 ring-slate-500/20">
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
                </div>

                {/* Payment Amount Input & Quick-Select Pills */}
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Payment Amount <span className="text-red-500">*</span>
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedCustomer.totalOverdue > 0 && (
                        <button
                          type="button"
                          onClick={() => setCollectAmount(String(selectedCustomer.totalOverdue))}
                          className="rounded-md bg-red-50 border border-red-200 px-2 py-1 text-[10px] sm:text-[11px] font-semibold text-red-700 hover:bg-red-100 transition-colors"
                        >
                          Pay Overdue ({formatCurrency(selectedCustomer.totalOverdue)})
                        </button>
                      )}
                      {selectedCustomer.totalDueToday > 0 && (
                        <button
                          type="button"
                          onClick={() => setCollectAmount(String(selectedCustomer.totalDueToday))}
                          className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-1 text-[10px] sm:text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 transition-colors"
                        >
                          Pay Today ({formatCurrency(selectedCustomer.totalDueToday)})
                        </button>
                      )}
                      {selectedCustomer.currentTotalDue > 0 && (
                        <button
                          type="button"
                          onClick={() => setCollectAmount(String(selectedCustomer.currentTotalDue))}
                          className="rounded-md bg-slate-100 border border-slate-200 px-2 py-1 text-[10px] sm:text-[11px] font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
                        >
                          Pay Current ({formatCurrency(selectedCustomer.currentTotalDue)})
                        </button>
                      )}
                      {selectedCustomer.totalUnpaidInstallmentAmount > 0 &&
                        selectedCustomer.totalUnpaidInstallmentAmount !== selectedCustomer.currentTotalDue && (
                          <button
                            type="button"
                            onClick={() => setCollectAmount(String(selectedCustomer.totalUnpaidInstallmentAmount))}
                            className="rounded-md bg-slate-100 border border-slate-200 px-2 py-1 text-[10px] sm:text-[11px] font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
                          >
                            Pay All ({formatCurrency(selectedCustomer.totalUnpaidInstallmentAmount)})
                          </button>
                        )}
                    </div>
                  </div>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-slate-400">₹</span>
                    <input
                      type="number"
                      value={collectAmount}
                      onChange={(e) => setCollectAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded-xl border border-slate-300 bg-white py-2.5 sm:py-3 pl-8 pr-4 text-lg sm:text-xl font-black text-slate-900 shadow-2xs outline-none transition-colors focus:border-[#006052] focus:ring-1 focus:ring-[#006052]"
                    />
                  </div>
                </div>

                {/* Payment Date & Payment Method */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 sm:mb-2">
                      Payment Date <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <CalendarIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                      <input
                        type="date"
                        value={paymentDate}
                        onChange={(e) => setPaymentDate(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white py-2 sm:py-2.5 pl-10 pr-3 text-xs sm:text-sm font-semibold text-slate-800 shadow-2xs outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 sm:mb-2">
                      Payment Method <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                      {["Cash", "UPI", "Bank Transfer"].map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setPaymentMode(mode)}
                          className={`rounded-xl border py-2 sm:py-2.5 px-1 sm:px-2 text-[11px] sm:text-xs font-bold transition-all text-center truncate ${
                            paymentMode === mode
                              ? "bg-[#006052] border-[#006052] text-white shadow-xs"
                              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Remarks */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Remarks
                  </label>
                  <input
                    type="text"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="e.g. Regular EMI Collection, Transaction notes..."
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 sm:py-2.5 text-xs sm:text-sm text-slate-800 shadow-2xs outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052]"
                  />
                </div>

                {/* Live Payment Allocation Preview */}
                {amountReceived > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 sm:p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2.5 gap-1.5">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-slate-500 shrink-0" />
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                          Payment Allocation Preview
                        </h4>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] sm:text-[11px] font-bold w-fit ${
                          allocationPreview.paymentType === "FULL"
                            ? "bg-emerald-100 text-emerald-800"
                            : allocationPreview.paymentType === "EXCESS"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {allocationPreview.paymentType === "FULL"
                          ? "Full Payment"
                          : allocationPreview.paymentType === "EXCESS"
                          ? "Excess / Advance Payment"
                          : "Partial Payment"}
                      </span>
                    </div>

                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 text-xs">
                      {allocationPreview.allocations.map((al) => (
                        <div
                          key={al.installmentNumber}
                          className="flex flex-col sm:flex-row sm:items-center justify-between rounded-lg bg-white p-2.5 border border-slate-200 text-slate-700 gap-1.5"
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900">Installment #{al.installmentNumber}</span>
                            <span className="text-[11px] text-slate-400">({formatDate(al.dueDate)})</span>
                            {al.isAdvance && (
                              <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200">
                                Advance
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-between sm:justify-end gap-3">
                            <span className="font-black text-emerald-800">{formatCurrency(al.allocated)}</span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                al.statusAfter === "Paid"
                                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20"
                                  : "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20"
                              }`}
                            >
                              {al.statusAfter}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {allocationPreview.unappliedAdvance > 0 && (
                      <div className="mt-2.5 rounded-lg border border-blue-200 bg-blue-50 p-2.5 flex flex-col sm:flex-row justify-between items-start sm:items-center text-xs text-blue-900 font-semibold gap-1">
                        <span>Unapplied Advance (exceeds all installments):</span>
                        <span className="font-black text-sm">{formatCurrency(allocationPreview.unappliedAdvance)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="border-t border-slate-200 p-4 sm:p-6 flex flex-col-reverse sm:flex-row gap-2.5 sm:gap-3 bg-slate-50/90 rounded-b-2xl mt-auto">
                <button
                  type="button"
                  onClick={() => setSelectedCustomer(null)}
                  disabled={isSubmitting}
                  className="w-full sm:flex-1 rounded-xl border border-slate-300 bg-white py-2.5 sm:py-3 text-xs sm:text-sm font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors disabled:opacity-50 text-center"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPayment}
                  disabled={amountReceived <= 0 || isSubmitting}
                  className="w-full sm:flex-1 rounded-xl bg-[#006052] py-2.5 sm:py-3 text-xs sm:text-sm font-bold text-white shadow-sm hover:bg-[#004d43] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmitting ? "Processing Payment..." : "Confirm Payment"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* =========================================================================
          2. AMOUNT COLLECTED SUCCESSFULLY CONFIRMATION POPUP
          Displays transaction details, loan-level outstanding (Principal, Interest, Total),
          and installment allocations clearly separated.
      ========================================================================= */}
      {confirmedTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 sm:p-4 md:p-6 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl relative max-h-[94vh] sm:max-h-[92vh] overflow-y-auto flex flex-col border border-slate-200">
            {/* Success Header */}
            <div className="p-4 sm:p-6 text-center border-b border-slate-100 bg-gradient-to-b from-emerald-50/60 to-white">
              <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 mx-auto mb-2 sm:mb-3 shadow-2xs ring-4 ring-emerald-50">
                <CheckCircle2 className="h-7 w-7 sm:h-8 sm:w-8" />
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900">Amount Collected Successfully</h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Transaction recorded and synchronized across Ledger, Loan, and Dashboard
              </p>
            </div>

            <div className="p-4 sm:p-6 flex flex-col gap-4 sm:gap-5">
              {/* Transaction Key Details Banner */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3.5 sm:p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-200/80 gap-1.5">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Transaction Amount</span>
                    <p className="text-xl sm:text-2xl font-black text-emerald-800">{formatCurrency(confirmedTransaction.amount)}</p>
                  </div>
                  <div className="text-left sm:text-right">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Payment Method</span>
                    <p className="text-xs sm:text-sm font-bold text-slate-800">{confirmedTransaction.mode}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 pt-3 text-xs">
                  <div className="min-w-0">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider truncate">Customer</span>
                    <span className="font-bold text-slate-900 text-xs block truncate">{confirmedTransaction.customerName}</span>
                    <span className="text-slate-500 text-[11px] font-mono block truncate">{confirmedTransaction.customerId}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider truncate">Loan ID</span>
                    <span className="font-bold text-slate-900 text-xs block truncate">{confirmedTransaction.loanId}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider truncate">Payment Date</span>
                    <span className="font-semibold text-slate-800 text-xs block truncate">{formatDate(confirmedTransaction.date)}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider truncate">Reference</span>
                    <span className="font-mono text-[11px] font-semibold text-slate-700 block truncate" title={confirmedTransaction.transactionRef}>
                      {confirmedTransaction.transactionRef}
                    </span>
                  </div>
                </div>
              </div>

              {/* OVERALL LOAN OUTSTANDING SUMMARY (ENTIRE LOAN BALANCE AFTER THIS COLLECTION) */}
              <div className="rounded-xl border border-emerald-300 bg-gradient-to-br from-emerald-50/90 via-teal-50/50 to-emerald-50/70 p-3.5 sm:p-4 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-1.5">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-emerald-950 flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4 text-emerald-700 shrink-0" />
                      Overall Loan Balance After Payment
                    </h4>
                    <p className="text-[11px] text-emerald-800/80 font-medium">
                      Customer's entire remaining loan obligation across all installments
                    </p>
                  </div>
                  <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200 w-fit">
                    Loan Level
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-2.5">
                  <div className="rounded-lg bg-white/95 border border-emerald-100 p-2.5 sm:p-3 shadow-2xs">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 truncate">
                      Total Principal Outstanding
                    </p>
                    <p className="text-base sm:text-lg font-black text-slate-900 mt-0.5 truncate">
                      {formatCurrency(confirmedTransaction.totalPrincipalOutstanding)}
                    </p>
                  </div>

                  <div className="rounded-lg bg-white/95 border border-emerald-100 p-2.5 sm:p-3 shadow-2xs">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 truncate">
                      Total Interest Outstanding
                    </p>
                    <p className="text-base sm:text-lg font-black text-slate-900 mt-0.5 truncate">
                      {formatCurrency(confirmedTransaction.totalInterestOutstanding)}
                    </p>
                  </div>

                  <div className="rounded-lg bg-white/95 border border-emerald-200 p-2.5 sm:p-3 shadow-2xs">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-900 truncate">
                      Total Loan Outstanding
                    </p>
                    <p className="text-base sm:text-lg font-black text-emerald-800 mt-0.5 truncate">
                      {formatCurrency(confirmedTransaction.totalLoanOutstanding)}
                    </p>
                  </div>
                </div>
              </div>

              {/* INSTALLMENT-LEVEL PAYMENT ALLOCATIONS (CLEARLY SEPARATED) */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Installment Payment Breakdown
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    {confirmedTransaction.allocations?.length || 0} Installment(s) applied
                  </span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-48 overflow-y-auto">
                  <table className="w-full text-xs text-left min-w-[520px]">
                    <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold z-10">
                      <tr>
                        <th className="px-3 py-2">Installment</th>
                        <th className="px-3 py-2">Due Date</th>
                        <th className="px-3 py-2 text-right">Amount Allocated</th>
                        <th className="px-3 py-2 text-right">Interest / Principal Paid</th>
                        <th className="px-3 py-2 text-right">Remaining Balance</th>
                        <th className="px-3 py-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {confirmedTransaction.allocations?.map((al) => (
                        <tr key={al.installmentNumber}>
                          <td className="px-3 py-2 font-bold text-slate-800">#{al.installmentNumber}</td>
                          <td className="px-3 py-2 text-slate-600">{formatDate(al.dueDate)}</td>
                          <td className="px-3 py-2 text-right font-black text-emerald-800">
                            {formatCurrency(al.allocated)}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-500">
                            {formatCurrency(al.interestPaid)} / {formatCurrency(al.principalPaid)}
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-slate-800">
                            {formatCurrency(al.balanceAfter)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                al.statusAfter === "Paid"
                                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20"
                                  : "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20"
                              }`}
                            >
                              {al.statusAfter}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {confirmedTransaction.advanceCreated > 0 && (
                  <div className="mt-2.5 rounded-xl border border-blue-200 bg-blue-50/80 p-2.5 sm:p-3 flex flex-col sm:flex-row justify-between items-start sm:items-center text-xs gap-1">
                    <span className="font-semibold text-blue-900">
                      Excess Advance Created (Available for future dues):
                    </span>
                    <span className="font-black text-blue-950 text-sm">
                      {formatCurrency(confirmedTransaction.advanceCreated)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="border-t border-slate-100 p-4 sm:p-6 flex flex-col-reverse sm:flex-row gap-2.5 sm:gap-3 bg-slate-50/90 rounded-b-2xl mt-auto">
              <button
                type="button"
                onClick={() => window.print()}
                className="w-full sm:w-auto rounded-xl border border-slate-300 bg-white px-5 py-2.5 sm:py-3 text-xs sm:text-sm font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
              >
                <Printer className="h-4 w-4" />
                Print Receipt
              </button>
              <button
                type="button"
                onClick={() => setConfirmedTransaction(null)}
                className="w-full sm:flex-1 rounded-xl bg-[#006052] py-2.5 sm:py-3 text-xs sm:text-sm font-bold text-white shadow-sm hover:bg-[#004d43] transition-colors flex items-center justify-center gap-2"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Collection;
