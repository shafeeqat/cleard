// Pure monthly-instance logic. An instance is a snapshot of one obligation's
// occurrence in one month — once created it never re-reads the master
// obligation for its display fields, so editing the master later can't
// rewrite history (§10, §32).

import { dayOfMonthDate, lastWorkingDayOfMonth, addMonths } from '../utils/dates.js';

export const INSTANCE_STATUSES = ['outstanding', 'pending', 'scheduled', 'paid', 'skipped'];

export function instanceId(obligationId, month) {
  return `${obligationId}_${month}`;
}

// §14: when the user's habit is to pay ahead of the due month using a
// month-end salary (paymentDatePreference 'lastWorkingDay'), the intended
// payment date is the last working day of the month BEFORE this instance's
// month — e.g. paying September's obligations at the end of August — not
// the last working day of the same month. 'dayOfMonth' (e.g. "1st of the
// month") stays anchored to the instance's own month, since that's a
// same-month payment habit, not a pay-ahead one. A 'global' preference
// resolves against the caller-supplied user defaults instead of the
// obligation's own (absent) override.
function resolveIntendedPaymentDate(obligation, month, settingsDefaults) {
  const preference = obligation.paymentDatePreference === 'global'
    ? (settingsDefaults.preferredPaymentDay || 'lastWorkingDay')
    : obligation.paymentDatePreference;
  const dayOfMonth = obligation.paymentDatePreference === 'global'
    ? settingsDefaults.preferredPaymentDayOfMonth
    : obligation.paymentDayOfMonth;

  if (preference === 'dayOfMonth' && dayOfMonth) return dayOfMonthDate(month, dayOfMonth);
  if (preference === 'lastWorkingDay') return lastWorkingDayOfMonth(addMonths(month, -1));
  return null;
}

// Builds the snapshot document for one obligation's occurrence in `month`.
// Pure — does not check whether the instance already exists; the generation
// module (monthlyGeneration.js) is responsible for idempotency.
// `settingsDefaults` is the signed-in user's Settings > Payment preferences
// ({ preferredPaymentDay, preferredPaymentDayOfMonth }), used only when this
// obligation itself is set to "use my default preference".
export function snapshotInstanceFromObligation(obligation, month, settingsDefaults = {}, now = new Date()) {
  // Variable obligations never start "known" — there is no per-obligation
  // stored current amount to fall back on (only an optional typical
  // min/max hint, which §12 explicitly says is never authoritative), so
  // every variable instance starts pending until this month's real amount
  // is entered via applyKnownAmount. billAvailability only distinguishes
  // *why* a fixed amount might still be missing in future extensions; it
  // does not currently gate this check.
  const amountKnown = obligation.amountType === 'fixed' && obligation.fixedAmount != null;

  const amountExpected = obligation.amountType === 'fixed' ? obligation.fixedAmount : null;

  const dueDate = obligation.dueDateType === 'dayOfMonth' && obligation.dueDayOfMonth
    ? dayOfMonthDate(month, obligation.dueDayOfMonth)
    : null;

  const intendedPaymentDate = resolveIntendedPaymentDate(obligation, month, settingsDefaults);

  const collectionDate = (obligation.collectionDateType === 'fixed' || obligation.collectionDateType === 'approximate') && obligation.collectionDayOfMonth
    ? dayOfMonthDate(month, obligation.collectionDayOfMonth)
    : null;

  const initialStatus = deriveInitialStatus(obligation, amountKnown);

  return {
    id: instanceId(obligation.id, month),
    obligationId: obligation.id,
    userId: obligation.userId,
    month,
    name: obligation.name,
    category: obligation.category,
    paymentMethod: obligation.paymentMethod,
    amountType: obligation.amountType,
    amountExpected,
    amountActual: null,
    amountStatus: amountKnown ? 'known' : 'pending',
    dueDate,
    intendedPaymentDate,
    collectionDate,
    collectionDateType: obligation.collectionDateType,
    status: initialStatus,
    paidAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function deriveInitialStatus(obligation, amountKnown) {
  if (!amountKnown) return 'pending';
  if (obligation.paymentMethod === 'giro' && obligation.collectionDateType !== 'none') return 'scheduled';
  return 'outstanding';
}

// §26/§28: the only two allowed transitions from the primary interaction.
// `answer` is 'yes' | 'no'. Never produces 'failed'/'missed'/'overdue' —
// those are just display-layer framing of 'outstanding' past its due date.
export function applyPaymentAnswer(instance, answer, { amountActual, now = new Date() } = {}) {
  if (answer === 'yes') {
    return {
      ...instance,
      status: 'paid',
      amountActual: amountActual != null ? amountActual : (instance.amountActual ?? instance.amountExpected),
      amountStatus: 'known',
      paidAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  }
  // 'no' simply leaves it outstanding — explicitly reverts a 'scheduled' or
  // 'pending' guess back to a plain outstanding state so it surfaces in
  // Needs Attention rather than silently staying hidden in Scheduled/Pending.
  return {
    ...instance,
    status: 'outstanding',
    updatedAt: now.toISOString(),
  };
}

// GIRO-specific: "has this been deducted?" — same yes/no shape as
// applyPaymentAnswer but keeps 'scheduled' as the "no" outcome (§28) rather
// than downgrading to 'outstanding', since an undeducted GIRO is still
// legitimately scheduled, not neglected.
export function applyGiroDeductionAnswer(instance, answer, { amountActual, now = new Date() } = {}) {
  if (answer === 'yes') {
    return applyPaymentAnswer(instance, 'yes', { amountActual, now });
  }
  return { ...instance, status: 'scheduled', updatedAt: now.toISOString() };
}

// User can supply the amount once a variable bill arrives, without
// necessarily marking it paid yet.
export function applyKnownAmount(instance, amount, now = new Date()) {
  return {
    ...instance,
    amountExpected: amount,
    amountStatus: 'known',
    status: instance.status === 'pending' ? 'outstanding' : instance.status,
    updatedAt: now.toISOString(),
  };
}

export function isCleared(instance) {
  return instance.status === 'paid';
}

// Reverts a cleared instance back to outstanding (or scheduled, for GIRO) —
// "I marked this paid by mistake." The known bill amount (amountExpected)
// is left as-is since that fact doesn't change; amountActual/paidAt are
// cleared since it's no longer true that anything was actually paid. The
// caller is responsible for the confirmation prompt and for reopening the
// master obligation if this was its completing occurrence (see
// obligations.js#isLifecycleComplete and views/obligationDetail.js).
export function unpayInstance(instance, now = new Date()) {
  if (!isCleared(instance)) return instance;
  return {
    ...instance,
    status: instance.paymentMethod === 'giro' && instance.collectionDateType !== 'none' ? 'scheduled' : 'outstanding',
    amountActual: null,
    paidAt: null,
    updatedAt: now.toISOString(),
  };
}
