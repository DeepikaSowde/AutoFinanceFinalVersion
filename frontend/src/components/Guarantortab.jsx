import React, { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Field,
  Input,
  Textarea,
  Select,
  PhoneInput,
  RadioGroup,
  SectionCard,
  InfoNote,
} from "./Formcontrols";

import { KycRow } from "./CustomerTab";

import {
  RELATIONSHIPS,
  RESIDENCE_TYPES,
} from "../../Options";

// =====================================================
// FILE → BASE64
// =====================================================
const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve(null);
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      resolve({
        name: file.name,
        type: file.type,
        size: file.size,
        data: reader.result,
      });
    };

    reader.onerror = () => {
      reject(new Error("Failed to read file"));
    };

    reader.readAsDataURL(file);
  });
};

const GuarantorTab = ({ data, onChange }) => {
  const { t } = useTranslation();

  // =====================================================
  // KYC STATE
  // =====================================================
  const [kycEnabled, setKycEnabled] = useState(
    data.kycRequired !== "No"
  );

  // =====================================================
  // GENERIC CHANGE HANDLER
  // =====================================================
  const set = (key) => (e) => {
    onChange(key, e.target.value);
  };

  // =====================================================
  // GUARANTOR REQUIRED
  // =====================================================
  const required = data.required === "Yes";

  // =====================================================
  // KYC TOGGLE
  // =====================================================
  const toggleKyc = () => {
    const nextValue = !kycEnabled;

    setKycEnabled(nextValue);

    onChange(
      "kycRequired",
      nextValue ? "Yes" : "No"
    );
  };

  // =====================================================
  // FILE CHANGE HANDLER
  // =====================================================
  const handleFileChange = async (key, file) => {
    if (!file) {
      onChange(key, null);
      return;
    }

    try {
      const fileData = await fileToBase64(file);
      onChange(key, fileData);
    } catch (error) {
      console.error(`Failed to save ${key}:`, error);
    }
  };

  return (
    <div className="space-y-3">

      {/* =====================================================
          GUARANTOR REQUIRED
      ====================================================== */}
      <div className="flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">

        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            {t("guarantor.required")}
          </h2>

          <p className="mt-0.5 text-[11px] text-slate-500">
            {t("guarantor.requiredDescription")}
          </p>
        </div>

        <RadioGroup
          name="guarantorRequired"
          options={["Yes", "No"]}
          value={data.required}
          onChange={(value) =>
            onChange("required", value)
          }
          optionLabels={{
            Yes: t("common.yes"),
            No: t("common.no"),
          }}
        />
      </div>

      {/* =====================================================
          NO GUARANTOR
      ====================================================== */}
      {!required ? (
        <InfoNote>
          {t("guarantor.notRequired")}
        </InfoNote>
      ) : (

        /* ===================================================
           GUARANTOR CONTENT
        ==================================================== */
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.8fr)_minmax(300px,1fr)]">

          {/* =================================================
              LEFT — GUARANTOR DETAILS
          ================================================== */}
          <SectionCard title={t("guarantor.details")}>

            <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">

              {/* Name */}
              <Field
                label={t("guarantor.name")}
                required
              >
                <Input
                  value={data.name}
                  onChange={set("name")}
                  placeholder={t(
                    "guarantor.enterName"
                  )}
                />
              </Field>

              {/* Mobile */}
              <Field
                label={t("common.mobileNumber")}
                required
              >
                <PhoneInput
                  code={data.countryCode}
                  mobile={data.mobile}
                  onCodeChange={(value) =>
                    onChange("countryCode", value)
                  }
                  onMobileChange={(value) =>
                    onChange("mobile", value)
                  }
                />
              </Field>

              {/* Relationship */}
              <Field
                label={t("guarantor.relationship")}
                required
              >
                <Input
                  list="guarantor-relationship-options"
                  value={data.relationship}
                  onChange={set("relationship")}
                  placeholder={t(
                    "guarantor.enterRelationship"
                  )}
                />

                <datalist id="guarantor-relationship-options">
                  {RELATIONSHIPS.map((relationship) => (
                    <option
                      key={relationship}
                      value={relationship}
                    >
                      {t(
                        `options.relationships.${relationship}`,
                        {
                          defaultValue: relationship,
                        }
                      )}
                    </option>
                  ))}
                </datalist>
              </Field>

              {/* Profession */}
              <Field label={t("common.profession")}>
                <Input
                  value={data.profession}
                  onChange={set("profession")}
                  placeholder={t(
                    "guarantor.enterProfession"
                  )}
                />
              </Field>

              {/* Address */}
              <Field
                label={t("common.address")}
                required
                className="md:col-span-2"
              >
                <Textarea
                  value={data.address}
                  onChange={set("address")}
                  placeholder={t(
                    "common.enterFullAddress"
                  )}
                  className="min-h-[64px] resize-none"
                />
              </Field>
            </div>

            {/* Location */}
            <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-3">

              {/* Area */}
              <Field label={t("common.areaLocality")}>
                <Input
                  value={data.area}
                  onChange={set("area")}
                  placeholder={t(
                    "common.enterAreaLocality"
                  )}
                />
              </Field>

              {/* Landmark */}
              <Field label={t("common.landmark")}>
                <Input
                  value={data.landmark}
                  onChange={set("landmark")}
                  placeholder={t(
                    "common.enterLandmark"
                  )}
                />
              </Field>

              {/* Pincode */}
              <Field label={t("common.pincode")}>
                <Input
                  inputMode="numeric"
                  maxLength={6}
                  value={data.pincode}
                  onChange={(e) =>
                    onChange(
                      "pincode",
                      e.target.value.replace(/\D/g, "")
                    )
                  }
                  placeholder={t(
                    "common.enterPincode"
                  )}
                />
              </Field>
            </div>

            {/* Residence */}
            <div className="mt-3 max-w-sm">
              <Field
                label={t("common.residenceType")}
                required
              >
                <Select
                  options={RESIDENCE_TYPES}
                  placeholder={t(
                    "common.selectResidenceType"
                  )}
                  translationKey="options.residence"
                  value={data.residenceType}
                  onChange={set("residenceType")}
                />
              </Field>
            </div>

          </SectionCard>

          {/* =================================================
              RIGHT — OPTIONAL KYC
          ================================================== */}
          <SectionCard
            title={t("guarantor.kyc.title")}
            right={
              <button
                type="button"
                onClick={toggleKyc}
                className={[
                  "relative h-5 w-9 rounded-full transition-colors",
                  kycEnabled
                    ? "bg-emerald-600"
                    : "bg-slate-300",
                ].join(" ")}
                aria-label={t(
                  "guarantor.kyc.toggle"
                )}
              >
                <span
                  className={[
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                    kycEnabled
                      ? "translate-x-4"
                      : "translate-x-0.5",
                  ].join(" ")}
                />
              </button>
            }
          >

            {/* KYC status */}
            <div className="mb-3 flex items-center justify-between">

              <div>
                <p className="text-xs font-medium text-slate-700">
                  {t("guarantor.kyc.documents")}
                </p>

                <p className="text-[10px] text-slate-400">
                  {t("guarantor.kyc.optional")}
                </p>
              </div>

              <span
                className={[
                  "rounded px-2 py-1 text-[10px] font-medium",
                  kycEnabled
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-100 text-slate-500",
                ].join(" ")}
              >
                {kycEnabled
                  ? t("common.enabled")
                  : t("common.optional")}
              </span>
            </div>

            {kycEnabled ? (

              <div className="space-y-3">

                {/* Aadhaar */}
                <KycRow
                  label={t("kyc.aadhaarNumber")}
                  placeholder={t(
                    "guarantor.kyc.enterAadhaar"
                  )}
                  uploadLabel={t("common.upload")}
                  value={data.aadhaarNo}
                  file={data.aadhaarFile}
                  onValue={(value) =>
                    onChange("aadhaarNo", value)
                  }
                  onFile={(file) =>
                    handleFileChange(
                      "aadhaarFile",
                      file
                    )
                  }
                />

                {/* PAN */}
                <KycRow
                  label={t("kyc.panNumber")}
                  placeholder={t(
                    "guarantor.kyc.enterPan"
                  )}
                  uploadLabel={t("common.upload")}
                  value={data.panNo}
                  file={data.panFile}
                  onValue={(value) =>
                    onChange("panNo", value)
                  }
                  onFile={(file) =>
                    handleFileChange(
                      "panFile",
                      file
                    )
                  }
                />

                {/* Driving Licence */}
                <KycRow
                  label={t("kyc.drivingLicence")}
                  placeholder={t(
                    "guarantor.kyc.enterDl"
                  )}
                  uploadLabel={t("common.upload")}
                  value={data.dlNo}
                  file={data.dlFile}
                  onValue={(value) =>
                    onChange("dlNo", value)
                  }
                  onFile={(file) =>
                    handleFileChange(
                      "dlFile",
                      file
                    )
                  }
                />

                {/* Voter ID */}
                <KycRow
                  label={t("kyc.voterId")}
                  placeholder={t(
                    "guarantor.kyc.enterVoterId"
                  )}
                  uploadLabel={t("common.upload")}
                  value={data.voterNo}
                  file={data.voterFile}
                  onValue={(value) =>
                    onChange("voterNo", value)
                  }
                  onFile={(file) =>
                    handleFileChange(
                      "voterFile",
                      file
                    )
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
                    {t("guarantor.kyc.isOptional")}
                  </p>

                  <p className="mt-1 text-[10px] leading-4 text-slate-400">
                    {t(
                      "guarantor.kyc.enableDescription"
                    )}
                  </p>

                </div>

              </div>
            )}

          </SectionCard>

        </div>
      )}

    </div>
  );
};

export default GuarantorTab;