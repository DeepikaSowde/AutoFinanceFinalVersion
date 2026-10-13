import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";

import {
  Field,
  Input,
  Textarea,
  PhoneInput,
  SectionCard,
} from "./Formcontrols";

import {
  Plus,
  Trash2,
  Eye,
  Download,
  Upload,
  X,
  FileText,
} from "lucide-react";

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
        size: (file.size / 1024).toFixed(1) + " KB",
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

const CustomerTab = ({ data = {}, onChange }) => {
  const { t } = useTranslation();
  const [previewDoc, setPreviewDoc] = useState(null);

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

  /* =============================================================
     ADDITIONAL DOCUMENTS (Dynamic)
  ============================================================= */

  const additionalDocs = useMemo(() => {
    return Array.isArray(data.additionalDocs) ? data.additionalDocs : [];
  }, [data.additionalDocs]);

  const handleAddAdditionalDoc = () => {
    const newDoc = {
      id: "doc_" + Date.now().toString(),
      title: "",
      file: null,
    };
    onChange("additionalDocs", [...additionalDocs, newDoc]);
  };

  const handleUpdateDocTitle = (id, newTitle) => {
    const updated = additionalDocs.map((doc) =>
      doc.id === id ? { ...doc, title: newTitle } : doc
    );
    onChange("additionalDocs", updated);
  };

  const handleUpdateDocFile = async (id, file) => {
    if (!file) {
      const updated = additionalDocs.map((doc) =>
        doc.id === id ? { ...doc, file: null } : doc
      );
      onChange("additionalDocs", updated);
      return;
    }
    try {
      const fileData = await fileToBase64(file);
      const updated = additionalDocs.map((doc) =>
        doc.id === id ? { ...doc, file: fileData } : doc
      );
      onChange("additionalDocs", updated);
    } catch (err) {
      console.error("Failed to process document file:", err);
    }
  };

  const handleRemoveAdditionalDoc = (id) => {
    const updated = additionalDocs.filter((doc) => doc.id !== id);
    onChange("additionalDocs", updated);
  };

  return (
    <div className="space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-1.5 sm:px-4 sm:py-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 sm:text-base">
            {t("customer.information")}
          </h2>
        </div>

        <span className="shrink-0 rounded-md bg-white px-2 py-0.5 text-[10px] sm:text-[11px] font-medium text-emerald-700">
          {t("steps.stepOf", { current: 1, total: 4 })}
        </span>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-3">
        {/* =====================================================
            CUSTOMER DETAILS
        ====================================================== */}

        <div className="xl:col-span-2">
          <SectionCard title={t("customer.details")}>
            <div className="grid grid-cols-1 gap-x-3 gap-y-2 md:grid-cols-2 lg:grid-cols-3">
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
                  rows={2}
                  value={data.address || ""}
                  onChange={set("address")}
                  placeholder={t("customer.enterFullAddress")}
                  className="min-h-[44px] resize-none"
                />
              </Field>
            </div>

            {/* Location Details */}
            <div className="mt-2 grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-3">
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
            KYC DOCUMENTS - RIGHT SIDE (Aadhaar, Driving Licence + Dynamic Docs)
        ====================================================== */}

        <div className="xl:col-span-1">
          <SectionCard
            title={t("kyc.title")}
            right={
              <button
                type="button"
                onClick={handleAddAdditionalDoc}
                className="inline-flex items-center gap-1 rounded bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold transition-colors cursor-pointer"
                title="Add another document"
              >
                <Plus className="h-3 w-3" strokeWidth={2.5} />
                <span>Document</span>
              </button>
            }
          >
            <div className="space-y-2">
              {/* 1. Aadhaar (Visible by default) */}
              <KycRow
                label={t("kyc.aadhaarNumber")}
                placeholder={t("kyc.enterAadhaar")}
                value={data.aadhaarNo || ""}
                file={data.aadhaarFile}
                onValue={(value) =>
                  onChange("aadhaarNo", value.replace(/\D/g, "").slice(0, 12))
                }
                onFile={(file) =>
                  handleFileChange("aadhaarFile", file)
                }
                onPreview={(file) =>
                  setPreviewDoc({
                    title: `Aadhaar - ${data.name || "Customer"}`,
                    file,
                  })
                }
              />

              {/* 2. Driving Licence (Visible by default) */}
              <KycRow
                label={t("kyc.drivingLicence")}
                placeholder={t("kyc.enterDl")}
                value={data.dlNo || ""}
                file={data.dlFile}
                onValue={(value) =>
                  onChange("dlNo", value)
                }
                onFile={(file) =>
                  handleFileChange("dlFile", file)
                }
                onPreview={(file) =>
                  setPreviewDoc({
                    title: `Driving Licence - ${data.name || "Customer"}`,
                    file,
                  })
                }
              />

              {/* Dynamic Additional Documents */}
              {additionalDocs.map((doc, idx) => (
                <div
                  key={doc.id || idx}
                  className="border-b border-slate-100 pb-2 last:border-0 last:pb-0"
                >
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-medium text-slate-600">
                      Additional Document #{idx + 1}
                    </label>
                    <button
                      type="button"
                      onClick={() => handleRemoveAdditionalDoc(doc.id)}
                      className="text-slate-400 hover:text-red-600 text-[11px] cursor-pointer"
                      title="Remove document field"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <Input
                      value={doc.title || ""}
                      onChange={(e) =>
                        handleUpdateDocTitle(doc.id, e.target.value)
                      }
                      placeholder="e.g. PAN Card, Voter ID"
                      className="min-w-0 flex-1 text-xs"
                    />

                    <label className="flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-emerald-600 hover:text-emerald-800 cursor-pointer transition-colors">
                      <Upload className="h-3.5 w-3.5 text-slate-500" />
                      <span>{doc.file ? "Change" : "Upload"}</span>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleUpdateDocFile(doc.id, f);
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {/* Uploaded File Status */}
                  {doc.file && (
                    <div className="mt-1 flex items-center justify-between text-[11px] text-emerald-700 bg-emerald-50/70 rounded px-2 py-0.5">
                      <span className="truncate max-w-[170px] flex items-center gap-1">
                        ✓ {doc.file.name || "Document"}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewDoc({
                              title: `${doc.title || "Document"} - ${data.name || "Customer"}`,
                              file: doc.file,
                            })
                          }
                          className="text-emerald-800 hover:underline cursor-pointer font-medium"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateDocFile(doc.id, null)}
                          className="text-slate-400 hover:text-red-600 cursor-pointer ml-1"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* =========================================================
          DOCUMENT PREVIEW OVERLAY
      ========================================================= */}
      {previewDoc && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm"
          onClick={() => setPreviewDoc(null)}
        >
          <div
            className="relative max-w-3xl w-full bg-white rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-emerald-700" />
                {previewDoc.title}
              </h3>
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto my-4 flex items-center justify-center bg-slate-50 rounded-xl p-2 min-h-[250px]">
              {previewDoc.file?.data?.startsWith("data:image/") ? (
                <img
                  src={previewDoc.file.data}
                  alt={previewDoc.title}
                  className="max-h-[60vh] max-w-full object-contain rounded"
                />
              ) : previewDoc.file?.data?.startsWith("data:application/pdf") ? (
                <iframe
                  src={previewDoc.file.data}
                  title={previewDoc.title}
                  className="w-full h-[60vh] rounded border border-slate-200"
                />
              ) : (
                <div className="text-center p-8 text-slate-500">
                  <FileText className="h-12 w-12 text-slate-300 mx-auto mb-2" />
                  <p className="font-medium text-slate-700">
                    {previewDoc.file?.name}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {previewDoc.file?.size}
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              {previewDoc.file?.data && (
                <a
                  href={previewDoc.file.data}
                  download={previewDoc.file.name || "document"}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download Document</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* =============================================================
   COMPACT KYC ROW (With Upload, View & Remove)
============================================================= */

export const KycRow = ({
  label,
  placeholder,
  value,
  file,
  onValue,
  onFile,
  onPreview,
}) => {
  return (
    <div className="border-b border-slate-100 pb-2 last:border-0 last:pb-0">
      <label className="mb-1 block text-xs font-medium text-slate-700">
        {label}
      </label>

      <div className="flex gap-2">
        <Input
          value={value || ""}
          onChange={(e) => onValue(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 font-mono"
        />

        <label className="flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-emerald-600 hover:text-emerald-800 cursor-pointer transition-colors">
          <Upload className="h-3.5 w-3.5 text-slate-500" />
          <span>{file ? "Change" : "Upload"}</span>
          <input
            type="file"
            accept="image/*,.pdf"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
            className="hidden"
          />
        </label>
      </div>

      {/* Uploaded file status with View and Clear */}
      {file && (
        <div className="mt-1 flex items-center justify-between text-[11px] text-emerald-700 bg-emerald-50/70 rounded px-2 py-0.5">
          <span className="truncate max-w-[170px] flex items-center gap-1">
            ✓ {file.name || "Document Uploaded"}
          </span>
          <div className="flex items-center gap-1">
            {onPreview && (
              <button
                type="button"
                onClick={() => onPreview(file)}
                className="text-emerald-800 hover:underline cursor-pointer font-medium"
              >
                View
              </button>
            )}
            <button
              type="button"
              onClick={() => onFile(null)}
              className="text-slate-400 hover:text-red-600 cursor-pointer ml-1"
              title="Remove file"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerTab;