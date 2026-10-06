import React, { useState } from 'react'
import CustomerTab from '../components/CustomerTab'
import VehicleTab from '../components/Vehicletab'
import GuarantorTab from '../components/Guarantortab'
import LoanTab from '../components/Loantab'
import ReviewTab from '../components/Reviewtab'
import { ArrowLeft, ArrowRight } from '../components/Formcontrols'

const STEPS = [
  { key: 'customer', label: 'Customer', title: 'New Loan Application', subtitle: 'Complete the details below to continue with the loan application.' },
  { key: 'vehicle', label: 'Vehicle', title: 'Vehicle Details', subtitle: 'Enter and verify the vehicle information' },
  { key: 'guarantor', label: 'Guarantor', title: 'Guarantor Details', subtitle: 'Provide guarantor information (if required)' },
  { key: 'loan', label: 'Loan', title: 'Loan Details', subtitle: 'Enter loan information and set repayment rules (optional).' },
  { key: 'review', label: 'Review', title: 'Review & Submit', subtitle: 'Please verify all the details before submitting the application.' },
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
    vehicleAmount: null, // null = follow the amount entered on the Vehicle tab
    downPayment: '', interestType: 'Flat', interestRate: '', paymentFrequency: '',
    tenure: '', tenureUnit: 'Months', firstDueDate: '', documentCharge: '',
    customizeRules: false, gracePeriod: '', latePenalty: '', penaltyType: 'Per Day',
  },
})

/* ---------- stepper ---------- */
const Stepper = ({ current, onStepClick }) => (
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
            <span className={`text-[11px] sm:text-xs ${active ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>{s.label}</span>
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
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(initialForm)
  const [verified, setVerified] = useState(false)

  const update = (section) => (field, value) =>
    setForm((f) => ({ ...f, [section]: { ...f[section], [field]: value } }))

  const current = STEPS[step]
  const isFirst = step === 0
  const isLast = step === STEPS.length - 1
  const goNext = () => setStep((s) => Math.min(s + 1, STEPS.length - 1))
  const goBack = () => setStep((s) => Math.max(s - 1, 0))

  // TODO: connect these to your API
  const handleSaveDraft = () => console.log('Save draft', form)
  const handleSubmit = () => console.log('Submit application', form)
  const handleViewSchedule = () => console.log('View repayment schedule')
  const handleFetchVehicle = () => console.log('Fetch vehicle details', form.vehicle.regNo)

  const outlineBtn = 'rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:border-emerald-700 hover:text-emerald-800'
  const primaryBtn = 'inline-flex items-center justify-center gap-2 rounded-md bg-emerald-800 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <div className="mx-auto h-screen w-full max-w-6xl overflow-hidden p-3 sm:p-6">
      <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Header */}
        <div className="shrink-0 space-y-4 px-4 pt-5 sm:px-6">
          <div>
            <h1 className="text-lg font-semibold text-slate-900 sm:text-xl">{current.title}</h1>
            <p className="text-sm text-slate-500">{current.subtitle}</p>
          </div>
          <Stepper current={step} onStepClick={setStep} />
        </div>

        {/* Active tab */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {step === 0 && <CustomerTab data={form.customer} onChange={update('customer')} />}
          {step === 1 && <VehicleTab data={form.vehicle} onChange={update('vehicle')} onFetchVehicle={handleFetchVehicle} />}
          {step === 2 && <GuarantorTab data={form.guarantor} onChange={update('guarantor')} />}
          {step === 3 && (
            <LoanTab
              data={form.loan}
              vehicleAmountFromVehicle={form.vehicle.amount}
              onChange={update('loan')}
              onViewSchedule={handleViewSchedule}
            />
          )}
          {step === 4 && <ReviewTab form={form} onViewSchedule={handleViewSchedule} />}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 flex-col gap-3 border-t border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            {!isFirst && (
              <button type="button" onClick={goBack} className={`${outlineBtn} inline-flex w-full items-center justify-center gap-2 sm:w-auto`}>
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {isLast && (
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} className="h-4 w-4 accent-emerald-700" />
                I have verified all the above details and documents.
              </label>
            )}
            <button type="button" onClick={handleSaveDraft} className={outlineBtn}>Save Draft</button>
            {isLast ? (
              <button type="button" onClick={handleSubmit} disabled={!verified} className={primaryBtn}>
                Submit Application <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button type="button" onClick={goNext} className={primaryBtn}>
                Next: {STEPS[step + 1].label} <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default NewLoan