import { assert, section, summary, makeObligation } from './helpers.mjs';
import { projectObligationsForMonth, isProjectedMonth, realDataBoundary } from '../js/models/monthProjection.js';
import { buildInstancesForPlan, planMonthGeneration } from '../js/models/monthlyGeneration.js';
import { applyPaymentAnswer } from '../js/models/monthlyInstances.js';

console.log('monthProjection.test.mjs');

const currentMonth = '2026-09';

section('Real data boundary and projected-month detection');
{
  assert(realDataBoundary(currentMonth) === '2026-10', 'boundary is one month ahead of today, matching generateAheadInFirestore');
  assert(isProjectedMonth('2026-09', currentMonth) === false, 'the real current month is not projected');
  assert(isProjectedMonth('2026-10', currentMonth) === false, 'next month (really generated) is not projected');
  assert(isProjectedMonth('2026-11', currentMonth) === true, 'anything past the boundary is projected');
}

section('Within the real boundary, uses actual instances rather than computing new ones');
{
  const obligation = makeObligation({ id: 'obl_a', startMonth: '2026-01' });
  const realInstances = buildInstancesForPlan(planMonthGeneration({ obligations: [obligation], instances: [], targetMonth: '2026-09' }).toCreate, '2026-09');
  const results = projectObligationsForMonth({ obligations: [obligation], instances: realInstances, targetMonth: '2026-09', currentMonth });
  assert(results.length === 1, 'one result for the one obligation');
  assert(results[0].projected === false, 'within the real boundary, the result is the real instance, not a projection');
  assert(results[0].instance === realInstances[0], 'it is literally the same real instance object');
}

section('Beyond the boundary: a finite obligation that finishes on time correctly disappears (the trip-planning case)');
{
  // 3 payments left as of September; assuming on-time payment for Oct/Nov,
  // it should be fully done by December — exactly "I can see my
  // commitment is gone by the time of my December trip."
  const loan = makeObligation({ id: 'obl_loan', startMonth: '2026-07', occurrenceCount: 5 });
  // Simulate 2 already cleared (July, August).
  let instances = [];
  for (const m of ['2026-07', '2026-08']) {
    const created = buildInstancesForPlan(planMonthGeneration({ obligations: [loan], instances, targetMonth: m }).toCreate, m);
    instances = instances.concat(created.map((i) => applyPaymentAnswer(i, 'yes')));
  }
  assert(instances.length === 2, 'sanity check: 2 real cleared instances so far');

  const novemberResults = projectObligationsForMonth({ obligations: [loan], instances, targetMonth: '2026-11', currentMonth });
  assert(novemberResults.length === 1, 'November (3rd projected payment: Sep is real/unpaid, Oct real, Nov is the 5th) still shows the loan');

  const decemberResults = projectObligationsForMonth({ obligations: [loan], instances, targetMonth: '2026-12', currentMonth });
  assert(decemberResults.length === 0, 'by December, assuming on-time payment through November, the 5-payment loan has finished and disappears from the preview');
}

section('Beyond the boundary: an obligation starting in the far future still appears on its start month');
{
  const futureGym = makeObligation({ id: 'obl_gym', startMonth: '2027-01' });
  const results = projectObligationsForMonth({ obligations: [futureGym], instances: [], targetMonth: '2027-01', currentMonth });
  assert(results.length === 1 && results[0].projected === true, 'a future-starting obligation projects correctly on its own start month');

  const tooEarly = projectObligationsForMonth({ obligations: [futureGym], instances: [], targetMonth: '2026-12', currentMonth });
  assert(tooEarly.length === 0, 'it does not appear before its start month');
}

section('Beyond the boundary: an obligation that ends before the target month does not appear');
{
  const seasonal = makeObligation({ id: 'obl_seasonal', startMonth: '2026-01', endMonth: '2026-10' });
  const results = projectObligationsForMonth({ obligations: [seasonal], instances: [], targetMonth: '2026-12', currentMonth });
  assert(results.length === 0, 'an obligation that already ended does not show up in a later projection');
}

section('Projected instances carry real computed fields (due date etc.), never persisted');
{
  const obligation = makeObligation({ id: 'obl_due', startMonth: '2026-01', dueDateType: 'dayOfMonth', dueDayOfMonth: 15 });
  const [result] = projectObligationsForMonth({ obligations: [obligation], instances: [], targetMonth: '2026-12', currentMonth });
  assert(result.instance.dueDate === '2026-12-15', 'projected instance still computes a real due date for that month');
  assert(result.instance.status === 'outstanding', 'projected instance has a normal computed status, just never written anywhere');
}

summary('monthProjection.test.mjs');
