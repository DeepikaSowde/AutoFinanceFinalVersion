import React, { useState, useMemo, useEffect } from 'react';
import { DATA_CHANGED_EVENT } from '../../services/api';
import { loadCustomerEntries } from '../../services/customerApi';
import { loadPayments } from '../../services/collectionApi';
import { 
  ArrowLeft, Edit, Search, FileText, Coins, Landmark, 
  Clock, CheckCircle2, AlertTriangle, Car, Shield, Activity, Users, CreditCard,
  FileCheck, FileText as FileTextIcon, Download, X, UserCheck, Wallet, ShieldCheck
} from 'lucide-react';
import RepaymentScheduleTable, { generateSchedule, computeEffectiveSchedule } from '../../components/RepaymentScheduleTable';
import { calculateRepayment } from '../../components/Loantab';
import { calculateLoanOutstanding } from '../../utils/loanCalculations';
import { getPaymentInstallmentLabel } from '../../utils/paymentInstallmentUtils';
import { getVehicleDisplayImage } from '../../utils/vehicleImageHelper';
import { getEffectiveVehicleStatus } from '../../utils/vehicleStatusHelper';

export { getPaymentInstallmentLabel };

import { formatDate, formatDateTime } from '../../utils/dateUtils';

const formatCurrency = (value) => `₹${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;

const FieldValue = ({ label, value }) => (
  <div>
    <p className="text-xs text-slate-500 mb-0.5">{label}</p>
    <p className="font-medium text-slate-900">{value || 'Not provided'}</p>
  </div>
);

const StatusBadge = ({ status }) => {
  const styles = {
    Active: "bg-emerald-100 text-emerald-700 border-emerald-200",
    Closed: "bg-slate-100 text-slate-600 border-slate-200",
    "Midway Closed": "bg-amber-100 text-amber-800 border-amber-300",
    Overdue: "bg-red-100 text-red-700 border-red-200",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider border ${styles[status] || styles.Closed}`}>
      {status || 'Unknown'}
    </span>
  );
};

