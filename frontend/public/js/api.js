// Shared API helper used by all pages.
const API_BASE = '/api';

let _providersCache = null;

async function getOAuthProviders() {
  if (_providersCache) return _providersCache;
  try {
    _providersCache = await apiFetch('/auth/providers');
  } catch {
    _providersCache = { google: false, github: false };
  }
  return _providersCache;
}

async function initOAuthButtons(scope = document) {
  const providers = await getOAuthProviders();
  let anyVisible = false;

  scope.querySelectorAll('[data-oauth-provider]').forEach((btn) => {
    const enabled = providers[btn.dataset.oauthProvider];
    btn.classList.toggle('hidden', !enabled);
    if (enabled) anyVisible = true;
  });

  scope.querySelectorAll('.oauth-divider, .oauth-buttons').forEach((el) => {
    el.classList.toggle('hidden', !anyVisible);
  });
}

function getToken() {
  return localStorage.getItem('token');
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Verzoek mislukt' }));
    throw new Error(body.error || 'Verzoek mislukt');
  }

  return res.json();
}
