// Module-scope app state — same pattern RepSprout uses (plain mutable
// object, listeners re-render on change) rather than pulling in a state
// management library the app doesn't need (§51).

import { monthKeyFromDate } from './utils/dates.js';

export const state = {
  user: null,
  obligations: [],
  instances: [],
  settings: null,
  obligationsLoaded: false,
  instancesLoaded: false,
  settingsLoaded: false,
  currentView: 'home',
  // The real "today" month — anchors monthly generation and the integrity
  // check. Never changed by month-navigation UI.
  currentMonth: monthKeyFromDate(new Date()),
  // Which month Home is currently displaying — starts on currentMonth, but
  // moves independently when the user taps the prev/next month arrows.
  viewedMonth: monthKeyFromDate(new Date()),
  historyOpenMonth: null,
};

export const DEFAULT_SETTINGS = {
  theme: 'system',
  preferredPaymentDay: 'lastWorkingDay', // 'lastWorkingDay' | 'dayOfMonth'
  preferredPaymentDayOfMonth: null,
  currency: 'USD',
  notifications: {
    monthlyReminders: true,
    completionNotifications: true,
    upcomingReminders: true,
    pendingReminders: true,
  },
  openaiApiKey: '',
};

export function effectiveSettings() {
  return { ...DEFAULT_SETTINGS, ...(state.settings || {}), notifications: { ...DEFAULT_SETTINGS.notifications, ...(state.settings?.notifications || {}) } };
}

export function allDataLoaded() {
  return state.obligationsLoaded && state.instancesLoaded && state.settingsLoaded;
}
