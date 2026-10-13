import React, { useState, useEffect, useMemo } from "react";
import {
  Plus,
  X,
  UserCheck,
  FileText,
  Trash2,
  Upload,
  CheckCircle2,
  AlertCircle,
  Phone,
  MapPin,
  Shield,
  Search,
  Eye,
  Download,
  Calendar,
  Users,
  ShieldCheck,
  Coins,
} from "lucide-react";

import {
  STORAGE_KEY,
  UPDATE_EVENT_NAME,
  generateNextGuarantorId,
  getGuarantorReferralRecords,
  saveGuarantorReferralRecords,
  getRecordRelationships,
  getRecordCommissions,
  addReferralCommission,
} from "../../utils/guarantorReferralStorage";

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

// Helper: Format Aadhaar as XXXX XXXX XXXX
const formatAadhaarDisplay = (val) => {
  if (!val) return "—";
  const clean = String(val).replace(/\D/g, "");
  return clean.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
};

// Helper: Format Added Date as DD MMM YYYY
const formatAddedDate = (dateString) => {
  if (!dateString) return "—";
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return String(dateString);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

// Summary KPI Card matching MotoLend UI
const SummaryCard = ({ icon: Icon, title, value }) => {
  return (
    <div className="min-h-[96px] h-full rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs transition-shadow hover:shadow-md min-w-0 w-full">
      <div className="flex h-full items-center gap-3.5 sm:gap-4 min-w-0">
        <div className="flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
          <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-700" strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm font-medium text-slate-500 mb-0.5 sm:mb-1 leading-snug break-words">
            {title}
          </p>
          <p className="text-base sm:text-lg lg:text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap leading-tight">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
};

const GuarantorReferral = () => {
  // Page state
  const [records, setRecords] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRecord, setSelectedRecord] = useState(null); // For Details view
  const [previewDoc, setPreviewDoc] = useState(null); // For Document viewer

  // Real relationship data for the currently selected record
  const selectedRecordRelationships = useMemo(
    () => getRecordRelationships(selectedRecord),
    [selectedRecord, records]
  );

  // Commissions for the selected record
  const selectedRecordCommissions = useMemo(
    () => (selectedRecord ? getRecordCommissions(selectedRecord) : []),
    [selectedRecord, records]
  );

  // Determine if the selected record is a Referral (pure guarantors should not see commission section or add button)
  const isReferralRecord = useMemo(() => {
    if (!selectedRecord) return false;
    const rels = selectedRecordRelationships || [];
    const hasReferralRel = rels.some((r) => r.type === "Referral");
    const hasCommissions = selectedRecordCommissions.length > 0;
    const isGuarantorOnly = rels.length > 0 && rels.every((r) => r.type === "Guarantor") && !hasCommissions;
    if (isGuarantorOnly) return false;
    return hasReferralRel || hasCommissions || rels.length === 0;
  }, [selectedRecord, selectedRecordRelationships, selectedRecordCommissions]);

  // Modal states for Add Commission
  const [isAddCommissionModalOpen, setIsAddCommissionModalOpen] = useState(false);
  const [commissionFormData, setCommissionFormData] = useState({
    selectedLoanKey: "",
    loanId: "",
    customerId: "",
    customerName: "",
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const [commissionErrors, setCommissionErrors] = useState({});
  const [isSavingCommission, setIsSavingCommission] = useState(false);

  // Eligible loans for this referral person
  const commissionEligibleLoans = useMemo(() => {
    if (!selectedRecord) return [];
    const rels = selectedRecordRelationships || [];
    const loans = [];
    rels.forEach((rel) => {
      if (rel.loanId && rel.loanId !== "—") {
        loans.push({
          key: `${rel.loanId}-${rel.customerId}`,
          loanId: rel.loanId,
          customerId: rel.customerId || "—",
          customerName: rel.customerName || "Customer",
          label: `${rel.loanId} — ${rel.customerName || "Customer"} (${rel.customerId || "—"})`,
        });
      }
    });
    return loans;
  }, [selectedRecord, selectedRecordRelationships]);

  const handleOpenAddCommission = (record) => {
    const rels = getRecordRelationships(record) || [];
    const defaultLoan = rels.find((r) => r.loanId && r.loanId !== "—");
    setCommissionFormData({
      selectedLoanKey: defaultLoan ? `${defaultLoan.loanId}-${defaultLoan.customerId}` : "__custom__",
      loanId: defaultLoan?.loanId || "",
      customerId: defaultLoan?.customerId || "",
      customerName: defaultLoan?.customerName || "",
      amount: "",
      date: new Date().toISOString().slice(0, 10),
      notes: "",
    });
    setCommissionErrors({});
    setIsAddCommissionModalOpen(true);
  };

  const handleCommissionLoanSelect = (key) => {
    if (key === "__custom__") {
      setCommissionFormData((prev) => ({
        ...prev,
        selectedLoanKey: "__custom__",
        loanId: "",
        customerId: "",
        customerName: "",
      }));
    } else {
      const found = commissionEligibleLoans.find((item) => item.key === key);
      if (found) {
        setCommissionFormData((prev) => ({
          ...prev,
          selectedLoanKey: key,
          loanId: found.loanId,
          customerId: found.customerId,
          customerName: found.customerName,
        }));
      }
    }
  };

  const handleSaveCommissionSubmit = (e) => {
    e.preventDefault();
    if (isSavingCommission) return;

    const num = Number(commissionFormData.amount);
    if (isNaN(num) || num <= 0) {
      setCommissionErrors({ amount: "Please enter a valid positive commission amount (₹)." });
      return;
    }

    setIsSavingCommission(true);
    try {
      addReferralCommission({
        personId: selectedRecord.id,
        referralName: selectedRecord.fullName,
        referralPhone: selectedRecord.phone,
        customerId: commissionFormData.customerId || "—",
        customerName: commissionFormData.customerName || "Customer",
        loanId: commissionFormData.loanId || "—",
        amount: num,
        date: commissionFormData.date,
        notes: commissionFormData.notes,
      });

      // Reload records to refresh state across components
      loadRecords();
      const updated = getGuarantorReferralRecords();
      const refreshed = updated.find((r) => r.id === selectedRecord.id);
      if (refreshed) {
        setSelectedRecord(refreshed);
      }
      setIsAddCommissionModalOpen(false);
    } catch (err) {
      console.error("Failed to add referral commission:", err);
      alert("Failed to save commission. Please try again.");
    } finally {
      setIsSavingCommission(false);
    }
  };

  // Form states
  const [formData, setFormData] = useState({
    fullName: "",
    phone: "",
    address: "",
    area: "",
    landmark: "",
    pincode: "",
    aadhaarNumber: "",
  });

  const [aadhaarFile, setAadhaarFile] = useState(null);
  const [additionalDocs, setAdditionalDocs] = useState([]);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load records from shared storage
  const loadRecords = () => {
    try {
      const stored = getGuarantorReferralRecords();
      setRecords(stored);
    } catch (err) {
      console.error("Failed to load guarantor/referral records:", err);
      setRecords([]);
    }
  };

  useEffect(() => {
    loadRecords();
    window.addEventListener("storage", loadRecords);
    window.addEventListener(UPDATE_EVENT_NAME, loadRecords);
    return () => {
      window.removeEventListener("storage", loadRecords);
      window.removeEventListener(UPDATE_EVENT_NAME, loadRecords);
    };
  }, []);

  // Prevent background page scrolling when modal is open
  useEffect(() => {
    if (isModalOpen || selectedRecord || previewDoc || isAddCommissionModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isModalOpen, selectedRecord, previewDoc, isAddCommissionModalOpen]);

  // Reset form
  const resetForm = () => {
    setFormData({
      fullName: "",
      phone: "",
      address: "",
      area: "",
      landmark: "",
      pincode: "",
      aadhaarNumber: "",
    });
    setAadhaarFile(null);
    setAdditionalDocs([]);
    setErrors({});
    setIsSubmitting(false);
  };

  // Close modal
  const handleCloseModal = () => {
    resetForm();
    setIsModalOpen(false);
  };

  // Field change handler
  const handleInputChange = (field, value) => {
    let sanitized = value;
    if (field === "phone" || field === "pincode") {
      sanitized = value.replace(/\D/g, "");
    } else if (field === "aadhaarNumber") {
      sanitized = value.replace(/\D/g, "").slice(0, 12);
    }

    setFormData((prev) => ({ ...prev, [field]: sanitized }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  // Aadhaar file upload
  const handleAadhaarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const base64 = await fileToBase64(file);
        setAadhaarFile(base64);
        if (errors.aadhaarFile) {
          setErrors((prev) => ({ ...prev, aadhaarFile: null }));
        }
      } catch (err) {
        console.error("Error reading file", err);
      }
    }
  };

  // Add additional doc upload field
  const handleAddAdditionalDoc = () => {
    setAdditionalDocs((prev) => [
      ...prev,
      {
        id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        title: "",
        file: null,
      },
    ]);
  };

  // Remove additional doc field
  const handleRemoveAdditionalDoc = (id) => {
    setAdditionalDocs((prev) => prev.filter((d) => d.id !== id));
  };

  // Update additional doc title
  const handleAdditionalDocTitleChange = (id, title) => {
    setAdditionalDocs((prev) =>
      prev.map((d) => (d.id === id ? { ...d, title } : d))
    );
  };

  // Update additional doc file
  const handleAdditionalDocFileChange = async (id, file) => {
    if (!file) return;
    try {
      const base64 = await fileToBase64(file);
      setAdditionalDocs((prev) =>
        prev.map((d) =>
          d.id === id
            ? {
                ...d,
                file: base64,
                title: d.title || file.name.replace(/\.[^/.]+$/, ""),
              }
            : d
        )
      );
    } catch (err) {
      console.error("Error converting additional doc", err);
    }
  };

  // Form Validation
  const validateForm = () => {
    const newErrors = {};

    if (!formData.fullName.trim()) {
      newErrors.fullName = "Full name is required";
    }

    const cleanPhone = formData.phone.trim();
    if (!cleanPhone) {
      newErrors.phone = "Phone number is required";
    } else if (cleanPhone.length !== 10) {
      newErrors.phone = "Please enter a valid 10-digit phone number";
    }

    if (!formData.address.trim()) {
      newErrors.address = "Address is required";
    }

    if (!formData.area.trim()) {
      newErrors.area = "Area is required";
    }

    if (!formData.landmark.trim()) {
      newErrors.landmark = "Landmark is required";
    }

    const cleanPincode = formData.pincode.trim();
    if (!cleanPincode) {
      newErrors.pincode = "Pincode is required";
    } else if (cleanPincode.length !== 6) {
      newErrors.pincode = "Please enter a valid 6-digit pincode";
    }

    const cleanAadhaar = formData.aadhaarNumber.trim();
    if (!cleanAadhaar) {
      newErrors.aadhaarNumber = "Aadhaar number is required";
    } else if (cleanAadhaar.length !== 12) {
      newErrors.aadhaarNumber = "Aadhaar number must be exactly 12 digits";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Form submission
  const handleSubmit = (e) => {
    e.preventDefault();

    // Prevent duplicate submissions caused by repeated clicks
    if (isSubmitting) return;

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const currentStored = getGuarantorReferralRecords();
      const nextId = generateNextGuarantorId(currentStored);

      const newRecord = {
        id: nextId,
        fullName: formData.fullName.trim(),
        phone: formData.phone.trim(),
        address: formData.address.trim(),
        area: formData.area.trim(),
        landmark: formData.landmark.trim(),
        pincode: formData.pincode.trim(),
        aadhaarNumber: formData.aadhaarNumber.trim(),
        aadhaarFile: aadhaarFile,
        additionalDocs: additionalDocs
          .filter((d) => d.file)
          .map((d) => ({
            id: d.id,
            title: d.title || "Document",
            file: d.file,
          })),
        relationships: [],
        createdAt: new Date().toISOString(),
      };

      // Persist to shared storage
      const updated = [newRecord, ...currentStored];
      saveGuarantorReferralRecords(updated);

      // Immediately update local state without requiring manual page refresh
      setRecords(updated);

      // Reset and close modal
      resetForm();
      setIsModalOpen(false);
    } catch (err) {
      console.error("Failed to save guarantor/referral record:", err);
      alert("Failed to save record. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter records by search query
  const filteredRecords = useMemo(() => {
    if (!searchQuery.trim()) return records;
    const q = searchQuery.toLowerCase().trim();
    return records.filter((r) => {
      return (
        r.id?.toLowerCase().includes(q) ||
        r.fullName?.toLowerCase().includes(q) ||
        r.phone?.includes(q) ||
        r.address?.toLowerCase().includes(q) ||
        r.area?.toLowerCase().includes(q) ||
        r.aadhaarNumber?.includes(q)
      );
    });
  }, [records, searchQuery]);

  // KPI Calculations
  const totalRecordsCount = records.length;
  const verifiedAadhaarCount = records.filter((r) => r.aadhaarNumber && r.aadhaarNumber.length === 12).length;
  const documentsCount = records.reduce(
    (sum, r) => sum + (r.aadhaarFile ? 1 : 0) + (r.additionalDocs?.length || 0),
    0
  );

  return (
    <div className="min-h-screen bg-white px-3 pb-8 pt-2 sm:px-6 lg:px-8">
      {/* =========================================================
          PAGE HEADER
      ========================================================= */}
      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold leading-none tracking-tight text-[#06483f] sm:text-[32px]">
            Guarantor / Referral
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-slate-500 font-medium">
            Manage and view all guarantor and referral records in one shared directory.
          </p>
        </div>

        {/* Top-Right Rectangular Green + Add Button */}
        <button
          type="button"
          onClick={() => {
            resetForm();
            setIsModalOpen(true);
          }}
          className="inline-flex items-center justify-center gap-1.5 self-start rounded-lg bg-[#006052] px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-[#004d42] active:bg-[#003d34] transition-colors focus:outline-none focus:ring-2 focus:ring-[#006052] focus:ring-offset-1 cursor-pointer sm:self-auto shrink-0"
        >
          <Plus className="h-4 w-4" strokeWidth={2.2} />
          <span>Add</span>
        </button>
      </div>

      {/* =========================================================
          KPI SUMMARY CARDS
      ========================================================= */}
      <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4 lg:mt-8">
        <SummaryCard
          icon={Users}
          title="Total Records"
          value={totalRecordsCount.toLocaleString("en-IN")}
        />
        <SummaryCard
          icon={ShieldCheck}
          title="Verified Aadhaar"
          value={verifiedAadhaarCount.toLocaleString("en-IN")}
        />
        <SummaryCard
          icon={FileText}
          title="Attached Documents"
          value={documentsCount.toLocaleString("en-IN")}
        />
      </div>

      {/* =========================================================
          RECORDS TABLE SECTION
      ========================================================= */}
      <div className="mt-6 rounded-md border border-slate-200 bg-white p-4">
        {/* Search & Filter Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ID, name, mobile, address..."
              className="h-10 w-full rounded-lg border border-slate-200 bg-[#F8FAFC] pl-10 pr-4 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#006052] focus:ring-2 focus:ring-[#006052]/20 outline-none transition-all"
            />
          </div>

          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            {filteredRecords.length === 1
              ? "Showing 1 record"
              : `Showing ${filteredRecords.length} records`}
          </p>
        </div>

        {/* Empty State */}
        {records.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-10 sm:p-14 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-[#006052] mb-3.5 shadow-2xs border border-emerald-100">
              <UserCheck className="h-7 w-7" strokeWidth={2} />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900">
              No Guarantor / Referral Records Yet
            </h3>
            <p className="mt-1 max-w-md text-xs sm:text-sm text-slate-500 leading-relaxed">
              Fill in the form by clicking the green <strong className="text-slate-700">+ Add</strong> button at the top-right to register your first record.
            </p>
            <button
              type="button"
              onClick={() => {
                resetForm();
                setIsModalOpen(true);
              }}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#006052] px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-[#004d42] transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Add Guarantor / Referral</span>
            </button>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-8 text-center text-sm text-slate-500">
            No records match "{searchQuery}".
          </div>
        ) : (
          /* Table of records with exact columns: ID, Name, Mobile, Address, Added Date, Actions */
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[760px] table-fixed border-collapse">
              <colgroup>
                <col style={{ width: "14%" }} />
                <col style={{ width: "22%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "26%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "10%" }} />
              </colgroup>

              <thead>
                <tr className="h-[48px] bg-[#0F1E36] text-white">
                  <th className="px-3.5 text-left text-xs font-semibold uppercase tracking-wider">ID</th>
                  <th className="px-3.5 text-left text-xs font-semibold uppercase tracking-wider">Name</th>
                  <th className="px-3.5 text-left text-xs font-semibold uppercase tracking-wider">Mobile</th>
                  <th className="px-3.5 text-left text-xs font-semibold uppercase tracking-wider">Address</th>
                  <th className="px-3.5 text-left text-xs font-semibold uppercase tracking-wider">Added Date</th>
                  <th className="px-3.5 text-center text-xs font-semibold uppercase tracking-wider">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredRecords.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-slate-100 bg-white hover:bg-slate-50/70 transition-colors"
                  >
                    {/* ID */}
                    <td className="px-3.5 py-3.5 text-[13px] font-mono font-bold text-[#006052]">
                      {item.id}
                    </td>

                    {/* Name */}
                    <td className="px-3.5 py-3.5 text-[13px] font-bold text-slate-900 truncate">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[#006052] font-semibold text-xs border border-emerald-100">
                          {item.fullName ? item.fullName.charAt(0).toUpperCase() : "G"}
                        </div>
                        <span className="truncate">{item.fullName}</span>
                      </div>
                    </td>

                    {/* Mobile */}
                    <td className="px-3.5 py-3.5 text-[13px] font-medium text-slate-700 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span>+91 {item.phone}</span>
                      </div>
                    </td>

                    {/* Address */}
                    <td className="px-3.5 py-3.5 text-[13px] text-slate-700">
                      <p className="line-clamp-2 leading-snug">
                        {item.address}
                        {item.area ? `, ${item.area}` : ""}
                        {item.pincode ? ` - ${item.pincode}` : ""}
                      </p>
                    </td>

                    {/* Added Date */}
                    <td className="px-3.5 py-3.5 text-[13px] text-slate-600 whitespace-nowrap">
                      {formatAddedDate(item.createdAt)}
                    </td>

                    {/* Actions */}
                    <td className="px-3.5 py-3.5 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setSelectedRecord(item)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-2xs cursor-pointer"
                        title="View Full Record Details"
                      >
                        <Eye className="h-3.5 w-3.5 text-[#006052]" />
                        <span>View</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* =========================================================
          ADD GUARANTOR / REFERRAL MODAL FORM
          (Deep Navy Blue & White Theme with Subtle Green Accents)
      ========================================================= */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseModal();
          }}
        >
          <div
            className="relative w-full max-w-xl sm:max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto border border-slate-200/80 animate-in zoom-in-95 duration-200"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-headline"
          >
            {/* Modal Header: Deep Navy Blue */}
            <div className="bg-[#0F1E36] px-5 py-4 sm:px-6 sm:py-4.5 text-white flex items-center justify-between shrink-0 border-b border-navy-900">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-white/10 flex items-center justify-center text-white shrink-0 border border-white/10">
                  <UserCheck className="h-5 w-5" />
                </div>
                <div>
                  <h2
                    id="modal-headline"
                    className="text-base sm:text-lg font-bold text-white tracking-tight leading-tight"
                  >
                    Add Guarantor / Referral
                  </h2>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Enter guarantor details and upload identification documents
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCloseModal}
                className="rounded-lg p-1.5 text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body: White with Soft Navy & Green Accents */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 bg-white">
              {/* Section 1: Personal Details */}
              <div>
                <div className="flex items-center gap-2 mb-3.5 pb-1 border-b border-slate-100">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#0F1E36]">
                    1. Personal Information
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Full Name */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.fullName}
                      onChange={(e) => handleInputChange("fullName", e.target.value)}
                      placeholder="Enter full legal name"
                      className={`h-11 w-full rounded-lg border bg-[#F8FAFC] px-3.5 text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#006052] focus:ring-2 focus:ring-[#006052]/20 outline-none transition-all ${
                        errors.fullName ? "border-red-400 focus:border-red-500 focus:ring-red-100" : "border-slate-200"
                      }`}
                    />
                    {errors.fullName && (
                      <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        {errors.fullName}
                      </p>
                    )}
                  </div>

                  {/* Phone Number */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Phone Number <span className="text-red-500">*</span>
                    </label>
                    <div className="relative flex items-center">
                      <span className="inline-flex h-11 items-center px-3 rounded-l-lg border border-r-0 border-slate-200 bg-slate-100 text-xs font-semibold text-slate-600 select-none">
                        +91
                      </span>
                      <input
                        type="tel"
                        maxLength={10}
                        value={formData.phone}
                        onChange={(e) => handleInputChange("phone", e.target.value)}
                        placeholder="10-digit mobile number"
                        className={`h-11 w-full rounded-r-lg border bg-[#F8FAFC] px-3.5 text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#006052] focus:ring-2 focus:ring-[#006052]/20 outline-none transition-all ${
                          errors.phone ? "border-red-400 focus:border-red-500 focus:ring-red-100" : "border-slate-200"
                        }`}
                      />
                    </div>
                    {errors.phone && (
                      <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        {errors.phone}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Section 2: Address Information */}
              <div>
                <div className="flex items-center gap-2 mb-3.5 pb-1 border-b border-slate-100">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#0F1E36]">
                    2. Address Information
                  </span>
                </div>

                <div className="space-y-4">
                  {/* Address (Multiline input) */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Address <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={2}
                      value={formData.address}
                      onChange={(e) => handleInputChange("address", e.target.value)}
                      placeholder="Door / Flat No., Building, Street Name"
                      className={`w-full rounded-lg border bg-[#F8FAFC] p-3 text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#006052] focus:ring-2 focus:ring-[#006052]/20 outline-none transition-all resize-none ${
                        errors.address ? "border-red-400 focus:border-red-500 focus:ring-red-100" : "border-slate-200"
                      }`}
                    />
                    {errors.address && (
                      <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        {errors.address}
                      </p>
                    )}
                  </div>

                  {/* Area, Landmark, Pincode */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Area */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Area <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.area}
                        onChange={(e) => handleInputChange("area", e.target.value)}
                        placeholder="e.g. T. Nagar"
                        className={`h-11 w-full rounded-lg border bg-[#F8FAFC] px-3.5 text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#006052] focus:ring-2 focus:ring-[#006052]/20 outline-none transition-all ${
                          errors.area ? "border-red-400 focus:border-red-500 focus:ring-red-100" : "border-slate-200"
                        }`}
                      />
                      {errors.area && (
                        <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3 shrink-0" />
                          {errors.area}
                        </p>
                      )}
                    </div>

                    {/* Landmark */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Landmark <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.landmark}
                        onChange={(e) => handleInputChange("landmark", e.target.value)}
                        placeholder="e.g. Near Bus Depot"
                        className={`h-11 w-full rounded-lg border bg-[#F8FAFC] px-3.5 text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#006052] focus:ring-2 focus:ring-[#006052]/20 outline-none transition-all ${
                          errors.landmark ? "border-red-400 focus:border-red-500 focus:ring-red-100" : "border-slate-200"
                        }`}
                      />
                      {errors.landmark && (
                        <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3 shrink-0" />
                          {errors.landmark}
                        </p>
                      )}
                    </div>

                    {/* Pincode */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Pincode <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        value={formData.pincode}
                        onChange={(e) => handleInputChange("pincode", e.target.value)}
                        placeholder="6 digits (e.g. 600017)"
                        className={`h-11 w-full rounded-lg border bg-[#F8FAFC] px-3.5 text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#006052] focus:ring-2 focus:ring-[#006052]/20 outline-none transition-all font-mono ${
                          errors.pincode ? "border-red-400 focus:border-red-500 focus:ring-red-100" : "border-slate-200"
                        }`}
                      />
                      {errors.pincode && (
                        <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3 shrink-0" />
                          {errors.pincode}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 3: Identity & Documents */}
              <div>
                <div className="flex items-center gap-2 mb-3.5 pb-1 border-b border-slate-100">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#0F1E36]">
                    3. Identity Verification
                  </span>
                </div>

                <div className="space-y-4">
                  {/* Aadhaar Number */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Aadhaar Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      maxLength={12}
                      value={formData.aadhaarNumber}
                      onChange={(e) => handleInputChange("aadhaarNumber", e.target.value)}
                      placeholder="12-digit Aadhaar number"
                      className={`h-11 w-full rounded-lg border bg-[#F8FAFC] px-3.5 text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#006052] focus:ring-2 focus:ring-[#006052]/20 outline-none transition-all font-mono tracking-wider ${
                        errors.aadhaarNumber ? "border-red-400 focus:border-red-500 focus:ring-red-100" : "border-slate-200"
                      }`}
                    />
                    {errors.aadhaarNumber && (
                      <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        {errors.aadhaarNumber}
                      </p>
                    )}
                  </div>

                  {/* Aadhaar Document Upload + Dynamic Document Upload Header */}
                  <div className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-[#006052]" />
                        <label className="text-xs font-bold uppercase tracking-wider text-[#0F1E36]">
                          Aadhaar Document Upload
                        </label>
                      </div>

                      {/* Small + Icon Button with MotoLend Green Accent */}
                      <button
                        type="button"
                        onClick={handleAddAdditionalDoc}
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-[#006052] transition hover:bg-emerald-100 hover:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-[#006052]/30 cursor-pointer shadow-2xs"
                        title="Add another document upload"
                      >
                        <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                        <span>Add Document</span>
                      </button>
                    </div>

                    {/* Aadhaar File Upload Control */}
                    <div className="relative">
                      {aadhaarFile ? (
                        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-9 w-9 rounded-lg bg-emerald-100 text-[#006052] flex items-center justify-center shrink-0">
                              <FileText className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                                {aadhaarFile.name}
                              </p>
                              <p className="text-[11px] text-slate-500">{aadhaarFile.size}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setAadhaarFile(null)}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-md transition-colors cursor-pointer"
                            title="Remove file"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-white p-4 text-center cursor-pointer hover:border-[#006052] hover:bg-emerald-50/30 transition-all">
                          <Upload className="h-6 w-6 text-slate-400 mb-1" />
                          <span className="text-xs font-semibold text-[#006052]">
                            Click to upload Aadhaar card
                          </span>
                          <span className="text-[11px] text-slate-400 mt-0.5">
                            Supports PDF, JPG, PNG (Max 5MB)
                          </span>
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            onChange={handleAadhaarUpload}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>

                    {/* =========================================================
                        ADDITIONAL DYNAMIC DOCUMENT UPLOADS
                    ========================================================= */}
                    {additionalDocs.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-slate-200/80 space-y-3">
                        <p className="text-xs font-bold text-[#0F1E36] uppercase tracking-wider">
                          Additional Documents ({additionalDocs.length})
                        </p>

                        {additionalDocs.map((doc, idx) => (
                          <div
                            key={doc.id}
                            className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs space-y-2.5 transition-all"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <input
                                type="text"
                                value={doc.title}
                                onChange={(e) => handleAdditionalDocTitleChange(doc.id, e.target.value)}
                                placeholder={`Document Title #${idx + 1} (e.g. PAN, Voter ID, Salary Slip)`}
                                className="h-8 flex-1 rounded-md border border-slate-200 bg-[#F8FAFC] px-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#006052] focus:ring-1 focus:ring-[#006052]/30 outline-none"
                              />

                              <button
                                type="button"
                                onClick={() => handleRemoveAdditionalDoc(doc.id)}
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors cursor-pointer shrink-0"
                                title="Remove document field"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Remove</span>
                              </button>
                            </div>

                            {/* File Selector for this dynamic document */}
                            {doc.file ? (
                              <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                                <div className="flex items-center gap-2 truncate">
                                  <FileText className="h-4 w-4 text-[#006052] shrink-0" />
                                  <span className="font-semibold text-slate-800 truncate">
                                    {doc.file.name}
                                  </span>
                                  <span className="text-slate-400 shrink-0">({doc.file.size})</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setAdditionalDocs((prev) =>
                                      prev.map((d) => (d.id === doc.id ? { ...d, file: null } : d))
                                    )
                                  }
                                  className="text-slate-400 hover:text-red-600 ml-2 cursor-pointer"
                                  title="Change file"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <label className="flex items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-white py-2 px-3 text-xs text-slate-600 hover:border-[#006052] hover:text-[#006052] cursor-pointer transition-colors">
                                <Upload className="h-3.5 w-3.5" />
                                <span>Choose Document File</span>
                                <input
                                  type="file"
                                  accept="image/*,.pdf"
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handleAdditionalDocFileChange(doc.id, f);
                                  }}
                                  className="hidden"
                                />
                              </label>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </form>

            {/* Modal Footer: Action Buttons */}
            <div className="border-t border-slate-100 px-5 py-3.5 sm:px-6 sm:py-4 bg-slate-50/80 flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isSubmitting}
                className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#0F1E36] px-6 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-[#0A1629] active:bg-[#070F1C] transition-colors focus:outline-none focus:ring-2 focus:ring-[#0F1E36] focus:ring-offset-1 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span>{isSubmitting ? "Saving..." : "Save"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          VIEW RECORD DETAILS MODAL (Preserves all submitted details)
      ========================================================= */}
      {selectedRecord && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedRecord(null);
          }}
        >
          <div
            className="relative w-full max-w-xl sm:max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto border border-slate-200/80 animate-in zoom-in-95 duration-200"
            role="dialog"
            aria-modal="true"
          >
            {/* Header: Deep Navy */}
            <div className="bg-[#0F1E36] px-5 py-4 sm:px-6 sm:py-4.5 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-white/10 flex items-center justify-center text-white shrink-0 border border-white/10">
                  <UserCheck className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                      {selectedRecord.fullName}
                    </h2>
                    <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] font-mono font-bold text-emerald-300 border border-emerald-400/30">
                      {selectedRecord.id}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Added on {formatAddedDate(selectedRecord.createdAt)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="rounded-lg p-1.5 text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content: Relationship Details */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 bg-white">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F1E36]">
                    Relationship Details
                  </h3>
                  {selectedRecordRelationships.length > 0 && (
                    <span className="text-xs font-semibold text-slate-500">
                      {selectedRecordRelationships.length} Associated Link{selectedRecordRelationships.length > 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                {selectedRecordRelationships.length > 0 ? (
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
                    <table className="w-full text-left text-xs sm:text-sm">
                      <thead className="bg-[#0F1E36] text-white">
                        <tr>
                          <th className="px-3.5 py-2.5 font-semibold uppercase tracking-wider text-[11px]">
                            Relationship Type
                          </th>
                          <th className="px-3.5 py-2.5 font-semibold uppercase tracking-wider text-[11px]">
                            Customer ID
                          </th>
                          <th className="px-3.5 py-2.5 font-semibold uppercase tracking-wider text-[11px]">
                            Customer Name
                          </th>
                          <th className="px-3.5 py-2.5 font-semibold uppercase tracking-wider text-[11px]">
                            Loan ID
                          </th>
                          <th className="px-3.5 py-2.5 font-semibold uppercase tracking-wider text-[11px]">
                            Associated Date
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedRecordRelationships.map((rel, idx) => (
                          <tr key={rel.id || idx} className="hover:bg-slate-50/70 transition-colors">
                            <td className="px-3.5 py-3 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border ${
                                  rel.type === "Guarantor"
                                    ? "bg-emerald-50 text-[#006052] border-emerald-200"
                                    : "bg-blue-50 text-[#0F1E36] border-blue-200"
                                }`}
                              >
                                <span>{rel.type} for</span>
                                <strong className="font-bold">{rel.customerName || "Customer"}</strong>
                              </span>
                            </td>
                            <td className="px-3.5 py-3 font-mono font-bold text-[#006052] whitespace-nowrap">
                              {rel.customerId || "—"}
                            </td>
                            <td className="px-3.5 py-3 font-semibold text-slate-900">
                              {rel.customerName || "—"}
                            </td>
                            <td className="px-3.5 py-3 font-mono text-slate-700 whitespace-nowrap">
                              {rel.loanId || "—"}
                            </td>
                            <td className="px-3.5 py-3 text-slate-500 whitespace-nowrap">
                              {formatAddedDate(rel.associatedDate)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  /* Professional Empty State */
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-[#F8FAFC] p-8 sm:p-12 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 mb-3 border border-slate-200">
                      <Users className="h-6 w-6" strokeWidth={1.8} />
                    </div>
                    <h4 className="text-base font-bold text-slate-900">
                      No Relationships Recorded
                    </h4>
                    <p className="mt-1.5 max-w-sm text-xs sm:text-sm text-slate-500 leading-relaxed italic">
                      This person has not yet been linked to any customer or loan.
                    </p>
                  </div>
                )}
              </div>

              {/* Section: Referral Commission (Displayed for Referrals only; not shown for Guarantors) */}
              {isReferralRecord && (
                <div className="pt-4 border-t border-slate-100 space-y-3">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Coins className="h-4 w-4 text-[#006052]" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F1E36]">
                        Referral Commission History
                      </h3>
                      {selectedRecordCommissions.length > 0 && (
                        <span className="rounded bg-emerald-50 text-[#006052] border border-emerald-200 px-2 py-0.5 text-[11px] font-bold">
                          Total: ₹{selectedRecordCommissions.reduce((sum, c) => sum + Number(c.amount || 0), 0).toLocaleString("en-IN")}
                        </span>
                      )}
                    </div>

                    {/* + Add Commission Button - Referral View ONLY */}
                    <button
                      type="button"
                      onClick={() => handleOpenAddCommission(selectedRecord)}
                      className="inline-flex items-center gap-1 rounded-md bg-[#006052] px-2.5 py-1 text-xs font-bold text-white shadow-2xs hover:bg-[#004d42] active:bg-[#003d34] transition-colors cursor-pointer"
                      title="Add commission for this referral"
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                      <span>+ Add Commission</span>
                    </button>
                  </div>

                  {selectedRecordCommissions.length > 0 ? (
                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
                      <table className="w-full text-left text-xs sm:text-sm">
                        <thead className="bg-[#0F1E36] text-white">
                          <tr>
                            <th className="px-3.5 py-2.5 font-semibold uppercase tracking-wider text-[11px]">
                              Customer ID
                            </th>
                            <th className="px-3.5 py-2.5 font-semibold uppercase tracking-wider text-[11px]">
                              Customer Name
                            </th>
                            <th className="px-3.5 py-2.5 font-semibold uppercase tracking-wider text-[11px]">
                              Loan ID
                            </th>
                            <th className="px-3.5 py-2.5 font-semibold uppercase tracking-wider text-[11px] text-right">
                              Commission Amount
                            </th>
                            <th className="px-3.5 py-2.5 font-semibold uppercase tracking-wider text-[11px] text-center">
                              Status
                            </th>
                            <th className="px-3.5 py-2.5 font-semibold uppercase tracking-wider text-[11px] text-center">
                              Date
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {selectedRecordCommissions.map((comm, idx) => (
                            <tr key={comm.id || idx} className="hover:bg-slate-50/70 transition-colors">
                              <td className="px-3.5 py-3 font-mono font-bold text-[#006052] whitespace-nowrap">
                                {comm.customerId || "—"}
                              </td>
                              <td className="px-3.5 py-3 font-semibold text-slate-900">
                                {comm.customerName || "Customer"}
                              </td>
                              <td className="px-3.5 py-3 font-mono text-slate-700 whitespace-nowrap">
                                {comm.loanId || "—"}
                              </td>
                              <td className="px-3.5 py-3 font-bold text-emerald-800 text-right whitespace-nowrap">
                                ₹{Number(comm.amount || 0).toLocaleString("en-IN")}
                              </td>
                              <td className="px-3.5 py-3 text-center whitespace-nowrap">
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold border ${
                                    comm.status === "Paid"
                                      ? "bg-emerald-50 text-[#006052] border-emerald-200"
                                      : "bg-amber-50 text-amber-800 border border-amber-200"
                                  }`}
                                >
                                  {comm.status === "Paid" ? "● Paid" : "○ Pending"}
                                </span>
                              </td>
                              <td className="px-3.5 py-3 text-slate-500 text-center whitespace-nowrap">
                                {formatAddedDate(comm.date || comm.createdAt)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-[#F8FAFC] p-4 text-center">
                      <p className="text-xs font-medium text-slate-500 italic">
                        No referral commission recorded.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Section: Uploaded Documents */}
                <div className="pt-4 border-t border-slate-100 space-y-3">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F1E36] flex items-center gap-1.5">
                      <FileText className="h-4 w-4 text-[#006052]" />
                      <span>Uploaded Documents</span>
                    </h3>
                    <span className="text-xs font-semibold text-slate-500">
                      {(selectedRecord.aadhaarFile ? 1 : 0) + (selectedRecord.additionalDocs?.length || 0)} Document{((selectedRecord.aadhaarFile ? 1 : 0) + (selectedRecord.additionalDocs?.length || 0)) !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {selectedRecord.aadhaarFile || (selectedRecord.additionalDocs && selectedRecord.additionalDocs.length > 0) ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Aadhaar Document */}
                      {selectedRecord.aadhaarFile && (
                        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-[#F8FAFC] p-3 shadow-2xs hover:border-[#006052]/40 transition-colors">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-[#006052] border border-emerald-100">
                              <FileText className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                                Aadhaar Document
                              </p>
                              <p className="text-[11px] text-slate-400 truncate">
                                {selectedRecord.aadhaarFile.name || "Aadhaar Card"}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewDoc({
                                  title: `Aadhaar Document - ${selectedRecord.fullName}`,
                                  file: selectedRecord.aadhaarFile,
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-[#006052] transition-colors cursor-pointer shadow-2xs"
                              title="Preview Document"
                            >
                              <Eye className="h-3.5 w-3.5 text-[#006052]" />
                              <span>View</span>
                            </button>
                            {selectedRecord.aadhaarFile.data && (
                              <a
                                href={selectedRecord.aadhaarFile.data}
                                download={selectedRecord.aadhaarFile.name || "Aadhaar_Document"}
                                className="inline-flex items-center justify-center rounded-md bg-white border border-slate-200 p-1 text-slate-600 hover:text-[#006052] hover:bg-slate-50 hover:border-[#006052] transition-colors cursor-pointer shadow-2xs"
                                title="Download Document"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Additional Documents */}
                      {selectedRecord.additionalDocs?.map((doc, idx) => (
                        <div
                          key={doc.id || idx}
                          className="flex items-center justify-between rounded-xl border border-slate-200 bg-[#F8FAFC] p-3 shadow-2xs hover:border-[#006052]/40 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-[#006052] border border-emerald-100">
                              <FileText className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                                {doc.title || `Additional Document #${idx + 1}`}
                              </p>
                              <p className="text-[11px] text-slate-400 truncate">
                                {doc.file?.name || "Attached Document"}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            {doc.file && (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPreviewDoc({
                                      title: `${doc.title || "Document"} - ${selectedRecord.fullName}`,
                                      file: doc.file,
                                    })
                                  }
                                  className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-[#006052] transition-colors cursor-pointer shadow-2xs"
                                  title="Preview Document"
                                >
                                  <Eye className="h-3.5 w-3.5 text-[#006052]" />
                                  <span>View</span>
                                </button>
                                {doc.file.data && (
                                  <a
                                    href={doc.file.data}
                                    download={doc.file.name || `${doc.title || "document"}`}
                                    className="inline-flex items-center justify-center rounded-md bg-white border border-slate-200 p-1 text-slate-600 hover:text-[#006052] hover:bg-slate-50 hover:border-[#006052] transition-colors cursor-pointer shadow-2xs"
                                    title="Download Document"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                  </a>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-[#F8FAFC] p-4 text-center">
                      <p className="text-xs text-slate-400">No documents uploaded for this record.</p>
                    </div>
                  )}
                </div>
              </div>

            {/* Footer */}
            <div className="border-t border-slate-100 px-5 py-3.5 sm:px-6 sm:py-4 bg-slate-50 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="rounded-lg bg-[#0F1E36] px-5 py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-[#0A1629] transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          COMPACT ADD COMMISSION MODAL (Referral View Only)
      ========================================================= */}
      {isAddCommissionModalOpen && selectedRecord && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSavingCommission) {
              setIsAddCommissionModalOpen(false);
            }
          }}
        >
          <div
            className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-slate-200 animate-in zoom-in-95 duration-200"
            role="dialog"
            aria-modal="true"
          >
            {/* Compact Modal Header */}
            <div className="bg-[#0F1E36] px-5 py-3.5 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center border border-emerald-400/30">
                  <Coins className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight leading-tight">
                    + Add Referral Commission
                  </h3>
                  <p className="text-[11px] text-slate-300 truncate max-w-[260px]">
                    For: {selectedRecord.fullName} ({selectedRecord.id})
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isSavingCommission}
                onClick={() => setIsAddCommissionModalOpen(false)}
                className="rounded-lg p-1 text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveCommissionSubmit} className="p-5 space-y-3.5 bg-white">
              {/* Loan & Customer Context */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Related Loan / Customer Context <span className="text-red-500">*</span>
                </label>
                {commissionEligibleLoans.length > 0 ? (
                  <select
                    value={commissionFormData.selectedLoanKey}
                    onChange={(e) => handleCommissionLoanSelect(e.target.value)}
                    className="h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs sm:text-sm font-medium text-slate-800 focus:border-[#006052] focus:outline-none focus:ring-1 focus:ring-[#006052]/30"
                  >
                    {commissionEligibleLoans.map((item) => (
                      <option key={item.key} value={item.key}>
                        {item.label}
                      </option>
                    ))}
                    <option value="__custom__">Manual / Other Loan Entry...</option>
                  </select>
                ) : null}

                {/* If manual or no linked loans, show manual inputs */}
                {(commissionEligibleLoans.length === 0 || commissionFormData.selectedLoanKey === "__custom__") && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <input
                        type="text"
                        placeholder="Loan ID (e.g. LN00001)"
                        value={commissionFormData.loanId}
                        onChange={(e) =>
                          setCommissionFormData((prev) => ({ ...prev, loanId: e.target.value }))
                        }
                        className="h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-800 focus:border-[#006052] focus:outline-none"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Customer Name"
                        value={commissionFormData.customerName}
                        onChange={(e) =>
                          setCommissionFormData((prev) => ({ ...prev, customerName: e.target.value }))
                        }
                        className="h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-800 focus:border-[#006052] focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Commission Amount */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Commission Amount (₹) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">
                    ₹
                  </span>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    autoFocus
                    value={commissionFormData.amount}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCommissionFormData((prev) => ({ ...prev, amount: val }));
                      if (commissionErrors.amount) {
                        setCommissionErrors((prev) => ({ ...prev, amount: null }));
                      }
                    }}
                    placeholder="e.g. 1500"
                    className={`h-9 w-full rounded-md border bg-white pl-8 pr-3 text-xs sm:text-sm font-bold text-slate-900 focus:border-[#006052] focus:outline-none focus:ring-1 focus:ring-[#006052]/30 ${
                      commissionErrors.amount ? "border-red-400" : "border-slate-300"
                    }`}
                  />
                </div>
                {commissionErrors.amount && (
                  <p className="mt-1 text-[11px] text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    {commissionErrors.amount}
                  </p>
                )}
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Commission Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={commissionFormData.date}
                  onChange={(e) =>
                    setCommissionFormData((prev) => ({ ...prev, date: e.target.value }))
                  }
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs sm:text-sm text-slate-800 focus:border-[#006052] focus:outline-none focus:ring-1 focus:ring-[#006052]/30"
                />
              </div>

              {/* Notes (Optional) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Notes / Remarks (Optional)
                </label>
                <input
                  type="text"
                  value={commissionFormData.notes}
                  onChange={(e) =>
                    setCommissionFormData((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  placeholder="e.g. Loan disbursement referral incentive"
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-800 focus:border-[#006052] focus:outline-none focus:ring-1 focus:ring-[#006052]/30"
                />
              </div>

              {/* Footer Actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={isSavingCommission}
                  onClick={() => setIsAddCommissionModalOpen(false)}
                  className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingCommission}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#006052] px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[#004d42] active:bg-[#003d34] transition cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{isSavingCommission ? "Saving..." : "Save Commission"}</span>
                </button>
              </div>
            </form>
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

export default GuarantorReferral;
