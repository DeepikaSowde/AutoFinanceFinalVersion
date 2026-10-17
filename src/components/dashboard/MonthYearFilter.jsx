import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { getLocalDateString } from '../../utils/dateUtils';

export const monthNameList = [
  { value: '01', label: 'January', short: 'Jan' },
  { value: '02', label: 'February', short: 'Feb' },
  { value: '03', label: 'March', short: 'Mar' },
  { value: '04', label: 'April', short: 'Apr' },
  { value: '05', label: 'May', short: 'May' },
  { value: '06', label: 'June', short: 'Jun' },
  { value: '07', label: 'July', short: 'Jul' },
  { value: '08', label: 'August', short: 'Aug' },
  { value: '09', label: 'September', short: 'Sep' },
  { value: '10', label: 'October', short: 'Oct' },
  { value: '11', label: 'November', short: 'Nov' },
  { value: '12', label: 'December', short: 'Dec' },
];

/**
 * Extract all unique 4-digit years available across application storage.
 */
export const extractDataYears = () => {
  const years = new Set();
  const currentYear = new Date().getFullYear();
  years.add(currentYear);

  const checkDateVal = (val) => {
    if (!val && val !== 0) return;
    const s = String(val).trim();
    const m = s.match(/^(\d{4})/);
    if (m) {
      const y = parseInt(m[1], 10);
      if (y >= 1950 && y <= 2100) {
        years.add(y);
      }
    } else if (/^\d{12,13}$/.test(s)) {
      const d = new Date(Number(s));
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        if (y >= 1950 && y <= 2100) years.add(y);
      }
    }
  };

  try {
    const customers = JSON.parse(localStorage.getItem('motoLendCustomersList_data') || '[]');
    if (Array.isArray(customers)) {
      customers.forEach((c) => {
        checkDateVal(c?.customer?.applicationDate || c?.loan?.applicationDate || c?.createdAt || c?.date);
        if (Array.isArray(c?.repaymentSchedule)) {
          c.repaymentSchedule.forEach((inst) => checkDateVal(inst?.dueDate));
        }
      });
    }

    const payments = JSON.parse(localStorage.getItem('motoLendPaymentHistory') || '[]');
    if (Array.isArray(payments)) {
      payments.forEach((p) => {
        checkDateVal(p?.date || p?.createdAt || p?.paidAt);
      });
    }

    const income = JSON.parse(localStorage.getItem('motoLendIncome_data') || '[]');
    if (Array.isArray(income)) {
      income.forEach((i) => checkDateVal(i?.date || i?.createdAt));
    }

    const expense = JSON.parse(localStorage.getItem('motoLendExpense_data') || '[]');
    if (Array.isArray(expense)) {
      expense.forEach((e) => checkDateVal(e?.date || e?.createdAt));
    }

    const investors = JSON.parse(localStorage.getItem('motoLendInvestors_data') || '[]');
    if (Array.isArray(investors)) {
      investors.forEach((inv) => {
        if (Array.isArray(inv?.transactions)) {
          inv.transactions.forEach((tx) => checkDateVal(tx?.date || tx?.createdAt));
        }
      });
    }

    const chit = JSON.parse(localStorage.getItem('motoLendChitTransactions_data') || '[]');
    if (Array.isArray(chit)) {
      chit.forEach((ct) => checkDateVal(ct?.date || ct?.createdAt));
    }
  } catch (err) {
    console.error('Error scanning storage for available years:', err);
  }

  return Array.from(years);
};

/**
 * Universal date matching helper for the Dashboard.
 * Filters any date input against dateFilter (supporting All Months, Today, This Month, Month, Year, Date, or Date Range).
 */
export const matchesDashboardDate = (dateInput, dateFilter) => {
  if (!dateFilter || dateFilter.filterType === 'all') return true;
  if (!dateInput && dateInput !== 0) return false;

  const targetDateStr = getLocalDateString(dateInput);
  if (!targetDateStr) return false;

  // 1. Date range (startDate & endDate)
  if (dateFilter.startDate && dateFilter.endDate) {
    return targetDateStr >= dateFilter.startDate && targetDateStr <= dateFilter.endDate;
  }
  if (dateFilter.startDate && !dateFilter.endDate) {
    return targetDateStr === dateFilter.startDate;
  }

  // 2. Month-only filter (e.g., specific selected month & year)
  if (dateFilter.filterType === 'month') {
    const [y, m] = targetDateStr.split('-');
    if (dateFilter.selectedYear && dateFilter.selectedYear !== 'All' && y !== String(dateFilter.selectedYear)) {
      return false;
    }
    if (dateFilter.selectedMonth && dateFilter.selectedMonth !== 'All' && m !== String(dateFilter.selectedMonth)) {
      return false;
    }
    return true;
  }

  // 3. Year-only filter (e.g., specific selected year)
  if (dateFilter.filterType === 'year') {
    const [y] = targetDateStr.split('-');
    if (dateFilter.selectedYear && dateFilter.selectedYear !== 'All' && y !== String(dateFilter.selectedYear)) {
      return false;
    }
    return true;
  }

  return true;
};

