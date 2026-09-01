import {
  isFirebaseConfigured, watchAuth, signInWithGoogle, signOutUser, ensureUserProfile,
  subscribeObligations, subscribeInstances, subscribeSettings, firestoreGenerationAdapter,
} from './firebase.js';
import { state, allDataLoaded, effectiveSettings } from './state.js';
import { generateMonthInFirestore } from './models/monthlyGeneration.js';
import { showToast } from './ui.js';
import { withTimeout } from './utils/async.js';
import { renderHome } from './views/home.js';
import { renderObligationsList } from './views/obligationsList.js';
import { renderHistory } from './views/history.js';
import { renderSettings } from './views/settings.js';

const VIEWS = ['home', 'obligations', 'history', 'settings'];
let unsubscribers = [];
let generationRanForMonth = null;

// ── Config banner (mirrors RepSprout's own "not configured" pattern) ──────
if (!isFirebaseConfigured) {
  document.getElementById('cfg-banner').classList.remove('hidden');
}

// ── Theme ──────────────────────────────────────────────────────────────────
const darkMedia = window.matchMedia('(prefers-color-scheme: dark)');
export function applyTheme() {
  const pref = effectiveSettings().theme; // 'system' | 'light' | 'dark'
  const dark = pref === 'dark' || (pref === 'system' && darkMedia.matches);
  document.documentElement.classList.toggle('dark', dark);
}
darkMedia.addEventListener('change', () => { if (effectiveSettings().theme === 'system') applyTheme(); });
applyTheme(); // default settings until real settings load

// ── View routing ───────────────────────────────────────────────────────────
export function goView(view) {
  if (!VIEWS.includes(view)) view = 'home';
  state.currentView = view;
  for (const v of VIEWS) {
    document.getElementById(`view-${v}`).classList.toggle('hidden', v !== view);
  }
  document.querySelectorAll('[data-view]').forEach((el) => {
    el.classList.toggle('active', el.dataset.view === view);
    if (el.classList.contains('nav-link') || el.classList.contains('bnav-link')) {
      el.setAttribute('aria-current', el.dataset.view === view ? 'page' : 'false');
    }
  });
  if (location.hash.slice(1) !== view) history.replaceState(null, '', `#${view}`);
  renderCurrentView();
  document.getElementById('main-content')?.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
  closeMobileDrawer();
}

export function renderCurrentView() {
  if (!allDataLoaded()) return;
  switch (state.currentView) {
    case 'home': renderHome(document.getElementById('view-home')); break;
    case 'obligations': renderObligationsList(document.getElementById('view-obligations')); break;
    case 'history': renderHistory(document.getElementById('view-history')); break;
    case 'settings': renderSettings(document.getElementById('view-settings')); break;
  }
}

document.querySelectorAll('[data-view]').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    goView(el.dataset.view);
  });
});
window.addEventListener('hashchange', () => {
  const v = location.hash.slice(1);
  if (VIEWS.includes(v) && v !== state.currentView) goView(v);
});

// ── Mobile drawer ──────────────────────────────────────────────────────────
const drawer = document.getElementById('mobile-drawer');
const drawerBackdrop = document.getElementById('mobile-drawer-backdrop');
const hamburgerBtn = document.getElementById('hamburger-btn');
function openMobileDrawer() {
  drawer.classList.remove('hidden');
  drawerBackdrop.classList.remove('hidden');
  hamburgerBtn.setAttribute('aria-expanded', 'true');
}
function closeMobileDrawer() {
  drawer.classList.add('hidden');
  drawerBackdrop.classList.add('hidden');
  hamburgerBtn.setAttribute('aria-expanded', 'false');
}
hamburgerBtn.addEventListener('click', () => {
  drawer.classList.contains('hidden') ? openMobileDrawer() : closeMobileDrawer();
});
drawerBackdrop.addEventListener('click', closeMobileDrawer);

