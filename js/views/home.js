import { state } from '../state.js';
import { checkMonthIntegrity } from '../models/integrity.js';
import { isCleared } from '../models/monthlyInstances.js';
import { isProjectedMonth, projectObligationsForMonth } from '../models/monthProjection.js';
import { monthShortLabel, addMonths } from '../utils/dates.js';
import { formatAmountCompact, formatDateShort, PAYMENT_METHOD_LABELS } from '../utils/format.js';
import { escapeHtml, renderMonthNav, wireMonthNav } from '../ui.js';
import { openObligationDetail } from './obligationDetail.js';
import { openAddObligationModal } from './obligationForm.js';
import { isAiAvailable, openMonthlyReview, openAskQuestion } from './aiPanel.js';

export function renderHome(container) {
  if (state.obligations.filter((o) => o.status !== 'deleted').length === 0) {
    renderFirstTimeEmpty(container);
    return;
  }

  const month = state.viewedMonth;

  if (isProjectedMonth(month, state.currentMonth)) {
    renderPreviewMonth(container, month);
    return;
  }

  const monthInstances = state.instances.filter((i) => i.month === month);

  if (monthInstances.length === 0) {
    renderNothingToClear(container, month);
    return;
  }

  const cleared = monthInstances.filter(isCleared);
  const outstanding = monthInstances.filter((i) => i.status === 'outstanding');
  const pending = monthInstances.filter((i) => i.status === 'pending');
  const scheduled = monthInstances.filter((i) => i.status === 'scheduled');

  const allCleared = cleared.length === monthInstances.length;
  if (allCleared) {
    renderCompletion(container, month, monthInstances);
    return;
  }

  const sortedOutstanding = [...outstanding].sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  const remainingAmount = monthInstances
    .filter((i) => !isCleared(i))
    .reduce((sum, i) => sum + (i.amountExpected ?? i.amountActual ?? 0), 0);

  // The integrity check is about whether *today's* real month is complete —
  // showing "Review September" while browsing back to July would conflate
  // the two, so it only ever surfaces on the actual current month.
  const integrity = month === state.currentMonth
    ? checkMonthIntegrity({ obligations: state.obligations, instances: state.instances, targetMonth: month })
    : { missing: [] };

  container.innerHTML = `
    <div class="max-w-2xl mx-auto">
      ${integrity.missing.length > 0 ? renderIntegrityBanner(month, integrity) : ''}
      <header class="mb-10 text-center">
        ${renderMonthNav(month, { headingId: 'home-heading' })}
        <div class="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-6 text-on-surface-variant">
          <div class="flex items-center gap-1.5">
            <span class="material-symbols-outlined text-xl" aria-hidden="true">task_alt</span>
            <span class="font-body-sm text-body-sm">${cleared.length} / ${monthInstances.length} cleared</span>
          </div>
          <div class="hidden sm:block w-1 h-1 rounded-full bg-outline-variant" aria-hidden="true"></div>
          <div class="flex items-center gap-1.5">
            <span class="material-symbols-outlined text-xl" aria-hidden="true">account_balance_wallet</span>
            <span class="font-body-sm text-body-sm tabular-nums">${formatAmountCompact(remainingAmount)} remaining</span>
          </div>
        </div>
      </header>

      ${sortedOutstanding.length > 0 ? renderNeedsAttention(sortedOutstanding) : ''}

      <div class="grid grid-cols-1 md:grid-cols-2 gap-section-gap mb-section-gap">
        ${renderSideSection('Pending', pending, 'pending')}
        ${renderSideSection('Scheduled', scheduled, 'scheduled')}
      </div>

      ${cleared.length > 0 ? renderClearedSection(cleared) : ''}

      <div class="mt-section-gap flex flex-col items-center gap-3">
        <button id="home-add-obligation" class="font-title-md text-title-md inline-flex items-center gap-2 text-secondary hover:text-primary transition-colors">
          <span class="material-symbols-outlined" aria-hidden="true">add</span> Add obligation
        </button>
        ${isAiAvailable() ? `
          <div class="flex gap-4">
            <button id="home-ai-review" class="font-body-sm text-body-sm text-secondary hover:text-primary transition-colors underline underline-offset-2">Monthly review</button>
            <button id="home-ai-ask" class="font-body-sm text-body-sm text-secondary hover:text-primary transition-colors underline underline-offset-2">Ask clear'd.</button>
          </div>` : ''}
      </div>
    </div>
  `;

  wireInteractions(container, monthInstances);
  wireHomeMonthNav(container);
}

