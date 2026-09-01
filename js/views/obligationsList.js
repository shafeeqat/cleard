import { state } from '../state.js';
import { remainingOccurrences } from '../models/obligations.js';
import { countClearedByObligation } from '../models/monthlyGeneration.js';
import { formatAmountCompact, CATEGORIES } from '../utils/format.js';
import { escapeHtml } from '../ui.js';
import { monthShortLabel } from '../utils/dates.js';
import { openAddObligationModal, openEditObligationModal } from './obligationForm.js';

export function renderObligationsList(container) {
  const visible = state.obligations.filter((o) => o.status !== 'deleted');
  const clearedCounts = countClearedByObligation(state.instances);

  const completed = visible.filter((o) => o.status === 'completed' || o.status === 'ended');
  const activeAll = visible.filter((o) => o.status !== 'completed' && o.status !== 'ended');
  const endingSoon = activeAll.filter((o) => isEndingSoon(o, clearedCounts[o.id] || 0));
  const active = activeAll.filter((o) => !endingSoon.includes(o));

  container.innerHTML = `
    <div class="max-w-2xl mx-auto">
      <header class="mb-section-gap flex items-start justify-between gap-4">
        <div>
          <h1 id="obligations-heading" class="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-primary">Obligations</h1>
          <p class="font-body-sm text-body-sm text-on-surface-variant mt-unit">Manage your recurring financial commitments.</p>
        </div>
        <button id="obl-add-btn" class="shrink-0 font-title-md text-title-md bg-primary text-on-primary px-4 py-2 rounded-lg hover:opacity-90 transition-opacity flex items-center gap-1">
          <span class="material-symbols-outlined text-[18px]" aria-hidden="true">add</span> Add
        </button>
      </header>

      ${visible.length === 0 ? `<p class="font-body-sm text-body-sm text-secondary text-center py-16">No obligations yet.</p>` : ''}

      ${renderGroupedByCategory(active, clearedCounts)}
      ${endingSoon.length > 0 ? renderSection('Ending soon', endingSoon, clearedCounts) : ''}
      ${completed.length > 0 ? renderCompletedSection(completed) : ''}
    </div>
  `;

  container.querySelector('#obl-add-btn').addEventListener('click', () => openAddObligationModal());
  container.querySelectorAll('[data-obligation-id]').forEach((el) => {
    el.addEventListener('click', () => {
      const obligation = state.obligations.find((o) => o.id === el.dataset.obligationId);
      if (obligation) openEditObligationModal(obligation);
    });
  });
}

function isEndingSoon(obligation, clearedCount) {
  if (obligation.occurrenceCount != null) {
    const remaining = remainingOccurrences(obligation, clearedCount);
    return remaining != null && remaining > 0 && remaining <= 2;
  }
  return false;
}

function renderGroupedByCategory(obligations, clearedCounts) {
  const groups = new Map();
  for (const cat of CATEGORIES) groups.set(cat, []);
  for (const o of obligations) {
    if (!groups.has(o.category)) groups.set(o.category, []);
    groups.get(o.category).push(o);
  }
  let html = '';
  for (const [category, items] of groups) {
    if (items.length === 0) continue;
    html += renderSection(category, items, clearedCounts);
  }
  return html;
}

function renderSection(title, items, clearedCounts) {
  return `
    <section class="mb-section-gap">
      <h3 class="font-label-caps text-label-caps text-secondary uppercase tracking-widest mb-stack-gap border-b border-outline-variant pb-2">${escapeHtml(title)}</h3>
      <div class="flex flex-col gap-unit">
        ${items.map((o) => renderRow(o, clearedCounts[o.id] || 0)).join('')}
      </div>
    </section>
  `;
}

function renderRow(o, clearedCount) {
  const remaining = remainingOccurrences(o, clearedCount);
  const subLabel = remaining != null
    ? `<span class="material-symbols-outlined text-[16px]" aria-hidden="true">schedule</span> ${remaining} payment${remaining === 1 ? '' : 's'} left`
    : `<span class="material-symbols-outlined text-[16px]" aria-hidden="true">all_inclusive</span> Ongoing`;
  const amountLabel = o.amountType === 'variable' ? 'Variable' : formatAmountCompact(o.fixedAmount);
  return `
    <div data-obligation-id="${escapeHtml(o.id)}" class="flex justify-between items-center py-stack-gap border-b border-surface-variant last:border-b-0 hover:bg-surface-container-low transition-colors cursor-pointer group focus-ring" tabindex="0" role="button" aria-label="Edit ${escapeHtml(o.name)}">
      <div class="flex flex-col gap-1">
        <span class="font-title-md text-title-md text-on-surface group-hover:text-primary transition-colors">${escapeHtml(o.name)}</span>
        <span class="font-body-sm text-body-sm text-secondary flex items-center gap-1">${subLabel}</span>
      </div>
      <div class="font-amount-display text-amount-display text-primary text-right tabular-nums">${escapeHtml(amountLabel)}</div>
    </div>
  `;
}

function renderCompletedSection(items) {
  return `
    <section class="mb-section-gap opacity-70">
      <h3 class="font-label-caps text-label-caps text-secondary uppercase tracking-widest mb-stack-gap border-b border-outline-variant pb-2">Completed</h3>
      <div class="flex flex-col gap-unit">
        ${items.map((o) => `
          <div data-obligation-id="${escapeHtml(o.id)}" class="flex justify-between items-center py-stack-gap border-b border-surface-variant last:border-b-0 hover:bg-surface-container-low transition-colors cursor-pointer group focus-ring" tabindex="0" role="button" aria-label="View ${escapeHtml(o.name)}">
            <div class="flex flex-col gap-1">
              <span class="font-title-md text-title-md text-on-surface line-through">${escapeHtml(o.name)}</span>
              <span class="font-body-sm text-body-sm text-secondary">${o.status === 'ended' ? 'Ended' : 'Completed'} ${escapeHtml(monthShortLabel(o.endMonth || o.updatedAt?.slice(0, 7) || o.startMonth))}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}
