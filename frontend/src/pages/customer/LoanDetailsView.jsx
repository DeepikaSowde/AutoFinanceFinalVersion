import React, { useState, useMemo, useEffect } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { DATA_CHANGED_EVENT } from "../../services/api";
import { loadCustomerEntries } from "../../services/customerApi";
import { loadPayments } from "../../services/collectionApi";
import {
  ArrowLeft,
  ChevronRight,
  User,
  Wallet,
  PiggyBank,
  Landmark,
  Calendar,
  CreditCard,
  Edit,
  MoreVertical,
  CheckCircle,
  CheckCircle2,
  Clock,
  Car,
  AlertCircle,
  X,
  FileCheck,
  TrendingUp,
  Coins,
  Lock,
  ShieldCheck,
  FileText,
  Receipt,
  IndianRupee,
} from "lucide-react";
import RepaymentScheduleTable, {
  generateSchedule,
  computeEffectiveSchedule,
  getRepaymentColumnLabel,
  ForeclosureScheduleLock,
  StatusBadge,
} from "../../components/RepaymentScheduleTable";
import InstallmentTimeline from "../../components/InstallmentTimeline";
import MidwayClosureModal from "../../components/MidwayClosureModal";
import { getVehicleDisplayImage } from "../../utils/vehicleImageHelper";
import { getEffectiveVehicleStatus } from "../../utils/vehicleStatusHelper";
import {
  getPenaltyRecords,
  getPenaltyTransactions,
  cancelPenaltyRecord,
  freezePenaltyRecord,
  collectPenaltyTransaction,
  getPenaltySettings,
  checkInstallmentPenaltyEligibility,
  getOrCalculatePenaltyRecord,
  getInstallmentPenaltySupportingAmount,
  usePenaltyData,
} from "../../utils/penaltyRules";

const formatCurrency = (value) => {
  if (value === undefined || value === null || isNaN(Number(value))) return "₹0";
  return `₹${Math.round(Number(value)).toLocaleString("en-IN")}`;
};

import { formatDate, formatDateTimeParts, parseToDate } from "../../utils/dateUtils";

const formatDateTime = (dateString, record = null) => formatDateTimeParts(dateString, record);

