import React, { useState, useEffect } from 'react';
import { Calculator, ArrowRight, Eye, RefreshCw, AlertTriangle } from 'lucide-react';
import { Field, AdornedInput, formatINR, formatDate } from './Formcontrols';
import RepaymentScheduleModal from './RepaymentScheduleModal';

const digits = (value = '') => value.replace(/\D/g, '');

const calculateCustomPlan = (P, monthlyRate, freq, interestType, E_new, originalLoanDetails) => {
  if (P <= 0 || E_new <= 0) return null;
  
  let r_periodic = monthlyRate / 100;
  if (freq === 'Daily') {
    r_periodic = (monthlyRate / 100) / 30;
  } else if (freq === 'Weekly') {
    r_periodic = (monthlyRate / 100) / (52 / 12);
  }

  let N = 0;
  let totalInterest = 0;
  let totalPayable = 0;

  if (interestType === 'Reducing Balance') {
    if (r_periodic === 0) {
      N = Math.ceil(P / E_new);
      totalInterest = 0;
      totalPayable = P;
    } else {
      if (E_new <= P * r_periodic) return { error: 'Installment must be greater than periodic interest.' };
      
      let balance = P;
      while (balance > 0.01 && N < 1200) {
        let interest = balance * r_periodic;
        let principal = E_new - interest;
        
        if (principal >= balance) {
          principal = balance;
          interest = balance * r_periodic;
        }
        
        balance -= principal;
        totalInterest += interest;
        N++;
      }
      if (N >= 1200) return { error: 'Installment too low (exceeds 100 years).' };
      totalPayable = P + totalInterest;
    }
  } else {
    // Flat Interest
    if (r_periodic === 0) {
      N = Math.ceil(P / E_new);
      totalInterest = 0;
      totalPayable = P;
    } else {
      if (E_new <= P * r_periodic) return { error: 'Installment must be greater than periodic interest.' };
      const N_exact = P / (E_new - P * r_periodic);
      N = Math.ceil(N_exact);
      if (N > 1200) return { error: 'Installment too low (exceeds 100 years).' };
      totalInterest = P * r_periodic * N;
      totalPayable = P + totalInterest;
    }
  }

  // Generate modified loan details to pass into modal to verify due date
  let modifiedLoan = {
    ...originalLoanDetails,
    tenure: String(N),
    tenureUnit: originalLoanDetails.paymentFrequency === 'Weekly' ? 'Weeks' : 'Months',
    repaymentMethod: 'EMI' // Force EMI behavior if reducing balance
  };

  // Calculate approx duration
  let approxWeeks = 0;
  let approxMonths = 0;
  if (freq === 'Weekly') { approxWeeks = N; approxMonths = (N / (52 / 12)).toFixed(1); }
  else if (freq === 'Monthly') { approxMonths = N; approxWeeks = (N * (52 / 12)).toFixed(1); }
  else if (freq === 'Daily') { approxWeeks = (N / 7).toFixed(1); approxMonths = (N / 30).toFixed(1); }

  return { N, totalInterest, totalPayable, modifiedLoan, approxWeeks, approxMonths };
};

