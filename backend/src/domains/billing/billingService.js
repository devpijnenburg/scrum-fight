// Paid plans: checkout, webhook processing and subscription status.
//
// users.plan is what the rest of the app reads. It is never set directly
// from a payment event; every change to a subscription row is followed by
// syncUserPlan(), which derives the plan from all of the user's
// subscriptions. So cancelling an old subscription cannot take away a plan
// that a newer one still pays for.

const creem = require('./creemClient');
const repo = require('./subscriptionRepository');
const db = require('../../shared/database');
const users = require('../identity/userRepository');
const { signSessionToken } = require('../identity/jwt');
const events = require('../../shared/events');
const { withTransaction } = require('../../shared/transaction');
const { AppError, badRequest, forbidden, notFound, conflict } = require('../../shared/errors');

const PLAN_RANK = { free: 0, pro: 1, premium: 2 };
const PRICE_TTL_MS = 60 * 60 * 1000;
const PRICE_RETRY_MS = 5 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Subscription status that follows from each webhook event type.
// `subscription.update` carries its own status; `subscription.expired` is
// not final (Creem may still retry the payment) and changes nothing.
const STATUS_BY_EVENT = {
  'checkout.completed': 'active',
  'subscription.active': 'active',
  'subscription.paid': 'active',
  'subscription.trialing': 'trialing',
  'subscription.scheduled_cancel': 'scheduled_cancel',
  'subscription.past_due': 'past_due',
  'subscription.unpaid': 'unpaid',
  'subscription.paused': 'paused',
  'subscription.canceled': 'canceled',
};
const KNOWN_STATUSES = new Set(Object.values(STATUS_BY_EVENT));

const notConfigured = () =>
  new AppError(503, 'PAYMENTS_NOT_CONFIGURED', 'Betalingen zijn momenteel niet beschikbaar');
const sellingDisabled = () =>
  new AppError(503, 'PAYMENTS_DISABLED', 'Abonnementen zijn op dit moment niet te koop');
// 503 and not 502: a reverse proxy or CDN in front of the app may replace
// the body of a 502 with its own error page, which hides this message.
const providerError = () =>
  new AppError(503, 'PAYMENT_PROVIDER_ERROR', 'De betaaldienst reageert niet, probeer het later opnieuw');

const baseUrl = () => (process.env.BASE_URL || 'http://localhost').replace(/\/$/, '');
const validDate = (value) => {
  const date = new Date(value ?? NaN);
  return Number.isNaN(date.getTime()) ? null : date;
};
const idOf = (ref) => (ref && typeof ref === 'object' ? ref.id : ref) || null;

// ── Plan synchronisation ────────────────────────────────────────────────────

// Sets users.plan to the highest plan the user's subscriptions pay for.
// Returns the plan when it changed, otherwise null.
async function syncUserPlan(client, userId) {
  const current = await repo.findCurrentForUser(client, userId);
  const plan = current?.plan ?? 'free';
  return (await repo.applyPlan(client, userId, plan)) ? plan : null;
}

function announce(userId, plan) {
  if (plan) events.emit(events.PLAN_CHANGED, { userId, plan });
}

// ── Offers & prices ─────────────────────────────────────────────────────────

let priceCache = { at: 0, ttl: 0, prices: {} };

// Prices come from Creem, so the page always shows what the checkout
// charges. Cached; when Creem cannot be reached the page shows no price.
async function loadPrices() {
  if (Date.now() - priceCache.at < priceCache.ttl) return priceCache.prices;

  const prices = {};
  let failed = false;
  await Promise.all(creem.PAID_PLANS.flatMap((plan) => creem.BILLING_PERIODS.map(async (billing) => {
    const productId = creem.productIdFor(plan, billing);
    if (!productId) return;
    try {
      const product = await creem.getProduct(productId);
      if (Number.isFinite(product.price) && product.currency) {
        prices[productId] = { amount: product.price, currency: product.currency };
      }
    } catch (err) {
      failed = true;
      console.warn(`[billing] Could not load price of ${plan}/${billing}:`, err.message);
    }
  })));

  priceCache = { at: Date.now(), ttl: failed ? PRICE_RETRY_MS : PRICE_TTL_MS, prices };
  return prices;
}

// What can be bought: { enabled, offers: { pro: { monthly: { amount, currency }, … }, … } }.
// An offer without a configured product is absent; amount is in cents.
async function getOffers() {
  if (!creem.isSellingEnabled()) return { enabled: false, offers: {} };

  const prices = await loadPrices();
  const offers = {};
  for (const plan of creem.PAID_PLANS) {
    for (const billing of creem.BILLING_PERIODS) {
      const productId = creem.productIdFor(plan, billing);
      if (productId) (offers[plan] ??= {})[billing] = prices[productId] || {};
    }
  }
  return { enabled: Object.keys(offers).length > 0, offers };
}

