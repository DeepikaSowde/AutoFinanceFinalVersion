import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  User,
  Phone,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RotateCcw,
  ShieldCheck,
  ArrowRight,
  ExternalLink,
  AlertCircle,
  AlertOctagon,
  Check,
  Loader2,
  Scan,
  Coins,
  Scale,
  ShieldAlert,
  Archive,
  CreditCard,
} from 'lucide-react';
import { calculateLoanOutstanding } from '../../utils/loanCalculations';
import { getReLoanSettings, loadReLoanSettings, RELOAN_POLICY } from '../../utils/reLoanSettings';
import { getPenaltyRecords, usePenaltyData, PENALTY_UPDATE_EVENT } from '../../utils/penaltyRules';
import { DATA_CHANGED_EVENT } from '../../services/api';
import { loadCustomerEntries } from '../../services/customerApi';
import { loadPayments } from '../../services/collectionApi';
import { extractRecordCustomerId, extractRecordLoanId } from '../customer/CustomerView';
import { saveCustomerOnboarding } from '../../utils/customerOnboardingStorage';
import { parseToDate } from '../../utils/dateUtils';

const formatCurrency = (val) => {
  const num = Math.round(Number(val || 0));
  return `₹${num.toLocaleString('en-IN')}`;
};

const StatusBadge = ({ status }) => {
  const styles = {
    Active: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    Closed: 'bg-slate-100 text-slate-700 border-slate-200',
    'Midway Closed': 'bg-amber-50 text-amber-900 border-amber-300',
    Overdue: 'bg-red-50 text-red-800 border-red-200',
    Foreclosed: 'bg-purple-50 text-purple-900 border-purple-300',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider border ${
        styles[status] || styles.Closed
      }`}
    >
      {status || 'Unknown'}
    </span>
  );
};

// Exactly 8 criteria partitioned into Left Column (1-4) and Right Column (5-8)
const CRITERIA_DEFINITIONS = [
  { id: 'records', label: 'Customer and Loan Records', column: 'left', index: 0 },
  { id: 'repayment', label: 'Repayment History', column: 'left', index: 1 },
  { id: 'penalty', label: 'Penalty History', column: 'left', index: 2 },
  { id: 'foreclosure', label: 'Foreclosure and Vehicle Seizure History', column: 'left', index: 3 },
  { id: 'outstanding', label: 'Outstanding Balance Verification', column: 'right', index: 4 },
  { id: 'overdue', label: 'Overdue History', column: 'right', index: 5 },
  { id: 'closure', label: 'Loan Closure History', column: 'right', index: 6 },
  { id: 'policy', label: 'Re-Loan Eligibility Policy', column: 'right', index: 7 },
];

const ReLoanDetails = () => {
  const { customerId } = useParams();
  const navigate = useNavigate();

  const [allCustomers, setAllCustomers] = useState([]);
  const [allPayments, setAllPayments] = useState([]);
  const [penaltyRecords, setPenaltyRecords] = useState([]);
  const [reLoanSettings, setReLoanSettings] = useState(() => getReLoanSettings());

  // Assessment three-state interface:
  // 1. 'READY': Default state before scanning (shows only centered scanner illustration & Start Scan)
  // 2. 'SCANNING': 2-column checklist (4 left, 4 right) with active sequential scan animation
  // 3. 'RESULT': Overall recommendation & findings summary with Re-Run button
  const [assessmentState, setAssessmentState] = useState('READY'); // 'READY' | 'SCANNING' | 'RESULT'
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const scanTimerRef = useRef(null);

  // Loans, payments, penalties and the Re-Loan policy from the API; reloaded
  // after any save.
  usePenaltyData();
  useEffect(() => {
    let active = true;
    const loadAll = () => {
      Promise.all([loadCustomerEntries(), loadPayments(), loadReLoanSettings()])
        .then(([entries, payments, settings]) => {
          if (!active) return;
          setAllCustomers(entries);
          setAllPayments(payments);
          setReLoanSettings(settings);
        })
        .catch((err) => console.error('Failed to load re-loan data:', err));
      setPenaltyRecords(getPenaltyRecords());
    };
    const onPenalties = () => setPenaltyRecords(getPenaltyRecords());

    loadAll();
    window.addEventListener(DATA_CHANGED_EVENT, loadAll);
    window.addEventListener(PENALTY_UPDATE_EVENT, onPenalties);
    return () => {
      active = false;
      window.removeEventListener(DATA_CHANGED_EVENT, loadAll);
      window.removeEventListener(PENALTY_UPDATE_EVENT, onPenalties);
      if (scanTimerRef.current) clearInterval(scanTimerRef.current);
    };
  }, []);

  // Filter raw records belonging to this customer
  const customerRecords = useMemo(() => {
    if (!customerId || !allCustomers.length) return [];
    const targetCId = decodeURIComponent(customerId).trim().toLowerCase();

    return allCustomers.filter((record, idx) => {
      const cId = (extractRecordCustomerId(record, idx) || '').trim().toLowerCase();
      if (cId === targetCId) return true;
      const mob = (record.customer?.mobile || record.mobile || '').trim();
      if (mob && targetCId.includes(mob.slice(-5).toLowerCase())) return true;
      return false;
    });
  }, [allCustomers, customerId]);

  // Primary customer profile
  const customerProfile = useMemo(() => {
    if (!customerRecords.length) return null;
    const first = customerRecords[0];
    const cust = first.customer || {};
    return {
      name: cust.name || first.name || 'Customer',
      customerId: extractRecordCustomerId(first, 0) || customerId,
      mobile: cust.mobile || first.mobile || '—',
      profession: cust.profession || '—',
      residenceType: cust.residenceType || '—',
      address: cust.address || '—',
      area: cust.area || '',
      landmark: cust.landmark || '',
      pincode: cust.pincode || '',
      aadhaarNo: cust.aadhaarNo || '',
      panNo: cust.panNo || '',
      rawRecord: first,
    };
  }, [customerRecords, customerId]);

  // Analyze each loan independently using existing calculation engines
  const analyzedLoans = useMemo(() => {
    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

    return customerRecords.map((record, index) => {
      const loanId = extractRecordLoanId(record, index);
      const targetLoanId = (loanId || '').trim().toLowerCase();

      // Filter payments strictly for THIS loan
      const loanPayments = allPayments.filter((p) => {
        if (!p) return false;
        const pLoanId = String(p.loanId || '').trim().toLowerCase();
        return pLoanId && pLoanId === targetLoanId;
      });

      // Outstanding and effective schedule using existing calculation logic
      const calc = calculateLoanOutstanding(record, allPayments);
      const schedule = calc.effectiveSchedule || [];

      // Penalty records strictly for THIS loan
      const loanPenalties = penaltyRecords.filter((pen) => {
        return pen.loanId && pen.loanId.toLowerCase() === targetLoanId;
      });

      const pendingPenaltyAmount = loanPenalties
        .filter((pen) => pen.status === 'Pending')
        .reduce((sum, pen) => sum + Number(pen.amount || 0), 0);

      // Repayment and overdue analysis
      let paidOnTimeCount = 0;
      let paidLateCount = 0;
      let overdueInstallments = [];
      let totalHistoricalOverdueDays = 0;
      let longestOverduePeriodDays = 0;

      schedule.forEach((inst) => {
        const dueTs = parseToDate(inst.dueDate)?.getTime();
        const isPastDue = dueTs && dueTs < todayMidnight;
        const emi = Number(inst.emi || 0);
        const amountPaid = Number(inst.amountPaid || 0);
        const isFullyPaid = inst.status === 'Paid' || inst.status === 'Collected' || amountPaid >= emi - 0.01;

        if (isFullyPaid) {
          const payments = inst.paymentsList || [];
          if (payments.length > 0 && dueTs) {
            let latestPaymentTs = 0;
            payments.forEach((p) => {
              const pDate = p.date || p.createdAt || p.timestamp;
              const pTs = parseToDate(pDate)?.getTime();
              if (pTs && pTs > latestPaymentTs) {
                latestPaymentTs = pTs;
              }
            });

            if (latestPaymentTs > 0) {
              const diffDays = Math.floor((latestPaymentTs - dueTs) / 86400000);
              if (diffDays > 0) {
                paidLateCount += 1;
                totalHistoricalOverdueDays += diffDays;
                if (diffDays > longestOverduePeriodDays) {
                  longestOverduePeriodDays = diffDays;
                }
              } else {
                paidOnTimeCount += 1;
              }
            } else {
              paidOnTimeCount += 1;
            }
          } else {
            paidOnTimeCount += 1;
          }
        } else if (isPastDue) {
          const currentOverdueDays = Math.max(0, Math.floor((todayMidnight - dueTs) / 86400000));
          overdueInstallments.push(inst);
          totalHistoricalOverdueDays += currentOverdueDays;
          if (currentOverdueDays > longestOverduePeriodDays) {
            longestOverduePeriodDays = currentOverdueDays;
          }
        }
      });

      // Foreclosure and vehicle seizure detection
      const rawStatus = String(record.status || record.loan?.status || '').trim().toLowerCase();
      const isForeclosed = Boolean(
        record.isForeclosed ||
        record.foreclosure ||
        rawStatus === 'foreclosed' ||
        record.vehicle?.status?.toLowerCase() === 'seized' ||
        record.vehicle?.status?.toLowerCase() === 'sold'
      );

      // Midway closure detection
      const isMidwayClosed = Boolean(
        record.isMidwayClosed === true ||
        rawStatus === 'midway closed' ||
        String(record.closureType || '').toLowerCase() === 'midway closure' ||
        record.midwayClosure
      );

      const status = isForeclosed ? 'Foreclosed' : isMidwayClosed ? 'Midway Closed' : calc.status;
      const interestRate = record.loan?.interestRate ?? record.interestRate ?? '—';

      return {
        record,
        loanId,
        loan: record.loan || {},
        status,
        loanAmount: calc.principal,
        interestRate,
        totalRepaid: calc.totalRepaid,
        remainingPrincipal: calc.remainingPrincipal,
        remainingInterest: calc.remainingInterest,
        outstandingAmount: calc.outstandingAmount,
        schedule,
        penalties: loanPenalties,
        pendingPenaltyAmount,
        overdueInstallmentsCount: overdueInstallments.length,
        paidOnTimeCount,
        paidLateCount,
        longestOverduePeriodDays,
        isForeclosed,
        isMidwayClosed,
      };
    });
  }, [customerRecords, allPayments, penaltyRecords]);

  // Overall Loan History Aggregations (Five Summary Cards)
  const historySummary = useMemo(() => {
    const totalLoans = analyzedLoans.length;
    const activeLoans = analyzedLoans.filter((l) => l.status === 'Active' || l.status === 'Overdue');
    const closedLoans = analyzedLoans.filter((l) => l.status === 'Closed' || l.status === 'Midway Closed');
    const foreclosedLoans = analyzedLoans.filter((l) => l.isForeclosed || l.status === 'Foreclosed');
    const loansWithOutstanding = analyzedLoans.filter((l) => l.outstandingAmount > 0.01);

    const totalOutstandingPrincipal = analyzedLoans.reduce((sum, l) => sum + l.remainingPrincipal, 0);
    const totalOutstandingInterest = analyzedLoans.reduce((sum, l) => sum + l.remainingInterest, 0);
    const totalOutstandingCombined = totalOutstandingPrincipal + totalOutstandingInterest;

    const totalOverdueInstallments = analyzedLoans.reduce((sum, l) => sum + l.overdueInstallmentsCount, 0);
    const totalPendingPenalties = analyzedLoans.reduce((sum, l) => sum + l.pendingPenaltyAmount, 0);

    return {
      totalLoans,
      activeLoansCount: activeLoans.length,
      closedLoansCount: closedLoans.length,
      foreclosedLoansCount: foreclosedLoans.length,
      loansWithOutstandingCount: loansWithOutstanding.length,
      totalOutstandingPrincipal,
      totalOutstandingInterest,
      totalOutstandingCombined,
      totalOverdueInstallments,
      totalPendingPenalties,
    };
  }, [analyzedLoans]);

  // Assessment results with exactly 8 criteria details and 1 overall recommendation
  const assessmentDetails = useMemo(() => {
    if (!analyzedLoans.length) return null;

    let totalPaidOnTime = 0;
    let totalPaidLate = 0;
    let longestRecordedOverdueDays = 0;

    analyzedLoans.forEach((l) => {
      totalPaidOnTime += l.paidOnTimeCount;
      totalPaidLate += l.paidLateCount;
      if (l.longestOverduePeriodDays > longestRecordedOverdueDays) {
        longestRecordedOverdueDays = l.longestOverduePeriodDays;
      }
    });

    const hasOutstanding = historySummary.totalOutstandingCombined > 0.01;
    const isPolicyViolation =
      reLoanSettings.policy === RELOAN_POLICY.ZERO_OUTSTANDING && hasOutstanding;

    // Build the 8 criteria assessment data
    const criteriaList = [
      {
        id: 'records',
        name: 'Customer and Loan Records',
        description: `${historySummary.totalLoans} loan account(s) on record`,
        isSatisfied: true,
      },
      {
        id: 'repayment',
        name: 'Repayment History',
        description:
          totalPaidLate > 0
            ? `${totalPaidOnTime} paid on time, ${totalPaidLate} settled late`
            : `${totalPaidOnTime} installment(s) settled on or before due date`,
        isSatisfied: true,
        isWarning: totalPaidLate > 1,
      },
      {
        id: 'penalty',
        name: 'Penalty History',
        description:
          historySummary.totalPendingPenalties > 0.01
            ? `₹${Math.round(historySummary.totalPendingPenalties).toLocaleString('en-IN')} pending penalties`
            : 'Zero pending late-payment penalties',
        isSatisfied: historySummary.totalPendingPenalties <= 0.01,
        isWarning: historySummary.totalPendingPenalties > 0.01,
      },
      {
        id: 'foreclosure',
        name: 'Foreclosure and Vehicle Seizure History',
        description:
          historySummary.foreclosedLoansCount > 0
            ? `Previous vehicle seizure / foreclosure recorded (${historySummary.foreclosedLoansCount})`
            : 'No vehicle seizures or foreclosures recorded',
        isSatisfied: historySummary.foreclosedLoansCount === 0,
        isCritical: historySummary.foreclosedLoansCount > 0,
      },
      {
        id: 'outstanding',
        name: 'Outstanding Balance Verification',
        description: hasOutstanding
          ? `₹${Math.round(historySummary.totalOutstandingCombined).toLocaleString('en-IN')} outstanding across prior loans`
          : 'Zero outstanding balance across all accounts',
        isSatisfied: !hasOutstanding,
        isWarning: hasOutstanding,
      },
      {
        id: 'overdue',
        name: 'Overdue History',
        description:
          historySummary.totalOverdueInstallments > 0
            ? `${historySummary.totalOverdueInstallments} active overdue installment(s)`
            : 'Zero active overdue installments',
        isSatisfied: historySummary.totalOverdueInstallments === 0,
        isWarning: historySummary.totalOverdueInstallments > 0,
      },
      {
        id: 'closure',
        name: 'Loan Closure History',
        description:
          historySummary.closedLoansCount > 0
            ? `${historySummary.closedLoansCount} loan(s) settled and closed`
            : 'Active borrowing commitment(s)',
        isSatisfied: true,
      },
      {
        id: 'policy',
        name: 'Re-Loan Eligibility Policy',
        description:
          reLoanSettings.policy === RELOAN_POLICY.ZERO_OUTSTANDING
            ? isPolicyViolation
              ? 'Policy requirement not satisfied: Outstanding balance exists'
              : 'Satisfies "Outstanding Must Be Zero" policy'
            : 'Complies with "Allow Re-Loan With Outstanding" policy',
        isSatisfied: !isPolicyViolation,
        isWarning: isPolicyViolation,
      },
    ];

    // Determine ONE overall recommendation category (A, B, or C)
    const hasForeclosure = historySummary.foreclosedLoansCount > 0;
    const hasSevereOverdue = historySummary.totalOverdueInstallments >= 3 || longestRecordedOverdueDays > 90;
    const hasCautionFlags =
      isPolicyViolation ||
      hasOutstanding ||
      historySummary.totalOverdueInstallments > 0 ||
      historySummary.totalPendingPenalties > 0.01 ||
      totalPaidLate > 0;

    let recommendationType = 'A'; // 'A' | 'B' | 'C'
    let title = '';
    let message = '';
    let policyNote = '';

    if (hasForeclosure || hasSevereOverdue) {
      recommendationType = 'C';
      title = 'Further Review Recommended';
      message =
        "Important concerns were identified in the customer's previous loan history. Carefully review the records before proceeding.";
      if (hasForeclosure) {
        policyNote =
          'Previous vehicle seizure and loan foreclosure were identified on record. Final loan decision remains with the Admin.';
      }
    } else if (hasCautionFlags) {
      recommendationType = 'B';
      title = 'Proceed With Caution';
      message =
        'Some repayment or eligibility concerns were identified. Review the completed checks before deciding whether to proceed.';
      if (isPolicyViolation) {
        policyNote =
          'The customer has an active outstanding balance under the "Outstanding Must Be Zero" policy. An Admin exception is required to proceed.';
      }
    } else {
      recommendationType = 'A';
      title = 'Recommended to Proceed';
      message =
        'Based on the available loan history, proceeding with the application is recommended. Final approval remains with the Admin.';
    }

    return {
      criteriaList,
      recommendationType,
      title,
      message,
      policyNote,
    };
  }, [analyzedLoans, historySummary, reLoanSettings]);

  // Start sequential scanning inside the right panel (NO modal or popup)
  const handleStartAssessment = () => {
    if (assessmentState === 'SCANNING') return; // Prevent repeated execution while in progress
    if (scanTimerRef.current) clearInterval(scanTimerRef.current);

    setAssessmentState('SCANNING');
    setCurrentStepIndex(0);

    let step = 0;
    scanTimerRef.current = setInterval(() => {
      step += 1;
      if (step < CRITERIA_DEFINITIONS.length) {
        setCurrentStepIndex(step);
      } else {
        clearInterval(scanTimerRef.current);
        setCurrentStepIndex(CRITERIA_DEFINITIONS.length);
        // Brief pause so staff can view the 8th completed check before displaying final result
        setTimeout(() => {
          setAssessmentState('RESULT');
        }, 400);
      }
    }, 350);
  };

  // Proceed to New Loan application prefilled with existing customer details
  const handleProceedToReLoan = () => {
    if (!customerProfile) return;

    if (scanTimerRef.current) clearInterval(scanTimerRef.current);

    const cust = customerProfile.rawRecord?.customer || {};
    const guarantor = customerProfile.rawRecord?.guarantor || {};

    const reLoanOnboardingForm = {
      customer: {
        applicationDate: new Date().toISOString().slice(0, 10),
        customerId: customerProfile.customerId,
        name: customerProfile.name,
        countryCode: '+91',
        mobile: customerProfile.mobile,
        profession: cust.profession !== '—' ? cust.profession : '',
        residenceType: cust.residenceType !== '—' ? cust.residenceType : 'Own House',
        referredBy: cust.referredBy || '',
        referredByPercentage: cust.referredByPercentage || '',
        address: customerProfile.address !== '—' ? customerProfile.address : '',
        area: customerProfile.area || '',
        landmark: customerProfile.landmark || '',
        pincode: customerProfile.pincode || '',
        aadhaarNo: customerProfile.aadhaarNo || '',
        aadhaarFile: null,
        panNo: customerProfile.panNo || '',
        panFile: null,
        dlNo: cust.dlNo || '',
        dlFile: null,
        voterNo: cust.voterNo || '',
        voterFile: null,
        isReLoanCustomer: true,
      },
      vehicle: {
        type: '',
        brand: '',
        model: '',
        variant: '',
        colour: '',
        year: '',
        fuelType: '',
        amount: '',
        ownershipType: '',
        photo: null,
        regNo: '',
        rto: '',
        regDate: '',
        chassisNo: '',
        engineNo: '',
        hypothecation: 'No',
        financier: '',
        nocStatus: '',
        nocFile: null,
        taxExpiry: '',
        insuranceCompany: '',
        policyNo: '',
        insuranceExpiry: '',
        financierEndorsement: 'No',
        insuranceFile: null,
        remarks: `Re-Loan for ${customerProfile.name} (${customerProfile.customerId})`,
      },
      guarantor: {
        name: guarantor.name || guarantor.fullName || '',
        fullName: guarantor.fullName || guarantor.name || '',
        countryCode: '+91',
        mobile: guarantor.mobile || guarantor.phone || '',
        phone: guarantor.phone || guarantor.mobile || '',
        address: guarantor.address || '',
        area: guarantor.area || '',
        landmark: guarantor.landmark || '',
        pincode: guarantor.pincode || '',
        aadhaarNo: guarantor.aadhaarNo || guarantor.aadhaarNumber || '',
        aadhaarNumber: guarantor.aadhaarNumber || guarantor.aadhaarNo || '',
        aadhaarFile: null,
        additionalDocs: [],
        guarantorId: guarantor.guarantorId || '',
        id: guarantor.id || '',
      },
      referral: {
        name: '',
        fullName: '',
        countryCode: '+91',
        mobile: '',
        phone: '',
        address: '',
        area: '',
        landmark: '',
        pincode: '',
        aadhaarNo: '',
        aadhaarNumber: '',
        payCommission: false,
        commissionPercentage: '',
        commissionAmount: '',
        paymentMode: 'Cash',
      },
      loan: {
        vehicleAmount: '',
        downPayment: '',
        loanAmount: '',
        interestRate: '',
        tenure: '',
        tenureUnit: 'Months',
        paymentFrequency: 'Monthly',
        interestType: 'Flat',
        repaymentMethod: 'EMI',
        firstDueDate: '',
        documentCharge: '',
        customizeRules: false,
        gracePeriod: '',
        latePenalty: '',
        penaltyType: 'Per Day',
        isReLoan: true,
        previousLoansCount: analyzedLoans.length,
      },
    };

    saveCustomerOnboarding(reLoanOnboardingForm);
    navigate('/newloan', {
      state: {
        isReLoan: true,
        customerId: customerProfile.customerId,
        customerName: customerProfile.name,
      },
    });
  };

  // Pre-split the criteria into left and right columns
  const leftColumnCriteria = useMemo(
    () => CRITERIA_DEFINITIONS.filter((c) => c.column === 'left'),
    []
  );
  const rightColumnCriteria = useMemo(
    () => CRITERIA_DEFINITIONS.filter((c) => c.column === 'right'),
    []
  );

  // Helper to render an individual criterion card in State 2
  const renderCriterionCard = (critDef) => {
    const critData = assessmentDetails?.criteriaList?.find((c) => c.id === critDef.id);
    const isCompleted = critDef.index < currentStepIndex;
    const isCurrent = critDef.index === currentStepIndex;

    let IconComponent = User;
    if (critDef.id === 'repayment') IconComponent = CreditCard;
    else if (critDef.id === 'penalty') IconComponent = Scale;
    else if (critDef.id === 'foreclosure') IconComponent = ShieldAlert;
    else if (critDef.id === 'outstanding') IconComponent = Coins;
    else if (critDef.id === 'overdue') IconComponent = Clock;
    else if (critDef.id === 'closure') IconComponent = Archive;
    else if (critDef.id === 'policy') IconComponent = ShieldCheck;

    return (
      <div
        key={critDef.id}
        className={`p-2.5 rounded-xl border transition-all duration-200 flex items-center justify-between gap-2.5 ${
          isCurrent
            ? 'bg-emerald-50/80 border-[#006052] shadow-2xs ring-1 ring-[#006052]/20'
            : isCompleted
            ? 'bg-white border-slate-200/90'
            : 'bg-slate-50/50 border-slate-200/60 opacity-60'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
              isCurrent
                ? 'bg-[#006052] text-white shadow-2xs'
                : isCompleted
                ? critData?.isCritical
                  ? 'bg-red-100 text-red-700'
                  : critData?.isWarning
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-emerald-100 text-[#006052]'
                : 'bg-slate-100 text-slate-400'
            }`}
          >
            <IconComponent className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <span
              className={`text-xs block truncate ${
                isCurrent
                  ? 'font-bold text-[#006052]'
                  : isCompleted
                  ? 'font-bold text-slate-900'
                  : 'font-medium text-slate-500'
              }`}
            >
              {critDef.label}
            </span>
            <span className="text-[10px] text-slate-500 block truncate">
              {isCurrent
                ? 'Checking records...'
                : isCompleted
                ? critData?.description || 'Verified'
                : 'Waiting for scan...'}
            </span>
          </div>
        </div>

        {/* Status indicator on the right of each item */}
        <div className="shrink-0">
          {isCompleted ? (
            critData?.isCritical ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-md">
                <AlertOctagon className="h-3 w-3 stroke-[2.5]" />
                <span>Risk</span>
              </span>
            ) : critData?.isWarning ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                <AlertTriangle className="h-3 w-3 stroke-[2.5]" />
                <span>Caution</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                <Check className="h-3 w-3 stroke-[2.5]" />
                <span>Clear</span>
              </span>
            )
          ) : isCurrent ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#006052] bg-emerald-100/60 px-2 py-0.5 rounded-md animate-pulse">
              <Loader2 className="h-3 w-3 animate-spin text-[#006052]" />
              <span>Scanning</span>
            </span>
          ) : (
            <span className="text-[10px] font-medium text-slate-400 px-1.5 py-0.5">
              Pending
            </span>
          )}
        </div>
      </div>
    );
  };

  if (!customerRecords.length) {
    return (
      <div className="flex flex-col flex-1 min-h-screen w-full bg-slate-50/60 px-4 sm:px-6 lg:px-8 py-7 font-sans">
        <button
          type="button"
          onClick={() => navigate('/re-loan')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#006052] mb-4 cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Re-Loans</span>
        </button>

        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-3 max-w-lg mx-auto shadow-2xs">
          <AlertCircle className="h-10 w-10 text-slate-400 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900">Customer Not Found</h2>
          <p className="text-xs text-slate-500">
            No records matched customer ID "{customerId}". Please search again or onboard this customer under New Loan.
          </p>
          <button
            type="button"
            onClick={() => navigate('/re-loan')}
            className="px-4 py-2 rounded-xl bg-[#006052] text-white text-xs font-bold shadow-xs cursor-pointer"
          >
            Go to Re-Loans
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-screen w-full max-w-full overflow-x-hidden bg-slate-50/50 px-4 sm:px-6 lg:px-8 py-5 sm:py-6 font-sans space-y-5">
      {/* ========================================================
          1. KEEP THE EXISTING TOP HEADER
      ========================================================= */}
      <div>
        <button
          type="button"
          onClick={() => navigate('/re-loan')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#006052] hover:text-[#004d42] transition-colors mb-2 cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Re-Loan Customer Search</span>
        </button>

        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#006052] text-white shadow-2xs">
              <User className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 truncate">
                  {customerProfile.name}
                </h1>
                <span className="text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md font-mono">
                  {customerProfile.customerId}
                </span>

                {/* Status Badge reflecting assessment state */}
                {assessmentState === 'READY' ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full">
                    <Clock className="h-3 w-3 text-slate-500" />
                    <span>Assessment Pending</span>
                  </span>
                ) : assessmentState === 'SCANNING' ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#006052] bg-emerald-50 border border-emerald-300 px-2.5 py-0.5 rounded-full shadow-2xs animate-pulse">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#006052]" />
                    <span>Scanning in Progress</span>
                  </span>
                ) : assessmentDetails?.recommendationType === 'A' ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 px-2.5 py-0.5 rounded-full shadow-2xs">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Recommended to Proceed</span>
                  </span>
                ) : assessmentDetails?.recommendationType === 'B' ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 bg-amber-50 border border-amber-300 px-2.5 py-0.5 rounded-full shadow-2xs">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                    <span>Proceed With Caution</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-900 bg-red-50 border border-red-300 px-2.5 py-0.5 rounded-full shadow-2xs">
                    <AlertOctagon className="h-3.5 w-3.5 text-red-600" />
                    <span>Further Review Recommended</span>
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-500 font-normal mt-0.5 flex items-center gap-2.5 flex-wrap">
                <span className="inline-flex items-center gap-1 text-slate-600">
                  <Phone className="h-3 w-3 text-slate-400" />
                  <span>{customerProfile.mobile}</span>
                </span>
                <span>•</span>
                <span>{historySummary.totalLoans} recorded loan{historySummary.totalLoans !== 1 ? 's' : ''}</span>
              </p>
            </div>
          </div>

          {/* Action Controls in Top Header */}
          <div className="flex items-center gap-2.5 self-start md:self-center shrink-0">
            <button
              type="button"
              onClick={handleStartAssessment}
              disabled={assessmentState === 'SCANNING'}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-[#006052] bg-white hover:bg-emerald-50 text-[#006052] text-xs font-bold shadow-2xs transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {assessmentState === 'SCANNING' ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Scanning...</span>
                </>
              ) : assessmentState === 'RESULT' ? (
                <>
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Re-Run Assessment</span>
                </>
              ) : (
                <>
                  <Scan className="h-3.5 w-3.5" />
                  <span>Run Assessment</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleProceedToReLoan}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#006052] hover:bg-[#004d42] active:bg-[#003d34] text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
            >
              <span>Proceed to Re-Loan Application</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================
          2. KEEP THE EXISTING FIVE PORTFOLIO KPI CARDS
      ========================================================= */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Customer Loan Portfolio Metrics
          </h2>
          <span className="text-[11px] text-slate-400 font-medium">
            Policy: <strong>{reLoanSettings.policy === RELOAN_POLICY.ZERO_OUTSTANDING ? 'Outstanding Must Be Zero' : 'Allow With Outstanding'}</strong>
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* 1. Total Loans */}
          <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs">
            <span className="text-[11px] font-semibold text-slate-500 block">Total Loans</span>
            <span className="text-xl font-extrabold text-slate-900 mt-1 block">
              {historySummary.totalLoans}
            </span>
            <span className="text-[10px] text-slate-400 mt-1 block">All accounts on record</span>
          </div>

          {/* 2. Active Loans */}
          <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs">
            <span className="text-[11px] font-semibold text-slate-500 block">Active Loans</span>
            <span className="text-xl font-extrabold text-emerald-800 mt-1 block">
              {historySummary.activeLoansCount}
            </span>
            <span className="text-[10px] text-slate-400 mt-1 block">Currently running</span>
          </div>

          {/* 3. Closed Loans */}
          <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs">
            <span className="text-[11px] font-semibold text-slate-500 block">Closed Loans</span>
            <span className="text-xl font-extrabold text-slate-700 mt-1 block">
              {historySummary.closedLoansCount}
            </span>
            <span className="text-[10px] text-slate-400 mt-1 block">Fully settled accounts</span>
          </div>

          {/* 4. Loans With Outstanding */}
          <div className={`rounded-xl border p-4 shadow-2xs ${historySummary.loansWithOutstandingCount > 0 ? 'bg-amber-50/50 border-amber-300' : 'bg-white border-slate-200/90'}`}>
            <span className="text-[11px] font-semibold text-slate-600 block">Loans With Outstanding</span>
            <span className={`text-xl font-extrabold mt-1 block ${historySummary.loansWithOutstandingCount > 0 ? 'text-amber-900' : 'text-slate-900'}`}>
              {historySummary.loansWithOutstandingCount}
            </span>
            <span className="text-[10px] text-slate-500 mt-1 block">
              {formatCurrency(historySummary.totalOutstandingCombined)} total balance
            </span>
          </div>

          {/* 5. Foreclosed Loans */}
          <div className={`rounded-xl border p-4 shadow-2xs ${historySummary.foreclosedLoansCount > 0 ? 'bg-purple-50/60 border-purple-300' : 'bg-white border-slate-200/90'}`}>
            <span className="text-[11px] font-semibold text-slate-600 block">Foreclosed Loans</span>
            <span className={`text-xl font-extrabold mt-1 block ${historySummary.foreclosedLoansCount > 0 ? 'text-purple-900' : 'text-slate-900'}`}>
              {historySummary.foreclosedLoansCount}
            </span>
            <span className="text-[10px] text-slate-500 mt-1 block">
              {historySummary.foreclosedLoansCount > 0 ? 'Critical Risk Identified' : 'Zero seized vehicles'}
            </span>
          </div>
        </div>
      </div>

      {/* ========================================================
          3. RESPONSIVE TWO-COLUMN LAYOUT (50% / 50%)
          - LEFT COLUMN: Customer Loan Accounts
          - RIGHT COLUMN: Re-Loan Assessment (Three-State Interface)
      ========================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* ========================================================
            LEFT COLUMN: CUSTOMER LOAN ACCOUNTS
        ========================================================= */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 leading-tight">
                Customer Loan Accounts ({analyzedLoans.length})
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                All loan accounts on record for this customer.
              </p>
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
              {analyzedLoans.length} Account{analyzedLoans.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100/80 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 whitespace-nowrap">Loan ID</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Status</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Loan Amount</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Interest Rate</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Total Paid</th>
                  <th className="py-2.5 px-3 text-center whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {analyzedLoans.map((l) => (
                  <tr key={l.loanId} className="hover:bg-slate-50/80 transition-colors">
                    {/* Loan ID */}
                    <td className="py-3 px-3 font-bold text-slate-900 font-mono whitespace-nowrap">
                      {l.loanId}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <StatusBadge status={l.status} />
                    </td>

                    {/* Loan Amount */}
                    <td className="py-3 px-3 text-right font-bold text-slate-900 whitespace-nowrap">
                      {formatCurrency(l.loanAmount)}
                    </td>

                    {/* Interest Rate */}
                    <td className="py-3 px-3 text-right font-medium text-slate-700 whitespace-nowrap">
                      {l.interestRate !== '—' && l.interestRate !== null && l.interestRate !== undefined
                        ? `${l.interestRate}%`
                        : '—'}
                    </td>

                    {/* Total Paid */}
                    <td className="py-3 px-3 text-right font-bold text-emerald-800 whitespace-nowrap">
                      {formatCurrency(l.totalRepaid)}
                    </td>

                    {/* Action */}
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => navigate(`/loans/${encodeURIComponent(l.loanId)}`)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-[#006052] hover:text-white hover:border-[#006052] text-[#006052] font-semibold text-[11px] shadow-2xs transition-all cursor-pointer"
                        title={`Open loan details for ${l.loanId}`}
                      >
                        <span>View Details</span>
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ========================================================
            RIGHT COLUMN: RE-LOAN ASSESSMENT (3-STATE INTERFACE)
            - STATE 1: Ready to Scan (Default)
            - STATE 2: Scanning in Progress (2 columns x 4 criteria)
            - STATE 3: Assessment Result (Recommendation & findings)
        ========================================================= */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden flex flex-col min-h-[420px]">
          <style>{`
            @keyframes scanBeam {
              0% { top: 6%; opacity: 0.3; }
              50% { opacity: 1; }
              100% { top: 92%; opacity: 0.3; }
            }
          `}</style>

          {/* ========================================================
              STATE 1: READY TO SCAN — DEFAULT STATE
          ========================================================= */}
          {assessmentState === 'READY' && (
            <div className="flex-1 flex flex-col justify-between p-6 sm:p-7">
              {/* Panel Top Title */}
              <div className="text-center">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-[#006052] border border-emerald-200 text-[11px] font-bold uppercase tracking-wider mb-1.5">
                  <Scan className="h-3 w-3" />
                  <span>Automated Verification</span>
                </span>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  Re-Loan Assessment
                </h2>
              </div>

              {/* Centered Document / Scanner Illustration */}
              <div className="my-auto py-5 flex flex-col items-center justify-center text-center">
                {/* Scanner Viewfinder Frame */}
                <div className="relative p-2.5">
                  {/* Corner brackets */}
                  <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#006052] rounded-tl-sm" />
                  <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[#006052] rounded-tr-sm" />
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[#006052] rounded-bl-sm" />
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#006052] rounded-br-sm" />

                  {/* Document card */}
                  <div className="relative w-36 h-40 bg-gradient-to-b from-white to-slate-50 rounded-xl border border-slate-200/90 shadow-md p-3.5 flex flex-col justify-between overflow-hidden">
                    {/* Header placeholder lines */}
                    <div className="space-y-1.5">
                      <div className="h-2 w-14 bg-emerald-100 rounded-full" />
                      <div className="h-1.5 w-24 bg-slate-200 rounded-full" />
                      <div className="h-1.5 w-16 bg-slate-200 rounded-full" />
                    </div>

                    {/* Center scanner emblem */}
                    <div className="flex items-center justify-center py-1">
                      <div className="h-12 w-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-[#006052] shadow-2xs">
                        <Scan className="h-6 w-6 stroke-[2]" />
                      </div>
                    </div>

                    {/* Bottom placeholder lines */}
                    <div className="space-y-1">
                      <div className="h-1.5 w-20 bg-slate-200 rounded-full" />
                      <div className="h-1.5 w-12 bg-slate-200 rounded-full" />
                    </div>

                    {/* Subtle green laser scanning line animation */}
                    <div
                      className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#006052] to-transparent shadow-[0_0_8px_#006052]"
                      style={{
                        animation: 'scanBeam 2.2s ease-in-out infinite alternate',
                      }}
                    />
                  </div>
                </div>

                {/* Heading & Subtitle */}
                <h3 className="text-base font-bold text-slate-900 mt-5">
                  Ready to Scan
                </h3>
                <p className="text-xs text-slate-500 max-w-xs mt-1 leading-relaxed">
                  Review the customer's loan history and repayment records.
                </p>

                {/* Start Scan Button */}
                <div className="mt-5">
                  <button
                    type="button"
                    onClick={handleStartAssessment}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#006052] hover:bg-[#004d42] active:bg-[#003d34] text-white text-xs font-bold shadow-xs hover:shadow transition-all cursor-pointer"
                  >
                    <Scan className="h-4 w-4" />
                    <span>Start Scan</span>
                  </button>
                </div>
              </div>

              {/* Footer Info */}
              <div className="text-center pt-2">
                <p className="text-[11px] text-slate-400">
                  Evaluates repayment behavior, outstanding balance, penalties, and foreclosure history.
                </p>
              </div>
            </div>
          )}

          {/* ========================================================
              STATE 2: SCANNING IN PROGRESS
              - Compact 2-column layout (4 left, 4 right)
          ========================================================= */}
          {assessmentState === 'SCANNING' && (
            <div className="flex-1 flex flex-col">
              {/* Scanning Header */}
              <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 leading-tight">
                    Re-Loan Assessment
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Scanning customer loan history and repayment behavior...
                  </p>
                </div>

                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#006052] bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full animate-pulse">
                  <Loader2 className="h-3 w-3 animate-spin text-[#006052]" />
                  <span>Scanning in Progress</span>
                </span>
              </div>

              {/* Compact Progress Indicator */}
              <div className="px-5 py-2.5 bg-slate-50/40 border-b border-slate-100 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-600">Verification Progress</span>
                <span className="font-bold text-[#006052]">
                  {`${Math.min(currentStepIndex, 8)} of 8 checks completed`}
                </span>
              </div>

              {/* Animated Progress Bar */}
              <div className="w-full bg-slate-100 h-1">
                <div
                  className="bg-[#006052] h-1 transition-all duration-300"
                  style={{ width: `${(Math.min(currentStepIndex, 8) / 8) * 100}%` }}
                />
              </div>

              {/* Two-Column Checklist Layout (4 criteria in Left Column, 4 in Right Column) */}
              <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
                {/* LEFT COLUMN: Criteria 1 to 4 */}
                <div className="space-y-2.5">
                  {leftColumnCriteria.map((critDef) => renderCriterionCard(critDef))}
                </div>

                {/* RIGHT COLUMN: Criteria 5 to 8 */}
                <div className="space-y-2.5">
                  {rightColumnCriteria.map((critDef) => renderCriterionCard(critDef))}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================
              STATE 3: ASSESSMENT RESULT
              - Result icon, One overall recommendation, findings, Re-Run button
          ========================================================= */}
          {assessmentState === 'RESULT' && (
            <div className="flex-1 flex flex-col justify-between">
              {/* Result Header */}
              <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 leading-tight">
                    Re-Loan Assessment Result
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Completed evaluation based on available customer loan records.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleStartAssessment}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#006052] bg-white hover:bg-emerald-50 text-[#006052] text-xs font-bold shadow-2xs transition-all cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Re-Run Assessment</span>
                </button>
              </div>

              {/* Main Result Body */}
              <div className="p-5 sm:p-6 flex-1 flex flex-col justify-center">
                {/* Overall Recommendation Banner */}
                <div
                  className={`p-5 rounded-2xl border flex items-start gap-4 transition-all shadow-2xs ${
                    assessmentDetails?.recommendationType === 'A'
                      ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
                      : assessmentDetails?.recommendationType === 'B'
                      ? 'bg-amber-50/90 border-amber-300 text-amber-950'
                      : 'bg-red-50/90 border-red-300 text-red-950'
                  }`}
                >
                  <div className="shrink-0 mt-0.5">
                    {assessmentDetails?.recommendationType === 'A' ? (
                      <div className="h-11 w-11 rounded-xl bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-700 shadow-2xs">
                        <CheckCircle2 className="h-6 w-6 stroke-[2.2]" />
                      </div>
                    ) : assessmentDetails?.recommendationType === 'B' ? (
                      <div className="h-11 w-11 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-800 shadow-2xs">
                        <AlertTriangle className="h-6 w-6 stroke-[2.2]" />
                      </div>
                    ) : (
                      <div className="h-11 w-11 rounded-xl bg-red-100 border border-red-300 flex items-center justify-center text-red-700 shadow-2xs">
                        <AlertOctagon className="h-6 w-6 stroke-[2.2]" />
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5 min-w-0 flex-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider opacity-75 block">
                      Overall Recommendation
                    </span>
                    <h3 className="text-base sm:text-lg font-extrabold tracking-tight">
                      {assessmentDetails?.title}
                    </h3>
                    <p className="text-xs sm:text-sm leading-relaxed opacity-90">
                      {assessmentDetails?.message}
                    </p>
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between">
                <span className="text-[11px] text-slate-500">
                  All 8 verification checks completed
                </span>
                <button
                  type="button"
                  onClick={handleStartAssessment}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#006052] hover:bg-[#004d42] text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Re-Run Assessment</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReLoanDetails;
