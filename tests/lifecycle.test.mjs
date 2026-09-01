import { assert, section, summary, makeObligation } from './helpers.mjs';
import {
  validateObligationInput, checkLifecycleConsistency, isScheduledMonth,
  isActiveForGeneration, remainingOccurrences, isLifecycleComplete, describeLifecycleChange,
} from '../js/models/obligations.js';

console.log('lifecycle.test.mjs');

section('Validation');
{
  const errors = validateObligationInput({ name: '', startMonth: '' });
  assert(errors.length >= 2, 'missing name and start month both produce errors');

  const fixedNoAmount = validateObligationInput({ name: 'Rent', startMonth: '2026-01', amountType: 'fixed' });
  assert(fixedNoAmount.some((e) => /amount/i.test(e)), 'fixed amount type without an amount is rejected');

  const variableNoAmount = validateObligationInput({ name: 'SP Services', startMonth: '2026-01', amountType: 'variable' });
  assert(variableNoAmount.length === 0, 'variable amount type is valid with no amount at all (§13)');
}

section('End date safety (§19) — obligation never disappears without explicit action');
{
  const obligation = makeObligation({ startMonth: '2026-01', endMonth: null, occurrenceCount: null });
  assert(isScheduledMonth(obligation, '2030-01'), 'open-ended obligation remains scheduled arbitrarily far into the future');
  assert(isActiveForGeneration(obligation, '2030-01', 0), 'open-ended obligation stays active for generation indefinitely');
}

section('Finite obligation by occurrence count');
{
  const loan = makeObligation({ id: 'obl_loan', occurrenceCount: 12, startMonth: '2026-01' });
  assert(remainingOccurrences(loan, 0) === 12, '0 cleared -> 12 remaining');
  assert(remainingOccurrences(loan, 3) === 9, '3 cleared -> 9 remaining');
  assert(remainingOccurrences(loan, 12) === 0, '12 cleared -> 0 remaining, floored not negative');
  assert(remainingOccurrences(loan, 15) === 0, 'over-cleared (should not happen) still floors at 0');
  assert(isLifecycleComplete(loan, 11) === false, '11/12 cleared is not yet complete');
  assert(isLifecycleComplete(loan, 12) === true, '12/12 cleared completes the lifecycle (§18)');
  assert(isActiveForGeneration(loan, '2027-06', 12) === false, 'a fully-cleared finite obligation stops generating new instances');
  assert(isActiveForGeneration(loan, '2027-06', 11) === true, 'a not-yet-complete finite obligation keeps generating');
}

section('Finite obligation by end date only (no occurrence count)');
{
  const cable = makeObligation({ id: 'obl_cable', startMonth: '2026-01', endMonth: '2026-06', occurrenceCount: null });
  assert(isScheduledMonth(cable, '2026-06') === true, 'end month itself is included');
  assert(isScheduledMonth(cable, '2026-07') === false, 'month after end month is excluded');
  assert(isLifecycleComplete(cable, 0) === false, 'endDate-only obligations never auto-complete from clears alone — only explicit end/delete (§19)');
}

section('Lifecycle consistency warning (§17) — never silently pick one');
{
  const inconsistent = makeObligation({ startMonth: '2026-01', endMonth: '2026-12', occurrenceCount: 6, frequency: 'monthly' });
  const warning = checkLifecycleConsistency(inconsistent);
  assert(warning !== null, 'a 12-month range paired with a 6-payment count produces a warning');
  assert(/12/.test(warning) && /6/.test(warning), 'warning mentions both the implied and configured counts');

  const consistent = makeObligation({ startMonth: '2026-01', endMonth: '2026-12', occurrenceCount: 12, frequency: 'monthly' });
  assert(checkLifecycleConsistency(consistent) === null, 'matching end date and occurrence count produce no warning');
}

section('Explicit lifecycle edit confirmation copy (§20)');
{
  const before = makeObligation({ occurrenceCount: 12, endMonth: null });
  const after = makeObligation({ occurrenceCount: 9, endMonth: null });
  const messages = describeLifecycleChange(before, after);
  assert(messages.some((m) => /12 payments to 9/.test(m)), 'reducing remaining count surfaces an explicit confirmation message');
  assert(messages.every((m) => /will not be changed/i.test(m) || /open-ended/.test(m)), 'every lifecycle-change message reassures history is untouched');
}

section('Yearly and custom-interval frequency scheduling');
{
  const yearly = makeObligation({ frequency: 'yearly', startMonth: '2026-03' });
  assert(isScheduledMonth(yearly, '2027-03') === true, 'yearly obligation recurs on its anniversary month');
  assert(isScheduledMonth(yearly, '2027-04') === false, 'yearly obligation does not occur in a non-anniversary month');

  const quarterly = makeObligation({ frequency: 'custom', customIntervalMonths: 3, startMonth: '2026-01' });
  assert(isScheduledMonth(quarterly, '2026-04') === true, 'a 3-month custom interval hits month 4');
  assert(isScheduledMonth(quarterly, '2026-03') === false, 'a 3-month custom interval skips month 3');
}

summary('lifecycle.test.mjs');
