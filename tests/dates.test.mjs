import { assert, summary } from './helpers.mjs';
import {
  monthKey, addMonths, lastWorkingDayOfMonth, dayOfMonthDate, monthsBetweenInclusive,
} from '../js/utils/dates.js';

console.log('dates.test.mjs');

assert(monthKey(2026, 0) === '2026-01', 'monthKey pads single-digit months');
assert(addMonths('2026-12', 1) === '2027-01', 'addMonths rolls over year boundary');
assert(addMonths('2026-03', -3) === '2025-12', 'addMonths handles negative deltas across year boundary');

// October 2026: 31st is a Saturday -> last working day is Friday 30th.
assert(lastWorkingDayOfMonth('2026-10') === '2026-10-30', 'last working day skips a Saturday month-end');
// September 2026: 30th is a Wednesday -> last working day is the 30th itself.
assert(lastWorkingDayOfMonth('2026-09') === '2026-09-30', 'last working day of a mid-week month-end is unchanged');

assert(dayOfMonthDate('2026-02', 31) === '2026-02-28', 'day-of-month clamps to the actual last day of a short month');
assert(dayOfMonthDate('2026-10', 5) === '2026-10-05', 'day-of-month resolves a normal day');

assert(monthsBetweenInclusive('2026-01', '2026-12') === 12, 'a full calendar year is 12 inclusive months');
assert(monthsBetweenInclusive('2026-01', '2026-01') === 1, 'same start/end month counts as one month');

summary('dates.test.mjs');
