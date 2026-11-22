// Shared API helper used by all pages.
import { errorText } from './errors.js';
const API_BASE = '/api';

let _providersCache = null;

export async function getOAuthProviders() {
  if (_providersCache) return _providersCache;
  try {
    _providersCache = await apiFetch('/auth/providers');
  } catch {
    _providersCache = { google: false, github: false };
  }
  return _providersCache;
}

export async function initOAuthButtons(scope = document) {
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

// Human-readable message for an API error body (see core/errors.js).
export function apiErrorMessage(body) {
  return errorText(body, 'Verzoek mislukt');
}

export function getToken() {
  return localStorage.getItem('token');
}

export async function apiFetch(path, options = {}) {
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
