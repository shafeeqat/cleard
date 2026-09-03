import { state, effectiveSettings } from '../state.js';
import { saveSettings, signOutUser, createBackup, listBackups, restoreBackup, fetchFullExport } from '../firebase.js';
import { testOpenAIConnection } from '../ai/openai.js';
import { showToast, confirmDialog, escapeHtml } from '../ui.js';
import { applyTheme, renderCurrentView } from '../main.js';
import { withTimeout } from '../utils/async.js';

const CURRENCIES = ['SGD', 'USD', 'EUR', 'GBP', 'AUD', 'MYR'];

export function renderSettings(container) {
  const settings = effectiveSettings();
  container.innerHTML = `
    <div class="max-w-2xl mx-auto">
      <h1 id="settings-heading" class="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-primary mb-section-gap">Settings</h1>
      <div class="flex flex-col gap-section-gap">

        <section class="flex flex-col gap-stack-gap">
          <h2 class="font-label-caps text-label-caps text-secondary uppercase">Appearance</h2>
          <div class="segmented" role="group" aria-label="Theme">
            <button type="button" data-theme="system" aria-pressed="${settings.theme === 'system'}">System</button>
            <button type="button" data-theme="light" aria-pressed="${settings.theme === 'light'}">Light</button>
            <button type="button" data-theme="dark" aria-pressed="${settings.theme === 'dark'}">Dark</button>
          </div>
        </section>

        <section class="flex flex-col gap-stack-gap">
          <h2 class="font-label-caps text-label-caps text-secondary uppercase">Payment</h2>
          <div class="border border-outline-variant rounded-lg overflow-hidden divide-y divide-outline-variant bg-surface-container-lowest">
            <div class="p-4 flex justify-between items-center gap-4">
              <span class="font-body-lg text-body-lg">Preferred payment day</span>
              <select id="s-preferredPaymentDay" class="font-body-sm text-body-sm text-secondary bg-transparent focus-ring">
                <option value="lastWorkingDay" ${settings.preferredPaymentDay === 'lastWorkingDay' ? 'selected' : ''}>Last working day of the month before</option>
                <option value="dayOfMonth" ${settings.preferredPaymentDay === 'dayOfMonth' ? 'selected' : ''}>A specific day of the month</option>
              </select>
            </div>
            <div id="s-paymentDayOfMonth-row" class="p-4 flex justify-between items-center gap-4 ${settings.preferredPaymentDay === 'dayOfMonth' ? '' : 'hidden'}">
              <span class="font-body-lg text-body-lg">Day of month</span>
              <input id="s-preferredPaymentDayOfMonth" type="number" min="1" max="31" value="${settings.preferredPaymentDayOfMonth ?? ''}" class="w-20 text-right font-body-sm text-body-sm bg-transparent focus-ring border-b border-outline-variant">
            </div>
            <div class="p-4 flex justify-between items-center gap-4">
              <span class="font-body-lg text-body-lg">Currency</span>
              <select id="s-currency" class="font-body-sm text-body-sm text-secondary bg-transparent focus-ring">
                ${CURRENCIES.map((c) => `<option value="${c}" ${settings.currency === c ? 'selected' : ''}>${c}</option>`).join('')}
              </select>
            </div>
          </div>
        </section>

        <section class="flex flex-col gap-stack-gap">
          <h2 class="font-label-caps text-label-caps text-secondary uppercase">Notifications</h2>
          <div class="border border-outline-variant rounded-lg overflow-hidden divide-y divide-outline-variant bg-surface-container-lowest">
            ${toggleRow('monthlyReminders', 'Monthly reminders', settings.notifications.monthlyReminders)}
            ${toggleRow('completionNotifications', 'Completion notifications', settings.notifications.completionNotifications)}
            ${toggleRow('upcomingReminders', 'Upcoming obligations', settings.notifications.upcomingReminders)}
            ${toggleRow('pendingReminders', 'Pending bill reminders', settings.notifications.pendingReminders)}
          </div>
        </section>

        <section class="flex flex-col gap-stack-gap">
          <h2 class="font-label-caps text-label-caps text-secondary uppercase">AI Integration</h2>
          <div class="border border-outline-variant rounded-lg p-4 flex flex-col gap-4 bg-surface-container-lowest">
            <div class="flex flex-col gap-2">
              <label class="font-label-caps text-label-caps text-secondary uppercase" for="s-openaiKey">OpenAI API key</label>
              <input id="s-openaiKey" type="password" autocomplete="off" placeholder="sk-..." value="${escapeHtml(settings.openaiApiKey || '')}"
                class="w-full bg-surface-container-low border-none rounded font-mono text-sm py-2 px-3 focus-ring">
              <p class="font-body-sm text-body-sm text-secondary">Stored on your own account only. Never shared, never a developer-provided key. AI features are entirely optional — everything else works without this.</p>
            </div>
            <div class="pt-2 flex justify-between items-center border-t border-outline-variant">
              <button id="s-test-connection" class="font-title-md text-title-md text-primary underline underline-offset-2">Test connection</button>
              <span id="s-connection-status" class="font-body-sm text-body-sm"></span>
            </div>
          </div>
        </section>

        <section class="flex flex-col gap-stack-gap">
          <h2 class="font-label-caps text-label-caps text-secondary uppercase">Data Management</h2>
          <div class="border border-outline-variant rounded-lg overflow-hidden flex flex-col divide-y divide-outline-variant bg-surface-container-lowest">
            <button id="s-export" class="p-4 flex items-center gap-3 hover:bg-surface-container-low transition-colors text-left w-full">
              <span class="material-symbols-outlined text-secondary" aria-hidden="true">download</span>
              <span class="font-body-lg text-body-lg">Export Data</span>
            </button>
            <button id="s-backup" class="p-4 flex items-center gap-3 hover:bg-surface-container-low transition-colors text-left w-full">
              <span class="material-symbols-outlined text-secondary" aria-hidden="true">backup</span>
              <span class="font-body-lg text-body-lg">Backup now</span>
            </button>
            <button id="s-restore" class="p-4 flex items-center gap-3 hover:bg-surface-container-low transition-colors text-left w-full">
              <span class="material-symbols-outlined text-secondary" aria-hidden="true">restore</span>
              <span class="font-body-lg text-body-lg">Restore from backup</span>
            </button>
          </div>
        </section>

        <section class="mt-section-gap flex flex-col items-center text-center gap-2 opacity-60">
          <div class="font-display-serif text-display-serif italic text-primary">clear'd.</div>
          <p class="font-body-sm text-body-sm text-secondary">Every month. clear'd.</p>
          <p class="font-label-caps text-label-caps text-outline mt-4">VERSION 1.0.0</p>
        </section>

        <button id="s-signout" class="font-body-sm text-body-sm text-error self-center">Sign out</button>
      </div>
    </div>
  `;

  wire(container, settings);
}

