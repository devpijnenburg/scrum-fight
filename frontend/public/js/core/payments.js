// Is the payments feature switched on for this environment?
//
// The backend decides (PAYMENTS_ENABLED); pages use the answer to show or
// hide links to the subscription page. Cached briefly per tab so every
// page load does not ask again.

import { apiFetch } from './api.js';

const CACHE_KEY = 'sfPaymentsEnabled';
const CACHE_MS = 5 * 60 * 1000;

export async function paymentsEnabled() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.enabled;
  } catch {
    // unreadable cache: ask again
  }
  let enabled = false;
  try {
    enabled = Boolean((await apiFetch('/payments/offers')).enabled);
  } catch {
    return false; // not cached, so the next page tries again
  }
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ enabled, at: Date.now() }));
  } catch {
    // storage unavailable: just not cached
  }
  return enabled;
}

// Links to the subscription page are for visitors who can buy something
// there, and for anyone on a paid plan (to manage or cancel it), also
// while selling is switched off.
export function showSubscriptionLinks(enabled, user) {
  return enabled || Boolean(user && user.plan && user.plan !== 'free');
}
