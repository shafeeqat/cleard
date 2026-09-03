// Month-grid view: due dates, collection dates, and paid dates as small
// indicator dots per day. Reuses the same monthProjection query Home's
// preview mode uses, so real months show real instances and months beyond
// the generated window show the same clearly-labelled projection — one
// source of truth for "what touches this month," two different renderings.

import { state } from '../state.js';
import { isProjectedMonth, projectObligationsForMonth } from '../models/monthProjection.js';
import { daysInMonth, firstWeekdayOfMonth, addMonths, monthShortLabel } from '../utils/dates.js';
import { formatAmount, formatDateShort } from '../utils/format.js';
import { escapeHtml, renderMonthNav, wireMonthNav, openModal, closeModal } from '../ui.js';
import { openObligationDetail } from './obligationDetail.js';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function renderCalendar(container) {
  const month = state.viewedMonth;
  const projected = isProjectedMonth(month, state.currentMonth);
  const results = projectObligationsForMonth({
    obligations: state.obligations,
    instances: state.instances,
    targetMonth: month,
    currentMonth: state.currentMonth,
  });

  const days = bucketByDay(results, month);
  const totalDays = daysInMonth(month);
  const leadingBlanks = firstWeekdayOfMonth(month);
  const today = new Date().toISOString().slice(0, 10);

  container.innerHTML = `
    <div class="max-w-2xl mx-auto">
      <header class="mb-6 text-center">
        ${renderMonthNav(month, { headingId: 'calendar-heading' })}
      </header>

      ${projected ? `
        <div class="mb-section-gap p-gutter border border-outline-variant rounded-lg bg-surface-container-low flex items-start gap-2">
          <span class="material-symbols-outlined text-secondary text-[18px]" aria-hidden="true">info</span>
          <p class="font-body-sm text-body-sm text-secondary">Preview — assumes on-time payment between now and ${escapeHtml(monthShortLabel(month))}. Nothing here is real yet.</p>
        </div>` : ''}

      <div class="grid grid-cols-7 gap-1 mb-1">
        ${WEEKDAY_LABELS.map((d) => `<div class="text-center font-label-caps text-label-caps text-secondary uppercase py-1">${d}</div>`).join('')}
      </div>
      <div class="grid grid-cols-7 gap-1">
        ${Array.from({ length: leadingBlanks }).map(() => `<div aria-hidden="true"></div>`).join('')}
        ${Array.from({ length: totalDays }, (_, i) => renderDayCell(i + 1, month, days[String(i + 1).padStart(2, '0')], today)).join('')}
      </div>

      <div class="mt-section-gap flex flex-wrap items-center justify-center gap-4 font-body-sm text-body-sm text-secondary">
        <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-error inline-block" aria-hidden="true"></span> Due</span>
        <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-outline inline-block" aria-hidden="true"></span> Collection</span>
        <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-success inline-block" aria-hidden="true"></span> Paid</span>
      </div>
    </div>
  `;

  wireMonthNav(container, (direction) => {
    state.viewedMonth = addMonths(state.viewedMonth, direction);
    renderCalendar(container);
  });

  container.querySelectorAll('[data-day]').forEach((el) => {
    el.addEventListener('click', () => openDayDetail(el.dataset.day, month, days[el.dataset.day]));
  });
}

function bucketByDay(results, month) {
  const days = {};
  const add = (dateStr, kind, item) => {
    if (!dateStr || !dateStr.startsWith(month)) return;
    const day = dateStr.slice(8, 10);
    (days[day] ??= { due: [], collection: [], paid: [] })[kind].push(item);
  };
  for (const r of results) {
    add(r.instance.dueDate, 'due', r);
    add(r.instance.collectionDate, 'collection', r);
    if (r.instance.status === 'paid' && r.instance.paidAt) add(r.instance.paidAt.slice(0, 10), 'paid', r);
  }
  return days;
}

function renderDayCell(dayNum, month, events, today) {
  const dayStr = String(dayNum).padStart(2, '0');
  const isToday = `${month}-${dayStr}` === today;
  const hasEvents = !!(events && (events.due.length || events.collection.length || events.paid.length));
  const countLabel = hasEvents ? `, ${events.due.length + events.collection.length + events.paid.length} obligation${events.due.length + events.collection.length + events.paid.length === 1 ? '' : 's'}` : '';
  return `
    <button ${hasEvents ? `data-day="${dayStr}"` : 'disabled tabindex="-1"'} aria-label="${dayNum}${countLabel}"
      class="aspect-square flex flex-col items-center justify-center rounded-lg border ${isToday ? 'border-primary' : 'border-transparent'} ${hasEvents ? 'hover:bg-surface-container-low cursor-pointer focus-ring' : ''} transition-colors">
      <span class="font-body-sm text-body-sm ${isToday ? 'text-primary font-semibold' : 'text-on-surface'}">${dayNum}</span>
      ${hasEvents ? `
        <span class="flex gap-0.5 mt-0.5" aria-hidden="true">
          ${events.due.length ? `<span class="w-1.5 h-1.5 rounded-full bg-error"></span>` : ''}
          ${events.collection.length ? `<span class="w-1.5 h-1.5 rounded-full bg-outline"></span>` : ''}
          ${events.paid.length ? `<span class="w-1.5 h-1.5 rounded-full bg-success"></span>` : ''}
        </span>` : ''}
    </button>
  `;
}

function openDayDetail(day, month, events) {
  const dateStr = `${month}-${day}`;
  const rows = [
    ...events.due.map((r) => ({ r, label: 'Due' })),
    ...events.collection.map((r) => ({ r, label: 'Collection' })),
    ...events.paid.map((r) => ({ r, label: 'Paid' })),
  ];

  openModal(`
    <div class="p-6">
      <div class="flex items-start justify-between mb-4">
        <h2 id="day-detail-title" class="font-headline-lg-mobile text-headline-lg-mobile text-primary">${escapeHtml(formatDateShort(dateStr))}</h2>
        <button data-close class="p-1 -mr-1 -mt-1 text-secondary hover:text-primary transition-colors rounded-full focus-ring" aria-label="Close">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </div>
      <div class="flex flex-col divide-y divide-outline-variant border-t border-b border-outline-variant">
        ${rows.map(({ r, label }) => `
          <div data-instance-id="${r.projected ? '' : escapeHtml(r.instance.id)}" class="py-3 flex items-center justify-between gap-3 ${r.projected ? '' : 'cursor-pointer hover:bg-surface-container-low transition-colors focus-ring'}" ${r.projected ? '' : 'tabindex="0" role="button"'}>
            <div>
              <div class="font-body-lg text-body-lg text-on-surface">${escapeHtml(r.instance.name)}</div>
              <div class="font-body-sm text-body-sm text-secondary">${label}${r.projected ? ' · Projected' : ''}</div>
            </div>
            <div class="font-amount-display text-amount-display text-on-surface tabular-nums">${r.instance.amountExpected != null ? formatAmount(r.instance.amountExpected) : '—'}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `, {
    labelledBy: 'day-detail-title',
    onMount: (root) => {
      root.querySelector('[data-close]').addEventListener('click', closeModal);
      root.querySelectorAll('[data-instance-id]').forEach((el) => {
        if (!el.dataset.instanceId) return;
        const open = () => {
          const inst = state.instances.find((i) => i.id === el.dataset.instanceId);
          if (inst) { closeModal(); openObligationDetail(inst); }
        };
        el.addEventListener('click', open);
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      });
    },
  });
}