function toggleRow(key, label, checked) {
  return `
    <div class="p-4 flex justify-between items-center">
      <span class="font-body-lg text-body-lg">${escapeHtml(label)}</span>
      <button type="button" class="toggle" data-notif="${key}" role="switch" aria-checked="${!!checked}" aria-label="${escapeHtml(label)}">
        <span class="dot"></span>
      </button>
    </div>
  `;
}

function wire(container, settings) {
  container.querySelectorAll('[data-theme]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      container.querySelectorAll('[data-theme]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      await persist({ theme: btn.dataset.theme });
      applyTheme();
    });
  });

  const dayTypeSelect = container.querySelector('#s-preferredPaymentDay');
  dayTypeSelect.addEventListener('change', async () => {
    container.querySelector('#s-paymentDayOfMonth-row').classList.toggle('hidden', dayTypeSelect.value !== 'dayOfMonth');
    await persist({ preferredPaymentDay: dayTypeSelect.value });
  });
  container.querySelector('#s-preferredPaymentDayOfMonth')?.addEventListener('change', (e) => {
    persist({ preferredPaymentDayOfMonth: Number(e.target.value) || null });
  });
  container.querySelector('#s-currency').addEventListener('change', (e) => {
    persist({ currency: e.target.value });
    renderCurrentView();
  });

  container.querySelectorAll('[data-notif]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.getAttribute('aria-checked') !== 'true';
      btn.setAttribute('aria-checked', String(next));
      persist({ notifications: { ...effectiveSettings().notifications, [btn.dataset.notif]: next } });
    });
  });

  const keyInput = container.querySelector('#s-openaiKey');
  let keyDebounce;
  keyInput.addEventListener('input', () => {
    clearTimeout(keyDebounce);
    keyDebounce = setTimeout(() => persist({ openaiApiKey: keyInput.value.trim() }), 500);
  });

  container.querySelector('#s-test-connection').addEventListener('click', async () => {
    const statusEl = container.querySelector('#s-connection-status');
    statusEl.textContent = 'Testing…';
    statusEl.className = 'font-body-sm text-body-sm text-secondary';
    const result = await testOpenAIConnection(keyInput.value.trim());
    if (result.ok) {
      statusEl.innerHTML = `<span class="inline-flex items-center gap-1 text-on-success-container bg-success-container px-2 py-1 rounded"><span class="material-symbols-outlined text-sm" aria-hidden="true">check_circle</span> Connected</span>`;
    } else {
      statusEl.innerHTML = `<span class="inline-flex items-center gap-1 text-on-error-container bg-error-container px-2 py-1 rounded"><span class="material-symbols-outlined text-sm" aria-hidden="true">error</span> ${escapeHtml(result.error)}</span>`;
    }
  });

  container.querySelector('#s-export').addEventListener('click', async () => {
    try {
      const data = await fetchFullExport(state.user.uid);
      downloadJSON(data, `cleard-export-${data.exportedAt.slice(0, 10)}.json`);
      showToast('Export downloaded.', { tone: 'success' });
    } catch (e) {
      showToast("Couldn't export your data. Please try again.", { tone: 'error' });
    }
  });

  container.querySelector('#s-backup').addEventListener('click', async () => {
    try {
      await withTimeout(createBackup(state.user.uid));
      showToast('Backup created.', { tone: 'success' });
    } catch (e) {
      showToast(e.message.includes('too long') ? e.message : "Couldn't create a backup. Please try again.", { tone: 'error' });
    }
  });

  container.querySelector('#s-restore').addEventListener('click', async () => {
    let backups;
    try {
      backups = await withTimeout(listBackups(state.user.uid));
    } catch (e) {
      showToast(e.message.includes('too long') ? e.message : "Couldn't load your backups.", { tone: 'error' });
      return;
    }
    if (backups.length === 0) {
      showToast('No backups yet — create one first.', { tone: 'default' });
      return;
    }
    const latest = backups[0];
    const confirmed = await confirmDialog({
      title: 'Restore from backup?',
      messages: [
        `This restores obligations and settings from your backup taken on ${new Date(latest.exportedAt).toLocaleString()}.`,
        "It won't remove any obligations you've added since — it only overwrites what's in the backup.",
      ],
      confirmLabel: 'Restore',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await withTimeout(restoreBackup(state.user.uid, latest.id));
      showToast('Restore complete.', { tone: 'success' });
    } catch (e) {
      showToast(e.message.includes('too long') ? e.message : "Couldn't restore this backup. Please try again.", { tone: 'error' });
    }
  });

  container.querySelector('#s-signout').addEventListener('click', () => signOutUser());
}

async function persist(partial) {
  try {
    await withTimeout(saveSettings(state.user.uid, partial));
    showToast('Saved.', { tone: 'success', duration: 1500 });
  } catch (e) {
    showToast(e.message.includes('too long') ? e.message : "Couldn't save this setting. Please try again.", { tone: 'error' });
  }
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