// Shared by every Home render branch (normal/empty/completion/preview): one
// place that knows how to move state.viewedMonth and re-render. Navigation
// is deliberately unbounded in both directions (§ user request: "toggle
// between months indefinitely") — browsing past the real generated window
// just switches to the clearly-labelled projection in renderPreviewMonth.
function wireHomeMonthNav(container) {
  wireMonthNav(container, (direction) => {
    state.viewedMonth = addMonths(state.viewedMonth, direction);
    renderHome(container);
  });
}

function renderIntegrityBanner(month, integrity) {
  return `
    <div class="mb-section-gap border border-error-container bg-error-container/40 rounded-lg p-gutter">
      <h2 class="font-title-md text-title-md text-on-error-container flex items-center gap-2 mb-2">
        <span class="material-symbols-outlined" aria-hidden="true">warning</span> Review ${escapeHtml(monthShortLabel(month))}
      </h2>
      <p class="font-body-sm text-body-sm text-on-error-container mb-2">
        ${integrity.missing.length === 1 ? 'One recurring obligation is missing.' : `${integrity.missing.length} recurring obligations are missing.`}
      </p>
      <ul class="flex flex-col gap-1">
        ${integrity.missing.map((m) => `
          <li class="font-body-sm text-body-sm text-on-error-container">
            <strong>${escapeHtml(m.obligation.name)}</strong>
            ${m.remaining != null ? ` — this obligation has ${m.remaining} scheduled payment${m.remaining === 1 ? '' : 's'} remaining but is missing from ${escapeHtml(monthShortLabel(month))}.` : ` is missing from ${escapeHtml(monthShortLabel(month))}.`}
          </li>
        `).join('')}
      </ul>
    </div>
  `;
}

