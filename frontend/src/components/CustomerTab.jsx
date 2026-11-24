import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { localToday, EARLIEST_APPLICATION_DATE } from "../utils/applicationDate";
import {
  ADDRESS_MAX,
  LOCALITY_MAX,
  NAME_MAX,
  cleanName,
  cleanText,
} from "../utils/customerDetails";
import {
  KYC_FILE_ACCEPT,
  KYC_FILE_HINT,
  checkKycFile,
  formatFileSize,
  maskAadhaar,
  needsReattach,
  normalizeDrivingLicence,
} from "../utils/kyc";

import {
  Field,
  Input,
  Textarea,
  PhoneInput,
} from "./Formcontrols";

import {
  User,
  Plus,
  Trash2,
  Eye,
  Download,
  Upload,
  X,
  FileText,
} from "lucide-react";

/* =============================================================
   CUSTOMER TAB
============================================================= */

// Red border on a field with an error (important: beats the normal grey border).
const errorCls = (error) => (error ? "border-red-400! focus:border-red-500! focus:ring-red-200!" : "");

const CustomerTab = ({
  data = {},
  onChange,
  errors = {},
  onFieldBlur = () => {},
  kycErrors = {},
  onKycBlur = () => {},
  // An existing customer with the same mobile / Aadhaar (see NewLoan).
  existingCustomer = null,
  existingConfirmed = false,
  existingAlert = false,
  onStartReLoan = () => {},
  onConfirmNewCustomer = () => {},
  onUndoConfirm = () => {},
  // Re-Loan: the existing customer's details are used as saved, not edited here.
  lockedIdentity = false,
}) => {
  const { t } = useTranslation();
  const [previewDoc, setPreviewDoc] = useState(null);
  // Per upload slot ("aadhaarFile", "dlFile", "doc:<id>"): { progress } while
  // a picked file is being checked, or { error } when it was refused.
  const [fileStatus, setFileStatus] = useState({});

  const set = (key) => (e) => {
    onChange(key, e.target.value);
  };

  // Leaving a field trims it (the name also loses doubled spaces), then
  // shows its error, if any.
  const tidyOnBlur = (key, clean) => (e) => {
    const value = e.target.value ?? "";
    const tidied = clean(value);
    if (tidied !== value) onChange(key, tidied);
    onFieldBlur(key, tidied);
  };

  /* =============================================================
     HANDLE KYC FILE
     Each picked file is checked (type, size, real content, not
     corrupted, not already attached elsewhere) before it is kept.
  ============================================================= */

  const setSlot = (slot, status) =>
    setFileStatus((current) => ({ ...current, [slot]: status }));

  // Fingerprints of the files in the other slots (for duplicates).
  const otherFiles = (slot) => {
    const files = [
      ["aadhaarFile", "Aadhaar", data.aadhaarFile],
      ["dlFile", "Driving Licence", data.dlFile],
      ...(Array.isArray(data.additionalDocs) ? data.additionalDocs : []).map((doc, index) => [
        `doc:${doc.id}`,
        doc.title?.trim() || `Additional Document #${index + 1}`,
        doc.file,
      ]),
    ];
    return files.filter(([key, , file]) => key !== slot && file?.sha256);
  };

  // Resolves the checked file (or null when refused); `apply` stores it.
  const pickKycFile = async (slot, file, apply) => {
    if (!file) {
      setSlot(slot, null);
      apply(null);
      return;
    }
    setSlot(slot, { progress: 0 });
    const result = await checkKycFile(file, {
      onProgress: (progress) => setSlot(slot, { progress }),
    });
    if (result.error) {
      setSlot(slot, { error: result.error });
      return;
    }
    const duplicate = otherFiles(slot).find(([, , other]) => other.sha256 === result.file.sha256);
    if (duplicate) {
      setSlot(slot, { error: `This file is already attached as ${duplicate[1]}.` });
      return;
    }
    setSlot(slot, null);
    apply(result.file);
  };

  const handleFileChange = (key, file) =>
    pickKycFile(key, file, (checked) => onChange(key, checked));

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

  const handleUpdateDocFile = (id, file) =>
    pickKycFile(`doc:${id}`, file, (checked) => {
      const updated = additionalDocs.map((doc) =>
        doc.id === id ? { ...doc, file: checked } : doc
      );
      onChange("additionalDocs", updated);
    });

  const handleRemoveAdditionalDoc = (id) => {
    const updated = additionalDocs.filter((doc) => doc.id !== id);
    setSlot(`doc:${id}`, null);
    onChange("additionalDocs", updated);
  };

  return (
    <div className="space-y-3">
      {/* Main Content: Balanced 2-Column Split (Customer Details on Left, KYC on Right) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-start">
        {/* =====================================================
            1. CUSTOMER DETAILS (Larger Portion: 7 of 12 cols)
        ====================================================== */}
        <div className="md:col-span-7">
          <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
            {/* Card Header with subtle green accent */}
            <div className="bg-emerald-50/70 border-b border-emerald-100/80 px-3.5 py-2 sm:px-4 sm:py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-100 text-[#006052] border border-emerald-200">
                  <User className="h-3.5 w-3.5" />
                </span>
                <h3 className="text-xs sm:text-sm font-bold text-[#0F1E36]">
                  {t("customer.details")}
                </h3>
              </div>
              <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-100/60 px-2 py-0.5 rounded border border-emerald-200/70">
                Primary Information
              </span>
            </div>

            <div className="p-3.5 sm:p-4 space-y-3">
              {/* Row 1: Customer Name & Mobile Number */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Customer Name */}
                <Field label={t("customer.name")} required error={errors.name}>
                  <Input
                    value={data.name || ""}
                    disabled={lockedIdentity}
                    onChange={set("name")}
                    onBlur={tidyOnBlur("name", cleanName)}
                    maxLength={NAME_MAX}
                    aria-invalid={errors.name ? "true" : undefined}
                    placeholder={t("customer.enterName")}
                    className={`h-9 text-xs sm:text-sm ${errorCls(errors.name)}`}
                  />
                </Field>

                {/* Mobile Number */}
                <Field label={t("customer.mobileNumber")} required error={errors.mobile}>
                  <PhoneInput
                    code={data.countryCode || "+91"}
                    mobile={data.mobile || ""}
                    onCodeChange={(value) => onChange("countryCode", value)}
                    onMobileChange={(value) => onChange("mobile", value)}
                    onMobileBlur={(e) => onFieldBlur("mobile", e.target.value)}
                    invalid={Boolean(errors.mobile)}
                    disabled={lockedIdentity}
                  />
                </Field>
              </div>

              {lockedIdentity && (
                <p className="text-[11px] text-slate-500">
                  Re-Loan for an existing customer: their name, mobile and address are used as saved. Change them from the customer&apos;s page.
                </p>
              )}

              {/* An existing customer has this mobile / Aadhaar */}
              {existingCustomer && !existingConfirmed && (
                <div
                  role="alert"
                  className={`rounded-lg border px-3 py-2 text-[11px] ${
                    existingAlert ? "border-red-300 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-900"
                  }`}
                >
                  <p>
                    <strong>Existing customer found:</strong> {existingCustomer.name || "Unnamed"} ({existingCustomer.customerId}) has
                    the same {existingCustomer.matchedBy === "aadhaar" ? "Aadhaar number" : "mobile number"}
                    {existingCustomer.activeLoans ? ` and ${existingCustomer.activeLoans} active loan${existingCustomer.activeLoans === 1 ? "" : "s"}` : ""}.
                    {existingAlert ? " Choose one to continue." : ""}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={onStartReLoan}
                      className="rounded border border-emerald-300 bg-white px-2 py-0.5 font-bold text-[#006052] hover:bg-emerald-50"
                    >
                      Start Re-Loan for {existingCustomer.name || existingCustomer.customerId}
                    </button>
                    <button
                      type="button"
                      onClick={onConfirmNewCustomer}
                      className="rounded border border-slate-300 bg-white px-2 py-0.5 font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Continue as a new customer
                    </button>
                  </div>
                </div>
              )}
              {existingCustomer && existingConfirmed && (
                <p className="text-[11px] text-slate-500">
                  Continuing as a new customer (not {existingCustomer.name || existingCustomer.customerId}, {existingCustomer.customerId}).{" "}
                  <button type="button" onClick={onUndoConfirm} className="font-semibold text-[#006052] hover:underline">
                    Undo
                  </button>
                </p>
              )}

              {/* Row 2: Application Date & Pincode */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Application Date */}
                {/* Today or an earlier date (an older loan can be entered); the
                    calendar disables future days, and NewLoan / the server
                    check it again. */}
                <Field label={t("customer.applicationDate")} error={errors.applicationDate}>
                  <Input
                    type="date"
                    value={data.applicationDate || ""}
                    min={EARLIEST_APPLICATION_DATE}
                    max={localToday()}
                    onChange={set("applicationDate")}
                    onBlur={(e) => onFieldBlur("applicationDate", e.target.value)}
                    aria-invalid={errors.applicationDate ? "true" : undefined}
                    className={`h-9 text-xs sm:text-sm ${errorCls(errors.applicationDate)}`}
                  />
                </Field>

                {/* Pincode: optional; digits only, at most 6 */}
                <Field label={t("customer.pincode")} error={errors.pincode}>
                  <Input
                    inputMode="numeric"
                    maxLength={6}
                    value={data.pincode || ""}
                    disabled={lockedIdentity}
                    onChange={(e) =>
                      onChange("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    onBlur={(e) => onFieldBlur("pincode", e.target.value)}
                    aria-invalid={errors.pincode ? "true" : undefined}
                    placeholder={t("customer.enterPincode")}
                    className={`h-9 font-mono text-xs sm:text-sm ${errorCls(errors.pincode)}`}
                  />
                </Field>
              </div>

              {/* Row 3: Address (Comfortably Wide across full width) */}
              <Field label={t("customer.address")} required error={errors.address}>
                <Textarea
                  rows={2}
                  value={data.address || ""}
                  disabled={lockedIdentity}
                  onChange={set("address")}
                  onBlur={tidyOnBlur("address", cleanText)}
                  maxLength={ADDRESS_MAX}
                  aria-invalid={errors.address ? "true" : undefined}
                  placeholder={t("customer.enterFullAddress")}
                  className={`min-h-[48px] resize-none text-xs sm:text-sm ${errorCls(errors.address)}`}
                />
              </Field>

              {/* Row 4: Area / Locality & Landmark (optional) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Area / Locality */}
                <Field label={t("customer.areaLocality")} error={errors.area}>
                  <Input
                    value={data.area || ""}
                    disabled={lockedIdentity}
                    onChange={set("area")}
                    onBlur={tidyOnBlur("area", cleanText)}
                    maxLength={LOCALITY_MAX}
                    aria-invalid={errors.area ? "true" : undefined}
                    placeholder={t("customer.enterAreaLocality")}
                    className={`h-9 text-xs sm:text-sm ${errorCls(errors.area)}`}
                  />
                </Field>

                {/* Landmark */}
                <Field label={t("customer.landmark")} error={errors.landmark}>
                  <Input
                    value={data.landmark || ""}
                    disabled={lockedIdentity}
                    onChange={set("landmark")}
                    onBlur={tidyOnBlur("landmark", cleanText)}
                    maxLength={LOCALITY_MAX}
                    aria-invalid={errors.landmark ? "true" : undefined}
                    placeholder={t("customer.enterLandmark")}
                    className={`h-9 text-xs sm:text-sm ${errorCls(errors.landmark)}`}
                  />
                </Field>
              </div>
            </div>
          </div>
        </div>

        {/* =====================================================
            2. KYC & IDENTITY DOCUMENTS (Right Column: 5 of 12 cols)
        ====================================================== */}
        <div className="md:col-span-5">
          <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
            {/* Card Header with + Document Button */}
            <div className="bg-emerald-50/70 border-b border-emerald-100/80 px-3.5 py-2 sm:px-4 sm:py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-100 text-[#006052] border border-emerald-200">
                  <FileText className="h-3.5 w-3.5" />
                </span>
                <h3 className="text-xs sm:text-sm font-bold text-[#0F1E36]">
                  {t("kyc.title")}
                </h3>
              </div>

              <button
                type="button"
                onClick={handleAddAdditionalDoc}
                className="inline-flex items-center gap-1 rounded bg-white hover:bg-emerald-50 text-[#006052] border border-emerald-300 px-2 py-0.5 text-[11px] font-bold transition-colors cursor-pointer shadow-2xs"
                title="Add another document"
              >
                <Plus className="h-3 w-3" strokeWidth={2.5} />
                <span>Document</span>
              </button>
            </div>

            <div className="p-3.5 sm:p-4 space-y-3">
              {/* 1. Aadhaar (Visible by default) */}
              <KycRow
                label={t("kyc.aadhaarNumber")}
                placeholder={t("kyc.enterAadhaar")}
                value={data.aadhaarNo || ""}
                // digits only (typed or pasted spaces are dropped); at most 12
                onValue={(value) => {
                  const digits = value.replace(/\D/g, "").slice(0, 12);
                  onChange("aadhaarNo", digits);
                }}
                onBlur={(value) => onKycBlur("aadhaarNo", value)}
                masked={maskAadhaar}
                inputMode="numeric"
                error={kycErrors.aadhaarNo}
                file={data.aadhaarFile}
                status={fileStatus.aadhaarFile}
                onFile={(file) => handleFileChange("aadhaarFile", file)}
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
                // letters, digits, spaces and hyphens only, upper case
                onValue={(value) =>
                  onChange("dlNo", value.toUpperCase().replace(/[^A-Z0-9 -]/g, "").slice(0, 24))
                }
                onBlur={(value) => {
                  const clean = normalizeDrivingLicence(value);
                  if (clean !== value) onChange("dlNo", clean);
                  onKycBlur("dlNo", clean);
                }}
                error={kycErrors.dlNo}
                file={data.dlFile}
                status={fileStatus.dlFile}
                onFile={(file) => handleFileChange("dlFile", file)}
                onPreview={(file) =>
                  setPreviewDoc({
                    title: `Driving Licence - ${data.name || "Customer"}`,
                    file,
                  })
                }
              />

              {/* Dynamic Additional Documents */}
              {additionalDocs.map((doc, idx) => {
                const docErrors = kycErrors.docs?.[doc.id] || {};
                return (
                <div
                  key={doc.id || idx}
                  className="rounded-lg border border-slate-200/90 bg-[#F8FAFC] p-2.5 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-slate-700">
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
                        handleUpdateDocTitle(doc.id, e.target.value.slice(0, 60))
                      }
                      maxLength={60}
                      aria-label={`Additional Document #${idx + 1} type`}
                      aria-invalid={docErrors.title ? "true" : undefined}
                      placeholder="e.g. PAN Card, Voter ID"
                      className={`min-w-0 flex-1 text-xs sm:text-sm h-9 bg-white ${errorCls(docErrors.title)}`}
                    />

                    <UploadButton
                      hasFile={Boolean(doc.file)}
                      busy={Boolean(fileStatus[`doc:${doc.id}`]?.progress !== undefined)}
                      label={`Additional Document #${idx + 1}`}
                      onPick={(f) => handleUpdateDocFile(doc.id, f)}
                    />
                  </div>

                  <FileArea
                    file={doc.file}
                    status={fileStatus[`doc:${doc.id}`]}
                    error={docErrors.title || docErrors.file}
                    onPreview={() =>
                      setPreviewDoc({
                        title: `${doc.title || "Document"} - ${data.name || "Customer"}`,
                        file: doc.file,
                      })
                    }
                    onRemove={() => handleUpdateDocFile(doc.id, null)}
                  />
                </div>
                );
              })}
            </div>
          </div>
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
                <FileText className="h-4 w-4 text-[#006052]" />
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
                    {formatFileSize(previewDoc.file?.size) || previewDoc.file?.size}
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              {previewDoc.file?.data && (
                <a
                  href={previewDoc.file.data}
                  download={previewDoc.file.name || "document"}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#006052] px-4 py-2 text-xs font-semibold text-white hover:bg-[#004d42] transition-colors"
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

// The existing Upload / Change button. The file box only offers the allowed
// types; the picked file is checked again anyway (names can lie).
const UploadButton = ({ hasFile, busy, label, onPick }) => (
  <label
    className={`flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 sm:px-3 text-xs font-semibold text-slate-700 hover:border-[#006052] hover:text-[#006052] transition-colors shadow-2xs h-9 ${
      busy ? "opacity-60 cursor-wait" : "cursor-pointer"
    }`}
  >
    <Upload className="h-3.5 w-3.5 text-slate-500" />
    <span>{busy ? "Checking…" : hasFile ? "Change" : "Upload"}</span>
    <input
      type="file"
      accept={KYC_FILE_ACCEPT}
      disabled={busy}
      aria-label={`${label} file`}
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = ""; // picking the same file again still triggers
        if (f) onPick(f);
      }}
      className="hidden"
    />
  </label>
);

// Under a KYC row: formats + size limit, the check's progress, an error, the
// attached file (View / Remove), or a note that it must be attached again.
const FileArea = ({ file, status, error, onPreview, onRemove }) => (
  <>
    {status?.progress !== undefined && (
      <div role="status" aria-label="Checking file" className="space-y-0.5">
        <div className="h-1 overflow-hidden rounded bg-slate-200">
          <div className="h-full bg-[#006052] transition-all" style={{ width: `${Math.max(status.progress, 5)}%` }} />
        </div>
        <p className="text-[10px] text-slate-500">Checking file… {status.progress}%</p>
      </div>
    )}

    {status?.error && (
      <p role="alert" className="text-[11px] font-medium text-red-600">
        Upload failed: {status.error}
      </p>
    )}
    {!status?.error && error && (
      <p role="alert" className="text-[11px] font-medium text-red-600">{error}</p>
    )}

    {file && needsReattach(file) && (
      <div className="flex items-center justify-between rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
        <span className="truncate" title="Documents are not stored with drafts yet, so the file has to be attached again.">
          {file.name || "Document"} — attach the file again
        </span>
        <button type="button" onClick={onRemove} className="ml-1 shrink-0 text-amber-700 hover:text-red-600 cursor-pointer" title="Remove file">
          <X className="h-3 w-3" />
        </button>
      </div>
    )}

    {file && !needsReattach(file) && (
      <div className="flex items-center justify-between rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-900">
        <span className="truncate max-w-[150px] sm:max-w-[180px] text-[11px] font-medium flex items-center gap-1">
          <FileText className="h-3 w-3 text-[#006052] shrink-0" />
          <span className="truncate">{file.name || "Document"}</span>
          {formatFileSize(file.size) && <span className="shrink-0 text-emerald-700/70">· {formatFileSize(file.size)}</span>}
        </span>
        <div className="flex items-center gap-1.5 shrink-0 ml-1">
          {onPreview && (
            <button
              type="button"
              onClick={onPreview}
              className="text-[11px] font-semibold text-[#006052] hover:underline cursor-pointer"
            >
              View
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            className="text-slate-400 hover:text-red-600 cursor-pointer ml-1"
            title="Remove file"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    )}

    <p className="text-[10px] text-slate-400">{KYC_FILE_HINT}</p>
  </>
);

export const KycRow = ({
  label,
  placeholder,
  value,
  file,
  status,
  error,
  onValue,
  onBlur,
  onFile,
  onPreview,
  masked,
  inputMode,
}) => {
  const [focused, setFocused] = useState(false);
  // Masked numbers (Aadhaar) show only the last 4 digits unless being edited.
  const shown = masked && !focused && value ? masked(value) : value || "";
  const attached = file && !needsReattach(file);

  return (
    <div className="rounded-lg border border-slate-200/90 bg-[#F8FAFC] p-2.5 space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-semibold text-slate-700">
          {label}
        </label>
        {attached && (
          <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded border border-emerald-200">
            Uploaded
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <Input
          value={shown}
          inputMode={inputMode}
          autoComplete="off"
          aria-label={label}
          aria-invalid={error ? "true" : undefined}
          onFocus={() => setFocused(true)}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(masked ? value || "" : e.target.value);
          }}
          onChange={(e) => onValue(e.target.value)}
          placeholder={placeholder}
          className={`min-w-0 flex-1 font-mono text-xs sm:text-sm h-9 bg-white ${errorCls(error)}`}
        />

        <UploadButton
          hasFile={Boolean(file)}
          busy={status?.progress !== undefined}
          label={label}
          onPick={onFile}
        />
      </div>

      <FileArea
        file={file}
        status={status}
        error={error}
        onPreview={onPreview && attached ? () => onPreview(file) : undefined}
        onRemove={() => onFile(null)}
      />
    </div>
  );
};

export default CustomerTab;