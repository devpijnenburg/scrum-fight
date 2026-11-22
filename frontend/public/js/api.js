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

// Human-readable message for an API error body. The backend sends a stable
// `code` plus a Dutch fallback in `error`; translate the code when the page
// has i18n loaded and knows it. Extra body fields fill {placeholders}.
function apiErrorMessage(body) {
  if (body.code && typeof t === 'function') {
    const key = `errors.${body.code}`;
    const msg = t(key, body);
    if (msg !== key) return msg;
  }
  return body.error || 'Verzoek mislukt';
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
    if (res.status === 401) {
      localStorage.removeItem('token');
    }
    const body = await res.json().catch(() => ({ error: 'Verzoek mislukt' }));
    const err = new Error(apiErrorMessage(body));
    err.status = res.status;
    err.code = body.code;
    throw err;
  }

  if (res.status === 204) return null;
  return res.json();
}
