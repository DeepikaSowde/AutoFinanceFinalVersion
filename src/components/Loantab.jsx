
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
  CalendarIcon ,
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


const digits = (value = '') =>
  value.replace(/\D/g, '')

const decimal = (value = '') =>
  value.replace(/[^\d.]/g, '')

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
  const annualRate = Number(interestRate) || 0
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
     NUMBER OF PAYMENTS
  ------------------------------------------------------- */

  let numberOfPayments = tenureValue

  if (tenureUnit === 'Years') {
    if (paymentFrequency === 'Monthly') {
      numberOfPayments = tenureValue * 12
    } else if (paymentFrequency === 'Quarterly') {
      numberOfPayments = tenureValue * 4
    } else if (paymentFrequency === 'Half-Yearly') {
      numberOfPayments = tenureValue * 2
    } else if (paymentFrequency === 'Yearly') {
      numberOfPayments = tenureValue
    } else {
      numberOfPayments = tenureValue * 12
    }
  }

  /* -------------------------------------------------------
     PAYMENT FREQUENCY
  ------------------------------------------------------- */

  let periodsPerYear = 12

  if (paymentFrequency === 'Weekly') {
    periodsPerYear = 52
  } else if (paymentFrequency === 'Bi-Weekly') {
    periodsPerYear = 26
  } else if (paymentFrequency === 'Monthly') {
    periodsPerYear = 12
  } else if (paymentFrequency === 'Quarterly') {
    periodsPerYear = 4
  } else if (paymentFrequency === 'Half-Yearly') {
    periodsPerYear = 2
  } else if (paymentFrequency === 'Yearly') {
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

      for (
        let i = 0;
        i < numberOfPayments;
        i++
      ) {
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
  const { t } = useTranslation()
  const [referralEnabled, setReferralEnabled] = useState(Boolean(data.referredBy || data.referredByCommission))

  /* -------------------------------------------------------
     VEHICLE / LOAN AMOUNT
  ------------------------------------------------------- */

  const vehicleAmount =
  data.vehicleAmount !== "" && data.vehicleAmount != null
    ? data.vehicleAmount
    : vehicleAmountFromVehicle ?? ""

  const loanAmount = Number(data.loanAmount) || 0

  /* -------------------------------------------------------
     CONDITIONS
  ------------------------------------------------------- */

  const rulesEnabled =
    data.customizeRules === true

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

        <SectionCard
          title={`1. ${t('loan.loanDetails')}`}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">

            {/* VEHICLE AMOUNT */}

            <Field
              label={t('loan.vehicleAmount')}
              required
            >
              <AdornedInput
                prefix="₹"
                inputMode="numeric"
                value={vehicleAmount}
                onChange={
                  handleVehicleAmountChange
                }
                placeholder={t(
                  'loan.enterVehicleAmount'
                )}
              />
            </Field>

            {/* DOWN PAYMENT */}

            <Field
              label={t('loan.downPayment')}
              required
            >
              <AdornedInput
                prefix="₹"
                inputMode="numeric"
                value={data.downPayment}
                onChange={
                  handleDownPaymentChange
                }
                placeholder={t(
                  'loan.enterDownPayment'
                )}
              />
            </Field>

            {/* LOAN AMOUNT */}

            <div className="rounded-md bg-emerald-50 p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-emerald-800">
                  {t('loan.loanAmount')}
                </span>

              </div>

              <AdornedInput
                prefix="₹"
                inputMode="numeric"
                value={data.loanAmount || ''}
                onChange={(e) =>
                  onChange('loanAmount', digits(e.target.value))
                }
                placeholder={t('loan.enterLoanAmount')}
              />
            </div>

            {/* INTEREST TYPE */}

            <Field
              label={t('loan.interestType')}
              required
            >
              <Select
                options={INTEREST_TYPES}
                placeholder={t(
                  'loan.selectInterestType'
                )}
                translationKey="options.interestTypes"
                value={data.interestType}
                onChange={(e) =>
                  onChange(
                    'interestType',
                    e.target.value
                  )
                }
              />
            </Field>

            {/* REPAYMENT METHOD */}

            {reducingBalance && (
              <Field
                label={t(
                  'loan.repaymentMethod'
                )}
                required
              >
                <RadioGroup
                  name="repaymentMethod"
                  options={REPAYMENT_METHODS}
                  translationKey="options.repaymentMethods"
                  value={
                    data.repaymentMethod
                  }
                  onChange={(value) =>
                    onChange(
                      'repaymentMethod',
                      value
                    )
                  }
                />
              </Field>
            )}

            {/* INTEREST RATE */}

            <Field
              label={t('loan.interestRate')}
              required
            >
              <AdornedInput
                suffix="%"
                inputMode="decimal"
                value={data.interestRate}
                onChange={
                  handleInterestRateChange
                }
                placeholder={t(
                  'loan.enterInterestRate'
                )}
              />
            </Field>

            {/* PAYMENT FREQUENCY */}

            <Field
              label={t(
                'loan.paymentFrequency'
              )}
              required
            >
              <Select
                options={
                  PAYMENT_FREQUENCIES
                }
                placeholder={t(
                  'loan.selectFrequency'
                )}
                translationKey="options.paymentFrequencies"
                value={
                  data.paymentFrequency
                }
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
              label={t('loan.loanTenure')}
              required
            >
              <div className="grid grid-cols-[1fr_110px] gap-2">

                <Input
                  inputMode="numeric"
                  value={data.tenure}
                  onChange={
                    handleTenureChange
                  }
                  placeholder={t(
                    'loan.enterTenure'
                  )}
                />

                <Select
                  options={TENURE_UNITS}
                  translationKey="options.tenureUnits"
                  value={
                    data.tenureUnit
                  }
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
              label={t(
                'loan.firstDueDate'
              )}
              required
            >
              <div className="relative">

                <CalendarIcon
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                />

                <Input
                  type="date"
                  className="pl-9"
                  value={
                    data.firstDueDate
                  }
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
              label={t(
                'loan.documentCharge'
              )}
              required
            >
              <AdornedInput
                prefix="₹"
                inputMode="numeric"
                value={
                  data.documentCharge
                }
                onChange={(e) =>
                  onChange(
                    'documentCharge',
                    digits(
                      e.target.value
                    )
                  )
                }
                placeholder={t(
                  'loan.enterDocumentCharge'
                )}
              />
            </Field>

            <div className="md:col-span-2">
              <button
                type="button"
                onClick={() => {
                  const nextEnabled = !referralEnabled
                  setReferralEnabled(nextEnabled)
                  if (!nextEnabled) {
                    onChange('referredBy', '')
                    onChange('referredByCommission', '')
                  }
                }}
                className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
              >
                {referralEnabled
                  ? `− ${t('loan.removeReferredBy')}`
                  : `+ ${t('loan.addReferredBy')}`}
              </button>

              {referralEnabled && (
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Field label={t('loan.referredBy')}>
                    <Input
                      value={data.referredBy || ''}
                      onChange={(e) => onChange('referredBy', e.target.value)}
                      placeholder={t('loan.enterReferredBy')}
                    />
                  </Field>
                  <Field label={t('loan.commission')}>
                    <AdornedInput
                      suffix="%"
                      inputMode="decimal"
                      value={data.referredByCommission || ''}
                      onChange={(e) => onChange('referredByCommission', digits(e.target.value))}
                      placeholder={t('loan.enterCommission')}
                    />
                  </Field>
                </div>
              )}
            </div>

          </div>
        </SectionCard>

        <div>
          <button
            type="button"
            onClick={toggleRules}
            className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
          >
            {rulesEnabled
              ? `− ${t('loan.removeCharges')}`
              : `+ ${t('loan.addGracePenalty')}`}
          </button>

          {rulesEnabled && (
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">

              {/* GRACE PERIOD */}

              <Field
                label={t(
                  'loan.gracePeriod'
                )}
              >
                <AdornedInput
                  suffix={t(
                    'common.days'
                  )}
                  inputMode="numeric"
                  value={
                    data.gracePeriod
                  }
                  onChange={(e) =>
                    onChange(
                      'gracePeriod',
                      digits(
                        e.target.value
                      )
                    )
                  }
                  placeholder={t(
                    'loan.enterDays'
                  )}
                />
              </Field>

              {/* LATE PAYMENT PENALTY */}

              <Field
                label={t(
                  'loan.latePaymentPenalty'
                )}
              >
                <AdornedInput
                  prefix="₹"
                  suffix={t(
                    'common.amount'
                  )}
                  inputMode="numeric"
                  value={
                    data.latePenalty
                  }
                  onChange={(e) =>
                    onChange(
                      'latePenalty',
                      digits(
                        e.target.value
                      )
                    )
                  }
                  placeholder={t(
                    'loan.enterAmount'
                  )}
                />
              </Field>

              {/* PENALTY TYPE */}

              <Field
                label={t(
                  'loan.penaltyType'
                )}
              >
                <Select
                  options={PENALTY_TYPES}
                  translationKey="options.penaltyTypes"
                  value={
                    data.penaltyType
                  }
                  onChange={(e) =>
                    onChange(
                      'penaltyType',
                      e.target.value
                    )
                  }
                />
              </Field>

            </div>
          )}
        </div>

      </div>

      {/* =================================================
          REPAYMENT SUMMARY
      ================================================== */}

      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">

        <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-4">

          <h3 className="mb-4 text-sm font-semibold text-emerald-900">
            {t('loan.repaymentSummary')}
          </h3>

          <div className="space-y-3">

            {/* PRINCIPAL */}

            <SummaryRow
              label={t('loan.principal')}
              value={formatINR(
                repayment.principal
              )}
            />

            {/* INTEREST */}

            <SummaryRow
              label={t('loan.interest')}
              value={formatINR(
                repayment.interest
              )}
            />

            {/* TOTAL PAYABLE */}

            <div className="border-t border-emerald-100 pt-3">

              <SummaryRow
                label={t(
                  'loan.totalPayable'
                )}
                value={formatINR(
                  repayment.totalPayable
                )}
                strong
              />

            </div>

            {/* EMI */}

            <SummaryRow
              label={t(
                'loan.emiAmount'
              )}
              value={formatINR(
                repayment.emiAmount
              )}
            />

            {/* NUMBER OF PAYMENTS */}

            <SummaryRow
              label={t(
                'loan.numberOfPayments'
              )}
              value={
                repayment.numberOfPayments ||
                0
              }
            />

            {/* FIRST DUE DATE */}

            <SummaryRow
              label={t(
                'loan.firstDueDate'
              )}
              value={formatDate(
                data.firstDueDate
              )}
            />

          </div>

          {/* INFO */}

          <div className="mt-4 border-t border-emerald-100 pt-3">

            <p className="text-[10px] leading-4 text-slate-500">
              {t(
                'loan.repaymentInfo'
              )}
            </p>

          </div>

        </div>

      </aside>

    </div>
  )
}

export default LoanTab
