import { assert, section, summary, makeObligation } from './helpers.mjs';
import { planMonthGeneration, buildInstancesForPlan } from '../js/models/monthlyGeneration.js';
import { snapshotInstanceFromObligation } from '../js/models/monthlyInstances.js';

console.log('historicalIntegrity.test.mjs');

section('Modifying the master obligation does not rewrite past instances (§32/§35, rule 3)');
{
  const obligation = makeObligation({ id: 'obl_rent', name: 'Rent', fixedAmount: 500, startMonth: '2026-01' });
  const januaryInstance = snapshotInstanceFromObligation(obligation, '2026-01');
  assert(januaryInstance.name === 'Rent' && januaryInstance.amountExpected === 500, 'January instance snapshots the original name/amount');

  // Master obligation is edited going forward.
  const editedObligation = { ...obligation, name: 'Rent (revised)', fixedAmount: 550 };
  assert(januaryInstance.name === 'Rent' && januaryInstance.amountExpected === 500, 'the already-created January instance object is untouched by the edit');

  const marchInstance = snapshotInstanceFromObligation(editedObligation, '2026-03');
  assert(marchInstance.name === 'Rent (revised)' && marchInstance.amountExpected === 550, 'a instance generated after the edit reflects the new values');
}

section('Deleting/omitting a monthly instance never deletes the master obligation (rule 1)');
{
  const obligation = makeObligation({ id: 'obl_util', startMonth: '2026-01' });
  let instances = buildInstancesForPlan(
    planMonthGeneration({ obligations: [obligation], instances: [], targetMonth: '2026-01' }).toCreate,
    '2026-01'
  );
  assert(instances.length === 1, 'one instance exists for January');

  // Simulate a user deleting the January instance from the instances store.
  instances = instances.filter((i) => i.month !== '2026-01');
  assert(instances.length === 0, 'the instance is gone from the instances collection');
  assert(obligation.status === 'active' && obligation.name === 'Test Obligation', 'the master obligation object itself was never mutated by that deletion');

  // And generation for a later month still works off the untouched master.
  const { toCreate } = planMonthGeneration({ obligations: [obligation], instances, targetMonth: '2026-02' });
  assert(toCreate.length === 1, 'the master obligation still generates normally in the next month');
}

summary('historicalIntegrity.test.mjs');