export default function RepaymentCalculator({ loanData, repaymentSummary, onChange }) {
  const [affordableEMI, setAffordableEMI] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);

  // Sync initial value when repayment summary is available
  useEffect(() => {
    if (repaymentSummary && repaymentSummary.emiAmount > 0 && !results && !affordableEMI) {
      setAffordableEMI(Math.round(repaymentSummary.emiAmount).toString());
    }
  }, [repaymentSummary, results, affordableEMI]);

  const handleCalculate = () => {
    setError('');
    setResults(null);
    const P = Number(loanData.loanAmount) || 0;
    const E_new = Number(affordableEMI) || 0;
    const monthlyRate = Number(loanData.interestRate) || 0;
    const freq = loanData.paymentFrequency || 'Monthly';
    
    if (P <= 0) {
      setError('Enter loan amount first.');
      return;
    }
    if (E_new <= 0) {
      setError('Enter a valid affordable installment.');
      return;
    }

    const res = calculateCustomPlan(P, monthlyRate, freq, loanData.interestType, E_new, loanData);
    
    if (!res) {
      setError('Unable to calculate.');
    } else if (res.error) {
      setError(res.error);
    } else {
      setResults(res);
    }
  };

  const handleApply = () => {
    if (!results) return;
    
    let newTenureUnit = loanData.tenureUnit;
    let newTenure = results.N;

    // Convert exact periods back to the user's selected tenure unit if possible
    const freq = loanData.paymentFrequency;
    if (newTenureUnit === 'Years') {
      if (freq === 'Monthly') newTenure = (results.N / 12).toFixed(2);
      else if (freq === 'Weekly') newTenure = (results.N / 52).toFixed(2);
      else if (freq === 'Daily') newTenure = (results.N / 365).toFixed(2);
    } else if (newTenureUnit === 'Months') {
      if (freq === 'Weekly') newTenure = (results.N / (52 / 12)).toFixed(2);
      else if (freq === 'Daily') newTenure = (results.N / 30).toFixed(2);
      else if (freq === 'Monthly') newTenure = results.N;
    }

    // Set tenure and potentially repayment method
    onChange('tenure', newTenure.toString());
    if (loanData.interestType === 'Reducing Balance' && loanData.repaymentMethod === 'Principal') {
      onChange('repaymentMethod', 'EMI');
    }
    setResults(null);
    setIsCalculatorOpen(false); // Close calculator modal after applying
  };

  return (
    <>
      <button
        onClick={() => setIsCalculatorOpen(true)}
        className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 hover:text-emerald-800 transition-colors"
      >
        <Calculator className="h-4 w-4" /> Use Installment Calculator
      </button>

      {isCalculatorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 sm:p-6 backdrop-blur-sm">
          <div className="flex h-auto max-h-[90vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                  <Calculator className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-[15px] font-bold text-slate-900">Installment Calculator</h2>
                </div>
              </div>
              <button
                onClick={() => setIsCalculatorOpen(false)}
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="overflow-y-auto p-5 space-y-5">
              
              <div>
                <Field label={`Affordable Installment (${loanData.paymentFrequency || 'Monthly'})`}>
                  <AdornedInput
                    prefix="₹"
                    inputMode="numeric"
                    value={affordableEMI}
                    onChange={(e) => setAffordableEMI(digits(e.target.value))}
                    placeholder="e.g. 2000"
                  />
                </Field>
                <button
                  onClick={handleCalculate}
                  className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-md bg-emerald-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-900 transition-colors shadow-sm"
                >
                  <RefreshCw className="h-4 w-4" /> Calculate Plan
                </button>
              </div>

              {error && (
                <div className="flex items-start gap-2 bg-red-50 text-red-700 p-3 rounded-md text-xs font-medium">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              {results && (
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Installment</p>
                      <p className="font-bold text-slate-900">{formatINR(affordableEMI)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Total Installments</p>
                      <p className="font-bold text-slate-900">{results.N}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Total Interest</p>
                      <p className="font-medium text-slate-700">{formatINR(results.totalInterest)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Total Repayment</p>
                      <p className="font-bold text-emerald-800">{formatINR(results.totalPayable)}</p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-200">
                    <p className="text-xs font-medium text-slate-600">
                      Approx. Duration: <span className="text-slate-900 font-semibold">{results.approxMonths > 0 && `${results.approxMonths} Months`} {results.approxWeeks > 0 && `(${results.approxWeeks} Weeks)`}</span>
                    </p>
                  </div>

                  {results.N > repaymentSummary.numberOfPayments && (
                    <div className="flex items-start gap-2 bg-amber-50 text-amber-800 p-3 rounded-lg text-xs font-medium mt-3 border border-amber-100/50">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <p className="leading-snug">This plan increases the original tenure from {repaymentSummary.numberOfPayments} to {results.N} installments.</p>
                    </div>
                  )}

                  <div className="flex flex-col gap-2.5 mt-5 pt-3 border-t border-slate-200">
                    <button
                      onClick={() => setShowModal(true)}
                      className="w-full inline-flex justify-center items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
                    >
                      <Eye className="h-4 w-4 text-slate-500" /> View Schedule
                    </button>
                    <button
                      onClick={handleApply}
                      className="w-full inline-flex justify-center items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition-colors"
                    >
                      Apply to Loan <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {results && (
        <RepaymentScheduleModal 
          isOpen={showModal} 
          onClose={() => setShowModal(false)} 
          loanDetails={results.modifiedLoan} 
        />
      )}
    </>
  );
}
