import { state } from '../state.js';
import { saveInstance, saveObligation, deleteInstance } from '../firebase.js';
import { remainingOccurrences, isLifecycleComplete } from '../models/obligations.js';
import { countClearedByObligation } from '../models/monthlyGeneration.js';
import { applyPaymentAnswer, applyGiroDeductionAnswer, applyKnownAmount, unpayInstance, isCleared } from '../models/monthlyInstances.js';
import { formatAmount, formatDateShort, PAYMENT_METHOD_LABELS } from '../utils/format.js';
import { openModal, closeModal, confirmDialog, showToast, escapeHtml } from '../ui.js';
import { withTimeout } from '../utils/async.js';

export function openObligationDetail(instance) {
  const obligation = state.obligations.find((o) => o.id === instance.obligationId) || null;
  const isGiro = instance.paymentMethod === 'giro' && instance.status === 'scheduled';
  const cleared = isCleared(instance);
  const clearedCount = countClearedByObligation(state.instances)[instance.obligationId] || 0;
  const remaining = obligation ? remainingOccurrences(obligation, clearedCount) : null;

  openModal(bodyHtml(instance, obligation, { isGiro, cleared, remaining }), {
    labelledBy: 'detail-title',
    onMount: (root) => wire(root, instance, obligation, { isGiro }),
  });
}

