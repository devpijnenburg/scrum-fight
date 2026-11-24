// <sf-plan-cards> — the three plans with price, billing period and the
// button to buy or change a subscription. Used on the dashboard and on the
// subscription page, so both always show the same offers.
//
//   <sf-plan-cards></sf-plan-cards>
//   <sf-plan-cards selected="pro" billing="monthly"></sf-plan-cards>
//
// The element loads its own data. Events (both bubble):
//   plans:loaded   detail = { enabled, offers, plan, subscription, billing }
//                  after every (re)load
//   plans:changed  detail = same, after an existing subscription was changed
//
// A new subscription leaves for the hosted checkout of the payment
// provider; the customer comes back on /subscription.html.

import { t, getLang, applyTranslations } from '../core/i18n.js';
import { apiFetch } from '../core/api.js';
import { getCurrentUser } from '../core/auth.js';
import { escapeHtml } from '../core/html.js';
import { BILLING_PERIODS, formatPrice, yearlySavingPercent, cardAction, planShieldUrl } from '../core/plans.js';
import { confirmDialog } from './modal.js';
import { showToast } from './toast.js';

// What each plan offers; the texts are existing i18n keys.
const PLANS = [
  { key: 'free', name: 'Free', features: ['rooms_3', 'players_7', 'days_30'] },
  { key: 'pro', name: 'Pro', features: ['rooms_20', 'players_15', 'days_30'] },
  { key: 'premium', name: 'Premium', features: ['rooms_unlimited', 'players_unlimited', 'never_deleted'], premium: true },
];

export class SfPlanCards extends HTMLElement {
  static observedAttributes = ['billing', 'selected'];

  // The page may set these after the element was created.
  attributeChangedCallback(name, _old, value) {
    if (!this._ready) return;
    if (name === 'billing' && BILLING_PERIODS.includes(value)) this.state.billing = value;
    this._render();
  }

  connectedCallback() {
    if (this._ready) return;
    this._ready = true;
    this.state = {
      billing: this.getAttribute('billing') === 'monthly' ? 'monthly' : 'yearly',
      offers: {},
      enabled: false,
      plan: getCurrentUser()?.plan || 'free',
      subscription: null,
    };
    this._renderShell();
    this.addEventListener('click', (e) => this._onClick(e));
    this.loaded = this.load();
  }

  get loggedIn() {
    return !!getCurrentUser();
  }

  // Overridable, so a test can see where the customer is sent.
  redirect(url) {
    window.location.href = url;
  }

  // ── Data ────────────────────────────────────────────────────────────────────

  async load() {
    const state = this.state;
    const [offers, mine] = await Promise.all([
      apiFetch('/payments/offers').catch(() => ({ enabled: false, offers: {} })),
      this.loggedIn ? apiFetch('/payments/subscription').catch(() => null) : null,
    ]);
    state.enabled = Boolean(offers.enabled);
    state.offers = offers.offers || {};
    if (mine) {
      state.plan = mine.plan;
      state.subscription = mine.subscription;
      // The token carries a copy of the plan; replace it when it is out of date.
      if (getCurrentUser()?.plan !== mine.plan) await this._refreshSession();
    }
    // Start on the period the subscriber already pays in.
    if (state.subscription?.billing && !this.hasAttribute('billing')) state.billing = state.subscription.billing;
    // A period without any offer is not worth showing.
    if (!this._hasOffers(state.billing)) state.billing = BILLING_PERIODS.find((b) => this._hasOffers(b)) || state.billing;

    this._render();
    this._emit('plans:loaded');
  }

  async _refreshSession() {
    try {
      const { token } = await apiFetch('/auth/refresh', { method: 'POST' });
      localStorage.setItem('token', token);
    } catch {
      // The old token keeps working; only the plan shown elsewhere lags behind.
    }
  }

  _hasOffers(billing) {
    return Object.values(this.state.offers).some((plan) => plan[billing]);
  }