// ── Subscription status ─────────────────────────────────────────────────────

async function getSubscription(user) {
  const current = await repo.findCurrentForUser(db, user.id);
  return {
    plan: user.plan,
    subscription: current && {
      plan: current.plan,
      billing: current.billing_period,
      status: current.status,
      currentPeriodEnd: current.current_period_end,
      endsAtPeriodEnd: current.status === 'scheduled_cancel',
    },
  };
}

// ── Checkout & plan change ──────────────────────────────────────────────────

// Returns { url } to send the customer to the checkout, or — for someone
// who already has a subscription — changes that subscription in place and
// returns { changed: true, plan, token }. A second checkout would bill
// the customer twice.
async function startCheckout(user, { plan, billing = 'yearly' } = {}) {
  if (!creem.PAID_PLANS.includes(plan)) throw badRequest('INVALID_PLAN', 'Ongeldig plan');
  if (!creem.BILLING_PERIODS.includes(billing)) {
    throw badRequest('INVALID_BILLING_PERIOD', 'Ongeldige factureringsperiode');
  }
  if (!creem.isConfigured()) throw notConfigured();
  if (!creem.isSellingEnabled()) throw sellingDisabled();
  const productId = creem.productIdFor(plan, billing);
  if (!productId) throw badRequest('PLAN_NOT_AVAILABLE', 'Dit plan is nu niet te koop');

  const current = await repo.findCurrentForUser(db, user.id);
  if (current) return changeSubscription(user, current, { plan, billing, productId });

  const contact = await users.findContact(user.id);
  try {
    const url = await creem.createCheckout({
      productId,
      userId: user.id,
      email: contact?.email,
      successUrl: `${baseUrl()}/subscription.html`,
      metadata: { plan, billing },
    });
    return { url };
  } catch (err) {
    console.error('[billing] Checkout failed:', err.message);
    throw providerError();
  }
}

async function changeSubscription(user, current, { plan, billing, productId }) {
  if (current.plan === plan && current.billing_period === billing) {
    throw conflict('ALREADY_SUBSCRIBED', 'Je hebt dit abonnement al');
  }
  // Going to a lower plan is a cancellation question; that runs through the portal.
  if (PLAN_RANK[plan] < PLAN_RANK[current.plan]) {
    throw badRequest('PLAN_CHANGE_NOT_ALLOWED', 'Deze wijziging kan alleen via abonnementsbeheer');
  }

  let updated;
  try {
    updated = await creem.upgradeSubscription(current.provider_subscription_id, productId);
  } catch (err) {
    console.error('[billing] Plan change failed:', err.message);
    throw providerError();
  }

  const changedPlan = await withTransaction(async (client) => {
    await repo.upsertFromEvent(client, {
      userId: user.id,
      providerSubscriptionId: current.provider_subscription_id,
      providerCustomerId: idOf(updated.customer),
      plan,
      billingPeriod: billing,
      status: KNOWN_STATUSES.has(updated.status) ? updated.status : current.status,
      currentPeriodEnd: updated.current_period_end_date,
      // Creem confirmed this change just now, so it must win from whatever
      // was applied before, even when the clocks differ slightly.
      eventAt: new Date(Math.max(Date.now(), validDate(current.last_event_at)?.getTime() ?? 0)),
    });
    return syncUserPlan(client, user.id);
  });
  announce(user.id, changedPlan);

  return { changed: true, ...(await freshSession(user.id)) };
}

async function freshSession(userId) {
  const user = await users.findSessionUser(userId);
  return { plan: user.plan, token: signSessionToken(user) };
}

// Called (repeatedly) by the page the customer returns to after paying.
// The redirect is signed by Creem, so the plan can be activated right
// away instead of waiting for the webhook. Without a valid signature this
// only reports whether the webhook has been processed yet.
async function confirmReturn(user, queryString) {
  const query = typeof queryString === 'string' ? queryString.slice(0, 2000) : '';
  const subscriptionId = new URLSearchParams(query).get('subscription_id');
  if (!subscriptionId) return { status: 'pending' };

  const signed = creem.verifyRedirectSignature(query);
  const offer = signed && creem.offerForProduct(signed.product_id);
  if (offer && signed.request_id === user.id) {
    const changedPlan = await withTransaction(async (client) => {
      await repo.insertIfAbsent(client, {
        userId: user.id,
        providerSubscriptionId: subscriptionId,
        providerCustomerId: signed.customer_id,
        plan: offer.plan,
        billingPeriod: offer.billing,
      });
      return syncUserPlan(client, user.id);
    });
    announce(user.id, changedPlan);
  }

  const row = await repo.findByProviderId(db, subscriptionId);
  if (!row || row.user_id !== user.id || !repo.ENTITLED_STATUSES.includes(row.status)) {
    return { status: 'pending' };
  }
  return { status: 'active', ...(await freshSession(user.id)) };
}

