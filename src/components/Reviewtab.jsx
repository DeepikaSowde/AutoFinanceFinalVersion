import React from 'react'
import { useTranslation } from 'react-i18next'

import {
  OutlineButton,
  CheckCircle,
  ClockIcon,
  ArrowRight,
  formatINR,
  formatDate,
} from './Formcontrols'


const dash = (value) =>
  value === '' || value === null || value === undefined
    ? '—'
    : value

/* =========================================================
   COMPACT CARD
========================================================= */

const Card = ({ title, right, children }) => (
  <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
    <header className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
      <h3 className="text-sm font-semibold text-slate-800">
        {title}
      </h3>

      {right}
    </header>

    <div className="p-3">
      {children}
    </div>
  </section>
)

/* =========================================================
   COMPACT ROW
========================================================= */

const Row = ({ label, value }) => (
  <div className="flex items-center justify-between gap-4 py-1.5 text-xs">
    <span className="text-slate-500">
      {label}
    </span>

    <span className="max-w-[65%] text-right font-medium text-slate-800">
      {value}
    </span>
  </div>
)

/* =========================================================
   CUSTOMER KYC STATUS
========================================================= */

const KycStatus = ({ customer }) => {
  const { t } = useTranslation()

  const allUploaded =
    !!customer.aadhaarFile &&
    !!customer.panFile &&
    !!customer.dlFile &&
    !!customer.voterFile

  return (
    <div className="flex items-center gap-1.5">
      {allUploaded ? (
        <>
          <CheckCircle className="h-4 w-4 text-emerald-600" />

          <span className="text-xs font-medium text-emerald-700">
            {t('review.kycUploaded')}
          </span>
        </>
      ) : (
        <>
          <ClockIcon className="h-4 w-4 text-amber-500" />

          <span className="text-xs font-medium text-amber-600">
            {t('review.kycPending')}
          </span>
        </>
      )}
    </div>
  )
}

/* =========================================================
   REVIEW TAB
========================================================= */