// Backward-compatible alias
export const matchesMonthYear = matchesDashboardDate;

/**
 * Formats date into readable string (e.g. 17 Oct 2026)
 */
const formatPrettyDate = (isoDateStr) => {
  if (!isoDateStr) return '';
  const [y, m, d] = isoDateStr.split('-').map(Number);
  const monthObj = monthNameList[m - 1];
  return `${d} ${monthObj ? monthObj.short : m} ${y}`;
};

const MonthYearFilter = ({
  dateFilter = { filterType: 'all', label: 'All Months' },
  setDateFilter,
  selectedMonth,
  setSelectedMonth,
  selectedYear,
  setSelectedYear,
}) => {
  const [showPicker, setShowPicker] = useState(false);
  const [extraYearsBack, setExtraYearsBack] = useState(0);

  // View date tracks the month & year currently viewed in the calendar
  const [viewDate, setViewDate] = useState(() => {
    if (dateFilter?.startDate) {
      const parts = dateFilter.startDate.split('-').map(Number);
      if (parts[0] && parts[1]) {
        return new Date(parts[0], parts[1] - 1, 1);
      }
    } else if (dateFilter?.selectedYear && dateFilter.selectedYear !== 'All') {
      const y = Number(dateFilter.selectedYear);
      const m = dateFilter.selectedMonth && dateFilter.selectedMonth !== 'All' ? Number(dateFilter.selectedMonth) - 1 : 0;
      return new Date(y, m, 1);
    }
    return new Date();
  });

  // Intermediate range selection while picker is open
  const [rangeStart, setRangeStart] = useState(dateFilter?.startDate || null);
  const [rangeEnd, setRangeEnd] = useState(dateFilter?.endDate || null);
  const [hoverDate, setHoverDate] = useState(null);

  const containerRef = useRef(null);

  // Sync internal view and range when picker opens
  useEffect(() => {
    if (showPicker) {
      setRangeStart(dateFilter?.startDate || null);
      setRangeEnd(dateFilter?.endDate || null);
      if (dateFilter?.startDate) {
        const parts = dateFilter.startDate.split('-').map(Number);
        if (parts[0] && parts[1]) {
          setViewDate(new Date(parts[0], parts[1] - 1, 1));
        }
      } else if (dateFilter?.selectedYear && dateFilter.selectedYear !== 'All') {
        const y = Number(dateFilter.selectedYear);
        const m = dateFilter.selectedMonth && dateFilter.selectedMonth !== 'All' ? Number(dateFilter.selectedMonth) - 1 : 0;
        setViewDate(new Date(y, m, 1));
      }
    }
  }, [showPicker, dateFilter]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const curYear = viewDate.getFullYear();
  const curMonthIndex = viewDate.getMonth();
  const curMonthObj = monthNameList[curMonthIndex];

  // Dynamically compute list of available years (without hardcoding a limited list)
  const availableYears = useMemo(() => {
    const dataYears = extractDataYears();
    const currentYear = new Date().getFullYear();
    const activeViewYear = curYear;

    const minDataYear = dataYears.length > 0 ? Math.min(...dataYears) : currentYear;
    // Allow navigation backwards without arbitrary limit, including past years and any data year
    const baseMin = Math.min(currentYear - 10, minDataYear, activeViewYear) - extraYearsBack;
    const minYear = Math.max(1970, baseMin);
    const maxYear = Math.max(currentYear + 2, activeViewYear, ...dataYears);

    const list = [];
    for (let y = maxYear; y >= minYear; y--) {
      list.push(y);
    }
    return list;
  }, [curYear, extraYearsBack, showPicker]);

  // Calendar math (automatically handles leap years via Date constructor)
  const daysInMonth = new Date(curYear, curMonthIndex + 1, 0).getDate();
  const firstDayOfWeek = new Date(curYear, curMonthIndex, 1).getDay(); // 0 = Sunday
  const daysInPrevMonth = new Date(curYear, curMonthIndex, 0).getDate();

  // Helper to commit filter changes to parent
  const updateFilter = (newFilter) => {
    if (setDateFilter) {
      setDateFilter(newFilter);
    }
    if (setSelectedMonth && newFilter.selectedMonth !== undefined) {
      setSelectedMonth(newFilter.selectedMonth);
    }
    if (setSelectedYear && newFilter.selectedYear !== undefined) {
      setSelectedYear(newFilter.selectedYear);
    }
  };

  // Navigation handlers across month/year boundaries
  const handlePrevMonth = () => {
    setViewDate(new Date(curYear, curMonthIndex - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(curYear, curMonthIndex + 1, 1));
  };

  // Presets Handlers
  const handleSelectToday = () => {
    const today = new Date();
    const todayStr = getLocalDateString(today);
    updateFilter({
      filterType: 'today',
      startDate: todayStr,
      endDate: todayStr,
      selectedMonth: String(today.getMonth() + 1).padStart(2, '0'),
      selectedYear: String(today.getFullYear()),
      label: `Today (${today.getDate()} ${monthNameList[today.getMonth()].short})`,
    });
    setShowPicker(false);
  };

  const handleSelectThisMonth = () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();
    const lastDay = new Date(y, m + 1, 0).getDate();
    const mStr = String(m + 1).padStart(2, '0');
    const startStr = `${y}-${mStr}-01`;
    const endStr = `${y}-${mStr}-${String(lastDay).padStart(2, '0')}`;

    updateFilter({
      filterType: 'this_month',
      startDate: startStr,
      endDate: endStr,
      selectedMonth: mStr,
      selectedYear: String(y),
      label: `This Month (${monthNameList[m].short} ${y})`,
    });
    setShowPicker(false);
  };

  const handleSelectAllMonths = () => {
    updateFilter({
      filterType: 'all',
      startDate: null,
      endDate: null,
      selectedMonth: 'All',
      selectedYear: 'All',
      label: 'All Months',
    });
    setShowPicker(false);
  };

  // Specific Month Filter Handler
  const handleSelectSpecificMonth = (monthIndex, year) => {
    const lastDay = new Date(year, monthIndex + 1, 0).getDate();
    const mStr = String(monthIndex + 1).padStart(2, '0');
    const startStr = `${year}-${mStr}-01`;
    const endStr = `${year}-${mStr}-${String(lastDay).padStart(2, '0')}`;

    updateFilter({
      filterType: 'month',
      startDate: startStr,
      endDate: endStr,
      selectedMonth: mStr,
      selectedYear: String(year),
      label: `${monthNameList[monthIndex].short} ${year}`,
    });
    setShowPicker(false);
  };

  // Specific Year Filter Handler
  const handleSelectSpecificYear = (year) => {
    const startStr = `${year}-01-01`;
    const endStr = `${year}-12-31`;

    updateFilter({
      filterType: 'year',
      startDate: startStr,
      endDate: endStr,
      selectedMonth: 'All',
      selectedYear: String(year),
      label: `Year ${year}`,
    });
    setShowPicker(false);
  };

  // Click on a calendar day (uses currently selected year and month)
  const handleDayClick = (dayNumber) => {
    const mStr = String(curMonthIndex + 1).padStart(2, '0');
    const dStr = String(dayNumber).padStart(2, '0');
    const clickedDateStr = `${curYear}-${mStr}-${dStr}`;

    // If starting a fresh selection
    if (!rangeStart || (rangeStart && rangeEnd)) {
      setRangeStart(clickedDateStr);
      setRangeEnd(null);
      // Immediately apply as single date
      updateFilter({
        filterType: 'date',
        startDate: clickedDateStr,
        endDate: clickedDateStr,
        selectedMonth: mStr,
        selectedYear: String(curYear),
        label: formatPrettyDate(clickedDateStr),
      });
      return;
    }

    // Completing a range
    if (rangeStart && !rangeEnd) {
      let finalStart = rangeStart;
      let finalEnd = clickedDateStr;
      if (clickedDateStr < rangeStart) {
        finalStart = clickedDateStr;
        finalEnd = rangeStart;
      }
      setRangeStart(finalStart);
      setRangeEnd(finalEnd);

      const label =
        finalStart === finalEnd
          ? formatPrettyDate(finalStart)
          : `${formatPrettyDate(finalStart)} – ${formatPrettyDate(finalEnd)}`;

      updateFilter({
        filterType: 'range',
        startDate: finalStart,
        endDate: finalEnd,
        selectedMonth: mStr,
        selectedYear: String(curYear),
        label,
      });
      setShowPicker(false);
    }
  };

  // Helper to determine day styling
  const getDayState = (dayNumber) => {
    const mStr = String(curMonthIndex + 1).padStart(2, '0');
    const dStr = String(dayNumber).padStart(2, '0');
    const dateStr = `${curYear}-${mStr}-${dStr}`;

    const effectiveEnd = rangeEnd || (hoverDate && rangeStart && hoverDate >= rangeStart ? hoverDate : null);

    const isStart = rangeStart === dateStr;
    const isEnd = (rangeEnd || effectiveEnd) === dateStr;
    const inRange = rangeStart && effectiveEnd && dateStr > rangeStart && dateStr < effectiveEnd;
    const isToday = dateStr === getLocalDateString(new Date());

    return { isStart, isEnd, inRange, isToday, dateStr };
  };

  const isCurMonthSelected =
    dateFilter.filterType === 'month' &&
    dateFilter.selectedYear === String(curYear) &&
    dateFilter.selectedMonth === String(curMonthIndex + 1).padStart(2, '0');

  const isCurYearSelected =
    dateFilter.filterType === 'year' &&
    dateFilter.selectedYear === String(curYear);

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      {/* TRIGGER BUTTON */}
      <button
        type="button"
        onClick={() => setShowPicker((prev) => !prev)}
        className={`flex h-9 items-center gap-2 rounded-xl border px-3 text-xs sm:text-sm font-semibold transition-all cursor-pointer shadow-2xs select-none ${
          showPicker
            ? 'border-[#006052] bg-emerald-50 text-[#006052] ring-1 ring-[#006052]'
            : 'border-slate-300 bg-white text-slate-700 hover:border-[#006052] hover:text-[#006052] hover:bg-slate-50'
        }`}
        title="Filter by Date, Month, or Year"
      >
        <Calendar className="h-4 w-4 text-[#006052] shrink-0" />
        <span className="truncate max-w-[210px] sm:max-w-[260px]">{dateFilter?.label || 'All Months'}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 shrink-0 ${
            showPicker ? 'rotate-180 text-[#006052]' : ''
          }`}
        />
      </button>

      {/* SINGLE FILTER DROPDOWN / POPUP */}
      {showPicker && (
        <div className="absolute right-0 mt-2 w-[320px] sm:w-[350px] rounded-2xl bg-white p-4 shadow-xl border border-slate-200 z-50 animate-in fade-in zoom-in-95 duration-150">
          {/* 1. PRESETS BAR (Today, This Month, All Months) */}
          <div className="flex items-center gap-1.5 pb-3 border-b border-slate-100">
            <button
              type="button"
              onClick={handleSelectToday}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all text-center cursor-pointer ${
                dateFilter?.filterType === 'today'
                  ? 'bg-[#006052] text-white shadow-xs'
                  : 'bg-slate-50 text-slate-600 hover:bg-emerald-50 hover:text-[#006052]'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={handleSelectThisMonth}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all text-center cursor-pointer ${
                dateFilter?.filterType === 'this_month'
                  ? 'bg-[#006052] text-white shadow-xs'
                  : 'bg-slate-50 text-slate-600 hover:bg-emerald-50 hover:text-[#006052]'
              }`}
            >
              This Month
            </button>
            <button
              type="button"
              onClick={handleSelectAllMonths}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all text-center cursor-pointer ${
                dateFilter?.filterType === 'all'
                  ? 'bg-[#006052] text-white shadow-xs'
                  : 'bg-slate-50 text-slate-600 hover:bg-emerald-50 hover:text-[#006052]'
              }`}
            >
              All Months
            </button>
          </div>

          {/* 2. CALENDAR HEADER: NAVIGATION ARROWS, MONTH SELECTOR & YEAR SELECTOR */}
          <div className="flex items-center justify-between gap-1 py-2.5">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-emerald-50 hover:text-[#006052] transition-colors cursor-pointer shrink-0"
              title="Previous Month"
              aria-label="Previous Month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-1.5 flex-1 justify-center">
              {/* Month Selector Dropdown */}
              <div className="relative">
                <select
                  value={curMonthIndex}
                  onChange={(e) => {
                    const newM = Number(e.target.value);
                    setViewDate(new Date(curYear, newM, 1));
                  }}
                  aria-label="Select Month"
                  className="h-8 rounded-lg border border-slate-200 bg-white pl-2.5 pr-6 text-xs font-bold text-slate-800 hover:border-[#006052] focus:border-[#006052] focus:ring-1 focus:ring-[#006052] cursor-pointer outline-none appearance-none transition-all shadow-2xs"
                >
                  {monthNameList.map((m, idx) => (
                    <option key={m.value} value={idx}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              </div>

              {/* Year Selector Dropdown */}
              <div className="relative">
                <select
                  value={curYear}
                  onChange={(e) => {
                    if (e.target.value === '__load_more__') {
                      setExtraYearsBack((prev) => prev + 15);
                      return;
                    }
                    const newY = Number(e.target.value);
                    setViewDate(new Date(newY, curMonthIndex, 1));
                  }}
                  aria-label="Select Year"
                  className="h-8 rounded-lg border border-slate-200 bg-white pl-2.5 pr-6 text-xs font-bold text-slate-800 hover:border-[#006052] focus:border-[#006052] focus:ring-1 focus:ring-[#006052] cursor-pointer outline-none appearance-none transition-all shadow-2xs"
                >
                  {availableYears.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                  <option value="__load_more__">« Older years... »</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              </div>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-emerald-50 hover:text-[#006052] transition-colors cursor-pointer shrink-0"
              title="Next Month"
              aria-label="Next Month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* 3. QUICK APPLY MONTH / YEAR ACTION BAR */}
          <div className="flex items-center gap-1.5 pb-2.5 mb-1.5 border-b border-slate-100">
            <button
              type="button"
              onClick={() => handleSelectSpecificMonth(curMonthIndex, curYear)}
              className={`flex-1 py-1 px-2 rounded-lg text-[11px] font-bold transition-all text-center cursor-pointer border ${
                isCurMonthSelected
                  ? 'bg-[#006052] text-white border-[#006052] shadow-xs'
                  : 'bg-emerald-50 text-[#006052] border-emerald-100 hover:bg-emerald-100'
              }`}
              title={`Filter by all of ${curMonthObj?.label} ${curYear}`}
            >
              Select Month ({curMonthObj?.short} {curYear})
            </button>
            <button
              type="button"
              onClick={() => handleSelectSpecificYear(curYear)}
              className={`py-1 px-2.5 rounded-lg text-[11px] font-bold transition-all text-center cursor-pointer border ${
                isCurYearSelected
                  ? 'bg-[#006052] text-white border-[#006052] shadow-xs'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-emerald-50 hover:text-[#006052]'
              }`}
              title={`Filter by all of ${curYear}`}
            >
              Select Year ({curYear})
            </button>
          </div>

          {/* 4. DATE CALENDAR GRID */}
          <div className="py-1">
            {/* Day Name Headers */}
            <div className="grid grid-cols-7 gap-1 text-center mb-1.5">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                <span key={d} className="text-[11px] font-bold text-slate-400">
                  {d}
                </span>
              ))}
            </div>

            {/* Day Cells Grid */}
            <div className="grid grid-cols-7 gap-1">
              {/* Previous Month Padding */}
              {Array.from({ length: firstDayOfWeek }).map((_, i) => {
                const dayNum = daysInPrevMonth - firstDayOfWeek + i + 1;
                return (
                  <span
                    key={`prev-${i}`}
                    className="h-8 flex items-center justify-center text-[11px] text-slate-300 font-medium select-none"
                  >
                    {dayNum}
                  </span>
                );
              })}

              {/* Days of Current Month (Automatically accounts for leap years) */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const dayNum = i + 1;
                const { isStart, isEnd, inRange, isToday } = getDayState(dayNum);
                const isSelectedEndpoint = isStart || isEnd;

                return (
                  <button
                    key={`curr-${dayNum}`}
                    type="button"
                    onClick={() => handleDayClick(dayNum)}
                    onMouseEnter={() => {
                      if (rangeStart && !rangeEnd) {
                        const mStr = String(curMonthIndex + 1).padStart(2, '0');
                        const dStr = String(dayNum).padStart(2, '0');
                        setHoverDate(`${curYear}-${mStr}-${dStr}`);
                      }
                    }}
                    className={`h-8 w-full rounded-lg text-xs font-semibold transition-all cursor-pointer relative flex items-center justify-center ${
                      isSelectedEndpoint
                        ? 'bg-[#006052] text-white font-bold shadow-xs scale-102 z-10'
                        : inRange
                        ? 'bg-emerald-50 text-[#006052] rounded-none'
                        : isToday
                        ? 'border border-[#006052] text-[#006052] font-bold hover:bg-emerald-50'
                        : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    {dayNum}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. FOOTER: SELECTION HINT & CLOSE BUTTON */}
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[11px] text-slate-400 truncate max-w-[210px]">
              {rangeStart && !rangeEnd
                ? 'Select end date...'
                : dateFilter?.filterType === 'all'
                ? 'Showing all time'
                : dateFilter?.label}
            </span>
            <button
              type="button"
              onClick={() => setShowPicker(false)}
              className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 px-2 py-1 rounded-md hover:bg-slate-100 cursor-pointer transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MonthYearFilter;
