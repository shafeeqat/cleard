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
  currentMonth: monthKeyFromDate(new Date()),
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
