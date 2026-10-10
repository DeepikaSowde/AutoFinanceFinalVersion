import React, { useState } from "react";
import { useTranslation } from "react-i18next";

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
} from "./Formcontrols";

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
} from "../../Options";

const YES_NO = ["Yes", "No"];

/* =========================================================
   FILE → BASE64
========================================================= */
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

const VehicleTab = ({ data, onChange, onFetchVehicle }) => {
  const { t } = useTranslation();

  const [activeSection, setActiveSection] = useState("vehicle");

  const set = (key) => (e) => onChange(key, e.target.value);

  const hypothecated = data.hypothecation === "Yes";

  /* =========================================================
     HANDLE FILE UPLOAD
  ========================================================= */
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

  const sections = [
    {
      id: "vehicle",
      number: "01",
      label: t("vehicle.sections.vehicle.label"),
      description: t("vehicle.sections.vehicle.description"),
    },
    {
      id: "registration",
      number: "02",
      label: t("vehicle.sections.registration.label"),
      description: t("vehicle.sections.registration.description"),
    },
    {
      id: "insurance",
      number: "03",
      label: t("vehicle.sections.insurance.label"),
      description: t("vehicle.sections.insurance.description"),
    },
  ];

  return (
    <div className="space-y-3">

      {/* =====================================================
          INTERNAL VEHICLE NAVIGATION
      ====================================================== */}

      <div className="rounded-lg border border-slate-200 bg-white p-1.5">
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">

          {sections.map((section) => {
            const active = activeSection === section.id;

            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
                className={[
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-left transition-all",
                  active
                    ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-700",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                    active
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-100 text-slate-500",
                  ].join(" ")}
                >
                  {section.number}
                </span>

                <span className="min-w-0">
                  <span
                    className={[
                      "block text-xs font-semibold",
                      active ? "text-emerald-800" : "text-slate-700",
                    ].join(" ")}
                  >
                    {section.label}
                  </span>

                  <span className="mt-0.5 block truncate text-[10px] text-slate-400">
                    {section.description}
                  </span>
                </span>
              </button>
            );
          })}

        </div>
      </div>

      {/* =====================================================
          01. VEHICLE INFORMATION
      ====================================================== */}

      {activeSection === "vehicle" && (
        <SectionCard title={t("vehicle.information.title")}>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-[1fr_1fr_260px]">

            {/* LEFT COLUMN */}

            <div className="space-y-3">

              <Field
                label={t("vehicle.vehicleNumber")}
                required
                hint={t("vehicle.vehicleNumberHint")}
              >
                <Input
                  value={data.regNo || ""}
                  onChange={(e) =>
                    onChange("regNo", e.target.value.toUpperCase())
                  }
                  placeholder={t("vehicle.enterVehicleNumber")}
                />
              </Field>

              <Field label={t("vehicle.vehicleType")} required>
                <Select
                  options={VEHICLE_TYPES}
                  placeholder={t("vehicle.selectVehicleType")}
                  translationKey="options.vehicleTypes"
                  value={data.type || ""}
                  onChange={set("type")}
                />
              </Field>

              <Field label={t("vehicle.model")} required>
                <Select
                  options={MODELS}
                  placeholder={t("vehicle.selectModel")}
                  translationKey="options.models"
                  value={data.model || ""}
                  onChange={set("model")}
                />
              </Field>

              <Field label={t("vehicle.colour")} required>
                <Select
                  options={COLOURS}
                  placeholder={t("vehicle.selectColour")}
                  translationKey="options.colours"
                  value={data.colour || ""}
                  onChange={set("colour")}
                />
              </Field>

              <Field label={t("vehicle.fuelType")} required>
                <Select
                  options={FUEL_TYPES}
                  placeholder={t("vehicle.selectFuelType")}
                  translationKey="options.fuelTypes"
                  value={data.fuelType || ""}
                  onChange={set("fuelType")}
                />
              </Field>

            </div>

            {/* MIDDLE COLUMN */}

            <div className="space-y-3">

              <Field label={t("vehicle.brand")} required>
                <Select
                  options={BRANDS}
                  placeholder={t("vehicle.selectBrand")}
                  translationKey="options.brands"
                  value={data.brand || ""}
                  onChange={set("brand")}
                />
              </Field>

              <Field label={t("vehicle.variant")}>
                <Select
                  options={VARIANTS}
                  placeholder={t("vehicle.selectVariant")}
                  translationKey="options.variants"
                  value={data.variant || ""}
                  onChange={set("variant")}
                />
              </Field>

              <Field label={t("vehicle.manufacturingYear")} required>
                <Select
                  options={MANUFACTURING_YEARS}
                  placeholder={t("vehicle.selectYear")}
                  value={data.year || ""}
                  onChange={set("year")}
                />
              </Field>

              <Field label={t("vehicle.vehicleAmount")} required>
                <AdornedInput
                  prefix="₹"
                  inputMode="numeric"
                  value={data.amount || ""}
                  onChange={(e) =>
                    onChange(
                      "amount",
                      e.target.value.replace(/\D/g, "")
                    )
                  }
                  placeholder={t("vehicle.enterVehicleAmount")}
                />
              </Field>

            </div>

            {/* VEHICLE PHOTO */}

            <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">

              <p className="mb-2 text-xs font-semibold text-emerald-900">
                {t("vehicle.photo.title")}
              </p>

              <PhotoUpload
                title={t("vehicle.photo.upload")}
                hint={t("vehicle.photo.hint")}
                file={data.photo}
                onFile={(file) =>
                  handleFileChange("photo", file)
                }
              />

              <p className="mt-2 text-[10px] text-slate-400">
                {t("common.optional")}
              </p>

            </div>

          </div>

          <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">

            <button
              type="button"
              onClick={() => setActiveSection("registration")}
              className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
            >
              {t("vehicle.nextRegistration")}
              <span>→</span>
            </button>

          </div>

        </SectionCard>
      )}

      {/* =====================================================
          02. REGISTRATION & IDENTIFICATION
      ====================================================== */}

      {activeSection === "registration" && (
        <SectionCard
          title={t("vehicle.registration.title")}
          right={
            <div className="flex items-center gap-2">

              <span className="hidden items-center gap-1.5 text-[11px] text-slate-500 lg:flex">
                <InfoIcon className="h-3.5 w-3.5 text-emerald-700" />
                {t("vehicle.registration.fetchHint")}
              </span>

              <OutlineButton onClick={onFetchVehicle}>
                <RefreshIcon className="h-3.5 w-3.5" />
                {t("vehicle.registration.fetchVehicle")}
              </OutlineButton>

            </div>
          }
        >

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">

            <Field label={t("vehicle.rtoLocation")}>
              <Select
                options={RTO_LOCATIONS}
                placeholder={t("vehicle.selectRtoLocation")}
                translationKey="options.rtoLocations"
                value={data.rto || ""}
                onChange={set("rto")}
              />
            </Field>

            <Field label={t("vehicle.dateOfRegistration")}>
              <Input
                type="date"
                value={data.regDate || ""}
                onChange={set("regDate")}
              />
            </Field>

            <Field label={t("vehicle.chassisNumber")}>
              <Input
                value={data.chassisNo || ""}
                onChange={set("chassisNo")}
                placeholder={t("vehicle.enterChassisNumber")}
              />
            </Field>

            <Field label={t("vehicle.engineNumber")}>
              <Input
                value={data.engineNo || ""}
                onChange={set("engineNo")}
                placeholder={t("vehicle.enterEngineNumber")}
              />
            </Field>

          </div>

          {/* HYPOTHECATION */}

          <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50/60 p-3">

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[180px_1fr]">

              <Field label={t("vehicle.hypothecation")} required>

                <RadioGroup
                  name="hypothecation"
                  options={YES_NO}
                  translationKey="options.yesNo"
                  value={data.hypothecation || ""}
                  onChange={(value) =>
                    onChange("hypothecation", value)
                  }
                />

              </Field>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">

                <Field label={t("vehicle.existingFinancier")}>

                  <Select
                    options={FINANCIERS}
                    placeholder={t("vehicle.selectFinancier")}
                    translationKey="options.financiers"
                    disabled={!hypothecated}
                    value={data.financier || ""}
                    onChange={set("financier")}
                  />

                </Field>

                <Field label={t("vehicle.nocStatus")}>

                  <Select
                    options={NOC_STATUSES}
                    placeholder={t("vehicle.selectStatus")}
                    translationKey="options.nocStatuses"
                    disabled={!hypothecated}
                    value={data.nocStatus || ""}
                    onChange={set("nocStatus")}
                  />

                </Field>

                <Field label={t("vehicle.nocDocument")}>

                  <UploadButton
                    label={t("vehicle.uploadNoc")}
                    icon={PlusIcon}
                    disabled={!hypothecated}
                    file={data.nocFile}
                    onFile={(file) =>
                      handleFileChange("nocFile", file)
                    }
                  />

                </Field>

              </div>

            </div>

          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">

            <button
              type="button"
              onClick={() => setActiveSection("vehicle")}
              className="text-xs font-medium text-slate-500 hover:text-slate-700"
            >
              ← {t("vehicle.backVehicle")}
            </button>

            <button
              type="button"
              onClick={() => setActiveSection("insurance")}
              className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
            >
              {t("vehicle.nextInsurance")}
              <span>→</span>
            </button>

          </div>

        </SectionCard>
      )}

      {/* =====================================================
          03. INSURANCE & COMPLIANCE
      ====================================================== */}

      {activeSection === "insurance" && (
        <SectionCard title={t("vehicle.insurance.title")}>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">

            <Field label={t("vehicle.taxExpiry")}>
              <Input
                type="date"
                value={data.taxExpiry || ""}
                onChange={set("taxExpiry")}
              />
            </Field>

            <Field label={t("vehicle.insuranceCompany")}>
              <Select
                options={INSURANCE_COMPANIES}
                placeholder={t("vehicle.selectInsuranceCompany")}
                translationKey="options.insuranceCompanies"
                value={data.insuranceCompany || ""}
                onChange={set("insuranceCompany")}
              />
            </Field>

            <Field label={t("vehicle.policyNumber")}>
              <Input
                value={data.policyNo || ""}
                onChange={set("policyNo")}
                placeholder={t("vehicle.enterPolicyNumber")}
              />
            </Field>

            <Field label={t("vehicle.insuranceExpiry")}>
              <Input
                type="date"
                value={data.insuranceExpiry || ""}
                onChange={set("insuranceExpiry")}
              />
            </Field>

            <Field label={t("vehicle.financierEndorsement")} required>

              <RadioGroup
                name="endorsement"
                options={YES_NO}
                translationKey="options.yesNo"
                value={data.financierEndorsement || ""}
                onChange={(value) =>
                  onChange("financierEndorsement", value)
                }
              />

            </Field>

            <Field label={t("vehicle.insuranceDocument")}>

              <UploadButton
                label={t("vehicle.uploadInsuranceDocument")}
                icon={PlusIcon}
                file={data.insuranceFile}
                onFile={(file) =>
                  handleFileChange("insuranceFile", file)
                }
              />

            </Field>

          </div>

          {/* REMARKS */}

          <div className="mt-3">

            <Field label={t("vehicle.remarks")}>

              <Textarea
                rows={3}
                value={data.remarks || ""}
                onChange={set("remarks")}
                placeholder={t("vehicle.enterRemarks")}
                className="resize-none"
              />

            </Field>

          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">

            <button
              type="button"
              onClick={() => setActiveSection("registration")}
              className="text-xs font-medium text-slate-500 hover:text-slate-700"
            >
              ← {t("vehicle.backRegistration")}
            </button>

            <div className="flex items-center gap-2">

              <span className="hidden text-[11px] text-emerald-600 sm:block">
                ✓ {t("vehicle.completed")}
              </span>

            </div>

          </div>

        </SectionCard>
      )}

    </div>
  );
};

export default VehicleTab;