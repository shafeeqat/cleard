// Monthly integrity check (§23). Pure comparison of "what should exist" vs
// "what actually exists" — never repairs anything itself, just reports.

import { isActiveForGeneration, remainingOccurrences } from './obligations.js';
import { countClearedByObligation } from './monthlyGeneration.js';
import { instanceId } from './monthlyInstances.js';

// Returns { expectedCount, actualCount, missing: [{ obligation, remaining }] }
// for the given month. `missing` lists obligations that should have an
// instance this month but don't — the exact condition monthly generation
// itself uses, so a genuinely-run generation always yields zero missing.
export function checkMonthIntegrity({ obligations, instances, targetMonth }) {
  const existingIds = new Set(instances.map((i) => i.id));
  const clearedCounts = countClearedByObligation(instances);

  let expectedCount = 0;
  const missing = [];

  for (const obligation of obligations) {
    const clearedCount = clearedCounts[obligation.id] || 0;
    if (!isActiveForGeneration(obligation, targetMonth, clearedCount)) continue;
    expectedCount++;
    const id = instanceId(obligation.id, targetMonth);
    if (!existingIds.has(id)) {
      missing.push({
        obligation,
        remaining: remainingOccurrences(obligation, clearedCount),
      });
    }
  }

  const actualCount = instances.filter((i) => i.month === targetMonth).length;

  return { expectedCount, actualCount, missing };
}
