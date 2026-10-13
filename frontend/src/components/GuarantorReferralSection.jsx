import React, { useState, useMemo, useEffect } from "react";
import {
  Users,
  UserCheck,
  UserX,
  Search,
  Plus,
  Upload,
  X,
  FileText,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Eye,
  Download,
  RotateCcw,
  ArrowRight,
  ArrowLeft,
  Coins,
} from "lucide-react";
import {
  Field,
  Input,
  Textarea,
  PhoneInput,
} from "./Formcontrols";
import {
  normalizePhone,
  findRecordsByMobile,
  getGuarantorReferralRecords,
  loadGuarantorReferralRecord,
  UPDATE_EVENT_NAME,
} from "../utils/guarantorReferralStorage";

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

/**
 * Reusable Contact Person Form Component for Guarantor and Referral
 */
const ContactPersonForm = ({
  type = "guarantor", // "guarantor" | "referral"
  title = "Guarantor Details",
  badgeLabel = "Guarantor",
  data = {},
  onChange,
  onClear,
  isBoth = false,
  currentSubStep = "guarantor",
  onNext,
  onBack,
  onSwitchStep,
  loanAmount = 0,
}) => {
  // Modal & feedback states
  const [isFetchModalOpen, setIsFetchModalOpen] = useState(false);
  const [fetchSearch, setFetchSearch] = useState("");
  const [previewDoc, setPreviewDoc] = useState(null);
  const [fetchFeedback, setFetchFeedback] = useState(null);
  const [ambiguousMatches, setAmbiguousMatches] = useState(null);
  const [recordsVersion, setRecordsVersion] = useState(0);

  // Auto-calculate referral commission amount when loanAmount or commissionPercentage changes
  useEffect(() => {
    if (type === "referral" && data.commissionPercentage !== undefined && data.commissionPercentage !== "") {
      const pct = Number(data.commissionPercentage);
      if (!isNaN(pct) && pct >= 0) {
        const calculated = String(Math.round((Number(loanAmount || 0) * pct) / 100));
        if (String(data.commissionAmount || "") !== calculated) {
          onChange("commissionAmount", calculated);
        }
      }
    }
  }, [loanAmount, data.commissionPercentage, type]);

  // Subscribe to real-time updates from shared storage
  useEffect(() => {
    const handleUpdate = () => {
      setRecordsVersion((v) => v + 1);
    };
    window.addEventListener(UPDATE_EVENT_NAME, handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener(UPDATE_EVENT_NAME, handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  // Form field values
  const fullName = data.fullName ?? data.name ?? "";
  const phone = data.phone ?? data.mobile ?? "";
  const aadhaarNumber = data.aadhaarNumber ?? data.aadhaarNo ?? "";
  const fetchedId = data.guarantorId || data.referralId || data.id || null;
  const additionalDocs = useMemo(() => {
    return Array.isArray(data.additionalDocs) ? data.additionalDocs : [];
  }, [data.additionalDocs]);

  // Read shared records
  const sharedRecords = useMemo(() => {
    return getGuarantorReferralRecords();
  }, [isFetchModalOpen, recordsVersion]);

  // Filter shared records for fetch modal
  const filteredRecords = useMemo(() => {
    if (ambiguousMatches && ambiguousMatches.length > 0) {
      return ambiguousMatches;
    }
    if (!fetchSearch.trim()) return sharedRecords;
    const q = fetchSearch.toLowerCase().trim();
    const cleanQ = normalizePhone(q);

    return sharedRecords.filter((r) => {
      const recPhoneNorm = normalizePhone(r.phone);
      return (
        r.id?.toLowerCase().includes(q) ||
        r.fullName?.toLowerCase().includes(q) ||
        (cleanQ && recPhoneNorm.includes(cleanQ)) ||
        r.address?.toLowerCase().includes(q) ||
        r.area?.toLowerCase().includes(q) ||
        r.landmark?.toLowerCase().includes(q) ||
        r.aadhaarNumber?.includes(q)
      );
    });
  }, [sharedRecords, fetchSearch, ambiguousMatches]);

  // Select record from Fetch
  const handleSelectRecord = async (summary) => {
    if (!summary) return;

    // The register list has no document contents; load this person in full.
    let record;
    try {
      record = await loadGuarantorReferralRecord(summary.id);
    } catch (error) {
      alert(error.message || "Could not load this person's details.");
      return;
    }

    onChange({
      name: record.fullName || "",
      fullName: record.fullName || "",
      mobile: record.phone || "",
      phone: record.phone || "",
      address: record.address || "",
      area: record.area || "",
      landmark: record.landmark || "",
      pincode: record.pincode || "",
      aadhaarNo: record.aadhaarNumber || "",
      aadhaarNumber: record.aadhaarNumber || "",
      aadhaarFile: record.aadhaarFile || null,
      additionalDocs: Array.isArray(record.additionalDocs) ? record.additionalDocs : [],
      ...(type === "guarantor"
        ? { guarantorId: record.id || "", id: record.id || "" }
        : {
            referralId: record.id || "",
            id: record.id || "",
            commissionPercentage: data.commissionPercentage || "",
            commissionAmount: data.commissionAmount || "",
            payCommission: data.payCommission || false,
            paymentMode: data.paymentMode || "Cash",
          }),
    });

    setIsFetchModalOpen(false);
    setAmbiguousMatches(null);
    setFetchFeedback({
      type: "success",
      message: `Loaded details for ${record.fullName} (ID: ${record.id})`,
    });
  };

  // Primary Fetch Click Handler
  const handleFetchClick = () => {
    const rawMobile = phone.trim();
    const cleanMobile = normalizePhone(rawMobile);

    if (cleanMobile && cleanMobile.length === 10) {
      const matches = findRecordsByMobile(cleanMobile);

      if (matches.length === 1) {
        // Exactly 1 match found
        handleSelectRecord(matches[0]);
      } else if (matches.length > 1) {
        // Multiple matches found -> open disambiguation modal
        setAmbiguousMatches(matches);
        setFetchSearch(cleanMobile);
        setIsFetchModalOpen(true);
        setFetchFeedback({
          type: "warning",
          message: `Multiple records found with mobile +91 ${cleanMobile}. Please select the intended person.`,
        });
      } else {
        // No match found -> allow manual entry
        setFetchFeedback({
          type: "notFound",
          message: `No matching record found for mobile +91 ${cleanMobile}. You can enter details manually below.`,
        });
      }
    } else {
      // Empty or incomplete phone -> open search modal
      setAmbiguousMatches(null);
      setFetchSearch(cleanMobile || "");
      setIsFetchModalOpen(true);
      setFetchFeedback(null);
    }
  };

  // Aadhaar File Change
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

  // Dynamic Additional Documents Handlers
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

  const isGuarantor = type === "guarantor";

  return (
    <div className="flex flex-col rounded-lg border border-slate-200 bg-white shadow-2xs overflow-hidden transition-all">
      {/* Form Card Header: Show only relationship badge on left, single Clear Form button on right */}
      <div
        className={`flex items-center justify-between px-3 py-1.5 sm:px-3.5 sm:py-2 border-b ${
          isGuarantor
            ? "bg-emerald-50/70 border-emerald-100"
            : "bg-blue-50/60 border-blue-100"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${
              isGuarantor
                ? "bg-emerald-100 text-[#006052] border-emerald-300"
                : "bg-blue-100 text-[#0F1E36] border-blue-300"
            }`}
          >
            {isGuarantor ? "GUARANTOR" : "REFERRAL"}
          </span>
          {fetchedId && (
            <span className="inline-flex items-center rounded bg-white px-1.5 py-0.2 text-[10px] font-mono font-semibold text-emerald-800 border border-emerald-200">
              ✓ {fetchedId}
            </span>
          )}
        </div>

        {/* Header Right Actions: Single Clear Form button */}
        <button
          type="button"
          onClick={() => {
            setFetchFeedback(null);
            onClear();
          }}
          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[10px] sm:text-[11px] font-semibold text-slate-600 hover:text-red-700 hover:border-red-200 hover:bg-red-50/60 transition-colors cursor-pointer shadow-2xs"
          title="Clear form"
        >
          <RotateCcw className="h-3 w-3" />
          <span>Clear Form</span>
        </button>
      </div>

      {/* Fetch Feedback Banner */}
      {fetchFeedback?.type === "notFound" && (
        <div className="bg-amber-50 border-b border-amber-200 px-3 py-1 flex items-center justify-between text-xs text-amber-900 animate-in fade-in duration-150">
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            <span className="truncate text-[11px] sm:text-xs">{fetchFeedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFetchFeedback(null)}
            className="text-amber-700 hover:text-amber-900 text-[11px] underline cursor-pointer shrink-0 ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {fetchFeedback?.type === "success" && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-3 py-1 flex items-center justify-between text-xs text-emerald-900 animate-in fade-in duration-150">
          <div className="flex items-center gap-1.5 min-w-0">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            <span className="truncate text-[11px] sm:text-xs">{fetchFeedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFetchFeedback(null)}
            className="text-emerald-700 hover:text-emerald-900 text-[11px] underline cursor-pointer shrink-0 ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Form Fields Body - Balanced 2-Column Responsive Grid */}
      <div className="p-2.5 sm:p-3 space-y-2.5 flex-1 bg-white">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* 1. Full Name */}
          <Field label="Full Name">
            <Input
              value={fullName}
              onChange={(e) => {
                onChange("name", e.target.value);
                onChange("fullName", e.target.value);
              }}
              placeholder="Enter full legal name"
              className="h-9 text-xs sm:text-sm"
            />
          </Field>

          {/* 2. Mobile Number with Fetch Button aligned in one row */}
          <Field label="Mobile Number">
            <div className="flex items-center gap-1.5">
              {/* Country Code: only as wide as needed (w-14) */}
              <div className="relative w-14 shrink-0">
                <select
                  value={data.countryCode || "+91"}
                  onChange={(e) => onChange("countryCode", e.target.value)}
                  className="h-9 w-full appearance-none rounded-md border border-slate-300 bg-white pl-2 pr-5 text-xs sm:text-sm font-medium text-slate-800 focus:border-[#006052] focus:outline-none focus:ring-1 focus:ring-[#006052]/30"
                >
                  <option value="+91">+91</option>
                </select>
                <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 text-[10px]">▼</span>
              </div>

              {/* Phone Input: full width for complete mobile number */}
              <input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={phone}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  onChange("mobile", val);
                  onChange("phone", val);
                  if (fetchFeedback) setFetchFeedback(null);
                }}
                placeholder="10-digit mobile"
                className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2.5 text-xs sm:text-sm font-mono tracking-wider text-slate-800 placeholder:text-slate-400 placeholder:tracking-normal focus:border-[#006052] focus:outline-none focus:ring-1 focus:ring-[#006052]/30"
              />

              {/* Fetch Button immediately beside the number field in the same row */}
              <button
                type="button"
                onClick={handleFetchClick}
                className="inline-flex h-9 items-center justify-center gap-1 rounded-md bg-[#006052] px-3 text-xs font-semibold text-white shadow-2xs hover:bg-[#004d42] active:bg-[#003d34] transition-colors cursor-pointer shrink-0"
                title="Fetch details by this mobile number"
              >
                <Search className="h-3 w-3" />
                <span>Fetch</span>
              </button>
            </div>
          </Field>

          {/* 7. Aadhaar Number */}
          <Field label="Aadhaar Number">
            <Input
              inputMode="numeric"
              maxLength={12}
              value={aadhaarNumber}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "");
                onChange("aadhaarNo", val);
                onChange("aadhaarNumber", val);
              }}
              placeholder="12-digit Aadhaar number"
              className="h-9 font-mono text-xs sm:text-sm tracking-wider"
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
              placeholder="6-digit pincode"
              className="h-9 font-mono text-xs sm:text-sm"
            />
          </Field>

          {/* 3. Address */}
          <Field label="Address">
            <Input
              value={data.address || ""}
              onChange={(e) => onChange("address", e.target.value)}
              placeholder="Door / Flat No., Street Name"
              className="h-9 text-xs sm:text-sm"
            />
          </Field>

          {/* 4. Area / Locality */}
          <Field label="Area / Locality">
            <Input
              value={data.area || ""}
              onChange={(e) => onChange("area", e.target.value)}
              placeholder="e.g. T. Nagar"
              className="h-9 text-xs sm:text-sm"
            />
          </Field>

          {/* 5. Landmark */}
          <Field label="Landmark">
            <Input
              value={data.landmark || ""}
              onChange={(e) => onChange("landmark", e.target.value)}
              placeholder="e.g. Near Bus Stand"
              className="h-9 text-xs sm:text-sm"
            />
          </Field>

          {/* Referral Commission Fields (Commission %, Amount for That %, Pay Commission) - Only for Referral form, NEVER for Guarantor */}
          {!isGuarantor && (
            <div className="col-span-1 sm:col-span-2 rounded-lg border border-emerald-100 bg-emerald-50/40 p-2.5 sm:p-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-emerald-100/80 pb-1.5">
                <div className="flex items-center gap-1.5">
                  <Coins className="h-4 w-4 text-[#006052]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#0F1E36]">
                    Referral Commission Details
                  </span>
                </div>
                {Number(loanAmount) > 0 && (
                  <span className="text-[11px] font-medium text-slate-500">
                    Loan Principal: <strong className="font-semibold text-slate-800">₹{Number(loanAmount).toLocaleString("en-IN")}</strong>
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* 1. Commission (%) — Optional percentage input */}
                <Field label="Commission (%)">
                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      inputMode="decimal"
                      value={data.commissionPercentage ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "" || (!isNaN(val) && Number(val) >= 0 && Number(val) <= 100)) {
                          onChange("commissionPercentage", val);
                          if (val === "") {
                            onChange("commissionAmount", "");
                          } else {
                            const calc = Math.round((Number(loanAmount || 0) * Number(val)) / 100);
                            onChange("commissionAmount", calc > 0 ? String(calc) : "0");
                          }
                        }
                      }}
                      placeholder="e.g. 2"
                      className="h-9 pr-7 text-xs sm:text-sm font-semibold text-slate-800"
                    />
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      %
                    </span>
                  </div>
                </Field>

                {/* 2. Amount for That % (₹) — Automatically calculate using loan amount × commission percentage ÷ 100 */}
                <Field label="Amount for That % (₹)">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">
                      ₹
                    </span>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      value={data.commissionAmount ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "" || (!isNaN(val) && Number(val) >= 0)) {
                          onChange("commissionAmount", val);
                        }
                      }}
                      placeholder="0"
                      className="h-9 pl-7 text-xs sm:text-sm font-bold text-emerald-950"
                    />
                  </div>
                  {Number(loanAmount) > 0 && data.commissionPercentage ? (
                    <p className="text-[10px] text-emerald-700 mt-0.5 font-medium">
                      Calculated: ₹{Number(loanAmount).toLocaleString("en-IN")} × {data.commissionPercentage}% ÷ 100
                    </p>
                  ) : (
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Auto-calculates from Loan Amount × Commission %
                    </p>
                  )}
                </Field>
              </div>

              {/* 3. Pay Commission — Allow admin to pay commission during loan creation */}
              <div className="rounded-md border border-slate-200 bg-white p-2.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={Boolean(data.payCommission)}
                      onChange={(e) => onChange("payCommission", e.target.checked)}
                      className="h-4 w-4 rounded accent-[#006052] text-[#006052] focus:ring-[#006052]"
                    />
                    <span className="text-xs font-bold text-[#0F1E36]">
                      Pay Commission
                    </span>
                    <span className="text-[11px] text-slate-500">
                      (Pay during loan creation)
                    </span>
                  </label>

                  {/* Status Indicator */}
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                      data.payCommission
                        ? "bg-emerald-50 text-[#006052] border-emerald-200"
                        : "bg-slate-50 text-slate-600 border-slate-200"
                    }`}
                  >
                    {data.payCommission ? "● Paid on Loan Creation" : "○ Pay Later (Pending)"}
                  </span>
                </div>

                {data.payCommission ? (
                  <div className="flex flex-wrap items-center gap-2 pt-1.5 border-t border-slate-100">
                    <span className="text-xs font-semibold text-slate-600">Payment Mode:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {["Cash", "Bank Transfer", "UPI", "Cheque"].map((mode) => {
                        const isSelected = (data.paymentMode || "Cash") === mode;
                        return (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => onChange("paymentMode", mode)}
                            className={`px-2 py-0.5 rounded text-xs font-semibold border transition-all cursor-pointer ${
                              isSelected
                                ? "bg-[#006052] text-white border-[#006052] shadow-2xs"
                                : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                            }`}
                          >
                            {mode}
                          </button>
                        );
                      })}
                    </div>
                    <span className="text-[11px] text-emerald-800 ml-auto font-medium">
                      ✓ Will be recorded as an expense under "Referral Commission"
                    </span>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400">
                    If unpaid now, details will still be saved to the Referral page. You can pay later using the <strong>Pay Commission</strong> button on the Referral Commission page.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* 8. Aadhaar Document Upload with single green + button beside it */}
          <div>
            <label className="block mb-1 text-xs font-medium text-slate-700">
              Aadhaar Document
            </label>

            <div className="flex items-center gap-1.5">
              <label className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-[#006052] hover:text-[#006052] cursor-pointer transition-colors shadow-2xs h-9">
                <Upload className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                <span className="truncate">{data.aadhaarFile ? "Change File" : "Upload File"}</span>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleAadhaarFileChange}
                  className="hidden"
                />
              </label>

              {/* Exactly ONE green + button beside the upload field */}
              <button
                type="button"
                onClick={handleAddAdditionalDoc}
                className="flex h-9 w-9 items-center justify-center rounded-md bg-[#006052] hover:bg-[#004d42] active:bg-[#003d34] text-white shadow-2xs transition-colors cursor-pointer shrink-0"
                title="Add additional document"
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>

            {/* Aadhaar File uploaded status pill */}
            {data.aadhaarFile && (
              <div className="flex items-center justify-between rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-900 mt-1">
                <div className="flex items-center gap-1 truncate">
                  <FileText className="h-3 w-3 text-[#006052] shrink-0" />
                  <span className="truncate font-medium text-[11px]">{data.aadhaarFile.name || "Aadhaar Document"}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-1">
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewDoc({
                        title: `Aadhaar - ${fullName || badgeLabel}`,
                        file: data.aadhaarFile,
                      })
                    }
                    className="text-[11px] font-semibold text-[#006052] hover:underline cursor-pointer"
                  >
                    View
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange("aadhaarFile", null)}
                    className="text-slate-400 hover:text-red-600 cursor-pointer"
                    title="Remove file"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Additional Dynamic Documents (Each click adds one additional document with file selector and remove option) */}
        {additionalDocs.length > 0 && (
          <div className="pt-2 border-t border-slate-100 space-y-2">
            {additionalDocs.map((doc, idx) => (
              <div
                key={doc.id || idx}
                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-slate-50 p-2 rounded-md border border-slate-200"
              >
                <div className="sm:w-44 shrink-0">
                  <Input
                    value={doc.title || ""}
                    onChange={(e) => handleUpdateDocTitle(doc.id, e.target.value)}
                    placeholder="Document Title (e.g. PAN)"
                    className="h-9 text-xs bg-white"
                  />
                </div>

                <label className="flex flex-1 items-center justify-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-[#006052] hover:text-[#006052] cursor-pointer transition shadow-2xs h-9">
                  <Upload className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                  <span className="text-xs truncate">{doc.file ? "Change File" : "Upload File"}</span>
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

                {doc.file && (
                  <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-xs text-emerald-900 h-9 truncate flex-1">
                    <FileText className="h-3.5 w-3.5 text-[#006052] shrink-0" />
                    <span className="truncate font-medium">{doc.file.name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewDoc({
                          title: `${doc.title || "Document"} - ${fullName || badgeLabel}`,
                          file: doc.file,
                        })
                      }
                      className="text-[#006052] hover:underline font-semibold ml-auto shrink-0 cursor-pointer"
                    >
                      View
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => handleRemoveAdditionalDoc(doc.id)}
                  className="flex items-center justify-center text-xs text-red-600 hover:text-red-700 hover:bg-red-50 p-2 rounded transition cursor-pointer shrink-0"
                  title="Remove document field"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Disambiguation Modal Dialog */}
      {isFetchModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsFetchModalOpen(false);
              setAmbiguousMatches(null);
            }
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
                  {ambiguousMatches
                    ? `Select Matching ${badgeLabel} Record`
                    : `Fetch ${badgeLabel} Details`}
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  {ambiguousMatches
                    ? `Multiple records found with mobile +91 ${fetchSearch}. Select the correct person:`
                    : "Search by mobile number, ID, or name from the shared directory"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsFetchModalOpen(false);
                  setAmbiguousMatches(null);
                }}
                className="rounded-lg p-1.5 text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Warning Alert if multiple matches */}
            {ambiguousMatches && ambiguousMatches.length > 1 && (
              <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center gap-2 text-xs text-amber-900">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>
                  <strong>{ambiguousMatches.length} records</strong> match mobile number{" "}
                  <strong>+91 {fetchSearch}</strong>. Please select the intended person below.
                </span>
              </div>
            )}

            {/* Search Input */}
            {!ambiguousMatches && (
              <div className="p-4 border-b border-slate-100 bg-[#F8FAFC]">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    autoFocus
                    value={fetchSearch}
                    onChange={(e) => setFetchSearch(e.target.value)}
                    placeholder="Search by mobile number (e.g. 9876543210), ID (GR-00001), or name..."
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
            )}

            {/* Records List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {filteredRecords.length > 0 ? (
                filteredRecords.map((rec) => {
                  const docCount =
                    (rec.aadhaarFile ? 1 : 0) + (rec.additionalDocs?.length || 0);

                  return (
                    <div
                      key={rec.id}
                      onClick={() => handleSelectRecord(rec)}
                      className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 hover:border-[#006052] hover:bg-emerald-50/20 shadow-2xs transition-all cursor-pointer"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs font-bold text-[#006052] bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                            {rec.id}
                          </span>
                          <h4 className="text-sm font-bold text-slate-900 group-hover:text-[#006052] transition-colors truncate">
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
                            <FileText className="h-3 w-3 text-[#006052]" />
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
                          className="inline-flex items-center gap-1 rounded-lg bg-[#006052] px-3 py-1.5 text-xs font-semibold text-white shadow-xs group-hover:bg-[#004d42] transition-colors cursor-pointer"
                        >
                          <span>Select</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center py-10 px-4 text-center rounded-xl border border-dashed border-slate-200 bg-[#F8FAFC]">
                  <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3 border border-slate-200">
                    <Users className="h-6 w-6" strokeWidth={1.8} />
                  </div>
                  <h4 className="text-sm sm:text-base font-bold text-slate-800">
                    No matching record found.
                  </h4>
                  <p className="mt-1 text-xs text-slate-500 max-w-sm leading-relaxed">
                    No record matches your search query. You can enter details manually in the form.
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
                onClick={() => {
                  setIsFetchModalOpen(false);
                  setAmbiguousMatches(null);
                }}
                className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Preview Overlay */}
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
                  <p className="font-medium text-slate-700">{previewDoc.file?.name}</p>
                  <p className="text-xs text-slate-400 mt-1">{previewDoc.file?.size}</p>
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

/**
 * Main Section 2: Guarantor & Referral Component
 *
 * Implements:
 * - Compact horizontal question and 4 radio options bar (zero oversized banner)
 * - Sequential form switching for "both" option (Guarantor first -> Next: Referral -> Back)
 * - Single form display at any given time (never side by side)
 * - Full available content width
 * - Zero scrolling layout
 */
const GuarantorReferralSection = ({
  loanAmount = 0,
  relationshipOption = "none", // "none" | "both" | "guarantor" | "referral"
  onOptionChange,
  guarantorData = {},
  onGuarantorChange,
  onGuarantorClear,
  referralData = {},
  onReferralChange,
  onReferralClear,
}) => {
  // Sub-step state for sequential "both" workflow: "guarantor" -> "referral"
  const [bothSubStep, setBothSubStep] = useState("guarantor");

  // Keep bothSubStep in sync if relationshipOption changes
  useEffect(() => {
    if (relationshipOption === "both") {
      setBothSubStep("guarantor");
    }
  }, [relationshipOption]);

  return (
    <div className="space-y-2">
      {/* Compact Relationship Question & 4 Radios Selection Area */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 sm:px-3 sm:py-2">
        <span className="text-xs font-bold text-[#0F1E36] whitespace-nowrap">
          Does this loan have a guarantor or referral?
        </span>

        {/* 4 Compact Horizontal Radio Options */}
        <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
          {[
            { id: "both", label: "Both Guarantor and Referral" },
            { id: "guarantor", label: "Guarantor only" },
            { id: "referral", label: "Referral only" },
            { id: "none", label: "No Guarantor or Referral" },
          ].map((opt) => {
            const isSelected = relationshipOption === opt.id;
            return (
              <label
                key={opt.id}
                className={`flex items-center gap-1.5 rounded border px-2 py-0.5 sm:px-2.5 sm:py-1 text-xs font-semibold cursor-pointer transition-all ${
                  isSelected
                    ? "bg-white border-[#006052] text-[#006052] shadow-2xs ring-1 ring-[#006052]/30"
                    : "bg-white/70 border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="loanRelationshipOption"
                  value={opt.id}
                  checked={isSelected}
                  onChange={() => onOptionChange(opt.id)}
                  className="h-3 w-3 accent-[#006052] text-[#006052] focus:ring-[#006052]"
                />
                <span className="leading-tight text-[11px] sm:text-xs">{opt.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* When Both is selected: relationship navigation controls at the top of the section */}
      {relationshipOption === "both" && (
        <div className="flex items-center gap-2 px-1">
          <span className="text-xs font-semibold text-slate-500">Active Form:</span>
          <div className="inline-flex rounded-md border border-slate-200 bg-slate-100 p-0.5">
            <button
              type="button"
              onClick={() => setBothSubStep("guarantor")}
              className={`px-3 py-1 text-xs font-bold rounded transition cursor-pointer ${
                bothSubStep === "guarantor"
                  ? "bg-[#006052] text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              1. Guarantor
            </button>
            <button
              type="button"
              onClick={() => setBothSubStep("referral")}
              className={`px-3 py-1 text-xs font-bold rounded transition cursor-pointer ${
                bothSubStep === "referral"
                  ? "bg-[#0F1E36] text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              2. Referral
            </button>
          </div>
        </div>
      )}

      {/* Dynamic Relationship Forms Area - Only ONE form visible at a time */}
      <div>
        {/* Option: None -> Compact Single-Row Message */}
        {relationshipOption === "none" && (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-[#F8FAFC] px-3.5 py-2.5 text-xs text-slate-600">
            <UserX className="h-4 w-4 text-slate-400 shrink-0" />
            <span>No guarantor or referral details are required for this loan.</span>
          </div>
        )}

        {/* Option: Both -> Sequential forms switched via top controls */}
        {relationshipOption === "both" && (
          <>
            {bothSubStep === "guarantor" ? (
              <ContactPersonForm
                type="guarantor"
                badgeLabel="Guarantor"
                data={guarantorData}
                onChange={onGuarantorChange}
                onClear={onGuarantorClear}
                isBoth={true}
                loanAmount={loanAmount}
              />
            ) : (
              <ContactPersonForm
                type="referral"
                badgeLabel="Referral"
                data={referralData}
                onChange={onReferralChange}
                onClear={onReferralClear}
                isBoth={true}
                loanAmount={loanAmount}
              />
            )}
          </>
        )}

        {/* Option: Guarantor only -> Single Form Full Width */}
        {relationshipOption === "guarantor" && (
          <ContactPersonForm
            type="guarantor"
            badgeLabel="Guarantor"
            data={guarantorData}
            onChange={onGuarantorChange}
            onClear={onGuarantorClear}
            isBoth={false}
            loanAmount={loanAmount}
          />
        )}

        {/* Option: Referral only -> Single Form Full Width */}
        {relationshipOption === "referral" && (
          <ContactPersonForm
            type="referral"
            badgeLabel="Referral"
            data={referralData}
            onChange={onReferralChange}
            onClear={onReferralClear}
            isBoth={false}
            loanAmount={loanAmount}
          />
        )}
      </div>
    </div>
  );
};

export default GuarantorReferralSection;
