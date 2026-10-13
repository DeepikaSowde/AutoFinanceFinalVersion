import React, { useState, useMemo, useEffect } from "react";
import {
  X,
  Users,
  ShieldCheck,
  Coins,
  FileText,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  UserCheck,
} from "lucide-react";
import { getPersonDetailsSummary } from "../utils/guarantorReferralStorage";

// Helper: Format date as DD MMM YYYY
const formatDate = (dateString) => {
  if (!dateString) return "—";
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return String(dateString);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const PAGE_SIZE = 5;

/**
 * Final Referral & Guarantor Details Popup Modal — MotoLend
 * 
 * Strict specifications:
 * - Fixed popup dimensions: max-w-[950px] on desktop, h-[85vh] (never grows vertically)
 * - Fixed stable header, KPI cards, tabs, and footer
 * - Internal pagination: 5 records per page with Prev/Next, page numbers, record counter
 * - 4 tabs: Guarantor, Referral, Both, Documents
 * - Strict columns per tab with MotoLend theme (Navy #0F1E36, White, Green #006052)
 * - NO nested View buttons, NO Action columns, NO Selected Customer panels, NO nested popups
 */
export const ReferralGuarantorDetailsModal = ({ person, onClose }) => {
  const [activeTab, setActiveTab] = useState("guarantor"); // "guarantor" | "referral" | "both" | "documents"
  const [searchQuery, setSearchQuery] = useState("");
  const [pageByTab, setPageByTab] = useState({
    guarantor: 1,
    referral: 1,
    both: 1,
  });

  // Prevent background scrolling while modal is open
  useEffect(() => {
    const originalStyle = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalStyle;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // Compute all data strictly from actual application records
  const summary = useMemo(() => {
    return getPersonDetailsSummary(person);
  }, [person]);

  const { guarantorList, referralList, bothList, kpis, documents } = summary;

  // Active records based on tab
  const activeList = useMemo(() => {
    if (activeTab === "guarantor") return guarantorList;
    if (activeTab === "referral") return referralList;
    if (activeTab === "both") return bothList;
    return [];
  }, [activeTab, guarantorList, referralList, bothList]);

  // Filter active records by search query (customer name, customer ID, loan ID)
  const filteredList = useMemo(() => {
    if (!searchQuery.trim()) return activeList;
    const q = searchQuery.toLowerCase().trim();
    return activeList.filter((item) => {
      const name = (item.customerName || "").toLowerCase();
      const custId = (item.customerId || "").toLowerCase();
      const loanId = (item.loanId || "").toLowerCase();
      return name.includes(q) || custId.includes(q) || loanId.includes(q);
    });
  }, [activeList, searchQuery]);

  // Pagination calculation
  const currentPage = pageByTab[activeTab] || 1;
  const totalPages = Math.max(1, Math.ceil(filteredList.length / PAGE_SIZE));

  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredList.slice(start, start + PAGE_SIZE);
  }, [filteredList, currentPage]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearchQuery("");
  };

  const handleSearchChange = (val) => {
    setSearchQuery(val);
    setPageByTab((prev) => ({
      ...prev,
      [activeTab]: 1,
    }));
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPageByTab((prev) => ({
        ...prev,
        [activeTab]: newPage,
      }));
    }
  };

  if (!person) return null;

  const startRecordNum = filteredList.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endRecordNum = Math.min(currentPage * PAGE_SIZE, filteredList.length);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 md:p-6 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="person-details-title"
    >
      {/* Fixed Dimension Modal Dialog Container */}
      <div className="relative w-full max-w-full sm:max-w-[950px] h-[100dvh] sm:h-[85vh] max-h-[100dvh] sm:max-h-[85vh] bg-white sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-slate-200 animate-in zoom-in-95 duration-200">
        
        {/* =========================================================
            1. FIXED HEADER (Navy #0F1E36)
        ========================================================= */}
        <div className="shrink-0 bg-[#0F1E36] px-5 py-3.5 sm:px-6 sm:py-4 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center text-white shrink-0 border border-white/10">
              <UserCheck className="h-5 w-5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2
                  id="person-details-title"
                  className="text-base sm:text-lg font-bold text-white tracking-tight truncate"
                >
                  {person.fullName || person.name || "Person Details"}
                </h2>
                <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-mono font-bold text-emerald-300 border border-emerald-400/30">
                  {person.id}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Added on {formatDate(person.createdAt)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0 ml-3"
            aria-label="Close details popup"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* =========================================================
            2. FIXED THREE KPI CARDS
        ========================================================= */}
        <div className="shrink-0 px-4 py-3 sm:px-6 sm:py-3.5 bg-slate-50/80 border-b border-slate-200/80">
          <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
            {/* KPI 1: Linked Customers */}
            <div className="rounded-xl border border-slate-200 bg-white p-2.5 sm:p-3.5 shadow-2xs flex items-center gap-2.5 sm:gap-3.5 min-w-0">
              <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#0F1E36]">
                <Users className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] sm:text-xs font-medium text-slate-500 truncate">
                  Linked Customers
                </p>
                <p className="text-base sm:text-xl font-bold tracking-tight text-slate-900 leading-tight">
                  {kpis.linkedCustomers}
                </p>
              </div>
            </div>

            {/* KPI 2: As Guarantor */}
            <div className="rounded-xl border border-slate-200 bg-white p-2.5 sm:p-3.5 shadow-2xs flex items-center gap-2.5 sm:gap-3.5 min-w-0">
              <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-[#006052]">
                <ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] sm:text-xs font-medium text-slate-500 truncate">
                  As Guarantor
                </p>
                <p className="text-base sm:text-xl font-bold tracking-tight text-slate-900 leading-tight">
                  {kpis.asGuarantor}
                </p>
              </div>
            </div>

            {/* KPI 3: As Referral */}
            <div className="rounded-xl border border-slate-200 bg-white p-2.5 sm:p-3.5 shadow-2xs flex items-center gap-2.5 sm:gap-3.5 min-w-0">
              <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-[#006052]">
                <Coins className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] sm:text-xs font-medium text-slate-500 truncate">
                  As Referral
                </p>
                <p className="text-base sm:text-xl font-bold tracking-tight text-slate-900 leading-tight">
                  {kpis.asReferral}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================
            3. FIXED FOUR TABS NAVIGATION BAR
        ========================================================= */}
        <div className="shrink-0 px-4 sm:px-6 border-b border-slate-200 bg-white">
          <nav className="flex space-x-2 sm:space-x-4 -mb-px overflow-x-auto" aria-label="Tabs">
            {/* Tab 1: Guarantor */}
            <button
              type="button"
              onClick={() => handleTabChange("guarantor")}
              className={`inline-flex items-center gap-2 py-3 px-1 border-b-2 text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === "guarantor"
                  ? "border-[#006052] text-[#006052]"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
              }`}
            >
              <span>Guarantor</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  activeTab === "guarantor"
                    ? "bg-[#006052] text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {guarantorList.length}
              </span>
            </button>

            {/* Tab 2: Referral */}
            <button
              type="button"
              onClick={() => handleTabChange("referral")}
              className={`inline-flex items-center gap-2 py-3 px-1 border-b-2 text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === "referral"
                  ? "border-[#006052] text-[#006052]"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
              }`}
            >
              <span>Referral</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  activeTab === "referral"
                    ? "bg-[#006052] text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {referralList.length}
              </span>
            </button>

            {/* Tab 3: Both */}
            <button
              type="button"
              onClick={() => handleTabChange("both")}
              className={`inline-flex items-center gap-2 py-3 px-1 border-b-2 text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === "both"
                  ? "border-[#006052] text-[#006052]"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
              }`}
            >
              <span>Both</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  activeTab === "both"
                    ? "bg-[#006052] text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {bothList.length}
              </span>
            </button>

            {/* Tab 4: Documents */}
            <button
              type="button"
              onClick={() => handleTabChange("documents")}
              className={`inline-flex items-center gap-2 py-3 px-1 border-b-2 text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === "documents"
                  ? "border-[#006052] text-[#006052]"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
              }`}
            >
              <span>Documents</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  activeTab === "documents"
                    ? "bg-[#006052] text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {documents.length}
              </span>
            </button>
          </nav>
        </div>

        {/* =========================================================
            4. TAB CONTENT AREA (CONTAINED, INTERNALLY PAGINATED & SCROLLED)
        ========================================================= */}
        <div className="flex-1 min-h-0 flex flex-col p-4 sm:p-5 bg-white overflow-hidden">
          
          {/* A. TABLE TABS: GUARANTOR, REFERRAL, BOTH */}
          {activeTab !== "documents" && (
            <div className="flex-1 min-h-0 flex flex-col">
              {/* Internal Search Bar */}
              <div className="shrink-0 mb-3 flex items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder="Search customer, ID, or loan ID..."
                    className="h-8.5 w-full rounded-lg border border-slate-200 bg-[#F8FAFC] pl-9 pr-7 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#006052] focus:ring-1 focus:ring-[#006052] outline-none transition-all"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => handleSearchChange("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                      title="Clear search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider shrink-0 hidden sm:inline">
                  {filteredList.length} relationship{filteredList.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Table Container (Internally Scrollable, Never Expands Modal) */}
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
                {filteredList.length === 0 ? (
                  /* Professional Empty State */
                  <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-slate-50/40">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-400 mb-2.5 border border-slate-200">
                      {searchQuery ? (
                        <Search className="h-5 w-5" />
                      ) : activeTab === "guarantor" ? (
                        <ShieldCheck className="h-5 w-5" />
                      ) : activeTab === "referral" ? (
                        <Coins className="h-5 w-5" />
                      ) : (
                        <Users className="h-5 w-5" />
                      )}
                    </div>
                    <p className="text-sm font-bold text-slate-800">
                      {searchQuery
                        ? "No matching records found"
                        : activeTab === "guarantor"
                        ? "No Guarantor Relationships"
                        : activeTab === "referral"
                        ? "No Referral Relationships"
                        : "No Dual Role (Both) Relationships"}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm">
                      {searchQuery
                        ? `No relationships matched "${searchQuery}". Clear your search query to see all records.`
                        : activeTab === "guarantor"
                        ? "This person is not currently linked as a Guarantor for any customer loan."
                        : activeTab === "referral"
                        ? "This person is not currently linked as a Referral for any customer loan."
                        : "This person is not assigned as both Guarantor and Referral for the same loan."}
                    </p>
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => handleSearchChange("")}
                        className="mt-3 text-xs font-semibold text-[#006052] hover:underline cursor-pointer"
                      >
                        Clear search
                      </button>
                    )}
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    {/* Table Header */}
                    <thead className="bg-[#0F1E36] text-white sticky top-0 z-10">
                      <tr>
                        <th className="px-3.5 py-2.5 font-semibold text-[11px] uppercase tracking-wider">
                          Customer
                        </th>
                        <th className="px-3.5 py-2.5 font-semibold text-[11px] uppercase tracking-wider whitespace-nowrap">
                          Loan ID
                        </th>
                        <th className="px-3.5 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-center whitespace-nowrap">
                          Type
                        </th>
                        {activeTab === "referral" && (
                          <>
                            <th className="px-3.5 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-right whitespace-nowrap">
                              Commission Percentage
                            </th>
                            <th className="px-3.5 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-right whitespace-nowrap">
                              Commission Amount
                            </th>
                            <th className="px-3.5 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-center whitespace-nowrap">
                              Status
                            </th>
                          </>
                        )}
                      </tr>
                    </thead>

                    {/* Table Body */}
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {paginatedRecords.map((item) => (
                        <tr
                          key={item.id}
                          className="hover:bg-slate-50/70 transition-colors"
                        >
                          {/* Column 1: Customer (Name & Customer ID) */}
                          <td className="px-3.5 py-2.5">
                            <div className="font-semibold text-slate-900 leading-snug">
                              {item.customerName || "Customer"}
                            </div>
                            <div className="text-[11px] font-mono font-bold text-[#006052]">
                              {item.customerId || "—"}
                            </div>
                          </td>

                          {/* Column 2: Loan ID */}
                          <td className="px-3.5 py-2.5 font-mono text-slate-700 font-medium whitespace-nowrap">
                            {item.loanId || "—"}
                          </td>

                          {/* Column 3: Type */}
                          <td className="px-3.5 py-2.5 text-center whitespace-nowrap">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${
                                item.type === "Guarantor"
                                  ? "bg-emerald-50 text-[#006052] border-emerald-200"
                                  : item.type === "Referral"
                                  ? "bg-blue-50 text-[#0F1E36] border-blue-200"
                                  : "bg-emerald-50 text-[#006052] border-emerald-300"
                              }`}
                            >
                              {item.type}
                            </span>
                          </td>

                          {/* Additional Columns for Referral Tab */}
                          {activeTab === "referral" && (
                            <>
                              {/* Commission Percentage */}
                              <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                                {item.isCommissionConfigured ? (
                                  <span className="font-semibold text-slate-800">
                                    {item.commissionPercentageDisplay}
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-slate-400 italic">
                                    Not Configured
                                  </span>
                                )}
                              </td>

                              {/* Commission Amount */}
                              <td className="px-3.5 py-2.5 text-right whitespace-nowrap font-bold">
                                {item.isCommissionConfigured ? (
                                  <span className="text-[#006052]">
                                    {item.commissionAmountDisplay}
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-slate-400 italic font-normal">
                                    —
                                  </span>
                                )}
                              </td>

                              {/* Commission Status */}
                              <td className="px-3.5 py-2.5 text-center whitespace-nowrap">
                                {item.commissionStatus === "Paid" ? (
                                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold bg-emerald-50 text-[#006052] border border-emerald-200">
                                    ● Paid
                                  </span>
                                ) : item.commissionStatus === "Pending" ? (
                                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                    ○ Pending
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                    Not Configured
                                  </span>
                                )}
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Internal Pagination Controls Bar (Stable Fixed Height) */}
              <div className="shrink-0 mt-3 pt-2.5 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2">
                <p className="text-xs text-slate-500 font-medium order-2 sm:order-1">
                  {filteredList.length === 0
                    ? "0 records"
                    : `Showing ${startRecordNum}–${endRecordNum} of ${filteredList.length} records`}
                </p>

                <div className="flex items-center gap-1.5 order-1 sm:order-2">
                  <button
                    type="button"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage <= 1}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-2xs"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    <span>Previous</span>
                  </button>

                  <div className="flex items-center gap-1 px-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                      if (
                        totalPages <= 5 ||
                        pageNum === 1 ||
                        pageNum === totalPages ||
                        Math.abs(pageNum - currentPage) <= 1
                      ) {
                        return (
                          <button
                            key={pageNum}
                            type="button"
                            onClick={() => handlePageChange(pageNum)}
                            className={`min-w-[28px] h-7 px-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                              currentPage === pageNum
                                ? "bg-[#0F1E36] text-white"
                                : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      }
                      if (
                        pageNum === 2 && currentPage > 3 ||
                        pageNum === totalPages - 1 && currentPage < totalPages - 2
                      ) {
                        return (
                          <span key={pageNum} className="text-slate-400 text-xs px-0.5">
                            …
                          </span>
                        );
                      }
                      return null;
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-2xs"
                  >
                    <span>Next</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* B. DOCUMENTS TAB (INTERNALLY SCROLLED, NON-EXPANDING) */}
          {activeTab === "documents" && (
            <div className="flex-1 min-h-0 overflow-y-auto pr-1">
              {documents.length === 0 ? (
                /* Professional Empty State */
                <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-slate-50/40 rounded-xl border border-dashed border-slate-200">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 mb-3 border border-slate-200">
                    <FileText className="h-6 w-6" strokeWidth={1.8} />
                  </div>
                  <h4 className="text-sm sm:text-base font-bold text-slate-800">
                    No Documents Available
                  </h4>
                  <p className="mt-1 text-xs sm:text-sm text-slate-500 max-w-sm leading-relaxed">
                    No KYC or identity documents have been uploaded for this person.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-[#F8FAFC] p-3 shadow-2xs hover:border-[#006052]/40 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-[#006052] border border-emerald-100">
                          <FileText className="h-4.5 w-4.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                            {doc.title}
                          </p>
                          <p className="text-[11px] text-slate-400 truncate">
                            {doc.name} {doc.size && doc.size !== "—" ? `(${doc.size})` : ""}
                          </p>
                        </div>
                      </div>

                      {doc.data && (
                        <a
                          href={doc.data}
                          download={doc.name}
                          className="shrink-0 ml-2 inline-flex items-center justify-center rounded-md bg-white border border-slate-200 p-2 text-slate-600 hover:text-[#006052] hover:bg-slate-50 hover:border-[#006052] transition-colors cursor-pointer shadow-2xs"
                          title="Download Document"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* =========================================================
            5. FIXED FOOTER (Navy Button)
        ========================================================= */}
        <div className="shrink-0 border-t border-slate-100 px-5 py-3 sm:px-6 sm:py-3.5 bg-slate-50 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[#0F1E36] px-5 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-[#0A1629] transition-colors cursor-pointer shadow-2xs"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};

export default ReferralGuarantorDetailsModal;
