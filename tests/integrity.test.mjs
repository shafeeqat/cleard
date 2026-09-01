import { assert, section, summary, makeObligation } from './helpers.mjs';
import { checkMonthIntegrity } from '../js/models/integrity.js';
import { buildInstancesForPlan, planMonthGeneration } from '../js/models/monthlyGeneration.js';

console.log('integrity.test.mjs');

section('Fully generated month reports zero missing');
{
  const obligations = [makeObligation({ id: 'obl_a' }), makeObligation({ id: 'obl_b' })];
  const instances = obligations.flatMap((o) =>
    buildInstancesForPlan(planMonthGeneration({ obligations: [o], instances: [], targetMonth: '2026-09' }).toCreate, '2026-09')
  );
  const result = checkMonthIntegrity({ obligations, instances, targetMonth: '2026-09' });
  assert(result.expectedCount === 2, 'both active obligations are expected');
  assert(result.actualCount === 2, 'both instances are present');
  assert(result.missing.length === 0, 'nothing is flagged as missing');
}

section('Missing recurring obligation is detected (§23)');
{
  const loan = makeObligation({ id: 'obl_loan', name: 'Personal Loan', occurrenceCount: 24, startMonth: '2026-01' });
  const other = makeObligation({ id: 'obl_other', startMonth: '2026-01' });
  // Only "other" was generated for October; the loan's instance is missing
  // even though it's still well within its 24-payment lifecycle.
  const instances = buildInstancesForPlan(
    planMonthGeneration({ obligations: [other], instances: [], targetMonth: '2026-10' }).toCreate,
    '2026-10'
  );
  const result = checkMonthIntegrity({ obligations: [loan, other], instances, targetMonth: '2026-10' });
  assert(result.expectedCount === 2, 'both obligations are still expected in October');
  assert(result.actualCount === 1, 'only one instance actually exists');
  assert(result.missing.length === 1, 'exactly one obligation is flagged missing');
  assert(result.missing[0].obligation.id === 'obl_loan', 'the missing obligation is correctly identified as the loan');
  assert(result.missing[0].remaining === 24, 'the missing entry reports its remaining payment count for context');
}

section('A completed finite obligation is correctly excluded, not flagged missing');
{
  const loan = makeObligation({ id: 'obl_done', occurrenceCount: 2, startMonth: '2026-01' });
  const paidJan = { ...buildInstancesForPlan(planMonthGeneration({ obligations: [loan], instances: [], targetMonth: '2026-01' }).toCreate, '2026-01')[0], status: 'paid' };
  const paidFeb = { ...buildInstancesForPlan(planMonthGeneration({ obligations: [loan], instances: [paidJan], targetMonth: '2026-02' }).toCreate, '2026-02')[0], status: 'paid' };
  const result = checkMonthIntegrity({ obligations: [loan], instances: [paidJan, paidFeb], targetMonth: '2026-03' });
  assert(result.expectedCount === 0, 'a fully cleared 2-payment obligation is not expected again in March');
  assert(result.missing.length === 0, 'it is not flagged as a missing obligation');
}

summary('integrity.test.mjs');
