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
  COLOURS,
  FUEL_TYPES,
  MANUFACTURING_YEARS,
  VEHICLE_OWNERSHIP_TYPES,
  RTO_LOCATIONS,
  FINANCIERS,
  NOC_STATUSES,
  INSURANCE_COMPANIES,
} from "../../Options";
import { getVehicleModelImage } from "../utils/vehicleImageHelper";
import {
  OTHER,
  useVehicleCatalog,
  catalogChoices,
  findModel,
} from "../services/vehicleCatalogApi";

const YES_NO = ["Yes", "No"];

const sameName = (a, b) =>
  String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

// The option text matching a stored value (old records may differ in case).
const pick = (list, value) => list.find((item) => sameName(item, value)) || "";

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

const VehicleTab = ({ data, onChange, onFetchVehicle, chassisError = "", onChassisBlur, revealRegistration = 0 }) => {
  const { t } = useTranslation();

  const [activeSection, setActiveSection] = useState("vehicle");

  // When Next fails on the chassis number, open the section that shows it.
  const [seenReveal, setSeenReveal] = useState(revealRegistration);
  if (revealRegistration !== seenReveal) {
    setSeenReveal(revealRegistration);
    setActiveSection("registration");
  }

  const set = (key) => (e) => onChange(key, e.target.value);

  const hypothecated = data.hypothecation === "Yes";

  /* =========================================================
     VEHICLE CATALOG: Type -> Subcategory -> Brand -> Model
     "Other" lets staff type a brand/model that is not listed.
  ========================================================= */
  const catalog = useVehicleCatalog();
  const [brandOther, setBrandOther] = useState(false);
  const [modelOther, setModelOther] = useState(false);
  // True when the subcategory was filled in from the picked model (not
  // chosen by the user); it then stops filtering once the brand/model changes.
  const [subcategoryAuto, setSubcategoryAuto] = useState(false);
  // True while Fuel Type is the "Electric" filled in from an electric model.
  const [fuelAuto, setFuelAuto] = useState(false);
  // Undo an auto-filled "Electric" when the vehicle changes to a non-EV.
  const clearAutoFuel = () => {
    if (!fuelAuto) return {};
    setFuelAuto(false);
    return data.fuelType === "Electric" ? { fuelType: "" } : {};
  };

  // Only a subcategory the user picked narrows the Brand / Model lists.
  const filterSubcategory = subcategoryAuto ? "" : data.subcategory;
  const choices = catalogChoices(catalog, {
    type: data.type,
    subcategory: filterSubcategory,
    brand: data.brand,
  });

  // A saved brand/model that is not in the list (older records, or typed
  // under "Other") opens in "Other" mode with its text kept.
  const brandIsOther =
    brandOther || (Boolean(catalog) && Boolean(data.brand) && !pick(choices.brands, data.brand));
  const modelNames = choices.models.map((item) => item.name);
  const modelIsOther =
    brandIsOther ||
    modelOther ||
    (Boolean(catalog) && Boolean(data.model) && !pick(modelNames, data.model));

  const typeValue = pick(choices.categories, data.type) || data.type || "";
  const typeOptions =
    data.type && !pick(choices.categories, data.type)
      ? [...choices.categories, data.type]
      : choices.categories;

  const subcategoryValue = pick(choices.subcategories, data.subcategory) || data.subcategory || "";
  const subcategoryOptions =
    data.subcategory && !pick(choices.subcategories, data.subcategory)
      ? [...choices.subcategories, data.subcategory]
      : choices.subcategories;

  const handleType = (e) => {
    const value = e.target.value;
    if (sameName(value, data.type)) return;
    setBrandOther(false);
    setModelOther(false);
    setSubcategoryAuto(false);
    onChange({ type: value, subcategory: "", brand: "", model: "", ...clearAutoFuel() });
  };

  const handleSubcategory = (e) => {
    const value = e.target.value;
    setSubcategoryAuto(false);
    const next = catalogChoices(catalog, { type: data.type, subcategory: value, brand: data.brand });
    const patch = { subcategory: value };
    // Keep the brand/model only while they still fit the new subcategory.
    if (!brandIsOther && data.brand && !pick(next.brands, data.brand)) {
      patch.brand = "";
      patch.model = "";
    } else if (!modelIsOther && data.model && !pick(next.models.map((item) => item.name), data.model)) {
      patch.model = "";
    }
    onChange(patch);
  };

  const handleBrand = (e) => {
    const value = e.target.value;
    setModelOther(false);
    // a subcategory taken from the previous model no longer applies
    const clearAuto = { ...(subcategoryAuto ? { subcategory: "" } : {}), ...clearAutoFuel() };
    setSubcategoryAuto(false);
    if (value === OTHER) {
      setBrandOther(true);
      onChange({ brand: "", model: "", ...clearAuto });
      return;
    }
    setBrandOther(false);
    onChange({ brand: value, model: "", ...clearAuto });
  };

  const handleModel = (e) => {
    const value = e.target.value;
    if (value === OTHER) {
      setModelOther(true);
      setSubcategoryAuto(false);
      onChange({ model: "", ...(subcategoryAuto ? { subcategory: "" } : {}), ...clearAutoFuel() });
      return;
    }
    setModelOther(false);
    const found = findModel(catalog, { type: data.type, brand: data.brand, model: value });
    // Filled from the model unless the user had picked the subcategory.
    if (found?.subcategoryName && (subcategoryAuto || !data.subcategory)) setSubcategoryAuto(true);
    let fuelPatch = {};
    if (found?.isEv) {
      if (data.fuelType !== "Electric") setFuelAuto(true);
    } else {
      fuelPatch = clearAutoFuel();
    }
    onChange({
      model: value,
      ...fuelPatch,
      // the model decides its subcategory; an electric model is Electric
      ...(found?.subcategoryName ? { subcategory: found.subcategoryName } : {}),
      ...(found?.isEv ? { fuelType: "Electric" } : {}),
    });
  };

  const loadingText = t("vehicle.loadingCatalog", { defaultValue: "Loading…" });

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
                  options={typeOptions}
                  placeholder={catalog ? t("vehicle.selectVehicleType") : loadingText}
                  translationKey="options.vehicleTypes"
                  disabled={!catalog}
                  value={typeValue}
                  onChange={handleType}
                />
              </Field>

              <Field label={t("vehicle.brand")} required>
                <Select
                  options={[...choices.brands, OTHER]}
                  placeholder={catalog ? t("vehicle.selectBrand") : loadingText}
                  translationKey="options.brands"
                  disabled={!catalog || !data.type}
                  value={brandIsOther ? OTHER : pick(choices.brands, data.brand)}
                  onChange={handleBrand}
                />
                {brandIsOther && (
                  <Input
                    className="mt-1.5"
                    value={data.brand || ""}
                    onChange={set("brand")}
                    placeholder={t("vehicle.enterBrand", { defaultValue: "Type the brand name" })}
                  />
                )}
              </Field>

              <Field label={t("vehicle.model")} required>
                {!brandIsOther && (
                  <Select
                    options={[
                      ...choices.models.map((item) => ({ value: item.name, label: item.label })),
                      OTHER,
                    ]}
                    placeholder={catalog ? t("vehicle.selectModel") : loadingText}
                    translationKey="options.models"
                    disabled={!catalog || !data.brand}
                    value={modelIsOther ? OTHER : pick(modelNames, data.model)}
                    onChange={handleModel}
                  />
                )}
                {modelIsOther && (
                  <Input
                    className={brandIsOther ? "" : "mt-1.5"}
                    value={data.model || ""}
                    onChange={set("model")}
                    placeholder={t("vehicle.enterModel", { defaultValue: "Type the model name" })}
                  />
                )}
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
                  onChange={(e) => {
                    setFuelAuto(false);
                    onChange("fuelType", e.target.value);
                  }}
                />
              </Field>

            </div>

            {/* MIDDLE COLUMN */}

            <div className="space-y-3">

              <Field label={t("vehicle.subcategory", { defaultValue: "Subcategory" })}>
                <Select
                  options={subcategoryOptions}
                  placeholder={
                    catalog
                      ? t("vehicle.selectSubcategory", { defaultValue: "Select Subcategory" })
                      : loadingText
                  }
                  disabled={!catalog || !data.type || subcategoryOptions.length === 0}
                  value={subcategoryValue}
                  onChange={handleSubcategory}
                />
              </Field>

              <Field label={t("vehicle.variant")}>
                <Input
                  value={data.variant || ""}
                  onChange={set("variant")}
                  placeholder={t("vehicle.enterVariant", { defaultValue: "e.g. Disc, ZXi, LX" })}
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

              <Field label="Vehicle Ownership Type" required>
                <Select
                  options={VEHICLE_OWNERSHIP_TYPES}
                  placeholder="Select Ownership Type"
                  value={data.ownershipType || ""}
                  onChange={set("ownershipType")}
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
                defaultPreviewUrl={getVehicleModelImage(data.type, data.model)}
                alt={`${data.brand || ''} ${data.model || ''}`.trim() || 'Vehicle'}
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

            <Field
              label={t("vehicle.chassisNumber")}
              required
              hint={t("vehicle.chassisNumberHint")}
              error={chassisError}
            >
              <Input
                value={data.chassisNo || ""}
                onChange={(e) =>
                  onChange("chassisNo", e.target.value.replace(/^\s+/, "").toUpperCase())
                }
                onBlur={() => onChassisBlur?.()}
                maxLength={17}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={chassisError ? "true" : undefined}
                className={chassisError ? "border-red-400 focus:border-red-500 focus:ring-red-200" : ""}
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