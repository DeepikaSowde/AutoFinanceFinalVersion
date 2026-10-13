import React, { useState, useMemo, useEffect } from "react";
import { loadGuarantorReferral, loadGuarantorReferrals } from '../services/guarantorApi';
import { useTranslation } from "react-i18next";
import {
  Field,
  Input,
  Textarea,
  PhoneInput,
  SectionCard,
} from "./Formcontrols";
import {
  Search,
  Plus,
  Upload,
  X,
  FileText,
  Users,
  Download,
} from "lucide-react";


// Helper: Convert File to Base64 with metadata
const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        name: file.name,
        size: (file.size / 1024).toFixed(1) + " KB",
        type: file.type,
        data: reader.result,
      });
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
};

const GuarantorTab = ({ data = {}, onChange }) => {
  const { t } = useTranslation();

  // Modal and preview states
  const [isFetchModalOpen, setIsFetchModalOpen] = useState(false);
  const [fetchSearch, setFetchSearch] = useState("");
  const [previewDoc, setPreviewDoc] = useState(null);
  const [fetchedFromId, setFetchedFromId] = useState(data.guarantorId || data.id || null);

  // Keep guarantor required set to 'Yes'
  useEffect(() => {
    if (data.required !== "Yes") {
      onChange("required", "Yes");
    }
  }, [data.required, onChange]);

  // Derived values supporting both conventions
  const fullNameVal = data.fullName ?? data.name ?? "";
  const phoneVal = data.phone ?? data.mobile ?? "";
  const aadhaarVal = data.aadhaarNumber ?? data.aadhaarNo ?? "";
  const additionalDocs = useMemo(() => {
    return Array.isArray(data.additionalDocs) ? data.additionalDocs : [];
  }, [data.additionalDocs]);

  // Register records for the Fetch popup, loaded from the API when it opens.
  const [sharedRecords, setSharedRecords] = useState([]);
  useEffect(() => {
    if (!isFetchModalOpen) return;
    let active = true;
    loadGuarantorReferrals()
      .then((list) => active && setSharedRecords(list))
      .catch((error) => active && alert(error.message || "Could not load the guarantor register."));
    return () => {
      active = false;
    };
  }, [isFetchModalOpen]);

  // Filter shared records
  const filteredRecords = useMemo(() => {
    if (!fetchSearch.trim()) return sharedRecords;
    const q = fetchSearch.toLowerCase().trim();
    return sharedRecords.filter((r) => {
      return (
        r.id?.toLowerCase().includes(q) ||
        r.fullName?.toLowerCase().includes(q) ||
        r.phone?.includes(q) ||
        r.address?.toLowerCase().includes(q) ||
        r.area?.toLowerCase().includes(q) ||
        r.landmark?.toLowerCase().includes(q) ||
        r.aadhaarNumber?.includes(q)
      );
    });
  }, [sharedRecords, fetchSearch]);

  // Handle selecting a record from Fetch modal
  const handleSelectRecord = async (summary) => {
    if (!summary) return;
    let record;
    try {
      record = await loadGuarantorReferral(summary.id);
    } catch (error) {
      alert(error.message || "Could not load this guarantor.");
      return;
    }

    onChange("name", record.fullName || "");
    onChange("fullName", record.fullName || "");
    onChange("mobile", record.phone || "");
    onChange("phone", record.phone || "");
    onChange("address", record.address || "");
    onChange("area", record.area || "");
    onChange("landmark", record.landmark || "");
    onChange("pincode", record.pincode || "");
    onChange("aadhaarNo", record.aadhaarNumber || "");
    onChange("aadhaarNumber", record.aadhaarNumber || "");
    onChange("aadhaarFile", record.aadhaarFile || null);
    onChange("additionalDocs", record.additionalDocs || []);
    onChange("guarantorId", record.id || "");
    onChange("id", record.id || "");
    onChange("required", "Yes");

    setFetchedFromId(record.id || record.fullName);
    setIsFetchModalOpen(false);
  };

  // Handle Aadhaar file
  const handleAadhaarFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const fileData = await fileToBase64(file);
      onChange("aadhaarFile", fileData);
    } catch (err) {
      console.error("Failed to process Aadhaar file:", err);
    }
  };

  // Dynamic additional documents handlers
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
      {/* =========================================================
          HEADER (Matches CustomerTab exactly: bg-emerald-50)
      ========================================================= */}
      <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-1.5 sm:px-4 sm:py-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 sm:text-base">
            Guarantor Information
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {fetchedFromId && (
            <span className="hidden sm:inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[10px] font-medium text-emerald-800 border border-emerald-200">
              ✓ Loaded: {fetchedFromId}
            </span>
          )}

          {/* Fetch Button */}
          <button
            type="button"
            onClick={() => {
              setIsFetchModalOpen(true);
              setFetchSearch("");
            }}
            className="inline-flex items-center gap-1 rounded-md bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-1 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            title="Fetch from shared Guarantor / Referral records"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Fetch</span>
          </button>
        </div>
      </div>

      {/* =========================================================
          MAIN CONTENT (2-Column Layout matching CustomerTab)
      ========================================================= */}
      <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-3">
        {/* =====================================================
            LEFT COLUMN: GUARANTOR DETAILS (xl:col-span-2)
        ====================================================== */}
        <div className="xl:col-span-2">
          <SectionCard title="Guarantor Details">
            <div className="grid grid-cols-1 gap-x-3 gap-y-2 md:grid-cols-2">
              {/* 1. Full Name */}
              <Field label="Full Name" required>
                <Input
                  value={fullNameVal}
                  onChange={(e) => {
                    onChange("name", e.target.value);
                    onChange("fullName", e.target.value);
                  }}
                  placeholder="Enter full name"
                />
              </Field>

              {/* 2. Phone Number */}
              <Field label="Phone Number" required>
                <PhoneInput
                  code={data.countryCode || "+91"}
                  mobile={phoneVal}
                  onCodeChange={(value) => onChange("countryCode", value)}
                  onMobileChange={(value) => {
                    onChange("mobile", value);
                    onChange("phone", value);
                  }}
                />
              </Field>

              {/* 3. Address (Multiline) */}
              <Field label="Address" required className="md:col-span-2">
                <Textarea
                  rows={2}
                  value={data.address || ""}
                  onChange={(e) => onChange("address", e.target.value)}
                  placeholder="Enter full residential address"
                  className="min-h-[44px] resize-none"
                />
              </Field>
            </div>

            {/* Location Details: 4. Area, 5. Landmark, 6. Pincode */}
            <div className="mt-2 grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-3">
              {/* 4. Area */}
              <Field label="Area / Locality">
                <Input
                  value={data.area || ""}
                  onChange={(e) => onChange("area", e.target.value)}
                  placeholder="Enter area / locality"
                />
              </Field>

              {/* 5. Landmark */}
              <Field label="Landmark">
                <Input
                  value={data.landmark || ""}
                  onChange={(e) => onChange("landmark", e.target.value)}
                  placeholder="Enter landmark"
                />
              </Field>

              {/* 6. Pincode */}
              <Field label="Pincode">
                <Input
                  inputMode="numeric"
                  maxLength={6}
                  value={data.pincode || ""}
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
            RIGHT COLUMN: KYC & DOCUMENTS (xl:col-span-1)
        ====================================================== */}
        <div className="xl:col-span-1">
          <SectionCard
            title="KYC & Documents"
            right={
              <button
                type="button"
                onClick={handleAddAdditionalDoc}
                className="inline-flex items-center gap-1 rounded bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold transition-colors cursor-pointer"
                title="Add another document upload"
              >
                <Plus className="h-3 w-3" strokeWidth={2.5} />
                <span>Document</span>
              </button>
            }
          >
            <div className="space-y-2">
              {/* 7 & 8. Aadhaar Number & Aadhaar Document */}
              <div className="border-b border-slate-100 pb-2">
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Aadhaar Number <span className="text-red-500">*</span>
                </label>

                <div className="flex gap-2">
                  <Input
                    inputMode="numeric"
                    maxLength={12}
                    value={aadhaarVal}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "");
                      onChange("aadhaarNo", val);
                      onChange("aadhaarNumber", val);
                    }}
                    placeholder="12-digit Aadhaar"
                    className="min-w-0 flex-1 font-mono"
                  />

                  <label className="flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-emerald-600 hover:text-emerald-800 cursor-pointer transition-colors">
                    <Upload className="h-3.5 w-3.5 text-slate-500" />
                    <span>{data.aadhaarFile ? "Change" : "Upload"}</span>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={handleAadhaarFileChange}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Uploaded Aadhaar File Status */}
                {data.aadhaarFile && (
                  <div className="mt-1 flex items-center justify-between text-[11px] text-emerald-700 bg-emerald-50/70 rounded px-2 py-0.5">
                    <span className="truncate max-w-[170px] flex items-center gap-1">
                      ✓ {data.aadhaarFile.name || "Aadhaar Card"}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewDoc({
                            title: `Aadhaar - ${fullNameVal || "Guarantor"}`,
                            file: data.aadhaarFile,
                          })
                        }
                        className="text-emerald-800 hover:underline cursor-pointer font-medium"
                      >
                        View
                      </button>
                      <button
                        type="button"
                        onClick={() => onChange("aadhaarFile", null)}
                        className="text-slate-400 hover:text-red-600 cursor-pointer ml-1"
                        title="Remove file"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}
              </div>

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
                      title="Remove field"
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
                      placeholder="e.g. PAN, Bill"
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
                              title: `${doc.title || "Document"} - ${fullNameVal || "Guarantor"}`,
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
          FETCH GUARANTOR / REFERRAL MODAL DIALOG
      ========================================================= */}
      {isFetchModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsFetchModalOpen(false);
          }}
        >
          <div
            className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] my-auto border border-slate-200 animate-in zoom-in-95 duration-200"
            role="dialog"
            aria-modal="true"
          >
            {/* Modal Header */}
            <div className="bg-[#0F1E36] px-5 py-4 text-white flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">
                  Fetch Guarantor / Referral
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Select a record from the shared directory to populate guarantor details
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsFetchModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Search Input */}
            <div className="p-4 border-b border-slate-100 bg-[#F8FAFC]">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  autoFocus
                  value={fetchSearch}
                  onChange={(e) => setFetchSearch(e.target.value)}
                  placeholder="Search by ID (GR-XXXXX), name, phone, address, or Aadhaar..."
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#006052] focus:ring-2 focus:ring-[#006052]/20 outline-none transition-all"
                />
                {fetchSearch && (
                  <button
                    type="button"
                    onClick={() => setFetchSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Records List or Empty State */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {filteredRecords.length > 0 ? (
                filteredRecords.map((rec) => {
                  const docCount =
                    (rec.aadhaarFile ? 1 : 0) +
                    (rec.additionalDocs?.length || 0);

                  return (
                    <div
                      key={rec.id}
                      onClick={() => handleSelectRecord(rec)}
                      className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 hover:border-emerald-600 hover:bg-emerald-50/20 shadow-2xs transition-all cursor-pointer"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                            {rec.id}
                          </span>
                          <h4 className="text-sm font-bold text-slate-900 group-hover:text-emerald-800 transition-colors truncate">
                            {rec.fullName}
                          </h4>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-slate-500 mt-1">
                          <p>
                            <span className="text-slate-400">Mobile:</span>{" "}
                            <span className="font-semibold text-slate-700">
                              +91 {rec.phone || "—"}
                            </span>
                          </p>
                          <p>
                            <span className="text-slate-400">Aadhaar:</span>{" "}
                            <span className="font-mono text-slate-700">
                              {rec.aadhaarNumber
                                ? `XXXX XXXX ${rec.aadhaarNumber.slice(-4)}`
                                : "—"}
                            </span>
                          </p>
                          {(rec.area || rec.pincode) && (
                            <p className="sm:col-span-2 truncate">
                              <span className="text-slate-400">Location:</span>{" "}
                              <span>
                                {[rec.area, rec.landmark, rec.pincode]
                                  .filter(Boolean)
                                  .join(", ")}
                              </span>
                            </p>
                          )}
                        </div>

                        {docCount > 0 && (
                          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
                            <FileText className="h-3 w-3 text-emerald-700" />
                            <span>
                              {docCount} Attached Document{docCount !== 1 ? "s" : ""}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="self-end sm:self-center shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectRecord(rec);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white shadow-xs group-hover:bg-emerald-800 transition-colors cursor-pointer"
                        >
                          <span>Select</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                /* Clear Message as required */
                <div className="flex flex-col items-center justify-center py-10 px-4 text-center rounded-xl border border-dashed border-slate-200 bg-[#F8FAFC]">
                  <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3 border border-slate-200">
                    <Users className="h-6 w-6" strokeWidth={1.8} />
                  </div>
                  <h4 className="text-sm sm:text-base font-bold text-slate-800">
                    No matching guarantor/referral record found.
                  </h4>
                  <p className="mt-1 text-xs text-slate-500 max-w-sm leading-relaxed">
                    {sharedRecords.length === 0
                      ? "There are no guarantor or referral records registered in the system yet. You can fill in the details manually."
                      : "No record matches your search query. Please try searching with a different name, ID, or phone number, or enter details manually."}
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-slate-100 px-5 py-3 bg-slate-50 flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-500">
                {sharedRecords.length} record{sharedRecords.length !== 1 ? "s" : ""} in shared directory
              </span>
              <button
                type="button"
                onClick={() => setIsFetchModalOpen(false)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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

export default GuarantorTab;