function renderNeedsAttention(items) {
  const today = new Date().toISOString().slice(0, 10);
  return `
    <section class="mb-section-gap">
      <h2 class="font-label-caps text-label-caps text-error mb-stack-gap flex items-center gap-2 tracking-widest uppercase">
        <span class="w-1.5 h-1.5 rounded-full bg-error" aria-hidden="true"></span> Needs attention
      </h2>
      <div class="flex flex-col gap-unit">
        ${items.map((inst, idx) => {
          const isUrgent = idx === 0 && (!inst.dueDate || inst.dueDate <= today);
          const dueLabel = inst.dueDate ? `Due ${formatDateShort(inst.dueDate)}` : 'Outstanding';
          return `
          <div data-instance-id="${escapeHtml(inst.id)}" class="attn-item p-gutter border ${isUrgent ? 'border-error-container' : 'border-error-container/60'} rounded-lg bg-surface-container-lowest flex items-center justify-between group hover:border-error transition-colors cursor-pointer relative overflow-hidden focus-ring" tabindex="0" role="button" aria-label="${escapeHtml(inst.name)}, ${escapeHtml(dueLabel)}">
            <div class="absolute left-0 top-0 bottom-0 w-1 bg-error ${isUrgent ? '' : 'opacity-50'}" aria-hidden="true"></div>
            <div class="pl-2">
              <h3 class="font-title-md text-title-md text-primary mb-1">${escapeHtml(inst.name)}</h3>
              <p class="font-body-sm text-body-sm ${isUrgent ? 'text-error' : 'text-secondary'} flex items-center gap-1">
                <span class="material-symbols-outlined text-[16px]" aria-hidden="true">${isUrgent ? 'warning' : 'calendar_today'}</span>
                ${escapeHtml(dueLabel)}
              </p>
            </div>
            <div class="text-right">
              <div class="font-amount-display text-amount-display text-primary tabular-nums">${formatAmountCompact(inst.amountExpected ?? inst.amountActual)}</div>
              ${isUrgent ? `<button class="pay-today-btn font-label-caps text-label-caps text-on-primary bg-primary px-3 py-1 mt-2 rounded flex items-center gap-1 hover:opacity-90 transition-opacity ml-auto" data-instance-id="${escapeHtml(inst.id)}">Pay today <span class="material-symbols-outlined text-[14px]" aria-hidden="true">arrow_forward</span></button>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
    </section>
  `;
}

function renderSideSection(title, items, kind) {
  if (items.length === 0) return '';
  const icon = kind === 'pending' ? 'schedule' : 'autorenew';
  return `
    <section>
      <h2 class="font-label-caps text-label-caps text-on-surface-variant mb-stack-gap flex items-center gap-2 tracking-widest uppercase">
        <span class="w-1.5 h-1.5 rounded-full bg-outline" aria-hidden="true"></span> ${title}
      </h2>
      <div class="flex flex-col gap-unit">
        ${items.map((inst) => `
          <div data-instance-id="${escapeHtml(inst.id)}" class="attn-item p-gutter border border-outline-variant rounded-lg bg-surface-container-lowest flex items-center justify-between group hover:border-outline transition-colors cursor-pointer focus-ring ${kind === 'pending' ? 'border-dashed' : ''}" tabindex="0" role="button" aria-label="${escapeHtml(inst.name)}">
            <div>
              <h3 class="font-title-md text-title-md text-primary mb-1 ${kind === 'pending' ? 'opacity-60' : ''}">${escapeHtml(inst.name)}</h3>
              <p class="font-body-sm text-body-sm text-secondary flex items-center gap-1">
                ${kind === 'pending'
                  ? 'Bill not yet received'
                  : `<span class="material-symbols-outlined text-[16px]" aria-hidden="true">${icon}</span> ${escapeHtml(PAYMENT_METHOD_LABELS[inst.paymentMethod] || 'Scheduled')}${inst.collectionDate ? `, ${escapeHtml(formatDateShort(inst.collectionDate))}` : ''}`}
              </p>
            </div>
            <div class="text-right">
              <div class="font-amount-display text-amount-display ${kind === 'pending' ? 'text-secondary opacity-50' : 'text-primary'} tabular-nums">${kind === 'pending' ? '--' : formatAmountCompact(inst.amountExpected ?? inst.amountActual)}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

function renderClearedSection(items) {
  return `
    <section>
      <h2 class="font-label-caps text-label-caps text-on-surface-variant mb-stack-gap flex items-center gap-2 tracking-widest uppercase opacity-70">
        <span class="w-1.5 h-1.5 rounded-full bg-outline-variant" aria-hidden="true"></span> Cleared
      </h2>
      <div class="flex flex-col gap-px bg-outline-variant rounded-lg overflow-hidden">
        ${items.map((inst) => `
          <div data-instance-id="${escapeHtml(inst.id)}" class="attn-item p-4 bg-surface-container-low flex items-center gap-3 opacity-70 hover:opacity-100 transition-opacity cursor-pointer focus-ring" tabindex="0" role="button" aria-label="${escapeHtml(inst.name)}, cleared">
            <span class="material-symbols-outlined text-outline" aria-hidden="true" style="font-variation-settings:'FILL' 1">check_circle</span>
            <h3 class="font-body-lg text-body-lg text-secondary line-through">${escapeHtml(inst.name)}</h3>
            <span class="sr-only">clear'd.</span>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

function renderNothingToClear(container, month) {
  container.innerHTML = `
    <div class="max-w-2xl mx-auto text-center py-20">
      ${renderMonthNav(month, { headingId: 'home-heading' })}
      <p class="font-body-lg text-body-lg text-on-surface-variant mt-4">Nothing to clear.</p>
    </div>
  `;
  wireHomeMonthNav(container);
}

function renderCompletion(container, month, monthInstances) {
  const total = monthInstances.reduce((sum, i) => sum + (i.amountActual ?? i.amountExpected ?? 0), 0);
  const nextMonth = addMonths(month, 1);
  // Real instances now (generateAheadInFirestore generates one month ahead),
  // so pass the actual data — an empty array here would make every
  // obligation look "still expected" even ones already fully cleared, since
  // countClearedByObligation would see zero clears for anything.
  const nextExpected = checkMonthIntegrity({ obligations: state.obligations, instances: state.instances, targetMonth: nextMonth }).expectedCount;
  container.innerHTML = `
    <div class="max-w-xl mx-auto text-center py-16">
      ${renderMonthNav(month, { headingId: 'home-heading' })}
      <p class="font-display-serif text-headline-lg text-primary mb-6 italic">clear'd.</p>
      <p class="font-body-lg text-body-lg text-on-surface-variant mb-1 tabular-nums">${monthInstances.length} / ${monthInstances.length} obligations</p>
      <p class="font-amount-display text-amount-display text-primary mb-6 tabular-nums">${formatAmountCompact(total)} cleared</p>
      <p class="font-body-sm text-body-sm text-on-surface-variant mb-12">All obligations accounted for.</p>
      <div class="border-t border-outline-variant pt-6">
        <p class="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest mb-2">Next month</p>
        <p class="font-title-md text-title-md text-primary mb-1">${escapeHtml(monthShortLabel(nextMonth))}</p>
        <p class="font-body-sm text-body-sm text-secondary tabular-nums">${nextExpected} obligation${nextExpected === 1 ? '' : 's'} expected</p>
      </div>
    </div>
  `;
  wireHomeMonthNav(container);
}

// Beyond the real generated window: a clearly-labelled, read-only
// projection of what's likely still active, assuming on-time payment for
// every month in between (see models/monthProjection.js). No pay
// interaction here — there's no real instance to write to yet.
function renderPreviewMonth(container, month) {
  const results = projectObligationsForMonth({
    obligations: state.obligations,
    instances: state.instances,
    targetMonth: month,
    currentMonth: state.currentMonth,
  });
  const total = results.reduce((sum, r) => sum + (r.instance.amountExpected ?? 0), 0);

  container.innerHTML = `
    <div class="max-w-2xl mx-auto">
      <header class="mb-6 text-center">
        ${renderMonthNav(month, { headingId: 'home-heading' })}
        <p class="font-body-sm text-body-sm text-on-surface-variant tabular-nums">${results.length} obligation${results.length === 1 ? '' : 's'} expected${total > 0 ? ` · ${formatAmountCompact(total)}` : ''}</p>
      </header>

      <div class="mb-section-gap p-gutter border border-outline-variant rounded-lg bg-surface-container-low flex items-start gap-2">
        <span class="material-symbols-outlined text-secondary text-[18px]" aria-hidden="true">info</span>
        <p class="font-body-sm text-body-sm text-secondary">This is a preview — it assumes every obligation between now and ${escapeHtml(monthShortLabel(month))} gets paid on time. Nothing here is real yet, and nothing can be paid from this screen.</p>
      </div>

      ${results.length === 0
        ? `<p class="font-body-sm text-body-sm text-secondary text-center py-16">Nothing expected — either nothing's scheduled yet, or everything active now will have finished by ${escapeHtml(monthShortLabel(month))}.</p>`
        : `<div class="flex flex-col gap-unit">
            ${results.map((r) => `
              <div class="p-gutter border border-outline-variant rounded-lg bg-surface-container-lowest flex items-center justify-between opacity-80">
                <div>
                  <h3 class="font-title-md text-title-md text-primary mb-1">${escapeHtml(r.instance.name)}</h3>
                  <p class="font-body-sm text-body-sm text-secondary flex items-center gap-1">
                    ${r.instance.dueDate ? `<span class="material-symbols-outlined text-[16px]" aria-hidden="true">calendar_today</span> Due ${escapeHtml(formatDateShort(r.instance.dueDate))}` : 'No fixed due date'}
                  </p>
                </div>
                <div class="font-amount-display text-amount-display text-secondary tabular-nums">${r.instance.amountExpected != null ? formatAmountCompact(r.instance.amountExpected) : '—'}</div>
              </div>
            `).join('')}
          </div>`}
    </div>
  `;
  wireHomeMonthNav(container);
}

function renderFirstTimeEmpty(container) {
  container.innerHTML = `
    <div class="max-w-xl mx-auto text-center py-20">
      <div class="font-display-serif text-display-serif italic text-primary mb-2">clear'd.</div>
      <p class="font-body-lg text-body-lg text-on-surface-variant mb-10">Every month. clear'd.</p>
      <p class="font-body-sm text-body-sm text-secondary mb-8">You haven't added any obligations yet.</p>
      <button id="home-add-first" class="font-title-md text-title-md bg-primary text-on-primary px-6 py-3 rounded-lg hover:opacity-90 transition-opacity inline-flex items-center gap-2">
        <span class="material-symbols-outlined" aria-hidden="true">add</span> Add your first obligation
      </button>
    </div>
  `;
  container.querySelector('#home-add-first').addEventListener('click', () => openAddObligationModal());
}

function wireInteractions(container, monthInstances) {
  container.querySelectorAll('.attn-item').forEach((el) => {
    const open = () => {
      const inst = monthInstances.find((i) => i.id === el.dataset.instanceId);
      if (inst) openObligationDetail(inst);
    };
    el.addEventListener('click', open);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
  container.querySelectorAll('.pay-today-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const inst = monthInstances.find((i) => i.id === btn.dataset.instanceId);
      if (inst) openObligationDetail(inst);
    });
  });
  const addBtn = container.querySelector('#home-add-obligation');
  addBtn?.addEventListener('click', () => openAddObligationModal());
  container.querySelector('#home-ai-review')?.addEventListener('click', () => openMonthlyReview());
  container.querySelector('#home-ai-ask')?.addEventListener('click', () => openAskQuestion());
}
