
import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Field,
  Input,
  Select,
  AdornedInput,
  RadioGroup,
  SectionCard,
  formatINR,
  CalendarIcon,
  formatDate,
} from './Formcontrols'
import { Coins, Users } from 'lucide-react'
// import RepaymentCalculator from './RepaymentCalculator'

import {
  PAYMENT_FREQUENCIES,
  TENURE_UNITS,
  INTEREST_TYPES,
  REPAYMENT_METHODS,
  PENALTY_TYPES,
} from '../../Options'
import GuarantorReferralSection from './GuarantorReferralSection'

/* =========================================================
   CONSTANTS
========================================================= */

const YES_NO = ['Yes', 'No']

/* =========================================================
   HELPERS
========================================================= */


const digits = (value = '') =>
  value.replace(/\D/g, '')

const decimal = (value = '') => {
  const clean = value.replace(/[^\d.]/g, '')
  const parts = clean.split('.')
  if (parts.length > 2) {
    return `${parts[0]}.${parts.slice(1).join('')}`
  }
  return clean
}

/* =========================================================
   REPAYMENT CALCULATION
========================================================= */

export const calculateRepayment = ({
  principal,
  interestRate,
  tenure,
  tenureUnit,
  paymentFrequency,
  interestType,
  repaymentMethod,
}) => {
  const P = Number(principal) || 0
  const monthlyRate = Number(interestRate) || 0
  const tenureValue = Number(tenure) || 0

  if (P <= 0 || tenureValue <= 0) {
    return {
      principal: P,
      interest: 0,
      totalPayable: P,
      emiAmount: 0,
      numberOfPayments: 0,
    }
  }

  /* -------------------------------------------------------
     DERIVE NUMBER OF PAYMENTS FROM TENURE & FREQUENCY
  ------------------------------------------------------- */

  const tenureMonths =
    tenureUnit === 'Years'
      ? tenureValue * 12
      : tenureValue

  let numberOfPayments = tenureMonths

  if (paymentFrequency === 'Daily') {
    numberOfPayments =
      tenureUnit === 'Years'
        ? tenureValue * 365
        : Math.round(tenureMonths * 30)
  } else if (paymentFrequency === 'Weekly') {
    numberOfPayments =
      tenureUnit === 'Years'
        ? tenureValue * 52
        : Math.round(tenureMonths * (52 / 12))
  } else {
    // Default 'Monthly'
    numberOfPayments = tenureMonths
  }

  numberOfPayments = Math.max(
    Math.round(numberOfPayments),
    0
  )

  if (numberOfPayments <= 0) {
    return {
      principal: P,
      interest: 0,
      totalPayable: P,
      emiAmount: 0,
      numberOfPayments: 0,
    }
  }

  /* -------------------------------------------------------
     PERIODIC INTEREST RATE (DERIVED FROM MONTHLY RATE)
  ------------------------------------------------------- */

  let periodicRate = monthlyRate / 100

  if (paymentFrequency === 'Daily') {
    periodicRate = (monthlyRate / 100) / 30
  } else if (paymentFrequency === 'Weekly') {
    periodicRate = (monthlyRate / 100) / (52 / 12)
  }

  /* -------------------------------------------------------
     REDUCING BALANCE
  ------------------------------------------------------- */

  if (interestType === 'Reducing Balance') {
    /* EMI method */
    if (
      repaymentMethod === 'EMI' ||
      !repaymentMethod
    ) {
      let emi = 0

      if (periodicRate === 0) {
        emi = P / numberOfPayments
      } else {
        emi =
          (P *
            periodicRate *
            Math.pow(
              1 + periodicRate,
              numberOfPayments
            )) /
          (Math.pow(
            1 + periodicRate,
            numberOfPayments
          ) - 1)
      }

      let balance = P
      let totalInterest = 0

      for (
        let i = 1;
        i <= numberOfPayments;
        i++
      ) {
        const interestForPeriod =
          balance * periodicRate
        let principalForPeriod =
          emi - interestForPeriod
        let periodPayment = emi

        if (i === numberOfPayments) {
          principalForPeriod = balance
          periodPayment =
            principalForPeriod + interestForPeriod
        }

        totalInterest += interestForPeriod
        balance -= principalForPeriod
      }

      const totalPayable = P + totalInterest

      return {
        principal: P,
        interest: Math.max(totalInterest, 0),
        totalPayable,
        emiAmount: emi,
        numberOfPayments,
      }
    }

    /* Principal method */
    if (repaymentMethod === 'Principal') {
      const principalPerPayment =
        P / numberOfPayments

      let balance = P
      let totalInterest = 0

      for (
        let i = 1;
        i <= numberOfPayments;
        i++
      ) {
        const interestForPeriod =
          balance * periodicRate
        let principalForPeriod =
          principalPerPayment

        if (i === numberOfPayments) {
          principalForPeriod = balance
        }

        const periodPayment =
          principalForPeriod + interestForPeriod

        totalInterest += interestForPeriod
        balance -= principalForPeriod
      }

      const totalPayable = P + totalInterest
      const averagePayment =
        totalPayable / numberOfPayments

      return {
        principal: P,
        interest: Math.max(totalInterest, 0),
        totalPayable,
        emiAmount: averagePayment,
        numberOfPayments,
      }
    }
  }

  /* -------------------------------------------------------
     FLAT / SIMPLE INTEREST
  ------------------------------------------------------- */

  const totalInterest =
    P * (monthlyRate / 100) * tenureMonths

  const totalPayable =
    P + totalInterest

  const paymentAmount =
    totalPayable / numberOfPayments

  return {
    principal: P,
    interest: Math.max(totalInterest, 0),
    totalPayable,
    emiAmount: paymentAmount,
    numberOfPayments,
  }
}

