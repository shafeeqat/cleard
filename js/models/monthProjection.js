// Looking ahead beyond the real generated window (today + 1 month, see
// generateAheadInFirestore) is inherently speculative — there's no real
// instance yet, and whether a finite obligation is still active by then
// depends on payments that haven't happened. This module answers "what
// would probably still be active in month X" for planning purposes (e.g.
// checking whether a loan finishes before a trip), clearly distinct from
// the real, authoritative data that drives Home/History/pay actions.
//
// Projection assumption: every scheduled month from today through the
// target month is paid on time. Stated plainly to the user — it's a
// planning aid, never a promise.

import { isActiveForGeneration, isScheduledMonth } from './obligations.js';
import { isCleared, snapshotInstanceFromObligation } from './monthlyInstances.js';
import { addMonths } from '../utils/dates.js';

// The last month that generateAheadInFirestore actually creates real data
// for. Months after this are projection-only.
export function realDataBoundary(currentMonth) {
  return addMonths(currentMonth, 1);
}

export function isProjectedMonth(month, currentMonth) {
  return month > realDataBoundary(currentMonth);
}

// How many of this obligation's occurrences would be cleared by the time
// `targetMonth` starts, assuming every scheduled month from `currentMonth`
// onward (exclusive of targetMonth) gets paid on time. Real cleared months
// and assumed-future months are combined as a set of distinct month keys —
// not summed — so a month that's already actually cleared is never counted
// twice even though it also falls inside the "assume paid" range.
function projectedClearedCount(obligation, instances, targetMonth, currentMonth) {
  const clearedMonths = new Set(
    instances.filter((i) => i.obligationId === obligation.id && isCleared(i)).map((i) => i.month)
  );
  let cursor = currentMonth;
  while (cursor < targetMonth) {
    if (isScheduledMonth(obligation, cursor)) clearedMonths.add(cursor);
    cursor = addMonths(cursor, 1);
  }
  return clearedMonths.size;
}

// Returns [{ obligation, instance, projected }] for `targetMonth`:
// - projected: false, real instance — for months within the real boundary.
// - projected: true, a computed (never persisted) snapshot — for months
//   beyond it, only included if the obligation is still projected active.
export function projectObligationsForMonth({ obligations, instances, targetMonth, currentMonth, settingsDefaults = {} }) {
  const boundary = realDataBoundary(currentMonth);
  const beyondBoundary = targetMonth > boundary;

  const results = [];
  for (const obligation of obligations) {
    if (obligation.status === 'deleted') continue;

    if (!beyondBoundary) {
      const actualCleared = instances.filter((i) => i.obligationId === obligation.id && isCleared(i)).length;
      if (!isActiveForGeneration(obligation, targetMonth, actualCleared)) continue;
      const real = instances.find((i) => i.obligationId === obligation.id && i.month === targetMonth);
      results.push(real
        ? { obligation, instance: real, projected: false }
        : { obligation, instance: snapshotInstanceFromObligation(obligation, targetMonth, settingsDefaults), projected: true });
      continue;
    }

    const effectiveCleared = projectedClearedCount(obligation, instances, targetMonth, currentMonth);
    if (!isActiveForGeneration(obligation, targetMonth, effectiveCleared)) continue;
    results.push({ obligation, instance: snapshotInstanceFromObligation(obligation, targetMonth, settingsDefaults), projected: true });
  }
  return results;
}
