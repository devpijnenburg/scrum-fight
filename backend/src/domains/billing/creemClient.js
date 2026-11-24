// Creem (https://creem.io) — the payment provider behind the paid plans.
//
// Everything that knows about Creem's API lives here: configuration, the
// HTTP calls and the two signature checks. See docs.creem.io.

const crypto = require('crypto');

const PAID_PLANS = ['pro', 'premium'];
const BILLING_PERIODS = ['monthly', 'yearly'];
const REQUEST_TIMEOUT_MS = 10_000;

const env = () => process.env;

const isTestKey = () => String(env().CREEM_API_KEY || '').startsWith('creem_test_');

// PAYMENTS_MODE pins which kind of key an environment may use: `test`
// accepts only sandbox keys (creem_test_…), `live` only live keys. So the
// test environment can never charge real money, and production can never
// hand out paid plans for sandbox payments. Unset = no check (local runs).
function keyMismatch() {
  const mode = env().PAYMENTS_MODE;
  if (!env().CREEM_API_KEY || !mode) return null;
  if (mode === 'test' && !isTestKey()) return 'PAYMENTS_MODE=test but CREEM_API_KEY is a live key';
  if (mode === 'live' && isTestKey()) return 'PAYMENTS_MODE=live but CREEM_API_KEY is a test key';
  return null;
}

// Creem can be used: API key and webhook secret are set and the key fits
// this environment. Enough to process webhooks and to let existing
// subscribers manage their subscription.
function isConfigured() {
  return Boolean(env().CREEM_API_KEY && env().CREEM_WEBHOOK_SECRET) && !keyMismatch();
}

// The feature toggle: new subscriptions and plan changes are only sold
// when PAYMENTS_ENABLED=true. Off by default.
function isSellingEnabled() {
  return isConfigured() && String(env().PAYMENTS_ENABLED).toLowerCase() === 'true';
}

// One line for the startup log, so the state of an environment is visible.
function describeState() {
  const mismatch = keyMismatch();
  if (mismatch) return `uit — verkeerde sleutel voor deze omgeving (${mismatch})`;
  if (!isConfigured()) return 'uit — Creem is niet geconfigureerd';
  const kind = isTestKey() ? 'testsleutel (sandbox)' : 'live-sleutel';
  return isSellingEnabled()
    ? `aan — ${kind}`
    : `verkoop uit (PAYMENTS_ENABLED) — ${kind}; webhooks en beheer blijven werken`;
}

// Test keys (creem_test_…) talk to the sandbox API, live keys to the real
// one. CREEM_API_URL overrides the choice.
function apiBaseUrl() {
  if (env().CREEM_API_URL) return env().CREEM_API_URL.replace(/\/$/, '');
  return isTestKey() ? 'https://test-api.creem.io' : 'https://api.creem.io';
}

// ── Products ────────────────────────────────────────────────────────────────
// One Creem product per plan and billing period.

function productIdFor(plan, billing) {
  if (!PAID_PLANS.includes(plan) || !BILLING_PERIODS.includes(billing)) return null;
  return env()[`CREEM_${plan.toUpperCase()}_${billing.toUpperCase()}_PRODUCT_ID`] || null;
}

// → { plan, billing } for one of our products, null for anything else.
function offerForProduct(productId) {
  if (!productId) return null;
  for (const plan of PAID_PLANS) {
    for (const billing of BILLING_PERIODS) {
      if (productIdFor(plan, billing) === productId) return { plan, billing };
    }
  }
  return null;
}

// ── HTTP ────────────────────────────────────────────────────────────────────

class CreemError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'CreemError';
    this.status = status;
  }
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`${apiBaseUrl()}/v1${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-api-key': env().CREEM_API_KEY },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new CreemError(`Creem ${method} ${path} failed: ${err.message}`);
  }
  const text = await res.text();
  if (!res.ok) {
    throw new CreemError(`Creem ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`, res.status);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new CreemError(`Creem ${method} ${path} returned invalid JSON`, res.status);
  }
}

// Starts a hosted checkout; returns the URL to send the customer to.
// request_id comes back signed in the redirect, metadata in the webhooks.
async function createCheckout({ productId, userId, email, successUrl, metadata }) {
  const result = await request('POST', '/checkouts', {
    product_id: productId,
    request_id: userId,
    success_url: successUrl,
    metadata: { ...metadata, userId },
    ...(email ? { customer: { email } } : {}),
  });
  if (!result.checkout_url) throw new CreemError('Creem returned no checkout_url');
  return result.checkout_url;
}

// Moves an existing subscription to another product; the difference is
// charged pro rata right away. Returns the updated subscription.
function upgradeSubscription(subscriptionId, productId) {
  return request('POST', `/subscriptions/${encodeURIComponent(subscriptionId)}/upgrade`, {
    product_id: productId,
    update_behavior: 'proration-charge-immediately',
  });
}

// Link to Creem's customer portal (cancel, payment method, receipts).
async function createPortalLink(customerId) {
  const result = await request('POST', '/customers/billing', { customer_id: customerId });
  if (!result.customer_portal_link) throw new CreemError('Creem returned no customer_portal_link');
  return result.customer_portal_link;
}

// The checkout session behind a redirect: status, request_id, product,
// customer and subscription.
function getCheckout(checkoutId) {
  return request('GET', `/checkouts?checkout_id=${encodeURIComponent(checkoutId)}`);
}

function getProduct(productId) {
  return request('GET', `/products/${encodeURIComponent(productId)}`);
}

// ── Signatures ──────────────────────────────────────────────────────────────

function safeEqualHex(a, b) {
  const left = Buffer.from(String(a), 'utf8');
  const right = Buffer.from(String(b), 'utf8');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

// Webhooks: header `creem-signature` = HMAC-SHA256(raw body, webhook secret), hex.
function verifyWebhookSignature(rawBody, signature) {
  const secret = env().CREEM_WEBHOOK_SECRET;
  if (!secret || !signature || !rawBody) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature);
}

// Redirect back from the checkout: `signature` = SHA-256 over the other
// query parameters in URL order (empty ones skipped), joined with "|" and
// closed with salt=<API key>. Returns the parameters when genuine, else null.
function verifyRedirectSignature(queryString) {
  const apiKey = env().CREEM_API_KEY;
  if (!apiKey || typeof queryString !== 'string') return null;

  const params = {};
  const parts = [];
  let signature = '';
  for (const [key, value] of new URLSearchParams(queryString)) {
    if (key === 'signature') { signature = value; continue; }
    if (value === '' || value === 'null') continue;
    params[key] = value;
    parts.push(`${key}=${value}`);
  }
  if (!signature) return null;

  parts.push(`salt=${apiKey}`);
  const expected = crypto.createHash('sha256').update(parts.join('|')).digest('hex');
  return safeEqualHex(expected, signature) ? params : null;
}

module.exports = {
  PAID_PLANS,
  BILLING_PERIODS,
  CreemError,
  isConfigured,
  isSellingEnabled,
  describeState,
  apiBaseUrl,
  productIdFor,
  offerForProduct,
  createCheckout,
  upgradeSubscription,
  createPortalLink,
  getCheckout,
  getProduct,
  verifyWebhookSignature,
  verifyRedirectSignature,
};
