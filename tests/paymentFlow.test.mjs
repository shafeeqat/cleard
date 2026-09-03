import { assert, section, summary, makeObligation } from './helpers.mjs';
import { snapshotInstanceFromObligation, applyPaymentAnswer, applyGiroDeductionAnswer, applyKnownAmount, unpayInstance, isCleared } from '../js/models/monthlyInstances.js';
import { lastWorkingDayOfMonth, dayOfMonthDate } from '../js/utils/dates.js';

console.log('paymentFlow.test.mjs');

section('Yes/No payment answers (§26) — never "failed"/"missed"/"overdue"');
{
  const obligation = makeObligation({ id: 'obl_x', fixedAmount: 200 });
  const instance = snapshotInstanceFromObligation(obligation, '2026-09');
  assert(instance.status === 'outstanding', 'a plain fixed obligation starts outstanding');

  const paid = applyPaymentAnswer(instance, 'yes');
  assert(isCleared(paid), '"Yes" marks the instance cleared');
  assert(paid.amountActual === 200, 'amount actual defaults to the expected amount when not overridden');
  assert(paid.paidAt !== null, 'a paid timestamp is recorded');

  const stillOut = applyPaymentAnswer(instance, 'no');
  assert(stillOut.status === 'outstanding', '"No" simply leaves it outstanding');
  assert(!['failed', 'missed', 'overdue'].includes(stillOut.status), 'status is never framed as failed/missed/overdue');
}

section('GIRO "has this been deducted?" (§28)');
{
  const giro = makeObligation({ id: 'obl_giro', paymentMethod: 'giro', collectionDateType: 'fixed', collectionDayOfMonth: 1 });
  const instance = snapshotInstanceFromObligation(giro, '2026-09');
  assert(instance.status === 'scheduled', 'a GIRO obligation with a known collection date starts scheduled, not outstanding');

  const notYet = applyGiroDeductionAnswer(instance, 'no');
  assert(notYet.status === 'scheduled', 'answering "no" keeps it scheduled rather than downgrading to outstanding');

  const deducted = applyGiroDeductionAnswer(instance, 'yes');
  assert(isCleared(deducted), 'answering "yes" clears it like any other payment');
}

section('Variable amount arriving later (§13)');
{
  const spServices = makeObligation({ id: 'obl_sp', amountType: 'variable', billAvailability: 'unknown' });
  const instance = snapshotInstanceFromObligation(spServices, '2026-09');
  assert(instance.status === 'pending' && instance.amountStatus === 'pending', 'starts pending with no amount');

  const known = applyKnownAmount(instance, 217.43);
  assert(known.amountStatus === 'known' && known.amountExpected === 217.43, 'amount becomes known once entered');
  assert(known.status === 'outstanding', 'pending status is promoted to outstanding once the amount is known, not auto-paid');
}

section('Unpay reverts a cleared instance without erasing the known amount');
{
  const obligation = makeObligation({ id: 'obl_unpay', fixedAmount: 300 });
  const instance = snapshotInstanceFromObligation(obligation, '2026-09');
  const paid = applyPaymentAnswer(instance, 'yes');
  assert(isCleared(paid), 'sanity check: instance is cleared before unpaying');

  const unpaid = unpayInstance(paid);
  assert(unpaid.status === 'outstanding', 'a non-GIRO instance reverts to outstanding');
  assert(unpaid.amountActual === null, 'amount actually paid is cleared — nothing was actually paid anymore');
  assert(unpaid.paidAt === null, 'paid timestamp is cleared');
  assert(unpaid.amountExpected === 300, 'the known expected amount is preserved, not erased');

  const giro = makeObligation({ id: 'obl_giro_unpay', paymentMethod: 'giro', collectionDateType: 'fixed', collectionDayOfMonth: 1 });
  const giroInstance = snapshotInstanceFromObligation(giro, '2026-09');
  const giroPaid = applyGiroDeductionAnswer(giroInstance, 'yes');
  const giroUnpaid = unpayInstance(giroPaid);
  assert(giroUnpaid.status === 'scheduled', 'a GIRO instance reverts to scheduled, not outstanding');

  const stillOutstanding = unpayInstance(instance);
  assert(stillOutstanding === instance, 'unpaying an instance that was never cleared is a no-op');
}

section('Intended payment date is "pay-ahead" for last working day (§14)');
{
  // Real habit this models: salary lands end of August, and is used to pay
  // September's obligations — so September's instance should carry
  // August's last working day, never September's own.
  const salaryPayer = makeObligation({ id: 'obl_rent', paymentDatePreference: 'lastWorkingDay' });
  const instance = snapshotInstanceFromObligation(salaryPayer, '2026-09');
  assert(instance.intendedPaymentDate === lastWorkingDayOfMonth('2026-08'),
    `expected last working day of August, got ${instance.intendedPaymentDate}`);
  assert(instance.intendedPaymentDate !== lastWorkingDayOfMonth('2026-09'),
    'must not be the same month\'s own last working day');
}

section('Intended payment date for "day of month" stays same-month (§14)');
{
  // "1st of the month" is a same-month habit, not a pay-ahead one.
  const firstOfMonthPayer = makeObligation({ id: 'obl_sub', paymentDatePreference: 'dayOfMonth', paymentDayOfMonth: 1 });
  const instance = snapshotInstanceFromObligation(firstOfMonthPayer, '2026-09');
  assert(instance.intendedPaymentDate === dayOfMonthDate('2026-09', 1), 'day-of-month preference stays anchored to the instance\'s own month');
}

section('"Use my default preference" resolves against the caller\'s settings (§15)');
{
  const globalPayer = makeObligation({ id: 'obl_def', paymentDatePreference: 'global' });
  const withNoSettings = snapshotInstanceFromObligation(globalPayer, '2026-09');
  assert(withNoSettings.intendedPaymentDate === lastWorkingDayOfMonth('2026-08'), 'with no settings supplied, falls back to the app-wide default (last working day, pay-ahead), matching state.js\'s DEFAULT_SETTINGS');

  const withLastWorkingDayDefault = snapshotInstanceFromObligation(globalPayer, '2026-09', { preferredPaymentDay: 'lastWorkingDay' });
  assert(withLastWorkingDayDefault.intendedPaymentDate === lastWorkingDayOfMonth('2026-08'), 'global + user default lastWorkingDay pays ahead from August');

  const withDayOfMonthDefault = snapshotInstanceFromObligation(globalPayer, '2026-09', { preferredPaymentDay: 'dayOfMonth', preferredPaymentDayOfMonth: 5 });
  assert(withDayOfMonthDefault.intendedPaymentDate === dayOfMonthDate('2026-09', 5), 'global + user default day-of-month resolves to the 5th of September itself');
}

summary('paymentFlow.test.mjs');
