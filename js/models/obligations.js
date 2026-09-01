// Pure obligation lifecycle logic. No Firebase, no DOM — importable directly
// from Node tests. Firestore-facing wrappers live in js/firebase.js and call
// into these functions rather than duplicating the rules here.

import { monthKey, parseMonthKey, addMonths } from '../utils/dates.js';

export const AMOUNT_TYPES = ['fixed', 'variable'];
export const FREQUENCIES = ['monthly', 'weekly', 'yearly', 'custom'];
export const PAYMENT_METHODS = ['bank_transfer', 'giro', 'gxs', 'axs', 'paynow', 'cash', 'other'];
export const COLLECTION_DATE_TYPES = ['fixed', 'approximate', 'variable', 'none'];
export const OBLIGATION_STATUSES = ['active', 'ending_soon', 'completed', 'ended', 'deleted'];

export function newObligationId() {
  return 'obl_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Builds a normalized obligation record from user-entered fields, filling in
// defaults. Does not talk to Firestore — the caller is responsible for
// persisting the result and stamping id/userId/timestamps as appropriate.
export function createObligation(input, now = new Date()) {
  const errors = validateObligationInput(input);
  const obligation = {
    id: input.id || newObligationId(),
    userId: input.userId,
    name: input.name?.trim() || '',
    category: input.category || 'Other',
    notes: input.notes || '',
    amountType: input.amountType || 'fixed',
    fixedAmount: input.amountType === 'fixed' ? numOrNull(input.fixedAmount) : null,
    typicalMin: input.amountType === 'variable' ? numOrNull(input.typicalMin) : null,
    typicalMax: input.amountType === 'variable' ? numOrNull(input.typicalMax) : null,
    frequency: input.frequency || 'monthly',
    customIntervalMonths: input.frequency === 'custom' ? Math.max(1, Number(input.customIntervalMonths) || 1) : null,
    paymentDatePreference: input.paymentDatePreference || 'global', // 'global' | 'lastWorkingDay' | 'dayOfMonth'
    paymentDayOfMonth: input.paymentDatePreference === 'dayOfMonth' ? numOrNull(input.paymentDayOfMonth) : null,
    dueDateType: input.dueDateType || 'none', // 'dayOfMonth' | 'none'
    dueDayOfMonth: input.dueDateType === 'dayOfMonth' ? numOrNull(input.dueDayOfMonth) : null,
    collectionDateType: input.collectionDateType || 'none',
    collectionDayOfMonth: ['fixed', 'approximate'].includes(input.collectionDateType) ? numOrNull(input.collectionDayOfMonth) : null,
    paymentMethod: input.paymentMethod || 'bank_transfer',
    billAvailability: input.billAvailability || 'immediate', // 'immediate' | 'variable' | 'unknown'
    startMonth: input.startMonth, // required, 'YYYY-MM'
    endMonth: input.endMonth || null, // 'YYYY-MM' | null
    occurrenceCount: numOrNull(input.occurrenceCount),
    status: input.status || 'active',
    createdAt: input.createdAt || now.toISOString(),
    updatedAt: now.toISOString(),
  };
  return { obligation, errors };
}

function numOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function validateObligationInput(input) {
  const errors = [];
  if (!input.name || !input.name.trim()) errors.push('Name is required.');
  if (!input.startMonth) errors.push('Start month is required.');
  if (input.amountType === 'fixed' && numOrNull(input.fixedAmount) === null) {
    errors.push('Fixed amount obligations need an amount (or mark it Variable if unknown).');
  }
  if (input.endMonth && input.startMonth && input.endMonth < input.startMonth) {
    errors.push('End month cannot be before start month.');
  }
  if (input.occurrenceCount !== undefined && input.occurrenceCount !== null && input.occurrenceCount !== '') {
    const n = Number(input.occurrenceCount);
    if (!Number.isFinite(n) || n <= 0) errors.push('Number of payments must be a positive number.');
  }
  return errors;
}

// §17: if both endMonth and occurrenceCount are given, they're preserved as
// independent integrity signals rather than one silently overriding the
// other. This returns a warning message when they disagree, but never
// mutates either field itself.
export function checkLifecycleConsistency(obligation) {
  if (!obligation.endMonth || !obligation.occurrenceCount) return null;
  const monthsInRange = countScheduledMonthsInRange(obligation, obligation.startMonth, obligation.endMonth);
  if (monthsInRange !== obligation.occurrenceCount) {
    return `This obligation's end month (${obligation.endMonth}) implies ${monthsInRange} payment${monthsInRange === 1 ? '' : 's'}, ` +
      `but it's set to ${obligation.occurrenceCount}. Both are kept — review which is correct.`;
  }
  return null;
}

// How many scheduled months fall in [startMonth, endMonth] for this
// obligation's frequency, ignoring occurrenceCount entirely.
export function countScheduledMonthsInRange(obligation, startMonth, endMonth) {
  let count = 0;
  let cursor = startMonth;
  let guard = 0;
  while (cursor <= endMonth && guard < 2400) {
    if (isScheduledMonth(obligation, cursor)) count++;
    cursor = addMonths(cursor, 1);
    guard++;
  }
  return count;
}

// Whether this obligation's recurrence pattern includes the given month,
// independent of whether it has actually been generated yet or whether its
// lifecycle has completed. Frequency semantics are deliberately simple
// (§16 "do not overcomplicate"): every tracked obligation surfaces as at
// most one instance per month.
export function isScheduledMonth(obligation, targetMonth) {
  if (targetMonth < obligation.startMonth) return false;
  if (obligation.endMonth && targetMonth > obligation.endMonth) return false;

  switch (obligation.frequency) {
    case 'monthly':
    case 'weekly':
      return true;
    case 'yearly': {
      const start = parseMonthKey(obligation.startMonth);
      const target = parseMonthKey(targetMonth);
      return start.monthIndex0 === target.monthIndex0;
    }
    case 'custom': {
      const interval = Math.max(1, obligation.customIntervalMonths || 1);
      const start = parseMonthKey(obligation.startMonth);
      const target = parseMonthKey(targetMonth);
      const diff = (target.year - start.year) * 12 + (target.monthIndex0 - start.monthIndex0);
      return diff >= 0 && diff % interval === 0;
    }
    default:
      return true;
  }
}

// Whether `obligation` should still be considered when generating instances
// for `targetMonth` — i.e. it's scheduled AND its lifecycle (by occurrence
// count, evaluated against how many have actually been cleared) hasn't
// already completed. `clearedCount` is the number of this obligation's
// monthly instances with status 'paid', from real Firestore data — never
// inferred from the calendar alone, per §18/§19.
export function isActiveForGeneration(obligation, targetMonth, clearedCount) {
  if (obligation.status === 'completed' || obligation.status === 'ended' || obligation.status === 'deleted') return false;
  if (!isScheduledMonth(obligation, targetMonth)) return false;
  if (obligation.occurrenceCount != null && clearedCount >= obligation.occurrenceCount) return false;
  return true;
}

// §18: remaining payments for a finite (occurrenceCount-bound) obligation.
// Derived from actual cleared instances, never a manually-edited counter.
export function remainingOccurrences(obligation, clearedCount) {
  if (obligation.occurrenceCount == null) return null;
  return Math.max(obligation.occurrenceCount - clearedCount, 0);
}

// True once every scheduled occurrence has genuinely been cleared — the only
// condition (besides explicit user end/delete) under which an obligation
// may be marked completed. §10/§19.
export function isLifecycleComplete(obligation, clearedCount) {
  if (obligation.occurrenceCount != null) {
    return clearedCount >= obligation.occurrenceCount;
  }
  return false; // open-ended and endDate-only obligations complete only when explicitly ended.
}

// §20: building the confirmation copy for an explicit lifecycle edit. Pure —
// the caller decides whether to actually apply the change after the user
// confirms.
export function describeLifecycleChange(previous, next) {
  const messages = [];
  if (previous.occurrenceCount != null && next.occurrenceCount != null && previous.occurrenceCount !== next.occurrenceCount) {
    messages.push(
      `This changes the remaining lifecycle from ${previous.occurrenceCount} payments to ${next.occurrenceCount}. ` +
      `Historical payments will not be changed.`
    );
  }
  if (previous.endMonth !== next.endMonth) {
    if (!previous.endMonth && next.endMonth) {
      messages.push(`This sets an end date of ${next.endMonth}. Historical payments will not be changed.`);
    } else if (previous.endMonth && !next.endMonth) {
      messages.push(`This removes the end date, making the obligation open-ended again.`);
    } else {
      messages.push(`This changes the end date from ${previous.endMonth} to ${next.endMonth}. Historical payments will not be changed.`);
    }
  }
  return messages;
}

export { monthKey };