const parseToDayTimestamp = (dateInput) => {
  if (!dateInput) return null;
  const d = parseToDate(dateInput);
  if (!d || isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

// Exclude failed, cancelled, or reversed transactions from eligible collections
const isEligiblePayment = (p) => {
  if (!p) return false;
  const status = String(p.status || "").toLowerCase().trim();
  if (
    status === "failed" ||
    status === "cancelled" ||
    status === "canceled" ||
    status === "reversed" ||
    status === "rejected" ||
    status === "void"
  ) {
    return false;
  }
  return Number(p.amount || 0) > 0;
};

export default function LoanDetailsView({ loanId: propLoanId, customerId: propCustomerId, onBack: propOnBack, onEditLoan }) {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("loanDetails");
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedInstallmentForHistory, setSelectedInstallmentForHistory] = useState(null);

  const [customersList, setCustomersList] = useState([]);
  const [allPayments, setAllPayments] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  // Penalty rules and records from the server; memos below re-run when they reload.
  const penaltyVersion = usePenaltyData();
  const [penaltyBusy, setPenaltyBusy] = useState(false);
  const [showMidwayModal, setShowMidwayModal] = useState(false);
  const [penaltyToCancel, setPenaltyToCancel] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [isNavigatingToForeclosure, setIsNavigatingToForeclosure] = useState(false);

  // Read target IDs from prop, route params (/loans/:loanId), or query string (?loanId=...)
  const selectedLoanId = (propLoanId || params.loanId || searchParams.get("loanId") || "").trim();
  const selectedCustomerId = (propCustomerId || params.customerId || searchParams.get("customerId") || "").trim();

  const handleBack = () => {
    if (propOnBack) {
      propOnBack();
    } else {
      navigate("/loans");
    }
  };

  useEffect(() => {
    let active = true;
    const load = () =>
      Promise.all([loadCustomerEntries(), loadPayments()])
        .then(([entries, payments]) => {
          if (!active) return;
          setCustomersList(entries);
          setAllPayments(payments);
          setLoadError("");
        })
        .catch((error) => active && setLoadError(error.message))
        .finally(() => active && setLoaded(true));

    load();
    window.addEventListener(DATA_CHANGED_EVENT, load);
    return () => {
      active = false;
      window.removeEventListener(DATA_CHANGED_EVENT, load);
    };
  }, []);

  // Find the exact loan record
  const loanRecord = useMemo(() => {
    if (!customersList.length) return null;

    // 1. If loanId is specified, strictly match by loanId (exact match, case-insensitive)
    if (selectedLoanId) {
      const match = customersList.find((c, idx) => {
        const id = (c.loanId || c.loan?.loanId || `LN-${String(idx + 1).padStart(3, "0")}`).trim().toLowerCase();
        return id === selectedLoanId.toLowerCase();
      });
      return match || null;
    }

    // 2. If NO loanId is specified, but customerId is specified, find that customer's loan
    if (selectedCustomerId) {
      const match = customersList.find((c, idx) => {
        const cId = (c.customerId || c.customer?.customerId || `CUS-${String(idx + 1).padStart(3, "0")}`).trim().toLowerCase();
        const mobile = (c.customer?.mobile || "").trim();
        return cId === selectedCustomerId.toLowerCase() || (mobile && selectedCustomerId.includes(mobile.slice(-5)));
      });
      return match || null;
    }

    return null;
  }, [customersList, selectedLoanId, selectedCustomerId]);

  const customer = loanRecord?.customer || {};
  const vehicle = loanRecord?.vehicle || {};
  const loan = loanRecord?.loan || {};
  const vehicleImageSrc = loanRecord ? getVehicleDisplayImage(loanRecord) : null;

  // Foreclosure detection
  const rawStatus = String(loanRecord?.status || loan.status || "").trim();
  const isForeclosed =
    rawStatus.toLowerCase() === "foreclosed" ||
    Boolean(loanRecord?.isForeclosed || loanRecord?.foreclosure);
  const foreclosureData = loanRecord?.foreclosure || {};

  // Midway Closure detection
  const isMidwayClosed = !isForeclosed && Boolean(
    loanRecord?.isMidwayClosed ||
    loanRecord?.midwayClosure ||
    rawStatus.toLowerCase() === "midway closed" ||
    String(loanRecord?.closureType || "").toLowerCase() === "midway closure"
  );
  const midwayClosureData = loanRecord?.midwayClosure || {};

  const effectiveLoanId = loanRecord?.loanId || loan.loanId || selectedLoanId || "LN-001";
  const effectiveCustomerId =
    loanRecord?.customerId ||
    (customer.mobile ? `CUS-${customer.mobile.slice(-5)}` : selectedCustomerId || "CUS-001");
  const customerName = customer.name || "Unknown Customer";
  const customerMobile = customer.mobile
    ? `${customer.mobile.slice(0, 5)}XXXXX`
    : "Not provided";
  const loanStartDate =
    loan.firstDueDate || customer.applicationDate || loanRecord?.date || "";

  // Principal calculation
  const vehicleAmount =
    loan.vehicleAmount !== "" &&
      loan.vehicleAmount !== null &&
      loan.vehicleAmount !== undefined
      ? Number(loan.vehicleAmount)
      : Number(vehicle.amount || 0);
  const downPayment = Number(loan.downPayment || 0);
  const calculatedPrincipal = Math.max(vehicleAmount - downPayment, 0);
  const principalAmount = Number(loanRecord?.loanAmount || calculatedPrincipal || 0);

  // Raw Repayment Schedule Base
  const rawSchedule = useMemo(() => {
    if (!loanRecord) return [];
    if (loanRecord.repaymentSchedule && loanRecord.repaymentSchedule.length > 0) {
      return loanRecord.repaymentSchedule;
    }
    if (principalAmount > 0 && loan.interestRate && loan.tenure) {
      return generateSchedule({
        loanAmount: principalAmount,
        interestRate: loan.interestRate,
        tenure: loan.tenure,
        tenureUnit: loan.tenureUnit || "Months",
        paymentFrequency: loan.paymentFrequency || "Daily",
        interestType: loan.interestType || "Flat",
        repaymentMethod: loan.repaymentMethod || "EMI",
        firstDueDate: loan.firstDueDate || loanStartDate,
      });
    }
    return [];
  }, [loanRecord, principalAmount, loan, loanStartDate]);

  // Eligible Collections for this loan (excluding failed, cancelled, or reversed transactions)
  const loanPayments = useMemo(() => {
    return allPayments.filter(
      (p) =>
        (p.loanId ? p.loanId === effectiveLoanId : (p.customerId && p.customerId === effectiveCustomerId)) &&
        isEligiblePayment(p)
    );
  }, [allPayments, effectiveLoanId, effectiveCustomerId]);

  // Derive authoritative schedule reconciled with actual recorded transactions
  const schedule = useMemo(() => {
    const computed = computeEffectiveSchedule(rawSchedule, loanPayments, { isForeclosed });
    if (isForeclosed) {
      return computed.map((item) => {
        const wasCustomerPaid = Boolean(
          item.wasCustomerPaid !== undefined
            ? item.wasCustomerPaid
            : ((item.amountPaid >= item.emi - 0.01 || item.status === "Paid" || item.status === "Collected") && (item.paymentsList?.length > 0 || loanPayments.length > 0))
        );
        return {
          ...item,
          amountPaid: Math.round(Number(item.amountPaid ?? item.emi ?? 0) * 100) / 100,
          principalOutstanding: 0,
          balance: 0,
          status: item.status || (wasCustomerPaid ? "Paid" : "Foreclosed"),
          isForeclosed: true,
          wasCustomerPaid,
        };
      });
    }
    if (!isMidwayClosed) {
      return computed;
    }

    // Identify the closure start installment number
    let closureStartNum = null;
    if (midwayClosureData?.installmentNumber && !isNaN(Number(midwayClosureData.installmentNumber))) {
      closureStartNum = Number(midwayClosureData.installmentNumber);
    } else if (midwayClosureData?.instalmentsRange) {
      const match = String(midwayClosureData.instalmentsRange).match(/#(\d+)/);
      if (match) closureStartNum = Number(match[1]);
    }

    if (closureStartNum === null) {
      const midwayP = loanPayments.find((p) => p.isMidwayClosure || String(p.remarks || "").toLowerCase().includes("midway closure"));
      if (midwayP) {
        if (midwayP.allocations && midwayP.allocations.length > 0) {
          const minNum = Math.min(
            ...midwayP.allocations.map((a) => Number(a.installmentNumber)).filter((n) => !isNaN(n) && n > 0)
          );
          if (isFinite(minNum) && minNum > 0) closureStartNum = minNum;
        }
        if (closureStartNum === null) {
          const match = String(midwayP.installmentNumber || midwayP.remarks || "").match(/#(\d+)/);
          if (match) closureStartNum = Number(match[1]);
        }
      }
    }

    if (closureStartNum === null) {
      const firstMidway = computed.find((s) => Boolean(s.isMidwayClosed || s.closureAdjusted || s.status === "Midway Closed"));
      if (firstMidway && Number(firstMidway.installmentNumber) > 0) {
        closureStartNum = Number(firstMidway.installmentNumber);
      }
    }

    // Fallback if not recorded: find first installment not fully paid before closure
    if (closureStartNum === null) {
      const firstUnpaid = rawSchedule.find((s) => s.status !== "Paid" && s.status !== "Collected");
      if (firstUnpaid && Number(firstUnpaid.installmentNumber) > 0) {
        closureStartNum = Number(firstUnpaid.installmentNumber);
      }
    }

    let hasSeenClosurePoint = false;
    return computed.map((item) => {
      const isPastOrAtClosure = closureStartNum !== null && Number(item.installmentNumber) >= closureStartNum;
      const isExplicitMidway = Boolean(item.isMidwayClosed || item.closureAdjusted || item.status === "Midway Closed");

      if (isPastOrAtClosure || isExplicitMidway || hasSeenClosurePoint) {
        hasSeenClosurePoint = true;
        return {
          ...item,
          amountPaid: Math.round(Number(item.amountPaid ?? item.emi ?? 0) * 100) / 100,
          principalOutstanding: 0,
          balance: 0,
          status: "Paid",
          isMidwayClosed: true,
          closureAdjusted: true,
        };
      }

      return {
        ...item,
        isMidwayClosed: false,
        closureAdjusted: false,
      };
    });
  }, [rawSchedule, loanPayments, isMidwayClosed, midwayClosureData, isForeclosed]);

  // Dynamic determination of foreclosure effective start installment
  const foreclosureEffectiveStartNum = useMemo(() => {
    if (!isForeclosed) return null;
    const explicitStart = Number(
      foreclosureData.effectiveInstallment ||
      foreclosureData.fromInstallment ||
      foreclosureData.startInstallment ||
      foreclosureData.installmentNumber ||
      loanRecord?.foreclosureStartInstallment ||
      0
    );
    if (explicitStart > 0) return explicitStart;
    const firstUnpaid = schedule.find((s) => !s.wasCustomerPaid);
    return firstUnpaid ? Number(firstUnpaid.installmentNumber) : null;
  }, [isForeclosed, foreclosureData, loanRecord, schedule]);

  // Combine recorded penalties and active eligible pending penalties for this loan
  const combinedPenaltyRecords = useMemo(() => {
    if (isForeclosed) {
      return [];
    }
    try {
      const existing = getPenaltyRecords().filter(
        (p) => (p.loanId && p.loanId === effectiveLoanId) || (p.customerId && p.customerId === effectiveCustomerId)
      );
      const settings = getPenaltySettings();
      const normFreq = loan?.paymentFrequency || loanRecord?.paymentFrequency || "Monthly";

      const recordsMap = new Map();
      existing.forEach((r) => recordsMap.set(Number(r.installmentNumber), r));

      schedule.forEach((inst) => {
        const num = Number(inst.installmentNumber);
        if (!recordsMap.has(num)) {
          const eligibility = checkInstallmentPenaltyEligibility(inst, normFreq, settings, new Date());
          if (eligibility.isEligible) {
            const calculated = getOrCalculatePenaltyRecord(
              effectiveLoanId,
              effectiveCustomerId,
              customer?.name || "Customer",
              inst,
              normFreq,
              existing,
              settings,
              new Date()
            );
            if (calculated && calculated.status === "Pending") {
              recordsMap.set(num, calculated);
            }
          }
        }
      });

      return Array.from(recordsMap.values()).sort(
        (a, b) => Number(a.installmentNumber) - Number(b.installmentNumber)
      );
    } catch (err) {
      console.error("Error loading loan penalty records:", err);
      return [];
    }
  }, [effectiveLoanId, effectiveCustomerId, schedule, loan, loanRecord, customer, refreshKey, penaltyVersion]);

  // Check if monthly penalty configuration is disabled
  const isMonthlyPenaltyDisabled = useMemo(() => {
    try {
      const settings = getPenaltySettings();
      return settings?.Monthly?.enabled === false;
    } catch {
      return false;
    }
  }, [refreshKey, penaltyVersion]);

  // Penalty Log: One record per penalty collection transaction + active uncollected penalty records
  const penaltyLogRecords = useMemo(() => {
    try {
      if (!effectiveLoanId) return [];
      const cleanLoanId = effectiveLoanId.trim().toLowerCase();

      // 1. Load penalty collection transactions
      const txns = getPenaltyTransactions().filter(
        (t) => t.loanId && t.loanId.trim().toLowerCase() === cleanLoanId
      );

      const items = [];
      const coveredInstallmentNums = new Set();

      // Add actual collection transactions
      txns.forEach((tx) => {
        const rawInst = tx.installmentDisplay || (Array.isArray(tx.installmentNumbers) ? tx.installmentNumbers.join(", ") : String(tx.installmentNumber || "1"));
        const instDisplay = String(rawInst).replace(/#/g, "");
        const calculatedAmt = Number(
          tx.calculatedPenaltyAmount !== undefined
            ? tx.calculatedPenaltyAmount
            : (tx.actualPenaltyAmount !== undefined ? tx.actualPenaltyAmount : (tx.collectedAmount || 0))
        );
        const collectedAmt = Number(tx.collectedAmount || 0);

        if (Array.isArray(tx.installmentNumbers)) {
          tx.installmentNumbers.forEach((n) => coveredInstallmentNums.add(Number(n)));
        }

        items.push({
          id: tx.id || `tx-${tx.transactionRef || Math.random()}`,
          date: tx.date || tx.createdAt,
          installmentDisplay: instDisplay,
          actualPenaltyAmount: calculatedAmt,
          calculatedPenaltyAmount: calculatedAmt,
          collectedAmount: collectedAmt,
          status: tx.status || "Collected",
          sortDate: new Date(tx.date || tx.createdAt || 0).getTime(),
          isTransaction: true,
        });
      });

      // 2. Load active uncollected penalty records (Pending, Frozen, Cancelled)
      const existing = getPenaltyRecords().filter(
        (p) => p.loanId && p.loanId.trim().toLowerCase() === cleanLoanId
      );
      const settings = getPenaltySettings();
      const normFreq = loan?.paymentFrequency || loanRecord?.paymentFrequency || "Monthly";

      const recordsMap = new Map();
      existing.forEach((r) => {
        recordsMap.set(Number(r.installmentNumber), r);
      });

      // Also identify active eligible overdue installments from schedule if not already recorded and loan is not foreclosed
      if (!isForeclosed) {
        schedule.forEach((inst) => {
          const num = Number(inst.installmentNumber);
          if (!coveredInstallmentNums.has(num) && !recordsMap.has(num)) {
            const eligibility = checkInstallmentPenaltyEligibility(inst, normFreq, settings, new Date());
            if (eligibility.isEligible) {
              const calculated = getOrCalculatePenaltyRecord(
                effectiveLoanId,
                effectiveCustomerId,
                customer?.name || "Customer",
                inst,
                normFreq,
                existing,
                settings,
                new Date()
              );
              if (calculated && calculated.status === "Pending") {
                recordsMap.set(num, calculated);
              }
            }
          }
        });
      }

      Array.from(recordsMap.values()).forEach((r) => {
        const num = Number(r.installmentNumber);
        if (coveredInstallmentNums.has(num)) {
          // Already settled in a penalty collection transaction
          return;
        }

        let finalStatus = r.status || "Pending";
        if (finalStatus === "Unfrozen" || finalStatus === "UNFROZEN") {
          finalStatus = "Pending";
        }

        if (isForeclosed && finalStatus !== "Collected" && finalStatus !== "Cancelled") {
          finalStatus = "Foreclosed";
        }

        // If status is Collected:
        if (finalStatus === "Collected") {
          if (txns.length > 0) {
            // Already represented by collection transaction records
            return;
          }
          // Fallback only if no transaction records exist at all
          items.push({
            id: r.id || `PEN-${effectiveLoanId}-${r.installmentNumber}`,
            date: r.collectionDate || r.updatedAt || r.createdAt || r.dueDate,
            installmentDisplay: String(r.installmentNumber).replace(/#/g, ""),
            actualPenaltyAmount: Number(r.configuredAmount || r.calculatedAmount || r.actualAmountCollected || 0),
            calculatedPenaltyAmount: Number(r.configuredAmount || r.calculatedAmount || r.actualAmountCollected || 0),
            collectedAmount: Number(r.actualAmountCollected || r.calculatedAmount || 0),
            status: "Collected",
            sortDate: new Date(r.collectionDate || r.updatedAt || 0).getTime(),
            isTransaction: false,
          });
          return;
        }

        let relevantDate = r.updatedAt || r.createdAt || r.dueDate;
        if (finalStatus === "Cancelled" && r.cancellationDate) {
          relevantDate = r.cancellationDate;
        }

        const dueAmt = (isForeclosed && finalStatus === "Foreclosed")
          ? 0
          : Number(r.calculatedAmount || r.configuredAmount || 0);

        if (dueAmt > 0 || finalStatus === "Cancelled" || finalStatus === "Foreclosed") {
          items.push({
            id: r.id || `PEN-${effectiveLoanId}-${r.installmentNumber}`,
            date: relevantDate,
            installmentDisplay: String(r.installmentNumber).replace(/#/g, ""),
            actualPenaltyAmount: dueAmt,
            collectedAmount: null,
            status: finalStatus,
            sortDate: new Date(relevantDate || 0).getTime(),
            isTransaction: false,
          });
        }
      });

      return items.sort((a, b) => b.sortDate - a.sortDate);
    } catch (err) {
      console.error("Error loading penalty log records:", err);
      return [];
    }
  }, [effectiveLoanId, effectiveCustomerId, schedule, loan, loanRecord, customer, refreshKey, penaltyVersion]);

  // Penalty actions go to the server, which re-checks each amount.
  const runPenaltyAction = async (work) => {
    if (penaltyBusy) return;
    setPenaltyBusy(true);
    try {
      await work();
      setRefreshKey((k) => k + 1);
    } catch (err) {
      alert(err.message || "Could not update the penalty. Please try again.");
    } finally {
      setPenaltyBusy(false);
    }
  };

  const handleFreezePenaltyItem = (p) =>
    runPenaltyAction(() => freezePenaltyRecord({ ...p, loanId: p.loanId || effectiveLoanId }));

  const handleCollectPenaltyItem = (p) =>
    runPenaltyAction(() =>
      collectPenaltyTransaction({
        loanId: effectiveLoanId,
        records: [{ ...p, loanId: p.loanId || effectiveLoanId }],
        collectedAmount: Number(p.calculatedAmount || 0),
        collectionDate: new Date().toISOString(),
        paymentMode: "Cash",
      })
    );

  // Financial summary metrics
  const totalCollectedFromPayments = loanPayments.reduce(
    (sum, p) => sum + Number(p.amount || 0),
    0
  );
  const totalCollectedFromSchedule = schedule.reduce(
    (sum, s) => sum + Number(s.amountPaid || 0),
    0
  );
  const totalCollected = loanPayments.length > 0
    ? totalCollectedFromPayments
    : totalCollectedFromSchedule;

  const totalPrincipalRepaid = isMidwayClosed
    ? principalAmount
    : schedule.reduce(
      (sum, s) => sum + Number(s.principalPaid || 0),
      0
    );
  const totalInterestCollected = schedule.reduce(
    (sum, s) => sum + Number(s.interestPaid || 0),
    0
  );

  // Total Interest and Repayable
  // For Midway Closed loans, total interest is the interest actually collected through normal repayments
  // plus the closure interest charged and collected by the admin.
  const totalInterest = useMemo(() => {
    if (isMidwayClosed) {
      return totalInterestCollected;
    }
    if (schedule.length > 0) {
      return schedule.reduce((sum, s) => sum + Number(s.interest || 0), 0);
    }
    const rate = Number(loan.interestRate || 0);
    const tenureVal = Number(loan.tenure || 0);
    return Math.round((principalAmount * (rate / 100) * tenureVal) / 12);
  }, [schedule, loan, principalAmount, isMidwayClosed, totalInterestCollected]);

  const documentCharges = Number(loan.documentCharge || 0);
  const totalRepayable = isMidwayClosed
    ? principalAmount + totalInterestCollected
    : principalAmount + totalInterest;

  // Total Outstanding = Total Repayable Amount - Total Eligible Collections
  // For Foreclosed loans, Midway Closed loans, or Closed loans, outstanding balance is ₹0
  const outstandingBalance = isForeclosed || isMidwayClosed || loanRecord?.status === "Closed"
    ? 0
    : Math.max(totalRepayable - totalCollected, 0);

  const remainingPrincipal = isForeclosed || isMidwayClosed || loanRecord?.status === "Closed"
    ? 0
    : Math.max(principalAmount - totalPrincipalRepaid, 0);

  const remainingInterest = isForeclosed || isMidwayClosed || loanRecord?.status === "Closed"
    ? 0
    : Math.max(totalInterest - totalInterestCollected, 0);

  // Foreclosure metrics
  const finalizedForeclosureCalc = foreclosureData.finalizedCalculation || {};
  const foreclosureSaleDetails = loanRecord?.vehicle?.saleDetails || loanRecord?.saleDetails || {};
  const foreclosureDate = foreclosureData.saleDate || foreclosureData.completedAt || loanRecord?.foreclosedDate || foreclosureSaleDetails.saleDate || loanRecord?.updatedAt;
  const foreclosureSalePrice = Number(foreclosureData.salePrice || foreclosureSaleDetails.salePrice || foreclosureSaleDetails.saleAmount || 0);
  const outstandingPrincipalAtForeclosure = finalizedForeclosureCalc.outstandingPrincipal !== undefined
    ? Number(finalizedForeclosureCalc.outstandingPrincipal)
    : (finalizedForeclosureCalc.principalOutstanding !== undefined ? Number(finalizedForeclosureCalc.principalOutstanding) : Math.max(0, principalAmount - totalPrincipalRepaid));
  const outstandingInterestAtForeclosure = finalizedForeclosureCalc.unpaidInterest !== undefined
    ? Number(finalizedForeclosureCalc.unpaidInterest)
    : (finalizedForeclosureCalc.interestOutstanding !== undefined ? Number(finalizedForeclosureCalc.interestOutstanding) : Math.max(0, totalInterest - totalInterestCollected));

  // Next Due Date
  const todayTs = parseToDayTimestamp(new Date());
  let nextDueDate = isForeclosed ? "—" : (loanRecord?.nextDueDate || loan.firstDueDate || "");
  let upcomingInstallment = isForeclosed
    ? null
    : schedule.find(
      (s) =>
        s.status !== "Collected" &&
        s.status !== "Paid" &&
        s.status !== "Foreclosed" &&
        s.emi - (s.amountPaid || 0) > 0.01
    );
  if (upcomingInstallment && upcomingInstallment.dueDate) {
    nextDueDate = upcomingInstallment.dueDate;
  }

  // Installments calculations
  const totalInstallmentsCount = schedule.length || Number(loan.tenure || 0);
  const installmentsPaidCount = schedule.filter(
    (s) => s.status === "Collected" || s.status === "Paid"
  ).length;
  const installmentsPendingCount = isForeclosed
    ? 0
    : Math.max(totalInstallmentsCount - installmentsPaidCount, 0);
  const overdueInstallmentsCount = isForeclosed
    ? 0
    : schedule.filter((s) => {
      const isNotPaid = s.status !== "Collected" && s.status !== "Paid" && s.status !== "Foreclosed";
      const hasBal = s.emi - (s.amountPaid || 0) > 0.01;
      const dueTs = parseToDayTimestamp(s.dueDate);
      return isNotPaid && hasBal && dueTs !== null && dueTs < todayTs;
    }).length;

  // Status
  let loanStatus = "Active";
  if (isForeclosed) {
    loanStatus = "Foreclosed";
  } else if (isMidwayClosed) {
    loanStatus = "Midway Closed";
  } else if (outstandingBalance <= 0 || loanRecord?.status === "Closed") {
    loanStatus = "Closed";
  } else if (overdueInstallmentsCount > 0) {
    loanStatus = "Overdue";
  }

  // Maturity Date
  const maturityDate =
    schedule.length > 0 && schedule[schedule.length - 1].dueDate
      ? formatDate(schedule[schedule.length - 1].dueDate)
      : "—";

  // Installment Amount
  const installmentAmount =
    schedule[0]?.emi || Number(loanRecord?.emiAmount || loan.emiAmount || 0);

  // Data arrives from the API after the page opens: wait for it (or show the
  // load error) before deciding the loan does not exist.
  if (!loanRecord && (!loaded || loadError)) {
    return (
      <div className="loan-view-container flex-1 min-h-screen bg-[#F4F6F9] px-3 sm:px-6 py-16 font-sans text-center text-sm w-full">
        {loadError ? <p className="text-rose-600">{loadError}</p> : <p className="text-slate-500">Loading loan…</p>}
      </div>
    );
  }

  // Gracefully handle invalid or missing loan ID
  if (!loanRecord) {
    return (
      <div className="loan-view-container flex-1 min-h-screen bg-white px-3 sm:px-6 py-8 font-sans text-slate-800 w-full min-w-0 max-w-full">
        <div className="max-w-xl mx-auto bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-xs">
          <div className="h-14 w-14 rounded-full bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Loan Not Found</h2>
          <p className="text-sm text-slate-500 mb-6">
            We couldn't find any loan matching ID <strong className="text-slate-800">{selectedLoanId || "specified"}</strong>. The loan may have been removed or the link is incorrect.
          </p>
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white px-5 py-2.5 text-sm font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Loans</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="loan-view-container flex-1 min-h-screen bg-white px-3 sm:px-6 py-5 sm:py-6 font-sans text-slate-800 w-full min-w-0 max-w-full overflow-x-hidden">
      <div className="w-full max-w-full space-y-4 sm:space-y-5">
        {loadError && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Could not load this loan: {loadError}
          </div>
        )}
        {/* =========================================================
            1. BREADCRUMB
        ========================================================= */}
        <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-500 font-medium">
          <button
            type="button"
            onClick={handleBack}
            className="hover:text-emerald-800 transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Loans</span>
          </button>
          <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          <span className="font-semibold text-slate-800">{effectiveLoanId}</span>
        </div>

        {/* =========================================================
            2. CUSTOMER & LOAN HEADER CARD
        ========================================================= */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
            <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-emerald-100/70 border border-emerald-200 flex items-center justify-center shrink-0 text-emerald-800 shadow-2xs">
              <User className="h-6 w-6 sm:h-7 sm:w-7" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight break-words">
                  {customerName}
                </h1>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider border shrink-0 ${loanStatus === "Active"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : loanStatus === "Midway Closed"
                      ? "bg-amber-50 text-amber-800 border-amber-300"
                      : loanStatus === "Foreclosed"
                        ? "bg-purple-50 text-purple-700 border-purple-200"
                        : loanStatus === "Overdue"
                          ? "bg-rose-50 text-rose-700 border-rose-200"
                          : "bg-slate-100 text-slate-600 border-slate-200"
                    }`}
                >
                  {loanStatus}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 font-medium">
                <span className="whitespace-nowrap">
                  Loan ID: <strong className="text-slate-800 font-semibold">{effectiveLoanId}</strong>
                </span>
                <span className="text-slate-300">|</span>
                <span className="whitespace-nowrap">
                  Customer ID: <strong className="text-slate-800 font-semibold">{effectiveCustomerId}</strong>
                </span>
                <span className="text-slate-300">|</span>
                <span className="whitespace-nowrap">
                  Mobile: <strong className="text-slate-800 font-semibold">{customerMobile}</strong>
                </span>
                <span className="text-slate-300">|</span>
                <span className="whitespace-nowrap">
                  Start Date: <strong className="text-slate-800 font-semibold">{formatDate(loanStartDate)}</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 ml-auto sm:ml-0 flex-wrap">
            {/* Foreclosed Status Indicator if foreclosed */}
            {isForeclosed && (
              <div
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-50 border border-purple-200 text-purple-700 text-xs font-semibold shadow-2xs"
                title="Loan is foreclosed and settled."
              >
                <Lock className="h-3.5 w-3.5" />
                <span>Foreclosed</span>
              </div>
            )}

            {/* Midway Closed Status Indicator if midway closed */}
            {isMidwayClosed && (
              <div
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold shadow-2xs"
                title="Loan is midway closed."
              >
                <Coins className="h-3.5 w-3.5 text-amber-700" />
                <span>Midway Closed</span>
              </div>
            )}

            {/* Edit Loan Button */}
            <button
              type="button"
              disabled={isMidwayClosed || isForeclosed}
              onClick={() => {
                if (isMidwayClosed || isForeclosed) return;
                if (onEditLoan) onEditLoan(loanRecord);
                else alert("Edit Loan initiated for " + effectiveLoanId);
              }}
              title={isForeclosed ? "Loan already foreclosed" : isMidwayClosed ? "Editing is disabled for midway-closed loans" : "Edit Loan"}
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs sm:text-sm font-semibold shadow-2xs transition-all whitespace-nowrap ${isMidwayClosed || isForeclosed
                ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed opacity-60 pointer-events-none"
                : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
                }`}
            >
              <Edit className={`h-3.5 w-3.5 ${isMidwayClosed || isForeclosed ? "text-slate-400" : "text-slate-500"}`} strokeWidth={2} />
              <span>Edit Loan</span>
            </button>

            {/* Midway Closure Button (orange accent beside Edit Loan) */}
            <button
              type="button"
              disabled={isMidwayClosed || isForeclosed}
              onClick={() => {
                if (isMidwayClosed || isForeclosed) return;
                setShowMidwayModal(true);
              }}
              title={isForeclosed ? "Loan already foreclosed" : isMidwayClosed ? "This loan is already midway closed" : "Midway Closure"}
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-semibold shadow-2xs transition-all whitespace-nowrap ${isMidwayClosed || isForeclosed
                ? "bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed opacity-60 pointer-events-none"
                : "bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
                }`}
            >
              <Coins className="h-3.5 w-3.5" />
              <span>Midway Closure</span>
            </button>

            {/* More Actions Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 p-2 text-slate-600 shadow-2xs transition-all cursor-pointer"
                aria-label="More actions"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-1 w-44 rounded-xl bg-white border border-slate-200 shadow-lg py-1.5 z-20 text-xs font-semibold text-slate-700">
                  <button
                    onClick={() => {
                      window.print();
                      setMenuOpen(false);
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-slate-50"
                  >
                    Print Summary
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab("repaymentSchedule");
                      setMenuOpen(false);
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-slate-50"
                  >
                    View Schedule
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab("collections");
                      setMenuOpen(false);
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-slate-50"
                  >
                    View Collections
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* =========================================================
            3. FIVE TOP KPI CARDS
        ========================================================= */}
        <div className="loan-kpi-grid grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3.5 sm:gap-4">
          {/* 1. Principal Repaid */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-4 shadow-2xs flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center shrink-0">
              <Wallet className="h-4.5 w-4.5" strokeWidth={2.2} />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 block leading-tight" title="Principal Repaid">
                Principal Repaid
              </span>
              <p className="text-base sm:text-lg lg:text-xl font-extrabold text-slate-900 tracking-tight mt-0.5 leading-snug break-words" title={formatCurrency(totalPrincipalRepaid)}>
                {formatCurrency(totalPrincipalRepaid)}
              </p>
              <span className="text-[11px] text-slate-400 mt-0.5 block leading-tight">
                Principal received
              </span>
            </div>
          </div>

          {/* 2. Interest Repaid */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-4 shadow-2xs flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center shrink-0">
              <TrendingUp className="h-4.5 w-4.5" strokeWidth={2.2} />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 block leading-tight" title="Interest Repaid">
                Interest Repaid
              </span>
              <p className="text-base sm:text-lg lg:text-xl font-extrabold text-slate-900 tracking-tight mt-0.5 leading-snug break-words" title={formatCurrency(totalInterestCollected)}>
                {formatCurrency(totalInterestCollected)}
              </p>
              <span className="text-[11px] text-slate-400 mt-0.5 block leading-tight">
                Interest earned
              </span>
            </div>
          </div>

          {/* 3. Total Collected */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-4 shadow-2xs flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center shrink-0">
              <Coins className="h-4.5 w-4.5" strokeWidth={2.2} />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 block leading-tight" title="Total Collected">
                Total Collected
              </span>
              <p className="text-base sm:text-lg lg:text-xl font-extrabold text-slate-900 tracking-tight mt-0.5 leading-snug break-words" title={formatCurrency(totalCollected)}>
                {formatCurrency(totalCollected)}
              </p>
              <span className="text-[11px] text-slate-400 mt-0.5 block leading-tight">
                Total amount received
              </span>
            </div>
          </div>

          {/* 4. Remaining Principal */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-4 shadow-2xs flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center shrink-0">
              <Landmark className="h-4.5 w-4.5" strokeWidth={2.2} />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 block leading-tight" title="Remaining Principal">
                Remaining Principal
              </span>
              <p className="text-base sm:text-lg lg:text-xl font-extrabold text-slate-900 tracking-tight mt-0.5 leading-snug break-words" title={formatCurrency(remainingPrincipal)}>
                {formatCurrency(remainingPrincipal)}
              </p>
              <span className="text-[11px] text-slate-400 mt-0.5 block leading-tight">
                {isForeclosed
                  ? "Settled (Foreclosed)"
                  : isMidwayClosed
                    ? "Settled (Midway Closed)"
                    : "Balance principal"}
              </span>
            </div>
          </div>

          {/* 5. Remaining Interest */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-4 shadow-2xs flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center shrink-0">
              <PiggyBank className="h-4.5 w-4.5" strokeWidth={2.2} />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 block leading-tight" title="Remaining Interest">
                Remaining Interest
              </span>
              <p className="text-base sm:text-lg lg:text-xl font-extrabold text-slate-900 tracking-tight mt-0.5 leading-snug break-words" title={formatCurrency(remainingInterest)}>
                {formatCurrency(remainingInterest)}
              </p>
              <span className="text-[11px] text-slate-400 mt-0.5 block leading-tight">
                {isForeclosed
                  ? "Settled / Waived"
                  : isMidwayClosed
                    ? "Settled (Midway Closed)"
                    : "Balance interest"}
              </span>
            </div>
          </div>
        </div>

        {/* =========================================================
            4. TAB NAVIGATION (5 TABS)
        ========================================================= */}
        <div className="border-b border-slate-200 flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar pt-1 w-full max-w-full">
          {[
            { id: "loanDetails", label: "Loan Details" },
            { id: "repaymentSchedule", label: "Repayment Schedule" },
            { id: "collections", label: `Collection History (${loanPayments.length})` },
            { id: "installmentTimeline", label: "Installment Timeline" },
            { id: "penaltyLog", label: "Penalty Log" },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 sm:px-6 py-2.5 text-xs sm:text-sm font-semibold whitespace-nowrap transition-all border-b-2 cursor-pointer ${isActive
                  ? "border-emerald-700 text-emerald-800 bg-emerald-50/40 rounded-t-lg"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
                  }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* =========================================================
            5. TAB CONTENT
        ========================================================= */}

        {/* TAB 1: LOAN DETAILS */}
        {activeTab === "loanDetails" && (
          <div className="space-y-5 w-full">
            {/* Loan Overview: Loan Information Column + 3 Summary Cards */}
            <div className="loan-overview-grid items-stretch w-full">
              {/* Left Column: Loan Information Section */}
              <div className="loan-info-col bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs flex flex-col justify-between">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 mb-5 tracking-tight flex items-center gap-2">
                    <FileText className="h-4.5 w-4.5 text-emerald-800" />
                    <span>Loan Information</span>
                  </h2>

                  <div className="loan-info-fields-grid grid grid-cols-1 sm:grid-cols-2 gap-y-3.5 sm:gap-y-4 gap-x-6 sm:gap-x-8 text-xs sm:text-sm">
                    {/* Left Column */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100">
                        <span className="text-slate-500 font-medium shrink-0">Loan ID</span>
                        <span className="font-semibold text-slate-900 text-right break-words">{effectiveLoanId}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100">
                        <span className="text-slate-500 font-medium shrink-0">Loan Date</span>
                        <span className="font-semibold text-slate-900 text-right break-words">{formatDate(loanStartDate)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100">
                        <span className="text-slate-500 font-medium shrink-0">Principal Amount</span>
                        <span className="font-semibold text-slate-900 text-right break-words">{formatCurrency(principalAmount)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100">
                        <span className="text-slate-500 font-medium shrink-0">Interest Method</span>
                        <span className="font-semibold text-slate-900 text-right break-words">{loan.interestType || "Flat"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100">
                        <span className="text-slate-500 font-medium shrink-0">Interest Rate</span>
                        <span className="font-semibold text-slate-900 text-right break-words">
                          {loan.interestRate ? `${loan.interestRate}% per month` : "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100">
                        <span className="text-slate-500 font-medium shrink-0">Total Interest</span>
                        <span className="font-semibold text-slate-900 text-right break-words">{formatCurrency(totalInterest)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100">
                        <span className="text-slate-500 font-medium shrink-0">Document Charges</span>
                        <span className="font-semibold text-slate-900 text-right break-words">{formatCurrency(documentCharges)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-1.5">
                        <span className="text-slate-500 font-medium shrink-0">Total Repayable</span>
                        <span className="font-bold text-slate-900 text-right break-words">{formatCurrency(totalRepayable)}</span>
                      </div>
                    </div>

                    {/* Right Column */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100">
                        <span className="text-slate-500 font-medium shrink-0">Repayment Frequency</span>
                        <span className="font-semibold text-slate-900 text-right break-words">
                          {loan.paymentFrequency || loanRecord?.paymentFrequency || "Daily"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100">
                        <span className="text-slate-500 font-medium shrink-0">Installment Amount</span>
                        <span className="font-semibold text-slate-900 text-right break-words">{formatCurrency(installmentAmount)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100">
                        <span className="text-slate-500 font-medium shrink-0">Tenure</span>
                        <span className="font-semibold text-slate-900 text-right break-words">
                          {loan.tenure ? `${loan.tenure} ${loan.tenureUnit || "Months"}` : "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100">
                        <span className="text-slate-500 font-medium shrink-0">Total Installments</span>
                        <span className="font-semibold text-slate-900 text-right break-words">{totalInstallmentsCount}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100">
                        <span className="text-slate-500 font-medium shrink-0">First Due Date</span>
                        <span className="font-semibold text-slate-900 text-right break-words">
                          {formatDate(loan.firstDueDate || loanStartDate)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100">
                        <span className="text-slate-500 font-medium shrink-0">Maturity Date</span>
                        <span className="font-semibold text-slate-900 text-right break-words">{maturityDate}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100">
                        <span className="text-slate-500 font-medium shrink-0">Down Payment</span>
                        <span className="font-semibold text-slate-900 text-right break-words">{formatCurrency(downPayment)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100">
                        <span className="text-slate-500 font-medium shrink-0">Vehicle Model</span>
                        <div className="flex items-center gap-2">
                          {vehicleImageSrc && (
                            <img
                              src={vehicleImageSrc}
                              alt={vehicle.model || vehicle.regNo || "Vehicle"}
                              className="h-6 w-9 rounded object-cover border border-slate-200 shadow-2xs"
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                          )}
                          <span className="font-semibold text-slate-900 text-right break-words">
                            {[vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "—"}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-1.5">
                        <span className="text-slate-500 font-medium shrink-0">Vehicle Status</span>
                        {(() => {
                          const vStat = getEffectiveVehicleStatus(loanRecord);
                          const vStyle = vStat === 'Active' ? 'bg-[#2563EB] text-white' :
                            vStat === 'Seized' ? 'bg-[#EA580C] text-white' :
                              vStat === 'Sold' ? 'bg-[#64748B] text-white' :
                                'bg-slate-500 text-white';
                          return (
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold shadow-2xs ${vStyle}`}>
                              {vStat}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Three Vertically Stacked Summary Cards or Foreclosed State */}
              {isForeclosed ? (() => {
                const fData = loanRecord?.foreclosure || {};
                const calc = fData.finalizedCalculation || {};
                const saleDetails = loanRecord?.vehicle?.saleDetails || loanRecord?.saleDetails || {};
                const salePrice = Number(fData.salePrice || saleDetails.salePrice || saleDetails.saleAmount || 0);
                const profitLoss = calc.profitLoss !== undefined
                  ? Number(calc.profitLoss)
                  : ((fData.profitLoss !== undefined)
                    ? Number(fData.profitLoss)
                    : (salePrice - Number(calc.totalForeclosureCost || 0)));
                const isProfit = profitLoss > 0;
                const isLoss = profitLoss < 0;

                const rawForeclosureDate =
                  fData.saleDate ||
                  saleDetails.saleDate ||
                  fData.completedAt ||
                  loanRecord?.foreclosedDate ||
                  loanRecord?.foreclosureDate ||
                  loanRecord?.closedDate ||
                  foreclosureDate ||
                  loanRecord?.updatedAt;
                const formattedForeclosureDate = (rawForeclosureDate ? formatDate(rawForeclosureDate) : "") || "—";

                return (
                  <div className="loan-summary-col h-full flex flex-col justify-between">
                    <div className="rounded-2xl border border-purple-200 bg-gradient-to-b from-purple-50/40 via-white to-purple-50/20 p-5 sm:p-6 shadow-2xs flex flex-col justify-between h-full space-y-4">
                      {/* Top Header Row: Lock Icon + Title + Foreclosed Badge + View Details Action */}
                      <div className="flex items-start justify-between gap-3 pb-3 border-b border-purple-100">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-10 w-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs shrink-0">
                            <Lock className="h-5 w-5" strokeWidth={2.2} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight leading-tight">
                                Vehicle Foreclosure
                              </h3>
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-purple-100 text-purple-900 border border-purple-300">
                                <ShieldCheck className="h-3 w-3 text-purple-700" />
                                Foreclosed
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 font-medium mt-0.5">
                              Loan Account Closed
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={isNavigatingToForeclosure}
                          onClick={() => {
                            if (isNavigatingToForeclosure) return;
                            setIsNavigatingToForeclosure(true);
                            setTimeout(() => {
                              navigate(`/vehicle?loanId=${encodeURIComponent(effectiveLoanId)}&type=foreclosure`, {
                                state: { from: location.pathname + location.search, fromLabel: 'Loan Details' }
                              });
                            }, 50);
                          }}
                          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-white text-xs font-bold shadow-xs transition-all duration-150 shrink-0 ${
                            isNavigatingToForeclosure
                              ? "bg-purple-800 opacity-90 cursor-wait"
                              : "bg-purple-700 hover:bg-purple-800 active:scale-95 cursor-pointer"
                          }`}
                          title="View Vehicle Foreclosure Details"
                        >
                          {isNavigatingToForeclosure ? (
                            <>
                              <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                              <span>Loading...</span>
                            </>
                          ) : (
                            <>
                              <span>View Details</span>
                              <ChevronRight className="h-3.5 w-3.5" />
                            </>
                          )}
                        </button>
                      </div>
                      {/* Stacked Financial Rows: 1st FORECLOSED DATE, 2nd VEHICLE SALE AMOUNT, 3rd FORECLOSURE PROFIT/LOSS */}
                      <div className="flex flex-col gap-3 flex-1 justify-between py-0.5">
                        {/* Row 1: Foreclosed Date (Populated with real foreclosure data) */}
                        <div className="bg-white rounded-xl p-3.5 sm:p-4 border border-purple-100/90 shadow-2xs transition-all hover:border-purple-200 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                              FORECLOSED DATE
                            </span>
                            <p className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-none mt-1.5">
                              {formattedForeclosureDate}
                            </p>
                            <span className="text-xs font-medium text-slate-500 block mt-1.5">
                              Date marked as foreclosed
                            </span>
                          </div>
                          <div className="h-10 w-10 rounded-xl bg-purple-50 text-purple-700 border border-purple-200/80 flex items-center justify-center shrink-0">
                            <Calendar className="h-5 w-5" />
                          </div>
                        </div>

                        {/* Row 2: Vehicle Sale Amount */}
                        <div className="bg-white rounded-xl p-3.5 sm:p-4 border border-purple-100/90 shadow-2xs transition-all hover:border-purple-200 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                              VEHICLE SALE AMOUNT
                            </span>
                            <p className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-none mt-1.5">
                              {formatCurrency(salePrice)}
                            </p>
                            <span className="text-xs font-medium text-slate-500 block mt-1.5">
                              Recorded sale proceeds
                            </span>
                          </div>
                          <div className="h-10 w-10 rounded-xl bg-purple-50 text-purple-700 border border-purple-200/80 flex items-center justify-center shrink-0">
                            <IndianRupee className="h-5 w-5" />
                          </div>
                        </div>

                        {/* Row 3: Foreclosure Profit / Loss (Dynamic Label) */}
                        <div className={`rounded-xl p-3.5 sm:p-4 border shadow-2xs transition-all flex items-center justify-between gap-3 ${
                          isLoss
                            ? "bg-rose-50/50 border-rose-200/90 hover:border-rose-300"
                            : isProfit
                              ? "bg-emerald-50/50 border-emerald-200/90 hover:border-emerald-300"
                              : "bg-purple-50/50 border-purple-200/90 hover:border-purple-300"
                        }`}>
                          <div className="min-w-0">
                            <span className={`text-[11px] font-bold uppercase tracking-wider block ${
                              isLoss ? "text-rose-700" : isProfit ? "text-emerald-700" : "text-purple-700"
                            }`}>
                              {isLoss ? "FORECLOSURE LOSS" : isProfit ? "FORECLOSURE PROFIT" : "FORECLOSURE SETTLEMENT"}
                            </span>
                            <p className={`text-xl sm:text-2xl font-black tracking-tight leading-none mt-1.5 ${
                              isLoss ? "text-rose-600" : isProfit ? "text-emerald-700" : "text-slate-900"
                            }`}>
                              {isLoss
                                ? `-${formatCurrency(Math.abs(profitLoss))}`
                                : isProfit
                                  ? `+${formatCurrency(profitLoss)}`
                                  : "₹0"}
                            </p>
                            <span className={`text-xs font-medium block mt-1.5 ${
                              isLoss ? "text-rose-600/90" : isProfit ? "text-emerald-600/90" : "text-slate-500"
                            }`}>
                              {isLoss ? "Loss absorbed on closure" : isProfit ? "Surplus realized on sale" : "Break-even foreclosure"}
                            </span>
                          </div>
                          <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border ${
                            isLoss
                              ? "bg-rose-100 text-rose-700 border-rose-300"
                              : isProfit
                                ? "bg-emerald-100 text-emerald-700 border-emerald-300"
                                : "bg-purple-100 text-purple-700 border-purple-300"
                          }`}>
                            {isLoss ? (
                              <TrendingUp className="h-5 w-5 rotate-180" />
                            ) : isProfit ? (
                              <TrendingUp className="h-5 w-5" />
                            ) : (
                              <ShieldCheck className="h-5 w-5" />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Card Footer: Status details */}
                      <div className="pt-2.5 border-t border-purple-100/80 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                        <span className="flex items-center gap-1.5 text-purple-900 font-medium truncate">
                          <span className="h-1.5 w-1.5 rounded-full bg-purple-600"></span>
                          Settled via Vehicle Foreclosure
                        </span>
                        <span className="text-[10px] text-slate-500 shrink-0 font-medium">
                          All collections closed
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })() : (
                <div className="loan-summary-col flex flex-col justify-between gap-3.5 sm:gap-4 h-full">
                  {/* 1. Total Amount Card */}
                  <div className="bg-emerald-50/50 rounded-2xl border border-emerald-200/80 p-4 sm:p-5 shadow-2xs flex-1 flex flex-col justify-between transition-all duration-200 hover:shadow-xs min-h-[120px]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-xs font-bold uppercase tracking-wider text-emerald-800/80 block">
                          Total Amount
                        </span>
                        <p className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-1 leading-snug break-words">
                          {formatCurrency(totalRepayable)}
                        </p>
                      </div>
                      <div className="h-11 w-11 rounded-xl bg-emerald-100 text-emerald-700 border border-emerald-200/90 flex items-center justify-center shrink-0 shadow-2xs">
                        <Wallet className="h-5 w-5" strokeWidth={2.2} />
                      </div>
                    </div>
                    <div className="pt-2 mt-auto border-t border-emerald-100/70">
                      <span className="text-[11px] text-emerald-700/90 font-medium block">
                        Principal + Interest
                      </span>
                    </div>
                  </div>

                  {/* 2. Total Collected Card */}
                  <div className="bg-sky-50/50 rounded-2xl border border-sky-200/80 p-4 sm:p-5 shadow-2xs flex-1 flex flex-col justify-between transition-all duration-200 hover:shadow-xs min-h-[120px]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-xs font-bold uppercase tracking-wider text-sky-800/80 block">
                          Total Collected
                        </span>
                        <p className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-1 leading-snug break-words">
                          {formatCurrency(totalCollected)}
                        </p>
                      </div>
                      <div className="h-11 w-11 rounded-xl bg-sky-100 text-sky-700 border border-sky-200/90 flex items-center justify-center shrink-0 shadow-2xs">
                        <Coins className="h-5 w-5" strokeWidth={2.2} />
                      </div>
                    </div>
                    <div className="pt-2 mt-auto border-t border-sky-100/70">
                      <span className="text-[11px] text-sky-700/90 font-medium block">
                        Total amount received so far
                      </span>
                    </div>
                  </div>

                  {/* 3. Total Outstanding Card */}
                  <div className={`${isMidwayClosed ? "bg-amber-50/50 border-amber-200/80" : "bg-amber-50/50 border-amber-200/80"} rounded-2xl border p-4 sm:p-5 shadow-2xs flex-1 flex flex-col justify-between transition-all duration-200 hover:shadow-xs min-h-[120px]`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className={`text-xs font-bold uppercase tracking-wider ${isMidwayClosed ? "text-amber-800/80" : "text-amber-800/80"} block`}>
                          Total Outstanding
                        </span>
                        <p className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-1 leading-snug break-words">
                          {formatCurrency(outstandingBalance)}
                        </p>
                      </div>
                      <div className={`h-11 w-11 rounded-xl ${isMidwayClosed ? "bg-amber-100 text-amber-700 border-amber-200/90" : "bg-amber-100 text-amber-700 border-amber-200/90"} border flex items-center justify-center shrink-0 shadow-2xs`}>
                        {isMidwayClosed ? <CheckCircle className="h-5 w-5" strokeWidth={2.2} /> : <Landmark className="h-5 w-5" strokeWidth={2.2} />}
                      </div>
                    </div>
                    <div className={`pt-2 mt-auto border-t ${isMidwayClosed ? "border-amber-100/70" : "border-amber-100/70"}`}>
                      <span className={`text-[11px] ${isMidwayClosed ? "text-amber-700 font-semibold" : "text-amber-700/90 font-medium"} block`}>
                        {isMidwayClosed
                          ? "Settled via Midway Closure (₹0 balance)"
                          : "Remaining payable balance"}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: REPAYMENT SCHEDULE */}
        {activeTab === "repaymentSchedule" && (
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  Loan Repayment Schedule
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Detailed installment schedule and payment statuses for {effectiveLoanId}. Click any installment to view collection history.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
                  Total Installments: {schedule.length}
                </span>
              </div>
            </div>

            {isForeclosed && <ForeclosureScheduleLock />}

            {isMidwayClosed && !isForeclosed && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-amber-700 shrink-0" />
                <span>This loan is settled via Midway Closure. Genuine prior payments are preserved and future cancelled instalments are marked Midway Closed with ₹0 balance.</span>
              </div>
            )}

            {schedule.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No repayment schedule available for this loan.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-xs sm:text-sm">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="px-3.5 py-3 text-left font-bold text-slate-700">Instalment Number</th>
                      <th className="px-3.5 py-3 text-left font-bold text-slate-700">Due Date</th>
                      <th className="px-3.5 py-3 text-right font-bold text-slate-700">Principal</th>
                      <th className="px-3.5 py-3 text-right font-bold text-slate-700">Interest</th>
                      <th className="px-3.5 py-3 text-right font-bold text-slate-700">Total EMI</th>
                      <th className="px-3.5 py-3 text-right font-bold text-slate-700">Principal Outstanding</th>
                      <th className="px-3.5 py-3 text-right font-bold text-slate-700">Balance Amount</th>
                      <th className="px-3.5 py-3 text-center font-bold text-slate-700">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {schedule.map((row) => {
                      const isMidwaySettled = !isForeclosed && Boolean(row.isMidwayClosed || row.closureAdjusted || row.status === "Midway Closed");
                      const isForeclosedRow = isForeclosed && (
                        foreclosureEffectiveStartNum !== null &&
                        Number(row.installmentNumber) >= foreclosureEffectiveStartNum
                      );
                      const isOverdue = !isMidwaySettled && !isForeclosed && row.status === "Overdue";
                      const penaltyAmount = isOverdue
                        ? getInstallmentPenaltySupportingAmount(row, {
                          loanId: effectiveLoanId,
                          frequency: loan?.paymentFrequency || loanRecord?.paymentFrequency || "Monthly",
                          settings: getPenaltySettings(),
                          penaltyRecords: getPenaltyRecords(),
                        })
                        : null;

                      const displayBalance = isForeclosed ? 0 : (row.balance !== undefined ? row.balance : Math.max(0, row.emi - (row.amountPaid || 0)));
                      const displayPrinOutstanding = isForeclosed ? 0 : (row.principalOutstanding !== undefined ? row.principalOutstanding : 0);

                      return (
                        <tr
                          key={row.installmentNumber}
                          onClick={() => setSelectedInstallmentForHistory(row)}
                          className={`transition-colors cursor-pointer group ${
                            isMidwaySettled
                              ? "bg-amber-50/70 hover:bg-amber-100/60"
                              : isForeclosedRow
                                ? "bg-[#F3E8FF] hover:bg-[#EBD5FF] border-b border-purple-200/50"
                                : "bg-white hover:bg-emerald-50/40"
                          }`}
                          style={isForeclosedRow ? { backgroundColor: "#F3E8FF" } : undefined}
                          title={isForeclosedRow ? "Closed via vehicle foreclosure" : "Click to view collection history"}
                        >
                          <td className={`whitespace-nowrap px-3.5 py-3 font-semibold ${
                            isMidwaySettled
                              ? "text-amber-950 group-hover:text-amber-900"
                              : "text-slate-700 group-hover:text-emerald-800"
                          }`}>
                            {row.installmentNumber}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3 font-semibold text-slate-900">
                            {formatDate(row.dueDate)}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3 text-right text-slate-600 font-medium">
                            {formatCurrency(row.principal)}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3 text-right text-slate-600 font-medium">
                            {formatCurrency(row.interest)}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3 text-right font-bold text-emerald-800">
                            {formatCurrency(row.emi)}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3 text-right text-slate-700 font-medium">
                            {formatCurrency(displayPrinOutstanding)}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3 text-right font-bold text-slate-900">
                            {formatCurrency(displayBalance)}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3 text-center">
                            <StatusBadge
                              status={row.status}
                              isMidwaySettled={isMidwaySettled}
                              penaltyAmount={penaltyAmount}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: COLLECTION HISTORY */}
        {activeTab === "collections" && (
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-emerald-800" />
                  <span>Collection &amp; Repayment History</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Complete ledger of payments and collections received for loan {effectiveLoanId}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
                  {loanPayments.length} payment{loanPayments.length === 1 ? "" : "s"} recorded
                </span>
              </div>
            </div>

            {/* Quick Financial Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Total Collections</span>
                <p className="text-base sm:text-lg font-extrabold text-slate-900 mt-0.5">{loanPayments.length}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
                <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider block">Amount Collected</span>
                <p className="text-base sm:text-lg font-extrabold text-emerald-900 mt-0.5">{formatCurrency(totalCollected)}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-sky-50/70 border border-sky-200">
                <span className="text-[11px] font-semibold text-sky-800 uppercase tracking-wider block">Principal Recovered</span>
                <p className="text-base sm:text-lg font-extrabold text-sky-900 mt-0.5">{formatCurrency(totalPrincipalRepaid)}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200">
                <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider block">Interest Earned</span>
                <p className="text-base sm:text-lg font-extrabold text-amber-900 mt-0.5">{formatCurrency(totalInterestCollected)}</p>
              </div>
            </div>

            {/* Foreclosure Event Banner in Collection History */}
            {isForeclosed && (
              <div className="rounded-xl border border-purple-200 bg-purple-50/80 p-4 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Lock className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-purple-950">
                        Activity: Loan Foreclosed
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-purple-200 text-purple-900 border border-purple-300">
                        Foreclosure Event
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-purple-800/90 mt-1 flex-wrap">
                      <span><strong>Date:</strong> {formatDateTime(foreclosureDate || loanRecord.updatedAt).date}</span>
                      <span>•</span>
                      <span><strong>Vehicle Reg:</strong> {vehicle.regNo || "—"}</span>
                      <span>•</span>
                      <span><strong>Loan ID:</strong> {effectiveLoanId}</span>
                      {foreclosureSalePrice > 0 && (
                        <>
                          <span>•</span>
                          <span><strong>Vehicle Sale:</strong> {formatCurrency(foreclosureSalePrice)}</span>
                        </>
                      )}
                      {foreclosureData.buyerName && (
                        <>
                          <span>•</span>
                          <span><strong>Buyer:</strong> {foreclosureData.buyerName}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white border border-purple-200 text-purple-900 text-xs font-bold shadow-2xs shrink-0">
                  <ShieldCheck className="h-3.5 w-3.5 text-purple-600" />
                  Account Closed
                </span>
              </div>
            )}

            {loanPayments.length === 0 && !isForeclosed ? (
              <div className="py-12 text-center text-xs text-slate-400 space-y-2">
                <Receipt className="h-8 w-8 mx-auto text-slate-300" />
                <p>No collections recorded yet for this loan.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-xs sm:text-sm">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="px-3.5 py-3 text-left font-bold text-slate-700">Receipt ID / Ref</th>
                      <th className="px-3.5 py-3 text-left font-bold text-slate-700">Collection Date &amp; Time</th>
                      <th className="px-3.5 py-3 text-right font-bold text-slate-700">Amount</th>
                      <th className="px-3.5 py-3 text-right font-bold text-slate-700">Principal</th>
                      <th className="px-3.5 py-3 text-right font-bold text-slate-700">Interest</th>
                      <th className="px-3.5 py-3 text-center font-bold text-slate-700">Type / Mode</th>
                      <th className="px-3.5 py-3 text-center font-bold text-slate-700">Reference</th>
                      <th className="px-3.5 py-3 text-left font-bold text-slate-700">Activity &amp; Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {/* Distinct Foreclosure History Row */}
                    {isForeclosed && (
                      <tr className="bg-purple-50/80 border-l-4 border-l-purple-600 font-medium">
                        <td className="whitespace-nowrap px-3.5 py-3 font-bold text-purple-900">
                          <div className="flex items-center gap-1.5">
                            <Lock className="h-3.5 w-3.5 text-purple-700" />
                            <span>FORECLOSURE</span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-3 text-purple-900">
                          <span className="font-bold">{formatDateTime(foreclosureDate || loanRecord.updatedAt).date}</span>
                          {formatDateTime(foreclosureDate || loanRecord.updatedAt).time && (
                            <span className="text-[11px] text-purple-600 ml-1.5 font-normal">
                              {formatDateTime(foreclosureDate || loanRecord.updatedAt).time}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-3 text-right font-bold text-purple-900">
                          {foreclosureSalePrice > 0 ? formatCurrency(foreclosureSalePrice) : "—"}
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-3 text-right text-purple-800">
                          {formatCurrency(outstandingPrincipalAtForeclosure)}
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-3 text-right text-purple-800">
                          {formatCurrency(outstandingInterestAtForeclosure)}
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-3 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-purple-200 text-purple-900 border border-purple-300">
                            Foreclosed
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-3 text-center text-purple-800 font-semibold">
                          {vehicle.regNo || effectiveLoanId}
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-3 text-purple-900">
                          <span className="font-semibold">Loan Foreclosed</span>
                          {foreclosureData.buyerName && (
                            <span className="text-purple-700 text-xs ml-1 font-normal">
                              · Sold to {foreclosureData.buyerName}
                            </span>
                          )}
                        </td>
                      </tr>
                    )}
                    {loanPayments.map((p) => {
                      const { date, time } = formatDateTime(p.date, p);
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="whitespace-nowrap px-3.5 py-3 font-semibold text-slate-900">
                            {p.id}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3 text-slate-700">
                            <span className="font-semibold text-slate-900">{date}</span>
                            {time && <span className="text-[11px] text-slate-400 ml-1.5 font-normal">{time}</span>}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3 text-right font-bold text-emerald-800">
                            {formatCurrency(p.amount)}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3 text-right text-slate-600 font-medium">
                            {p.principal !== undefined ? formatCurrency(p.principal) : "—"}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3 text-right text-slate-600 font-medium">
                            {p.interest !== undefined ? formatCurrency(p.interest) : "—"}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3 text-center">
                            <span className="inline-flex px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-semibold border border-slate-200">
                              {p.mode || "Cash"}
                            </span>
                            {p.transactionId && (
                              <span className="block text-[10px] text-slate-500 font-mono mt-0.5">
                                Transaction ID: {p.transactionId}
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-3 text-center">
                            <span className="text-xs font-semibold text-emerald-800">
                              {p.installmentNumber ? `#${p.installmentNumber}` : "—"}
                            </span>
                          </td>
                          <td className="px-3.5 py-3 text-slate-600 text-xs max-w-xs truncate" title={p.remarks || "—"}>
                            {p.remarks || "EMI Collection"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: INSTALLMENT TIMELINE */}
        {activeTab === "installmentTimeline" && (
          <div className="w-full">
            <InstallmentTimeline
              schedule={schedule}
              loanPayments={loanPayments}
              effectiveLoanId={effectiveLoanId}
              isMidwayClosed={isMidwayClosed}
              isForeclosed={isForeclosed}
              isLoanCompleted={
                isForeclosed ||
                isMidwayClosed ||
                (schedule.length > 0 &&
                  schedule.every((s) => s.status === "Paid" || s.status === "Collected" || (s.balance !== undefined && s.balance <= 0.01)))
              }
            />
          </div>
        )}

        {/* TAB 5: PENALTY LOG */}
        {activeTab === "penaltyLog" && (
          <div className="w-full bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-[#006052] border border-teal-200">
                  <FileText className="h-4.5 w-4.5" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="text-base font-bold text-slate-900">Penalty Log</h3>
                    {isMonthlyPenaltyDisabled && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 shadow-2xs">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
                        <span>Monthly Penalty Disabled</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Penalty summary per installment for {effectiveLoanId}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
                  {penaltyLogRecords.length} {penaltyLogRecords.length === 1 ? 'Record' : 'Records'}
                </span>
              </div>
            </div>

            {penaltyLogRecords.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                No penalties recorded for this loan.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-xs sm:text-sm">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-bold text-slate-700">Date</th>
                      <th className="px-4 py-2.5 text-left font-bold text-slate-700">Installment(s)</th>
                      <th className="px-4 py-2.5 text-right font-bold text-slate-700">Calculated Penalty Amount</th>
                      <th className="px-4 py-2.5 text-right font-bold text-slate-700">Collected Amount</th>
                      <th className="px-4 py-2.5 text-center font-bold text-slate-700">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {penaltyLogRecords.map((r) => (
                      <tr key={r.id || `pen-${r.installmentDisplay}`} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap font-medium">
                          {formatDate(r.date)}
                        </td>
                        <td className="px-4 py-2.5 font-bold text-slate-900 whitespace-nowrap">
                          {r.installmentDisplay}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-slate-900 whitespace-nowrap">
                          {formatCurrency(r.calculatedPenaltyAmount || r.actualPenaltyAmount)}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-semibold whitespace-nowrap ${r.collectedAmount !== null && r.collectedAmount > 0 ? 'text-emerald-700 font-bold' : 'text-slate-400'
                          }`}>
                          {r.collectedAmount !== null && r.collectedAmount !== undefined ? formatCurrency(r.collectedAmount) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-center whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase ${r.status === 'Collected'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : r.status === 'Frozen'
                                ? 'bg-sky-50 text-sky-700 border border-sky-200'
                                : r.status === 'Cancelled'
                                  ? 'bg-slate-100 text-slate-600 border border-slate-200'
                                  : r.status === 'Partial'
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}
                          >
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* =========================================================
            COLLECTION HISTORY MODAL (CLICKED FROM REPAYMENT SCHEDULE)
        ========================================================= */}
        {selectedInstallmentForHistory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4">
            <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800 shrink-0">
                    <Wallet className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base sm:text-lg text-slate-900 leading-tight">
                      Installment Collection History
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                      <span className="font-semibold text-emerald-800">
                        Installment #{selectedInstallmentForHistory.installmentNumber}
                      </span>
                      <span className="text-slate-300">|</span>
                      <span>
                        Loan ID: <strong className="text-slate-700 font-semibold">{effectiveLoanId}</strong>
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedInstallmentForHistory(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
                {(() => {
                  const activeInst =
                    schedule.find(
                      (s) => s.installmentNumber === selectedInstallmentForHistory.installmentNumber
                    ) || selectedInstallmentForHistory;

                  const targetNum = Number(selectedInstallmentForHistory.installmentNumber);

                  const matchingCollections = loanPayments.filter((p) => {
                    if (Array.isArray(p.allocations) && p.allocations.length > 0) {
                      return p.allocations.some(
                        (a) => Number(a.installmentNumber) === targetNum && Number(a.allocated || 0) > 0
                      );
                    }
                    if (Array.isArray(p.installmentNumbers)) {
                      return p.installmentNumbers.map(Number).includes(targetNum);
                    }
                    if (p.installmentNumber !== undefined && p.installmentNumber !== null) {
                      const numStr = String(p.installmentNumber);
                      const parts = numStr.split(",").map((s) => Number(s.trim()));
                      return parts.includes(targetNum);
                    }
                    return false;
                  });

                  return (
                    <div className="space-y-4">
                      {/* Installment Summary */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                        <div>
                          <span className="text-slate-500 block">Due Date</span>
                          <span className="font-bold text-slate-800">{formatDate(activeInst.dueDate)}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">{getRepaymentColumnLabel(loan.paymentFrequency || loanRecord?.paymentFrequency)} Due</span>
                          <span className="font-bold text-slate-800">{formatCurrency(activeInst.emi)}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Amount Paid</span>
                          <span className="font-bold text-emerald-800">{formatCurrency(activeInst.amountPaid || 0)}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Balance Remaining</span>
                          <span className="font-bold text-slate-800">{formatCurrency(isForeclosed && activeInst.status === "Foreclosed" ? 0 : (activeInst.balance !== undefined ? activeInst.balance : Math.max(0, activeInst.emi - (activeInst.amountPaid || 0))))}</span>
                        </div>
                      </div>

                      {/* Foreclosure Information Panel (only for foreclosed loans) */}
                      {isForeclosed && (
                        <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-4 space-y-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className="h-7 w-7 rounded-lg bg-purple-600 text-white flex items-center justify-center shrink-0">
                              <Lock className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="font-bold text-xs sm:text-sm text-purple-950">
                                The loan is foreclosed.
                              </p>
                              <p className="text-[11px] text-purple-800">
                                Remaining installments and operational balances have been permanently closed through vehicle foreclosure.
                              </p>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-purple-200/80 text-xs">
                            <div className="bg-white/90 p-2.5 rounded-lg border border-purple-100">
                              <span className="text-[10px] uppercase font-semibold text-slate-500 block">Foreclosure Date</span>
                              <span className="font-bold text-slate-900 mt-0.5 block">
                                {(() => {
                                  const fData = loanRecord?.foreclosure || {};
                                  const saleDetails = loanRecord?.vehicle?.saleDetails || loanRecord?.saleDetails || {};
                                  const fDate = fData.saleDate || fData.completedAt || loanRecord?.foreclosedDate || saleDetails.saleDate || loanRecord?.updatedAt;
                                  return fDate ? formatDate(fDate) : "—";
                                })()}
                              </span>
                            </div>
                            <div className="bg-white/90 p-2.5 rounded-lg border border-purple-100">
                              <span className="text-[10px] uppercase font-semibold text-slate-500 block">Vehicle Sale Amount</span>
                              <span className="font-bold text-slate-900 mt-0.5 block">
                                {(() => {
                                  const fData = loanRecord?.foreclosure || {};
                                  const saleDetails = loanRecord?.vehicle?.saleDetails || loanRecord?.saleDetails || {};
                                  const salePrice = Number(fData.salePrice || saleDetails.salePrice || saleDetails.saleAmount || 0);
                                  return formatCurrency(salePrice);
                                })()}
                              </span>
                            </div>
                            <div className="bg-white/90 p-2.5 rounded-lg border border-purple-100">
                              <span className="text-[10px] uppercase font-semibold text-slate-500 block">Result</span>
                              <span className="font-bold mt-0.5 block">
                                {(() => {
                                  const fData = loanRecord?.foreclosure || {};
                                  const calc = fData.finalizedCalculation || {};
                                  const saleDetails = loanRecord?.vehicle?.saleDetails || loanRecord?.saleDetails || {};
                                  const salePrice = Number(fData.salePrice || saleDetails.salePrice || saleDetails.saleAmount || 0);
                                  const profitLoss = calc.profitLoss !== undefined
                                    ? Number(calc.profitLoss)
                                    : ((fData.profitLoss !== undefined)
                                      ? Number(fData.profitLoss)
                                      : (salePrice - Number(calc.totalForeclosureCost || 0)));
                                  const isProfit = profitLoss > 0;
                                  const isLoss = profitLoss < 0;
                                  return (
                                    <span className={isProfit ? "text-emerald-700" : isLoss ? "text-rose-700" : "text-slate-800"}>
                                      {isProfit ? `Profit ${formatCurrency(profitLoss)}` : isLoss ? `Loss ${formatCurrency(Math.abs(profitLoss))}` : "₹0"}
                                    </span>
                                  );
                                })()}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {matchingCollections.length === 0 ? (
                        !isForeclosed && (
                          <div className="py-8 text-center text-xs text-slate-400">
                            No collections recorded specifically for this installment yet.
                          </div>
                        )
                      ) : (
                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                          <table className="min-w-full divide-y divide-slate-200 text-xs sm:text-sm">
                            <thead className="bg-slate-50/80">
                              <tr>
                                <th className="px-3 py-2.5 text-left font-bold text-slate-700">Receipt ID</th>
                                <th className="px-3 py-2.5 text-left font-bold text-slate-700">Date &amp; Time</th>
                                <th className="px-3 py-2.5 text-right font-bold text-slate-700">Amount</th>
                                <th className="px-3 py-2.5 text-right font-bold text-slate-700">Principal</th>
                                <th className="px-3 py-2.5 text-right font-bold text-slate-700">Interest</th>
                                <th className="px-3 py-2.5 text-center font-bold text-slate-700">Mode</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                              {matchingCollections.map((col) => {
                                const { date, time } = formatDateTime(col.date, col);
                                return (
                                  <tr key={col.id} className="hover:bg-slate-50/70 transition-colors">
                                    <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-900">
                                      {col.id}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                                      <span className="font-semibold text-slate-800">{date}</span>
                                      {time && <span className="text-[11px] text-slate-400 ml-1.5">{time}</span>}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-bold text-emerald-800">
                                      {formatCurrency(col.amount)}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-slate-600">
                                      {col.principal !== undefined ? formatCurrency(col.principal) : "—"}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-slate-600">
                                      {col.interest !== undefined ? formatCurrency(col.interest) : "—"}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2.5 text-center">
                                      <span className="inline-flex px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-semibold">
                                        {col.mode || "Cash"}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Modal Footer */}
              <div className="px-5 py-3.5 bg-slate-50/80 border-t border-slate-100 flex justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedInstallmentForHistory(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shadow-2xs"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Penalty Cancellation Confirmation Modal */}
        {penaltyToCancel && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 animate-scale-in">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 border border-red-200">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Cancel Penalty</h3>
                  <p className="text-xs text-slate-500">Installment {penaltyToCancel.installmentNumber} · {formatCurrency(penaltyToCancel.calculatedAmount)}</p>
                </div>
              </div>

              <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                Are you sure you want to cancel this penalty? Once cancelled, it will be <strong>permanently cancelled</strong> and will not be recalculated or collected.
              </p>

              <div className="mb-5">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Cancellation Reason
                </label>
                <input
                  type="text"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Waived by management"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-[#006052] focus:ring-1 focus:ring-[#006052]"
                />
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setPenaltyToCancel(null);
                    setCancelReason("");
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={penaltyBusy}
                  onClick={() =>
                    runPenaltyAction(async () => {
                      await cancelPenaltyRecord(
                        { ...penaltyToCancel, loanId: penaltyToCancel.loanId || effectiveLoanId },
                        cancelReason || "Cancelled by Administrator"
                      );
                      setPenaltyToCancel(null);
                      setCancelReason("");
                    })
                  }
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors shadow-2xs"
                >
                  Confirm Cancellation
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Midway Closure Modal with preselected current loan */}
        <MidwayClosureModal
          isOpen={showMidwayModal}
          onClose={() => setShowMidwayModal(false)}
          preselectedLoanRecord={loanRecord}
          onSuccess={() => {
            setRefreshKey((k) => k + 1);
          }}
        />
      </div>
    </div>
  );
}
