import React, { useMemo } from 'react';

const formatINR = (value) => {
  if (value === undefined || value === null || isNaN(Number(value))) return '₹0';
  return `₹${Math.round(Number(value)).toLocaleString('en-IN')}`;
};

const formatDate = (dateString) => {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
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

const StatusBadge = ({ status }) => {
  if (status === 'Paid') return <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-inset ring-emerald-600/20">Paid</span>;
  if (status === 'Partial') return <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-700 ring-1 ring-inset ring-amber-600/20">Partial</span>;
  if (status === 'Overdue') return <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-red-700 ring-1 ring-inset ring-red-600/10">Overdue</span>;
  return <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-700 ring-1 ring-inset ring-slate-500/20">Due</span>;
};

export default function RepaymentScheduleTable({ loanDetails }) {
  const schedule = useMemo(() => generateSchedule(loanDetails), [loanDetails]);

  if (!loanDetails.loanAmount || !loanDetails.interestRate || !loanDetails.tenure) {
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
            <th className="px-4 py-3 text-left font-semibold text-slate-700">No.</th>
            <th className="px-4 py-3 text-left font-semibold text-slate-700">Due Date</th>
            <th className="px-4 py-3 text-right font-semibold text-slate-700">Principal</th>
            <th className="px-4 py-3 text-right font-semibold text-slate-700">Principal Outstanding</th>
            <th className="px-4 py-3 text-right font-semibold text-slate-700">Interest</th>
            <th className="px-4 py-3 text-right font-semibold text-slate-700">Installment</th>
            <th className="px-4 py-3 text-right font-semibold text-slate-700">Amount Paid</th>
            <th className="px-4 py-3 text-right font-semibold text-slate-700">Balance</th>
            <th className="px-4 py-3 text-center font-semibold text-slate-700">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {schedule.map((row) => (
            <tr key={row.installmentNumber} className="hover:bg-slate-50 transition-colors">
              <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-600">{row.installmentNumber}</td>
              <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{formatDate(row.dueDate)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatINR(row.principal)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-slate-700">{formatINR(row.principalOutstanding)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatINR(row.interest)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-emerald-800">{formatINR(row.emi)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatINR(row.amountPaid)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-900">{formatINR(row.balance)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-center"><StatusBadge status={row.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
