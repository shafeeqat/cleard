// Minimal assertion harness, deliberately dependency-free — mirrors the
// pattern already used (and abandoned) in RepSprout's catalog/test-registry.mjs:
// plain assert() + console output, run directly with `node`, no framework.

let passCount = 0;
let failCount = 0;

export function assert(cond, msg) {
  if (!cond) {
    failCount++;
    console.error(`  FAIL: ${msg}`);
    throw new Error(`FAIL: ${msg}`);
  }
  passCount++;
  console.log(`  ok: ${msg}`);
}

export function section(title) {
  console.log(`\n${title}`);
}

export function summary(fileLabel) {
  console.log(`\n${fileLabel}: ${passCount} passed, ${failCount} failed`);
  if (failCount > 0) process.exitCode = 1;
}

export function makeObligation(overrides = {}) {
  return {
    id: overrides.id || 'obl_test',
    userId: 'user_1',
    name: 'Test Obligation',
    category: 'Other',
    notes: '',
    amountType: 'fixed',
    fixedAmount: 100,
    typicalMin: null,
    typicalMax: null,
    frequency: 'monthly',
    customIntervalMonths: null,
    paymentDatePreference: 'global',
    paymentDayOfMonth: null,
    dueDateType: 'none',
    dueDayOfMonth: null,
    collectionDateType: 'none',
    collectionDayOfMonth: null,
    paymentMethod: 'bank_transfer',
    billAvailability: 'immediate',
    startMonth: '2026-01',
    endMonth: null,
    occurrenceCount: null,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
