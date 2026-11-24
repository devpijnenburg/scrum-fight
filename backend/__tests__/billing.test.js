// Payments: Creem signatures, webhook processing, checkout and the return
// from the checkout. The database is replaced by a small in-memory fake
// that understands the handful of statements the billing domain runs.

jest.mock('../src/shared/database', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../src/shared/transaction', () => ({
  withTransaction: (fn) => fn(require('../src/shared/database')),
}));

const crypto = require('crypto');
const request = require('supertest');
const db = require('../src/shared/database');
const { sign } = require('../src/domains/identity/jwt');
const creem = require('../src/domains/billing/creemClient');
const billing = require('../src/domains/billing/billingService');
const billingRoutes = require('../src/domains/billing/routes');
const events = require('../src/shared/events');
const { createApp } = require('../src/app');

const app = createApp();

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const ENV = {
  CREEM_API_KEY: 'creem_test_key',
  CREEM_WEBHOOK_SECRET: 'whsec_test',
  CREEM_PRO_MONTHLY_PRODUCT_ID: 'prod_pro_m',
  CREEM_PRO_YEARLY_PRODUCT_ID: 'prod_pro_y',
  CREEM_PREMIUM_MONTHLY_PRODUCT_ID: 'prod_prem_m',
  CREEM_PREMIUM_YEARLY_PRODUCT_ID: 'prod_prem_y',
  BASE_URL: 'https://scrumfight.test',
  PAYMENTS_ENABLED: 'true',
  PAYMENTS_MODE: 'test',
};

// ── In-memory database ──────────────────────────────────────────────────────

let state;
const ENTITLED = ['active', 'trialing', 'scheduled_cancel', 'past_due'];
const RANK = { free: 0, pro: 1, premium: 2 };

