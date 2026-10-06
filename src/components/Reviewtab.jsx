
import React from 'react'

import {
  OutlineButton,
  CheckCircle,
  ClockIcon,
  ArrowRight,
  formatINR,
  formatDate,
} from './Formcontrols'

import { calcLoanAmount } from './Loantab'

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
   Only Customer KYC is checked here.
========================================================= */

const KycStatus = ({ customer }) => {

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
            KYC Uploaded
          </span>
        </>
      ) : (
        <>
          <ClockIcon className="h-4 w-4 text-amber-500" />

          <span className="text-xs font-medium text-amber-600">
            KYC Pending
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

  const {
    customer,
    vehicle,
    guarantor,
    loan,
  } = form

  const vehicleAmount =
    loan.vehicleAmount ?? vehicle.amount

  const loanAmount = calcLoanAmount(
    vehicleAmount,
    loan.downPayment
  )

  const hypothecated =
    vehicle.hypothecation === 'Yes'

  const reducingBalance =
    loan.interestType === 'Reducing Balance'

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">

      {/* ===================================================
          LEFT COLUMN
      ==================================================== */}

      <div className="space-y-3">

        {/* CUSTOMER */}
        <Card
          title="Customer Information"
          right={
            <KycStatus customer={customer} />
          }
        >

          <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">

            <Row
              label="Name"
              value={dash(customer.name)}
            />

            <Row
              label="Mobile"
              value={
                customer.mobile
                  ? `${customer.countryCode || ''} ${customer.mobile}`
                  : '—'
              }
            />

            <Row
              label="Referred By"
              value={
                customer.referredBy
                  ? `${customer.referredBy}${customer.referredByPercentage ? ` (${customer.referredByPercentage}%)` : ''}`
                  : '—'
              }
            />

            <Row
              label="Address"
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
        <Card title="Vehicle">

          <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">

            <Row
              label="Vehicle Type"
              value={dash(vehicle.type)}
            />

            <Row
              label="Brand / Model"
              value={
                [
                  vehicle.brand,
                  vehicle.model,
                ]
                  .filter(Boolean)
                  .join(' / ') || '—'
              }
            />

            <Row
              label="Vehicle Number"
              value={dash(vehicle.regNo)}
            />

            <Row
              label="Vehicle Amount"
              value={formatINR(vehicle.amount)}
            />

            <Row
              label="Manufacturing Year"
              value={dash(vehicle.year)}
            />

            <Row
              label="Hypothecation"
              value={dash(vehicle.hypothecation)}
            />

            {hypothecated && (
              <Row
                label="Existing Financier"
                value={dash(vehicle.financier)}
              />
            )}

          </div>

        </Card>


        {/* GUARANTOR */}
        <Card title="Guarantor">

          {guarantor.required === 'Yes' ? (

            <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">

              <Row
                label="Name"
                value={dash(guarantor.name)}
              />

              <Row
                label="Mobile"
                value={
                  guarantor.mobile
                    ? `${guarantor.countryCode || ''} ${guarantor.mobile}`
                    : '—'
                }
              />

              <Row
                label="Relationship"
                value={dash(guarantor.relationship)}
              />

              <Row
                label="Residence"
                value={dash(guarantor.residenceType)}
              />

            </div>

          ) : (

            <div className="flex items-center justify-between py-1">

              <span className="text-xs text-slate-500">
                Guarantor Required
              </span>

              <span className="text-xs font-medium text-slate-800">
                No
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
        <Card title="Loan Details">

          <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">

            <Row
              label="Vehicle Amount"
              value={formatINR(vehicleAmount)}
            />

            <Row
              label="Down Payment"
              value={formatINR(loan.downPayment)}
            />

            <Row
              label="Loan Amount"
              value={
                vehicleAmount === ''
                  ? '—'
                  : formatINR(loanAmount)
              }
            />

            <Row
              label="Interest Type"
              value={dash(loan.interestType)}
            />

            {reducingBalance && (
              <Row
                label="Repayment Method"
                value={dash(loan.repaymentMethod)}
              />
            )}

            <Row
              label="Interest Rate"
              value={
                loan.interestRate
                  ? `${loan.interestRate}%`
                  : '—'
              }
            />

            <Row
              label="Payment Frequency"
              value={dash(loan.paymentFrequency)}
            />

            <Row
              label="Loan Tenure"
              value={
                loan.tenure
                  ? `${loan.tenure} ${loan.tenureUnit || ''}`
                  : '—'
              }
            />

            <Row
              label="First Due Date"
              value={formatDate(loan.firstDueDate)}
            />

            <Row
              label="Document Charge"
              value={formatINR(loan.documentCharge)}
            />

          </div>


          {/* CUSTOMER-SPECIFIC CHARGES */}
          {loan.customizeRules && (
            <div className="mt-3 border-t border-slate-100 pt-3">

              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                Customer-Specific Charges
              </p>

              <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">

                <Row
                  label="Grace Period"
                  value={
                    loan.gracePeriod
                      ? `${loan.gracePeriod} Days`
                      : '—'
                  }
                />

                <Row
                  label="Late Penalty"
                  value={formatINR(loan.latePenalty)}
                />

                <Row
                  label="Penalty Type"
                  value={dash(loan.penaltyType)}
                />

              </div>

            </div>
          )}

        </Card>


        {/* REPAYMENT SCHEDULE */}
        <Card title="Repayment Schedule">

          <div className="flex items-center justify-between gap-3">

            <div>
              <p className="text-xs font-medium text-slate-700">
                Review installment schedule
              </p>

              <p className="mt-0.5 text-[10px] text-slate-400">
                Check repayment dates and amounts.
              </p>
            </div>

            <OutlineButton onClick={onViewSchedule}>
              View Schedule
              <ArrowRight className="h-3.5 w-3.5" />
            </OutlineButton>

          </div>

        </Card>

      </div>

    </div>
  )
}

export default ReviewTab