/* =========================================================
   SUMMARY ROW
========================================================= */

const SummaryRow = ({
  label,
  value,
  strong = false,
}) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-xs text-slate-600">
      {label}
    </span>

    <span
      className={
        strong
          ? 'text-sm font-semibold text-emerald-800'
          : 'text-sm font-medium text-slate-900'
      }
    >
      {value}
    </span>
  </div>
)

/* =========================================================
   LOAN TAB
========================================================= */

const LoanTab = ({
  data = {},
  vehicleAmountFromVehicle,
  guarantorData = {},
  referralData = {},
  onChange,
  onGuarantorChange,
  onGuarantorClear,
  onReferralChange,
  onReferralClear,
  onViewSchedule,
}) => {
  const { t } = useTranslation()
  const [activeSection, setActiveSection] = useState('loan')

  /* -------------------------------------------------------
     VEHICLE / LOAN AMOUNT
  ------------------------------------------------------- */

  const vehicleAmount =
    data.vehicleAmount !== "" && data.vehicleAmount != null
      ? data.vehicleAmount
      : vehicleAmountFromVehicle ?? ""

  // Use the edited or entered loan amount if present, otherwise calculate vehicleAmount - downPayment
  const loanAmount =
    data.loanAmount !== "" && data.loanAmount != null
      ? Number(data.loanAmount)
      : (Number(vehicleAmount) > 0 ? Math.max(Number(vehicleAmount) - Number(data.downPayment || 0), 0) : 0)

  const [downPaymentError, setDownPaymentError] = useState('')

  // Initialize loanAmount immediately when vehicleAmount becomes available (e.g., from Vehicle step)
  React.useEffect(() => {
    const vNum = Number(vehicleAmount || 0)
    if (vNum > 0 && (data.loanAmount === '' || data.loanAmount == null)) {
      const dpNum = Number(data.downPayment || 0)
      const calculated = Math.max(0, vNum - dpNum)
      onChange({
        vehicleAmount: data.vehicleAmount || String(vNum),
        loanAmount: String(calculated),
      })
    }
  }, [vehicleAmount])

  /* -------------------------------------------------------
     CONDITIONS
  ------------------------------------------------------- */

  const reducingBalance =
    data.interestType === 'Reducing Balance'

  const isReducingBalance =
    data.interestType === 'Reducing Balance'

  /* Clear repayment method if user changes back to Flat */

  React.useEffect(() => {
    if (
      !isReducingBalance &&
      data.repaymentMethod
    ) {
      onChange(
        'repaymentMethod',
        ''
      )
    }
  }, [
    isReducingBalance,
    data.repaymentMethod,
    onChange,
  ])

  /* -------------------------------------------------------
     REPAYMENT CALCULATION
  ------------------------------------------------------- */

  const repayment = useMemo(
    () =>
      calculateRepayment({
        principal: loanAmount,
        interestRate: data.interestRate,
        tenure: data.tenure,
        tenureUnit: data.tenureUnit,
        paymentFrequency:
          data.paymentFrequency,
        interestType:
          data.interestType,
        repaymentMethod:
          data.repaymentMethod,
      }),
    [
      loanAmount,
      data.interestRate,
      data.tenure,
      data.tenureUnit,
      data.paymentFrequency,
      data.interestType,
      data.repaymentMethod,
    ]
  )

  /* -------------------------------------------------------
     CHANGE VEHICLE AMOUNT
     Loan Amount = Vehicle Amount - Down Payment
  ------------------------------------------------------- */

  const handleVehicleAmountChange = (e) => {
    const rawVal = digits(e.target.value)
    const vNum = Number(rawVal || 0)
    const curDownNum = Number(data.downPayment || 0)

    let finalDown = data.downPayment || ''
    let err = ''

    // Validate that Down Payment cannot exceed Vehicle Amount
    if (vNum > 0 && curDownNum > vNum) {
      finalDown = String(vNum)
      err = `Down payment cannot exceed vehicle amount (₹${vNum.toLocaleString('en-IN')})`
    } else {
      err = ''
    }
    setDownPaymentError(err)

    const effectiveDown = Number(finalDown || 0)
    // Loan Amount = Vehicle Amount - Down Payment (prevent negative loan amounts)
    const newLoanAmount = rawVal !== '' ? String(Math.max(0, vNum - effectiveDown)) : ''

    onChange({
      vehicleAmount: rawVal,
      downPayment: finalDown,
      loanAmount: newLoanAmount,
    })
  }

  /* -------------------------------------------------------
     DOWN PAYMENT
     Validate cannot exceed Vehicle Amount & recalculate Loan Amount
  ------------------------------------------------------- */

  const handleDownPaymentChange = (e) => {
    const rawVal = digits(e.target.value)
    const vNum = Number(vehicleAmount || 0)
    let finalDown = rawVal
    let err = ''

    // Validate that Down Payment cannot exceed Vehicle Amount
    if (vNum > 0 && rawVal !== '') {
      const downNum = Number(rawVal)
      if (downNum > vNum) {
        finalDown = String(vNum)
        err = `Down payment cannot exceed vehicle amount (₹${vNum.toLocaleString('en-IN')})`
      } else {
        err = ''
      }
    } else {
      err = ''
    }
    setDownPaymentError(err)

    const downNum = Number(finalDown || 0)
    // Loan Amount = Vehicle Amount - Down Payment (prevent negative loan amounts)
    const newLoanAmount = (vehicleAmount !== '' && vehicleAmount != null)
      ? String(Math.max(0, vNum - downNum))
      : ''

    onChange({
      downPayment: finalDown,
      loanAmount: newLoanAmount,
    })
  }

  /* -------------------------------------------------------
     MANUAL LOAN AMOUNT CHANGE
     Keep calculated Loan Amount editable and prevent negative values
  ------------------------------------------------------- */

  const handleLoanAmountChange = (e) => {
    const val = digits(e.target.value)
    onChange('loanAmount', val)
  }

  /* -------------------------------------------------------
     INTEREST RATE
  ------------------------------------------------------- */

  const handleInterestRateChange = (e) => {
    onChange(
      'interestRate',
      decimal(e.target.value)
    )
  }

  /* -------------------------------------------------------
     TENURE
  ------------------------------------------------------- */

  const handleTenureChange = (e) => {
    onChange(
      'tenure',
      digits(e.target.value)
    )
  }

  return (
    <div className="space-y-2">
      {/* =================================================
          COMPACT SECTION SELECTOR AT TOP OF LOAN TAB
      ================================================== */}
      <div className="flex rounded-lg border border-slate-200 bg-slate-100/90 p-0.5 shadow-2xs">
        <button
          type="button"
          onClick={() => setActiveSection('loan')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md py-1.5 px-3 text-xs sm:text-sm font-bold transition-all cursor-pointer ${
            activeSection === 'loan'
              ? 'bg-white text-emerald-900 shadow-2xs ring-1 ring-slate-200'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Coins className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-700" />
          <span>{t('loan.loanDetails')}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('guarantor')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md py-1.5 px-3 text-xs sm:text-sm font-bold transition-all cursor-pointer ${
            activeSection === 'guarantor'
              ? 'bg-white text-emerald-900 shadow-2xs ring-1 ring-slate-200'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-700" />
          <span>Guarantor & Referral</span>
          {data.relationshipOption && data.relationshipOption !== 'none' && (
            <span className="hidden sm:inline-flex rounded bg-emerald-100 px-1.5 py-0.2 text-[10px] font-bold text-emerald-800 border border-emerald-200">
              {data.relationshipOption === 'both'
                ? 'Both'
                : data.relationshipOption === 'guarantor'
                ? 'Guarantor'
                : 'Referral'}
            </span>
          )}
        </button>
      </div>

      {/* =================================================
          SECTION 1: LOAN DETAILS (Full Available Width)
      ================================================== */}
      {activeSection === 'loan' && (
        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-[minmax(0,1fr)_260px] items-start">
          {/* Loan Details Form Card */}
          <section className="overflow-hidden rounded-lg border border-emerald-100 bg-white shadow-2xs">
            <header className="flex items-center justify-between bg-emerald-50 px-3 py-1.5 sm:px-3.5 sm:py-2 border-b border-emerald-100">
              <h3 className="text-xs sm:text-sm font-bold text-emerald-950">
                {t('loan.loanDetails')}
              </h3>
            </header>

            <div className="p-2.5 sm:p-3 space-y-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {/* 1. VEHICLE AMOUNT */}
                <Field label={t('loan.vehicleAmount')} required>
                  <AdornedInput
                    prefix="₹"
                    inputMode="numeric"
                    value={vehicleAmount}
                    onChange={handleVehicleAmountChange}
                    placeholder={t('loan.enterVehicleAmount')}
                    className="h-8 text-xs"
                  />
                </Field>

                {/* 2. DOWN PAYMENT */}
                <Field label={t('loan.downPayment')} required>
                  <AdornedInput
                    prefix="₹"
                    inputMode="numeric"
                    value={data.downPayment ?? ''}
                    onChange={handleDownPaymentChange}
                    placeholder={t('loan.enterDownPayment')}
                    className="h-8 text-xs"
                  />
                  {downPaymentError && (
                    <p className="mt-1 text-[11px] font-semibold text-red-600 animate-in fade-in duration-150">
                      {downPaymentError}
                    </p>
                  )}
                </Field>

                {/* 3. LOAN AMOUNT */}
                <Field label={t('loan.loanAmount')} required>
                  <AdornedInput
                    prefix="₹"
                    inputMode="numeric"
                    value={data.loanAmount ?? ''}
                    onChange={handleLoanAmountChange}
                    placeholder={t('loan.enterLoanAmount')}
                    className="h-8 text-xs font-semibold text-emerald-950"
                  />
                </Field>

                {/* 4. DOCUMENT CHARGE */}
                <Field label={t('loan.documentCharge')} required>
                  <AdornedInput
                    prefix="₹"
                    inputMode="numeric"
                    value={data.documentCharge}
                    onChange={(e) =>
                      onChange('documentCharge', digits(e.target.value))
                    }
                    placeholder={t('loan.enterDocumentCharge')}
                    className="h-8 text-xs"
                  />
                </Field>

                {/* 5. INTEREST TYPE */}
                <Field label={t('loan.interestType')} required>
                  <Select
                    options={INTEREST_TYPES}
                    placeholder={t('loan.selectInterestType')}
                    translationKey="options.interestTypes"
                    value={data.interestType}
                    onChange={(e) => onChange('interestType', e.target.value)}
                    className="h-8 text-xs"
                  />
                </Field>

                {/* 6. INTEREST RATE */}
                <Field label={t('loan.interestRate')} required>
                  <AdornedInput
                    suffix="%"
                    inputMode="decimal"
                    value={data.interestRate}
                    onChange={handleInterestRateChange}
                    placeholder={t('loan.enterInterestRate')}
                    className="h-8 text-xs"
                  />
                </Field>

                {/* 7. PAYMENT FREQUENCY */}
                <Field label={t('loan.paymentFrequency')} required>
                  <Select
                    options={PAYMENT_FREQUENCIES}
                    placeholder={t('loan.selectFrequency')}
                    translationKey="options.paymentFrequencies"
                    value={data.paymentFrequency}
                    onChange={(e) => onChange('paymentFrequency', e.target.value)}
                    className="h-8 text-xs"
                  />
                </Field>

                {/* 8. LOAN TENURE */}
                <Field label={t('loan.loanTenure')} required>
                  <div className="grid grid-cols-[1fr_95px] gap-1.5">
                    <Input
                      inputMode="numeric"
                      value={data.tenure}
                      onChange={handleTenureChange}
                      placeholder={t('loan.enterTenure')}
                      className="h-8 text-xs"
                    />
                    <Select
                      options={TENURE_UNITS}
                      translationKey="options.tenureUnits"
                      value={data.tenureUnit}
                      onChange={(e) => onChange('tenureUnit', e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </Field>

                {/* 9. FIRST DUE DATE */}
                <Field label={t('loan.firstDueDate')} required className="sm:col-span-2">
                  <div className="relative">
                    <CalendarIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                    <Input
                      type="date"
                      className="pl-8 h-8 text-xs"
                      value={data.firstDueDate}
                      onChange={(e) => onChange('firstDueDate', e.target.value)}
                    />
                  </div>
                </Field>
              </div>

              {/* Repayment Method (if Reducing Balance) */}
              {reducingBalance && (
                <div className="pt-1.5 border-t border-slate-100 flex items-center gap-3">
                  <span className="text-[11px] font-semibold text-slate-700 whitespace-nowrap">
                    {t('loan.repaymentMethod')}:
                  </span>
                  <RadioGroup
                    name="repaymentMethod"
                    options={REPAYMENT_METHODS}
                    translationKey="options.repaymentMethods"
                    value={data.repaymentMethod}
                    onChange={(value) => onChange('repaymentMethod', value)}
                  />
                </div>
              )}
            </div>
          </section>

          {/* Compact Repayment Summary Aside */}
          <aside className="space-y-2 lg:sticky lg:top-2 lg:self-start">
            <div className="rounded-lg border border-emerald-200/90 bg-emerald-50/70 p-3 shadow-2xs">
              <div className="mb-2 flex items-center justify-between border-b border-emerald-200/60 pb-1.5">
                <h3 className="text-xs sm:text-sm font-bold text-emerald-950">
                  {t('loan.repaymentSummary')}
                </h3>
                {onViewSchedule && (
                  <button
                    type="button"
                    onClick={onViewSchedule}
                    className="text-[11px] font-semibold text-emerald-800 hover:text-emerald-950 underline cursor-pointer"
                  >
                    View Schedule
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                <SummaryRow
                  label={t('loan.principal')}
                  value={formatINR(repayment.principal)}
                />
                <SummaryRow
                  label={t('loan.interest')}
                  value={formatINR(repayment.interest)}
                />
                <div className="border-t border-emerald-200/60 pt-1">
                  <SummaryRow
                    label={t('loan.totalPayable')}
                    value={formatINR(repayment.totalPayable)}
                    strong
                  />
                </div>
                <SummaryRow
                  label={t('loan.emiAmount')}
                  value={formatINR(repayment.emiAmount)}
                />
                <SummaryRow
                  label={t('loan.numberOfPayments')}
                  value={repayment.numberOfPayments || 0}
                />
                <SummaryRow
                  label={t('loan.firstDueDate')}
                  value={formatDate(data.firstDueDate)}
                />
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* =================================================
          SECTION 2: GUARANTOR & REFERRAL (Full Width)
      ================================================== */}
      {activeSection === 'guarantor' && (
        <GuarantorReferralSection
          loanAmount={loanAmount}
          relationshipOption={data.relationshipOption || 'none'}
          onOptionChange={(opt) => onChange('relationshipOption', opt)}
          guarantorData={guarantorData}
          onGuarantorChange={onGuarantorChange}
          onGuarantorClear={onGuarantorClear}
          referralData={referralData}
          onReferralChange={onReferralChange}
          onReferralClear={onReferralClear}
        />
      )}
    </div>
  )
}

export default LoanTab
