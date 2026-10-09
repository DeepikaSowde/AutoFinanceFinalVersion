import React, { useEffect, useState } from 'react'

import CustomerTab from '../components/CustomerTab'
import VehicleTab from '../components/Vehicletab'
import GuarantorTab from '../components/Guarantortab'
import LoanTab from '../components/Loantab'
import ReviewTab from '../components/Reviewtab'

import { ArrowLeft, ArrowRight } from '../components/Formcontrols'

import { useTranslation } from 'react-i18next'

import {
  saveCustomerOnboarding,
  getCustomerOnboarding,
  clearCustomerOnboarding
} from '../utils/customerOnboardingStorage'

import { calculateRepayment } from '../components/Loantab'
import { CheckCircle2, X } from 'lucide-react'

const STEPS = [
  { key: 'customer', labelKey: 'app.steps.customer', titleKey: 'app.titles.customer', subtitleKey: 'app.subtitles.customer' },
  { key: 'vehicle', labelKey: 'app.steps.vehicle', titleKey: 'app.titles.vehicle', subtitleKey: 'app.subtitles.vehicle' },
  { key: 'loan', labelKey: 'app.steps.loan', titleKey: 'app.titles.loan', subtitleKey: 'app.subtitles.loan' },
  { key: 'review', labelKey: 'app.steps.review', titleKey: 'app.titles.review', subtitleKey: 'app.subtitles.review' },
]

const initialForm = () => ({
  customer: {
    applicationDate: new Date().toISOString().slice(0, 10),
    name: '', countryCode: '+91', mobile: '', profession: '', residenceType: 'Own House', referredBy: '', referredByPercentage: '',
    address: '', area: '', landmark: '', pincode: '',
    aadhaarNo: '', aadhaarFile: null, panNo: '', panFile: null,
    dlNo: '', dlFile: null, voterNo: '', voterFile: null,
  },
  vehicle: {
    type: '', brand: '', model: '', variant: '', colour: '', year: '', fuelType: '', amount: '', photo: null,
    regNo: '', rto: '', regDate: '', chassisNo: '', engineNo: '',
    hypothecation: 'No', financier: '', nocStatus: '', nocFile: null,
    taxExpiry: '', insuranceCompany: '', policyNo: '', insuranceExpiry: '',
    financierEndorsement: 'No', insuranceFile: null, remarks: '',
  },
  guarantor: {
    required: 'Yes',
    name: '', countryCode: '+91', mobile: '', relationship: '', profession: '', residenceType: 'Own House',
    address: '', area: '', landmark: '', pincode: '',
    aadhaarNo: '', aadhaarFile: null, panNo: '', panFile: null,
    dlNo: '', dlFile: null, voterNo: '', voterFile: null,
    photo: null, verificationStatus: '', remarks: '',
  },
  loan: {
    vehicleAmount: null,
    loanAmount: '',
    referredBy: '',
    referredByCommission: '',
    downPayment: '', interestType: 'Flat', interestRate: '', paymentFrequency: '',
    tenure: '', tenureUnit: 'Months', firstDueDate: '', documentCharge: '',
    customizeRules: false, gracePeriod: '', latePenalty: '', penaltyType: 'Per Day',
  },
})

