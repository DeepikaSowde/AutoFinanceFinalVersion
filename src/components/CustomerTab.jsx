import React, { useState } from "react";

import {
  Field,
  Input,
  Textarea,
  Select,
  PhoneInput,
  UploadButton,
  SectionCard,
} from "./Formcontrols";

import {RESIDENCE_TYPES } from "../../Options";

const CustomerTab = ({ data, onChange }) => {
  const [referralEnabled, setReferralEnabled] = useState(
    Boolean(data.referredBy || data.referredByPercentage)
  );
  const set = (key) => (e) => onChange(key, e.target.value);

  const toggleReferral = () => {
    const nextEnabled = !referralEnabled;
    setReferralEnabled(nextEnabled);

    if (!nextEnabled) {
      onChange("referredBy", "");
      onChange("referredByPercentage", "");
    }
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 sm:text-lg">
            Customer Information
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Enter customer details and identity information
          </p>
        </div>

        <span className="shrink-0 rounded-md bg-white px-2.5 py-1 text-[11px] font-medium text-emerald-700">
          Step 1 of 5
        </span>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        {/* =====================================================
            CUSTOMER DETAILS
        ====================================================== */}
        <div className="xl:col-span-2">
          <SectionCard title="Customer Details">
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-3">
              {/* Application Date */}
              <Field label="Application Date">
                <Input
                  type="date"
                  value={data.applicationDate}
                  readOnly
                  className="bg-slate-50"
                />
              </Field>

              {/* Customer Name */}
              <Field label="Customer Name" required>
                <Input
                  value={data.name}
                  onChange={set("name")}
                  placeholder="Enter customer name"
                />
              </Field>

              {/* Mobile Number */}
              <Field label="Mobile Number" required>
                <PhoneInput
                  code={data.countryCode}
                  mobile={data.mobile}
                  onCodeChange={(value) => onChange("countryCode", value)}
                  onMobileChange={(value) => onChange("mobile", value)}
                />
              </Field>

              {/* Profession */}
              <Field label="Profession">
                <Input
                  value={data.profession}
                  onChange={set("profession")}
                  placeholder="Enter profession"
                />
              </Field>

              {/* Residence Type - Dropdown */}
              <Field label="Residence Type" required>
                <Select
                  placeholder="Select residence type"
                  options={RESIDENCE_TYPES}
                  value={data.residenceType}
                  onChange={set("residenceType")}
                />
              </Field>

              {/* Referred By */}
              <div className="md:col-span-3">
                <button
                  type="button"
                  onClick={toggleReferral}
                  className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
                >
                  {referralEnabled ? "− Remove Referred By" : "+ Add Referred By"}
                </button>

                {referralEnabled && (
                  <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
                    <Field label="Referred By Name">
                      <Input
                        value={data.referredBy}
                        onChange={set("referredBy")}
                        placeholder="Enter referral name"
                      />
                    </Field>

                    <Field label="Referral Percentage">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        inputMode="decimal"
                        value={data.referredByPercentage}
                        onChange={(e) =>
                          onChange(
                            "referredByPercentage",
                            e.target.value.replace(/[^\d.]/g, "")
                          )
                        }
                        placeholder="Enter percentage"
                      />
                    </Field>
                  </div>
                )}
              </div>

              {/* Address */}
              <Field label="Address" required className="md:col-span-3">
                <Textarea
                  value={data.address}
                  onChange={set("address")}
                  placeholder="Enter full address"
                  className="min-h-[68px] resize-none"
                />
              </Field>
            </div>

            {/* Location Details */}
            <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-3">
              <Field label="Area / Locality">
                <Input
                  value={data.area}
                  onChange={set("area")}
                  placeholder="Enter area / locality"
                />
              </Field>

              <Field label="Landmark">
                <Input
                  value={data.landmark}
                  onChange={set("landmark")}
                  placeholder="Enter landmark"
                />
              </Field>

              <Field label="Pincode">
                <Input
                  inputMode="numeric"
                  maxLength={6}
                  value={data.pincode}
                  onChange={(e) =>
                    onChange("pincode", e.target.value.replace(/\D/g, ""))
                  }
                  placeholder="Enter 6-digit pincode"
                />
              </Field>
            </div>
          </SectionCard>
        </div>

        {/* =====================================================
            KYC DOCUMENTS - RIGHT SIDE
        ====================================================== */}
        <div className="xl:col-span-1">
          <SectionCard title="KYC & Identity Documents">
            <div className="space-y-3">
              <KycRow
                label="Aadhaar Number"
                placeholder="Enter 12-digit Aadhaar"
                uploadLabel="Upload Aadhaar"
                value={data.aadhaarNo}
                file={data.aadhaarFile}
                onValue={(value) => onChange("aadhaarNo", value)}
                onFile={(file) => onChange("aadhaarFile", file)}
              />

              <KycRow
                label="PAN Number"
                placeholder="Enter 10-digit PAN"
                uploadLabel="Upload PAN"
                value={data.panNo}
                file={data.panFile}
                onValue={(value) => onChange("panNo", value)}
                onFile={(file) => onChange("panFile", file)}
              />

              <KycRow
                label="Driving Licence"
                placeholder="Enter DL number"
                uploadLabel="Upload DL"
                value={data.dlNo}
                file={data.dlFile}
                onValue={(value) => onChange("dlNo", value)}
                onFile={(file) => onChange("dlFile", file)}
              />

              <KycRow
                label="Voter ID"
                placeholder="Enter Voter ID"
                uploadLabel="Upload Voter ID"
                value={data.voterNo}
                file={data.voterFile}
                onValue={(value) => onChange("voterNo", value)}
                onFile={(file) => onChange("voterFile", file)}
              />
            </div>

            {/* Compact KYC information */}
            <div className="mt-3 flex items-start gap-2 rounded-md bg-emerald-50 px-3 py-2">
              <span className="mt-0.5 text-xs text-emerald-700">ⓘ</span>
              <p className="text-[11px] leading-4 text-emerald-700">
                Upload the available identity document along with its
                corresponding number.
              </p>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
};

/* =============================================================
   COMPACT KYC ROW
============================================================= */

export const KycRow = ({
  label,
  placeholder,
  uploadLabel,
  value,
  file,
  onValue,
  onFile,
}) => (
  <div className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
    <label className="mb-1.5 block text-xs font-medium text-slate-700">
      {label}
    </label>

    <div className="flex gap-2">
      <Input
        value={value}
        onChange={(e) => onValue(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1"
      />

      <UploadButton
        label="Upload"
        file={file}
        onFile={onFile}
        className="shrink-0"
      />
    </div>

    {file && (
      <div className="mt-1 flex items-center gap-1 text-[10px] text-emerald-600">
        <span>✓</span>
        <span className="truncate">{file.name || "Document uploaded"}</span>
      </div>
    )}
  </div>
);

export default CustomerTab;
