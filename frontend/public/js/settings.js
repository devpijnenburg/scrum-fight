// Per-browser user preferences (localStorage `sfSettings`).
// Single source for every page that reads or writes them.

const SETTINGS_KEY = 'sfSettings';

const DEFAULT_SETTINGS = {
  analyticsAutoOpen: true, // open the analytics panel automatically on reveal
  defaultMethod: '',       // preferred estimation method for new rooms ('' = none)
};

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(changes) {
  const next = { ...loadSettings(), ...changes };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable (private mode) — keep defaults
  }
  return next;
}

if (typeof module !== 'undefined') module.exports = { loadSettings, saveSettings, DEFAULT_SETTINGS };
