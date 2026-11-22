// Subscription page: choose or change a paid plan (entry module of subscription.html).
//
// A new subscription goes through the hosted checkout of the payment
// provider. The customer returns here with a signed query string; the
// overlay then waits until the backend confirms the plan — pushed over the
// socket as soon as the payment is processed, with polling as fallback.

import '../components/siteChrome.js';
import { t, getLang } from '../core/i18n.js';
import { apiFetch } from '../core/api.js';
import { getCurrentUser } from '../core/auth.js';
import { escapeHtml } from '../core/html.js';
import { BILLING_PERIODS, formatPrice, yearlySavingPercent, cardAction } from '../core/plans.js';
import { confirmDialog } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';

const POLL_INTERVAL_MS = 2000;
const POLL_ATTEMPTS = 20;
const SUCCESS_VISIBLE_MS = 1800;

const $ = (id) => document.getElementById(id);
const urlParams = new URLSearchParams(location.search);
const loggedIn = !!getCurrentUser();

const state = {
  billing: urlParams.get('billing') === 'monthly' ? 'monthly' : 'yearly',
  offers: {},
  enabled: false,
  plan: getCurrentUser()?.plan || 'free',
  subscription: null,
};

// ── Data ──────────────────────────────────────────────────────────────────────

async function load() {
  const [offers, mine] = await Promise.all([
    apiFetch('/payments/offers').catch(() => ({ enabled: false, offers: {} })),
    loggedIn ? apiFetch('/payments/subscription').catch(() => null) : null,
  ]);
  state.enabled = offers.enabled;
  state.offers = offers.offers || {};
  if (mine) {
    state.plan = mine.plan;
    state.subscription = mine.subscription;
    // The token carries a copy of the plan; replace it when it is out of date.
    if (getCurrentUser()?.plan !== mine.plan) await refreshSession();
  }
  // Start on the period the subscriber already pays in.
  if (state.subscription?.billing && !urlParams.has('billing')) state.billing = state.subscription.billing;
  // A period without any offer is not worth showing.
  if (!hasOffers(state.billing)) state.billing = BILLING_PERIODS.find(hasOffers) || state.billing;
}

const hasOffers = (billing) => Object.values(state.offers).some((plan) => plan[billing]);

