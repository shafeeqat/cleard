// Optional AI entry points surfaced on Home: a monthly review summary and
// free-form Q&A. Both are purely read-only against already-scoped-to-this-
// user data — neither can create, edit, or clear anything (§44/§46).

import { state, effectiveSettings } from '../state.js';
import { summarizeMonth, answerQuestion } from '../ai/openai.js';
import { checkMonthIntegrity } from '../models/integrity.js';
import { isCleared } from '../models/monthlyInstances.js';
import { addMonths, monthShortLabel } from '../utils/dates.js';
import { formatAmount } from '../utils/format.js';
import { openModal, closeModal, escapeHtml } from '../ui.js';

export function isAiAvailable() {
  return !!effectiveSettings().openaiApiKey;
}

function monthSummaryData(month) {
  const instances = state.instances.filter((i) => i.month === month);
  return {
    month: monthShortLabel(month),
    totalObligations: instances.length,
    cleared: instances.filter(isCleared).length,
    totalAmount: instances.reduce((s, i) => s + (i.amountActual ?? i.amountExpected ?? 0), 0),
    pending: instances.filter((i) => i.status === 'pending').length,
  };
}

export function openMonthlyReview() {
  const apiKey = effectiveSettings().openaiApiKey;
  const current = monthSummaryData(state.currentMonth);
  const previous = monthSummaryData(addMonths(state.currentMonth, -1));

  openModal(`
    <div class="p-6">
      <div class="flex items-start justify-between mb-4">
        <h2 id="review-title" class="font-headline-lg-mobile text-headline-lg-mobile text-primary">Monthly review</h2>
        <button data-close class="p-1 -mr-1 -mt-1 text-secondary hover:text-primary transition-colors rounded-full focus-ring" aria-label="Close">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </div>
      <div id="review-body" class="font-body-lg text-body-lg text-on-surface-variant">Thinking&hellip;</div>
    </div>
  `, {
    labelledBy: 'review-title',
    onMount: (root) => {
      root.querySelector('[data-close]').addEventListener('click', closeModal);
      summarizeMonth(apiKey, current, previous)
        .then((summary) => { root.querySelector('#review-body').textContent = summary; })
        .catch(() => { root.querySelector('#review-body').textContent = "Couldn't generate a review right now."; });
    },
  });
}

export function openAskQuestion() {
  const apiKey = effectiveSettings().openaiApiKey;
  const context = {
    currentMonth: monthSummaryData(state.currentMonth),
    obligations: state.obligations
      .filter((o) => o.status !== 'deleted')
      .map((o) => ({
        name: o.name, category: o.category, amountType: o.amountType, fixedAmount: o.fixedAmount,
        frequency: o.frequency, startMonth: o.startMonth, endMonth: o.endMonth,
        occurrenceCount: o.occurrenceCount, status: o.status,
      })),
    integrityThisMonth: checkMonthIntegrity({ obligations: state.obligations, instances: state.instances, targetMonth: state.currentMonth }),
  };

  openModal(`
    <div class="p-6">
      <div class="flex items-start justify-between mb-4">
        <h2 id="ask-title" class="font-headline-lg-mobile text-headline-lg-mobile text-primary">Ask clear'd.</h2>
        <button data-close class="p-1 -mr-1 -mt-1 text-secondary hover:text-primary transition-colors rounded-full focus-ring" aria-label="Close">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </div>
      <div class="flex gap-2 mb-4">
        <input id="ask-input" data-autofocus type="text" placeholder="e.g. What do I still need to clear this month?"
          class="flex-1 border border-outline-variant rounded px-3 py-2 font-body-sm text-body-sm bg-surface-container-lowest focus-ring">
        <button id="ask-submit" class="font-label-caps text-label-caps px-3 py-2 rounded bg-primary text-on-primary hover:opacity-90 transition-opacity">Ask</button>
      </div>
      <div id="ask-answer" class="font-body-lg text-body-lg text-on-surface-variant"></div>
    </div>
  `, {
    labelledBy: 'ask-title',
    onMount: (root) => {
      root.querySelector('[data-close]').addEventListener('click', closeModal);
      const submit = async () => {
        const q = root.querySelector('#ask-input').value.trim();
        if (!q) return;
        const answerEl = root.querySelector('#ask-answer');
        answerEl.textContent = 'Thinking…';
        try {
          answerEl.textContent = await answerQuestion(apiKey, context, q);
        } catch {
          answerEl.textContent = "Couldn't answer that right now.";
        }
      };
      root.querySelector('#ask-submit').addEventListener('click', submit);
      root.querySelector('#ask-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    },
  });
}
