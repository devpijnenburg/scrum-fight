// Subscription page: choose or change a paid plan (entry module of subscription.html).
//
// A new subscription goes through the hosted checkout of the payment
// provider. The customer returns here with a signed query string; the
// overlay then waits until the backend confirms the plan — pushed over the
// socket as soon as the payment is processed, with polling as fallback.

import '../core/errorReporter.js'; // als eerste: meldt ook fouten van de modules hieronder
import '../components/siteChrome.js';
import '../ui/planCards.js';
import { t, getLang } from '../core/i18n.js';
import { apiFetch } from '../core/api.js';
import { getCurrentUser } from '../core/auth.js';
import { escapeHtml } from '../core/html.js';
import { showToast } from '../ui/toast.js';

const POLL_INTERVAL_MS = 2000;
const POLL_ATTEMPTS = 20;
const SUCCESS_VISIBLE_MS = 1800;

const $ = (id) => document.getElementById(id);
const urlParams = new URLSearchParams(location.search);
const loggedIn = !!getCurrentUser();

// The plan cards (<sf-plan-cards>) load the offers and the visitor's
// subscription and handle buying and changing; this page adds the status of
// the current subscription and the return from the checkout.
const cards = $('planCards');
if (urlParams.get('plan')) cards.setAttribute('selected', urlParams.get('plan'));
if (urlParams.get('billing')) cards.setAttribute('billing', urlParams.get('billing'));

// ── Current subscription ──────────────────────────────────────────────────────

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(getLang() === 'nl' ? 'nl-NL' : 'en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function renderStatus(sub) {
  const el = $('subscriptionStatus');
  if (!sub) {
    el.classList.add('hidden');
    return;
  }

  const planName = sub.plan === 'premium' ? 'Premium' : 'Pro';
  const period = sub.billing ? ` · ${t(`subscription.billing.${sub.billing}`)}` : '';
  let detail = '';
  if (sub.status === 'past_due') detail = t('subscription.status.past_due');
  else if (sub.currentPeriodEnd) {
    detail = t(sub.endsAtPeriodEnd ? 'subscription.status.ends' : 'subscription.status.renews',
      { date: formatDate(sub.currentPeriodEnd) });
  }

  el.innerHTML = `
    <div class="supporter-note${sub.status === 'past_due' ? ' supporter-note-warning' : ''}">
      <span class="supporter-note-icon">${sub.status === 'past_due' ? '⚠️' : '🙏'}</span>
      <div class="supporter-note-body">
        <strong>${escapeHtml(t('subscription.status.active', { plan: planName }))}${escapeHtml(period)}</strong>
        <p>${escapeHtml(t('subscription.status.thanks'))}</p>
        ${detail ? `<p class="supporter-note-detail">${escapeHtml(detail)}</p>` : ''}
        <button type="button" class="btn btn-ghost btn-sm" id="managePlanBtn">${escapeHtml(t('subscription.manage'))}</button>
        <p class="supporter-note-hint">${escapeHtml(t('subscription.manage_hint'))}</p>
      </div>
    </div>`;
  el.classList.remove('hidden');
  $('managePlanBtn').addEventListener('click', openPortal);
}

async function openPortal() {
  const btn = $('managePlanBtn');
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = t('subscription.loading');
  try {
    const { url } = await apiFetch('/payments/portal', { method: 'POST' });
    window.location.href = url;
  } catch (err) {
    if (err.status === 401) window.location.href = '/login.html';
    else showToast(err.message, { icon: '⚠️' });
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

$('backToDashboard').classList.toggle('hidden', !loggedIn);
cards.addEventListener('plans:loaded', (e) => {
  $('paymentsDisabled').classList.toggle('hidden', e.detail.enabled);
  renderStatus(e.detail.subscription);
});

// ── Return from the checkout ──────────────────────────────────────────────────

// Resolves once the backend reports the paid plan as active, or with false
// when that did not happen within the waiting time.
function waitForActivation(query) {
  return new Promise((resolve) => {
    let attempts = 0;
    let finished = false;
    let checking = false;
    let socket = null;

    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      socket?.disconnect();
      resolve(result);
    };

    const check = async () => {
      if (finished || checking) return;
      checking = true;
      try {
        const result = await apiFetch('/payments/confirm', { method: 'POST', body: JSON.stringify({ query }) });
        if (result.status === 'active') {
          if (result.token) localStorage.setItem('token', result.token);
          finish(true);
        }
      } catch (err) {
        if (err.status === 401) finish(false);
      } finally {
        checking = false;
      }
    };

    const timer = setInterval(() => {
      attempts += 1;
      if (attempts >= POLL_ATTEMPTS) finish(false);
      else check();
    }, POLL_INTERVAL_MS);

    // Instant path: the backend pushes 'plan-updated' when the webhook lands.
    if (typeof window.io === 'function') {
      try {
        socket = window.io();
        socket.on('connect', () => socket.emit('watch-account', { token: localStorage.getItem('token') }));
        socket.on('plan-updated', check);
      } catch {
        socket = null; // polling still runs
      }
    }

    check();
  });
}

async function handleCheckoutReturn() {
  const query = location.search.slice(1);
  const overlay = $('paymentProcessing');
  const main = $('subscriptionMain');
  overlay.classList.remove('hidden');
  main.classList.add('hidden');

  const activated = await waitForActivation(query);

  if (!activated) {
    $('payProcSpinner').classList.add('pay-proc-spinner--paused');
    $('payProcTitle').textContent = t('subscription.processing.slow');
    $('payProcSubtitle').classList.add('hidden');
    $('payProcTimeout').classList.remove('hidden');
    // The query string is still in the address bar, so a reload checks again.
    $('payProcRetry').addEventListener('click', () => location.reload());
    return;
  }

  history.replaceState({}, '', '/subscription.html');
  $('payProcSpinner').classList.add('hidden');
  $('payProcCheck').classList.remove('hidden');
  $('payProcTitle').textContent = t('subscription.processing.done');
  $('payProcTitle').classList.add('pay-proc-title--success');
  $('payProcSubtitle').textContent = t('subscription.processing.thanks');

  await cards.load();
  setTimeout(() => {
    overlay.classList.add('hidden');
    main.classList.remove('hidden');
    document.querySelector('site-nav')?._render?.(); // the navbar shows the new session
  }, SUCCESS_VISIBLE_MS);
}

// ── Start ─────────────────────────────────────────────────────────────────────

if (loggedIn && urlParams.has('checkout_id')) handleCheckoutReturn();
