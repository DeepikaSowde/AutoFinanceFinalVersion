
import React, { useMemo } from 'react'

import {
  Field,
  Input,
  Select,
  AdornedInput,
  RadioGroup,
  SectionCard,
  OutlineButton,
  InfoNote,
  InfoIcon,
  CalendarIcon,
  ArrowRight,
  PlusIcon,
  formatINR,
  formatDate,
} from './Formcontrols'

import {
  PAYMENT_FREQUENCIES,
  TENURE_UNITS,
  INTEREST_TYPES,
  REPAYMENT_METHODS,
  PENALTY_TYPES,
} from '../../Options'


/* =========================================================
   CONSTANTS
========================================================= */

const YES_NO = ['Yes', 'No']



/* =========================================================
   HELPERS
========================================================= */

export const calcLoanAmount = (vehicleAmount, downPayment) => {
  const v = Number(vehicleAmount) || 0
  const d = Number(downPayment) || 0

  return Math.max(v - d, 0)
}
const digits = (value = '') =>
  value.replace(/\D/g, '')


const decimal = (value = '') =>
  value.replace(/[^\d.]/g, '')


/* =========================================================
   REPAYMENT CALCULATION
========================================================= */

const calculateRepayment = ({
  principal,
  interestRate,
  tenure,
  tenureUnit,
  paymentFrequency,
  interestType,
  repaymentMethod,
}) => {

  const P = Number(principal) || 0
  const annualRate = Number(interestRate) || 0
  const tenureValue = Number(tenure) || 0

  if (
    P <= 0 ||
    tenureValue <= 0
  ) {
    return {
      principal: P,
      interest: 0,
      totalPayable: P,
      emiAmount: 0,
      numberOfPayments: 0,
    }
  }


  /* -------------------------------------------------------
     NUMBER OF PAYMENTS
  ------------------------------------------------------- */

  let numberOfPayments = tenureValue

  if (tenureUnit === 'Years') {

    if (paymentFrequency === 'Monthly') {
      numberOfPayments = tenureValue * 12
    }

    else if (paymentFrequency === 'Quarterly') {
      numberOfPayments = tenureValue * 4
    }

    else if (paymentFrequency === 'Half-Yearly') {
      numberOfPayments = tenureValue * 2
    }

    else if (paymentFrequency === 'Yearly') {
      numberOfPayments = tenureValue
    }

    else {
      numberOfPayments = tenureValue * 12
    }

  }


  /* -------------------------------------------------------
     PAYMENT FREQUENCY
  ------------------------------------------------------- */

  let periodsPerYear = 12

  if (paymentFrequency === 'Weekly') {
    periodsPerYear = 52
  }

  else if (paymentFrequency === 'Bi-Weekly') {
    periodsPerYear = 26
  }

  else if (paymentFrequency === 'Monthly') {
    periodsPerYear = 12
  }

  else if (paymentFrequency === 'Quarterly') {
    periodsPerYear = 4
  }

  else if (paymentFrequency === 'Half-Yearly') {
    periodsPerYear = 2
  }

  else if (paymentFrequency === 'Yearly') {
    periodsPerYear = 1
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
     REDUCING BALANCE
  ------------------------------------------------------- */

  if (interestType === 'Reducing Balance') {

    const periodicRate =
      annualRate / 100 / periodsPerYear


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
          P *
          periodicRate *
          Math.pow(
            1 + periodicRate,
            numberOfPayments
          ) /
          (
            Math.pow(
              1 + periodicRate,
              numberOfPayments
            ) - 1
          )

      }

      const totalPayable =
        emi * numberOfPayments

      const interest =
        totalPayable - P

      return {
        principal: P,
        interest: Math.max(interest, 0),
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

      for (let i = 0; i < numberOfPayments; i++) {

        const interestForPeriod =
          balance * periodicRate

        totalInterest += interestForPeriod

        balance -= principalPerPayment

      }

      const totalPayable =
        P + totalInterest

      const averagePayment =
        totalPayable / numberOfPayments

      return {
        principal: P,
        interest: totalInterest,
        totalPayable,
        emiAmount: averagePayment,
        numberOfPayments,
      }

    }

  }


  /* -------------------------------------------------------
     FLAT / SIMPLE INTEREST
  ------------------------------------------------------- */

  const years =
    tenureUnit === 'Years'
      ? tenureValue
      : tenureValue / periodsPerYear

  const interest =
    P *
    (annualRate / 100) *
    years

  const totalPayable =
    P + interest

  const paymentAmount =
    totalPayable / numberOfPayments

  return {
    principal: P,
    interest,
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
  data,
  vehicleAmountFromVehicle,
  onChange,
  onViewSchedule,
}) => {

  /* -------------------------------------------------------
     VEHICLE / LOAN AMOUNT
  ------------------------------------------------------- */

  const vehicleAmount =
    data.vehicleAmount ??
    vehicleAmountFromVehicle ??
    ''

  const loanAmount =
    calcLoanAmount(
      vehicleAmount,
      data.downPayment
    )


  /* -------------------------------------------------------
     CONDITIONS
  ------------------------------------------------------- */

  const rulesEnabled =
    data.customizeRules === true

  const reducingBalance =
    data.interestType === 'Reducing Balance'


  const isReducingBalance =
    data.interestType === 'Reducing Balance'

  // Clear repayment method if user changes back to Flat
  React.useEffect(() => {
    if (!isReducingBalance && data.repaymentMethod) {
      onChange('repaymentMethod', '')
    }
  }, [isReducingBalance])

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
        paymentFrequency: data.paymentFrequency,
        interestType: data.interestType,
        repaymentMethod: data.repaymentMethod,
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
  ------------------------------------------------------- */

  const handleVehicleAmountChange = (e) => {

    const value =
      digits(e.target.value)

    onChange(
      'vehicleAmount',
      value
    )
  }


  /* -------------------------------------------------------
     DOWN PAYMENT
  ------------------------------------------------------- */

  const handleDownPaymentChange = (e) => {

    onChange(
      'downPayment',
      digits(e.target.value)
    )
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


  /* -------------------------------------------------------
     RULE TOGGLE
  ------------------------------------------------------- */

  const toggleRules = () => {

    const nextValue =
      !rulesEnabled

    onChange(
      'customizeRules',
      nextValue
    )

    if (!nextValue) {

      onChange(
        'gracePeriod',
        ''
      )

      onChange(
        'latePenalty',
        ''
      )

      onChange(
        'penaltyType',
        ''
      )
    }
  }


  return (

    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">


      {/* =================================================
          MAIN FORM
      ================================================== */}

      <div className="space-y-4">


        {/* =================================================
            1. LOAN DETAILS
        ================================================== */}

        <SectionCard title="1. Loan Details">

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">


            {/* VEHICLE AMOUNT */}

            <Field
              label="Vehicle Amount"
              required
            >

              <AdornedInput
                prefix="₹"
                inputMode="numeric"
                value={vehicleAmount}
                onChange={handleVehicleAmountChange}
                placeholder="Enter vehicle amount"
              />

            </Field>


            {/* DOWN PAYMENT */}

            <Field
              label="Down Payment"
              required
            >

              <AdornedInput
                prefix="₹"
                inputMode="numeric"
                value={data.downPayment}
                onChange={handleDownPaymentChange}
                placeholder="Enter down payment"
              />

            </Field>


            {/* LOAN AMOUNT */}

            <div className="rounded-md bg-emerald-50 p-3">

              <div className="mb-1 flex items-center justify-between">

                <span className="text-xs font-medium text-emerald-800">
                  Loan Amount
                </span>

                <span className="text-[10px] text-emerald-600">
                  Auto-calculated
                </span>

              </div>

              <AdornedInput
                prefix="₹"
                value={
                  vehicleAmount === ''
                    ? ''
                    : loanAmount.toLocaleString('en-IN')
                }
                readOnly
                disabled
              />

            </div>


            {/* INTEREST TYPE */}

<Field label="Interest Type" required>
  <Select
    options={INTEREST_TYPES}
    placeholder="Select interest type"
    value={data.interestType}
    onChange={(e) =>
      onChange('interestType', e.target.value)
    }
  />
</Field>
{isReducingBalance && (
  <Field label="Repayment Method" required>
    <Select
      options={REPAYMENT_METHODS}
      placeholder="Select repayment method"
      value={data.repaymentMethod}
      onChange={(e) =>
        onChange('repaymentMethod', e.target.value)
      }
    />
  </Field>
)}


            {/* REPAYMENT METHOD */}

            {reducingBalance && (

              <Field
                label="Repayment Method"
                required
              >

                <RadioGroup
                  name="repaymentMethod"
                  options={REPAYMENT_METHODS}
                  value={data.repaymentMethod}
                  onChange={(value) =>
                    onChange(
                      'repaymentMethod',
                      value
                    )
                  }
                  className="flex flex-wrap gap-x-5 gap-y-2 pt-1"
                />

              </Field>

            )}


            {/* INTEREST RATE */}

            <Field
              label="Interest Rate"
              required
            >

              <AdornedInput
                suffix="%"
                inputMode="decimal"
                value={data.interestRate}
                onChange={handleInterestRateChange}
                placeholder="Enter interest rate"
              />

            </Field>


            {/* PAYMENT FREQUENCY */}

            <Field
              label="Payment Frequency"
              required
            >

              <Select
                options={PAYMENT_FREQUENCIES}
                placeholder="Select frequency"
                value={data.paymentFrequency}
                onChange={(e) =>
                  onChange(
                    'paymentFrequency',
                    e.target.value
                  )
                }
              />

            </Field>


            {/* LOAN TENURE */}

            <Field
              label="Loan Tenure"
              required
            >

              <div className="grid grid-cols-[1fr_110px] gap-2">

                <Input
                  inputMode="numeric"
                  value={data.tenure}
                  onChange={handleTenureChange}
                  placeholder="Enter tenure"
                />

                <Select
                  options={TENURE_UNITS}
                  value={data.tenureUnit}
                  onChange={(e) =>
                    onChange(
                      'tenureUnit',
                      e.target.value
                    )
                  }
                />

              </div>

            </Field>


            {/* FIRST DUE DATE */}

            <Field
              label="First Due Date"
              required
            >

              <div className="relative">

                <CalendarIcon
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                />

                <Input
                  type="date"
                  className="pl-9"
                  value={data.firstDueDate}
                  onChange={(e) =>
                    onChange(
                      'firstDueDate',
                      e.target.value
                    )
                  }
                />

              </div>

            </Field>


            {/* DOCUMENT CHARGE */}

            <Field
              label="Document Charge"
              required
            >

              <AdornedInput
                prefix="₹"
                inputMode="numeric"
                value={data.documentCharge}
                onChange={(e) =>
                  onChange(
                    'documentCharge',
                    digits(e.target.value)
                  )
                }
                placeholder="Enter document charge"
              />

            </Field>

          </div>

        </SectionCard>

        {/* =================================================
            2. CUSTOMER-SPECIFIC CHARGES
        ================================================== */}

        <SectionCard
          title={
            <>
              2. Customer Charges{' '}
              <span className="font-medium text-slate-400">
                Optional
              </span>
            </>
          }
          right={
            <button
              type="button"
              onClick={toggleRules}
              className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800"
            >
              <PlusIcon className="h-4 w-4" />
              {rulesEnabled ? 'Remove Charges' : 'Add Grace & Penalty'}
            </button>
          }
        >
          {!rulesEnabled ? (
            <p className="text-xs text-slate-500">
              Use this only when a custom grace period or late
              payment penalty needs to be applied to this customer.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Field label="Grace Period">
                <AdornedInput
                  suffix="Days"
                  inputMode="numeric"
                  value={data.gracePeriod}
                  onChange={(e) =>
                    onChange('gracePeriod', digits(e.target.value))
                  }
                  placeholder="Enter days"
                />
              </Field>

              <Field label="Late Payment Penalty">
                <AdornedInput
                  prefix="₹"
                  suffix="Amount"
                  inputMode="numeric"
                  value={data.latePenalty}
                  onChange={(e) =>
                    onChange('latePenalty', digits(e.target.value))
                  }
                  placeholder="Enter amount"
                />
              </Field>

              <Field label="Penalty Type">
                <Select
                  options={PENALTY_TYPES}
                  value={data.penaltyType}
                  onChange={(e) =>
                    onChange('penaltyType', e.target.value)
                  }
                />
              </Field>
            </div>
          )}
        </SectionCard>


      </div>


      {/* =================================================
          REPAYMENT SUMMARY
      ================================================== */}

      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-4">

        <h3 className="mb-4 text-sm font-semibold text-emerald-900">
          Repayment Summary
        </h3>


        <div className="space-y-3">


          {/* PRINCIPAL */}

          <SummaryRow
            label="Principal"
            value={formatINR(repayment.principal)}
          />


          {/* INTEREST */}

          <SummaryRow
            label="Interest"
            value={formatINR(repayment.interest)}
          />


          {/* TOTAL PAYABLE */}

          <div className="border-t border-emerald-100 pt-3">

            <SummaryRow
              label="Total Payable"
              value={formatINR(repayment.totalPayable)}
              strong
            />

          </div>


          {/* EMI */}

          <SummaryRow
            label="EMI Amount"
            value={formatINR(repayment.emiAmount)}
          />


          {/* NUMBER OF PAYMENTS */}

          <SummaryRow
            label="Number of Payments"
            value={repayment.numberOfPayments || 0}
          />


          {/* FIRST DUE DATE */}

          <SummaryRow
            label="First Due Date"
            value={formatDate(data.firstDueDate)}
          />

        </div>


        {/* INFO */}

        <div className="mt-4 border-t border-emerald-100 pt-3">

          <p className="text-[10px] leading-4 text-slate-500">
            Repayment values are calculated from the loan amount,
            interest rate, tenure and payment frequency.
          </p>

        </div>

        </div>

      </aside>

    </div>
  )
}


export default LoanTab