/* ---------- stepper ---------- */
const Stepper = ({ current, onStepClick, t }) => (
  <ol className="flex items-start">
    {STEPS.map((s, i) => {
      const done = i < current
      const active = i === current
      return (
        <li key={s.key} className="flex flex-1 items-start last:flex-none">
          <button
            type="button"
            onClick={() => onStepClick(i)}
            className="flex flex-col items-center gap-1 focus:outline-none"
            aria-current={active ? 'step' : undefined}
          >
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold ${
                done || active
                  ? 'border-emerald-800 bg-emerald-800 text-white'
                  : 'border-slate-300 bg-white text-slate-500'
              } ${active ? 'ring-4 ring-emerald-100' : ''}`}
            >
              {done ? '✓' : i + 1}
            </span>
            <span className={`text-[11px] sm:text-xs ${active ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>{t(s.labelKey)}</span>
          </button>
          {i < STEPS.length - 1 && (
            <span className={`mx-1 mt-3.5 h-0.5 flex-1 sm:mx-2 ${done ? 'bg-emerald-700' : 'bg-slate-200'}`} />
          )}
        </li>
      )
    })}
  </ol>
)

/* ---------- page ---------- */
const NewLoan = () => {
  const { t } = useTranslation()

  const [step, setStep] = useState(0)
  const [customerSection, setCustomerSection] = useState('customer')

  const [form, setForm] = useState(() => {
    return getCustomerOnboarding() || initialForm()
  })

  const [verified, setVerified] = useState(false)

  useEffect(() => {
    saveCustomerOnboarding(form)
  }, [form])

  const update = (section) => (field, value) =>
    setForm((f) => ({
      ...f,
      [section]: {
        ...f[section],
        [field]: value,
      },
    }))

  const current = STEPS[step]
  const isFirst = step === 0
  const isLast = step === STEPS.length - 1
  const goNext = () => setStep((s) => Math.min(s + 1, STEPS.length - 1))
  const goBack = () => setStep((s) => Math.max(s - 1, 0))
  const goFromCustomer = () => {
    if (customerSection === 'customer' && form.guarantor.required === 'Yes') {
      setCustomerSection('guarantor')
      return
    }
    setStep(1)
  }
  const updateGuarantor = (field, value) => {
    update('guarantor')(field, value)
    if (field === 'required' && value === 'Yes') {
      setCustomerSection('guarantor')
    }
  }

  const [showSuccess, setShowSuccess] = useState(false)
  const [submittedLoan, setSubmittedLoan] = useState(null)

  // TODO: connect these to your API
  const handleSaveDraft = () => console.log('Save draft', form)
  
  const handleSubmit = () => {
    try {
      // 1. Generate Loan ID
      const customersList = JSON.parse(localStorage.getItem("motoLendCustomersList_data") || "[]")
      const loanCount = customersList.length + 1
      const loanId = `LN${loanCount.toString().padStart(5, '0')}`
      
      const mobile = form.customer.mobile || ""
      const customerId = `CUS-${mobile.slice(-5) || "000"}`

      // 2. Calculate EMI & Due Date
      const vehicleAmount = form.loan.vehicleAmount !== null && form.loan.vehicleAmount !== '' ? Number(form.loan.vehicleAmount) : Number(form.vehicle.amount || 0)
      const principal = Math.max(vehicleAmount - Number(form.loan.downPayment || 0), 0)
      
      // Calculate Total Available Pool
      const investors = JSON.parse(localStorage.getItem('motoLendInvestors_data') || "[]")
      const totalInvestedGlobal = investors.reduce((sum, inv) => {
        const ob = inv.transactions?.find(t => t.type === "Opening Balance")?.amount || 0;
        const newInv = inv.transactions?.filter(t => t.type === "New Investment" || t.type === "Re-Investment").reduce((s, t) => s + (t.amount || 0), 0) || 0;
        return sum + ob + newInv;
      }, 0);
      
      const totalDebitsGlobal = investors.reduce((sum, inv) => {
        const debits = inv.transactions?.filter(t => t.type === "Debit").reduce((s, t) => s + (t.amount || 0), 0) || 0;
        return sum + debits;
      }, 0);
      
      const totalDeployedToLoans = customersList.reduce((sum, c) => sum + (c.loanAmount || 0), 0);
      const totalAvailablePool = totalInvestedGlobal - totalDebitsGlobal - totalDeployedToLoans;
      
      if (principal > totalAvailablePool) {
        alert("Insufficient available balance for this loan.");
        return;
      }
      
      const repayment = calculateRepayment({
        principal: principal,
        interestRate: form.loan.interestRate,
        tenure: form.loan.tenure,
        tenureUnit: form.loan.tenureUnit,
        paymentFrequency: form.loan.paymentFrequency,
        interestType: form.loan.interestType,
        repaymentMethod: 'EMI'
      })
      
      const emiAmount = repayment.emiAmount || 0
      
      // 3. Construct submitted data
      const newEntry = {
        ...form,
        customerId: customerId,
        loanId: loanId,
        loanAmount: principal,
        emiAmount: emiAmount,
        paymentFrequency: form.loan.paymentFrequency,
        nextDueDate: form.loan.firstDueDate,
        status: "Active"
      }
      
      // 4. Update existing customer or create new
      const existingCustomerIndex = customersList.findIndex(c => c.customerId === customerId || (c.customer && c.customer.mobile === mobile))
      if (existingCustomerIndex >= 0) {
        customersList[existingCustomerIndex] = {
          ...customersList[existingCustomerIndex],
          ...newEntry
        }
      } else {
        customersList.push(newEntry)
      }
      
      // 5. Save to local storage
      localStorage.setItem("motoLendCustomersList_data", JSON.stringify(customersList))
      
      // 6. Show Popup
      setSubmittedLoan(newEntry)
      setShowSuccess(true)
    } catch (e) {
      console.error("Submission failed", e)
      alert("Error submitting loan application.")
    }
  }

  const handleClosePopup = () => {
    setShowSuccess(false)
    setSubmittedLoan(null)
    clearCustomerOnboarding()
    setForm(initialForm())
    setStep(0)
    setCustomerSection('customer')
    setVerified(false)
  }

  const handleViewSchedule = () => console.log('View repayment schedule')
  const handleFetchVehicle = () => console.log('Fetch vehicle details', form.vehicle.regNo)

  const outlineBtn = 'rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:border-emerald-700 hover:text-emerald-800'
  const primaryBtn = 'inline-flex items-center justify-center gap-2 rounded-md bg-emerald-800 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <div className="mx-auto h-[calc(100vh-3rem)] w-full max-w-5xl p-2 sm:p-4">
      <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm [zoom:0.85] sm:[zoom:0.9]">
        {/* Header */}
        <div className="shrink-0 space-y-3 px-4 pt-4 sm:px-6">
          <div>
            <h1 className="text-lg font-semibold text-slate-900 sm:text-xl">{t(current.titleKey)}</h1>
            <p className="text-sm text-slate-500">{t(current.subtitleKey)}</p>
          </div>
          <Stepper current={step} onStepClick={setStep} t={t} />
        </div>

        {/* Active tab */}
        <div className="min-h-0 flex-1 overflow-hidden px-4 py-4 sm:px-6">
          {step === 0 && (
            <div className="space-y-3">
              <div className="rounded-lg border border-slate-200 bg-white p-1.5">
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {[
                    { id: 'customer', label: t('app.sections.customer'), description: t('app.sections.customerDescription') },
                    { id: 'guarantor', label: t('app.sections.guarantor'), description: t('app.sections.guarantorDescription') },
                  ].map((section) => {
                    const active = customerSection === section.id
                    return (
                      <button
                        key={section.id}
                        type="button"
                        onClick={() => setCustomerSection(section.id)}
                        className={`rounded-md px-3 py-2.5 text-left transition ${
                          active ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100' : 'text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        <span className="block text-sm font-semibold">{section.label}</span>
                        <span className="mt-0.5 block text-[11px]">{section.description}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
              {customerSection === 'customer' ? (
                <CustomerTab data={form.customer} onChange={update('customer')} />
              ) : (
                <GuarantorTab data={form.guarantor} onChange={updateGuarantor} />
              )}
            </div>
          )}
          {step === 1 && <VehicleTab data={form.vehicle} onChange={update('vehicle')} onFetchVehicle={handleFetchVehicle} />}
          {step === 2 && (
            <LoanTab
              data={form.loan}
              vehicleAmountFromVehicle={form.vehicle.amount}
              onChange={update('loan')}
              onViewSchedule={handleViewSchedule}
            />
          )}
          {step === 3 && <ReviewTab form={form} onViewSchedule={handleViewSchedule} />}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 flex-col gap-3 border-t border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            {!isFirst && (
              <button type="button" onClick={goBack} className={`${outlineBtn} inline-flex w-full items-center justify-center gap-2 sm:w-auto`}>
                <ArrowLeft className="h-4 w-4" /> {t('app.back')}
              </button>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {isLast && (
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} className="h-4 w-4 accent-emerald-700" />
                {t('app.verifiedDetails')}
              </label>
            )}
            <button type="button" onClick={handleSaveDraft} className={outlineBtn}>{t('app.saveDraft')}</button>
            {isLast ? (
              <button type="button" onClick={handleSubmit} disabled={!verified} className={primaryBtn}>
                {t('app.submitApplication')} <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button type="button" onClick={step === 0 ? goFromCustomer : goNext} className={primaryBtn}>
                {t('app.next')}: {step === 0 && customerSection === 'customer' && form.guarantor.required === 'Yes'
                  ? t('app.sections.guarantor')
                  : t(STEPS[step + 1].labelKey)} <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* SUCCESS POPUP */}
      {showSuccess && submittedLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            
            <div className="flex flex-col items-center mb-6">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">New Loan Created</h3>
            </div>
            
            <div className="space-y-4 rounded-lg bg-slate-50 p-4 text-sm">
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500">Customer:</span>
                <span className="font-semibold text-slate-900">{submittedLoan.customer.name}</span>
              </div>
              
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500">Loan ID:</span>
                <span className="font-semibold text-slate-900">{submittedLoan.loanId}</span>
              </div>
              
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500">Loan Amount:</span>
                <span className="font-semibold text-slate-900">
                  ₹{Number(submittedLoan.loanAmount).toLocaleString('en-IN')}
                </span>
              </div>
              
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500">EMI:</span>
                <span className="font-semibold text-slate-900 text-right">
                  ₹{Number(submittedLoan.emiAmount).toLocaleString('en-IN')} / {submittedLoan.paymentFrequency || 'Monthly'}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-slate-500">Next Due Date:</span>
                <span className="font-semibold text-slate-900">
                  {submittedLoan.nextDueDate ? new Date(submittedLoan.nextDueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                </span>
              </div>
            </div>
            
            <div className="mt-6 flex flex-col gap-3">
              <button 
                onClick={handleClosePopup}
                className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
              >
                Done
              </button>
              <button 
                onClick={handleClosePopup}
                className="w-full text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
              >
                Cancel
              </button>
            </div>
            
          </div>
        </div>
      )}
    </div>
  )
}

export default NewLoan