const PhotoPlaceholder = ({ src, icon: Icon, alt, className = "h-16 w-16 rounded-full" }) => {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  return (
    <>
      <div 
        onClick={() => setIsPreviewOpen(true)}
        className={`relative flex items-center justify-center bg-slate-100 border border-slate-200 text-slate-400 shrink-0 cursor-pointer overflow-hidden hover:ring-2 hover:ring-emerald-500 hover:ring-offset-2 transition-all ${className}`}
      >
        {src && !hasError ? (
          <img src={src} alt={alt} onError={() => setHasError(true)} className="h-full w-full object-cover" />
        ) : (
          <Icon className="h-1/2 w-1/2 opacity-50" />
        )}
      </div>

      {isPreviewOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/80 p-4 sm:p-6 backdrop-blur-sm" onClick={() => setIsPreviewOpen(false)}>
          <div className="relative flex flex-col items-center max-w-4xl max-h-[90vh] w-full" onClick={e => e.stopPropagation()}>
            <button 
              onClick={() => setIsPreviewOpen(false)}
              className="absolute -top-12 right-0 rounded-full p-2 text-white hover:bg-white/20 transition-colors"
              aria-label="Close preview"
            >
              <X className="h-6 w-6" />
            </button>
            
            {src ? (
              <>
                <img src={src} alt={alt} className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl bg-slate-900" />
                <div className="mt-6 flex justify-center">
                  <a 
                    href={src} 
                    download={`${alt.replace(/\s+/g, '_')}.jpg`}
                    className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-slate-900 shadow-lg hover:bg-slate-100 transition-colors"
                  >
                    <Download className="h-4 w-4" /> Download Image
                  </a>
                </div>
              </>
            ) : (
              <div className="flex h-64 w-64 items-center justify-center rounded-2xl bg-white shadow-2xl">
                <Icon className="h-24 w-24 text-slate-300" />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

const TABS = [
  { id: 'overview', label: 'Personal Info' },
  { id: 'vehicle', label: 'Vehicle' },
  { id: 'loan', label: 'Loan & Schedule' },
  { id: 'guarantor', label: 'Guarantor' },
  { id: 'payments', label: 'Payments' },
  { id: 'activity', label: 'Activity' }
];

export const extractRecordCustomerId = (record, index) => {
  if (!record || typeof record !== 'object') return null;
  const rawId = record.customerId || record.customer?.customerId;
  if (rawId && typeof rawId === 'string' && rawId.trim()) {
    return rawId.trim();
  }
  const mobile = record.customer?.mobile || record.mobile;
  if (mobile && typeof mobile === 'string' && mobile.trim().length >= 5) {
    const cleanMobile = mobile.trim();
    if (!/^0+$/.test(cleanMobile.slice(-5))) {
      return `CUS-${cleanMobile.slice(-5)}`;
    }
  }
  if (index !== undefined && index !== null && index >= 0) {
    return `CUS-${String(index + 1).padStart(3, "0")}`;
  }
  return null;
};

export const extractRecordLoanId = (record, index) => {
  if (!record || typeof record !== 'object') return null;
  const rawLoanId = record.loanId || record.loan?.loanId;
  if (rawLoanId && typeof rawLoanId === 'string' && rawLoanId.trim()) {
    return rawLoanId.trim();
  }
  if (index !== undefined && index !== null && index >= 0) {
    return `LN-${String(index + 1).padStart(3, "0")}`;
  }
  return null;
};

export default function CustomerView({ customerId, initialLoanId, onBack, backLabel = "Back to Customers" }) {
  const [activeTab, setActiveTab] = useState(initialLoanId ? 'loan' : 'overview');

  const [allData, setAllData] = useState([]);
  const [allPayments, setAllPayments] = useState([]);
  const [loadError, setLoadError] = useState("");

  // Loans and payments come from the API, and reload after any save (e.g. a
  // payment recorded from the loan details).
  useEffect(() => {
    let active = true;
    const load = () =>
      Promise.all([loadCustomerEntries(), loadPayments()])
        .then(([entries, payments]) => {
          if (!active) return;
          setAllData(entries);
          setAllPayments(payments);
          setLoadError("");
        })
        .catch((error) => active && setLoadError(error.message));

    load();
    window.addEventListener(DATA_CHANGED_EVENT, load);
    return () => {
      active = false;
      window.removeEventListener(DATA_CHANGED_EVENT, load);
    };
  }, [customerId]);

  const customerLoans = useMemo(() => {
    if (!allData || allData.length === 0) {
      return [];
    }

    // 1. Identify targeted loan record if initialLoanId is provided
    let targetRecord = null;
    let targetIndex = -1;
    if (initialLoanId && typeof initialLoanId === "string" && initialLoanId.trim()) {
      const cleanInitialLoanId = initialLoanId.trim().toLowerCase();
      targetIndex = allData.findIndex((d, idx) => {
        const lId = extractRecordLoanId(d, idx);
        return lId && lId.toLowerCase() === cleanInitialLoanId;
      });
      if (targetIndex >= 0) {
        targetRecord = allData[targetIndex];
      }
    }

    // 2. Identify targeted customer record if customerId is provided but initialLoanId was not matched
    if (!targetRecord && customerId && typeof customerId === "string" && customerId.trim()) {
      const cleanCId = customerId.trim().toLowerCase();
      targetIndex = allData.findIndex((d, idx) => {
        const cId = extractRecordCustomerId(d, idx);
        return cId && cId.toLowerCase() === cleanCId;
      });
      if (targetIndex >= 0) {
        targetRecord = allData[targetIndex];
      }
    }

    if (!targetRecord && !customerId) {
      return [];
    }

    const effectiveTargetCId = targetRecord
      ? (extractRecordCustomerId(targetRecord, targetIndex) || customerId)
      : customerId;
    const targetCIdLower = effectiveTargetCId ? effectiveTargetCId.trim().toLowerCase() : "";
    const targetName = targetRecord?.customer?.name?.trim().toLowerCase();
    const targetAadhaar = targetRecord?.customer?.aadhaarNo?.trim();
    const targetMobile = targetRecord?.customer?.mobile?.trim();

    // Map all records with consistent loanId and customerId
    const mappedRecords = allData.map((d, index) => {
      const lId = extractRecordLoanId(d, index) || `LN-${String(index + 1).padStart(3, "0")}`;
      const cId = extractRecordCustomerId(d, index) || effectiveTargetCId;
      return { d, index, lId, cId };
    });

    return mappedRecords
      .filter(({ d, lId, cId }) => {
        // Targeted loan record always belongs
        if (targetRecord && d === targetRecord) return true;
        if (initialLoanId && lId && lId.toLowerCase() === initialLoanId.trim().toLowerCase()) return true;

        if (!targetCIdLower) return false;

        // Verify customer ID match
        const cIdLower = (cId || "").trim().toLowerCase();
        if (!cIdLower || cIdLower !== targetCIdLower) {
          return false;
        }

        // Cross-customer collision check:
        // A genuine re-loan MUST belong to the SAME customer, not a different person
        const dName = d.customer?.name?.trim().toLowerCase();
        if (targetName && dName && targetName !== dName) {
          return false;
        }

        const dAadhaar = d.customer?.aadhaarNo?.trim();
        if (targetAadhaar && dAadhaar && targetAadhaar !== dAadhaar) {
          return false;
        }

        const dMobile = d.customer?.mobile?.trim();
        if (targetMobile && dMobile && targetMobile.length >= 10 && dMobile.length >= 10 && targetMobile !== dMobile) {
          return false;
        }

        if (targetCIdLower === "cus-000" && targetName && dName !== targetName) {
          return false;
        }

        return true;
      })
      .map(({ d, lId, cId }) => {
        const loanCalc = calculateLoanOutstanding(d, allPayments);
        const loanAmount = loanCalc.principal;
        const outstandingAmount = loanCalc.outstandingAmount;
        const isMidway = Boolean(
          d.isMidwayClosed ||
          d.midwayClosure ||
          String(d.status || '').toLowerCase() === 'midway closed' ||
          String(d.closureType || '').toLowerCase() === 'midway closure' ||
          loanCalc.status === 'Midway Closed'
        );
        const status = isMidway ? "Midway Closed" : (d.status || loanCalc.status);
        const totalPaidForLoan = loanCalc.totalRepaid;

        return {
          ...d,
          customerId: cId,
          loanAmount,
          outstandingAmount,
          loanId: lId,
          status,
          totalPaidForLoan,
          loanCalculations: loanCalc,
        };
      });
  }, [allData, allPayments, customerId, initialLoanId]);

  const [selectedLoanId, setSelectedLoanId] = useState(initialLoanId || null);

  // Synchronize selected loan when initialLoanId, customerLoans, or selectedLoanId change
  useEffect(() => {
    if (!customerLoans || customerLoans.length === 0) {
      setSelectedLoanId(null);
      return;
    }
    // 1. If an initialLoanId is provided and exists in this customer's loans, prioritize it
    if (initialLoanId && customerLoans.some(l => l.loanId?.toLowerCase() === initialLoanId.trim().toLowerCase())) {
      const match = customerLoans.find(l => l.loanId?.toLowerCase() === initialLoanId.trim().toLowerCase());
      setSelectedLoanId(match.loanId);
      return;
    }
    // 2. If current selectedLoanId belongs to this customer's loans, retain it
    if (selectedLoanId && customerLoans.some(l => l.loanId === selectedLoanId)) {
      return;
    }
    // 3. Otherwise default to the first loan of this customer
    setSelectedLoanId(customerLoans[0].loanId);
  }, [customerId, initialLoanId, customerLoans, selectedLoanId]);

  // Guaranteed active selected loan ID (strictly belongs to the selected customer's loans)
  const activeSelectedLoanId = useMemo(() => {
    if (!customerLoans || customerLoans.length === 0) return null;
    if (selectedLoanId && customerLoans.some(l => l.loanId === selectedLoanId)) {
      return selectedLoanId;
    }
    if (initialLoanId) {
      const match = customerLoans.find(l => l.loanId?.toLowerCase() === initialLoanId.trim().toLowerCase());
      if (match) return match.loanId;
    }
    return customerLoans[0].loanId;
  }, [customerLoans, selectedLoanId, initialLoanId]);

  const selectedLoanData = useMemo(() => {
    if (!customerLoans || customerLoans.length === 0) return {};
    return customerLoans.find(l => l.loanId === activeSelectedLoanId) || customerLoans[0] || {};
  }, [customerLoans, activeSelectedLoanId]);

  const primaryRecord = useMemo(() => {
    if (customerLoans.length > 0) {
      return selectedLoanData;
    }
    if (!customerId) return {};
    const targetCId = customerId.trim().toLowerCase();
    return allData.find((d, idx) => {
      const cId = extractRecordCustomerId(d, idx);
      return cId && cId.toLowerCase() === targetCId;
    }) || {};
  }, [customerLoans, selectedLoanData, allData, customerId]);

  const primaryCustomer = selectedLoanData.customer || primaryRecord.customer || {};
  const mobile = primaryCustomer.mobile ? `${primaryCustomer.countryCode || ''} ${primaryCustomer.mobile}` : '—';
  const customerSince = primaryCustomer.applicationDate || new Date().toISOString().slice(0, 10);
  const displayCustomerId = selectedLoanData.customerId || primaryRecord.customerId || customerId || '—';

  const totalLoans = customerLoans.length;
  const activeLoans = customerLoans.filter(l => l.status === 'Active' || l.status === 'Overdue').length;
  const totalOutstanding = customerLoans.reduce((sum, l) => sum + (Number(l.outstandingAmount) || 0), 0);
  const totalOverdue = customerLoans.filter(l => l.status === 'Overdue').reduce((sum, l) => sum + (Number(l.overdueAmount) || 0), 0);
  
  const loanSummary = useMemo(() => {
    if (!selectedLoanData.loan) return null;
    return calculateRepayment({
      principal: selectedLoanData.loanAmount,
      interestRate: selectedLoanData.loan.interestRate,
      tenure: selectedLoanData.loan.tenure,
      tenureUnit: selectedLoanData.loan.tenureUnit,
      paymentFrequency: selectedLoanData.loan.paymentFrequency,
      interestType: selectedLoanData.loan.interestType,
      repaymentMethod: selectedLoanData.loan.repaymentMethod,
    });
  }, [selectedLoanData]);

  // Selected loan payments for the Payments tab and progress
  const selectedLoanPayments = useMemo(() => {
    if (!activeSelectedLoanId) return [];
    const targetLoanClean = activeSelectedLoanId.trim().toLowerCase();
    const targetCustClean = customerId ? customerId.trim().toLowerCase() : "";
    return allPayments.filter(
      p => {
        if (!p) return false;
        const pLoan = (p.loanId || "").trim().toLowerCase();
        const pCust = (p.customerId || "").trim().toLowerCase();
        const matchesLoan = pLoan ? pLoan === targetLoanClean : (targetCustClean && pCust === targetCustClean);
        const status = (p.status || "").toLowerCase();
        return matchesLoan && status !== "failed" && status !== "cancelled" && status !== "reversed";
      }
    );
  }, [allPayments, activeSelectedLoanId, customerId]);

  // Base schedule for the selected loan
  const selectedLoanBaseSchedule = useMemo(() => {
    if (selectedLoanData?.repaymentSchedule && selectedLoanData.repaymentSchedule.length > 0) {
      return selectedLoanData.repaymentSchedule;
    }
    if (selectedLoanData?.loanCalculations?.effectiveSchedule && selectedLoanData.loanCalculations.effectiveSchedule.length > 0) {
      return selectedLoanData.loanCalculations.effectiveSchedule;
    }
    if (selectedLoanData?.loanAmount && selectedLoanData.loan?.interestRate && selectedLoanData.loan?.tenure) {
      return generateSchedule({
        loanAmount: selectedLoanData.loanAmount,
        interestRate: selectedLoanData.loan.interestRate,
        tenure: selectedLoanData.loan.tenure,
        tenureUnit: selectedLoanData.loan.tenureUnit || "Months",
        paymentFrequency: selectedLoanData.loan.paymentFrequency || "Monthly",
        interestType: selectedLoanData.loan.interestType || "Reducing Balance",
        repaymentMethod: selectedLoanData.loan.repaymentMethod || "EMI",
        firstDueDate: selectedLoanData.loan.firstDueDate,
      });
    }
    return [];
  }, [selectedLoanData]);

  // Effective authoritative schedule reconciled with actual recorded transactions
  const effectiveCustomerLoanSchedule = useMemo(() => {
    const isMidway = Boolean(
      selectedLoanData?.isMidwayClosed ||
      selectedLoanData?.midwayClosure ||
      String(selectedLoanData?.status || "").toLowerCase() === "midway closed" ||
      String(selectedLoanData?.closureType || "").toLowerCase() === "midway closure"
    );

    const computed = computeEffectiveSchedule(selectedLoanBaseSchedule, selectedLoanPayments);

    if (!isMidway) {
      return computed;
    }

    // For Midway Closed loans:
    // 1. Installments paid normally before midway closure retain Paid status & normal styling
    // 2. From the midway closure installment through remaining installments until tenure ends,
    //    mark as Paid with light orange background, balance 0, and no Partial status.
    let closureStartNum = null;
    const mc = selectedLoanData?.midwayClosure;
    if (mc?.installmentNumber && !isNaN(Number(mc.installmentNumber))) {
      closureStartNum = Number(mc.installmentNumber);
    } else if (mc?.closureInstallment && !isNaN(Number(mc.closureInstallment))) {
      closureStartNum = Number(mc.closureInstallment);
    } else if (mc?.settlementInstallment && !isNaN(Number(mc.settlementInstallment))) {
      closureStartNum = Number(mc.settlementInstallment);
    } else if (mc?.instalmentsRange) {
      const match = String(mc.instalmentsRange).match(/#(\d+)/);
      if (match) closureStartNum = Number(match[1]);
    }

    if (closureStartNum === null) {
      const midwayP = selectedLoanPayments.find(
        (p) => p.isMidwayClosure || String(p.remarks || "").toLowerCase().includes("midway closure")
      );
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
      const firstMidway = computed.find(
        (s) => Boolean(s.isMidwayClosed || s.closureAdjusted || s.status === "Midway Closed")
      );
      if (firstMidway && Number(firstMidway.installmentNumber) > 0) {
        closureStartNum = Number(firstMidway.installmentNumber);
      }
    }

    if (closureStartNum === null) {
      const firstUnpaid = selectedLoanBaseSchedule.find((s) => s.status !== "Paid" && s.status !== "Collected");
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
  }, [selectedLoanBaseSchedule, selectedLoanPayments, selectedLoanData]);

  const totalPaidForSelectedLoan = useMemo(() => {
    const fromPayments = selectedLoanPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const fromSchedule = effectiveCustomerLoanSchedule.reduce((sum, s) => sum + (Number(s.amountPaid) || 0), 0);
    return selectedLoanPayments.length > 0 ? fromPayments : fromSchedule;
  }, [selectedLoanPayments, effectiveCustomerLoanSchedule]);

  const selectedGuarantor = selectedLoanData?.guarantor || {};
  const hasGuarantorDetails = Boolean(
    selectedGuarantor.required === 'Yes' ||
    selectedGuarantor.guarantorId ||
    selectedGuarantor.id ||
    selectedGuarantor.fullName ||
    selectedGuarantor.name ||
    selectedGuarantor.phone ||
    selectedGuarantor.mobile ||
    selectedGuarantor.address
  );

  return (
    <div className="bg-slate-50">
      {loadError && (
        <div role="alert" className="mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-6 lg:mx-8">
          Could not load this customer: {loadError}
        </div>
      )}
      
      <div className="bg-white border-b border-slate-200 px-4 py-4 sm:px-6 lg:px-8">
        <button 
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> {backLabel}
        </button>
        
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <PhotoPlaceholder 
              src={primaryCustomer.photoFile || null} 
              icon={Users} 
              alt={primaryCustomer.name || 'Customer'} 
              className="h-16 w-16 rounded-full"
            />
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-slate-900">{primaryCustomer.name || 'Unknown Customer'}</h1>
                <StatusBadge status="Active" />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 font-medium">
                <div className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> {displayCustomerId || customerId}</div>
                <div className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> {mobile}</div>
                <div className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Customer since {formatDate(customerSince)}</div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 shadow-sm hover:bg-emerald-50 hover:border-emerald-200">
              <Edit className="h-4 w-4" /> View / Edit
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 sm:px-6 lg:px-8 space-y-6 w-full mx-auto">
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center gap-4">
            <div className="bg-emerald-50 text-emerald-600 p-2.5 rounded-lg shrink-0"><FileText className="h-4 w-4" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-0.5 whitespace-normal break-words leading-tight">Total Loans</p>
              <p className="text-xl font-bold text-slate-900 whitespace-normal break-words leading-tight">{totalLoans}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center gap-4">
            <div className="bg-emerald-50 text-emerald-600 p-2.5 rounded-lg shrink-0"><Coins className="h-4 w-4" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-0.5 whitespace-normal break-words leading-tight">Active Loans</p>
              <p className="text-xl font-bold text-slate-900 whitespace-normal break-words leading-tight">{activeLoans}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center gap-4">
            <div className="bg-emerald-50 text-emerald-600 p-2.5 rounded-lg shrink-0"><Landmark className="h-4 w-4" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-0.5 whitespace-normal break-words leading-tight">Total Outstanding</p>
              <p className="text-xl font-bold text-slate-900 whitespace-normal break-words leading-tight">{formatCurrency(totalOutstanding)}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center gap-4">
            <div className="bg-slate-50 text-slate-600 p-2.5 rounded-lg shrink-0"><Clock className="h-4 w-4" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-0.5 whitespace-normal break-words leading-tight">Total Overdue</p>
              <p className="text-xl font-bold text-slate-900 whitespace-normal break-words leading-tight">{formatCurrency(totalOverdue)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Loan Accounts</h2>
              <p className="text-xs text-slate-500 mt-0.5">View and manage customer's loan details. Select a loan to view specifics.</p>
            </div>
            <div className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-1 rounded-full">
              {customerLoans.length} Loan{customerLoans.length !== 1 ? 's' : ''}
            </div>
          </div>
          
          <div className="divide-y divide-slate-100">
            {customerLoans.map(loan => {
              const isSelected = activeSelectedLoanId === loan.loanId;
              const paid = loan.totalPaidForLoan || 0;
              const pct = loan.loanAmount > 0 ? Math.min(100, Math.round((paid / loan.loanAmount) * 100)) : 0;
              const pendingPct = Math.max(0, 100 - pct);

              return (
                <div 
                  key={loan.loanId} 
                  onClick={() => setSelectedLoanId(loan.loanId)}
                  className={`p-5 flex flex-col lg:flex-row lg:items-center gap-6 cursor-pointer transition-colors ${isSelected ? 'bg-emerald-50/40 ring-1 ring-inset ring-emerald-500/30' : 'hover:bg-slate-50'}`}
                >
                  <div className="flex items-center gap-4 lg:w-1/4">
                    <div className={`p-3 rounded-xl shrink-0 transition-colors ${isSelected ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
                      <Car className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{loan.loanId}</span>
                        <StatusBadge status={loan.status} />
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <p className="text-sm font-medium text-slate-700">{loan.vehicle?.brand} {loan.vehicle?.model}</p>
                        {(() => {
                          const vStat = getEffectiveVehicleStatus(loan);
                          const vStyle = vStat === 'Active' ? 'bg-[#2563EB] text-white' :
                                         vStat === 'Seized' ? 'bg-[#EA580C] text-white' :
                                         vStat === 'Sold' ? 'bg-[#64748B] text-white' :
                                         'bg-slate-500 text-white';
                          return (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${vStyle}`}>
                              {vStat}
                            </span>
                          );
                        })()}
                      </div>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><Car className="h-3 w-3"/> {loan.vehicle?.regNo || 'Unregistered'}</p>
                    </div>
                  </div>

                  <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div>
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">Loan Amount</p>
                      <p className="font-bold text-slate-900 mt-0.5">{formatCurrency(loan.loanAmount)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">Outstanding</p>
                      <p className="font-bold text-slate-900 mt-0.5">{formatCurrency(loan.outstandingAmount)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">Interest</p>
                      <p className="font-bold text-slate-900 mt-0.5">{loan.loan?.interestRate ? `${loan.loan.interestRate}%` : '—'} <span className="text-[10px] font-normal text-slate-500">({loan.loan?.interestType === 'Reducing Balance EMI-Based' ? 'Red. EMI' : loan.loan?.interestType === 'Reducing Balance Principal-Based' ? 'Red. Prin' : 'Flat'})</span></p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">Next Due Date</p>
                      <p className="font-bold text-slate-900 mt-0.5">{formatDate(loan.loan?.firstDueDate || loan.nextDueDate)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">Overdue</p>
                      <p className="font-bold text-red-600 mt-0.5">{formatCurrency(loan.overdueAmount || 0)}</p>
                    </div>
                    <div className="col-span-2 md:col-span-5 mt-1">
                      <div className="flex justify-between text-[10px] font-semibold mb-1">
                        <span className="text-emerald-700">{pct}% Paid</span>
                        <span className="text-slate-500">{pendingPct}% Pending</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {customerLoans.length === 0 && (
              <div className="p-8 text-center text-slate-500">No loans found for this customer.</div>
            )}
          </div>
        </div>

        <div className="mt-8 border-b border-slate-200">
          <nav className="-mb-px flex space-x-6 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap py-3 px-1 border-b-2 font-semibold text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="py-4">
          
          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100">
                  <div className="flex items-center gap-2 font-bold text-slate-900">
                    <Users className="h-5 w-5 text-[#087F5B]" /> General Information
                  </div>
                </div>
                <div className="p-4 sm:p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-4">
                    <FieldValue label="Customer Name" value={selectedLoanData.customer?.name} />
                    <FieldValue label="Application Date" value={formatDate(selectedLoanData.customer?.applicationDate)} />
                    <FieldValue label="Mobile Number" value={selectedLoanData.customer?.mobile ? `${selectedLoanData.customer.countryCode || ''} ${selectedLoanData.customer.mobile}` : null} />
                    <FieldValue label="PIN Code" value={selectedLoanData.customer?.pincode} />
                    <FieldValue label="Area" value={selectedLoanData.customer?.area} />
                    <FieldValue label="Landmark" value={selectedLoanData.customer?.landmark} />
                    <div className="col-span-1 sm:col-span-2 border-t border-slate-100 pt-4 mt-1">
                      <FieldValue label="Full Address" value={[selectedLoanData.customer?.address, selectedLoanData.customer?.area, selectedLoanData.customer?.landmark, selectedLoanData.customer?.pincode].filter(Boolean).join(', ')} />
                    </div>
                    <div className="col-span-1 sm:col-span-2 border-t border-slate-100 pt-4 mt-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FieldValue
                        label="Referred By"
                        value={
                          selectedLoanData.referral?.fullName ||
                          selectedLoanData.referral?.name ||
                          selectedLoanData.loan?.referredBy ||
                          selectedLoanData.customer?.referredBy
                        }
                      />
                      {(selectedLoanData.referral?.referralId || selectedLoanData.referral?.id) && (
                        <FieldValue
                          label="Referral ID"
                          value={selectedLoanData.referral.referralId || selectedLoanData.referral.id}
                        />
                      )}
                      {selectedLoanData.referral?.commissionAmount && (
                        <FieldValue
                          label="Referral Commission"
                          value={`₹${Number(selectedLoanData.referral.commissionAmount).toLocaleString('en-IN')}${
                            selectedLoanData.referral.commissionPercentage
                              ? ` (${selectedLoanData.referral.commissionPercentage}%)`
                              : ''
                          } — ${selectedLoanData.referral.payCommission ? 'Paid' : 'Pending'}`}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100">
                  <div className="flex items-center gap-2 font-bold text-slate-900">
                    <Shield className="h-5 w-5 text-[#087F5B]" /> KYC & Identity Documents
                  </div>
                </div>
                <div className="p-4 sm:p-5 space-y-4">
                  {['aadhaar', 'pan', 'dl', 'voter', 'otherKyc'].map(kycType => {
                    const noKey = `${kycType}No`;
                    const fileKey = `${kycType}File`;
                    const hasValue = !!selectedLoanData.customer?.[noKey];
                    const hasFile = !!selectedLoanData.customer?.[fileKey];
                    
                    if (!hasValue && !hasFile) return null;
                    
                    const labels = { aadhaar: 'Aadhaar Number', pan: 'PAN Number', dl: 'Driving Licence Number', voter: 'Voter ID Number', otherKyc: 'Other KYC' };
                    
                    return (
                      <div key={kycType} className="flex items-center justify-between border-b border-slate-100 pb-4 last:border-0 last:pb-0">
                        <div className="flex items-center gap-4">
                          {hasFile ? (
                            <PhotoPlaceholder 
                              src={selectedLoanData.customer[fileKey]} 
                              icon={FileCheck} 
                              alt={labels[kycType]} 
                              className="h-10 w-14 rounded bg-slate-50 border border-slate-200 shadow-sm"
                            />
                          ) : (
                            <div className="flex h-10 w-14 items-center justify-center rounded bg-slate-50 border border-slate-100 text-slate-300">
                              <FileTextIcon className="h-5 w-5" />
                            </div>
                          )}
                          <div>
                            <p className="font-semibold text-slate-900">{labels[kycType]}</p>
                            <p className="text-sm text-slate-500 mt-0.5">{selectedLoanData.customer[noKey] || 'Not provided'}</p>
                          </div>
                        </div>
                        <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${hasFile ? 'bg-emerald-50 text-[#087F5B]' : 'bg-slate-100 text-slate-600'}`}>
                          {hasFile ? 'Uploaded' : 'No Document'}
                        </span>
                      </div>
                    );
                  })}
                  {!['aadhaar', 'pan', 'dl', 'voter', 'otherKyc'].some(k => selectedLoanData.customer?.[`${k}No`] || selectedLoanData.customer?.[`${k}File`]) && (
                    <div className="text-slate-500 text-sm">No KYC documents uploaded.</div>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* LOAN & SCHEDULE TAB */}
          {activeTab === 'loan' && (
            <div className="space-y-6">
              {selectedLoanData.loan ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Loan Summary */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="px-5 py-3 border-b border-slate-100 font-bold text-slate-900 flex items-center justify-between">
                        Loan Summary
                      </div>
                      <div className="p-5 space-y-4">
                        <div className="flex justify-between border-b border-slate-100 pb-2">
                          <span className="text-sm text-slate-500">Loan ID</span>
                          <span className="text-sm font-semibold text-slate-900">{activeSelectedLoanId || '—'}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-2">
                          <span className="text-sm text-slate-500">Loan Status</span>
                          <StatusBadge status={selectedLoanData.status} />
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-2">
                          <span className="text-sm text-slate-500">Application Date</span>
                          <span className="text-sm font-semibold text-slate-900">{formatDate(selectedLoanData.customer?.applicationDate)}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-2">
                          <span className="text-sm text-slate-500">Loan Amount</span>
                          <span className="text-sm font-semibold text-slate-900">{formatCurrency(selectedLoanData.loanAmount)}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-2">
                          <span className="text-sm text-slate-500">Outstanding Principal</span>
                          <span className="text-sm font-semibold text-slate-900">{formatCurrency(selectedLoanData.outstandingAmount)}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-2">
                          <span className="text-sm text-slate-500">Total Interest</span>
                          <span className="text-sm font-semibold text-slate-900">{loanSummary ? formatCurrency(loanSummary.totalInterest) : '—'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-slate-500">Total Repayment</span>
                          <span className="text-sm font-semibold text-emerald-700">{loanSummary ? formatCurrency(loanSummary.totalAmount) : '—'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Loan Terms */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="px-5 py-3 border-b border-slate-100 font-bold text-slate-900">
                        Loan Terms
                      </div>
                      <div className="p-5 space-y-4">
                        <div className="flex justify-between border-b border-slate-100 pb-2">
                          <span className="text-sm text-slate-500">Interest Type</span>
                          <span className="text-sm font-semibold text-slate-900">{selectedLoanData.loan.interestType || 'Flat'}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-2">
                          <span className="text-sm text-slate-500">Interest Rate</span>
                          <span className="text-sm font-semibold text-slate-900">{selectedLoanData.loan.interestRate ? `${selectedLoanData.loan.interestRate}%` : '—'}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-2">
                          <span className="text-sm text-slate-500">Repayment Frequency</span>
                          <span className="text-sm font-semibold text-slate-900">{selectedLoanData.loan.paymentFrequency || 'Monthly'}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-2">
                          <span className="text-sm text-slate-500">Original Tenure</span>
                          <span className="text-sm font-semibold text-slate-900">{selectedLoanData.loan.tenure} {selectedLoanData.loan.tenureUnit}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-2">
                          <span className="text-sm text-slate-500">Total Installments</span>
                          <span className="text-sm font-semibold text-slate-900">{loanSummary ? loanSummary.numberOfPayments : '—'}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-2">
                          <span className="text-sm text-slate-500">First Due Date</span>
                          <span className="text-sm font-semibold text-slate-900">{formatDate(selectedLoanData.loan.firstDueDate)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-slate-500">Expected Installment</span>
                          <span className="text-sm font-semibold text-emerald-700">{loanSummary ? formatCurrency(loanSummary.emiAmount) : '—'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Repayment Progress */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                      <div className="px-5 py-3 border-b border-slate-100 font-bold text-slate-900 flex items-center justify-between">
                        <span>Repayment Progress</span>
                        {Boolean(selectedLoanData.isMidwayClosed || selectedLoanData.midwayClosure) && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                            Midway Settled
                          </span>
                        )}
                      </div>
                      <div className="p-5 flex-1 flex flex-col justify-center">
                        {(() => {
                          const isMidway = Boolean(selectedLoanData.isMidwayClosed || selectedLoanData.midwayClosure);
                          const totalRepay = effectiveCustomerLoanSchedule.length > 0
                            ? effectiveCustomerLoanSchedule.reduce((sum, s) => sum + Number(s.emi || 0), 0)
                            : (loanSummary?.totalAmount || selectedLoanData.loanAmount || 0);

                          const paid = totalPaidForSelectedLoan || 0;

                          // For midway-closed loans, distinguish regular paid installments vs closure-adjusted settlement
                          const regularPayments = selectedLoanPayments.filter((p) => !p.isMidwayClosure);
                          const midwayPayment = selectedLoanPayments.find((p) => p.isMidwayClosure);

                          const regularPaidAmount = isMidway
                            ? regularPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
                            : paid;
                          const closureAdjustedAmount = isMidway
                            ? (midwayPayment ? Number(midwayPayment.amount || 0) : Math.max(0, paid - regularPaidAmount))
                            : 0;

                          // Percentages out of totalRepay
                          const regularPct = totalRepay > 0 ? Math.min(100, Math.round((regularPaidAmount / totalRepay) * 100)) : 0;
                          const closurePct = totalRepay > 0
                            ? Math.min(100 - regularPct, Math.round((closureAdjustedAmount / totalRepay) * 100))
                            : 0;
                          const totalSettledPct = Math.min(100, regularPct + closurePct);
                          const remainingPct = Math.max(0, 100 - totalSettledPct);

                          const totalInstCount = effectiveCustomerLoanSchedule.length || loanSummary?.numberOfPayments || 0;
                          
                          // Count regular paid instalments vs closure-adjusted instalments
                          const regularPaidInstCount = effectiveCustomerLoanSchedule.filter((s) => {
                            const isPaid = s.status === 'Paid' || s.status === 'Collected';
                            return isPaid && !s.closureAdjusted;
                          }).length;

                          const closureAdjustedInstCount = effectiveCustomerLoanSchedule.filter(
                            (s) => s.closureAdjusted
                          ).length;

                          const pendingInst = Math.max(0, totalInstCount - regularPaidInstCount - closureAdjustedInstCount);

                          return (
                            <>
                              <div className="text-center mb-6">
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">
                                  {isMidway ? "Total Settled" : "Total Paid"}
                                </p>
                                <p className="text-3xl font-black text-emerald-700">{formatCurrency(paid)}</p>
                                <p className="text-xs text-slate-500 mt-1">out of {formatCurrency(totalRepay)}</p>
                              </div>
                              
                              <div className="space-y-2">
                                <div className="flex justify-between text-xs font-semibold">
                                  {isMidway ? (
                                    <>
                                      <div className="flex items-center gap-2">
                                        <span className="text-emerald-700 flex items-center gap-1">
                                          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500"></span>
                                          {regularPct}% Paid
                                        </span>
                                        <span className="text-amber-700 flex items-center gap-1">
                                          <span className="inline-block h-2 w-2 rounded-full bg-amber-500"></span>
                                          {closurePct}% Closure
                                        </span>
                                      </div>
                                      <span className="text-slate-500">{remainingPct}% Waived</span>
                                    </>
                                  ) : (
                                    <>
                                      <span className="text-emerald-700">{regularPct}% Paid</span>
                                      <span className="text-slate-500">{remainingPct}% Pending</span>
                                    </>
                                  )}
                                </div>

                                {/* Progress Bar */}
                                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex">
                                  {/* Already-paid regular portion in green */}
                                  <div
                                    className="h-full bg-emerald-500 transition-all duration-300"
                                    style={{ width: `${regularPct}%` }}
                                    title={`Regular Paid: ${regularPct}% (${formatCurrency(regularPaidAmount)})`}
                                  ></div>
                                  {/* Closure-adjusted portion in orange */}
                                  {isMidway && closurePct > 0 && (
                                    <div
                                      className="h-full bg-amber-500 transition-all duration-300"
                                      style={{ width: `${closurePct}%` }}
                                      title={`Midway Closure Adjusted: ${closurePct}% (${formatCurrency(closureAdjustedAmount)})`}
                                    ></div>
                                  )}
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4 mt-6">
                                <div className="bg-slate-50 rounded-lg p-3 text-center">
                                  <p className="text-[10px] text-slate-500 uppercase font-semibold">
                                    {isMidway ? "Paid Prior" : "Paid Inst."}
                                  </p>
                                  <p className="text-lg font-bold text-slate-900 mt-0.5">
                                    {regularPaidInstCount}
                                  </p>
                                </div>
                                <div className="bg-slate-50 rounded-lg p-3 text-center">
                                  <p className="text-[10px] text-slate-500 uppercase font-semibold">
                                    {isMidway ? "Closure Settled" : "Pending Inst."}
                                  </p>
                                  <p className="text-lg font-bold text-amber-700 mt-0.5">
                                    {isMidway ? closureAdjustedInstCount : pendingInst}
                                  </p>
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm mt-6">
                    <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2"><Clock className="h-5 w-5 text-emerald-600"/> Repayment Schedule</h3>
                    <RepaymentScheduleTable
                      schedule={effectiveCustomerLoanSchedule}
                      loanDetails={{
                        ...selectedLoanData.loan,
                        loanAmount: selectedLoanData.loanAmount,
                        loanId: activeSelectedLoanId || selectedLoanData.loanId || selectedLoanData.loan?.loanId,
                        customerId: displayCustomerId,
                        customerName: primaryCustomer.name,
                        paymentFrequency: selectedLoanData.loan?.paymentFrequency || selectedLoanData.paymentFrequency || 'Monthly',
                      }}
                    />
                  </div>
                </>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm text-center text-slate-500">
                  <AlertTriangle className="h-8 w-8 mx-auto mb-3 text-amber-500" />
                  <p className="font-medium">No loan terms available.</p>
                  <p className="text-sm mt-1">This application might be incomplete.</p>
                </div>
              )}
            </div>
          )}

          {/* VEHICLE TAB */}
          {activeTab === 'vehicle' && (
            <div className="space-y-6">
              
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100 flex items-center justify-between gap-2 font-bold text-slate-900">
                  <div className="flex items-center gap-2">
                    <Car className="h-5 w-5 text-[#087F5B]" /> Vehicle Information
                  </div>
                  {(() => {
                    const vStat = getEffectiveVehicleStatus(selectedLoanData);
                    const vStyle = vStat === 'Active' ? 'bg-[#2563EB] text-white' :
                                   vStat === 'Seized' ? 'bg-[#EA580C] text-white' :
                                   vStat === 'Sold' ? 'bg-[#64748B] text-white' :
                                   'bg-slate-500 text-white';
                    return (
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${vStyle}`}>
                        {vStat}
                      </span>
                    );
                  })()}
                </div>
                <div className="p-4 sm:p-5 flex flex-col md:flex-row gap-6 items-start">
                   <div className="shrink-0 w-full md:w-auto flex justify-center md:justify-start">
                     <PhotoPlaceholder 
                       src={getVehicleDisplayImage(selectedLoanData)} 
                       icon={Car} 
                       alt={`${selectedLoanData.vehicle?.brand || 'Vehicle'} ${selectedLoanData.vehicle?.model || ''}`} 
                       className="h-32 w-32 rounded-xl border-4 border-slate-50 shadow-sm"
                     />
                   </div>
                   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-y-4 gap-x-4 flex-1 w-full">
                      <FieldValue label="Vehicle Status" value={getEffectiveVehicleStatus(selectedLoanData)} />
                      <FieldValue label="Brand / Make" value={selectedLoanData.vehicle?.brand} />
                      <FieldValue label="Model" value={selectedLoanData.vehicle?.model} />
                      <FieldValue label="Variant" value={selectedLoanData.vehicle?.variant} />
                      <FieldValue label="Vehicle Type" value={selectedLoanData.vehicle?.type} />
                      <FieldValue label="Fuel Type" value={selectedLoanData.vehicle?.fuelType} />
                      <FieldValue label="Colour" value={selectedLoanData.vehicle?.colour} />
                      <FieldValue label="Year" value={selectedLoanData.vehicle?.year} />
                      <FieldValue label="Vehicle Amount" value={selectedLoanData.vehicle?.amount ? formatCurrency(selectedLoanData.vehicle.amount) : null} />
                      <FieldValue label="Hypothecation" value={selectedLoanData.vehicle?.hypothecation} />
                      <FieldValue label="Existing Financier" value={selectedLoanData.vehicle?.financier} />
                   </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100 flex items-center gap-2 font-bold text-slate-900">
                    <FileTextIcon className="h-5 w-5 text-[#087F5B]" /> Registration & Identification
                  </div>
                  <div className="p-4 sm:p-5">
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-4">
                        <FieldValue label="Registration No." value={selectedLoanData.vehicle?.regNo} />
                        <FieldValue label="Reg. Location (RTO)" value={selectedLoanData.vehicle?.rto} />
                        <FieldValue label="Reg. Date" value={formatDate(selectedLoanData.vehicle?.regDate)} />
                        <FieldValue label="Chassis Number" value={selectedLoanData.vehicle?.chassisNo} />
                        <div className="col-span-1 sm:col-span-2">
                          <FieldValue label="Engine Number" value={selectedLoanData.vehicle?.engineNo} />
                        </div>
                     </div>
                     <div className="border-t border-slate-100 pt-4 mt-5">
                       <div className="flex items-center justify-between">
                         <div className="flex items-center gap-4">
                           {selectedLoanData.vehicle?.rcFile ? (
                              <PhotoPlaceholder 
                                src={selectedLoanData.vehicle.rcFile} 
                                icon={FileCheck} 
                                alt="RC Document"
                                className="h-10 w-14 rounded bg-slate-50 border border-slate-200 shadow-sm"
                              />
                           ) : (
                              <div className="flex h-10 w-14 items-center justify-center rounded bg-slate-50 border border-slate-100 text-slate-300">
                                <FileTextIcon className="h-5 w-5" />
                              </div>
                           )}
                           <div>
                             <p className="font-semibold text-slate-900">RC Document</p>
                             <p className="text-sm text-slate-500 mt-0.5">Vehicle Registration</p>
                           </div>
                         </div>
                         <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${selectedLoanData.vehicle?.rcFile ? 'bg-emerald-50 text-[#087F5B]' : 'bg-slate-100 text-slate-600'}`}>
                           {selectedLoanData.vehicle?.rcFile ? 'Uploaded' : 'Not Provided'}
                         </span>
                       </div>
                     </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100 flex items-center gap-2 font-bold text-slate-900">
                    <FileCheck className="h-5 w-5 text-[#087F5B]" /> Insurance & Compliance
                  </div>
                  <div className="p-4 sm:p-5">
                    {(() => {
                      const v = selectedLoanData.vehicle || {};
                      
                      const isMeaningful = (val) => {
                        if (val === null || val === undefined || val === '') return false;
                        if (typeof val === 'string') {
                          const lower = val.toLowerCase().trim();
                          if (lower === 'no' || lower === 'n/a') return false;
                        }
                        return true;
                      };

                      const hasInsuranceData = 
                        isMeaningful(v.insuranceCompany) || 
                        isMeaningful(v.policyNo) || 
                        isMeaningful(v.insuranceExpiry) || 
                        isMeaningful(v.taxExpiry) || 
                        isMeaningful(v.financierEndorsement) || 
                        isMeaningful(v.nocStatus) || 
                        !!v.insuranceFile || 
                        !!v.nocFile;
                      
                      if (!hasInsuranceData) {
                        return (
                          <div className="flex flex-col items-center justify-center py-8 text-center">
                            <div className="bg-emerald-50 h-16 w-16 rounded-full flex items-center justify-center mb-4 border border-emerald-100 shadow-sm">
                              <ShieldCheck className="h-8 w-8 text-emerald-600" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-900">No Insurance Details Available</h3>
                            <p className="text-sm text-slate-500 mt-1 max-w-xs mx-auto">No insurance or compliance details have been provided for this vehicle.</p>
                          </div>
                        );
                      }

                      return (
                        <>
                           <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-4">
                              {v.insuranceCompany && (
                                <div className="col-span-1 sm:col-span-2">
                                  <FieldValue label="Insurance Company" value={v.insuranceCompany} />
                                </div>
                              )}
                              {v.policyNo && <FieldValue label="Policy Number" value={v.policyNo} />}
                              {v.insuranceExpiry && <FieldValue label="Insurance Expiry" value={formatDate(v.insuranceExpiry)} />}
                              {v.taxExpiry && <FieldValue label="Tax Expiry" value={formatDate(v.taxExpiry)} />}
                              {v.financierEndorsement && <FieldValue label="Fin. Endorsement" value={v.financierEndorsement} />}
                              {v.nocStatus && <FieldValue label="NOC Status" value={v.nocStatus} />}
                           </div>
                           
                           {(v.insuranceFile || v.nocFile) && (
                             <div className="border-t border-slate-100 pt-4 mt-5 flex flex-col gap-4">
                               {v.insuranceFile && (
                                 <div className="flex items-center justify-between">
                                   <div className="flex items-center gap-4">
                                      <PhotoPlaceholder 
                                        src={v.insuranceFile} 
                                        icon={FileCheck} 
                                        alt="Insurance Document"
                                        className="h-10 w-14 rounded bg-slate-50 border border-slate-200 shadow-sm"
                                      />
                                     <div>
                                       <p className="font-semibold text-slate-900">Insurance Policy</p>
                                     </div>
                                   </div>
                                   <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-emerald-50 text-[#087F5B]">
                                     Uploaded
                                   </span>
                                 </div>
                               )}
                               
                               {v.nocFile && (
                                 <div className="flex items-center justify-between">
                                   <div className="flex items-center gap-4">
                                      <PhotoPlaceholder 
                                        src={v.nocFile} 
                                        icon={FileCheck} 
                                        alt="NOC Document"
                                        className="h-10 w-14 rounded bg-slate-50 border border-slate-200 shadow-sm"
                                      />
                                     <div>
                                       <p className="font-semibold text-slate-900">NOC Document</p>
                                     </div>
                                   </div>
                                   <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-emerald-50 text-[#087F5B]">
                                     Uploaded
                                   </span>
                                 </div>
                               )}
                             </div>
                           )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
              
            </div>
          )}

          {/* GUARANTOR TAB */}
          {activeTab === 'guarantor' && (
             <>
               {hasGuarantorDetails ? (
                 <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden max-w-2xl">
                   <div className="px-5 py-4 border-b border-slate-100 font-bold text-slate-900">Guarantor Details</div>
                   <div className="p-5">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-6 gap-x-4">
                        <FieldValue label="Name" value={selectedGuarantor.fullName || selectedGuarantor.name} />
                        <FieldValue
                          label="Mobile Number"
                          value={(selectedGuarantor.phone || selectedGuarantor.mobile)
                            ? `${selectedGuarantor.countryCode || ''} ${selectedGuarantor.phone || selectedGuarantor.mobile}`
                            : null}
                        />
                        <FieldValue label="Relationship" value={selectedGuarantor.relationship} />
                        <div className="col-span-2 sm:col-span-3">
                          <FieldValue label="Address" value={selectedGuarantor.address} />
                        </div>
                      </div>
                   </div>
                 </div>
               ) : (
                 <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 flex flex-col items-center justify-center text-center">
                    <div className="bg-emerald-50 h-16 w-16 rounded-full flex items-center justify-center mb-4 border border-emerald-100 shadow-sm">
                      <UserCheck className="h-8 w-8 text-emerald-600" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">No guarantor details available.</h3>
                    <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">No guarantor information has been added to this loan yet.</p>
                 </div>
               )}
             </>
          )}

          {/* PAYMENTS TAB */}
          {activeTab === 'payments' && (
            selectedLoanPayments.length > 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900">Payment History</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Recorded collections for {activeSelectedLoanId || 'this loan'}</p>
                  </div>
                  <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full">
                    {selectedLoanPayments.length} payment{selectedLoanPayments.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Receipt / Ref</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Payment Date</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Installment No.</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-700">Amount Paid</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Method</th>
                        <th className="px-4 py-3 text-center font-semibold text-slate-700">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {selectedLoanPayments.map((p, idx) => {
                        const installmentLabel = getPaymentInstallmentLabel(p, selectedLoanBaseSchedule);
                        return (
                          <tr key={p.id || idx} className="hover:bg-slate-50 transition-colors">
                            <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                              {p.receiptNo || p.referenceNo || p.id || `RCP-${idx + 1}`}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                              {formatDateTime(p.paymentDate || p.date, p)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                              {installmentLabel === "Not Assigned" ? (
                                <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                                  Not Assigned
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-200/70">
                                  {installmentLabel}
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-emerald-800">
                              {formatCurrency(p.amount)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                              <span className="block">{p.paymentMethod || p.method || p.mode || 'Cash'}</span>
                              {p.transactionId && (
                                <span className="block text-[11px] text-slate-400 font-mono mt-0.5">
                                  Transaction ID: {p.transactionId}
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-center">
                              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                                {p.status || 'Received'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 flex flex-col items-center justify-center text-center">
                <div className="bg-emerald-50 h-16 w-16 rounded-full flex items-center justify-center mb-4 border border-emerald-100 shadow-sm">
                  <Wallet className="h-8 w-8 text-emerald-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">No Payments Recorded</h3>
                <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">Payment history for {activeSelectedLoanId || 'this loan'} will appear here once payments are recorded.</p>
              </div>
            )
          )}

          {/* ACTIVITY TAB */}
          {activeTab === 'activity' && (() => {
            const paymentActivities = selectedLoanPayments.map(p => ({
              id: p.id || `pmt-${p.paymentDate || p.date}-${p.amount}`,
              title: `Payment Received — ${formatCurrency(p.amount)}`,
              description: `Collected via ${p.paymentMethod || 'Cash'}${p.receiptNo ? ` (Ref: ${p.receiptNo})` : ''} for loan ${activeSelectedLoanId}.`,
              date: p.paymentDate || p.date,
              icon: Coins,
              colorClass: 'text-emerald-700',
              bgClass: 'bg-emerald-50',
              borderClass: 'border-emerald-100'
            }));

            const activities = [
              ...(selectedLoanData.activities || []),
              ...paymentActivities,
              {
                id: 'loan_created',
                title: 'Loan Application Created',
                description: `Loan profile (${activeSelectedLoanId || 'new'}) was created for ${selectedLoanData.customer?.name || primaryCustomer.name || 'the customer'}.`,
                date: selectedLoanData.customer?.applicationDate || selectedLoanData.date,
                icon: FileTextIcon,
                colorClass: 'text-[#087F5B]',
                bgClass: 'bg-emerald-50',
                borderClass: 'border-emerald-100'
              }
            ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

            return (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8">
                <h3 className="text-lg font-bold text-slate-900 mb-8 flex items-center gap-2">
                  <Activity className="h-5 w-5 text-[#087F5B]" /> Activity Log
                </h3>
                
                <div className="relative border-l-2 border-slate-100 ml-3 sm:ml-4 space-y-8 pb-4">
                  {activities.map((act, index) => {
                    const Icon = act.icon || CheckCircle2;
                    return (
                      <div key={act.id || index} className="relative pl-6 sm:pl-8">
                        <div className={`absolute -left-[17px] top-0 h-8 w-8 rounded-full border ${act.borderClass || 'border-slate-200'} ${act.bgClass || 'bg-slate-50'} flex items-center justify-center ring-4 ring-white`}>
                          <Icon className={`h-4 w-4 ${act.colorClass || 'text-slate-500'}`} />
                        </div>
                        <div>
                          <h4 className="font-semibold text-slate-900">{act.title}</h4>
                          <p className="text-sm text-slate-500 mt-1">{act.description}</p>
                          <p className="text-xs text-slate-400 mt-2 font-medium flex items-center gap-1.5">
                            <Clock className="h-3 w-3" />
                            {act.date ? formatDateTime(act.date, act) : 'Date not recorded'}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

        </div>
      </div>
    </div>
  );
}
