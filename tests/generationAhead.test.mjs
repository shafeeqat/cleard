import { assert, section, summary, makeObligation, makeFakeFirestore } from './helpers.mjs';
import { generateAheadInFirestore, generateMonthInFirestore } from '../js/models/monthlyGeneration.js';
import { instanceId } from '../js/models/monthlyInstances.js';
import { lastWorkingDayOfMonth } from '../js/utils/dates.js';

console.log('generationAhead.test.mjs');

section('Generates both current and next month in one call (§14 pay-ahead)');
{
  const obligation = makeObligation({ id: 'obl_rent', startMonth: '2026-01' });
  const fs = makeFakeFirestore({ obligations: [obligation] });
  const { created } = await generateAheadInFirestore(fs, 'user_1', '2026-09');
  assert(created.length === 2, `expected 2 instances created, got ${created.length}`);
  assert(fs.instances.some((i) => i.id === instanceId('obl_rent', '2026-09')), 'current month instance exists');
  assert(fs.instances.some((i) => i.id === instanceId('obl_rent', '2026-10')), 'next month instance exists too');
}

section('Idempotent across repeated calls');
{
  const obligation = makeObligation({ id: 'obl_util', startMonth: '2026-01' });
  const fs = makeFakeFirestore({ obligations: [obligation] });
  await generateAheadInFirestore(fs, 'user_1', '2026-09');
  const secondRun = await generateAheadInFirestore(fs, 'user_1', '2026-09');
  assert(secondRun.created.length === 0, 'second call for the same current month creates nothing new');
  assert(fs.instances.length === 2, 'still exactly 2 instances total, no duplicates');
}

section('Obligation starting next month generates only for next month');
{
  const obligation = makeObligation({ id: 'obl_future', startMonth: '2026-10' });
  const fs = makeFakeFirestore({ obligations: [obligation] });
  const { created } = await generateAheadInFirestore(fs, 'user_1', '2026-09');
  assert(created.length === 1, `expected exactly 1 instance, got ${created.length}`);
  assert(created[0].month === '2026-10', 'the single generated instance belongs to next month, not the current one');
}

section('Obligation ending this month does not generate next month');
{
  const obligation = makeObligation({ id: 'obl_ending', startMonth: '2026-01', endMonth: '2026-09' });
  const fs = makeFakeFirestore({ obligations: [obligation] });
  const { created } = await generateAheadInFirestore(fs, 'user_1', '2026-09');
  assert(created.length === 1, `expected exactly 1 instance (this month only), got ${created.length}`);
  assert(created[0].month === '2026-09', 'the generated instance is for the ending month itself');
}

section('End-to-end pay-ahead: next month\'s instance is payable NOW, within the real current month');
{
  const obligation = makeObligation({ id: 'obl_salary_payer', startMonth: '2026-01', paymentDatePreference: 'lastWorkingDay' });
  const fs = makeFakeFirestore({ obligations: [obligation] });
  await generateAheadInFirestore(fs, 'user_1', '2026-09');
  const nextMonthInstance = fs.instances.find((i) => i.id === instanceId('obl_salary_payer', '2026-10'));
  assert(nextMonthInstance !== undefined, 'next month (October) instance exists');
  assert(nextMonthInstance.intendedPaymentDate === lastWorkingDayOfMonth('2026-09'),
    `expected October's instance to be payable on September's last working day, got ${nextMonthInstance.intendedPaymentDate}`);
}

section('generateMonthInFirestore (single-month primitive) is unaffected — still only generates one month');
{
  const obligation = makeObligation({ id: 'obl_single', startMonth: '2026-01' });
  const fs = makeFakeFirestore({ obligations: [obligation] });
  const { created } = await generateMonthInFirestore(fs, 'user_1', '2026-09');
  assert(created.length === 1, 'single-month generation still creates exactly one instance');
  assert(fs.instances.every((i) => i.month === '2026-09'), 'no next-month instance leaks in from the single-month primitive');
}

summary('generationAhead.test.mjs');
