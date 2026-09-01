import { assert, section, summary, makeObligation } from './helpers.mjs';
import { snapshotInstanceFromObligation, applyPaymentAnswer, applyGiroDeductionAnswer, applyKnownAmount, isCleared } from '../js/models/monthlyInstances.js';

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

summary('paymentFlow.test.mjs');
