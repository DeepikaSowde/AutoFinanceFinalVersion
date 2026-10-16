/**
 * Centralized Date & Time Utilities for MotoLend
 *
 * Enforces consistent Indian Standard Time (IST, UTC+05:30) timezone handling:
 * - Timezone: 'Asia/Kolkata'
 * - Prevents phantom '05:30' from UTC midnight conversion on date-only fields
 * - Accurately displays real timestamps in IST (e.g., '16 Oct 2026, 15:28')
 * - Recovers true recorded timestamps from fallback record properties (createdAt, timestamp, ID timestamp)
 * - Prevents calendar day shifts across timezones
 */

export const IST_TIMEZONE = 'Asia/Kolkata';

/**
 * Check if a date string/value represents a date-only (calendar date)
 * without a real, intended time component.
 */
export const isDateOnlyString = (val) => {
  if (!val) return false;
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  // Format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return true;
  // Format: YYYY-MM-DDT00:00:00(.000)?(Z|+00:00)? (UTC midnight representing a pure date)
  if (/^\d{4}-\d{2}-\d{2}T00:00:00(\.000)?(Z|\+00:00)?$/i.test(trimmed)) return true;
  return false;
};

/**
 * Safely parse any date input to a Date object in IST context.
 * Date-only strings (YYYY-MM-DD) are anchored to midday UTC to avoid day-shift
 * when rendered in any timezone.
 */
export const parseToDate = (input) => {
  if (!input && input !== 0) return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;

  if (typeof input === 'number') {
    const d = new Date(input);
    return isNaN(d.getTime()) ? null : d;
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;

    // Plain YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [y, m, day] = trimmed.split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, day, 12, 0, 0));
    }

    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
};

/**
 * Returns transaction timestamp in milliseconds.
 */
export const getTransactionTimestamp = (input) => {
  if (!input && input !== 0) return NaN;
  if (typeof input === 'number') return input;
  const d = parseToDate(input);
  return d && !isNaN(d.getTime()) ? d.getTime() : NaN;
};

/**
 * Try to extract actual creation/transaction timestamp from fallback record
 * when the primary date is date-only or lacks time information.
 */
export const extractActualTimestamp = (fallbackRecord) => {
  if (!fallbackRecord || typeof fallbackRecord !== 'object') return null;

  // 1. Explicit timestamp number or ISO properties
  const candidates = [
    fallbackRecord.timestamp,
    fallbackRecord.createdAt,
    fallbackRecord.paidAt,
    fallbackRecord.closedAt,
    fallbackRecord.recordedAt,
    fallbackRecord.dateTime,
  ];

  for (const cand of candidates) {
    if (cand) {
      if (typeof cand === 'string' && isDateOnlyString(cand)) continue;
      const parsed = parseToDate(cand);
      if (parsed) return parsed;
    }
  }

  // 2. Millisecond timestamp embedded inside record IDs (e.g., PAY-1773663000000, MIDWAY-1773663000000, tx-1773663000000)
  if (typeof fallbackRecord.id === 'string') {
    const match = fallbackRecord.id.match(/(\d{12,13})/);
    if (match) {
      const ts = Number(match[1]);
      const parsed = new Date(ts);
      if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= 2020 && parsed.getFullYear() <= 2040) {
        return parsed;
      }
    }
  }

  return null;
};

/**
 * Formats date and time into separate parts { date, time } in Indian Standard Time (Asia/Kolkata).
 *
 * If the input is date-only and no fallback timestamp is available,
 * time is returned as '' to prevent phantom '05:30' (UTC midnight) display.
 */
