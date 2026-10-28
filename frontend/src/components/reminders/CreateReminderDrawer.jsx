import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Bell,
  X,
  Search,
  FileText,
  Clock,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  User,
} from 'lucide-react';
import { extractCustomerId, extractLoanId } from '../../utils/reminderCalculations';
import { saveCustomReminder } from '../../utils/reminderStorage';

const REMINDER_TYPES = [
  'Payment Follow-up',
  'Payment Due',
  'Overdue Follow-up',
  'Document Follow-up',
  'Other',
];

export default function CreateReminderDrawer({
  isOpen,
  onClose,
  rawCustomers = [],
  onReminderCreated,
}) {
  const [customerSearch, setCustomerSearch] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const [selectedLoanId, setSelectedLoanId] = useState('');
  const [title, setTitle] = useState('Payment follow-up');
  const [reminderType, setReminderType] = useState('Payment Follow-up');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState('Medium'); // 'High' | 'Medium' | 'Low'
  const [scheduleDate, setScheduleDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toLocaleDateString('en-CA'); // local YYYY-MM-DD
  });
  const [scheduleTime, setScheduleTime] = useState('10:00 AM');
  const [notes, setNotes] = useState('');

  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const customerDropdownRef = useRef(null);

  // Close customer dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        customerDropdownRef.current &&
        !customerDropdownRef.current.contains(e.target)
      ) {
        setIsCustomerDropdownOpen(false);
      }
    };
    if (isCustomerDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCustomerDropdownOpen]);

  // Extract unique customers from actual application data
  const uniqueCustomers = useMemo(() => {
    const map = new Map();

    rawCustomers.forEach((rec, idx) => {
      if (!rec) return;
      const cust = rec.customer || {};
      const cId = extractCustomerId(rec, idx);
      const name = (cust.name || 'Unknown Customer').trim();
      const mobile = (cust.mobile || '').trim();

      // Deduplicate by Customer ID
      if (!map.has(cId)) {
        map.set(cId, {
          id: cId,
          name,
          mobile,
          primaryRecord: rec,
        });
      }
    });

    return Array.from(map.values());
  }, [rawCustomers]);

  // Filter customers by search term
  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return uniqueCustomers;
    return uniqueCustomers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        c.mobile.includes(q)
    );
  }, [uniqueCustomers, customerSearch]);

  // Load selected customer's loans dynamically
  const customerLoans = useMemo(() => {
    if (!selectedCustomer) return [];

    const loansList = [];
    rawCustomers.forEach((rec, idx) => {
      if (!rec) return;
      const cId = extractCustomerId(rec, idx);
      const mobile = (rec.customer?.mobile || '').trim();

      const matchesCustomer =
        cId === selectedCustomer.id ||
        (selectedCustomer.mobile && mobile === selectedCustomer.mobile);

      if (matchesCustomer) {
        const lId = extractLoanId(rec, cId, idx);
        const vehicle = rec.vehicle || {};
        const vehicleInfo = [vehicle.brand, vehicle.model]
          .filter(Boolean)
          .join(' ');
        const amount = Number(
          rec.loanAmount || rec.loan?.loanAmount || vehicle.amount || 0
        );

        loansList.push({
          loanId: lId,
          vehicleInfo: vehicleInfo || 'Vehicle Loan',
          amount,
          status: rec.status || 'Active',
          record: rec,
        });
      }
    });

    return loansList;
  }, [selectedCustomer, rawCustomers]);

  // Reset form when drawer opens (adjusted during render, not in an effect)
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setCustomerSearch('');
      setIsCustomerDropdownOpen(false);
      setFormErrors({});
      setIsSubmitting(false);
    }
  }

  // Handle customer selection
  const handleSelectCustomer = (customer) => {
    setSelectedCustomer(customer);
    // CRITICAL REQUIREMENT 9.4: When customer changes, clear previous loan selection!
    setSelectedLoanId('');
    setIsCustomerDropdownOpen(false);
    setCustomerSearch('');

    // If customer has exactly one loan, automatically select it
    // Wait, requirement 9.5: "If the selected customer has multiple loans, display all valid associated loans in the dropdown. Allow user to choose. Do not automatically choose an arbitrary loan."
    // If exactly 1 loan, we can preselect or let user pick. Let's populate when user selects a loan.
  };

  const handleClearCustomer = () => {
    setSelectedCustomer(null);
    setSelectedLoanId('');
    setIsCustomerDropdownOpen(false);
  };

  const handleSelectLoan = (lId) => {
    setSelectedLoanId(lId);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    const errors = {};

    if (!selectedCustomer) {
      errors.customer = 'Please select a customer.';
    }
    if (!title.trim()) {
      errors.title = 'Reminder title is required.';
    }
    if (!scheduleDate) {
      errors.scheduleDate = 'Please select a schedule date.';
    }
    if (!scheduleTime) {
      errors.scheduleTime = 'Please select a schedule time.';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setFormErrors({});
    setIsSubmitting(true);

    try {
      const saved = await saveCustomReminder({
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        loanId: selectedLoanId || null,
        title: title.trim(),
        reminderType,
        message: message.trim(),
        priority,
        scheduleDate,
        scheduleTime,
        notes: notes.trim(),
        status: 'Scheduled',
      });

      if (onReminderCreated) {
        onReminderCreated(saved);
      }
      onClose();
    } catch (err) {
      console.error('Error saving reminder:', err);
      setFormErrors({ submit: err.message || 'Failed to schedule reminder.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/35 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Container */}
      <div className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-300">
        {/* =========================================================
            DRAWER HEADER
        ========================================================= */}
        <div className="px-6 py-5 border-b border-slate-200/80 flex items-start justify-between bg-white shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 border border-emerald-100/80 flex items-center justify-center text-emerald-700 shrink-0 shadow-xs">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 leading-tight">
                Create Custom Reminder
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Schedule a reminder for a customer or loan.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-lg transition-colors -mr-1"
            aria-label="Close drawer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* =========================================================
            DRAWER FORM BODY (SCROLLABLE)
        ========================================================= */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto px-6 py-5 space-y-4.5"
        >
          {formErrors.submit && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
              <span>{formErrors.submit}</span>
            </div>
          )}

          {/* 1. SELECT CUSTOMER */}
          <div className="space-y-1.5" ref={customerDropdownRef}>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">
              Select Customer <span className="text-rose-500">*</span>
            </label>

            {selectedCustomer ? (
              <div className="flex items-center justify-between p-3 rounded-xl border border-emerald-200 bg-emerald-50/50">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-8 w-8 rounded-lg bg-emerald-100/80 text-emerald-800 flex items-center justify-center shrink-0 font-semibold text-xs">
                    <User className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">
                      {selectedCustomer.name}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {selectedCustomer.id}
                      {selectedCustomer.mobile
                        ? ` • ${selectedCustomer.mobile}`
                        : ''}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClearCustomer}
                  className="text-xs font-semibold text-slate-500 hover:text-rose-600 p-1 rounded transition-colors"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="relative">
                <div
                  onClick={() => setIsCustomerDropdownOpen(!isCustomerDropdownOpen)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 bg-white border rounded-xl text-sm cursor-pointer transition-all ${
                    formErrors.customer
                      ? 'border-rose-300 ring-2 ring-rose-100'
                      : 'border-slate-200 hover:border-slate-300 focus-within:border-emerald-600'
                  }`}
                >
                  <div className="flex items-center gap-2.5 text-slate-400">
                    <Search className="h-4 w-4" />
                    <span className="text-slate-400">Choose a customer</span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </div>

                {isCustomerDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg z-30 overflow-hidden">
                    <div className="p-2 border-b border-slate-100 bg-slate-50/50">
                      <div className="relative">
                        <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search customer name or ID..."
                          value={customerSearch}
                          onChange={(e) => setCustomerSearch(e.target.value)}
                          className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                          autoFocus
                        />
                      </div>
                    </div>

                    <div className="max-h-52 overflow-y-auto divide-y divide-slate-100">
                      {filteredCustomers.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-400">
                          No customers found
                        </div>
                      ) : (
                        filteredCustomers.map((c) => (
                          <div
                            key={c.id}
                            onClick={() => handleSelectCustomer(c)}
                            className="px-3.5 py-2.5 hover:bg-emerald-50/60 cursor-pointer flex items-center justify-between transition-colors"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-800 truncate">
                                {c.name}
                              </p>
                              <p className="text-xs text-slate-500 truncate">
                                {c.id} {c.mobile ? `• ${c.mobile}` : ''}
                              </p>
                            </div>
                            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                              Select
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            {formErrors.customer && (
              <p className="text-xs text-rose-500 font-medium">
                {formErrors.customer}
              </p>
            )}
          </div>

          {/* 2. SELECT LOAN */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">
              Select Loan
            </label>
            <div className="relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <FileText className="h-4 w-4" />
              </div>
              <select
                disabled={!selectedCustomer || customerLoans.length === 0}
                value={selectedLoanId}
                onChange={(e) => handleSelectLoan(e.target.value)}
                className={`w-full pl-10 pr-9 py-2.5 bg-white border rounded-xl text-sm appearance-none focus:outline-none transition-all ${
                  !selectedCustomer || customerLoans.length === 0
                    ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                    : 'text-slate-800 border-slate-200 hover:border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100'
                }`}
              >
                {!selectedCustomer ? (
                  <option value="">Choose a customer first</option>
                ) : customerLoans.length === 0 ? (
                  <option value="">No eligible loans found for this customer</option>
                ) : (
                  <>
                    <option value="">Choose a loan (Optional)</option>
                    {customerLoans.map((l) => (
                      <option key={l.loanId} value={l.loanId}>
                        {l.loanId} • {l.vehicleInfo} (₹
                        {Math.round(l.amount).toLocaleString('en-IN')})
                      </option>
                    ))}
                  </>
                )}
              </select>
              <ChevronDown className="h-4 w-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
            {selectedCustomer && customerLoans.length === 0 && (
              <p className="text-xs text-amber-600">
                No eligible loans found for this customer.
              </p>
            )}
          </div>

          {/* 3. REMINDER TITLE */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">
              Reminder Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              placeholder="Payment follow-up"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`w-full px-3.5 py-2.5 bg-white border rounded-xl text-sm focus:outline-none transition-all ${
                formErrors.title
                  ? 'border-rose-300 ring-2 ring-rose-100'
                  : 'border-slate-200 hover:border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100'
              }`}
            />
            {formErrors.title && (
              <p className="text-xs text-rose-500 font-medium">
                {formErrors.title}
              </p>
            )}
          </div>

          {/* 4. REMINDER TYPE */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">
              Reminder Type
            </label>
            <div className="relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <FileText className="h-4 w-4" />
              </div>
              <select
                value={reminderType}
                onChange={(e) => setReminderType(e.target.value)}
                className="w-full pl-10 pr-9 py-2.5 bg-white border border-slate-200 hover:border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 rounded-xl text-sm appearance-none text-slate-800 focus:outline-none transition-all"
              >
                {REMINDER_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <ChevronDown className="h-4 w-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* 5. REMINDER MESSAGE */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">
              Reminder Message
            </label>
            <textarea
              rows={3}
              placeholder="Add a short reminder note..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 hover:border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 rounded-xl text-sm focus:outline-none transition-all resize-none"
            />
          </div>

          {/* 6. PRIORITY */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">
              Priority
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {/* High */}
              <button
                type="button"
                onClick={() => setPriority('High')}
                className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  priority === 'High'
                    ? 'border-rose-400 bg-rose-50 text-rose-700 ring-2 ring-rose-200/60 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <AlertCircle className="h-3.5 w-3.5 text-rose-500" />
                <span>High</span>
              </button>

              {/* Medium */}
              <button
                type="button"
                onClick={() => setPriority('Medium')}
                className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  priority === 'Medium'
                    ? 'border-amber-400 bg-amber-50 text-amber-800 ring-2 ring-amber-200/60 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                <span>Medium</span>
              </button>

              {/* Low */}
              <button
                type="button"
                onClick={() => setPriority('Low')}
                className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  priority === 'Low'
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-200/60 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>Low</span>
              </button>
            </div>
          </div>

          {/* 7. SCHEDULE DATE & TIME */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Schedule Date */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">
                Schedule Date <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className={`w-full px-3 py-2 bg-white border rounded-xl text-sm focus:outline-none transition-all ${
                    formErrors.scheduleDate
                      ? 'border-rose-300 ring-2 ring-rose-100'
                      : 'border-slate-200 hover:border-slate-300 focus:border-emerald-600'
                  }`}
                />
              </div>
              {formErrors.scheduleDate && (
                <p className="text-xs text-rose-500 font-medium">
                  {formErrors.scheduleDate}
                </p>
              )}
            </div>

            {/* Schedule Time */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">
                Schedule Time <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <Clock className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  placeholder="10:00 AM"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className={`w-full pl-9 pr-3 py-2 bg-white border rounded-xl text-sm focus:outline-none transition-all ${
                    formErrors.scheduleTime
                      ? 'border-rose-300 ring-2 ring-rose-100'
                      : 'border-slate-200 hover:border-slate-300 focus:border-emerald-600'
                  }`}
                />
              </div>
              {formErrors.scheduleTime && (
                <p className="text-xs text-rose-500 font-medium">
                  {formErrors.scheduleTime}
                </p>
              )}
            </div>
          </div>

          {/* 8. OPTIONAL NOTES */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">
              Optional Notes
            </label>
            <input
              type="text"
              placeholder="Add any additional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 hover:border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 rounded-xl text-sm focus:outline-none transition-all"
            />
          </div>

          {/* Informational Footer Note from visual design */}
          <p className="text-[11px] text-slate-400 italic pt-1 leading-relaxed">
            Scheduled reminders will appear in Custom Reminders and be highlighted
            by priority and due status.
          </p>
        </form>

        {/* =========================================================
            DRAWER FOOTER ACTIONS
        ========================================================= */}
        <div className="px-6 py-4 border-t border-slate-200/80 bg-slate-50/60 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-sm font-semibold transition-colors shadow-xs"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-xl bg-[#006B52] hover:bg-[#005344] text-white text-sm font-semibold transition-all shadow-xs hover:shadow flex items-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? 'Scheduling...' : 'Schedule Reminder'}
          </button>
        </div>
      </div>
    </div>
  );
}