function bodyHtml(instance, obligation, { isGiro, cleared, remaining }) {
  const amountKnown = instance.amountStatus === 'known';
  return `
    <div class="p-6">
      <div class="flex items-start justify-between mb-4">
        <h2 id="detail-title" class="font-headline-lg-mobile text-headline-lg-mobile text-primary">${escapeHtml(instance.name)}</h2>
        <div class="flex items-center -mr-1 -mt-1">
          <button id="detail-delete" class="p-1 text-secondary hover:text-error transition-colors rounded-full focus-ring" aria-label="Delete this month's entry">
            <span class="material-symbols-outlined" aria-hidden="true">delete</span>
          </button>
          <button id="detail-close" class="p-1 text-secondary hover:text-primary transition-colors rounded-full focus-ring" aria-label="Close">
            <span class="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>
      </div>
      ${!obligation ? `<p class="font-body-sm text-body-sm text-secondary italic mb-4">This entry's obligation was deleted — you can only remove it now.</p>` : ''}

      <div class="mb-6">
        ${amountKnown
          ? `<div class="font-amount-display text-amount-display text-primary tabular-nums">${formatAmount(instance.amountActual ?? instance.amountExpected)}</div>`
          : `<div class="font-body-lg text-body-lg text-secondary italic mb-2">Amount pending — bill not yet received</div>
             <label class="block font-label-caps text-label-caps text-secondary uppercase mb-1" for="detail-amount-input">Enter amount when known</label>
             <input id="detail-amount-input" type="number" step="0.01" min="0" inputmode="decimal" class="w-full border border-outline-variant rounded px-3 py-2 font-body-lg text-body-lg bg-surface-container-lowest focus-ring" placeholder="0.00">`}
      </div>

      <div class="flex flex-col gap-1.5 mb-6 font-body-sm text-body-sm text-secondary">
        ${instance.intendedPaymentDate ? `<div class="flex items-center gap-2"><span class="material-symbols-outlined text-[16px]" aria-hidden="true">event</span> Pay ${escapeHtml(formatDateShort(instance.intendedPaymentDate))}</div>` : ''}
        ${instance.dueDate ? `<div class="flex items-center gap-2"><span class="material-symbols-outlined text-[16px]" aria-hidden="true">calendar_today</span> Due ${escapeHtml(formatDateShort(instance.dueDate))}</div>` : ''}
        ${instance.collectionDate ? `<div class="flex items-center gap-2"><span class="material-symbols-outlined text-[16px]" aria-hidden="true">autorenew</span> Collected ${escapeHtml(formatDateShort(instance.collectionDate))}</div>` : ''}
        <div class="flex items-center gap-2"><span class="material-symbols-outlined text-[16px]" aria-hidden="true">payments</span> ${escapeHtml(PAYMENT_METHOD_LABELS[instance.paymentMethod] || 'Other')}</div>
        ${remaining != null ? `<div class="flex items-center gap-2"><span class="material-symbols-outlined text-[16px]" aria-hidden="true">schedule</span> ${remaining} payment${remaining === 1 ? '' : 's'} left</div>` : ''}
      </div>

      <div id="detail-confirmation" class="hidden text-center py-4">
        <p class="font-headline-lg-mobile text-headline-lg-mobile text-primary">✓ clear'd.</p>
      </div>

      <div id="detail-actions">
        ${cleared
          ? `<div class="text-center">
               <p class="font-body-sm text-body-sm text-secondary mb-2">Cleared${instance.paidAt ? ' on ' + escapeHtml(formatDateShort(instance.paidAt.slice(0, 10))) : ''}.</p>
               <button id="detail-unpay" class="font-body-sm text-body-sm text-secondary hover:text-error underline underline-offset-2 transition-colors">Mark as unpaid</button>
             </div>`
          : `
          <p class="font-title-md text-title-md text-center mb-3">${isGiro ? 'Has this been deducted?' : 'Did you pay this?'}</p>
          <div class="flex gap-3">
            <button id="detail-no" data-autofocus class="flex-1 font-title-md text-title-md py-3 rounded-lg border border-outline-variant hover:bg-surface-container-low transition-colors">No</button>
            <button id="detail-yes" class="flex-1 font-title-md text-title-md py-3 rounded-lg bg-primary text-on-primary hover:opacity-90 transition-opacity" ${!amountKnown ? 'disabled aria-disabled="true"' : ''}>Yes</button>
          </div>`
        }
      </div>
    </div>
  `;
}

function wire(root, instance, obligation, { isGiro }) {
  root.querySelector('#detail-close')?.addEventListener('click', closeModal);

  root.querySelector('#detail-delete')?.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Delete this entry?',
      messages: [
        `This removes ${instance.name} for this month only.`,
        obligation ? "It won't affect the master obligation or any other month." : 'This does not affect any other month.',
      ],
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await withTimeout(deleteInstance(instance.userId, instance.id));
      closeModal();
      showToast('Entry deleted.', { tone: 'success' });
    } catch (e) {
      showToast(e.message.includes('too long') ? e.message : "Couldn't delete this entry. Please try again.", { tone: 'error' });
    }
  });

  root.querySelector('#detail-unpay')?.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Mark as unpaid?',
      messages: [`This moves ${instance.name} back to outstanding${isGiro ? '/scheduled' : ''}.`],
      confirmLabel: 'Mark as unpaid',
      destructive: true,
    });
    if (!confirmed) return;
    const ok = await persist(unpayInstance(instance));
    if (ok) {
      await maybeReopenObligation(obligation);
      closeModal();
      showToast('Marked as unpaid.', { tone: 'default' });
    }
  });

  const amountInput = root.querySelector('#detail-amount-input');
  const yesBtn = root.querySelector('#detail-yes');
  amountInput?.addEventListener('input', () => {
    if (yesBtn) yesBtn.disabled = !(Number(amountInput.value) > 0);
  });

  root.querySelector('#detail-no')?.addEventListener('click', async () => {
    await persist(isGiro ? applyGiroDeductionAnswer(instance, 'no') : applyPaymentAnswer(instance, 'no'));
    closeModal();
  });

  yesBtn?.addEventListener('click', async () => {
    let working = instance;
    if (amountInput) {
      const amt = Number(amountInput.value);
      if (!(amt > 0)) return;
      working = applyKnownAmount(working, amt);
    }
    yesBtn.disabled = true;
    const finalInstance = isGiro ? applyGiroDeductionAnswer(working, 'yes') : applyPaymentAnswer(working, 'yes');
    const ok = await persist(finalInstance);
    if (ok) {
      await maybeCompleteObligation(obligation, instance);
      root.querySelector('#detail-actions').classList.add('hidden');
      root.querySelector('#detail-confirmation').classList.remove('hidden');
      setTimeout(closeModal, 900);
    } else if (yesBtn) {
      yesBtn.disabled = false;
    }
  });
}

async function persist(updatedInstance) {
  try {
    await withTimeout(saveInstance(updatedInstance.userId, updatedInstance));
    return true;
  } catch (e) {
    showToast(e.message.includes('too long') ? e.message : "Couldn't save this change. Please try again.", { tone: 'error' });
    return false;
  }
}

// §10/§18/§19: the only place a master obligation transitions to
// 'completed' — and only when its lifecycle (occurrence count) genuinely
// finished, never just because a month passed. Runs after the instance
// write succeeds, computing the cleared count locally rather than waiting
// for the snapshot listener to catch up.
async function maybeCompleteObligation(obligation, previousInstance) {
  if (!obligation || obligation.occurrenceCount == null || obligation.status === 'completed') return;
  const priorCount = countClearedByObligation(state.instances)[obligation.id] || 0;
  const newCount = isCleared(previousInstance) ? priorCount : priorCount + 1;
  if (!isLifecycleComplete(obligation, newCount)) return;
  try {
    await withTimeout(saveObligation(obligation.userId, { ...obligation, status: 'completed', updatedAt: new Date().toISOString() }));
  } catch (e) {
    showToast("This obligation is fully paid but couldn't be marked completed. It will update next time you're online.", { tone: 'error' });
  }
}

// Symmetric counterpart to maybeCompleteObligation: undoing the payment that
// completed an obligation's lifecycle reopens it. Only fires when the
// obligation is actually 'completed' and no longer meets the completion
// condition once this instance is no longer counted as cleared — never a
// blanket "unpay always reactivates."
async function maybeReopenObligation(obligation) {
  if (!obligation || obligation.status !== 'completed' || obligation.occurrenceCount == null) return;
  const clearedCount = countClearedByObligation(state.instances)[obligation.id] || 0;
  const newCount = Math.max(clearedCount - 1, 0);
  if (isLifecycleComplete(obligation, newCount)) return; // still complete via other cleared instances
  try {
    await withTimeout(saveObligation(obligation.userId, { ...obligation, status: 'active', updatedAt: new Date().toISOString() }));
  } catch (e) {
    showToast('This obligation is no longer fully paid but could not be reopened. It will update next time you\'re online.', { tone: 'error' });
  }
}

