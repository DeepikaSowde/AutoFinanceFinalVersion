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
  clearCustomerOnboarding,
  getOnboardingDraftId,
  setOnboardingDraftId
} from '../utils/customerOnboardingStorage'
import { deleteDraft, getDraft, listDrafts, saveDraft } from '../services/draftApi'

import { getFundingSummary, hasGuarantorIn, principalOf, submitLoanApplication } from '../services/customerApi'
import { CheckCircle2, FileText, Trash2, X } from 'lucide-react'
import { recordPersonRelationship } from '../utils/guarantorReferralStorage'
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
  const [draftId, setDraftIdState] = useState(() => getOnboardingDraftId())
  const setDraftId = (id) => {
    setDraftIdState(id)
    setOnboardingDraftId(id)
  }
  const [savingDraft, setSavingDraft] = useState(false)
  const [notice, setNotice] = useState('')
  const [draftsOpen, setDraftsOpen] = useState(false)
  const [drafts, setDrafts] = useState({ list: [], loading: false, error: '' })
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
  const [submitting, setSubmitting] = useState(false)

  const flash = (message) => {
    setNotice(message)
    setTimeout(() => setNotice(''), 4000)
  }

  // Saves the form to the server so it can be resumed on any device. The
  // first save creates the draft; later saves update the same one.
  const handleSaveDraft = async () => {
    if (savingDraft) return
    setSavingDraft(true)
    try {
      const saved = await saveDraft(draftId, await compressObjectImages(form))
      setDraftId(saved.id)
      flash(`Draft ${saved.id} saved${saved.customerName ? ` for ${saved.customerName}` : ''}.`)
    } catch (e) {
      if (e.status === 404 && draftId) {
        // The draft was deleted elsewhere; save this form as a new one.
        setDraftId(null)
        alert('That draft no longer exists. Click Save Draft again to save this form as a new draft.')
      } else {
        alert(e.message || 'Could not save the draft.')
      }
    } finally {
      setSavingDraft(false)
    }
  }

  const openDrafts = async () => {
    setDraftsOpen(true)
    setDrafts({ list: [], loading: true, error: '' })
    try {
      setDrafts({ list: await listDrafts(), loading: false, error: '' })
    } catch (e) {
      setDrafts({ list: [], loading: false, error: e.message })
    }
  }

  // Fills any fields the form gained since the draft was saved.
  const mergeWithBlank = (saved = {}) => {
    const blank = initialForm()
    const merged = { ...blank }
    for (const key of Object.keys(blank)) merged[key] = { ...blank[key], ...(saved[key] || {}) }
    return merged
  }

  const handleOpenDraft = async (summary) => {
    const hasWork = Boolean(form.customer?.name || form.customer?.mobile || form.vehicle?.regNo)
    if (hasWork && summary.id !== draftId && !window.confirm('Replace the form you are filling in with this draft? Unsaved changes will be lost.')) return
    try {
      const draft = await getDraft(summary.id)
      setForm(mergeWithBlank(draft.form))
      setDraftId(draft.id)
      setStep(0)
      setVerified(false)
      setDraftsOpen(false)
      flash(`Opened draft ${draft.id}. Re-attach any KYC documents before submitting.`)
    } catch (e) {
      alert(e.message || 'Could not open the draft.')
    }
  }

  const handleDeleteDraft = async (summary) => {
    if (!window.confirm(`Delete draft ${summary.id}${summary.customerName ? ` (${summary.customerName})` : ''}?`)) return
    try {
      await deleteDraft(summary.id)
      if (summary.id === draftId) setDraftId(null)
      setDrafts((current) => ({ ...current, list: current.list.filter((d) => d.id !== summary.id) }))
    } catch (e) {
      alert(e.message || 'Could not delete the draft.')
    }
  }
  
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
    if (submitting) return
    setSubmitting(true)
    try {
      // A guarantor / referrer is saved to the register after the loan, so
      // check their details first rather than fail half way.
      const relOpt = form.loan?.relationshipOption || 'none'
      // Entered guarantor details count even if the option was left unset.
      const withGuarantor = hasGuarantorIn(form)
      const people = [
        withGuarantor && ['Guarantor', form.guarantor],
        (relOpt === 'both' || relOpt === 'referral') && ['Referral', form.referral],
      ].filter(Boolean)
      for (const [label, person] of people) {
        const name = (person?.fullName || person?.name || '').trim()
        const digits = String(person?.phone || person?.mobile || '').replace(/\D/g, '')
        if ((name || digits) && (!name || digits.length < 10)) {
          alert(`Enter the ${label.toLowerCase()}'s full name and a 10-digit mobile number.`)
          return
        }
      }

      const vehicleAmount = form.loan.vehicleAmount !== null && form.loan.vehicleAmount !== '' && form.loan.vehicleAmount !== undefined
        ? Number(form.loan.vehicleAmount)
        : Number(form.vehicle.amount || 0)
      if (vehicleAmount > 0 && Number(form.loan.downPayment || 0) > vehicleAmount) {
        alert('Down payment cannot exceed vehicle amount.')
        return
      }

      // Early, friendly check; the server re-checks inside the transaction
      // that creates and funds the loan.
      const principal = principalOf(form)
      const { availableInvestmentBalance } = await getFundingSummary()
      if (principal > availableInvestmentBalance) {
        alert(`Insufficient available balance for this loan. Available: ₹${Number(availableInvestmentBalance).toLocaleString('en-IN')}.`)
        return
      }

      const entry = await submitLoanApplication(await compressObjectImages(form))

      // Record the guarantor / referrer against the new loan in the shared
      // register (with the referral commission, and its expense if paid now).
      const links = []
      if (withGuarantor) links.push({ person: form.guarantor, type: 'Guarantor' })
      if (relOpt === 'both' || relOpt === 'referral') {
        links.push({
          person: form.referral,
          type: 'Referral',
          commissionPercentage: form.referral?.commissionPercentage,
          commissionAmount: form.referral?.commissionAmount,
          payCommission: form.referral?.payCommission,
          paymentMode: form.referral?.paymentMode || 'Cash',
        })
      }
      const linkErrors = []
      for (const link of links) {
        try {
          await recordPersonRelationship({ ...link, customerId: entry.customerId, loanId: entry.loanId })
        } catch (relError) {
          console.error('Failed to record guarantor/referral relationship:', relError)
          linkErrors.push(`${link.type}: ${relError.message}`)
        }
      }
      if (linkErrors.length) {
        alert(`Loan ${entry.loanId} was created, but these could not be saved to the Guarantor / Referral register:\n${linkErrors.join('\n')}`)
      }

      if (draftId) {
        deleteDraft(draftId).catch(() => {})
        setDraftId(null)
      }

      setSubmittedLoan(entry)
      setShowSuccess(true)
    } catch (e) {
      console.error("Submission failed", e)
      alert(e.message || "Error submitting loan application.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleClosePopup = () => {
    setShowSuccess(false)
    setSubmittedLoan(null)
    clearCustomerOnboarding()
    setDraftId(null)
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
        <div className="flex items-center gap-2">
          {draftId && <span className="text-[11px] sm:text-xs text-slate-500">Editing draft {draftId}</span>}
          <button
            type="button"
            onClick={openDrafts}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs sm:text-sm font-medium text-slate-700 hover:border-emerald-700 hover:text-emerald-800 transition-colors"
          >
            <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Drafts
          </button>
        </div>
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
            <button type="button" onClick={handleSaveDraft} disabled={savingDraft} className={`${outlineBtn} py-1.5 px-3.5 text-xs sm:text-sm disabled:opacity-50`}>
              {savingDraft ? 'Saving…' : t('app.saveDraft')}
            </button>
            {isLast ? (
              <button type="button" onClick={handleSubmit} disabled={!verified || submitting} className={`${primaryBtn} py-1.5 px-4 text-xs sm:text-sm`}>
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
      {notice && (
        <div className="fixed bottom-6 right-6 z-[70] rounded-lg bg-[#006052] px-5 py-3.5 text-sm font-medium text-white shadow-xl">
          {notice}
        </div>
      )}

      {draftsOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Saved drafts</h2>
                <p className="text-xs text-slate-500">Unfinished applications, saved from any device.</p>
              </div>
              <button type="button" onClick={() => setDraftsOpen(false)} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto">
              {drafts.loading && <p className="px-5 py-6 text-center text-sm text-slate-500">Loading…</p>}
              {drafts.error && <p className="px-5 py-6 text-center text-sm text-red-600">Could not load drafts: {drafts.error}</p>}
              {!drafts.loading && !drafts.error && drafts.list.length === 0 && (
                <p className="px-5 py-6 text-center text-sm text-slate-500">No saved drafts.</p>
              )}
              <ul className="divide-y divide-slate-100">
                {drafts.list.map((d) => (
                  <li key={d.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">
                        {d.customerName || 'Unnamed customer'}
                        <span className="ml-2 text-xs font-normal text-slate-500">{d.id}{d.id === draftId ? ' · open now' : ''}</span>
                      </p>
                      <p className="text-xs text-slate-500">
                        {d.mobileNumber || 'No mobile'} · saved {new Date(d.updatedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        {d.updatedBy ? ` by ${d.updatedBy}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenDraft(d)}
                        className="rounded-md bg-emerald-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-900"
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteDraft(d)}
                        className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

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