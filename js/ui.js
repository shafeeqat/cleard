// Small shared UI primitives — toasts and a generic modal/sheet host. Kept
// framework-free and DOM-direct, matching the rest of the app.

const toastRoot = () => document.getElementById('toast-root');
const modalRoot = () => document.getElementById('modal-root');

// §52: failed saves/generation must surface, never fail silently or leave
// the UI implying success it didn't earn.
export function showToast(message, { tone = 'default', duration = 4000 } = {}) {
  const root = toastRoot();
  if (!root) return;
  const el = document.createElement('div');
  const toneClasses = tone === 'error'
    ? 'bg-error text-on-error'
    : tone === 'success'
      ? 'bg-success text-on-success-container'
      : 'bg-inverse-surface text-inverse-on-surface';
  el.className = `pointer-events-auto fade-in font-body-sm text-body-sm px-4 py-3 rounded-lg shadow-lg max-w-sm text-center ${toneClasses}`;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 200ms ease';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 220);
  }, duration);
}

let lastFocusedBeforeModal = null;

export function openModal(innerHtml, { onMount, labelledBy, wide = false } = {}) {
  const root = modalRoot();
  if (!root) return;
  lastFocusedBeforeModal = document.activeElement;
  root.innerHTML = `
    <div id="modal-backdrop" class="fixed inset-0 z-50 sheet-backdrop fade-in"></div>
    <div class="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div id="modal-dialog" role="dialog" aria-modal="true" ${labelledBy ? `aria-labelledby="${labelledBy}"` : ''}
        class="rise-in bg-surface-container-lowest w-full ${wide ? 'md:max-w-lg' : 'md:max-w-md'} md:rounded-xl rounded-t-xl max-h-[90vh] overflow-y-auto">
        ${innerHtml}
      </div>
    </div>`;
  const backdrop = document.getElementById('modal-backdrop');
  backdrop.addEventListener('click', closeModal);
  document.addEventListener('keydown', onModalKeydown);
  if (onMount) onMount(root);
  const focusable = root.querySelector('[data-autofocus]') || root.querySelector('input, button, select, textarea');
  focusable?.focus();
}

function onModalKeydown(e) {
  if (e.key === 'Escape') closeModal();
}

export function closeModal() {
  const root = modalRoot();
  if (!root) return;
  root.innerHTML = '';
  document.removeEventListener('keydown', onModalKeydown);
  if (lastFocusedBeforeModal && document.contains(lastFocusedBeforeModal)) {
    lastFocusedBeforeModal.focus();
  }
  lastFocusedBeforeModal = null;
}

// Promise-based confirm, used for §20's explicit lifecycle-change warnings
// and §36's destructive-action confirmations.
export function confirmDialog({ title, messages = [], confirmLabel = 'Continue', cancelLabel = 'Cancel', destructive = false }) {
  return new Promise((resolve) => {
    openModal(`
      <div class="p-6">
        <h2 id="confirm-title" class="font-title-md text-title-md mb-3">${escapeHtml(title)}</h2>
        <div class="font-body-sm text-body-sm text-on-surface-variant flex flex-col gap-2 mb-6">
          ${messages.map((m) => `<p>${escapeHtml(m)}</p>`).join('')}
        </div>
        <div class="flex gap-3 justify-end">
          <button id="confirm-cancel" class="font-title-md text-title-md px-4 py-2 rounded border border-outline-variant hover:bg-surface-container-low transition-colors">${escapeHtml(cancelLabel)}</button>
          <button id="confirm-ok" data-autofocus class="font-title-md text-title-md px-4 py-2 rounded ${destructive ? 'bg-error text-on-error' : 'bg-primary text-on-primary'} hover:opacity-90 transition-opacity">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `, {
      labelledBy: 'confirm-title',
      onMount: (root) => {
        root.querySelector('#confirm-cancel').addEventListener('click', () => { closeModal(); resolve(false); });
        root.querySelector('#confirm-ok').addEventListener('click', () => { closeModal(); resolve(true); });
      },
    });
  });
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
