// Pure date utilities — no Firebase, no DOM. Safe to import from Node tests.

export function monthKey(year, monthIndex0) {
  return `${year}-${String(monthIndex0 + 1).padStart(2, '0')}`;
}

export function monthKeyFromDate(date) {
  return monthKey(date.getFullYear(), date.getMonth());
}

export function parseMonthKey(key) {
  const [year, month] = key.split('-').map(Number);
  return { year, monthIndex0: month - 1 };
}

export function addMonths(monthKeyStr, delta) {
  const { year, monthIndex0 } = parseMonthKey(monthKeyStr);
  const d = new Date(Date.UTC(year, monthIndex0 + delta, 1));
  return monthKey(d.getUTCFullYear(), d.getUTCMonth());
}

export function monthLabel(monthKeyStr) {
  const { year, monthIndex0 } = parseMonthKey(monthKeyStr);
  const d = new Date(Date.UTC(year, monthIndex0, 1));
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function monthShortLabel(monthKeyStr) {
  const { year, monthIndex0 } = parseMonthKey(monthKeyStr);
  const d = new Date(Date.UTC(year, monthIndex0, 1));
  return d.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
}

function isWeekend(date) {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

// Last working day (Mon-Fri) of the given month, as YYYY-MM-DD. Does not
// account for public holidays — the app's "last working day" preference is a
// planning heuristic, not a payroll calendar.
export function lastWorkingDayOfMonth(monthKeyStr) {
  const { year, monthIndex0 } = parseMonthKey(monthKeyStr);
  const lastOfMonth = new Date(Date.UTC(year, monthIndex0 + 1, 0));
  while (isWeekend(lastOfMonth)) {
    lastOfMonth.setUTCDate(lastOfMonth.getUTCDate() - 1);
  }
  return toISODate(lastOfMonth);
}

export function dayOfMonthDate(monthKeyStr, day) {
  const { year, monthIndex0 } = parseMonthKey(monthKeyStr);
  const lastDay = new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
  const clamped = Math.min(day, lastDay);
  return toISODate(new Date(Date.UTC(year, monthIndex0, clamped)));
}

export function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

// Number of days in the given month (e.g. 28-31).
export function daysInMonth(monthKeyStr) {
  const { year, monthIndex0 } = parseMonthKey(monthKeyStr);
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

// Day-of-week (0 = Sunday) the 1st of the month falls on — used to pad a
// calendar grid's leading empty cells.
export function firstWeekdayOfMonth(monthKeyStr) {
  const { year, monthIndex0 } = parseMonthKey(monthKeyStr);
  return new Date(Date.UTC(year, monthIndex0, 1)).getUTCDay();
}

export function isMonthWithinRange(monthKeyStr, startMonthKeyStr, endMonthKeyStr) {
  if (monthKeyStr < startMonthKeyStr) return false;
  if (endMonthKeyStr && monthKeyStr > endMonthKeyStr) return false;
  return true;
}

// Number of monthly occurrences between two month keys, inclusive.
export function monthsBetweenInclusive(startMonthKeyStr, endMonthKeyStr) {
  const a = parseMonthKey(startMonthKeyStr);
  const b = parseMonthKey(endMonthKeyStr);
  return (b.year - a.year) * 12 + (b.monthIndex0 - a.monthIndex0) + 1;
}
