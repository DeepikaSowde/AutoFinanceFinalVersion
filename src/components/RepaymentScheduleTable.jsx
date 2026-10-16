import React, { useMemo, useState, useEffect } from 'react';
import { formatDate } from '../utils/dateUtils';
import {
  getPenaltySettings,
  getPenaltyRecords,
  getInstallmentPenaltySupportingAmount,
  PENALTY_UPDATE_EVENT,
} from '../utils/penaltyRules';

const formatINR = (value) => {
  if (value === undefined || value === null || isNaN(Number(value))) return '₹0';
  return `₹${Math.round(Number(value)).toLocaleString('en-IN')}`;
};

export const generateSchedule = (loanDetails) => {
  const P = Number(loanDetails.loanAmount) || 0;
  const monthlyRate = Number(loanDetails.interestRate) || 0;
  const tenureValue = Number(loanDetails.tenure) || 0;
  const tenureUnit = loanDetails.tenureUnit;
  const paymentFrequency = loanDetails.paymentFrequency;
  const interestType = loanDetails.interestType;
  const repaymentMethod = loanDetails.repaymentMethod;
  const firstDueDateStr = loanDetails.firstDueDate;

  if (P <= 0 || tenureValue <= 0) return [];

  const tenureMonths = tenureUnit === 'Years' ? tenureValue * 12 : tenureValue;

  let numberOfPayments = tenureMonths;
  if (paymentFrequency === 'Daily') {
    numberOfPayments = tenureUnit === 'Years' ? tenureValue * 365 : Math.round(tenureMonths * 30);
  } else if (paymentFrequency === 'Weekly') {
    numberOfPayments = tenureUnit === 'Years' ? tenureValue * 52 : Math.round(tenureMonths * (52 / 12));
  } else {
    numberOfPayments = tenureMonths;
  }

  numberOfPayments = Math.max(Math.round(numberOfPayments), 0);
  if (numberOfPayments === 0) return [];

  let periodicRate = monthlyRate / 100;
  if (paymentFrequency === 'Daily') {
    periodicRate = (monthlyRate / 100) / 30;
  } else if (paymentFrequency === 'Weekly') {
    periodicRate = (monthlyRate / 100) / (52 / 12);
  }

  const schedule = [];
  let balance = P;
  
  let baseDate;
  if (firstDueDateStr) {
    if (typeof firstDueDateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(firstDueDateStr)) {
      const [y, m, d] = firstDueDateStr.split('-').map(Number);
      baseDate = new Date(y, m - 1, d);
    } else {
      baseDate = new Date(firstDueDateStr);
    }
  } else {
    baseDate = new Date();
  }
  const startYear = baseDate.getFullYear();
  const startMonth = baseDate.getMonth();
  const startDay = baseDate.getDate();

  const getDueDate = (installmentIndex) => {
    if (paymentFrequency === 'Daily') {
      const d = new Date(baseDate);
      d.setDate(startDay + installmentIndex);
      return d;
    }
    if (paymentFrequency === 'Weekly') {
      const d = new Date(baseDate);
      d.setDate(startDay + installmentIndex * 7);
      return d;
    }
    // Monthly: exact 1 month progression respecting month-end dates and leap years
    const targetMonth = startMonth + installmentIndex;
    const targetYear = startYear + Math.floor(targetMonth / 12);
    const monthInYear = ((targetMonth % 12) + 12) % 12;
    const daysInTargetMonth = new Date(targetYear, monthInYear + 1, 0).getDate();
    const targetDay = Math.min(startDay, daysInTargetMonth);
    return new Date(targetYear, monthInYear, targetDay);
  };

  if (interestType === 'Reducing Balance') {
    if (repaymentMethod === 'EMI' || !repaymentMethod) {
      let emi = 0;
      if (periodicRate === 0) {
        emi = P / numberOfPayments;
      } else {
        emi = (P * periodicRate * Math.pow(1 + periodicRate, numberOfPayments)) /
              (Math.pow(1 + periodicRate, numberOfPayments) - 1);
      }

      for (let i = 1; i <= numberOfPayments; i++) {
        let interestForPeriod = balance * periodicRate;
        let principalForPeriod = emi - interestForPeriod;
        let periodEmi = emi;

        if (i === numberOfPayments) {
          principalForPeriod = balance;
          periodEmi = principalForPeriod + interestForPeriod;
        }

        const remainingPrincipal = i === numberOfPayments ? 0 : Math.max(0, balance - principalForPeriod);

        schedule.push({
          installmentNumber: i,
          dueDate: getDueDate(i - 1),
          principal: principalForPeriod,
          principalOutstanding: remainingPrincipal,
          interest: interestForPeriod,
          emi: periodEmi,
          amountPaid: 0,
          balance: periodEmi,
          status: 'Due'
        });

        balance = remainingPrincipal;
      }
    } else if (repaymentMethod === 'Principal') {
      const principalPerPayment = P / numberOfPayments;
      for (let i = 1; i <= numberOfPayments; i++) {
        let interestForPeriod = balance * periodicRate;
        let principalForPeriod = principalPerPayment;

        if (i === numberOfPayments) {
          principalForPeriod = balance;
        }
        
        let periodEmi = principalForPeriod + interestForPeriod;
        const remainingPrincipal = i === numberOfPayments ? 0 : Math.max(0, balance - principalForPeriod);

        schedule.push({
          installmentNumber: i,
          dueDate: getDueDate(i - 1),
          principal: principalForPeriod,
          principalOutstanding: remainingPrincipal,
          interest: interestForPeriod,
          emi: periodEmi,
          amountPaid: 0,
          balance: periodEmi,
          status: 'Due'
        });

        balance = remainingPrincipal;
      }
    }
  } else {
    // Flat / Simple Interest
    const totalInterest = P * (monthlyRate / 100) * tenureMonths;
    const interestPerPayment = totalInterest / numberOfPayments;
    const principalPerPayment = P / numberOfPayments;
    const emi = (P + totalInterest) / numberOfPayments;

    let accumulatedPrincipal = 0;
    let accumulatedInterest = 0;

    for (let i = 1; i <= numberOfPayments; i++) {
      let prin = principalPerPayment;
      let int = interestPerPayment;
      let amt = emi;

      if (i === numberOfPayments) {
        prin = balance;
        int = totalInterest - accumulatedInterest;
        amt = prin + int;
      } else {
        accumulatedPrincipal += prin;
        accumulatedInterest += int;
      }

      const remainingPrincipal = i === numberOfPayments ? 0 : Math.max(0, balance - prin);

      schedule.push({
        installmentNumber: i,
        dueDate: getDueDate(i - 1),
        principal: prin,
        principalOutstanding: remainingPrincipal,
        interest: int,
        emi: amt,
        amountPaid: 0,
        balance: amt,
        status: 'Due'
      });

      balance = remainingPrincipal;
    }
  }

  // Inject actual payments if this was a saved loan. For preview, amountPaid = 0.
  // The logic supports taking payments into account if we pass them in the future.
  // We'll calculate balances and statuses here.
  const today = new Date();
  today.setHours(0,0,0,0);

  schedule.forEach(item => {
    if (item.amountPaid >= item.emi - 0.01) {
      item.status = 'Paid';
      item.balance = 0;
    } else if (item.amountPaid > 0) {
      item.status = 'Partial';
      item.balance = item.emi - item.amountPaid;
    } else {
      item.balance = item.emi;
      if (item.dueDate < today) {
        item.status = 'Overdue';
      } else {
        item.status = 'Due';
      }
    }
  });

  return schedule;
};

