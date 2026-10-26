import React, { useState, useMemo, useEffect } from "react";
import {
  X,
  Search,
  AlertCircle,
  CheckCircle2,
  Calendar,
  CreditCard,
  User,
  Hash,
  ArrowRight,
  ShieldAlert,
  Coins,
  ReceiptText,
  ChevronDown,
  ChevronUp,
  Table
} from "lucide-react";
import { generateSchedule, computeEffectiveSchedule } from "./RepaymentScheduleTable";
import { formatDate } from "../utils/dateUtils";
import { getInstallmentPenaltySupportingAmount } from "../utils/penaltyRules";
import { getCurrentUser } from "../utils/userManagementStorage";

const formatCurrency = (val) => {
  if (val === undefined || val === null || isNaN(Number(val))) return "₹0";
  return `₹${Math.round(Number(val)).toLocaleString("en-IN")}`;
};

/**
 * MidwayClosureModal
 * Shared component used in both Collection module and Loan View page.
 *
 * @param {boolean} isOpen
 * @param {Function} onClose
 * @param {Object} [preselectedLoanRecord] - When opened from LoanDetailsView
 * @param {Function} [onSuccess] - Callback when closure succeeds
 */
export default function MidwayClosureModal({
  isOpen,
  onClose,
  preselectedLoanRecord = null,
  onSuccess
}) {
  const [customersList, setCustomersList] = useState([]);
  const [paymentsHistory, setPaymentsHistory] = useState([]);

  // Search state when opened without preselection
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomerRecord, setSelectedCustomerRecord] = useState(null);

  // Settlement Form state
  const [interestInstalmentsCount, setInterestInstalmentsCount] = useState(1);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [transactionRefId, setTransactionRefId] = useState("");
  const [closureRemarks, setClosureRemarks] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [closureSuccessData, setClosureSuccessData] = useState(null);

  // Toggle state for Repayment Schedule separate overlay modal
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  // Close schedule modal on Escape key and prevent background scroll while open
  useEffect(() => {
    if (!showScheduleModal) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setShowScheduleModal(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showScheduleModal]);

  // Load latest data from localStorage
  const loadData = () => {
    try {
      const customers = JSON.parse(localStorage.getItem("motoLendCustomersList_data") || "[]");
      setCustomersList(customers);
    } catch {
      setCustomersList([]);
    }
    try {
      const payments = JSON.parse(localStorage.getItem("motoLendPaymentHistory") || "[]");
      setPaymentsHistory(payments);
    } catch {
      setPaymentsHistory([]);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
      setErrorMessage("");
      setClosureSuccessData(null);
      setIsSubmitting(false);
      setShowScheduleModal(false);

      if (preselectedLoanRecord) {
        setSelectedCustomerRecord(preselectedLoanRecord);
      } else {
        setSelectedCustomerRecord(null);
        setSearchQuery("");
      }
    }
  }, [isOpen, preselectedLoanRecord]);

  // Derived effective loan record from live data
  const currentLoanRecord = useMemo(() => {
    if (!selectedCustomerRecord) return null;
    const targetLoanId = (selectedCustomerRecord.loanId || selectedCustomerRecord.loan?.loanId || "").trim().toLowerCase();
    const liveCust = customersList.find((c) => {
      const cLoanId = (c.loanId || c.loan?.loanId || "").trim().toLowerCase();
      return cLoanId === targetLoanId;
    });
    return liveCust || selectedCustomerRecord;
  }, [customersList, selectedCustomerRecord]);

  // Determine loan details, schedule, and live reconciliation
  const loanDetails = useMemo(() => {
    if (!currentLoanRecord) return null;

    const customer = currentLoanRecord.customer || {};
    const vehicle = currentLoanRecord.vehicle || {};
    const loan = currentLoanRecord.loan || {};

    const loanId = currentLoanRecord.loanId || loan.loanId || "—";
    const customerId = currentLoanRecord.customerId || "—";
    const customerName = customer.name || currentLoanRecord.customerName || "Customer";
    const customerMobile = customer.mobile || "—";

    // Principal Amount
    const vehicleAmount =
      loan.vehicleAmount !== "" && loan.vehicleAmount !== null && loan.vehicleAmount !== undefined
        ? Number(loan.vehicleAmount)
        : Number(vehicle.amount || 0);
    const downPayment = Number(loan.downPayment || 0);
    const calculatedPrincipal = Math.max(vehicleAmount - downPayment, 0);
    const principalAmount = Number(currentLoanRecord.loanAmount || calculatedPrincipal || 0);

    // Baseline Raw Schedule
    let baseSchedule = currentLoanRecord.repaymentSchedule || [];
    if (!baseSchedule || baseSchedule.length === 0) {
      const effectiveRate = Number(loan.interestRate ?? currentLoanRecord.interestRate ?? currentLoanRecord.rate ?? 0);
      const effectiveTenure = Number(loan.tenure ?? currentLoanRecord.tenure ?? 0);
      const effectiveTenureUnit = loan.tenureUnit || currentLoanRecord.tenureUnit || "Months";
      const effectiveFrequency = loan.paymentFrequency || currentLoanRecord.paymentFrequency || "Monthly";
      const effectiveInterestType = loan.interestType || currentLoanRecord.interestType || "Flat";
      const effectiveRepaymentMethod = loan.repaymentMethod || currentLoanRecord.repaymentMethod || "EMI";
      const effectiveFirstDueDate = loan.firstDueDate || currentLoanRecord.firstDueDate || currentLoanRecord.nextDueDate || currentLoanRecord.date;

      if (principalAmount > 0 && effectiveRate > 0 && effectiveTenure > 0) {
        baseSchedule = generateSchedule({
          loanAmount: principalAmount,
          interestRate: effectiveRate,
          tenure: effectiveTenure,
          tenureUnit: effectiveTenureUnit,
          paymentFrequency: effectiveFrequency,
          interestType: effectiveInterestType,
          repaymentMethod: effectiveRepaymentMethod,
          firstDueDate: effectiveFirstDueDate
        });
      }
    }

    // Filter payments for this loan
    const relevantPayments = paymentsHistory.filter((p) => {
      if (!p) return false;
      const status = (p.status || "").toLowerCase();
      if (status === "failed" || status === "cancelled" || status === "reversed") return false;
      return (
        (p.loanId && p.loanId.trim().toLowerCase() === loanId.trim().toLowerCase()) ||
        (!p.loanId && p.customerId && p.customerId === customerId)
      );
    });

    // Effective reconciled schedule
    const schedule = computeEffectiveSchedule(baseSchedule, relevantPayments);

    // Sum principal repaid so far
    const totalPrincipalRepaid = schedule.reduce((sum, s) => {
      if (s.principalPaid !== undefined && s.principalPaid !== null && !isNaN(Number(s.principalPaid))) {
        return sum + Number(s.principalPaid || 0);
      }
      const intDue = Number(s.interest || 0);
      const amtPaid = Number(s.amountPaid || 0);
      const intPaid = Math.min(intDue, amtPaid);
      return sum + Math.max(0, amtPaid - intPaid);
    }, 0);
    const principalOutstanding = Math.max(0, Math.round((principalAmount - totalPrincipalRepaid) * 100) / 100);

    // Count fully paid installments
    const installmentsPaidCount = schedule.filter(
      (s) => s.status === "Collected" || s.status === "Paid" || s.balance <= 0.01
    ).length;

    // Helper: calculate pending allocated interest on any installment
    const getInstalmentPendingInterest = (s) => {
      if (!s) return 0;
      const instInterest = Number(
        s.interest ??
        s.allocatedInterest ??
        s.interestAmount ??
        Math.max(0, Number(s.emi || 0) - Number(s.principal || 0))
      );
      const intPaid = Number(s.interestPaid || 0);
      return Math.max(0, Math.round((instInterest - intPaid) * 100) / 100);
    };

    // Remaining eligible installments that have pending allocated interest
    // Selects eligible instalments in chronological order after the last paid instalment
    const eligibleInstalls = schedule
      .filter((s) => s.status !== "Collected" && s.status !== "Paid" && s.balance > 0.01)
      .filter((s) => getInstalmentPendingInterest(s) > 0.01);

    // Total pending interest across all remaining installments
    const pendingInterestTotal = eligibleInstalls.reduce((sum, s) => {
      return sum + getInstalmentPendingInterest(s);
    }, 0);

    const paymentFrequency = loan.paymentFrequency || currentLoanRecord.paymentFrequency || "Monthly";
    const isWeekly = paymentFrequency === "Weekly";
    const isDaily = paymentFrequency === "Daily";
    const daysPerPeriod = isDaily ? 1 : isWeekly ? 7 : 30;
    const unitLabel = isDaily ? "Day" : isWeekly ? "Week" : "Month";
    const unitLabelPlural = isDaily ? "Days" : isWeekly ? "Weeks" : "Months";

    const isClosed =
      currentLoanRecord.status === "Closed" ||
      currentLoanRecord.status === "Foreclosed" ||
      currentLoanRecord.isForeclosed ||
      principalOutstanding <= 0.01;

    return {
      loanId,
      customerId,
      customerName,
      customerMobile,
      vehicleRegNo: vehicle.regNo || "—",
      principalAmount,
      principalOutstanding,
      installmentsPaidCount,
      totalInstallmentsCount: schedule.length,
      eligibleInstalls,
      pendingInterestTotal,
      schedule,
      getInstalmentPendingInterest,
      paymentFrequency,
      isWeekly,
      isDaily,
      daysPerPeriod,
      unitLabel,
      unitLabelPlural,
      isClosed
    };
  }, [currentLoanRecord, paymentsHistory]);

  // Adjust interest instalments count automatically to stay within eligible range
  useEffect(() => {
    if (loanDetails) {
      const maxCount = loanDetails.eligibleInstalls.length;
      if (maxCount === 0) {
        setInterestInstalmentsCount(0);
      } else if (interestInstalmentsCount > maxCount) {
        setInterestInstalmentsCount(maxCount);
      } else if (interestInstalmentsCount < 0 && interestInstalmentsCount !== "") {
        setInterestInstalmentsCount(0);
      }
    }
  }, [loanDetails]);

  // Calculate settlement breakdown based on selected interest installments count
  const settlement = useMemo(() => {
    if (!loanDetails) return null;

    const count = parseInt(interestInstalmentsCount, 10);
    const maxAvailable = loanDetails.eligibleInstalls.length;

    if (isNaN(count) || count < 0) {
      return {
        isValid: false,
        error: "Please enter a valid number of interest instalments.",
        allocatedInterest: 0,
        selectedInstalments: [],
        rangeText: "None",
        totalClosureAmount: loanDetails.principalOutstanding,
        interestPerDay: null
      };
    }

    if (maxAvailable === 0 && count > 0) {
      return {
        isValid: false,
        error: "No remaining installments with allocated interest. Interest instalments must be 0.",
        allocatedInterest: 0,
        selectedInstalments: [],
        rangeText: "None",
        totalClosureAmount: loanDetails.principalOutstanding,
        interestPerDay: null
      };
    }

    if (count > maxAvailable) {
      return {
        isValid: false,
        error: `Only ${maxAvailable} eligible ${maxAvailable === 1 ? loanDetails.unitLabel.toLowerCase() : loanDetails.unitLabelPlural.toLowerCase()} remain. Please enter a value between 1 and ${maxAvailable}.`,
        allocatedInterest: 0,
        selectedInstalments: [],
        rangeText: "None",
        totalClosureAmount: loanDetails.principalOutstanding,
        interestPerDay: null
      };
    }

    // Select the next N eligible installments in chronological order
    const selectedInstalments = loanDetails.eligibleInstalls.slice(0, count);

    // Sum their existing allocated interest
    const allocatedInterest = selectedInstalments.reduce((sum, s) => {
      const remInt = loanDetails.getInstalmentPendingInterest
        ? loanDetails.getInstalmentPendingInterest(s)
        : Math.max(0, Number(s.interest || 0) - Number(s.interestPaid || 0));
      return sum + remInt;
    }, 0);

    let rangeText = "None";
    if (selectedInstalments.length === 1) {
      rangeText = `Instalment #${selectedInstalments[0].installmentNumber}`;
    } else if (selectedInstalments.length > 1) {
      const first = selectedInstalments[0].installmentNumber;
      const last = selectedInstalments[selectedInstalments.length - 1].installmentNumber;
      rangeText = `Instalments #${first} – #${last}`;
    }

    const totalClosureAmount = loanDetails.principalOutstanding + allocatedInterest;

    // Derive per-day interest amount:
    let interestPerDay = null;
    const totalDays = count > 0 ? count * loanDetails.daysPerPeriod : loanDetails.daysPerPeriod;
    const interestToDivide = count > 0
      ? allocatedInterest
      : (loanDetails.eligibleInstalls[0]
          ? (loanDetails.getInstalmentPendingInterest ? loanDetails.getInstalmentPendingInterest(loanDetails.eligibleInstalls[0]) : Number(loanDetails.eligibleInstalls[0].interest || 0))
          : 0);

    if (totalDays > 0 && interestToDivide > 0) {
      interestPerDay = (interestToDivide / totalDays);
    } else if (count === 0) {
      interestPerDay = 0;
    }

    return {
      isValid: true,
      error: null,
      allocatedInterest,
      selectedInstalments,
      rangeText,
      totalClosureAmount,
      interestPerDay
    };
  }, [loanDetails, interestInstalmentsCount]);

  // Customer search filtering (when opened from Collection module)
  const searchResults = useMemo(() => {
    if (preselectedLoanRecord || !searchQuery.trim()) return [];
    const q = searchQuery.trim().toLowerCase();

    return customersList.filter((c) => {
      const name = (c.customer?.name || c.customerName || "").toLowerCase();
      const mobile = (c.customer?.mobile || "").toLowerCase();
      const custId = (c.customerId || "").toLowerCase();
      const loanId = (c.loanId || c.loan?.loanId || "").toLowerCase();
      const vehicle = (c.vehicle?.regNo || "").toLowerCase();

      return (
        name.includes(q) ||
        mobile.includes(q) ||
        custId.includes(q) ||
        loanId.includes(q) ||
        vehicle.includes(q)
      );
    });
  }, [customersList, searchQuery, preselectedLoanRecord]);

  // Confirmation / Submit Handler
  const handleConfirmClosure = () => {
    setErrorMessage("");

    if (!currentLoanRecord || !loanDetails) {
      setErrorMessage("Please select a customer and loan.");
      return;
    }

    if (loanDetails.isClosed) {
      setErrorMessage("This loan is already closed.");
      return;
    }

    if (loanDetails.principalOutstanding <= 0) {
      setErrorMessage("The principal outstanding for this loan is already zero.");
      return;
    }

    const count = parseInt(interestInstalmentsCount, 10);
    const maxAvailable = loanDetails.eligibleInstalls.length;

    if (isNaN(count) || count < 0) {
      setErrorMessage("Please enter a valid number of interest instalments.");
      return;
    }

    if (count > maxAvailable) {
      setErrorMessage(
        `Only ${maxAvailable} eligible ${maxAvailable === 1 ? loanDetails.unitLabel.toLowerCase() : loanDetails.unitLabelPlural.toLowerCase()} remain. Please enter a value between 1 and ${maxAvailable}.`
      );
      return;
    }

    if (!settlement || !settlement.isValid) {
      setErrorMessage(settlement?.error || "Invalid settlement parameters.");
      return;
    }

    setIsSubmitting(true);

    try {
      const now = new Date();
      const nowIso = now.toISOString();
      const nowTs = now.getTime();
      const closureTxId = `MIDWAY-${nowTs}`;
      const txnRef = `TXN-MID-${nowTs.toString().slice(-6)}`;
      const principalCollected = loanDetails.principalOutstanding;
      const interestCollected = settlement.allocatedInterest;
      const totalCollected = settlement.totalClosureAmount;

      let finalClosureDate = nowIso;
      if (paymentDate) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(paymentDate.trim())) {
          const [y, m, d] = paymentDate.trim().split("-").map(Number);
          finalClosureDate = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds()).toISOString();
        } else {
          finalClosureDate = paymentDate;
        }
      }

      // 1. Prepare closure record object for loan audit/activity tracking
      const closureRecord = {
        date: finalClosureDate,
        amount: totalCollected,
        principal: principalCollected,
        interest: interestCollected,
        interestInstalmentsCount: count,
        instalmentsRange: settlement.rangeText,
        mode: paymentMode,
        transactionRef: transactionRefId || txnRef,
        remarks: closureRemarks || "Midway Loan Closure Settlement",
        closedAt: nowIso,
        timestamp: nowTs
      };

      // 2. Build explicit closure allocations across remaining instalments:
      // - First satisfies remaining principal in full
      // - Then applies only the explicitly selected interest instalments
      // - Does NOT charge interest for future unselected instalments
      const selectedInstNumbers = new Set(
        (settlement.selectedInstalments || []).map((s) => Number(s.installmentNumber))
      );

      // Remaining unpaid/partially paid installments that need principal settlement
      const unpaidInstalls = (loanDetails.schedule || []).filter((inst) => {
        return !(inst.status === "Paid" || inst.status === "Collected" || inst.balance <= 0.01);
      });

      let remainingPrincipalToAllocate = principalCollected;
      const closureAllocations = [];
      const updatedSchedule = (loanDetails.schedule || []).map((inst) => {
        // If already fully paid previously, preserve exact original payment record and Paid status
        if (inst.status === "Paid" || inst.status === "Collected" || inst.balance <= 0.01) {
          return { ...inst, status: "Paid" };
        }

        const isLastUnpaid = unpaidInstalls.length > 0 &&
          Number(inst.installmentNumber) === Number(unpaidInstalls[unpaidInstalls.length - 1].installmentNumber);

        // Remaining pending principal and interest on this instalment
        const prevPrinPaid = Number(inst.principalPaid || 0);
        const instPrin = Number(inst.principal || 0);
        const remPrin = Math.max(0, Math.round((instPrin - prevPrinPaid) * 100) / 100);

        const prevIntPaid = Number(inst.interestPaid || 0);
        const instInt = Number(inst.interest || 0);
        const pendingInt = Math.max(0, Math.round((instInt - prevIntPaid) * 100) / 100);

        // Principal is satisfied in full for all remaining instalments, exact down to last cent
        const prinAlloc = isLastUnpaid
          ? Math.max(0, Math.round(remainingPrincipalToAllocate * 100) / 100)
          : Math.min(remPrin, Math.max(0, Math.round(remainingPrincipalToAllocate * 100) / 100));

        remainingPrincipalToAllocate = Math.max(0, Math.round((remainingPrincipalToAllocate - prinAlloc) * 100) / 100);

        // Interest is only charged if explicitly selected by the admin
        const isSelectedForInterest = selectedInstNumbers.has(Number(inst.installmentNumber));
        const intAlloc = isSelectedForInterest ? pendingInt : 0;
        const totalAlloc = Math.round((prinAlloc + intAlloc) * 100) / 100;

        if (totalAlloc > 0 || prinAlloc > 0) {
          closureAllocations.push({
            installmentNumber: inst.installmentNumber,
            dueDate: inst.dueDate,
            allocated: totalAlloc,
            principalPaid: prinAlloc,
            interestPaid: intAlloc,
            balanceAfter: 0,
            statusAfter: "Midway Closed",
            isAdvance: false,
            isClosureAdjusted: true,
            isMidwayClosed: true
          });
        }

        return {
          ...inst,
          amountPaid: Math.round(((inst.amountPaid || 0) + totalAlloc) * 100) / 100,
          principalPaid: Math.round((prevPrinPaid + prinAlloc) * 100) / 100,
          interestPaid: Math.round((prevIntPaid + intAlloc) * 100) / 100,
          principalOutstanding: 0,
          balance: 0,
          status: "Paid",
          closureAdjusted: true,
          isMidwayClosed: true
        };
      });

      // 3. Update customer record in customers list
      // Preserves historical payments and updates repayment schedule consistently
      const cleanCustomer = { ...currentLoanRecord };
      const rawVStat = (cleanCustomer.vehicleStatus || cleanCustomer.vehicle?.status || '').toString().trim();
      const updatedVStat = (rawVStat.toLowerCase() === 'seized' || rawVStat.toLowerCase() === 'sold') ? rawVStat : 'Inactive';

      const updatedCustomer = {
        ...cleanCustomer,
        status: "Midway Closed",
        loanStatus: "Midway Closed",
        outstandingAmount: 0,
        totalPrincipalOutstanding: 0,
        totalInterestOutstanding: 0,
        totalLoanOutstanding: 0,
        nextDueDate: "Completed",
        midwayClosure: closureRecord,
        isMidwayClosed: true,
        repaymentSchedule: updatedSchedule,
        vehicleStatus: updatedVStat,
        vehicle: {
          ...(cleanCustomer.vehicle || {}),
          status: updatedVStat,
        },
        loan: {
          ...(cleanCustomer.loan || {}),
          status: "Midway Closed",
          loanStatus: "Midway Closed",
          outstandingAmount: 0,
          totalPrincipalOutstanding: 0,
          totalInterestOutstanding: 0,
          totalLoanOutstanding: 0,
        },
        // Preserve customer status as Active so customer can take future loans
        customerStatus: "Active",
        customer: {
          ...(cleanCustomer.customer || {}),
          status: "Active"
        }
      };

      const existingCustomers = JSON.parse(localStorage.getItem("motoLendCustomersList_data") || "[]");
      const updatedCustomersList = existingCustomers.map((c) => {
        const cLoanId = (c.loanId || c.loan?.loanId || "").trim().toLowerCase();
        if (cLoanId === loanDetails.loanId.trim().toLowerCase()) {
          return updatedCustomer;
        }
        return c;
      });
      localStorage.setItem("motoLendCustomersList_data", JSON.stringify(updatedCustomersList));

      // 4. Record Payment History Transaction (using existing collection & income convention)
      const paymentRecord = {
        id: closureTxId,
        transactionRef: txnRef,
        customerId: loanDetails.customerId,
        customerName: loanDetails.customerName,
        loanId: loanDetails.loanId,
        installmentNumber: settlement.rangeText,
        date: finalClosureDate,
        createdAt: nowIso,
        closedAt: nowIso,
        timestamp: nowTs,
        amount: totalCollected,
        principal: principalCollected,
        interest: interestCollected,
        advance: 0,
        mode: paymentMode,
        transactionId: paymentMode !== "Cash" ? transactionRefId : "",
        remarks: `Midway Closure Settlement: ${settlement.rangeText}`,
        isMidwayClosure: true,
        midwayDetails: closureRecord,
        allocations: closureAllocations,
        totalPrincipalOutstandingAfter: 0,
        totalInterestOutstandingAfter: 0,
        totalLoanOutstandingAfter: 0,
        collectedByUserId: (getCurrentUser() || { id: 'usr-admin-01' }).id,
        collectedByName: (getCurrentUser() || { name: 'Admin User' }).name,
        collectedByRole: (getCurrentUser() || { role: 'Admin' }).role,
        collectedAt: nowIso,
      };

      const existingHistory = JSON.parse(localStorage.getItem("motoLendPaymentHistory") || "[]");
      existingHistory.push(paymentRecord);
      localStorage.setItem("motoLendPaymentHistory", JSON.stringify(existingHistory));

      // 5. Notify storage listeners for real-time dashboard/ledger/loan refresh
      window.dispatchEvent(new Event("storage"));

      setClosureSuccessData({
        ...closureRecord,
        customerName: loanDetails.customerName,
        loanId: loanDetails.loanId,
        customerId: loanDetails.customerId
      });

      if (onSuccess) {
        onSuccess(updatedCustomer, paymentRecord);
      }
    } catch (err) {
      console.error("Midway closure error:", err);
      setErrorMessage("Unable to complete Midway Closure. Please review the details and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Main Midway Closure Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 sm:p-4 backdrop-blur-xs overscroll-contain animate-in fade-in duration-150">
        {/* 
          Fixed and non-scrollable container fitting comfortably in desktop/laptop viewport
        */}
        <div className="w-[94vw] max-w-5xl rounded-2xl bg-white shadow-2xl relative flex flex-col border border-slate-200 overflow-hidden my-auto max-h-[96vh]">
          {/* Compact Fixed Header */}
          <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-100 bg-white shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600 border border-amber-200 shadow-2xs">
                <Coins className="h-4 w-4" strokeWidth={2.2} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span>Midway Closure</span>
                  {loanDetails?.isClosed && (
                    <span className="text-[10px] uppercase font-extrabold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-md">
                      Closed
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  Settle principal in full and collect selected allocated interest
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Modal Body: Non-scrollable layout fitting within viewport */}
          <div className="p-3.5 sm:p-4 flex-1 space-y-3">
            {/* Success Screen after Closure */}
            {closureSuccessData ? (
              <div className="py-6 flex flex-col items-center text-center space-y-4">
                <div className="h-14 w-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs">
                  <CheckCircle2 className="h-8 w-8" strokeWidth={2.5} />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-slate-900">Loan Closed Successfully!</h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-md">
                    Midway closure has been executed for{" "}
                    <strong className="text-slate-800">{closureSuccessData.customerName}</strong> (Loan:{" "}
                    <span className="font-mono text-slate-700">{closureSuccessData.loanId}</span>).
                  </p>
                </div>

                {/* Settlement Receipt Card */}
                <div className="w-full max-w-md rounded-xl bg-slate-50 border border-slate-200 p-4 text-left space-y-2 text-xs">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                    <span className="text-slate-500 font-medium">Total Amount Settled</span>
                    <span className="text-base font-bold text-[#006052]">
                      {formatCurrency(closureSuccessData.amount)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Principal Settled:</span>
                    <span className="font-bold text-slate-800">{formatCurrency(closureSuccessData.principal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Interest Collected:</span>
                    <span className="font-bold text-slate-800">{formatCurrency(closureSuccessData.interest)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Instalments Covered:</span>
                    <span className="font-semibold text-slate-700">{closureSuccessData.instalmentsRange}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Payment Mode:</span>
                    <span className="font-semibold text-slate-700">{closureSuccessData.mode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Date:</span>
                    <span className="font-semibold text-slate-700">{formatDate(closureSuccessData.date)}</span>
                  </div>
                </div>

                <div className="pt-2 flex justify-center">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-6 py-2 rounded-xl bg-[#006052] text-white text-xs font-bold hover:bg-[#004d43] shadow-2xs transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* 1. Customer Search / Loan Selection Header */}
                {!preselectedLoanRecord ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2 sm:p-2.5 space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                        Search Customer / Loan *
                      </label>
                      {selectedCustomerRecord && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCustomerRecord(null);
                            setSearchQuery("");
                          }}
                          className="text-[11px] font-bold text-amber-700 hover:text-amber-900 underline self-start sm:self-auto cursor-pointer"
                        >
                          Change Customer
                        </button>
                      )}
                    </div>
                    
                    {!selectedCustomerRecord ? (
                      <div className="space-y-1.5">
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <input
                              type="text"
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              placeholder="Search by customer name, mobile, or loan ID..."
                              className="w-full h-8.5 rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-xs font-medium text-slate-800 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 shadow-2xs"
                            />
                          </div>
                        </div>

                        {/* Matching customer loan results dropdown */}
                        {searchQuery.trim() && (
                          <div className="max-h-36 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white shadow-sm">
                            {searchResults.length === 0 ? (
                              <p className="p-2.5 text-center text-xs text-slate-400">No matching active loans found.</p>
                            ) : (
                              searchResults.map((cust) => {
                                const cLoanId = cust.loanId || cust.loan?.loanId || "LN";
                                const cName = cust.customer?.name || cust.customerName || "Customer";
                                const cMobile = cust.customer?.mobile || "";
                                const isClosedLoan = cust.status === "Closed" || cust.status === "Foreclosed";

                                return (
                                  <div
                                    key={cLoanId}
                                    onClick={() => {
                                      setSelectedCustomerRecord(cust);
                                      setSearchQuery(`${cName} (${cLoanId})`);
                                    }}
                                    className={`p-2 flex items-center justify-between text-xs hover:bg-amber-50/60 cursor-pointer transition-colors ${
                                      isClosedLoan ? "opacity-60 bg-slate-50" : ""
                                    }`}
                                  >
                                    <div>
                                      <p className="font-bold text-slate-800">
                                        {cName} · <span className="font-mono text-slate-600">{cLoanId}</span>
                                      </p>
                                      <span className="text-[10px] text-slate-400">
                                        Mobile: {cMobile} · Vehicle: {cust.vehicle?.regNo || "—"}
                                      </span>
                                    </div>
                                    <span
                                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                        isClosedLoan
                                          ? "bg-slate-200 text-slate-600"
                                          : "bg-emerald-100 text-emerald-800"
                                      }`}
                                    >
                                      {cust.status || "Active"}
                                    </span>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Selected customer brief banner */
                      <div className="flex items-center justify-between p-2 rounded-lg bg-amber-50/70 border border-amber-200 text-xs">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-amber-700 shrink-0" />
                          <div>
                            <p className="font-bold text-amber-900 leading-tight">
                              {loanDetails?.customerName} ·{" "}
                              <span className="font-mono text-amber-800">{loanDetails?.loanId}</span>
                            </p>
                            <span className="text-[10px] text-amber-700">
                              Freq: {loanDetails?.paymentFrequency} · Mobile: {loanDetails?.customerMobile} · Vehicle: {loanDetails?.vehicleRegNo}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Read-only Context Tag when opened from LoanDetailsView */
                  <div className="p-2 sm:p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-slate-500" />
                      <div>
                        <p className="font-bold text-slate-800 leading-tight">
                          {loanDetails?.customerName} ·{" "}
                          <span className="font-mono text-slate-600">{loanDetails?.loanId}</span>
                        </p>
                        <span className="text-[10px] text-slate-400">
                          Vehicle: {loanDetails?.vehicleRegNo} · Frequency: {loanDetails?.paymentFrequency}
                        </span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                      Midway Settlement
                    </span>
                  </div>
                )}

                {/* Fixed Two-Column Layout on Desktop */}
                {loanDetails && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
                    {/* Left Column (col-span-7): KPIs & Interest Instalment Controls */}
                    <div className="lg:col-span-7 space-y-2.5">
                      {/* The 3 KPI Cards: Compact & Horizontal */}
                      <div className="grid grid-cols-3 gap-2">
                        {/* KPI 1: Principal Outstanding */}
                        <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs text-center flex flex-col justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block truncate">
                            Principal Outstanding
                          </span>
                          <p className="text-sm sm:text-base font-bold text-slate-900 mt-0.5">
                            {formatCurrency(loanDetails.principalOutstanding)}
                          </p>
                          <span className="text-[10px] text-slate-400 block truncate">
                            Mandatory in full
                          </span>
                        </div>

                        {/* KPI 2: Instalments Paid */}
                        <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs text-center flex flex-col justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block truncate">
                            Instalments Paid
                          </span>
                          <p className="text-sm sm:text-base font-bold text-emerald-700 mt-0.5">
                            {loanDetails.installmentsPaidCount}{" "}
                            <span className="text-xs text-slate-400 font-normal">
                              / {loanDetails.totalInstallmentsCount}
                            </span>
                          </p>
                          <span className="text-[10px] text-slate-400 block truncate">
                            {loanDetails.eligibleInstalls.length} remaining
                          </span>
                        </div>

                        {/* KPI 3: Pending Interest */}
                        <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs text-center flex flex-col justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block truncate">
                            Pending Interest
                          </span>
                          <p className="text-sm sm:text-base font-bold text-amber-700 mt-0.5">
                            {formatCurrency(loanDetails.pendingInterestTotal)}
                          </p>
                          <span className="text-[10px] text-slate-400 block truncate">
                            Preallocated total
                          </span>
                        </div>
                      </div>

                      {/* Interest Instalments to Collect Section with View Repayment Schedule Overlay Button */}
                      <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2.5 shadow-2xs">
                        {/* Section Heading & Schedule Overlay Trigger */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                          <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700">
                              Interest Instalments to Collect
                            </label>
                            <span className="text-[10px] text-slate-400">
                              Select the number of instalments (Maximum: {loanDetails.eligibleInstalls.length})
                            </span>
                          </div>

                          {/* View / Hide Repayment Schedule Button (Opens / Closes Separate Modal) */}
                          <button
                            type="button"
                            onClick={() => setShowScheduleModal((prev) => !prev)}
                            className="self-start sm:self-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors cursor-pointer"
                          >
                            <Table className="h-3.5 w-3.5" />
                            <span>{showScheduleModal ? "Hide Repayment Schedule" : "View Repayment Schedule"}</span>
                          </button>
                        </div>

                        {/* Input and Quick Action Buttons */}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          {/* Numeric input */}
                          <div className="w-full sm:w-24 shrink-0">
                            <input
                              type="number"
                              min="0"
                              max={loanDetails.eligibleInstalls.length}
                              step="1"
                              disabled={loanDetails.eligibleInstalls.length === 0 || loanDetails.isClosed}
                              value={interestInstalmentsCount}
                              onChange={(e) => {
                                const val = e.target.value === "" ? "" : parseInt(e.target.value, 10);
                                setInterestInstalmentsCount(val);
                              }}
                              className="w-full h-8.5 rounded-lg border border-slate-300 bg-white px-2 text-center text-xs font-bold text-slate-800 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 shadow-2xs disabled:bg-slate-100 disabled:text-slate-400"
                            />
                          </div>

                          {/* Dynamic Quick Actions */}
                          <div className="flex flex-wrap items-center gap-1.5 flex-1">
                            {[1, 2, 3].map((num) => {
                              if (num > loanDetails.eligibleInstalls.length) return null;
                              const isSelected = interestInstalmentsCount === num;
                              return (
                                <button
                                  key={num}
                                  type="button"
                                  disabled={loanDetails.isClosed}
                                  onClick={() => setInterestInstalmentsCount(num)}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                    isSelected
                                      ? "bg-amber-600 text-white shadow-2xs ring-1 ring-amber-600"
                                      : "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                                  }`}
                                >
                                  {num} {num === 1 ? loanDetails.unitLabel : loanDetails.unitLabelPlural}
                                </button>
                              );
                            })}

                            {loanDetails.eligibleInstalls.length > 3 && (
                              <button
                                type="button"
                                disabled={loanDetails.isClosed}
                                onClick={() => setInterestInstalmentsCount(loanDetails.eligibleInstalls.length)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                  interestInstalmentsCount === loanDetails.eligibleInstalls.length
                                    ? "bg-amber-600 text-white shadow-2xs"
                                    : "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                                }`}
                              >
                                All ({loanDetails.eligibleInstalls.length})
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Range & Allocated Interest Indicator */}
                        {settlement && settlement.isValid && (
                          <div className="p-2 rounded-lg bg-amber-50/70 border border-amber-200 text-xs flex flex-wrap items-center justify-between gap-1.5">
                            <span className="text-amber-900 font-medium">
                              Allocated Range: <strong>{settlement.rangeText}</strong>
                            </span>
                            <span className="font-bold text-amber-800">
                              Allocated Interest: {formatCurrency(settlement.allocatedInterest)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right Column (col-span-5): Settlement Summary & Payment Details */}
                    <div className="lg:col-span-5 space-y-2.5">
                      {settlement && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3 space-y-2.5 shadow-2xs">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block">
                            Settlement Summary
                          </span>

                          <div className="space-y-1.5 text-xs text-slate-600">
                            <div className="flex justify-between items-center">
                              <span className="text-slate-600">Full Principal Outstanding:</span>
                              <span className="font-bold text-slate-900">
                                {formatCurrency(loanDetails.principalOutstanding)}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-600">
                                Allocated Interest ({interestInstalmentsCount} {interestInstalmentsCount === 1 ? loanDetails.unitLabel : loanDetails.unitLabelPlural}):
                              </span>
                              <span className="font-bold text-amber-700">
                                + {formatCurrency(settlement.allocatedInterest)}
                              </span>
                            </div>
                            
                            <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-sm font-bold">
                              <span className="text-slate-900">Final Settlement Amount:</span>
                              <span className="text-base text-[#006052]">
                                {formatCurrency(settlement.totalClosureAmount)}
                              </span>
                            </div>
                          </div>

                          {/* Payment Date & Mode Input Rows */}
                          <div className="pt-2 border-t border-slate-200 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                                  Payment Date *
                                </label>
                                <input
                                  type="date"
                                  required
                                  value={paymentDate}
                                  onChange={(e) => setPaymentDate(e.target.value)}
                                  className="w-full h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 outline-none focus:border-amber-500 shadow-2xs"
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                                  Payment Mode *
                                </label>
                                <select
                                  value={paymentMode}
                                  onChange={(e) => setPaymentMode(e.target.value)}
                                  className="w-full h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-amber-500 shadow-2xs cursor-pointer"
                                >
                                  <option value="Cash">Cash</option>
                                  <option value="UPI">UPI</option>
                                  <option value="Bank Transfer">Bank Transfer</option>
                                  <option value="Cheque">Cheque</option>
                                </select>
                              </div>
                            </div>

                            {paymentMode !== "Cash" && (
                              <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                                  Reference / Transaction ID
                                </label>
                                <input
                                  type="text"
                                  placeholder="e.g. UPI Ref / Bank UTR Number"
                                  value={transactionRefId}
                                  onChange={(e) => setTransactionRefId(e.target.value)}
                                  className="w-full h-8 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none focus:border-amber-500 shadow-2xs"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Error Alert Display */}
                {errorMessage && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                    <span>{errorMessage}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Compact Fixed Footer */}
          {!closureSuccessData && (
            <div className="flex items-center justify-between px-5 py-2.5 border-t border-slate-100 bg-white shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={
                  !currentLoanRecord ||
                  !loanDetails ||
                  loanDetails.isClosed ||
                  !settlement?.isValid ||
                  isSubmitting
                }
                onClick={handleConfirmClosure}
                className="px-5 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Coins className="h-3.5 w-3.5" />
                <span>{isSubmitting ? "Processing..." : "Confirm Midway Closure"}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 
        Separate Repayment Schedule Overlay Modal (z-[60]):
        - Simple, read-only view of the loan's actual repayment history and current instalment status.
        - Does NOT display Midway Closure-specific banners, legends, or highlights.
        - Shows genuine repayment statuses: Paid, Partial, Pending, Overdue.
        - Closes on 'X' button, backdrop click, or Escape key.
      */}
      {showScheduleModal && loanDetails && (
        <div 
          onClick={() => setShowScheduleModal(false)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-3 sm:p-6 backdrop-blur-xs overscroll-contain animate-in fade-in duration-200"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl max-h-[85vh] rounded-2xl bg-white shadow-2xl relative flex flex-col border border-slate-200 overflow-hidden transform animate-in zoom-in-95 duration-200"
          >
            {/* Schedule Modal Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700 border border-amber-200">
                  <Table className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span>Loan Repayment Schedule</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                      {loanDetails.totalInstallmentsCount} Instalments
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Customer: <strong className="text-slate-800">{loanDetails.customerName}</strong> · Loan ID:{" "}
                    <span className="font-mono text-slate-700 font-semibold">{loanDetails.loanId}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors cursor-pointer"
                aria-label="Close schedule modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Schedule Table Container (Scrollable internally only) */}
            <div className="p-4 overflow-y-auto flex-1">
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-100 sticky top-0 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-600 z-10">
                    <tr>
                      <th className="py-2.5 px-3">Instalment Number</th>
                      <th className="py-2.5 px-3">Due Date</th>
                      <th className="py-2.5 px-3 text-right">Principal</th>
                      <th className="py-2.5 px-3 text-right">Interest</th>
                      <th className="py-2.5 px-3 text-right">Total EMI</th>
                      <th className="py-2.5 px-3 text-right">Principal Outstanding</th>
                      <th className="py-2.5 px-3 text-right">Balance Amount</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loanDetails.schedule.map((item) => {
                      const isPaid = item.status === "Collected" || item.status === "Paid" || Number(item.balance || 0) <= 0.01;
                      const isPartial = !isPaid && item.status === "Partial";
                      const isOverdue = !isPaid && item.status === "Overdue";
                      const penaltyAmt = isOverdue
                        ? getInstallmentPenaltySupportingAmount(item, {
                            loanId: loanDetails.loanId,
                            frequency: loanDetails.paymentFrequency || 'Monthly',
                          })
                        : null;

                      return (
                        <tr
                          key={item.installmentNumber}
                          className={`transition-colors ${
                            isPaid
                              ? "bg-slate-50/50 text-slate-400"
                              : "hover:bg-slate-50 text-slate-700"
                          }`}
                        >
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                            {item.installmentNumber}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">{formatDate(item.dueDate)}</td>
                          <td className="py-2.5 px-3 text-right font-medium text-slate-800">{formatCurrency(item.principal)}</td>
                          <td className="py-2.5 px-3 text-right font-medium text-slate-700">
                            {formatCurrency(item.interest)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-slate-900">{formatCurrency(item.emi)}</td>
                          <td className="py-2.5 px-3 text-right font-medium text-slate-700">
                            {formatCurrency(item.principalOutstanding)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-slate-900">
                            {formatCurrency(item.balance)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {isPaid ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                                Paid
                              </span>
                            ) : isPartial ? (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                                Partial
                              </span>
                            ) : isOverdue ? (
                              <div className="flex flex-col items-center justify-center gap-0.5">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">
                                  Overdue
                                </span>
                                {penaltyAmt > 0 && (
                                  <span className="text-[10px] font-semibold text-[#006052] whitespace-nowrap leading-tight">
                                    Penalty: ₹{Number(penaltyAmt).toLocaleString('en-IN')}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                Pending
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Schedule Modal Footer */}
            <div className="flex items-center justify-between px-5 py-2.5 border-t border-slate-200 bg-slate-50 shrink-0">
              <span className="text-xs text-slate-500">
                Viewing mode only.
              </span>
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="px-4 py-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors cursor-pointer shadow-2xs"
              >
                Close Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

