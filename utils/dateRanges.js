/** Pakistan timezone (UTC+5) */
const PK_TZ = 'Asia/Karachi';

/**
 * Get current date parts (year, month, day) in Pakistan timezone.
 * month is 1-12, day is 1-31.
 */
function getPakistanDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: PK_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const str = formatter.format(date);
  const [y, m, d] = str.split('-').map(Number);
  return { year: y, month: m, day: d };
}

/**
 * Convert Pakistan local time (midnight or end-of-day) to UTC Date.
 * @param {number} year - Full year
 * @param {number} month - 1-12
 * @param {number} day - 1-31
 * @param {boolean} endOfDay - if true, 23:59:59.999 PKT; else 00:00:00 PKT
 */
function pkToUtc(year, month, day, endOfDay = false) {
  if (endOfDay) {
    // 23:59:59.999 PKT = 18:59:59.999 UTC same calendar day
    return new Date(Date.UTC(year, month - 1, day, 18, 59, 59, 999));
  }
  // 00:00:00 PKT = 19:00:00 UTC previous calendar day
  return new Date(Date.UTC(year, month - 1, day - 1, 19, 0, 0, 0));
}

/**
 * Get weekday (0=Sun, 1=Mon, ... 6=Sat) for a given date in Pakistan.
 */
function getPakistanWeekday(year, month, day) {
  // Noon PKT = 07:00 UTC on same calendar day
  const utcNoon = new Date(Date.UTC(year, month - 1, day, 7, 0, 0, 0));
  return utcNoon.getUTCDay();
}

/**
 * Parse YYYY-MM-DD date string and return UTC Date for 00:00:00 PKT that day.
 */
function parseDateStringToUtcStart(dateStr) {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return pkToUtc(y, m, d, false);
}

/**
 * Parse YYYY-MM-DD date string and return UTC Date for 23:59:59.999 PKT that day.
 */
function parseDateStringToUtcEnd(dateStr) {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return pkToUtc(y, m, d, true);
}

/**
 * Get date range from custom start_date and end_date (YYYY-MM-DD).
 * Interpreted as Pakistan calendar dates: start = 00:00:00 PKT, end = 23:59:59.999 PKT.
 * Returns { start, end, startPK, endPK } or null if invalid.
 */
function getCustomDateRange(startDateStr, endDateStr) {
  const start = parseDateStringToUtcStart(startDateStr);
  const end = parseDateStringToUtcEnd(endDateStr);
  if (!start || !end || start.getTime() > end.getTime()) return null;
  const [, sy, sm, sd] = startDateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/).map(Number);
  const [, ey, em, ed] = endDateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/).map(Number);
  return {
    start,
    end,
    startPK: formatPakistanISO(sy, sm, sd, 0, 0, 0),
    endPK: formatPakistanISO(ey, em, ed, 23, 59, 59)
  };
}

/**
 * Get start and end dates for report periods in Pakistan timezone.
 * Returns { start, end } as UTC Date objects for MongoDB queries,
 * and { startPK, endPK } as ISO strings in Pakistan time for display.
 */