function fakeQuery(sql, params = []) {
  const one = (row) => ({ rows: row ? [row] : [], rowCount: row ? 1 : 0 });

  if (/FROM users WHERE id = \$1/.test(sql)) return one(state.users.get(params[0]));
  if (/INSERT INTO payment_events/.test(sql)) {
    if (state.events.has(params[0])) return { rows: [], rowCount: 0 };
    state.events.add(params[0]);
    return { rows: [], rowCount: 1 };
  }
  if (/FROM subscriptions WHERE provider_subscription_id = \$1/.test(sql)) {
    return one(state.subs.get(params[0]));
  }
  if (/INSERT INTO subscriptions/.test(sql)) {
    const fromEvent = /DO UPDATE/.test(sql);
    const [userId, id, customerId, plan, billingPeriod, status, periodEnd, eventAt] = params;
    if (!state.users.has(userId)) throw Object.assign(new Error('fk'), { code: '23503' });
    const existing = state.subs.get(id);
    if (existing && !fromEvent) return { rows: [], rowCount: 0 };
    if (existing && existing.last_event_at && eventAt < existing.last_event_at) return { rows: [], rowCount: 0 };
    state.subs.set(id, {
      user_id: existing?.user_id ?? userId,
      provider_subscription_id: id,
      provider_customer_id: customerId ?? existing?.provider_customer_id ?? null,
      plan,
      billing_period: billingPeriod,
      status: fromEvent ? status : 'active',
      current_period_end: periodEnd ?? existing?.current_period_end ?? null,
      last_event_at: fromEvent ? eventAt : null,
    });
    return { rows: [], rowCount: 1 };
  }
  if (/FROM subscriptions\s+WHERE user_id = \$1 AND status = ANY/.test(sql)) {
    const mine = [...state.subs.values()]
      .filter((s) => s.user_id === params[0] && ENTITLED.includes(s.status))
      .sort((a, b) => RANK[b.plan] - RANK[a.plan]);
    return one(mine[0]);
  }
  if (/SELECT provider_customer_id FROM subscriptions/.test(sql)) {
    return one([...state.subs.values()].find((s) => s.user_id === params[0] && s.provider_customer_id));
  }
  if (/UPDATE users SET plan/.test(sql)) {
    const user = state.users.get(params[0]);
    if (!user || user.plan === params[1] || !(user.plan in RANK)) return { rows: [], rowCount: 0 };
    user.plan = params[1];
    return { rows: [], rowCount: 1 };
  }
  throw new Error(`Unexpected SQL in test: ${sql}`);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const auth = (userId = ALICE) => `Bearer ${sign({ id: userId })}`;
const planOf = (userId = ALICE) => state.users.get(userId).plan;

let eventSeq = 0;
function webhook(eventType, object, { id = `evt_${++eventSeq}`, at = Date.now() + eventSeq, secret = ENV.CREEM_WEBHOOK_SECRET } = {}) {
  const body = JSON.stringify({ id, eventType, created_at: at, object });
  const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return request(app)
    .post('/api/payments/webhook')
    .set('Content-Type', 'application/json')
    .set('creem-signature', signature)
    .send(body);
}

const subscriptionObject = (overrides = {}) => ({
  id: 'sub_1',
  object: 'subscription',
  product: { id: 'prod_pro_m' },
  customer: { id: 'cust_1' },
  status: 'active',
  current_period_end_date: '2027-01-01T00:00:00.000Z',
  metadata: { userId: ALICE },
  ...overrides,
});

const checkoutCompleted = (overrides = {}) => ({
  id: 'ch_1',
  object: 'checkout',
  request_id: ALICE,
  product: { id: 'prod_pro_m' },
  customer: { id: 'cust_1' },
  subscription: { id: 'sub_1', product: 'prod_pro_m', customer: 'cust_1', status: 'active' },
  metadata: { userId: ALICE, plan: 'pro', billing: 'monthly' },
  ...overrides,
});

function redirectQuery(params, apiKey = ENV.CREEM_API_KEY) {
  const parts = Object.entries(params).map(([k, v]) => `${k}=${v}`);
  const signature = crypto.createHash('sha256').update([...parts, `salt=${apiKey}`].join('|')).digest('hex');
  return new URLSearchParams({ ...params, signature }).toString();
}

function mockCreem(responder) {
  global.fetch = jest.fn(async (url, options) => {
    const { status = 200, body } = responder(String(url), options) || { status: 404, body: {} };
    return { ok: status < 400, status, text: async () => JSON.stringify(body) };
  });
}

const savedEnv = {};
const realFetch = global.fetch;
let planChanges;

beforeEach(() => {
  for (const [key, value] of Object.entries(ENV)) {
    savedEnv[key] = process.env[key];
    process.env[key] = value;
  }
  state = {
    users: new Map([
      [ALICE, { id: ALICE, name: 'Alice', email: 'alice@test.com', plan: 'free', is_admin: false, totp_enabled: false }],
      [BOB, { id: BOB, name: 'Bob', email: 'bob@test.com', plan: 'free', is_admin: false, totp_enabled: false }],
    ]),
    subs: new Map(),
    events: new Set(),
  };
  db.query.mockImplementation(async (sql, params) => fakeQuery(sql, params));
  planChanges = [];
  events.removeAllListeners();
  events.on(events.PLAN_CHANGED, (change) => planChanges.push(change));
  billing.resetPriceCache();
  Object.values(billingRoutes.limiters).forEach((limiter) => limiter.reset());
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  for (const key of Object.keys(ENV)) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  global.fetch = realFetch;
  events.removeAllListeners();
  jest.restoreAllMocks();
});

// ── Creem client ────────────────────────────────────────────────────────────

describe('creemClient', () => {
  it('maps products to plan and billing period and back', () => {
    expect(creem.productIdFor('premium', 'yearly')).toBe('prod_prem_y');
    expect(creem.productIdFor('free', 'yearly')).toBeNull();
    expect(creem.offerForProduct('prod_pro_m')).toEqual({ plan: 'pro', billing: 'monthly' });
    expect(creem.offerForProduct('prod_other')).toBeNull();
    expect(creem.offerForProduct(undefined)).toBeNull();
  });

  it('uses the sandbox API for test keys and the live API otherwise', () => {
    expect(creem.apiBaseUrl()).toBe('https://test-api.creem.io');
    process.env.CREEM_API_KEY = 'creem_live_key';
    expect(creem.apiBaseUrl()).toBe('https://api.creem.io');
  });

  it('accepts only a webhook signature made with the secret over the exact body', () => {
    const body = Buffer.from('{"a":1}');
    const good = crypto.createHmac('sha256', ENV.CREEM_WEBHOOK_SECRET).update(body).digest('hex');
    expect(creem.verifyWebhookSignature(body, good)).toBe(true);
    expect(creem.verifyWebhookSignature(Buffer.from('{"a":2}'), good)).toBe(false);
    expect(creem.verifyWebhookSignature(body, 'nope')).toBe(false);
    expect(creem.verifyWebhookSignature(body, undefined)).toBe(false);
  });

  it('verifies a checkout redirect and rejects a tampered one', () => {
    const query = redirectQuery({ request_id: ALICE, checkout_id: 'ch_1', subscription_id: 'sub_1', product_id: 'prod_pro_m' });
    expect(creem.verifyRedirectSignature(query)).toMatchObject({ request_id: ALICE, subscription_id: 'sub_1' });
    expect(creem.verifyRedirectSignature(query.replace('prod_pro_m', 'prod_prem_y'))).toBeNull();
    expect(creem.verifyRedirectSignature('checkout_id=ch_1')).toBeNull();
  });

  it('leaves empty redirect parameters out of the signed string', () => {
    const signed = redirectQuery({ checkout_id: 'ch_1', product_id: 'prod_pro_m' });
    expect(creem.verifyRedirectSignature(`order_id=&${signed}`)).toMatchObject({ checkout_id: 'ch_1' });
  });
});

// ── Webhook ─────────────────────────────────────────────────────────────────

describe('POST /api/payments/webhook', () => {
  it('rejects a wrong signature and changes nothing', async () => {
    const res = await webhook('checkout.completed', checkoutCompleted(), { secret: 'wrong' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('WEBHOOK_SIGNATURE_INVALID');
    expect(planOf()).toBe('free');
  });

  it('answers 503 when payments are not configured', async () => {
    delete process.env.CREEM_WEBHOOK_SECRET;
    const res = await webhook('checkout.completed', checkoutCompleted());
    expect(res.status).toBe(503);
  });

  it('activates the plan on checkout.completed and announces it', async () => {
    const res = await webhook('checkout.completed', checkoutCompleted());
    expect(res.status).toBe(200);
    expect(planOf()).toBe('pro');
    expect(state.subs.get('sub_1')).toMatchObject({
      user_id: ALICE, plan: 'pro', billing_period: 'monthly', status: 'active', provider_customer_id: 'cust_1',
    });
    expect(planChanges).toEqual([{ userId: ALICE, plan: 'pro' }]);
  });

  it('processes a redelivered event only once', async () => {
    await webhook('checkout.completed', checkoutCompleted(), { id: 'evt_same' });
    state.users.get(ALICE).plan = 'free'; // would be set to pro again if reprocessed
    const res = await webhook('checkout.completed', checkoutCompleted(), { id: 'evt_same' });
    expect(res.status).toBe(200);
    expect(planOf()).toBe('free');
  });

  it('finds the user of a subscription event through the stored subscription', async () => {
    await webhook('checkout.completed', checkoutCompleted());
    await webhook('subscription.canceled', subscriptionObject({ metadata: undefined, status: 'canceled' }));
    expect(state.subs.get('sub_1').status).toBe('canceled');
    expect(planOf()).toBe('free');
    expect(planChanges.at(-1)).toEqual({ userId: ALICE, plan: 'free' });
  });

  it('keeps the plan until the period ends when a cancellation is scheduled', async () => {
    await webhook('subscription.paid', subscriptionObject());
    await webhook('subscription.scheduled_cancel', subscriptionObject({ status: 'scheduled_cancel' }));
    expect(state.subs.get('sub_1').status).toBe('scheduled_cancel');
    expect(planOf()).toBe('pro');
  });

  it('does not downgrade on subscription.expired (not final)', async () => {
    await webhook('subscription.paid', subscriptionObject());
    await webhook('subscription.expired', subscriptionObject());
    expect(planOf()).toBe('pro');
  });

  it('ignores an event older than the state already applied', async () => {
    const now = Date.now();
    await webhook('subscription.canceled', subscriptionObject(), { at: now });
    await webhook('subscription.active', subscriptionObject(), { at: now - 60_000 });
    expect(state.subs.get('sub_1').status).toBe('canceled');
    expect(planOf()).toBe('free');
  });

  it('keeps premium when an older pro subscription is cancelled', async () => {
    await webhook('subscription.paid', subscriptionObject());
    await webhook('subscription.paid', subscriptionObject({ id: 'sub_2', product: { id: 'prod_prem_y' } }));
    expect(planOf()).toBe('premium');
    await webhook('subscription.canceled', subscriptionObject());
    expect(planOf()).toBe('premium');
    await webhook('subscription.canceled', subscriptionObject({ id: 'sub_2', product: { id: 'prod_prem_y' } }));
    expect(planOf()).toBe('free');
  });

  it('follows a plan change reported by subscription.update', async () => {
    await webhook('subscription.paid', subscriptionObject());
    await webhook('subscription.update', subscriptionObject({ product: { id: 'prod_prem_m' } }));
    expect(planOf()).toBe('premium');
    expect(state.subs.get('sub_1')).toMatchObject({ plan: 'premium', billing_period: 'monthly' });
  });

  it('leaves an admin-assigned organisation plan alone', async () => {
    state.users.get(ALICE).plan = 'org_starter';
    await webhook('subscription.paid', subscriptionObject());
    expect(planOf()).toBe('org_starter');
  });

  it('acknowledges events it cannot place without touching anyone', async () => {
    const unknownProduct = await webhook('subscription.paid', subscriptionObject({ product: { id: 'prod_other' } }));
    const unknownUser = await webhook('subscription.paid', subscriptionObject({ metadata: { userId: 'not-a-uuid' } }));
    const deletedUser = await webhook('subscription.paid',
      subscriptionObject({ metadata: { userId: '33333333-3333-4333-8333-333333333333' } }));
    const otherEvent = await webhook('refund.created', { id: 'ref_1' });
    expect([unknownProduct.status, unknownUser.status, deletedUser.status, otherEvent.status]).toEqual([200, 200, 200, 200]);
    expect(state.subs.size).toBe(0);
    expect(planOf()).toBe('free');
  });

  it('rejects a signed body that is not a Creem event', async () => {
    const body = '{"hello":"world"}';
    const signature = crypto.createHmac('sha256', ENV.CREEM_WEBHOOK_SECRET).update(body).digest('hex');
    const res = await request(app).post('/api/payments/webhook')
      .set('Content-Type', 'application/json').set('creem-signature', signature).send(body);
    expect(res.status).toBe(400);
  });
});

// ── Feature toggle and key per environment ──────────────────────────────────

describe('PAYMENTS_ENABLED and PAYMENTS_MODE', () => {
  const checkout = () => request(app).post('/api/payments/checkout')
    .set('Authorization', auth()).send({ plan: 'pro', billing: 'monthly' });

  it.each([['false'], [undefined], ['']])('sells nothing when PAYMENTS_ENABLED is %p', async (value) => {
    if (value === undefined) delete process.env.PAYMENTS_ENABLED;
    else process.env.PAYMENTS_ENABLED = value;
    mockCreem(() => null);

    expect((await request(app).get('/api/payments/offers')).body).toEqual({ enabled: false, offers: {} });
    const res = await checkout();
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('PAYMENTS_DISABLED');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not change an existing subscription while selling is off', async () => {
    await webhook('subscription.paid', subscriptionObject());
    process.env.PAYMENTS_ENABLED = 'false';
    mockCreem(() => null);
    const res = await request(app).post('/api/payments/checkout')
      .set('Authorization', auth()).send({ plan: 'premium', billing: 'yearly' });
    expect(res.body.code).toBe('PAYMENTS_DISABLED');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('keeps webhooks and the customer portal working while selling is off', async () => {
    process.env.PAYMENTS_ENABLED = 'false';
    expect((await webhook('checkout.completed', checkoutCompleted())).status).toBe(200);
    expect(planOf()).toBe('pro');

    mockCreem(() => ({ body: { customer_portal_link: 'https://creem.test/portal/x' } }));
    const portal = await request(app).post('/api/payments/portal').set('Authorization', auth());
    expect(portal.body).toEqual({ url: 'https://creem.test/portal/x' });
  });

  it('refuses a live key in an environment that expects a test key', async () => {
    process.env.CREEM_API_KEY = 'creem_live_key';
    mockCreem(() => null);

    expect(creem.isConfigured()).toBe(false);
    expect((await request(app).get('/api/payments/offers')).body.enabled).toBe(false);
    expect((await checkout()).body.code).toBe('PAYMENTS_NOT_CONFIGURED');
    expect((await webhook('checkout.completed', checkoutCompleted())).status).toBe(503);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(creem.describeState()).toMatch(/verkeerde sleutel/);
  });

  it('refuses a test key in an environment that expects a live key', () => {
    process.env.PAYMENTS_MODE = 'live';
    expect(creem.isConfigured()).toBe(false);
    process.env.CREEM_API_KEY = 'creem_live_key';
    expect(creem.isSellingEnabled()).toBe(true);
  });

  it('accepts either kind of key when no mode is set', () => {
    delete process.env.PAYMENTS_MODE;
    expect(creem.isSellingEnabled()).toBe(true);
    process.env.CREEM_API_KEY = 'creem_live_key';
    expect(creem.isSellingEnabled()).toBe(true);
  });

  it('describes the state for the startup log', () => {
    expect(creem.describeState()).toBe('aan — testsleutel (sandbox)');
    process.env.PAYMENTS_ENABLED = 'false';
    expect(creem.describeState()).toMatch(/^verkoop uit/);
    delete process.env.CREEM_API_KEY;
    expect(creem.describeState()).toMatch(/niet geconfigureerd/);
  });

  it('reports no access problems for a key that can read everything', async () => {
    mockCreem((url) => (url.includes('/products/') ? { body: { id: 'p' } } : { status: 404, body: {} }));
    expect(await creem.checkAccess()).toEqual([]);
  });

  it('reports missing scopes and products from the other mode', async () => {
    mockCreem((url) => {
      if (url.includes('/checkouts')) return { status: 403, body: { message: ['API key does not have the required scopes'] } };
      if (url.endsWith('prod_prem_y')) return { status: 404, body: {} };
      if (url.includes('/products/')) return { body: { id: 'p' } };
      return { status: 404, body: {} };
    });
    const problems = await creem.checkAccess();
    expect(problems).toEqual([
      expect.stringMatching(/^checkouts lezen: geen toegang \(403\)/),
      'product premium/yearly: bestaat niet in Test Mode',
    ]);
  });
});

// ── Offers ──────────────────────────────────────────────────────────────────

describe('GET /api/payments/offers', () => {
  it('reports payments as disabled without configuration', async () => {
    delete process.env.CREEM_API_KEY;
    const res = await request(app).get('/api/payments/offers');
    expect(res.body).toEqual({ enabled: false, offers: {} });
  });

  it('lists the configured products with their Creem prices', async () => {
    delete process.env.CREEM_PREMIUM_MONTHLY_PRODUCT_ID;
    mockCreem((url) => ({ body: { price: url.endsWith('prod_pro_m') ? 400 : 4000, currency: 'EUR' } }));
    const res = await request(app).get('/api/payments/offers');
    expect(res.body.enabled).toBe(true);
    expect(res.body.offers.pro.monthly).toEqual({ amount: 400, currency: 'EUR' });
    expect(res.body.offers.premium).toEqual({ yearly: { amount: 4000, currency: 'EUR' } });
  });

  it('still lists the offers when Creem cannot be reached', async () => {
    mockCreem(() => ({ status: 500, body: {} }));
    const res = await request(app).get('/api/payments/offers');
    expect(res.body.enabled).toBe(true);
    expect(res.body.offers.pro.yearly).toEqual({});
  });
});

// ── Checkout ────────────────────────────────────────────────────────────────

describe('POST /api/payments/checkout', () => {
  const checkout = (body, userId) =>
    request(app).post('/api/payments/checkout').set('Authorization', auth(userId)).send(body);

  it('requires a session', async () => {
    const res = await request(app).post('/api/payments/checkout').send({ plan: 'pro' });
    expect(res.status).toBe(401);
  });

  it('validates plan and billing period', async () => {
    expect((await checkout({ plan: 'free' })).body.code).toBe('INVALID_PLAN');
    expect((await checkout({ plan: 'pro', billing: 'weekly' })).body.code).toBe('INVALID_BILLING_PERIOD');
  });

  it('answers 503 when payments are not configured', async () => {
    delete process.env.CREEM_API_KEY;
    const res = await checkout({ plan: 'pro', billing: 'monthly' });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('PAYMENTS_NOT_CONFIGURED');
  });

  it('creates a Creem checkout tied to the user', async () => {
    mockCreem(() => ({ body: { id: 'ch_1', checkout_url: 'https://creem.test/pay/ch_1' } }));
    const res = await checkout({ plan: 'premium', billing: 'yearly' });

    expect(res.body).toEqual({ url: 'https://creem.test/pay/ch_1' });
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://test-api.creem.io/v1/checkouts');
    expect(options.headers['x-api-key']).toBe(ENV.CREEM_API_KEY);
    expect(JSON.parse(options.body)).toEqual({
      product_id: 'prod_prem_y',
      request_id: ALICE,
      success_url: 'https://scrumfight.test/subscription.html',
      metadata: { plan: 'premium', billing: 'yearly', userId: ALICE },
      customer: { email: 'alice@test.com' },
    });
  });

  it('reports a provider failure with its own error code, without leaking details', async () => {
    mockCreem(() => ({ status: 401, body: { message: 'bad key creem_test_key' } }));
    const res = await checkout({ plan: 'pro', billing: 'monthly' });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('PAYMENT_PROVIDER_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('creem_test_key');
  });

  it('upgrades the existing subscription instead of starting a second one', async () => {
    await webhook('subscription.paid', subscriptionObject());
    mockCreem((url) => (url.endsWith('/subscriptions/sub_1/upgrade')
      ? { body: subscriptionObject({ product: { id: 'prod_prem_y' } }) }
      : null));

    const res = await checkout({ plan: 'premium', billing: 'yearly' });

    expect(res.body).toMatchObject({ changed: true, plan: 'premium' });
    expect(res.body.token).toEqual(expect.any(String));
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toMatchObject({ product_id: 'prod_prem_y' });
    expect(state.subs.size).toBe(1);
    expect(state.subs.get('sub_1')).toMatchObject({ plan: 'premium', billing_period: 'yearly' });
    expect(planOf()).toBe('premium');
  });

  it('refuses the plan the user already has and a downgrade', async () => {
    await webhook('subscription.paid', subscriptionObject({ product: { id: 'prod_prem_m' } }));
    mockCreem(() => null);
    expect((await checkout({ plan: 'premium', billing: 'monthly' })).body.code).toBe('ALREADY_SUBSCRIBED');
    expect((await checkout({ plan: 'pro', billing: 'monthly' })).body.code).toBe('PLAN_CHANGE_NOT_ALLOWED');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ── Return from the checkout ────────────────────────────────────────────────

describe('POST /api/payments/confirm', () => {
  const confirm = (query, userId) =>
    request(app).post('/api/payments/confirm').set('Authorization', auth(userId)).send({ query });
  const params = { request_id: ALICE, checkout_id: 'ch_1', customer_id: 'cust_1', subscription_id: 'sub_1', product_id: 'prod_prem_y' };

  it('activates the plan from a genuine redirect before the webhook arrives', async () => {
    const res = await confirm(redirectQuery(params));
    expect(res.body).toMatchObject({ status: 'active', plan: 'premium' });
    expect(res.body.token).toEqual(expect.any(String));
    expect(state.subs.get('sub_1')).toMatchObject({ user_id: ALICE, plan: 'premium', billing_period: 'yearly' });
    expect(planChanges).toEqual([{ userId: ALICE, plan: 'premium' }]);
  });

  const checkoutAtCreem = (overrides = {}) => ({
    id: 'ch_1',
    status: 'completed',
    request_id: ALICE,
    product: { id: 'prod_prem_y' },
    customer: { id: 'cust_1' },
    subscription: { id: 'sub_1' },
    ...overrides,
  });

  it('stays pending for a forged redirect', async () => {
    mockCreem(() => ({ status: 404, body: {} }));
    const res = await confirm(redirectQuery(params, 'not-the-api-key'));
    expect(res.body).toEqual({ status: 'pending' });
    expect(planOf()).toBe('free');
  });

  it('activates from the checkout at Creem when the redirect signature does not match', async () => {
    mockCreem((url) => (url.includes('/checkouts?checkout_id=ch_1') ? { body: checkoutAtCreem() } : null));
    const res = await confirm(redirectQuery(params, 'some-other-key'));
    expect(res.body).toMatchObject({ status: 'active', plan: 'premium' });
    expect(state.subs.get('sub_1')).toMatchObject({ user_id: ALICE, provider_customer_id: 'cust_1', billing_period: 'yearly' });
  });

  it.each([
    ['not completed', { status: 'pending' }],
    ['for another user', { request_id: BOB }],
    ['for another subscription', { subscription: { id: 'sub_other' } }],
    ['for an unknown product', { product: { id: 'prod_unknown' } }],
  ])('stays pending when the checkout at Creem is %s', async (_label, overrides) => {
    mockCreem(() => ({ body: checkoutAtCreem(overrides) }));
    const res = await confirm(redirectQuery(params, 'some-other-key'));
    expect(res.body).toEqual({ status: 'pending' });
    expect(state.subs.size).toBe(0);
  });

  it("does not give one user another user's payment", async () => {
    mockCreem(() => ({ body: checkoutAtCreem() }));
    const res = await confirm(redirectQuery(params), BOB);
    expect(res.body).toEqual({ status: 'pending' });
    expect(planOf(BOB)).toBe('free');
    expect(state.subs.size).toBe(0);
  });

  it('reports active once the webhook has been processed, even without a signature', async () => {
    expect((await confirm('subscription_id=sub_1')).body).toEqual({ status: 'pending' });
    await webhook('checkout.completed', checkoutCompleted());
    expect((await confirm('subscription_id=sub_1')).body).toMatchObject({ status: 'active', plan: 'pro' });
  });

  it('does not reactivate a cancelled subscription when the redirect is replayed', async () => {
    await confirm(redirectQuery(params));
    await webhook('subscription.canceled', subscriptionObject({ product: { id: 'prod_prem_y' } }));
    const res = await confirm(redirectQuery(params));
    expect(res.body).toEqual({ status: 'pending' });
    expect(planOf()).toBe('free');
  });
});

// ── Subscription status, portal and session refresh ─────────────────────────

describe('subscription status and portal', () => {
  it('returns the plan and the subscription behind it', async () => {
    const none = await request(app).get('/api/payments/subscription').set('Authorization', auth());
    expect(none.body).toEqual({ plan: 'free', subscription: null });

    await webhook('subscription.scheduled_cancel', subscriptionObject({ status: 'scheduled_cancel' }));
    const res = await request(app).get('/api/payments/subscription').set('Authorization', auth());
    expect(res.body).toEqual({
      plan: 'pro',
      subscription: {
        plan: 'pro', billing: 'monthly', status: 'scheduled_cancel',
        currentPeriodEnd: '2027-01-01T00:00:00.000Z', endsAtPeriodEnd: true,
      },
    });
  });

  it('opens the customer portal for a subscriber only', async () => {
    mockCreem(() => ({ body: { customer_portal_link: 'https://creem.test/portal/x' } }));
    const without = await request(app).post('/api/payments/portal').set('Authorization', auth());
    expect(without.status).toBe(404);
    expect(without.body.code).toBe('NO_SUBSCRIPTION');

    await webhook('checkout.completed', checkoutCompleted());
    const res = await request(app).post('/api/payments/portal').set('Authorization', auth());
    expect(res.body).toEqual({ url: 'https://creem.test/portal/x' });
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ customer_id: 'cust_1' });
  });

  it('issues a fresh session token with the current plan', async () => {
    state.users.get(ALICE).plan = 'premium';
    const res = await request(app).post('/api/auth/refresh').set('Authorization', auth());
    const payload = JSON.parse(Buffer.from(res.body.token.split('.')[1], 'base64').toString());
    expect(payload).toMatchObject({ id: ALICE, plan: 'premium' });
  });
});
