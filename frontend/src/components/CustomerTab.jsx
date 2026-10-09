import React from "react";
import { useTranslation } from "react-i18next";

import {
  Field,
  Input,
  Textarea,
  PhoneInput,
  UploadButton,
  SectionCard,
} from "./Formcontrols";


/* =============================================================
   FILE → BASE64
============================================================= */

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

/* =============================================================
   CUSTOMER TAB
============================================================= */

const CustomerTab = ({ data, onChange }) => {
  const { t } = useTranslation();

  const set = (key) => (e) => {
    onChange(key, e.target.value);
  };

  /* =============================================================
     HANDLE KYC FILE
  ============================================================= */

  const handleFileChange = async (key, file) => {
    if (!file) {
      onChange(key, null);
      return;
    }

    try {
      const fileData = await fileToBase64(file);
      onChange(key, fileData);
    } catch (error) {
      console.error("File upload error:", error);
    }
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 sm:text-lg">
            {t("customer.information")}
          </h2>

          <p className="mt-0.5 text-xs text-slate-500">
            {t("customer.enterCustomerDetailsAndIdentityInformation")}
          </p>
        </div>

        <span className="shrink-0 rounded-md bg-white px-2.5 py-1 text-[11px] font-medium text-emerald-700">
          {t("steps.stepOf", { current: 1, total: 4 })}
        </span>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        {/* =====================================================
            CUSTOMER DETAILS
        ====================================================== */}

        <div className="xl:col-span-2">
          <SectionCard title={t("customer.details")}>
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-3">
              {/* Application Date */}
              <Field label={t("customer.applicationDate")}>
                <Input
                  type="date"
                  value={data.applicationDate || ""}
                  readOnly
                  className="bg-slate-50"
                />
              </Field>

              {/* Customer Name */}
              <Field label={t("customer.name")} required>
                <Input
                  value={data.name || ""}
                  onChange={set("name")}
                  placeholder={t("customer.enterName")}
                />
              </Field>

              {/* Mobile Number */}
              <Field label={t("customer.mobileNumber")} required>
                <PhoneInput
                  code={data.countryCode || "+91"}
                  mobile={data.mobile || ""}
                  onCodeChange={(value) =>
                    onChange("countryCode", value)
                  }
                  onMobileChange={(value) =>
                    onChange("mobile", value)
                  }
                />
              </Field>

              {/* Address */}
              <Field
                label={t("customer.address")}
                required
                className="md:col-span-3"
              >
                <Textarea
                  value={data.address || ""}
                  onChange={set("address")}
                  placeholder={t("customer.enterFullAddress")}
                  className="min-h-[68px] resize-none"
                />
              </Field>
            </div>

            {/* Location Details */}
            <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-3">
              {/* Area / Locality */}
              <Field label={t("customer.areaLocality")}>
                <Input
                  value={data.area || ""}
                  onChange={set("area")}
                  placeholder={t("customer.enterAreaLocality")}
                />
              </Field>

              {/* Landmark */}
              <Field label={t("customer.landmark")}>
                <Input
                  value={data.landmark || ""}
                  onChange={set("landmark")}
                  placeholder={t("customer.enterLandmark")}
                />
              </Field>

              {/* Pincode */}
              <Field label={t("customer.pincode")}>
                <Input
                  inputMode="numeric"
                  maxLength={6}
                  value={data.pincode || ""}
                  onChange={(e) =>
                    onChange(
                      "pincode",
                      e.target.value.replace(/\D/g, "")
                    )
                  }
                  placeholder={t("customer.enterPincode")}
                />
              </Field>
            </div>
          </SectionCard>
        </div>

        {/* =====================================================
            KYC DOCUMENTS - RIGHT SIDE
        ====================================================== */}

        <div className="xl:col-span-1">
          <SectionCard title={t("kyc.title")}>
            <div className="space-y-3">
              {/* Aadhaar */}
              <KycRow
                label={t("kyc.aadhaarNumber")}
                placeholder={t("kyc.enterAadhaar")}
                uploadLabel={t("kyc.uploadAadhaar")}
                value={data.aadhaarNo || ""}
                file={data.aadhaarFile}
                onValue={(value) =>
                  onChange("aadhaarNo", value)
                }
                onFile={(file) =>
                  handleFileChange("aadhaarFile", file)
                }
              />

              {/* PAN */}
              <KycRow
                label={t("kyc.panNumber")}
                placeholder={t("kyc.enterPan")}
                uploadLabel={t("kyc.uploadPan")}
                value={data.panNo || ""}
                file={data.panFile}
                onValue={(value) =>
                  onChange("panNo", value)
                }
                onFile={(file) =>
                  handleFileChange("panFile", file)
                }
              />

              {/* Driving Licence */}
              <KycRow
                label={t("kyc.drivingLicence")}
                placeholder={t("kyc.enterDl")}
                uploadLabel={t("kyc.uploadDl")}
                value={data.dlNo || ""}
                file={data.dlFile}
                onValue={(value) =>
                  onChange("dlNo", value)
                }
                onFile={(file) =>
                  handleFileChange("dlFile", file)
                }
              />

              {/* Voter ID */}
              <KycRow
                label={t("kyc.voterId")}
                placeholder={t("kyc.enterVoterId")}
                uploadLabel={t("kyc.uploadVoterId")}
                value={data.voterNo || ""}
                file={data.voterFile}
                onValue={(value) =>
                  onChange("voterNo", value)
                }
                onFile={(file) =>
                  handleFileChange("voterFile", file)
                }
              />
            </div>

            {/* Compact KYC information */}
            <div className="mt-3 flex items-start gap-2 rounded-md bg-emerald-50 px-3 py-2">
              <span className="mt-0.5 text-xs text-emerald-700">
                ⓘ
              </span>

              <p className="text-[11px] leading-4 text-emerald-700">
                {t("kyc.information")}
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
}) => {
  const { t } = useTranslation();

  return (
    <div className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
      <label className="mb-1.5 block text-xs font-medium text-slate-700">
        {label}
      </label>

      <div className="flex gap-2">
        <Input
          value={value || ""}
          onChange={(e) => onValue(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1"
        />

        <UploadButton
          label={t("common.upload")}
          file={file}
          onFile={onFile}
          className="shrink-0"
        />
      </div>

      {/* Uploaded file */}
      {file && (
        <div className="mt-1 flex items-center gap-1 text-[10px] text-emerald-600">
          <span>✓</span>

          <span className="truncate">
            {file.name || t("kyc.documentUploaded")}
          </span>
        </div>
      )}
    </div>
  );
};

export default CustomerTab;