
import React, { useState } from 'react'

import {
  Field,
  Input,
  Textarea,
  Select,
  AdornedInput,
  RadioGroup,
  UploadButton,
  PhotoUpload,
  SectionCard,
  OutlineButton,
  InfoIcon,
  RefreshIcon,
  PlusIcon,
} from './Formcontrols'

import {
  VEHICLE_TYPES,
  BRANDS,
  MODELS,
  VARIANTS,
  COLOURS,
  FUEL_TYPES,
  MANUFACTURING_YEARS,
  RTO_LOCATIONS,
  FINANCIERS,
  NOC_STATUSES,
  INSURANCE_COMPANIES,
} from '../../Options'

const YES_NO = ['Yes', 'No']

const VehicleTab = ({ data, onChange, onFetchVehicle }) => {
  const [activeSection, setActiveSection] = useState('vehicle')

  const set = (key) => (e) => onChange(key, e.target.value)

  const hypothecated = data.hypothecation === 'Yes'

  const sections = [
    {
      id: 'vehicle',
      number: '01',
      label: 'Vehicle Information',
      description: 'Basic vehicle details',
    },
    {
      id: 'registration',
      number: '02',
      label: 'Registration',
      description: 'RC, RTO & hypothecation',
    },
    {
      id: 'insurance',
      number: '03',
      label: 'Insurance',
      description: 'Insurance & compliance',
    },
  ]

  return (
    <div className="space-y-3">

      {/* =====================================================
          INTERNAL VEHICLE NAVIGATION
      ====================================================== */}
      <div className="rounded-lg border border-slate-200 bg-white p-1.5">
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">

          {sections.map((section) => {
            const active = activeSection === section.id

            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
                className={[
                  'flex items-center gap-3 rounded-md px-3 py-2.5 text-left transition-all',
                  active
                    ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700',
                ].join(' ')}
              >
                <span
                  className={[
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                    active
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-500',
                  ].join(' ')}
                >
                  {section.number}
                </span>

                <span className="min-w-0">
                  <span
                    className={[
                      'block text-xs font-semibold',
                      active
                        ? 'text-emerald-800'
                        : 'text-slate-700',
                    ].join(' ')}
                  >
                    {section.label}
                  </span>

                  <span className="mt-0.5 block truncate text-[10px] text-slate-400">
                    {section.description}
                  </span>
                </span>
              </button>
            )
          })}

        </div>
      </div>

      {/* =====================================================
          01. VEHICLE INFORMATION
      ====================================================== */}
      {activeSection === 'vehicle' && (
        <SectionCard title="Vehicle Information">

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr_260px]">

            {/* LEFT COLUMN */}
            <div className="space-y-3">

              <Field
                label="Vehicle Number"
                required
                hint="Example: TN 09 AB 1234"
              >
                <Input
                  value={data.regNo}
                  onChange={(e) =>
                    onChange(
                      'regNo',
                      e.target.value.toUpperCase()
                    )
                  }
                  placeholder="Enter vehicle number"
                />
              </Field>

              <Field label="Vehicle Type" required>
                <Select
                  options={VEHICLE_TYPES}
                  placeholder="Select vehicle type"
                  value={data.type}
                  onChange={set('type')}
                />
              </Field>

              <Field label="Model" required>
                <Select
                  options={MODELS}
                  placeholder="Select model"
                  value={data.model}
                  onChange={set('model')}
                />
              </Field>

              <Field label="Colour" required>
                <Select
                  options={COLOURS}
                  placeholder="Select colour"
                  value={data.colour}
                  onChange={set('colour')}
                />
              </Field>

              <Field label="Fuel Type" required>
                <Select
                  options={FUEL_TYPES}
                  placeholder="Select fuel type"
                  value={data.fuelType}
                  onChange={set('fuelType')}
                />
              </Field>

            </div>

            {/* MIDDLE COLUMN */}
            <div className="space-y-3">

              <Field label="Brand" required>
                <Select
                  options={BRANDS}
                  placeholder="Select brand"
                  value={data.brand}
                  onChange={set('brand')}
                />
              </Field>

              <Field label="Variant">
                <Select
                  options={VARIANTS}
                  placeholder="Select variant"
                  value={data.variant}
                  onChange={set('variant')}
                />
              </Field>

              <Field label="Manufacturing Year" required>
                <Select
                  options={MANUFACTURING_YEARS}
                  placeholder="Select year"
                  value={data.year}
                  onChange={set('year')}
                />
              </Field>

              <Field label="Vehicle Amount" required>
                <AdornedInput
                  prefix="₹"
                  inputMode="numeric"
                  value={data.amount}
                  onChange={(e) =>
                    onChange(
                      'amount',
                      e.target.value.replace(/\D/g, '')
                    )
                  }
                  placeholder="Enter vehicle amount"
                />
              </Field>

            </div>

            {/* VEHICLE PHOTO */}
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">

              <p className="mb-2 text-xs font-semibold text-emerald-900">
                Vehicle Photo
              </p>

              <PhotoUpload
                title="Upload Vehicle Photo"
                hint="JPG, PNG (Max 5MB)"
                file={data.photo}
                onFile={(file) =>
                  onChange('photo', file)
                }
              />

              <p className="mt-2 text-[10px] text-slate-400">
                Optional
              </p>

            </div>

          </div>

          {/* SECTION FOOTER */}
          <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => setActiveSection('registration')}
              className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
            >
              Next: Registration
              <span>→</span>
            </button>
          </div>

        </SectionCard>
      )}

      {/* =====================================================
          02. REGISTRATION & IDENTIFICATION
      ====================================================== */}
      {activeSection === 'registration' && (
        <SectionCard
          title="Registration & Identification"
          right={
            <div className="flex items-center gap-2">

              <span className="hidden items-center gap-1.5 text-[11px] text-slate-500 lg:flex">
                <InfoIcon className="h-3.5 w-3.5 text-emerald-700" />
                Fetch details using registration number
              </span>

              <OutlineButton onClick={onFetchVehicle}>
                <RefreshIcon className="h-3.5 w-3.5" />
                Fetch Vehicle
              </OutlineButton>

            </div>
          }
        >

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">

            <Field label="RTO / Registration Location">
              <Select
                options={RTO_LOCATIONS}
                placeholder="Select RTO location"
                value={data.rto}
                onChange={set('rto')}
              />
            </Field>

            <Field label="Date of Registration">
              <Input
                type="date"
                value={data.regDate}
                onChange={set('regDate')}
              />
            </Field>

            <Field label="Chassis Number">
              <Input
                value={data.chassisNo}
                onChange={set('chassisNo')}
                placeholder="Enter chassis number"
              />
            </Field>

            <Field label="Engine Number">
              <Input
                value={data.engineNo}
                onChange={set('engineNo')}
                placeholder="Enter engine number"
              />
            </Field>

          </div>

          {/* HYPOTHECATION */}
          <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50/60 p-3">

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[180px_1fr]">

              <Field label="Hypothecation" required>
                <RadioGroup
                  name="hypothecation"
                  options={YES_NO}
                  value={data.hypothecation}
                  onChange={(value) =>
                    onChange('hypothecation', value)
                  }
                />
              </Field>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">

                <Field label="Existing Financier">
                  <Select
                    options={FINANCIERS}
                    placeholder="Select financier"
                    disabled={!hypothecated}
                    value={data.financier}
                    onChange={set('financier')}
                  />
                </Field>

                <Field label="NOC Status">
                  <Select
                    options={NOC_STATUSES}
                    placeholder="Select status"
                    disabled={!hypothecated}
                    value={data.nocStatus}
                    onChange={set('nocStatus')}
                  />
                </Field>

                <Field label="NOC Document">
                  <UploadButton
                    label="Upload NOC"
                    icon={PlusIcon}
                    disabled={!hypothecated}
                    file={data.nocFile}
                    onFile={(file) =>
                      onChange('nocFile', file)
                    }
                  />
                </Field>

              </div>

            </div>

          </div>

          {/* SECTION FOOTER */}
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">

            <button
              type="button"
              onClick={() => setActiveSection('vehicle')}
              className="text-xs font-medium text-slate-500 hover:text-slate-700"
            >
              ← Vehicle Information
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('insurance')}
              className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
            >
              Next: Insurance
              <span>→</span>
            </button>

          </div>

        </SectionCard>
      )}

      {/* =====================================================
          03. INSURANCE & COMPLIANCE
      ====================================================== */}
      {activeSection === 'insurance' && (
        <SectionCard title="Insurance & Compliance">

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">

            <Field label="Tax Expiry">
              <Input
                type="date"
                value={data.taxExpiry}
                onChange={set('taxExpiry')}
              />
            </Field>

            <Field label="Insurance Company">
              <Select
                options={INSURANCE_COMPANIES}
                placeholder="Select insurance company"
                value={data.insuranceCompany}
                onChange={set('insuranceCompany')}
              />
            </Field>

            <Field label="Policy Number">
              <Input
                value={data.policyNo}
                onChange={set('policyNo')}
                placeholder="Enter policy number"
              />
            </Field>

            <Field label="Insurance Expiry">
              <Input
                type="date"
                value={data.insuranceExpiry}
                onChange={set('insuranceExpiry')}
              />
            </Field>

            <Field label="Financier Endorsement" required>
              <RadioGroup
                name="endorsement"
                options={YES_NO}
                value={data.financierEndorsement}
                onChange={(value) =>
                  onChange(
                    'financierEndorsement',
                    value
                  )
                }
              />
            </Field>

            <Field label="Insurance Document">
              <UploadButton
                label="Upload Insurance Document"
                icon={PlusIcon}
                file={data.insuranceFile}
                onFile={(file) =>
                  onChange('insuranceFile', file)
                }
              />
            </Field>

          </div>

          {/* REMARKS */}
          <div className="mt-3">
            <Field label="Remarks">
              <Textarea
                rows={3}
                value={data.remarks}
                onChange={set('remarks')}
                placeholder="Enter any additional remarks (optional)"
                className="resize-none"
              />
            </Field>
          </div>

          {/* SECTION FOOTER */}
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">

            <button
              type="button"
              onClick={() => setActiveSection('registration')}
              className="text-xs font-medium text-slate-500 hover:text-slate-700"
            >
              ← Registration
            </button>

            <div className="flex items-center gap-2">

              <span className="hidden text-[11px] text-emerald-600 sm:block">
                ✓ Vehicle details completed
              </span>

            </div>

          </div>

        </SectionCard>
      )}

    </div>
  )
}

export default VehicleTab