const ReviewTab = ({
  form,
  onViewSchedule,
}) => {
  const { t } = useTranslation()

  const {
    customer,
    vehicle,
    guarantor,
    loan,
  } = form

  const vehicleAmount =
    loan.vehicleAmount !== "" && loan.vehicleAmount != null
      ? loan.vehicleAmount
      : vehicle.amount ?? ""

  const loanAmount = Number(loan.loanAmount) || 0

  const hypothecated =
    vehicle.hypothecation === 'Yes'

  const reducingBalance =
    loan.interestType === 'Reducing Balance'

  /* =======================================================
     DISPLAY TRANSLATIONS FOR STORED VALUES
  ======================================================= */

  const translateOption = (group, value) => {
    if (!value) return '—'

    return t(`options.${group}.${value}`, {
      defaultValue: value,
    })
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">

      {/* ===================================================
          LEFT COLUMN
      ==================================================== */}

      <div className="space-y-3">

        {/* CUSTOMER */}

        <Card
          title={t('review.customerInformation')}
          right={
            <KycStatus customer={customer} />
          }
        >
          <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">

            <Row
              label={t('review.name')}
              value={dash(customer.name)}
            />

            <Row
              label={t('review.mobile')}
              value={
                customer.mobile
                  ? `${customer.countryCode || ''} ${customer.mobile}`
                  : '—'
              }
            />

            <Row
              label={t('review.referredBy')}
              value={
                customer.referredBy
                  ? `${customer.referredBy}${
                      customer.referredByPercentage
                        ? ` (${customer.referredByPercentage}%)`
                        : ''
                    }`
                  : '—'
              }
            />

            <Row
              label={t('review.address')}
              value={
                [
                  customer.area,
                  customer.address,
                ]
                  .filter(Boolean)
                  .join(', ') || '—'
              }
            />

          </div>
        </Card>

        {/* VEHICLE */}

        <Card title={t('review.vehicle')}>
          <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">

            <Row
              label={t('review.vehicleType')}
              value={translateOption(
                'vehicleTypes',
                vehicle.type
              )}
            />

            <Row
              label={t('review.brandModel')}
              value={
                [
                  translateOption(
                    'brands',
                    vehicle.brand
                  ),
                  translateOption(
                    'models',
                    vehicle.model
                  ),
                ]
                  .filter(
                    (value) => value !== '—'
                  )
                  .join(' / ') || '—'
              }
            />

            <Row
              label={t('review.vehicleNumber')}
              value={dash(vehicle.regNo)}
            />

            <Row
              label={t('review.vehicleAmount')}
              value={formatINR(vehicle.amount)}
            />

            <Row
              label={t('review.manufacturingYear')}
              value={dash(vehicle.year)}
            />

            <Row
              label={t('review.hypothecation')}
              value={
                vehicle.hypothecation
                  ? translateOption(
                      'yesNo',
                      vehicle.hypothecation
                    )
                  : '—'
              }
            />

            {hypothecated && (
              <Row
                label={t('review.existingFinancier')}
                value={translateOption(
                  'financiers',
                  vehicle.financier
                )}
              />
            )}

          </div>
        </Card>

        {/* GUARANTOR */}

        <Card title={t('review.guarantor')}>
          {guarantor.required === 'Yes' ? (

            <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">

              <Row
                label={t('review.name')}
                value={dash(guarantor.name)}
              />

              <Row
                label={t('review.mobile')}
                value={
                  guarantor.mobile
                    ? `${guarantor.countryCode || ''} ${guarantor.mobile}`
                    : '—'
                }
              />

              <Row
                label={t('review.relationship')}
                value={translateOption(
                  'relationships',
                  guarantor.relationship
                )}
              />

              <Row
                label={t('review.residence')}
                value={translateOption(
                  'residence',
                  guarantor.residenceType
                )}
              />

            </div>

          ) : (

            <div className="flex items-center justify-between py-1">

              <span className="text-xs text-slate-500">
                {t('review.guarantorRequired')}
              </span>

              <span className="text-xs font-medium text-slate-800">
                {t('common.no')}
              </span>

            </div>
          )}
        </Card>

      </div>

      {/* ===================================================
          RIGHT COLUMN
      ==================================================== */}

      <div className="space-y-3">

        {/* LOAN */}

        <Card title={t('review.loanDetails')}>

          <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">

            <Row
              label={t('review.vehicleAmount')}
              value={formatINR(vehicleAmount)}
            />

            <Row
              label={t('review.downPayment')}
              value={formatINR(loan.downPayment)}
            />

            <Row
              label={t('review.loanAmount')}
              value={loan.loanAmount === '' ? '—' : formatINR(loanAmount)}
            />

            <Row
              label={t('review.interestType')}
              value={translateOption(
                'interestTypes',
                loan.interestType
              )}
            />

            {reducingBalance && (
              <Row
                label={t('review.repaymentMethod')}
                value={translateOption(
                  'repaymentMethods',
                  loan.repaymentMethod
                )}
              />
            )}

            <Row
              label={t('review.interestRate')}
              value={
                loan.interestRate
                  ? `${loan.interestRate}%`
                  : '—'
              }
            />

            <Row
              label={t('review.paymentFrequency')}
              value={translateOption(
                'paymentFrequencies',
                loan.paymentFrequency
              )}
            />

            <Row
              label={t('review.loanTenure')}
              value={
                loan.tenure
                  ? `${loan.tenure} ${
                      loan.tenureUnit
                        ? translateOption(
                            'tenureUnits',
                            loan.tenureUnit
                          )
                        : ''
                    }`
                  : '—'
              }
            />

            <Row
              label={t('review.firstDueDate')}
              value={formatDate(
                loan.firstDueDate
              )}
            />

            <Row
              label={t('review.documentCharge')}
              value={formatINR(
                loan.documentCharge
              )}
            />

          </div>

          {/* CUSTOMER-SPECIFIC CHARGES */}

          {loan.customizeRules && (
            <div className="mt-3 border-t border-slate-100 pt-3">

              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                {t('review.customerSpecificCharges')}
              </p>

              <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">

                <Row
                  label={t('review.gracePeriod')}
                  value={
                    loan.gracePeriod
                      ? `${loan.gracePeriod} ${t(
                          'common.days'
                        )}`
                      : '—'
                  }
                />

                <Row
                  label={t('review.latePenalty')}
                  value={formatINR(
                    loan.latePenalty
                  )}
                />

                <Row
                  label={t('review.penaltyType')}
                  value={translateOption(
                    'penaltyTypes',
                    loan.penaltyType
                  )}
                />

              </div>
            </div>
          )}

        </Card>

        {/* REPAYMENT SCHEDULE */}

        <Card title={t('review.repaymentSchedule')}>

          <div className="flex items-center justify-between gap-3">

            <div>
              <p className="text-xs font-medium text-slate-700">
                {t('review.reviewInstallmentSchedule')}
              </p>

              <p className="mt-0.5 text-[10px] text-slate-400">
                {t('review.checkRepaymentDates')}
              </p>
            </div>

            <OutlineButton onClick={onViewSchedule}>
              {t('review.viewSchedule')}

              <ArrowRight className="h-3.5 w-3.5" />
            </OutlineButton>

          </div>

        </Card>

      </div>

    </div>
  )
}

export default ReviewTab