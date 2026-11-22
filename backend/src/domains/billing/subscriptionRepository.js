const db = require('../../shared/database');

// Persistence for paid subscriptions (tables `subscriptions` and
// `payment_events`). Functions used inside a transaction take the
// transaction's client as first argument.

// Statuses in which the customer keeps the paid plan. `scheduled_cancel`
// runs until the period ends; `past_due` is still being retried by Creem.
const ENTITLED_STATUSES = ['active', 'trialing', 'scheduled_cancel', 'past_due'];

const PLAN_RANK_SQL = `CASE plan WHEN 'premium' THEN 2 WHEN 'pro' THEN 1 ELSE 0 END`;

// Remembers a webhook event; false when it was already processed.
async function recordEvent(client, eventId, eventType) {
  const { rowCount } = await client.query(
    `INSERT INTO payment_events (event_id, event_type) VALUES ($1, $2)
     ON CONFLICT (event_id) DO NOTHING`,
    [eventId, eventType]
  );
  return rowCount === 1;
}

async function findByProviderId(client, providerSubscriptionId) {
  const { rows } = await client.query(
    'SELECT * FROM subscriptions WHERE provider_subscription_id = $1',
    [providerSubscriptionId]
  );
  return rows[0] || null;
}

// Creates or updates a subscription from a provider event. An event older
// than the newest one already applied changes nothing (returns false). A
// subscription never moves to another user.
async function upsertFromEvent(client, sub) {
  const { rowCount } = await client.query(
    `INSERT INTO subscriptions
       (user_id, provider_subscription_id, provider_customer_id, plan, billing_period,
        status, current_period_end, last_event_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (provider_subscription_id) DO UPDATE SET
       provider_customer_id = COALESCE(EXCLUDED.provider_customer_id, subscriptions.provider_customer_id),
       plan                 = EXCLUDED.plan,
       billing_period       = EXCLUDED.billing_period,
       status               = EXCLUDED.status,
       current_period_end   = COALESCE(EXCLUDED.current_period_end, subscriptions.current_period_end),
       last_event_at        = EXCLUDED.last_event_at,
       updated_at           = NOW()
     WHERE subscriptions.last_event_at IS NULL OR EXCLUDED.last_event_at >= subscriptions.last_event_at`,
    [sub.userId, sub.providerSubscriptionId, sub.providerCustomerId || null, sub.plan,
      sub.billingPeriod || null, sub.status, sub.currentPeriodEnd || null, sub.eventAt]
  );
  return rowCount === 1;
}

// Used when the customer returns from the checkout before the webhook
// arrived: creates the subscription, but never touches an existing one.
async function insertIfAbsent(client, sub) {
  const { rowCount } = await client.query(
    `INSERT INTO subscriptions
       (user_id, provider_subscription_id, provider_customer_id, plan, billing_period, status)
     VALUES ($1, $2, $3, $4, $5, 'active')
     ON CONFLICT (provider_subscription_id) DO NOTHING`,
    [sub.userId, sub.providerSubscriptionId, sub.providerCustomerId || null, sub.plan, sub.billingPeriod || null]
  );
  return rowCount === 1;
}

// The subscription that currently gives the user a paid plan (the highest
// plan when there is more than one), or null.
async function findCurrentForUser(client, userId) {
  const { rows } = await client.query(
    `SELECT * FROM subscriptions
     WHERE user_id = $1 AND status = ANY($2)
     ORDER BY ${PLAN_RANK_SQL} DESC, created_at DESC
     LIMIT 1`,
    [userId, ENTITLED_STATUSES]
  );
  return rows[0] || null;
}

// Newest subscription with a known provider customer, entitled or not —
// enough to open the customer portal (e.g. for receipts after cancelling).
async function findCustomerIdForUser(client, userId) {
  const { rows } = await client.query(
    `SELECT provider_customer_id FROM subscriptions
     WHERE user_id = $1 AND provider_customer_id IS NOT NULL
     ORDER BY updated_at DESC LIMIT 1`,
    [userId]
  );
  return rows[0]?.provider_customer_id ?? null;
}

// Sets users.plan; true when it changed. Only personal plans are managed
// by payments — an organisation plan set by an admin is left alone.
async function applyPlan(client, userId, plan) {
  const { rowCount } = await client.query(
    `UPDATE users SET plan = $2, updated_at = NOW()
     WHERE id = $1 AND plan <> $2 AND plan IN ('free', 'pro', 'premium')`,
    [userId, plan]
  );
  return rowCount === 1;
}

module.exports = {
  ENTITLED_STATUSES,
  recordEvent,
  findByProviderId,
  upsertFromEvent,
  insertIfAbsent,
  findCurrentForUser,
  findCustomerIdForUser,
  applyPlan,
};