  _emit(name) {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, detail: { ...this.state } }));
  }

  // ── Rendering ───────────────────────────────────────────────────────────────

  _renderShell() {
    this.innerHTML = `
      <div class="billing-toggle hidden" role="group">
        <button type="button" class="billing-toggle-btn" data-billing="monthly" data-i18n="subscription.billing.monthly">Maandelijks</button>
        <button type="button" class="billing-toggle-btn" data-billing="yearly">
          <span data-i18n="subscription.billing.yearly">Jaarlijks</span>
          <span class="billing-save-badge hidden"></span>
        </button>
      </div>
      <div class="plan-cards">
        ${PLANS.map((plan) => `
        <div class="plan-card${plan.premium ? ' plan-card-premium' : ''}" data-plan="${plan.key}">
          <img class="plan-emblem" src="${planShieldUrl(plan.key)}" alt="" width="96" height="96" />
          ${plan.premium ? '<div class="plan-badge">⭐ Premium</div>' : ''}
          <div class="plan-name">${plan.name}</div>
          <div class="plan-price" ${plan.key === 'free' ? 'data-i18n="subscription.price.free"' : 'data-price'}></div>
          <ul class="plan-features">
            ${plan.features.map((f) => `<li data-i18n="dashboard.plan.${f}"></li>`).join('')}
          </ul>
          ${plan.key === 'free' ? '' : '<div class="plan-action" data-action></div>'}
        </div>`).join('')}
      </div>`;
    applyTranslations();
    this._render();
  }

  _render() {
    const { state } = this;

    const toggle = this.querySelector('.billing-toggle');
    toggle.classList.toggle('hidden', !BILLING_PERIODS.every((b) => this._hasOffers(b)));
    toggle.setAttribute('aria-label', t('subscription.billing.label'));
    toggle.querySelectorAll('.billing-toggle-btn').forEach((btn) => {
      const active = btn.dataset.billing === state.billing;
      btn.classList.toggle('billing-toggle-btn--active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    const saving = yearlySavingPercent(state.offers);
    const badge = this.querySelector('.billing-save-badge');
    badge.textContent = t('subscription.billing.save', { percent: saving });
    badge.classList.toggle('hidden', saving <= 0);

    const selected = this.getAttribute('selected');
    this.querySelectorAll('.plan-card').forEach((card) => {
      const plan = card.dataset.plan;
      const offer = state.offers[plan]?.[state.billing];

      if (this.loggedIn && plan === state.plan) card.setAttribute('data-active', 'true');
      else card.removeAttribute('data-active');

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
        loggedIn: this.loggedIn,
        currentPlan: state.plan,
        subscription: state.subscription,
      });
      actionEl.innerHTML = this._actionButton(action, plan);
      card.toggleAttribute('data-selected', selected === plan && action !== 'none');
    });
  }

  _actionButton(action, plan) {
    const { state } = this;
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

  // ── Actions ─────────────────────────────────────────────────────────────────

  _onClick(e) {
    const periodBtn = e.target.closest('.billing-toggle-btn');
    if (periodBtn) {
      if (!this._hasOffers(periodBtn.dataset.billing)) return;
      this.state.billing = periodBtn.dataset.billing;
      this._render();
      return;
    }
    const buyBtn = e.target.closest('[data-buy]');
    if (buyBtn) return this._buy(buyBtn);
    const changeBtn = e.target.closest('[data-change]');
    if (changeBtn) return this._change(changeBtn);
  }

  async _withBusyButton(btn, work) {
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = t('subscription.loading');
    try {
      await work();
    } catch (err) {
      if (err.status === 401) {
        this.redirect('/login.html');
        return;
      }
      showToast(err.message, { icon: '⚠️' });
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  _checkoutRequest(plan) {
    return apiFetch('/payments/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan, billing: this.state.billing }),
    });
  }

  // New subscription: straight to the hosted checkout.
  _buy(btn) {
    return this._withBusyButton(btn, async () => {
      const result = await this._checkoutRequest(btn.dataset.buy);
      if (result.url) this.redirect(result.url);
      else await this._applyChange(result);
    });
  }

  // Existing subscription: changed in place, the difference is charged pro rata.
  async _change(btn) {
    if (!(await confirmDialog(t('subscription.change_confirm'), {
      confirmLabel: t('subscription.change_confirm_ok'),
      danger: false,
    }))) return;
    await this._withBusyButton(btn, async () => this._applyChange(await this._checkoutRequest(btn.dataset.change)));
  }

  async _applyChange(result) {
    if (result.token) localStorage.setItem('token', result.token);
    await this.load();
    this._emit('plans:changed');
    showToast(t('subscription.changed'), { icon: '✓' });
  }
}

if (!customElements.get('sf-plan-cards')) customElements.define('sf-plan-cards', SfPlanCards);
