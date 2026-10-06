
import React, { useState } from 'react'

import {
  Field,
  Input,
  Textarea,
  Select,
  PhoneInput,
  RadioGroup,
  UploadButton,
  SectionCard,
  InfoNote,
} from './Formcontrols'

import { KycRow } from './CustomerTab'

import {
  RELATIONSHIPS,
  RESIDENCE_TYPES,
} from '../../Options'

const GuarantorTab = ({ data, onChange }) => {
  const [kycEnabled, setKycEnabled] = useState(
    data.kycRequired !== 'No'
  )

  const set = (key) => (e) => onChange(key, e.target.value)

  const required = data.required === 'Yes'

  const toggleKyc = () => {
    const nextValue = !kycEnabled

    setKycEnabled(nextValue)
    onChange('kycRequired', nextValue ? 'Yes' : 'No')
  }

  return (
    <div className="space-y-3">

      {/* =====================================================
          GUARANTOR REQUIRED
      ====================================================== */}
      <div className="flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">

        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Guarantor Required?
          </h2>

          <p className="mt-0.5 text-[11px] text-slate-500">
            Select whether this application requires a guarantor.
          </p>
        </div>

        <RadioGroup
          name="guarantorRequired"
          options={['Yes', 'No']}
          value={data.required}
          onChange={(value) =>
            onChange('required', value)
          }
        />

      </div>

      {/* =====================================================
          NO GUARANTOR
      ====================================================== */}
      {!required ? (
        <InfoNote>
          No guarantor is required for this application.
        </InfoNote>
      ) : (

        /* ===================================================
           GUARANTOR CONTENT
        ==================================================== */
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.8fr)_minmax(300px,1fr)]">

          {/* =================================================
              LEFT — GUARANTOR DETAILS
          ================================================== */}
          <SectionCard title="Guarantor Details">

            <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">

              {/* Name */}
              <Field label="Guarantor Name" required>
                <Input
                  value={data.name}
                  onChange={set('name')}
                  placeholder="Enter guarantor name"
                />
              </Field>

              {/* Mobile */}
              <Field label="Mobile Number" required>
                <PhoneInput
                  code={data.countryCode}
                  mobile={data.mobile}
                  onCodeChange={(value) =>
                    onChange('countryCode', value)
                  }
                  onMobileChange={(value) =>
                    onChange('mobile', value)
                  }
                />
              </Field>

              {/* Relationship */}
              <Field
                label="Relationship with Customer"
                required
              >
                <Input
                  list="guarantor-relationship-options"
                  value={data.relationship}
                  onChange={set('relationship')}
                  placeholder="Enter relationship"
                />
                <datalist id="guarantor-relationship-options">
                  {RELATIONSHIPS.map((relationship) => (
                    <option key={relationship} value={relationship} />
                  ))}
                </datalist>
              </Field>

              {/* Profession */}
              <Field label="Profession">
                <Input
                  value={data.profession}
                  onChange={set('profession')}
                  placeholder="Enter profession"
                />
              </Field>

              {/* Address */}
              <Field
                label="Address"
                required
                className="md:col-span-2"
              >
                <Textarea
                  value={data.address}
                  onChange={set('address')}
                  placeholder="Enter full address"
                  className="min-h-[64px] resize-none"
                />
              </Field>

            </div>

            {/* Location */}
            <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-3">

              <Field label="Area / Locality">
                <Input
                  value={data.area}
                  onChange={set('area')}
                  placeholder="Enter area / locality"
                />
              </Field>

              <Field label="Landmark">
                <Input
                  value={data.landmark}
                  onChange={set('landmark')}
                  placeholder="Enter landmark"
                />
              </Field>

              <Field label="Pincode">
                <Input
                  inputMode="numeric"
                  maxLength={6}
                  value={data.pincode}
                  onChange={(e) =>
                    onChange(
                      'pincode',
                      e.target.value.replace(/\D/g, '')
                    )
                  }
                  placeholder="Enter 6-digit pincode"
                />
              </Field>

            </div>

            {/* Residence */}
            <div className="mt-3 max-w-sm">
              <Field label="Residence Type" required>
                <Select
                  options={RESIDENCE_TYPES}
                  placeholder="Select residence type"
                  value={data.residenceType}
                  onChange={set('residenceType')}
                />
              </Field>
            </div>

          </SectionCard>

          {/* =================================================
              RIGHT — OPTIONAL KYC
          ================================================== */}
          <SectionCard
            title="Guarantor KYC"
            right={
              <button
                type="button"
                onClick={toggleKyc}
                className={[
                  'relative h-5 w-9 rounded-full transition-colors',
                  kycEnabled
                    ? 'bg-emerald-600'
                    : 'bg-slate-300',
                ].join(' ')}
                aria-label="Toggle guarantor KYC"
              >
                <span
                  className={[
                    'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                    kycEnabled
                      ? 'translate-x-4'
                      : 'translate-x-0.5',
                  ].join(' ')}
                />
              </button>
            }
          >

            {/* KYC status */}
            <div className="mb-3 flex items-center justify-between">

              <div>
                <p className="text-xs font-medium text-slate-700">
                  KYC Documents
                </p>

                <p className="text-[10px] text-slate-400">
                  Optional for guarantor
                </p>
              </div>

              <span
                className={[
                  'rounded px-2 py-1 text-[10px] font-medium',
                  kycEnabled
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-slate-100 text-slate-500',
                ].join(' ')}
              >
                {kycEnabled ? 'Enabled' : 'Optional'}
              </span>

            </div>

            {kycEnabled ? (

              <div className="space-y-3">

                <KycRow
                  label="Aadhaar Number"
                  placeholder="Enter Aadhaar number"
                  uploadLabel="Upload"
                  value={data.aadhaarNo}
                  file={data.aadhaarFile}
                  onValue={(value) =>
                    onChange('aadhaarNo', value)
                  }
                  onFile={(file) =>
                    onChange('aadhaarFile', file)
                  }
                />

                <KycRow
                  label="PAN Number"
                  placeholder="Enter PAN number"
                  uploadLabel="Upload"
                  value={data.panNo}
                  file={data.panFile}
                  onValue={(value) =>
                    onChange('panNo', value)
                  }
                  onFile={(file) =>
                    onChange('panFile', file)
                  }
                />

                <KycRow
                  label="Driving Licence"
                  placeholder="Enter DL number"
                  uploadLabel="Upload"
                  value={data.dlNo}
                  file={data.dlFile}
                  onValue={(value) =>
                    onChange('dlNo', value)
                  }
                  onFile={(file) =>
                    onChange('dlFile', file)
                  }
                />

                <KycRow
                  label="Voter ID"
                  placeholder="Enter Voter ID"
                  uploadLabel="Upload"
                  value={data.voterNo}
                  file={data.voterFile}
                  onValue={(value) =>
                    onChange('voterNo', value)
                  }
                  onFile={(file) =>
                    onChange('voterFile', file)
                  }
                />

              </div>

            ) : (

              <div className="flex min-h-[180px] items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50/70 px-4">

                <div className="text-center">

                  <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm text-slate-400">
                    +
                  </div>

                  <p className="text-xs font-medium text-slate-600">
                    KYC is optional
                  </p>

                  <p className="mt-1 text-[10px] leading-4 text-slate-400">
                    Enable KYC if identity documents are
                    required for this guarantor.
                  </p>

                </div>

              </div>

            )}

          </SectionCard>

        </div>
      )}

    </div>
  )
}

export default GuarantorTab
