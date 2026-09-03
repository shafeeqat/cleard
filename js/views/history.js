import { state } from '../state.js';
import { isCleared } from '../models/monthlyInstances.js';
import { monthLabel, monthShortLabel } from '../utils/dates.js';
import { formatAmount, formatDateShort, PAYMENT_METHOD_LABELS } from '../utils/format.js';
import { openModal, closeModal, escapeHtml } from '../ui.js';

export function renderHistory(container) {
  const byMonth = new Map();
  for (const inst of state.instances) {
    if (!byMonth.has(inst.month)) byMonth.set(inst.month, []);
    byMonth.get(inst.month).push(inst);
  }
  const months = [...byMonth.keys()].sort().reverse();

  container.innerHTML = `
    <div class="max-w-2xl mx-auto">
      <header class="mb-section-gap">
        <h2 id="history-heading" class="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-primary">History</h2>
        <p class="font-body-sm text-body-sm text-on-surface-variant mt-unit">Archival records of obligations.</p>
      </header>
      ${months.length === 0
        ? `<p class="font-body-sm text-body-sm text-secondary text-center py-16">Nothing here yet. History builds up as months are generated and cleared.</p>`
        : `<section class="flex flex-col gap-unit">
            ${months.map((m) => renderMonthCard(m, byMonth.get(m))).join('')}
          </section>`}
    </div>
  `;

  container.querySelectorAll('[data-month]').forEach((el) => {
    el.addEventListener('click', () => openMonthDetail(el.dataset.month, byMonth.get(el.dataset.month)));
  });
}

function renderMonthCard(month, instances) {
  const cleared = instances.filter(isCleared);
  const allCleared = cleared.length === instances.length;
  const total = instances.reduce((sum, i) => sum + (i.amountActual ?? i.amountExpected ?? 0), 0);
  return `
    <article data-month="${escapeHtml(month)}" tabindex="0" role="button" aria-label="${escapeHtml(monthLabel(month))}"
      class="flex flex-col border border-outline-variant rounded p-gutter bg-surface-container-lowest hover:bg-surface-container-low transition-colors cursor-pointer focus-ring">
      <div class="flex justify-between items-start mb-stack-gap">
        <div>
          <h3 class="font-title-md text-title-md text-on-surface">${escapeHtml(monthShortLabel(month))}</h3>
          <p class="font-body-sm text-body-sm text-secondary tabular-nums">${cleared.length} / ${instances.length} obligations</p>
        </div>
        <span class="font-amount-display text-amount-display text-on-surface tabular-nums">${formatAmount(total)}</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="inline-flex items-center gap-1 ${allCleared ? 'bg-surface-container-highest text-on-surface' : 'bg-error-container text-on-error-container'} px-2 py-1 rounded-sm">
          <span class="material-symbols-outlined text-[16px]" aria-hidden="true">${allCleared ? 'check' : 'close'}</span>
          <span class="font-label-caps text-label-caps">${allCleared ? "clear'd." : "Not clear'd."}</span>
        </div>
      </div>
    </article>
  `;
}

function openMonthDetail(month, instances) {
  const sorted = [...instances].sort((a, b) => a.name.localeCompare(b.name));
  openModal(`
    <div class="p-6">
      <div class="flex items-start justify-between mb-4">
        <h2 id="month-detail-title" class="font-headline-lg-mobile text-headline-lg-mobile text-primary">${escapeHtml(monthLabel(month))}</h2>
        <button data-close class="p-1 -mr-1 -mt-1 text-secondary hover:text-primary transition-colors rounded-full focus-ring" aria-label="Close">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </div>
      <p class="font-body-sm text-body-sm text-secondary mb-4">This is a snapshot as it existed for this month — later edits to an obligation don't change it.</p>
      <div class="flex flex-col divide-y divide-outline-variant border-t border-b border-outline-variant">
        ${sorted.map((i) => `
          <div class="py-3 flex items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-[18px] ${isCleared(i) ? 'text-success' : 'text-outline'}" aria-hidden="true" style="${isCleared(i) ? "font-variation-settings:'FILL' 1" : ''}">${isCleared(i) ? 'check_circle' : 'radio_button_unchecked'}</span>
              <div>
                <div class="font-body-lg text-body-lg ${isCleared(i) ? 'line-through text-secondary' : 'text-on-surface'}">${escapeHtml(i.name)}</div>
                <div class="font-body-sm text-body-sm text-secondary">${escapeHtml(PAYMENT_METHOD_LABELS[i.paymentMethod] || '')}${i.dueDate ? ` · Due ${escapeHtml(formatDateShort(i.dueDate))}` : ''}</div>
              </div>
            </div>
            <div class="font-amount-display text-amount-display text-on-surface tabular-nums">${i.amountStatus === 'known' ? formatAmount(i.amountActual ?? i.amountExpected) : '—'}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `, {
    labelledBy: 'month-detail-title',
    wide: true,
    onMount: (root) => {
      root.querySelector('[data-close]').addEventListener('click', closeModal);
    },
  });
}
