// Idempotent monthly instance generation. The pure planning function here
// takes plain arrays/objects and is what tests/monthlyGeneration.test.mjs
// exercises directly; generateMonthInFirestore() is the thin Firestore-facing
// wrapper that gives the same idempotency guarantee against real concurrent
// writes via per-instance transactions.

import { isActiveForGeneration } from './obligations.js';
import { snapshotInstanceFromObligation, instanceId, isCleared } from './monthlyInstances.js';
import { addMonths } from '../utils/dates.js';

// Counts, per obligationId, how many of that obligation's instances (across
// all months) have status 'paid'. This is the single source of truth for
// "N payments left" and for lifecycle completion — never a manually edited
// counter (§18).
export function countClearedByObligation(instances) {
  const counts = {};
  for (const inst of instances) {
    if (isCleared(inst)) counts[inst.obligationId] = (counts[inst.obligationId] || 0) + 1;
  }
  return counts;
}

// Pure planning step: given all of a user's obligations and all of their
// existing instances, decide which (obligation, month) instances are
// missing and need to be created. Running this twice for the same inputs
// always returns the same plan, and creating the returned instances is safe
// to repeat because instance ids are deterministic (§21 idempotency).
export function planMonthGeneration({ obligations, instances, targetMonth }) {
  const existingIds = new Set(instances.map((i) => i.id));
  const clearedCounts = countClearedByObligation(instances);
  const toCreate = [];

  for (const obligation of obligations) {
    const clearedCount = clearedCounts[obligation.id] || 0;
    if (!isActiveForGeneration(obligation, targetMonth, clearedCount)) continue;
    const id = instanceId(obligation.id, targetMonth);
    if (existingIds.has(id)) continue; // already generated — idempotent no-op
    toCreate.push(obligation);
  }

  return { toCreate };
}

// Builds the actual instance documents for a plan. Kept separate from
// planMonthGeneration so tests can assert on the plan (which obligations)
// independently of the snapshot shape (what fields land on the instance).
// `settingsDefaults` is the user's Settings > Payment preferences, used to
// resolve any obligation set to "use my default preference".
export function buildInstancesForPlan(toCreate, targetMonth, settingsDefaults = {}, now = new Date()) {
  return toCreate.map((obligation) => snapshotInstanceFromObligation(obligation, targetMonth, settingsDefaults, now));
}

// Shared by both Firestore-facing entry points below: plans and writes
// instances for exactly one month against an already-fetched
// obligations/instances snapshot. `fs` needs only `createInstanceIfAbsent`
// here — reads happen once in the caller, not per month.
async function createInstancesForMonth(fs, uid, obligations, instances, targetMonth, settingsDefaults, now) {
  const { toCreate } = planMonthGeneration({ obligations, instances, targetMonth });
  const created = [];
  for (const obligation of toCreate) {
    const doc = snapshotInstanceFromObligation(obligation, targetMonth, settingsDefaults, now);
    // create-if-absent inside a transaction: even if generation runs twice
    // concurrently for the same user/month, only one write ever lands.
    const wasCreated = await fs.createInstanceIfAbsent(uid, doc);
    if (wasCreated) created.push(doc);
  }
  return created;
}

// Firestore-facing wrapper for a single month. `fs` is expected to be a
// Firestore-like object exposing getActiveObligations/getAllInstances/
// createInstanceIfAbsent (see js/firebase.js#firestoreGenerationAdapter) —
// passed in rather than imported directly so this module has zero hard
// dependency on the Firebase SDK and can be unit tested with a fake.
export async function generateMonthInFirestore(fs, uid, targetMonth, settingsDefaults = {}, now = new Date()) {
  const obligations = await fs.getActiveObligations(uid);
  const instances = await fs.getAllInstances(uid);
  const created = await createInstancesForMonth(fs, uid, obligations, instances, targetMonth, settingsDefaults, now);
  return { created };
}

// §14: obligations paid "ahead" (e.g. last working day of the month before)
// need next month's instance to already exist and be payable before next
// month starts. Rather than special-casing which obligations are pay-ahead,
// the generation window is uniformly widened to [currentMonth,
// currentMonth + monthsAhead] for everyone — harmless for same-month payers
// (their next-month instance just exists a little early), and exactly what
// pay-ahead payers need. Reads obligations/instances once and reuses that
// snapshot across every month in the window.
export async function generateAheadInFirestore(fs, uid, currentMonth, settingsDefaults = {}, monthsAhead = 1, now = new Date()) {
  const obligations = await fs.getActiveObligations(uid);
  const instances = await fs.getAllInstances(uid);
  const created = [];
  for (let i = 0; i <= monthsAhead; i++) {
    const targetMonth = addMonths(currentMonth, i);
    created.push(...await createInstancesForMonth(fs, uid, obligations, instances, targetMonth, settingsDefaults, now));
  }
  return { created };
}
