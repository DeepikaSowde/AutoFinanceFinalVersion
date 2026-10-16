import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import CustomerTab from '../components/CustomerTab'
import VehicleTab from '../components/Vehicletab'
import LoanTab from '../components/Loantab'
import ReviewTab from '../components/Reviewtab'
import RepaymentScheduleModal from '../components/RepaymentScheduleModal'

import { ArrowLeft, ArrowRight } from '../components/Formcontrols'

import { useTranslation } from 'react-i18next'

import {
  saveCustomerOnboarding,
  getCustomerOnboarding,
  clearCustomerOnboarding
} from '../utils/customerOnboardingStorage'

import { calculateRepayment } from '../components/Loantab'
import { CheckCircle2, X } from 'lucide-react'
import { recordPersonRelationship, syncDocumentChargeIncome } from '../utils/guarantorReferralStorage'
import { getVehicleModelImage, getVehicleDisplayImage } from '../utils/vehicleImageHelper'
import { formatDate } from '../utils/dateUtils'

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
    name: '', fullName: '', countryCode: '+91', mobile: '', phone: '',
    address: '', area: '', landmark: '', pincode: '',
    aadhaarNo: '', aadhaarNumber: '', aadhaarFile: null, additionalDocs: [],
    guarantorId: '', id: '',
  },
  referral: {
    name: '', fullName: '', countryCode: '+91', mobile: '', phone: '',
    address: '', area: '', landmark: '', pincode: '',
    aadhaarNo: '', aadhaarNumber: '', aadhaarFile: null, additionalDocs: [],
    referralId: '', id: '',
    commissionPercentage: '',
    commissionAmount: '',
    payCommission: false,
    paymentMode: 'Cash',
  },
  loan: {
    vehicleAmount: null,
    loanAmount: '',
    relationshipOption: 'none',
    downPayment: '', interestType: 'Flat', interestRate: '', paymentFrequency: '',
    tenure: '', tenureUnit: 'Months', firstDueDate: '', documentCharge: '',
    customizeRules: false, gracePeriod: '', latePenalty: '', penaltyType: 'Per Day',
  },
})

/* ---------- stepper ---------- */
const Stepper = ({ current, onStepClick, t }) => (
  <nav aria-label="Application Progress" className="overflow-x-auto py-0.5">
    <ol className="flex items-center min-w-[360px] sm:min-w-0">
      {STEPS.map((s, i) => {
        const done = i < current
        const active = i === current
        const isLast = i === STEPS.length - 1

        return (
          <li key={s.key} className="flex items-center last:flex-none">
            <button
              type="button"
              onClick={() => onStepClick(i)}
              className="group flex items-center gap-1.5 focus:outline-none cursor-pointer"
              aria-current={active ? 'step' : undefined}
            >
              <span
                className={`flex h-5 w-5 sm:h-5.5 sm:w-5.5 items-center justify-center rounded-full text-[10px] sm:text-[11px] font-bold transition-all shrink-0 ${
                  active
                    ? 'bg-[#006052] text-white ring-2 ring-emerald-200/90 shadow-2xs'
                    : done
                    ? 'bg-[#006052] text-white shadow-2xs'
                    : 'border border-slate-300 bg-white text-slate-400 group-hover:border-slate-400 group-hover:text-slate-600'
                }`}
              >
                {done ? '✓' : i + 1}
              </span>
              <span
                className={`text-[11px] sm:text-xs whitespace-nowrap transition-colors ${
                  active
                    ? 'font-bold text-[#0F1E36]'
                    : done
                    ? 'font-semibold text-slate-700 group-hover:text-slate-900'
                    : 'text-slate-400 group-hover:text-slate-600'
                }`}
              >
                {t(s.labelKey)}
              </span>
            </button>

            {!isLast && (
              <div
                className={`mx-2 sm:mx-3 h-[1.5px] w-4 sm:w-7 transition-colors shrink-0 ${
                  done ? 'bg-[#006052]' : 'bg-slate-200'
                }`}
              />
            )}
          </li>
        )
      })}
    </ol>
  </nav>
)