function getDateRange(period) {
  const now = new Date();
  const { year, month, day } = getPakistanDateParts(now);

  let start;
  let end;
  let startPK;
  let endPK;

  switch (period) {
    case 'today': {
      start = pkToUtc(year, month, day, false);
      end = pkToUtc(year, month, day, true);
      startPK = formatPakistanISO(year, month, day, 0, 0, 0);
      endPK = formatPakistanISO(year, month, day, 23, 59, 59);
      break;
    }
    case 'yesterday': {
      const yesterdayDate = new Date(Date.UTC(year, month - 1, day - 1, 7, 0, 0, 0));
      const yY = yesterdayDate.getUTCFullYear();
      const yM = yesterdayDate.getUTCMonth() + 1;
      const yD = yesterdayDate.getUTCDate();
      start = pkToUtc(yY, yM, yD, false);
      end = pkToUtc(yY, yM, yD, true);
      startPK = formatPakistanISO(yY, yM, yD, 0, 0, 0);
      endPK = formatPakistanISO(yY, yM, yD, 23, 59, 59);
      break;
    }
    case 'this_week': {
      const weekday = getPakistanWeekday(year, month, day);
      const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
      const monday = new Date(Date.UTC(year, month - 1, day + mondayOffset, 7, 0, 0, 0));
      const mY = monday.getUTCFullYear();
      const mM = monday.getUTCMonth() + 1;
      const mD = monday.getUTCDate();
      const sunday = new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000);
      const sY = sunday.getUTCFullYear();
      const sM = sunday.getUTCMonth() + 1;
      const sD = sunday.getUTCDate();
      start = pkToUtc(mY, mM, mD, false);
      end = pkToUtc(sY, sM, sD, true);
      startPK = formatPakistanISO(mY, mM, mD, 0, 0, 0);
      endPK = formatPakistanISO(sY, sM, sD, 23, 59, 59);
      break;
    }
    case 'last_week': {
      const weekday = getPakistanWeekday(year, month, day);
      const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
      const thisMonday = new Date(Date.UTC(year, month - 1, day + mondayOffset, 7, 0, 0, 0));
      const lastMonday = new Date(thisMonday.getTime() - 7 * 24 * 60 * 60 * 1000);
      const lmY = lastMonday.getUTCFullYear();
      const lmM = lastMonday.getUTCMonth() + 1;
      const lmD = lastMonday.getUTCDate();
      const lastSunday = new Date(lastMonday.getTime() + 6 * 24 * 60 * 60 * 1000);
      const lsY = lastSunday.getUTCFullYear();
      const lsM = lastSunday.getUTCMonth() + 1;
      const lsD = lastSunday.getUTCDate();
      start = pkToUtc(lmY, lmM, lmD, false);
      end = pkToUtc(lsY, lsM, lsD, true);
      startPK = formatPakistanISO(lmY, lmM, lmD, 0, 0, 0);
      endPK = formatPakistanISO(lsY, lsM, lsD, 23, 59, 59);
      break;
    }
    case 'this_month': {
      // Last day of current month (month is 1-12): day 0 of next month
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      start = pkToUtc(year, month, 1, false);
      end = pkToUtc(year, month, lastDay, true);
      startPK = formatPakistanISO(year, month, 1, 0, 0, 0);
      endPK = formatPakistanISO(year, month, lastDay, 23, 59, 59);
      break;
    }
    case 'last_month': {
      const lastMonth = month === 1 ? 12 : month - 1;
      const lastMonthYear = month === 1 ? year - 1 : year;
      const lastMonthLastDay = new Date(Date.UTC(lastMonthYear, lastMonth, 0)).getUTCDate();
      start = pkToUtc(lastMonthYear, lastMonth, 1, false);
      end = pkToUtc(lastMonthYear, lastMonth, lastMonthLastDay, true);
      startPK = formatPakistanISO(lastMonthYear, lastMonth, 1, 0, 0, 0);
      endPK = formatPakistanISO(lastMonthYear, lastMonth, lastMonthLastDay, 23, 59, 59);
      break;
    }
    case 'this_year': {
      start = pkToUtc(year, 1, 1, false);
      end = pkToUtc(year, 12, 31, true);
      startPK = formatPakistanISO(year, 1, 1, 0, 0, 0);
      endPK = formatPakistanISO(year, 12, 31, 23, 59, 59);
      break;
    }
    default:
      return null;
  }

  return { start, end, startPK, endPK };
}

/**
 * Format date/time as ISO-like string in Pakistan (for display).
 * Returns string like "2026-03-06T00:00:00+05:00"
 */
function formatPakistanISO(year, month, day, hour, minute, second) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}+05:00`;
}

/**
 * Format a UTC Date as Pakistan local date-time string (for order createdAt in response).
 */
function formatDateInPakistan(utcDate) {
  return new Date(utcDate).toLocaleString('en-CA', {
    timeZone: PK_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

/**
 * Format a UTC Date in Pakistan timezone as "DD-MM-YYYY   HH:MM AM/PM".
 * Uses Asia/Karachi (PKT, UTC+5) for conversion.
 */
function formatDateTimePakistan(utcDate) {
  if (!utcDate) return null;
  const d = new Date(utcDate);
  const dateStr = d.toLocaleDateString('en-GB', {
    timeZone: PK_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
  const timeStr = d.toLocaleTimeString('en-US', {
    timeZone: PK_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
  const [day, month, year] = dateStr.split('/');
  if (!day || !month || !year) return null;
  const timeUpper = timeStr.replace(/\bam\b/i, 'AM').replace(/\bpm\b/i, 'PM').trim();
  return `${day}-${month}-${year}   ${timeUpper}`;
}

module.exports = { getDateRange, getCustomDateRange, formatDateInPakistan, formatDateTimePakistan, PK_TZ };