// Link to Creem's customer portal: cancel, payment method, receipts.
async function createPortalLink(user) {
  if (!creem.isConfigured()) throw notConfigured();
  const customerId = await repo.findCustomerIdForUser(db, user.id);
  if (!customerId) throw notFound('NO_SUBSCRIPTION', 'Geen abonnement gevonden');
  try {
    return { url: await creem.createPortalLink(customerId) };
  } catch (err) {
    console.error('[billing] Portal link failed:', err.message);
    throw providerError();
  }
}

// ── Webhook ─────────────────────────────────────────────────────────────────

// Normalises the subscription carried by an event. In `checkout.completed`
// it is nested (and product/customer may be plain ids); in `subscription.*`
// it is the event object itself.
function subscriptionFromEvent(type, object) {
  if (type === 'checkout.completed') {
    const nested = object.subscription;
    if (!nested) return null; // a one-time purchase: not something we sell
    const sub = typeof nested === 'object' ? nested : { id: nested };
    return {
      id: sub.id,
      productId: idOf(object.product) ?? idOf(sub.product),
      customerId: idOf(object.customer) ?? idOf(sub.customer),
      status: STATUS_BY_EVENT[type],
      periodEnd: sub.current_period_end_date,
      userId: object.metadata?.userId ?? sub.metadata?.userId ?? object.request_id,
    };
  }
  if (!type.startsWith('subscription.')) return null;

  const status = STATUS_BY_EVENT[type] ?? (type === 'subscription.update' ? object.status : null);
  if (!KNOWN_STATUSES.has(status)) return null;
  return {
    id: object.id,
    productId: idOf(object.product),
    customerId: idOf(object.customer),
    status,
    periodEnd: object.current_period_end_date,
    userId: object.metadata?.userId,
  };
}

// Applies one event inside a transaction. Returns { userId, plan } when
// the user's plan changed.
async function applyEvent(client, type, object, eventAt) {
  const sub = subscriptionFromEvent(type, object);
  if (!sub?.id) return null;

  const existing = await repo.findByProviderId(client, sub.id);
  const offer = creem.offerForProduct(sub.productId);
  const userId = existing?.user_id ?? (UUID.test(sub.userId || '') ? sub.userId : null);
  const plan = offer?.plan ?? existing?.plan;

  if (!userId || !plan) {
    console.warn(`[billing] ${type} for subscription ${sub.id} ignored: unknown ${userId ? 'product' : 'user'}`);
    return null;
  }

  const applied = await repo.upsertFromEvent(client, {
    userId,
    providerSubscriptionId: sub.id,
    providerCustomerId: sub.customerId,
    plan,
    billingPeriod: offer?.billing ?? existing?.billing_period,
    status: sub.status,
    currentPeriodEnd: sub.periodEnd,
    eventAt,
  });
  if (!applied) return null; // older than what we already know

  const changedPlan = await syncUserPlan(client, userId);
  console.log(`[billing] ${type}: subscription ${sub.id} → ${sub.status} (${plan})`);
  return changedPlan ? { userId, plan: changedPlan } : null;
}

// Verifies and processes a webhook delivery. Safe to receive twice:
// each event id is handled once, and stale events are ignored.
async function handleWebhook(rawBody, signature) {
  if (!creem.isConfigured()) throw notConfigured();
  if (!creem.verifyWebhookSignature(rawBody, signature)) {
    throw forbidden('WEBHOOK_SIGNATURE_INVALID', 'Ongeldige handtekening');
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw badRequest('INVALID_JSON', 'Ongeldige JSON');
  }
  const { id, eventType: type, object } = event || {};
  if (typeof id !== 'string' || typeof type !== 'string' || !object || typeof object !== 'object') {
    throw badRequest('WEBHOOK_INVALID', 'Onvolledig webhook-bericht');
  }
  const eventAt = validDate(event.created_at) ?? new Date();

  const change = await withTransaction(async (client) => {
    if (!(await repo.recordEvent(client, id, type))) return null; // redelivery
    try {
      return await applyEvent(client, type, object, eventAt);
    } catch (err) {
      // A user that no longer exists must not make Creem retry for a day.
      if (err?.code === '23503') {
        console.warn(`[billing] ${type} (${id}) ignored: user no longer exists`);
        return null;
      }
      throw err;
    }
  });
  if (change) announce(change.userId, change.plan);
}

function resetPriceCache() {
  priceCache = { at: 0, ttl: 0, prices: {} };
}

module.exports = {
  getOffers,
  getSubscription,
  startCheckout,
  confirmReturn,
  createPortalLink,
  handleWebhook,
  resetPriceCache,
};
