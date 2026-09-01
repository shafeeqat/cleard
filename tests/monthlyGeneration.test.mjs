import { assert, section, summary, makeObligation } from './helpers.mjs';
import { planMonthGeneration, buildInstancesForPlan, countClearedByObligation } from '../js/models/monthlyGeneration.js';
import { instanceId, applyPaymentAnswer } from '../js/models/monthlyInstances.js';
import { addMonths } from '../js/utils/dates.js';

console.log('monthlyGeneration.test.mjs');

section('New user starts with zero obligations');
{
  const { toCreate } = planMonthGeneration({ obligations: [], instances: [], targetMonth: '2026-09' });
  assert(toCreate.length === 0, 'no obligations means nothing is ever generated');
}

section('Recurring monthly obligation appears every month');
{
  const rent = makeObligation({ id: 'obl_rent', startMonth: '2026-01' });
  let instances = [];
  let month = '2026-01';
  for (let i = 0; i < 6; i++) {
    const { toCreate } = planMonthGeneration({ obligations: [rent], instances, targetMonth: month });
    instances = instances.concat(buildInstancesForPlan(toCreate, month));
    month = addMonths(month, 1);
  }
  assert(instances.length === 6, 'generating 6 consecutive months yields 6 instances');
  assert(new Set(instances.map((i) => i.month)).size === 6, 'each instance belongs to a distinct month');
}

section('Finite obligation produces exactly the configured occurrence count');
{
  const loan = makeObligation({ id: 'obl_loan', occurrenceCount: 12, startMonth: '2026-01' });
  let instances = [];
  let month = '2026-01';
  // Generate and immediately clear each month's instance, for 20 months —
  // well past the 12-payment lifecycle — to prove generation stops itself.
  for (let i = 0; i < 20; i++) {
    const { toCreate } = planMonthGeneration({ obligations: [loan], instances, targetMonth: month });
    const created = buildInstancesForPlan(toCreate, month);
    instances = instances.concat(created.map((inst) => applyPaymentAnswer(inst, 'yes')));
    month = addMonths(month, 1);
  }
  assert(instances.length === 12, `exactly 12 instances were ever generated, got ${instances.length}`);
  assert(countClearedByObligation(instances).obl_loan === 12, 'all 12 are cleared');
}

section('Duplicate generation is idempotent (§21/§8)');
{
  const utilities = makeObligation({ id: 'obl_util', startMonth: '2026-01' });
  const month = '2026-03';
  let instances = [];
  const first = planMonthGeneration({ obligations: [utilities], instances, targetMonth: month });
  instances = instances.concat(buildInstancesForPlan(first.toCreate, month));
  assert(instances.length === 1, 'first generation run creates one instance');

  const second = planMonthGeneration({ obligations: [utilities], instances, targetMonth: month });
  assert(second.toCreate.length === 0, 'second generation run for the same month creates nothing new');

  // Simulate running generation for the same month a third time on a fresh
  // pass over the same accumulated instances array.
  const third = planMonthGeneration({ obligations: [utilities], instances, targetMonth: month });
  assert(third.toCreate.length === 0, 'third run is still a no-op');
  assert(instances.filter((i) => i.id === instanceId('obl_util', month)).length === 1, 'no duplicate instance id was ever created');
}

section('Unknown amount does not remove the instance (§13)');
{
  const spServices = makeObligation({ id: 'obl_sp', amountType: 'variable', billAvailability: 'unknown', startMonth: '2026-01' });
  const { toCreate } = planMonthGeneration({ obligations: [spServices], instances: [], targetMonth: '2026-09' });
  const [instance] = buildInstancesForPlan(toCreate, '2026-09');
  assert(instance !== undefined, 'an instance is still created for a variable obligation with no known amount');
  assert(instance.amountStatus === 'pending', 'its amount status is pending, not silently defaulted');
  assert(instance.status === 'pending', 'instance status reflects the pending amount rather than being hidden');
}

section('Unknown/variable collection date does not remove the instance (§13, §28)');
{
  const giroBill = makeObligation({ id: 'obl_giro', paymentMethod: 'giro', collectionDateType: 'variable', startMonth: '2026-01' });
  const { toCreate } = planMonthGeneration({ obligations: [giroBill], instances: [], targetMonth: '2026-09' });
  const [instance] = buildInstancesForPlan(toCreate, '2026-09');
  assert(instance !== undefined, 'GIRO obligation with a variable (unknown-day) collection date still generates an instance');
  assert(instance.collectionDate === null, 'the collection date itself is left null rather than guessed');
}

section('End date boundary (§17/§19)');
{
  const seasonal = makeObligation({ id: 'obl_seasonal', startMonth: '2026-01', endMonth: '2026-03' });
  const months = ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04'];
  const results = months.map((m) => planMonthGeneration({ obligations: [seasonal], instances: [], targetMonth: m }).toCreate.length);
  assert(results.join(',') === '0,1,1,1,0', `obligation only generates within [start, end] inclusive, got ${results.join(',')}`);
}

section('Extending an obligation resumes future generation (§20)');
{
  let obligation = makeObligation({ id: 'obl_ext', startMonth: '2026-01', endMonth: '2026-03' });
  let instances = [];
  for (const m of ['2026-01', '2026-02', '2026-03']) {
    instances = instances.concat(buildInstancesForPlan(planMonthGeneration({ obligations: [obligation], instances, targetMonth: m }).toCreate, m));
  }
  assert(planMonthGeneration({ obligations: [obligation], instances, targetMonth: '2026-04' }).toCreate.length === 0, 'no instance generates past the original end date');

  obligation = { ...obligation, endMonth: '2026-06' };
  const resumed = planMonthGeneration({ obligations: [obligation], instances, targetMonth: '2026-04' });
  assert(resumed.toCreate.length === 1, 'extending the end date resumes generation for the newly-covered month');
  assert(instances.length === 3, 'previously generated historical instances were untouched by the extension');
}

section('Early explicit end stops future generation, keeps history (§36)');
{
  let obligation = makeObligation({ id: 'obl_end_early', startMonth: '2026-01' });
  let instances = [];
  for (const m of ['2026-01', '2026-02', '2026-03']) {
    instances = instances.concat(buildInstancesForPlan(planMonthGeneration({ obligations: [obligation], instances, targetMonth: m }).toCreate, m));
  }
  obligation = { ...obligation, status: 'ended', endMonth: '2026-03' };
  const afterEnd = planMonthGeneration({ obligations: [obligation], instances, targetMonth: '2026-04' });
  assert(afterEnd.toCreate.length === 0, 'an explicitly-ended obligation generates nothing further');
  assert(instances.length === 3, 'the 3 historical instances remain exactly as they were');
}

summary('monthlyGeneration.test.mjs');
