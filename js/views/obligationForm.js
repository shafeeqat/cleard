import { state } from '../state.js';
import { saveObligation, deleteObligationPermanently } from '../firebase.js';
import {
  createObligation, validateObligationInput, checkLifecycleConsistency, describeLifecycleChange,
  PAYMENT_METHODS, FREQUENCIES,
} from '../models/obligations.js';
import { CATEGORIES, PAYMENT_METHOD_LABELS } from '../utils/format.js';
import { openModal, closeModal, confirmDialog, showToast, escapeHtml } from '../ui.js';
import { effectiveSettings } from '../state.js';
import { parseObligationFromText } from '../ai/openai.js';
import { withTimeout } from '../utils/async.js';

export function openAddObligationModal() {
  openFormModal(null);
}

export function openEditObligationModal(obligation) {
  openFormModal(obligation);
}

function openFormModal(existing) {
  const isEdit = !!existing;
  openModal(formHtml(existing), {
    wide: true,
    labelledBy: 'form-title',
    onMount: (root) => wireForm(root, existing, isEdit),
  });
}

function formHtml(o) {
  const isEdit = !!o;
  const amountType = o?.amountType || 'fixed';
  return `
    <form id="obligation-form" class="p-6" novalidate>
      <div class="flex items-start justify-between mb-6">
        <h2 id="form-title" class="font-headline-lg-mobile text-headline-lg-mobile text-primary">${isEdit ? 'Edit obligation' : 'What are you clearing?'}</h2>
        <button type="button" id="form-close" class="p-1 -mr-1 -mt-1 text-secondary hover:text-primary transition-colors rounded-full focus-ring" aria-label="Close">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </div>

      <div id="form-errors" class="hidden mb-4 p-3 rounded bg-error-container text-on-error-container font-body-sm text-body-sm"></div>

      ${!isEdit && effectiveSettings().openaiApiKey ? renderAiAssist() : ''}

      <div class="flex flex-col gap-4 mb-2">
        <div>
          <label class="block font-label-caps text-label-caps text-secondary uppercase mb-1" for="f-name">Name</label>
          <input id="f-name" name="name" type="text" required placeholder="e.g. Personal loan" value="${escapeHtml(o?.name || '')}"
            class="w-full border-b border-outline-variant bg-transparent py-2 font-body-lg text-body-lg focus-ring">
        </div>

        <div class="segmented" role="group" aria-label="Amount type">
          <button type="button" data-amount-type="fixed" aria-pressed="${amountType === 'fixed'}">Fixed</button>
          <button type="button" data-amount-type="variable" aria-pressed="${amountType === 'variable'}">Variable</button>
        </div>
        <input type="hidden" id="f-amountType" value="${amountType}">

        <div id="f-fixed-amount-wrap" class="${amountType === 'variable' ? 'hidden' : ''}">
          <label class="block font-label-caps text-label-caps text-secondary uppercase mb-1" for="f-fixedAmount">Amount</label>
          <input id="f-fixedAmount" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00" value="${o?.fixedAmount ?? ''}"
            class="w-full border-b border-outline-variant bg-transparent py-2 font-amount-display text-amount-display focus-ring">
        </div>

        <div id="f-variable-amount-wrap" class="${amountType === 'fixed' ? 'hidden' : ''} flex gap-3">
          <div class="flex-1">
            <label class="block font-label-caps text-label-caps text-secondary uppercase mb-1" for="f-typicalMin">Typical low (optional)</label>
            <input id="f-typicalMin" type="number" step="0.01" min="0" value="${o?.typicalMin ?? ''}" class="w-full border-b border-outline-variant bg-transparent py-2 font-body-lg text-body-lg focus-ring">
          </div>
          <div class="flex-1">
            <label class="block font-label-caps text-label-caps text-secondary uppercase mb-1" for="f-typicalMax">Typical high (optional)</label>
            <input id="f-typicalMax" type="number" step="0.01" min="0" value="${o?.typicalMax ?? ''}" class="w-full border-b border-outline-variant bg-transparent py-2 font-body-lg text-body-lg focus-ring">
          </div>
        </div>
        <p class="font-body-sm text-body-sm text-secondary -mt-2">Each month's actual amount is entered when the bill arrives — nothing here is assumed.</p>
      </div>

      <details class="mt-4 border-t border-outline-variant pt-4">
        <summary class="font-title-md text-title-md cursor-pointer select-none">More details</summary>
        <div class="flex flex-col gap-4 mt-4">

          <div>
            <label class="block font-label-caps text-label-caps text-secondary uppercase mb-1" for="f-category">Category</label>
            <select id="f-category" class="w-full border border-outline-variant rounded px-3 py-2 font-body-lg text-body-lg bg-surface-container-lowest focus-ring">
              ${CATEGORIES.map((c) => `<option value="${escapeHtml(c)}" ${o?.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
            </select>
          </div>

          <div>
            <label class="block font-label-caps text-label-caps text-secondary uppercase mb-1" for="f-frequency">Frequency</label>
            <select id="f-frequency" class="w-full border border-outline-variant rounded px-3 py-2 font-body-lg text-body-lg bg-surface-container-lowest focus-ring">
              ${FREQUENCIES.map((f) => `<option value="${f}" ${(o?.frequency || 'monthly') === f ? 'selected' : ''}>${f[0].toUpperCase() + f.slice(1)}</option>`).join('')}
            </select>
            <div id="f-customInterval-wrap" class="${(o?.frequency || 'monthly') === 'custom' ? '' : 'hidden'} mt-2">
              <label class="block font-label-caps text-label-caps text-secondary uppercase mb-1" for="f-customIntervalMonths">Every N months</label>
              <input id="f-customIntervalMonths" type="number" min="1" value="${o?.customIntervalMonths ?? 3}" class="w-32 border border-outline-variant rounded px-3 py-2 font-body-lg text-body-lg bg-surface-container-lowest focus-ring">
            </div>
          </div>

          <div>
            <label class="block font-label-caps text-label-caps text-secondary uppercase mb-1" for="f-paymentMethod">Payment method</label>
            <select id="f-paymentMethod" class="w-full border border-outline-variant rounded px-3 py-2 font-body-lg text-body-lg bg-surface-container-lowest focus-ring">
              ${PAYMENT_METHODS.map((m) => `<option value="${m}" ${(o?.paymentMethod || 'bank_transfer') === m ? 'selected' : ''}>${escapeHtml(PAYMENT_METHOD_LABELS[m])}</option>`).join('')}
            </select>
          </div>

          <div id="f-giro-collection-wrap" class="${(o?.paymentMethod || 'bank_transfer') === 'giro' ? '' : 'hidden'}">
            <label class="block font-label-caps text-label-caps text-secondary uppercase mb-1" for="f-collectionDateType">Collection date</label>
            <select id="f-collectionDateType" class="w-full border border-outline-variant rounded px-3 py-2 font-body-lg text-body-lg bg-surface-container-lowest focus-ring">
              <option value="none" ${!(o?.collectionDateType) || o.collectionDateType === 'none' ? 'selected' : ''}>Unknown</option>
              <option value="fixed" ${o?.collectionDateType === 'fixed' ? 'selected' : ''}>Fixed day each month</option>
              <option value="approximate" ${o?.collectionDateType === 'approximate' ? 'selected' : ''}>Approximate day each month</option>
              <option value="variable" ${o?.collectionDateType === 'variable' ? 'selected' : ''}>Varies, unknown in advance</option>
            </select>
            <div id="f-collectionDay-wrap" class="${['fixed', 'approximate'].includes(o?.collectionDateType) ? '' : 'hidden'} mt-2">
              <label class="block font-label-caps text-label-caps text-secondary uppercase mb-1" for="f-collectionDayOfMonth">Day of month</label>
              <input id="f-collectionDayOfMonth" type="number" min="1" max="31" value="${o?.collectionDayOfMonth ?? ''}" class="w-24 border border-outline-variant rounded px-3 py-2 font-body-lg text-body-lg bg-surface-container-lowest focus-ring">
            </div>
          </div>

          <div>
            <label class="block font-label-caps text-label-caps text-secondary uppercase mb-1" for="f-dueDateType">Due date</label>
            <select id="f-dueDateType" class="w-full border border-outline-variant rounded px-3 py-2 font-body-lg text-body-lg bg-surface-container-lowest focus-ring">
              <option value="none" ${!(o?.dueDateType) || o.dueDateType === 'none' ? 'selected' : ''}>No fixed due date</option>
              <option value="dayOfMonth" ${o?.dueDateType === 'dayOfMonth' ? 'selected' : ''}>Day of month</option>
            </select>
            <div id="f-dueDay-wrap" class="${o?.dueDateType === 'dayOfMonth' ? '' : 'hidden'} mt-2">
              <label class="block font-label-caps text-label-caps text-secondary uppercase mb-1" for="f-dueDayOfMonth">Day of month</label>
              <input id="f-dueDayOfMonth" type="number" min="1" max="31" value="${o?.dueDayOfMonth ?? ''}" class="w-24 border border-outline-variant rounded px-3 py-2 font-body-lg text-body-lg bg-surface-container-lowest focus-ring">
            </div>
          </div>

          <div>
            <label class="block font-label-caps text-label-caps text-secondary uppercase mb-1" for="f-paymentDatePreference">Intended payment date</label>
            <select id="f-paymentDatePreference" class="w-full border border-outline-variant rounded px-3 py-2 font-body-lg text-body-lg bg-surface-container-lowest focus-ring">
              <option value="global" ${!(o?.paymentDatePreference) || o.paymentDatePreference === 'global' ? 'selected' : ''}>Use my default preference</option>
              <option value="lastWorkingDay" ${o?.paymentDatePreference === 'lastWorkingDay' ? 'selected' : ''}>Last working day</option>
              <option value="dayOfMonth" ${o?.paymentDatePreference === 'dayOfMonth' ? 'selected' : ''}>Specific day of month</option>
            </select>
            <div id="f-paymentDay-wrap" class="${o?.paymentDatePreference === 'dayOfMonth' ? '' : 'hidden'} mt-2">
              <label class="block font-label-caps text-label-caps text-secondary uppercase mb-1" for="f-paymentDayOfMonth">Day of month</label>
              <input id="f-paymentDayOfMonth" type="number" min="1" max="31" value="${o?.paymentDayOfMonth ?? ''}" class="w-24 border border-outline-variant rounded px-3 py-2 font-body-lg text-body-lg bg-surface-container-lowest focus-ring">
            </div>
          </div>

          <div class="flex gap-3">
            <div class="flex-1">
              <label class="block font-label-caps text-label-caps text-secondary uppercase mb-1" for="f-startMonth">Starts</label>
              <input id="f-startMonth" type="month" value="${o?.startMonth || state.currentMonth}" class="w-full border border-outline-variant rounded px-3 py-2 font-body-lg text-body-lg bg-surface-container-lowest focus-ring">
            </div>
            <div class="flex-1">
              <label class="block font-label-caps text-label-caps text-secondary uppercase mb-1" for="f-endMonth">Ends (optional)</label>
              <input id="f-endMonth" type="month" value="${o?.endMonth || ''}" class="w-full border border-outline-variant rounded px-3 py-2 font-body-lg text-body-lg bg-surface-container-lowest focus-ring">
            </div>
          </div>

          <div>
            <label class="block font-label-caps text-label-caps text-secondary uppercase mb-1" for="f-occurrenceCount">Number of payments (optional)</label>
            <input id="f-occurrenceCount" type="number" min="1" placeholder="e.g. 12" value="${o?.occurrenceCount ?? ''}" class="w-32 border border-outline-variant rounded px-3 py-2 font-body-lg text-body-lg bg-surface-container-lowest focus-ring">
            <p id="f-lifecycle-warning" class="hidden font-body-sm text-body-sm text-warning mt-2"></p>
          </div>

          <div>
            <label class="block font-label-caps text-label-caps text-secondary uppercase mb-1" for="f-notes">Notes</label>
            <textarea id="f-notes" rows="2" class="w-full border border-outline-variant rounded px-3 py-2 font-body-lg text-body-lg bg-surface-container-lowest focus-ring">${escapeHtml(o?.notes || '')}</textarea>
          </div>
        </div>
      </details>

      <div class="flex items-center justify-between gap-3 mt-6 pt-4 border-t border-outline-variant">
        ${isEdit ? `<button type="button" id="form-delete" class="font-body-sm text-body-sm text-error hover:opacity-80 transition-opacity">Delete&hellip;</button>` : '<span></span>'}
        <button type="submit" class="font-title-md text-title-md bg-primary text-on-primary px-6 py-3 rounded-lg hover:opacity-90 transition-opacity">
          ${isEdit ? 'Save changes' : 'Add obligation'}
        </button>
      </div>
    </form>
  `;
}

function renderAiAssist() {
  return `
    <div class="mb-4 p-3 rounded border border-outline-variant bg-surface-container-low">
      <label class="block font-label-caps text-label-caps text-secondary uppercase mb-1" for="f-ai-text">Describe it instead (optional)</label>
      <div class="flex gap-2">
        <input id="f-ai-text" type="text" placeholder="e.g. Insurance is about $126.20, GIRO on the 1st every month"
          class="flex-1 border border-outline-variant rounded px-3 py-2 font-body-sm text-body-sm bg-surface-container-lowest focus-ring">
        <button type="button" id="f-ai-parse" class="font-label-caps text-label-caps px-3 py-2 rounded border border-outline-variant hover:bg-surface-container-lowest transition-colors whitespace-nowrap">Fill in</button>
      </div>
      <p class="font-body-sm text-body-sm text-secondary mt-1">This only fills in the fields below for you to review — nothing is saved until you tap Add obligation.</p>
    </div>
  `;
}

function wireForm(root, existing, isEdit) {
  root.querySelector('#f-ai-parse')?.addEventListener('click', () => handleAiParse(root));

  root.querySelector('#form-close').addEventListener('click', closeModal);

  const amountTypeInput = root.querySelector('#f-amountType');
  root.querySelectorAll('[data-amount-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      amountTypeInput.value = btn.dataset.amountType;
      root.querySelectorAll('[data-amount-type]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      root.querySelector('#f-fixed-amount-wrap').classList.toggle('hidden', btn.dataset.amountType !== 'fixed');
      root.querySelector('#f-variable-amount-wrap').classList.toggle('hidden', btn.dataset.amountType !== 'variable');
    });
  });

  const freqSelect = root.querySelector('#f-frequency');
  freqSelect.addEventListener('change', () => {
    root.querySelector('#f-customInterval-wrap').classList.toggle('hidden', freqSelect.value !== 'custom');
  });

  const methodSelect = root.querySelector('#f-paymentMethod');
  methodSelect.addEventListener('change', () => {
    root.querySelector('#f-giro-collection-wrap').classList.toggle('hidden', methodSelect.value !== 'giro');
  });

  const collectionTypeSelect = root.querySelector('#f-collectionDateType');
  collectionTypeSelect.addEventListener('change', () => {
    root.querySelector('#f-collectionDay-wrap').classList.toggle('hidden', !['fixed', 'approximate'].includes(collectionTypeSelect.value));
  });

  const dueDateTypeSelect = root.querySelector('#f-dueDateType');
  dueDateTypeSelect.addEventListener('change', () => {
    root.querySelector('#f-dueDay-wrap').classList.toggle('hidden', dueDateTypeSelect.value !== 'dayOfMonth');
  });

  const paymentPrefSelect = root.querySelector('#f-paymentDatePreference');
  paymentPrefSelect.addEventListener('change', () => {
    root.querySelector('#f-paymentDay-wrap').classList.toggle('hidden', paymentPrefSelect.value !== 'dayOfMonth');
  });

  const endMonthInput = root.querySelector('#f-endMonth');
  const occurrenceInput = root.querySelector('#f-occurrenceCount');
  const startMonthInput = root.querySelector('#f-startMonth');
  const warningEl = root.querySelector('#f-lifecycle-warning');
  function checkWarning() {
    if (!endMonthInput.value || !occurrenceInput.value) { warningEl.classList.add('hidden'); return; }
    const warning = checkLifecycleConsistency({
      startMonth: startMonthInput.value, endMonth: endMonthInput.value,
      occurrenceCount: Number(occurrenceInput.value), frequency: freqSelect.value,
      customIntervalMonths: Number(root.querySelector('#f-customIntervalMonths').value) || 1,
    });
    warningEl.textContent = warning || '';
    warningEl.classList.toggle('hidden', !warning);
  }
  [endMonthInput, occurrenceInput, startMonthInput, freqSelect].forEach((el) => el.addEventListener('input', checkWarning));
  checkWarning();

  if (isEdit) {
    root.querySelector('#form-delete').addEventListener('click', () => handleDelete(existing));
  }

  root.querySelector('#obligation-form').addEventListener('submit', (e) => {
    e.preventDefault();
    handleSubmit(root, existing, isEdit);
  });
}

// §44/§46: fills in form fields from a natural-language description. Never
// creates or saves anything itself — the user still has to review every
// field and explicitly submit the form, same as manual entry.
async function handleAiParse(root) {
  const textInput = root.querySelector('#f-ai-text');
  const parseBtn = root.querySelector('#f-ai-parse');
  const text = textInput.value.trim();
  if (!text) return;
  const apiKey = effectiveSettings().openaiApiKey;
  parseBtn.disabled = true;
  parseBtn.textContent = 'Reading…';
  try {
    const parsed = await parseObligationFromText(apiKey, text);
    if (parsed.name) root.querySelector('#f-name').value = parsed.name;
    if (parsed.amountType) {
      root.querySelector(`[data-amount-type="${parsed.amountType}"]`)?.click();
    }
    if (parsed.fixedAmount != null) root.querySelector('#f-fixedAmount').value = parsed.fixedAmount;
    if (parsed.typicalMin != null) root.querySelector('#f-typicalMin').value = parsed.typicalMin;
    if (parsed.typicalMax != null) root.querySelector('#f-typicalMax').value = parsed.typicalMax;
    if (parsed.frequency) root.querySelector('#f-frequency').value = parsed.frequency;
    if (parsed.paymentMethod) {
      const methodSelect = root.querySelector('#f-paymentMethod');
      methodSelect.value = parsed.paymentMethod;
      methodSelect.dispatchEvent(new Event('change'));
    }
    if (parsed.dueDayOfMonth != null) {
      root.querySelector('#f-dueDateType').value = 'dayOfMonth';
      root.querySelector('#f-dueDateType').dispatchEvent(new Event('change'));
      root.querySelector('#f-dueDayOfMonth').value = parsed.dueDayOfMonth;
    }
    if (parsed.collectionDayOfMonth != null && root.querySelector('#f-paymentMethod').value === 'giro') {
      root.querySelector('#f-collectionDateType').value = 'fixed';
      root.querySelector('#f-collectionDateType').dispatchEvent(new Event('change'));
      root.querySelector('#f-collectionDayOfMonth').value = parsed.collectionDayOfMonth;
    }
    if (parsed.notes) root.querySelector('#f-notes').value = parsed.notes;
    root.querySelector('details')?.setAttribute('open', '');
    showToast('Fields filled in — review before adding.', { tone: 'default' });
  } catch (e) {
    showToast("Couldn't read that description. Please fill in the fields manually.", { tone: 'error' });
  } finally {
    parseBtn.disabled = false;
    parseBtn.textContent = 'Fill in';
  }
}

function readFormInput(root, userId) {
  const amountType = root.querySelector('#f-amountType').value;
  return {
    userId,
    name: root.querySelector('#f-name').value,
    category: root.querySelector('#f-category').value,
    notes: root.querySelector('#f-notes').value,
    amountType,
    fixedAmount: root.querySelector('#f-fixedAmount').value,
    typicalMin: root.querySelector('#f-typicalMin').value,
    typicalMax: root.querySelector('#f-typicalMax').value,
    billAvailability: amountType === 'variable' ? 'variable' : 'immediate',
    frequency: root.querySelector('#f-frequency').value,
    customIntervalMonths: root.querySelector('#f-customIntervalMonths').value,
    paymentDatePreference: root.querySelector('#f-paymentDatePreference').value,
    paymentDayOfMonth: root.querySelector('#f-paymentDayOfMonth').value,
    dueDateType: root.querySelector('#f-dueDateType').value,
    dueDayOfMonth: root.querySelector('#f-dueDayOfMonth').value,
    collectionDateType: root.querySelector('#f-paymentMethod').value === 'giro' ? root.querySelector('#f-collectionDateType').value : 'none',
    collectionDayOfMonth: root.querySelector('#f-collectionDayOfMonth').value,
    paymentMethod: root.querySelector('#f-paymentMethod').value,
    startMonth: root.querySelector('#f-startMonth').value,
    endMonth: root.querySelector('#f-endMonth').value || null,
    occurrenceCount: root.querySelector('#f-occurrenceCount').value || null,
  };
}

async function handleSubmit(root, existing, isEdit) {
  const input = readFormInput(root, state.user.uid);
  const errors = validateObligationInput(input);
  const errorsEl = root.querySelector('#form-errors');
  if (errors.length > 0) {
    errorsEl.innerHTML = errors.map((e) => escapeHtml(e)).join('<br>');
    errorsEl.classList.remove('hidden');
    return;
  }
  errorsEl.classList.add('hidden');

  const { obligation } = createObligation({ ...input, id: existing?.id, status: existing?.status, createdAt: existing?.createdAt });

  if (isEdit) {
    const messages = describeLifecycleChange(existing, obligation);
    if (messages.length > 0) {
      const confirmed = await confirmDialog({ title: 'Change payment schedule?', messages, confirmLabel: 'Continue' });
      if (!confirmed) return;
    }
  }

  const submitBtn = root.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    await withTimeout(saveObligation(state.user.uid, obligation));
    closeModal();
    showToast(isEdit ? 'Obligation updated.' : 'Obligation added.', { tone: 'success' });
  } catch (e) {
    showToast(e.message.includes('too long') ? e.message : "Couldn't save this obligation. Please try again.", { tone: 'error' });
    submitBtn.disabled = false;
  }
}

async function handleDelete(existing) {
  const hasHistory = state.instances.some((i) => i.obligationId === existing.id);
  const confirmed = await confirmDialog({
    title: 'Delete this obligation?',
    messages: hasHistory
      ? ['This removes it from active management. Its historical monthly instances are kept.', 'This cannot be undone from within the app.']
      : ['This cannot be undone.'],
    confirmLabel: 'Delete',
    destructive: true,
  });
  if (!confirmed) return;
  try {
    await withTimeout(deleteObligationPermanently(state.user.uid, existing.id));
    closeModal();
    showToast('Obligation deleted.', { tone: 'success' });
  } catch (e) {
    showToast(e.message.includes('too long') ? e.message : "Couldn't delete this obligation. Please try again.", { tone: 'error' });
  }
}
