import React from 'react';
import { X, CalendarDays } from 'lucide-react';
import RepaymentScheduleTable from './RepaymentScheduleTable';
import { calculateRepayment } from './Loantab';

const formatINR = (value) => {
  if (value === undefined || value === null || isNaN(Number(value))) return '₹0';
  return `₹${Math.round(Number(value)).toLocaleString('en-IN')}`;
};

export default function RepaymentScheduleModal({ isOpen, onClose, loanDetails }) {
  if (!isOpen) return null;

  const P = Number(loanDetails.loanAmount) || 0;
  
  // Reuse existing calculateRepayment to get summary values exactly as they appear in the form
  const repaymentSummary = calculateRepayment({
    principal: P,
    interestRate: loanDetails.interestRate,
    tenure: loanDetails.tenure,
    tenureUnit: loanDetails.tenureUnit,
    paymentFrequency: loanDetails.paymentFrequency,
    interestType: loanDetails.interestType,
    repaymentMethod: loanDetails.repaymentMethod,
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 sm:p-6 backdrop-blur-sm">
      <div className="flex h-full max-h-[90vh] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Repayment Schedule</h2>
              <p className="text-xs font-medium text-slate-500">Preview of the installment plan</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Summary Details */}
        {P > 0 && repaymentSummary.numberOfPayments > 0 && (
          <div className="grid grid-cols-2 gap-4 border-b border-slate-100 bg-slate-50 px-6 py-4 md:grid-cols-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Loan Amount</p>
              <p className="mt-1 font-bold text-slate-900">{formatINR(P)}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Interest Type</p>
              <p className="mt-1 font-semibold text-slate-700">{loanDetails.interestType || '—'}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Frequency</p>
              <p className="mt-1 font-semibold text-slate-700">{loanDetails.paymentFrequency || '—'}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Installments</p>
              <p className="mt-1 font-semibold text-slate-700">{repaymentSummary.numberOfPayments}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total Repayable</p>
              <p className="mt-1 font-bold text-emerald-800">{formatINR(repaymentSummary.totalPayable)}</p>
            </div>
          </div>
        )}

        {/* Schedule Table */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <RepaymentScheduleTable loanDetails={loanDetails} />
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4 text-right">
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