async function refreshSession() {
  try {
    const { token } = await apiFetch('/auth/refresh', { method: 'POST' });
    localStorage.setItem('token', token);
  } catch {
    // The old token keeps working; only the plan shown elsewhere lags behind.
  }
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(getLang() === 'nl' ? 'nl-NL' : 'en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function renderStatus() {
  const el = $('subscriptionStatus');
  const sub = state.subscription;
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

function renderToggle() {
  const toggle = $('billingToggle');
  toggle.classList.toggle('hidden', !BILLING_PERIODS.every(hasOffers));
  toggle.setAttribute('aria-label', t('subscription.billing.label'));
  toggle.querySelectorAll('.billing-toggle-btn').forEach((btn) => {
    const active = btn.dataset.billing === state.billing;
    btn.classList.toggle('billing-toggle-btn--active', active);
    btn.setAttribute('aria-pressed', String(active));
  });

  const saving = yearlySavingPercent(state.offers);
  const badge = $('billingSaveBadge');
  badge.textContent = t('subscription.billing.save', { percent: saving });
  badge.classList.toggle('hidden', saving <= 0);
}

function renderCards() {
  const selected = urlParams.get('plan');

  document.querySelectorAll('#planCards .plan-card').forEach((card) => {
    const plan = card.dataset.plan;
    const offer = state.offers[plan]?.[state.billing];

    const isCurrent = loggedIn && plan === state.plan;
    card.toggleAttribute('data-active', isCurrent);
    if (isCurrent) card.setAttribute('data-active', 'true');

    const priceEl = card.querySelector('[data-price]');
    if (priceEl) {
      const price = formatPrice(offer, getLang());
      priceEl.textContent = price ? `${price} ${t(`subscription.price.per_${state.billing}`)}` : '';
    }

    const actionEl = card.querySelector('[data-action]');
    if (!actionEl) return;
    const action = cardAction({
      plan,
      billing: state.billing,
      offers: state.offers,
      loggedIn,
      currentPlan: state.plan,
      subscription: state.subscription,
    });
    actionEl.innerHTML = actionButton(action, plan);
    card.toggleAttribute('data-selected', selected === plan && action !== 'none');
  });
}

function actionButton(action, plan) {
  if (action === 'login') {
    const next = encodeURIComponent(`/subscription.html?plan=${plan}&billing=${state.billing}`);
    return `<a class="btn btn-primary btn-sm" href="/login.html?next=${next}">${escapeHtml(t('subscription.login_to_upgrade'))}</a>`;
  }
  if (action === 'checkout') {
    return `<button type="button" class="btn btn-primary btn-sm" data-buy="${plan}">${escapeHtml(t('dashboard.plan.upgrade'))}</button>`;
  }
  if (action === 'change') {
    const label = plan === state.subscription.plan
      ? t(`subscription.switch_to_${state.billing}`)
      : t('dashboard.plan.upgrade');
    return `<button type="button" class="btn btn-primary btn-sm" data-change="${plan}">${escapeHtml(label)}</button>`;
  }
  return '';
}

function render() {
  $('backToDashboard').classList.toggle('hidden', !loggedIn);
  $('paymentsDisabled').classList.toggle('hidden', state.enabled);
  renderStatus();
  renderToggle();
  renderCards();
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function withBusyButton(btn, work) {
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = t('subscription.loading');
  try {
    await work();
  } catch (err) {
    if (err.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    showToast(err.message, { icon: '⚠️' });
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

const checkoutRequest = (plan) => apiFetch('/payments/checkout', {
  method: 'POST',
  body: JSON.stringify({ plan, billing: state.billing }),
});

// New subscription: off to the hosted checkout.
function buy(btn) {
  return withBusyButton(btn, async () => {
    const result = await checkoutRequest(btn.dataset.buy);
    if (result.url) window.location.href = result.url;
    else await applyChange(result);
  });
}

// Existing subscription: changed in place, the difference is charged pro rata.
async function change(btn) {
  if (!(await confirmDialog(t('subscription.change_confirm'), {
    confirmLabel: t('subscription.change_confirm_ok'),
    danger: false,
  }))) return;
  await withBusyButton(btn, async () => applyChange(await checkoutRequest(btn.dataset.change)));
}

async function applyChange(result) {
  if (result.token) localStorage.setItem('token', result.token);
  await load();
  render();
  showToast(t('subscription.changed'), { icon: '✓' });
}

async function openPortal() {
  await withBusyButton($('managePlanBtn'), async () => {
    const { url } = await apiFetch('/payments/portal', { method: 'POST' });
    window.location.href = url;
  });
}

$('billingToggle').addEventListener('click', (e) => {
  const btn = e.target.closest('.billing-toggle-btn');
  if (!btn || !hasOffers(btn.dataset.billing)) return;
  state.billing = btn.dataset.billing;
  renderToggle();
  renderCards();
});

$('planCards').addEventListener('click', (e) => {
  const buyBtn = e.target.closest('[data-buy]');
  if (buyBtn) return buy(buyBtn);
  const changeBtn = e.target.closest('[data-change]');
  if (changeBtn) return change(changeBtn);
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

  await load();
  render();
  setTimeout(() => {
    overlay.classList.add('hidden');
    main.classList.remove('hidden');
    document.querySelector('site-nav')?._render?.(); // the navbar shows the new session
  }, SUCCESS_VISIBLE_MS);
}

// ── Start ─────────────────────────────────────────────────────────────────────

if (loggedIn && urlParams.has('checkout_id')) {
  handleCheckoutReturn();
} else {
  load().then(render);
}