export const formatDateTimeParts = (dateInput, fallbackRecord = null, options = {}) => {
  const fallback = options.fallback || '—';
  if (!dateInput && !fallbackRecord) {
    return { date: fallback, time: '' };
  }

  let isDateOnly = isDateOnlyString(dateInput);
  let d = null;

  // If input has no time component, check if fallbackRecord has the actual timestamp
  if (isDateOnly && fallbackRecord) {
    const recovered = extractActualTimestamp(fallbackRecord);
    if (recovered) {
      d = recovered;
      isDateOnly = false;
    }
  }

  if (!d && dateInput) {
    d = parseToDate(dateInput);
  }

  if (!d && fallbackRecord) {
    d = extractActualTimestamp(fallbackRecord);
    if (d) isDateOnly = false;
  }

  if (!d) {
    return { date: String(dateInput || fallback), time: '' };
  }

  const formattedDate = d.toLocaleDateString('en-GB', {
    timeZone: IST_TIMEZONE,
    day: options.day || 'numeric',
    month: options.month || 'short',
    year: options.year || 'numeric',
  });

  if (isDateOnly) {
    return { date: formattedDate, time: '' };
  }

  const formattedTime = d.toLocaleTimeString('en-GB', {
    timeZone: IST_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: options.hour12 ?? false,
  });

  return { date: formattedDate, time: formattedTime };
};

/**
 * Formats date and time as a single string (e.g., '16 Oct 2026, 15:28') in IST.
 * If date-only, returns '16 Oct 2026' without phantom '05:30'.
 */
export const formatDateTime = (dateInput, fallbackRecord = null, options = {}) => {
  const { date, time } = formatDateTimeParts(dateInput, fallbackRecord, options);
  if (!date || date === '—') return '—';
  return time ? `${date}, ${time}` : date;
};

/**
 * Formats a calendar date in IST (e.g., '16 Oct 2026'). Never shifts days.
 */
export const formatDate = (dateInput, fallback = '—') => {
  if (!dateInput) return fallback;
  const d = parseToDate(dateInput);
  if (!d) return String(dateInput || fallback);

  return d.toLocaleDateString('en-GB', {
    timeZone: IST_TIMEZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

/**
 * Returns current timestamp as an ISO string.
 */
export const getNowISO = () => new Date().toISOString();

/**
 * Returns local YYYY-MM-DD string in IST timezone for default date input values.
 */
export const getLocalDateString = (input = new Date()) => {
  if (!input && input !== 0) return '';
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
    return input.trim();
  }

  const d = parseToDate(input);
  if (!d) return '';

  // Use Intl with Asia/Kolkata to extract YYYY-MM-DD
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);

  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;

  if (year && month && day) {
    return `${year}-${month}-${day}`;
  }

  return d.toISOString().slice(0, 10);
};

/**
 * Check if a date falls within a given preset range in IST context
 */
export const isDateInRange = (dateStr, filterType, customStart, customEnd) => {
  if (filterType === 'All Time') return true;

  const d = parseToDate(dateStr);
  if (!d) return false;

  const now = new Date();
  const todayStr = getLocalDateString(now);
  const targetStr = getLocalDateString(d);

  if (filterType === 'Today') {
    return targetStr === todayStr;
  }

  if (filterType === 'This Week') {
    const today = parseToDate(todayStr);
    const dayOfWeek = today.getDay();
    const firstDay = new Date(today);
    firstDay.setDate(today.getDate() - dayOfWeek);
    return d >= firstDay;
  }

  if (filterType === 'This Month') {
    const [ny, nm] = todayStr.split('-').map(Number);
    const [ty, tm] = targetStr.split('-').map(Number);
    return ny === ty && nm === tm;
  }

  if (filterType === 'Last Month') {
    const [ny, nm] = todayStr.split('-').map(Number);
    const [ty, tm] = targetStr.split('-').map(Number);
    let targetM = nm - 1;
    let targetY = ny;
    if (targetM < 1) {
      targetM = 12;
      targetY -= 1;
    }
    return ty === targetY && tm === targetM;
  }

  if (filterType === 'Custom Range') {
    if (customStart && customStart > targetStr) return false;
    if (customEnd && customEnd < targetStr) return false;
    return true;
  }

  return true;
};
