// Per-browser user preferences (localStorage `sfSettings`).
// Single source for every page that reads or writes them.

const SETTINGS_KEY = 'sfSettings';

export const DEFAULT_SETTINGS = {
  analyticsAutoOpen: true, // open the analytics panel automatically on reveal
  defaultMethod: '',       // preferred estimation method for new rooms ('' = none)
};

export function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(changes) {
  const next = { ...loadSettings(), ...changes };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable (private mode) — keep defaults
  }
  return next;
}

