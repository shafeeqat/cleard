// Placeholder About page, reachable from the hamburger drawer. Real content
// (credits, links, changelog, whatever it ends up being) comes later — this
// is deliberately minimal for now.

import { openModal, closeModal } from '../ui.js';

export function openAboutModal() {
  openModal(`
    <div class="p-6 text-center">
      <div class="flex justify-end -mr-1 -mt-1 mb-2">
        <button data-close class="p-1 text-secondary hover:text-primary transition-colors rounded-full focus-ring" aria-label="Close">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </div>
      <div id="about-heading" class="font-display-serif text-display-serif italic text-primary mb-2">clear'd.</div>
      <p class="font-body-lg text-body-lg text-on-surface-variant mb-8">Every month. clear'd.</p>
      <p class="font-body-sm text-body-sm text-secondary mb-8">More about clear'd. is coming soon.</p>
      <p class="font-label-caps text-label-caps text-outline">VERSION 1.0.0</p>
    </div>
  `, {
    labelledBy: 'about-heading',
    onMount: (root) => {
      root.querySelector('[data-close]').addEventListener('click', closeModal);
    },
  });
}