export const computeEffectiveSchedule = (baseOrRawSchedule, payments = []) => {
  if (!baseOrRawSchedule || baseOrRawSchedule.length === 0) return [];

  // Filter payments to only eligible ones
  const eligiblePayments = (payments || []).filter((p) => {
    if (!p) return false;
    const status = (p.status || "").toLowerCase();
    return status !== "failed" && status !== "cancelled" && status !== "reversed";
  });

  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);

  // If there are NO eligible payments recorded in payment history,
  // preserve the existing rawSchedule amounts and compute statuses
  if (eligiblePayments.length === 0) {
    const firstMidwayRaw = baseOrRawSchedule.find(
      (s) => Boolean(s.isMidwayClosed || s.closureAdjusted || s.status === "Midway Closed")
    );
    const closureStart = firstMidwayRaw && Number(firstMidwayRaw.installmentNumber) > 0
      ? Number(firstMidwayRaw.installmentNumber)
      : null;

    return baseOrRawSchedule.map((item) => {
      const isSettledMidway = Boolean(
        item.status === "Midway Closed" ||
        item.isMidwayClosed ||
        item.closureAdjusted ||
        (closureStart !== null && Number(item.installmentNumber) >= closureStart)
      );
      if (isSettledMidway) {
        return {
          ...item,
          amountPaid: Math.round(Number(item.amountPaid ?? item.emi ?? 0) * 100) / 100,
          balance: 0,
          status: "Paid",
          closureAdjusted: true,
          isMidwayClosed: true,
          principalOutstanding: 0,
          paymentsList: item.paymentsList || [],
        };
      }
      const amountPaid = Math.round(Number(item.amountPaid || 0) * 100) / 100;
      const emi = Number(item.emi || 0);
      const principal = Number(item.principal ?? (item.emi ? item.emi - (Number(item.interest || 0)) : 0));
      const interest = Number(item.interest ?? item.allocatedInterest ?? item.interestAmount ?? (emi > principal ? emi - principal : 0));
      const balance = Math.max(0, Math.round((emi - amountPaid) * 100) / 100);
      let status = "Due";
      if (balance <= 0.01 && emi > 0) {
        status = "Paid";
      } else if (amountPaid > 0.01) {
        status = "Partial";
      } else {
        const itemDue = new Date(item.dueDate);
        itemDue.setHours(0, 0, 0, 0);
        if (!isNaN(itemDue.getTime()) && itemDue.getTime() < todayDate.getTime()) {
          status = "Overdue";
        } else {
          status = "Due";
        }
      }
      return {
        ...item,
        principal,
        interest,
        emi,
        amountPaid,
        principalPaid: Number(item.principalPaid || 0),
        interestPaid: Number(item.interestPaid || 0),
        balance: balance <= 0.01 ? 0 : balance,
        status,
        isMidwayClosed: false,
        closureAdjusted: false,
        paymentsList: item.paymentsList || [],
      };
    });
  }

  const schedule = baseOrRawSchedule.map((item) => {
    const emi = Number(item.emi || 0);
    const principal = Number(item.principal ?? (item.emi ? item.emi - (Number(item.interest || 0)) : 0));
    const interest = Number(item.interest ?? item.allocatedInterest ?? item.interestAmount ?? (emi > principal ? emi - principal : 0));
    const isMidway = Boolean(item.isMidwayClosed || item.status === "Midway Closed" || item.closureAdjusted);
    return {
      ...item,
      principal,
      interest,
      emi,
      principalOutstanding: item.principalOutstanding !== undefined ? Number(item.principalOutstanding) : undefined,
      amountPaid: isMidway ? (Number(item.amountPaid ?? emi)) : 0,
      principalPaid: isMidway ? (Number(item.principalPaid ?? principal)) : 0,
      interestPaid: isMidway ? (Number(item.interestPaid ?? 0)) : 0,
      balance: isMidway ? 0 : emi,
      status: isMidway ? "Paid" : (item.status || "Due"),
      isMidwayClosed: isMidway,
      closureAdjusted: isMidway,
      paymentsList: [],
    };
  });

  const unassignedPayments = [];
  const sortedPayments = [...eligiblePayments].sort(
    (a, b) => new Date(a.date || 0) - new Date(b.date || 0)
  );

  sortedPayments.forEach((p) => {
    // 1. Explicit allocations array (from Collection.jsx or MidwayClosureModal.jsx)
    if (p.allocations && Array.isArray(p.allocations) && p.allocations.length > 0) {
      let anyAllocated = false;
      p.allocations.forEach((alloc) => {
        const instNum = Number(alloc.installmentNumber);
        const inst = schedule.find((s) => s.installmentNumber === instNum);
        if (inst) {
          const allocAmt = Number(alloc.allocated ?? alloc.amount ?? 0);
          if (allocAmt > 0) {
            anyAllocated = true;
            const intAlloc = Number(alloc.interestPaid ?? 0);
            const prinAlloc = Number(alloc.principalPaid ?? Math.max(0, allocAmt - intAlloc));
            inst.amountPaid += allocAmt;
            inst.interestPaid += intAlloc;
            inst.principalPaid += prinAlloc;
            if (alloc.statusAfter === "Midway Closed" || alloc.isMidwayClosed || alloc.isClosureAdjusted || p.isMidwayClosure) {
              inst.isMidwayClosed = true;
              inst.closureAdjusted = true;
            }
            if (!inst.paymentsList.some((ep) => ep.id === p.id)) {
              inst.paymentsList.push(p);
            }
          }
        }
      });
      if (!anyAllocated && Number(p.amount || 0) > 0) {
        unassignedPayments.push(p);
      }
      return;
    }

    // 2. Explicit installment number / reference
    let matchedNum = null;
    if (p.installmentNumber !== undefined && p.installmentNumber !== null && !isNaN(Number(p.installmentNumber))) {
      matchedNum = Number(p.installmentNumber);
    } else if (p.installmentRef) {
      const match = String(p.installmentRef).match(/#?(\d+)/);
      if (match) matchedNum = Number(match[1]);
    } else if (p.remarks && /installment\s*#?(\d+)/i.test(p.remarks)) {
      const match = String(p.remarks).match(/installment\s*#?(\d+)/i);
      if (match) matchedNum = Number(match[1]);
    }

    if (matchedNum) {
      const inst = schedule.find((s) => s.installmentNumber === matchedNum);
      if (inst) {
        const pAmt = Number(p.amount || 0);
        const remDue = Math.max(0, inst.emi - inst.amountPaid);
        const alloc = Math.min(remDue, pAmt);
        const intDue = Math.max(0, inst.interest - inst.interestPaid);
        const intAlloc = Math.min(intDue, alloc);
        const prinAlloc = alloc - intAlloc;

        inst.amountPaid += alloc;
        inst.interestPaid += intAlloc;
        inst.principalPaid += prinAlloc;
        if (!inst.paymentsList.some((ep) => ep.id === p.id)) {
          inst.paymentsList.push(p);
        }

        const excess = pAmt - alloc;
        if (excess > 0.001) {
          unassignedPayments.push({ ...p, amount: excess, id: `${p.id}-excess` });
        }
        return;
      }
    }

    // 3. Otherwise unassigned, allocate FIFO
    unassignedPayments.push(p);
  });

  // Distribute unassigned payments FIFO across oldest unpaid installments
  let unassignedIdx = 0;
  let unassignedRemAmt = unassignedPayments[0] ? Number(unassignedPayments[0].amount || 0) : 0;

  schedule.forEach((inst) => {
    let remDue = Math.max(0, inst.emi - inst.amountPaid);
    while (remDue > 0.01 && unassignedIdx < unassignedPayments.length) {
      const currP = unassignedPayments[unassignedIdx];
      if (unassignedRemAmt <= 0.001) {
        unassignedIdx++;
        if (unassignedIdx < unassignedPayments.length) {
          unassignedRemAmt = Number(unassignedPayments[unassignedIdx].amount || 0);
        }
        continue;
      }

      const alloc = Math.min(remDue, unassignedRemAmt);
      const intDue = Math.max(0, inst.interest - inst.interestPaid);
      const intAlloc = Math.min(intDue, alloc);
      const prinAlloc = alloc - intAlloc;

      inst.amountPaid += alloc;
      inst.interestPaid += intAlloc;
      inst.principalPaid += prinAlloc;
      remDue -= alloc;
      unassignedRemAmt -= alloc;

      if (!inst.paymentsList.some((ep) => ep.id === currP.id)) {
        inst.paymentsList.push(currP);
      }

      if (unassignedRemAmt <= 0.001) {
        unassignedIdx++;
        if (unassignedIdx < unassignedPayments.length) {
          unassignedRemAmt = Number(unassignedPayments[unassignedIdx].amount || 0);
        }
      }
    }
  });

  // Check if there is an explicit midway closure in eligiblePayments or baseOrRawSchedule
  const midwayPayment = eligiblePayments.find(
    (p) => Boolean(p.isMidwayClosure) || String(p.remarks || "").toLowerCase().includes("midway closure")
  );

  let closureStartNum = null;
  if (midwayPayment) {
    if (midwayPayment.allocations && midwayPayment.allocations.length > 0) {
      const minAllocNum = Math.min(
        ...midwayPayment.allocations.map((a) => Number(a.installmentNumber)).filter((n) => !isNaN(n) && n > 0)
      );
      if (isFinite(minAllocNum) && minAllocNum > 0) {
        closureStartNum = minAllocNum;
      }
    }
    if (closureStartNum === null) {
      const rangeMatch = String(midwayPayment.installmentNumber || midwayPayment.remarks || "").match(/#(\d+)/);
      if (rangeMatch) {
        closureStartNum = Number(rangeMatch[1]);
      }
    }
  }

  // Fallback: check baseOrRawSchedule for the first explicitly midway-closed row
  if (closureStartNum === null) {
    const firstMidwayRaw = baseOrRawSchedule.find(
      (s) => Boolean(s.isMidwayClosed || s.closureAdjusted || s.status === "Midway Closed")
    );
    if (firstMidwayRaw && Number(firstMidwayRaw.installmentNumber) > 0) {
      closureStartNum = Number(firstMidwayRaw.installmentNumber);
    }
  }

  // Calculate balances and final statuses
  return schedule.map((item) => {
    const roundedPaid = Math.round(item.amountPaid * 100) / 100;
    const balance = Math.max(0, Math.round((item.emi - roundedPaid) * 100) / 100);

    const isMidwayRow = Boolean(
      item.isMidwayClosed ||
      item.status === "Midway Closed" ||
      item.closureAdjusted ||
      (closureStartNum !== null && Number(item.installmentNumber) >= closureStartNum)
    );

    // If this instalment was settled through midway closure:
    // Status MUST be 'Paid', balance 0, and partial is never shown.
    if (isMidwayRow) {
      return {
        ...item,
        amountPaid: roundedPaid > 0 ? roundedPaid : item.emi,
        principalOutstanding: 0,
        balance: 0,
        status: "Paid",
        isMidwayClosed: true,
        closureAdjusted: true,
      };
    }

    let status = "Due";
    if (balance <= 0.01 && item.emi > 0) {
      status = "Paid";
    } else if (roundedPaid > 0.01) {
      status = "Partial";
    } else {
      const itemDue = new Date(item.dueDate);
      itemDue.setHours(0, 0, 0, 0);
      if (!isNaN(itemDue.getTime()) && itemDue.getTime() < todayDate.getTime()) {
        status = "Overdue";
      } else {
        status = "Due";
      }
    }

    return {
      ...item,
      amountPaid: roundedPaid,
      balance: balance <= 0.01 ? 0 : balance,
      status,
      isMidwayClosed: false,
      closureAdjusted: false,
    };
  });
};

const StatusBadge = ({ status, isMidwaySettled = false, penaltyAmount = null }) => {
  if (status === 'Paid') {
    if (isMidwaySettled) {
      return (
        <span className="inline-flex items-center rounded-full bg-orange-100/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-900 border border-amber-300 ring-1 ring-amber-500/20">
          Paid
        </span>
      );
    }
    return <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-inset ring-emerald-600/20">Paid</span>;
  }
  if (status === 'Midway Closed') {
    return (
      <span className="inline-flex items-center rounded-full bg-orange-100/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-900 border border-amber-300 ring-1 ring-amber-500/20">
        Paid
      </span>
    );
  }
  if (status === 'Partial') return <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-700 ring-1 ring-inset ring-amber-600/20">Partial</span>;
  if (status === 'Overdue') {
    return (
      <div className="flex flex-col items-center justify-center gap-0.5">
        <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-red-700 ring-1 ring-inset ring-red-600/10">
          Overdue
        </span>
        {penaltyAmount > 0 && (
          <span className="text-[10px] font-semibold text-[#006052] whitespace-nowrap leading-tight">
            Penalty: ₹{Number(penaltyAmount).toLocaleString('en-IN')}
          </span>
        )}
      </div>
    );
  }
  return <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-700 ring-1 ring-inset ring-slate-500/20">Due</span>;
};

export const getRepaymentColumnLabel = (frequency) => {
  if (!frequency) return 'EMI';
  const lower = String(frequency).trim().toLowerCase();
  if (lower === 'daily') return 'Daily Installment';
  if (lower === 'weekly') return 'Weekly Installment';
  return 'EMI';
};

export default function RepaymentScheduleTable({ loanDetails = {}, schedule: propSchedule }) {
  const [penaltySettings, setPenaltySettings] = useState(() => getPenaltySettings());
  const [penaltyRecords, setPenaltyRecords] = useState(() => getPenaltyRecords());

  useEffect(() => {
    const handlePenaltyUpdate = () => {
      setPenaltySettings(getPenaltySettings());
      setPenaltyRecords(getPenaltyRecords());
    };
    window.addEventListener(PENALTY_UPDATE_EVENT, handlePenaltyUpdate);
    window.addEventListener('storage', handlePenaltyUpdate);
    return () => {
      window.removeEventListener(PENALTY_UPDATE_EVENT, handlePenaltyUpdate);
      window.removeEventListener('storage', handlePenaltyUpdate);
    };
  }, []);

  const generatedSchedule = useMemo(() => generateSchedule(loanDetails), [loanDetails]);

  const schedule = useMemo(() => {
    if (propSchedule && propSchedule.length > 0) {
      return propSchedule;
    }
    if (loanDetails?.repaymentSchedule && loanDetails.repaymentSchedule.length > 0) {
      return loanDetails.repaymentSchedule;
    }
    return generatedSchedule;
  }, [propSchedule, loanDetails, generatedSchedule]);

  const frequency = loanDetails?.paymentFrequency || (schedule[0]?.paymentFrequency) || 'Monthly';
  const repaymentColumnHeader = getRepaymentColumnLabel(frequency);

  if (!propSchedule && (!loanDetails?.loanAmount || !loanDetails?.interestRate || !loanDetails?.tenure)) {
    return (
      <div className="flex items-center justify-center py-12 px-4 text-center">
        <p className="text-sm font-medium text-slate-500">
          Incomplete loan details. Please enter Principal Amount, Interest Rate, and Tenure to generate a schedule.
        </p>
      </div>
    );
  }

  if (schedule.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 px-4 text-center">
        <p className="text-sm font-medium text-slate-500">
          Unable to generate schedule. Please check the entered values.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left font-semibold text-slate-700">Instalment Number</th>
            <th className="px-4 py-3 text-left font-semibold text-slate-700">Due Date</th>
            <th className="px-4 py-3 text-right font-semibold text-slate-700">Principal</th>
            <th className="px-4 py-3 text-right font-semibold text-slate-700">Interest</th>
            <th className="px-4 py-3 text-right font-semibold text-slate-700">Total EMI</th>
            <th className="px-4 py-3 text-right font-semibold text-slate-700">Principal Outstanding</th>
            <th className="px-4 py-3 text-right font-semibold text-slate-700">Balance Amount</th>
            <th className="px-4 py-3 text-center font-semibold text-slate-700">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {schedule.map((row) => {
            const isMidwaySettled = Boolean(row.isMidwayClosed || row.closureAdjusted || row.status === "Midway Closed");
            const isOverdue = !isMidwaySettled && row.status === 'Overdue';
            const penaltyAmount = isOverdue
              ? getInstallmentPenaltySupportingAmount(row, {
                  loanId: loanDetails?.loanId || row.loanId,
                  frequency,
                  settings: penaltySettings,
                  penaltyRecords,
                })
              : null;

            return (
              <tr
                key={row.installmentNumber}
                className={`transition-colors ${
                  isMidwaySettled
                    ? "bg-amber-50/70 hover:bg-amber-100/60"
                    : "hover:bg-slate-50"
                }`}
              >
                <td className={`whitespace-nowrap px-4 py-3 font-medium ${isMidwaySettled ? "text-amber-950 font-semibold" : "text-slate-600"}`}>
                  {row.installmentNumber}
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{formatDate(row.dueDate)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatINR(row.principal)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatINR(row.interest)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-emerald-800">{formatINR(row.emi)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-slate-700">{formatINR(row.principalOutstanding)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-900">{formatINR(row.balance)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-center">
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
  );
}