// ── Account menu ─────────────────────────────────────────────────────────
const accountBtn = document.getElementById('account-btn');
const accountMenu = document.getElementById('account-menu');
accountBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const isHidden = accountMenu.classList.contains('hidden');
  accountMenu.classList.toggle('hidden', !isHidden);
  accountBtn.setAttribute('aria-expanded', String(isHidden));
});
document.addEventListener('click', (e) => {
  if (!accountMenu.classList.contains('hidden') && !accountMenu.contains(e.target) && e.target !== accountBtn) {
    accountMenu.classList.add('hidden');
    accountBtn.setAttribute('aria-expanded', 'false');
  }
});
document.getElementById('signout-btn').addEventListener('click', async () => {
  accountMenu.classList.add('hidden');
  await signOutUser();
});

// ── Sign-in ────────────────────────────────────────────────────────────────
document.getElementById('signin-btn').addEventListener('click', async () => {
  const errorEl = document.getElementById('signin-error');
  errorEl.classList.add('hidden');
  try {
    await signInWithGoogle();
  } catch (e) {
    errorEl.textContent = 'Sign-in failed: ' + (e.message || 'please try again.');
    errorEl.classList.remove('hidden');
  }
});

// ── Boot ─────────────────────────────────────────────────────────────────
function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }
function showFlex(id) { document.getElementById(id).classList.remove('hidden'); document.getElementById(id).classList.add('flex'); }

function cleanupSubscriptions() {
  unsubscribers.forEach((u) => u());
  unsubscribers = [];
}

watchAuth(async (user) => {
  hide('view-loading');
  if (!user) {
    cleanupSubscriptions();
    state.user = null;
    state.obligations = [];
    state.instances = [];
    state.settings = null;
    state.obligationsLoaded = state.instancesLoaded = state.settingsLoaded = false;
    generationRanForMonth = null;
    hide('app-shell');
    showFlex('view-signed-out');
    return;
  }

  state.user = user;
  hide('view-signed-out');
  try {
    await ensureUserProfile(user);
  } catch (e) {
    showToast("Couldn't sync your profile. Some features may be unavailable until this reconnects.", { tone: 'error' });
  }

  document.getElementById('account-menu-email').textContent = user.email || user.displayName || '';

  cleanupSubscriptions();
  unsubscribers.push(subscribeObligations(user.uid, (obligations) => {
    state.obligations = obligations;
    state.obligationsLoaded = true;
    onDataChanged();
  }, () => showToast("Couldn't load your obligations. Check your connection.", { tone: 'error' })));

  unsubscribers.push(subscribeInstances(user.uid, (instances) => {
    state.instances = instances;
    state.instancesLoaded = true;
    onDataChanged();
  }, () => showToast("Couldn't load this month's data. Check your connection.", { tone: 'error' })));

  unsubscribers.push(subscribeSettings(user.uid, (settings) => {
    state.settings = settings;
    state.settingsLoaded = true;
    applyTheme();
    onDataChanged();
  }, () => showToast("Couldn't load your settings.", { tone: 'error' })));

  show('app-shell');
  document.getElementById('app-shell').classList.add('flex');
  goView(state.currentView === 'home' && location.hash ? (VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home') : state.currentView);
});

async function onDataChanged() {
  if (!allDataLoaded()) return;
  await maybeRunMonthlyGeneration();
  renderCurrentView();
}

// §21/§23: generate the current month's instances once data is loaded, then
// run the integrity check against the result. Runs at most once per session
// per month — re-running on every snapshot tick would be wasted Firestore
// reads/writes (§51), and generation is already idempotent if it did run
// again.
async function maybeRunMonthlyGeneration() {
  if (!state.user) return;
  if (generationRanForMonth === state.currentMonth) return;
  generationRanForMonth = state.currentMonth;
  try {
    const adapter = firestoreGenerationAdapter(state.user.uid);
    await withTimeout(generateMonthInFirestore(adapter, state.user.uid, state.currentMonth), 15000);
  } catch (e) {
    generationRanForMonth = null; // allow retry on next data tick
    showToast("We couldn't prepare this month yet. Pull to refresh or check your connection.", { tone: 'error' });
  }
  // Integrity is deliberately NOT cached here: it's recomputed fresh from
  // live state every time home.js renders (via getCurrentMonthIntegrity in
  // models/integrity.js), so it never reports stale "missing" instances
  // during the brief window before this write's onSnapshot echo arrives.
}