/* ---------- page ---------- */
const NewLoan = () => {
  const { t } = useTranslation()

  const [step, setStep] = useState(0)

  const [form, setForm] = useState(() => {
    const saved = getCustomerOnboarding()
    const init = initialForm()
    if (!saved) return init
    return {
      ...init,
      ...saved,
      guarantor: { ...init.guarantor, ...(saved.guarantor || {}) },
      referral: { ...init.referral, ...(saved.referral || {}) },
      loan: {
        ...init.loan,
        ...(saved.loan || {}),
        relationshipOption:
          saved.loan?.relationshipOption ||
          (saved.guarantor?.name && saved.referral?.name
            ? 'both'
            : saved.guarantor?.name
            ? 'guarantor'
            : saved.referral?.name
            ? 'referral'
            : 'none'),
      },
    }
  })

  const [verified, setVerified] = useState(false)
  const [showScheduleModal, setShowScheduleModal] = useState(false)

  useEffect(() => {
    saveCustomerOnboarding(form)
  }, [form])

  const update = (section) => (fieldOrObj, value) =>
    setForm((f) => {
      if (typeof fieldOrObj === 'object' && fieldOrObj !== null) {
        return {
          ...f,
          [section]: {
            ...f[section],
            ...fieldOrObj,
          },
        }
      }
      return {
        ...f,
        [section]: {
          ...f[section],
          [fieldOrObj]: value,
        },
      }
    })

  const clearGuarantor = () => {
    setForm((f) => ({
      ...f,
      guarantor: {
        name: '', fullName: '', countryCode: '+91', mobile: '', phone: '',
        address: '', area: '', landmark: '', pincode: '',
        aadhaarNo: '', aadhaarNumber: '', aadhaarFile: null, additionalDocs: [],
        guarantorId: '', id: '',
      },
    }))
  }

  const clearReferral = () => {
    setForm((f) => ({
      ...f,
      referral: {
        name: '', fullName: '', countryCode: '+91', mobile: '', phone: '',
        address: '', area: '', landmark: '', pincode: '',
        aadhaarNo: '', aadhaarNumber: '', aadhaarFile: null, additionalDocs: [],
        referralId: '', id: '',
        commissionPercentage: '',
        commissionAmount: '',
        payCommission: false,
        paymentMode: 'Cash',
      },
    }))
  }

  const current = STEPS[step]
  const isFirst = step === 0
  const isLast = step === STEPS.length - 1
  const goNext = () => setStep((s) => Math.min(s + 1, STEPS.length - 1))
  const goBack = () => setStep((s) => Math.max(s - 1, 0))

  const [showSuccess, setShowSuccess] = useState(false)
  const [submittedLoan, setSubmittedLoan] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // TODO: connect these to your API
  const handleSaveDraft = () => console.log('Save draft', form)
  
  const compressImage = (base64Str, maxWidth = 1000, maxHeight = 1000, quality = 0.6) => {
    return new Promise((resolve) => {
      if (!base64Str || typeof base64Str !== 'string' || !base64Str.startsWith('data:image')) {
        return resolve(base64Str);
      }
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = width * ratio;
          height = height * ratio;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(base64Str);
    });
  };

  const compressObjectImages = async (obj) => {
    if (!obj) return obj;
    const newObj = Array.isArray(obj) ? [] : {};
    for (const key in obj) {
      if (typeof obj[key] === 'string' && obj[key].startsWith('data:image')) {
        newObj[key] = await compressImage(obj[key]);
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        newObj[key] = await compressObjectImages(obj[key]);
      } else {
        newObj[key] = obj[key];
      }
    }
    return newObj;
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      // 1. Generate Loan ID
      const customersList = JSON.parse(localStorage.getItem("motoLendCustomersList_data") || "[]")
      const loanCount = customersList.length + 1
      const loanId = `LN${loanCount.toString().padStart(5, '0')}`
      
      const rawMobile = form.customer.mobile ? form.customer.mobile.trim() : "";
      let customerId = "";
      if (rawMobile.length >= 5 && !/^0+$/.test(rawMobile.slice(-5))) {
        customerId = `CUS-${rawMobile.slice(-5)}`;
      } else {
        customerId = `CUS-${String(customersList.length + 1).padStart(5, '0')}`;
      }

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
        repaymentMethod: form.loan.repaymentMethod || 'EMI'
      })
      
      const emiAmount = repayment.emiAmount || 0
      
      // 3. Construct submitted data and compress images
      const vehicleModelImage = getVehicleModelImage(form.vehicle?.type, form.vehicle?.model);
      const vehicleDisplayImg = getVehicleDisplayImage(form.vehicle);

      let newEntry = {
        ...form,
        guarantor: {
          ...form.guarantor,
          required:
            (form.guarantor?.fullName || form.guarantor?.name || form.guarantor?.phone || form.guarantor?.mobile)
              ? 'Yes'
              : 'No',
        },
        vehicle: {
          ...form.vehicle,
          defaultImage: vehicleModelImage,
          displayImage: vehicleDisplayImg,
        },
        customerId: customerId,
        loanId: loanId,
        loanAmount: principal,
        emiAmount: emiAmount,
        paymentFrequency: form.loan.paymentFrequency,
        nextDueDate: form.loan.firstDueDate,
        status: "Active"
      }
      
      newEntry = await compressObjectImages(newEntry);
      const custName = (form.customer?.name || "Customer").trim();
      const assocDate = new Date().toISOString();
      
      // 4. Record relationships in shared Guarantor / Referral collection
      try {
        const relOpt = form.loan?.relationshipOption || "none";
        const gName = (form.guarantor?.fullName || form.guarantor?.name || "").trim();
        const gPhone = (form.guarantor?.phone || form.guarantor?.mobile || "").trim();

        // 1. Guarantor relationship (when Both or Guarantor only is selected)
        if (relOpt === "both" || relOpt === "guarantor" || gName || gPhone) {
          if (gName || gPhone) {
            const gRecord = recordPersonRelationship({
              person: form.guarantor,
              type: "Guarantor",
              customerId: customerId,
              customerName: custName,
              loanId: loanId,
              associatedDate: assocDate,
            });
            if (gRecord && gRecord.id) {
              newEntry.guarantor = {
                ...newEntry.guarantor,
                guarantorId: gRecord.id,
                id: gRecord.id,
              };
            }
          }
        }

        // 2. Referral relationship (when Both or Referral only is selected)
        if (relOpt === "both" || relOpt === "referral") {
          const rName = (form.referral?.fullName || form.referral?.name || "").trim();
          const rPhone = (form.referral?.phone || form.referral?.mobile || "").trim();
          if (rName || rPhone) {
            const refRecord = recordPersonRelationship({
              person: form.referral,
              type: "Referral",
              customerId: customerId,
              customerName: custName,
              loanId: loanId,
              associatedDate: assocDate,
              commissionPercentage: form.referral?.commissionPercentage,
              commissionAmount: form.referral?.commissionAmount,
              payCommission: form.referral?.payCommission,
              paymentMode: form.referral?.paymentMode || "Cash",
              loanAmount: principal,
            });
            if (refRecord && refRecord.id) {
              newEntry.referral = {
                ...newEntry.referral,
                referralId: refRecord.id,
                id: refRecord.id,
              };
            }
          }
        }
      } catch (relError) {
        console.error("Failed to record guarantor/referral relationship:", relError);
      }

      // 5. Update existing customer or create new
      const currentCustName = (form.customer?.name || "").trim().toLowerCase();
      const existingCustomerIndex = customersList.findIndex(c => {
        const existingName = (c.customer?.name || "").trim().toLowerCase();
        const existingMobile = (c.customer?.mobile || "").trim();
        const existingCId = c.customerId || c.customer?.customerId;
        if (existingCId && existingCId === customerId && currentCustName && existingName === currentCustName) {
          return true;
        }
        if (rawMobile.length >= 10 && existingMobile === rawMobile && currentCustName && existingName === currentCustName) {
          return true;
        }
        return false;
      });
      if (existingCustomerIndex >= 0) {
        // If customer exists, don't duplicate identical image strings
        const existing = customersList[existingCustomerIndex];
        const clearDuplicateImages = (newObj, oldObj) => {
          if (!newObj || !oldObj) return;
          for (const key in newObj) {
            if (typeof newObj[key] === 'string' && newObj[key].startsWith('data:image') && newObj[key] === oldObj[key]) {
              newObj[key] = null; // Clear duplicate to save space
            } else if (typeof newObj[key] === 'object' && newObj[key] !== null) {
              clearDuplicateImages(newObj[key], oldObj[key]);
            }
          }
        };
        clearDuplicateImages(newEntry, existing);
        
        // Push a new record for the new loan instead of overwriting the previous loan
        customersList.push(newEntry)
      } else {
        customersList.push(newEntry)
      }
      
      // 6. Save to local storage
      try {
        localStorage.setItem("motoLendCustomersList_data", JSON.stringify(customersList))
        window.dispatchEvent(new Event("storage"))
      } catch (storageError) {
        if (storageError.name === 'QuotaExceededError' || storageError.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
          alert("Storage quota exceeded! Cannot save this loan application. Please reduce the size of uploaded documents or move to a larger storage solution.");
          return;
        }
        throw storageError;
      }

      // 7. Record Document Charge as Income in Income page and Ledger
      const docChargeVal = Number(form.loan?.documentCharge || 0);
      if (docChargeVal > 0) {
        syncDocumentChargeIncome({
          loanId: loanId,
          customerId: customerId,
          customerName: custName,
          documentCharge: docChargeVal,
          date: assocDate,
          mode: form.loan?.paymentMode || "Cash",
        });
      }

      // 8. Show Popup
      setSubmittedLoan(newEntry)
      setShowSuccess(true)
    } catch (e) {
      console.error("Submission failed", e)
      alert("Error submitting loan application.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClosePopup = () => {
    setShowSuccess(false)
    setSubmittedLoan(null)
    clearCustomerOnboarding()
    setForm(initialForm())
    setStep(0)
    setVerified(false)
    navigate('/loans')
  }

  const handleViewSchedule = () => setShowScheduleModal(true)
  const handleFetchVehicle = () => console.log('Fetch vehicle details', form.vehicle.regNo)

  const navigate = useNavigate()

  const outlineBtn = 'rounded-md border border-slate-300 bg-white px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-slate-800 hover:border-emerald-700 hover:text-emerald-800 transition-colors'
  const primaryBtn = 'inline-flex items-center justify-center gap-1.5 sm:gap-2 rounded-md bg-emerald-800 px-4 sm:px-5 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50 transition-colors'

  return (
    <div className="mx-auto w-full max-w-4xl lg:max-w-5xl px-3 py-2 sm:px-4 sm:py-2.5 flex flex-col h-[calc(100vh-1rem)] sm:h-[calc(100vh-1.5rem)] max-h-[96vh]">
      {/* Top Navigation */}
      <div className="shrink-0 mb-1.5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate('/loans')}
          className="group inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-emerald-800 transition-colors focus:outline-none"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
          <span>Back to Loans</span>
        </button>
      </div>

      <div className="flex flex-col flex-1 min-h-0 rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        {/* Header: Title on Left, Chain Stepper on Right */}
        <div className="shrink-0 px-4 py-2.5 sm:px-5 sm:py-3 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-white">
          <div>
            <h1 className="text-base sm:text-lg font-bold text-[#0F1E36] tracking-tight leading-tight">{t(current.titleKey)}</h1>
            <p className="text-xs text-slate-500 leading-tight mt-0.5">{t(current.subtitleKey)}</p>
          </div>
          <Stepper current={step} onStepClick={setStep} t={t} />
        </div>

        {/* Consistent content area with fixed available height based on viewport */}
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 sm:px-5 sm:py-3.5 bg-white">
          {step === 0 && <CustomerTab data={form.customer} onChange={update('customer')} />}
          {step === 1 && <VehicleTab data={form.vehicle} onChange={update('vehicle')} onFetchVehicle={handleFetchVehicle} />}
          {step === 2 && (
            <LoanTab
              data={form.loan}
              vehicleAmountFromVehicle={form.vehicle.amount}
              onChange={update('loan')}
              onViewSchedule={handleViewSchedule}
              guarantorData={form.guarantor}
              referralData={form.referral}
              onGuarantorChange={update('guarantor')}
              onGuarantorClear={clearGuarantor}
              onReferralChange={update('referral')}
              onReferralClear={clearReferral}
            />
          )}
          {step === 3 && <ReviewTab form={form} onViewSchedule={handleViewSchedule} />}
        </div>

        {/* Bottom Action Bar: Consistently positioned at the bottom */}
        <div className="flex shrink-0 items-center justify-between border-t border-slate-200 px-4 py-2.5 sm:px-5 sm:py-3 bg-slate-50">
          <div>
            {!isFirst && (
              <button type="button" onClick={goBack} className={`${outlineBtn} inline-flex items-center justify-center gap-1.5 py-1.5 px-3.5 text-xs sm:text-sm`}>
                <ArrowLeft className="h-3.5 w-3.5" /> {t('app.back')}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isLast && (
              <label className="flex items-center gap-1.5 text-xs text-slate-600 mr-2">
                <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} className="h-3.5 w-3.5 accent-emerald-700" />
                <span>{t('app.verifiedDetails')}</span>
              </label>
            )}
            <button
              type="button"
              onClick={() => {
                saveCustomerOnboarding(form)
                handleSaveDraft()
                alert("Application draft saved successfully.")
              }}
              className={`${outlineBtn} py-1.5 px-3.5 text-xs sm:text-sm`}
            >
              {t('app.saveDraft')}
            </button>
            {isLast ? (
              <button 
                type="button" 
                onClick={handleSubmit} 
                disabled={!verified || isSubmitting} 
                className={`${primaryBtn} py-1.5 px-4 text-xs sm:text-sm`}
              >
                {t('app.submitApplication')} <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button type="button" onClick={goNext} className={`${primaryBtn} py-1.5 px-4 text-xs sm:text-sm`}>
                {t('app.next')}: {t(STEPS[step + 1].labelKey)} <ArrowRight className="h-3.5 w-3.5" />
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
                  ₹{Math.round(Number(submittedLoan.loanAmount)).toLocaleString('en-IN')}
                </span>
              </div>
              
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500">Installment Amount:</span>
                <span className="font-semibold text-slate-900 text-right">
                  ₹{Math.round(Number(submittedLoan.emiAmount)).toLocaleString('en-IN')} / {submittedLoan.paymentFrequency || 'Monthly'}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-slate-500">Next Due Date:</span>
                <span className="font-semibold text-slate-900">
                  {submittedLoan.nextDueDate ? formatDate(submittedLoan.nextDueDate) : '—'}
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

      {/* REPAYMENT SCHEDULE MODAL */}
      <RepaymentScheduleModal 
        isOpen={showScheduleModal} 
        onClose={() => setShowScheduleModal(false)} 
        loanDetails={form.loan} 
      />
    </div>
  )
}

export default NewLoan