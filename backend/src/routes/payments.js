const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { authMiddleware } = require('../auth/middleware');
const creemAdapter = require('../payment/creem');
const { notifyPlanUpdate } = require('../socket');
const { sign } = require('../auth/jwt');
const db = require('../config/database');

function isCreemConfigured() {
  return !!(process.env.CREEM_API_KEY && process.env.CREEM_WEBHOOK_SECRET);
}

// POST /api/payments/checkout
router.post('/checkout', authMiddleware, async (req, res) => {
  if (!isCreemConfigured()) {
    return res.status(503).json({ error: 'Betalingen zijn momenteel niet geconfigureerd' });
  }

  const { plan, billing = 'yearly' } = req.body;
  if (!['pro', 'premium'].includes(plan)) {
    return res.status(400).json({ error: 'Ongeldig plan. Kies pro of premium.' });
  }
  if (!['monthly', 'yearly'].includes(billing)) {
    return res.status(400).json({ error: 'Ongeldige factureringsperiode. Kies monthly of yearly.' });
  }

  const baseUrl = (process.env.BASE_URL || 'http://localhost').replace(/\/$/, '');

  try {
    const { url, checkoutId } = await creemAdapter.createCheckout(req.user.id, plan, billing, baseUrl);
    res.json({ url, checkoutId });
  } catch (err) {
    console.error('[payments] Checkout error:', err.message);
    res.status(500).json({ error: 'Kon geen betaalsessie aanmaken' });
  }
});

// POST /api/payments/verify
// Called by the subscription page while waiting for payment confirmation.
// Verifies the checkout status directly against Creem (outbound call — works
// even when inbound webhooks are blocked by firewall).
router.post('/verify', authMiddleware, async (req, res) => {
  if (!isCreemConfigured()) {
    return res.status(503).json({ error: 'Betalingen zijn momenteel niet geconfigureerd' });
  }

  // Fast path: DB already updated (e.g., webhook did arrive, or previous verify call succeeded)
  const dbPlan = await creemAdapter.getUserPlan(req.user.id);
  console.log(`[payments] Verify: user=${req.user.id} dbPlan=${dbPlan} checkoutId=${req.body?.checkoutId ?? null}`);
  if (dbPlan !== 'free') {
    const { rows } = await db.query(
      'SELECT id, name, plan, is_admin FROM users WHERE id = $1',
      [req.user.id]
    );
    const u = rows[0];
    const token = sign({ id: u.id, name: u.name, plan: u.plan, is_admin: u.is_admin });
    console.log(`[payments] Verify: plan al bijgewerkt → token teruggestuurd plan=${dbPlan}`);
    return res.json({ plan: dbPlan, token });
  }

  const { checkoutId } = req.body;
  if (!checkoutId) {
    return res.json({ pending: true, plan: 'free' });
  }

  try {
    const checkout = await creemAdapter.verifyCheckout(checkoutId);

    // Creem status can be 'completed', 'paid', or similar
    const status = (checkout.status ?? '').toLowerCase();
    const isPaid = status === 'completed' || status === 'paid' || status === 'active';

    if (!isPaid) {
      return res.json({ pending: true, plan: 'free', status });
    }

    // Derive plan from metadata (set at checkout creation) or product ID
    const plan =
      checkout.metadata?.plan ??
      creemAdapter.planForProductId(checkout.product?.id ?? checkout.productId ?? checkout.product_id);

    if (!plan || plan === 'free') {
      console.warn('[payments] Verify: betaald maar plan onbekend', JSON.stringify(checkout));
      return res.json({ pending: true, plan: 'free' });
    }

    // Safety: verify the checkout was created for this user
    const checkoutUserId = String(checkout.metadata?.userId ?? '');
    if (checkoutUserId && checkoutUserId !== String(req.user.id)) {
      console.warn(`[payments] Verify: userId mismatch checkout=${checkoutUserId} jwt=${req.user.id}`);
      return res.status(403).json({ error: 'Checkout behoort niet aan deze gebruiker' });
    }

    await creemAdapter.upgradePlan(req.user.id, plan);
    notifyPlanUpdate(req.user.id, plan);
    console.log(`[payments] Plan bijgewerkt via verify: user=${req.user.id} plan=${plan}`);

    const { rows } = await db.query(
      'SELECT id, name, plan, is_admin FROM users WHERE id = $1',
      [req.user.id]
    );
    const u = rows[0];
    const token = sign({ id: u.id, name: u.name, plan: u.plan, is_admin: u.is_admin });
    res.json({ plan, token });
  } catch (err) {
    console.error('[payments] Verify fout:', err.message);
    res.json({ pending: true, plan: 'free' });
  }
});

// POST /api/payments/webhook
// req.rawBody is always set by the express.json() verify callback in server.js
router.post('/webhook', async (req, res) => {
  const webhookSecret = process.env.CREEM_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return res.status(503).json({ error: 'Webhook niet geconfigureerd' });
  }

  const rawSignature = req.headers['creem-signature'] ?? '';
  if (!rawSignature) {
    console.warn('[payments] Webhook: ontbrekende creem-signature header');
    return res.status(400).json({ error: 'Ontbrekende creem-signature header' });
  }

  const rawBody = req.rawBody || '';
  console.log(`[payments] Webhook ontvangen: rawBody.length=${rawBody.length} signature="${rawSignature.slice(0, 20)}…"`);

  const computedSig = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  // Some providers prefix with "sha256=" — strip it for comparison
  const incomingSig = rawSignature.startsWith('sha256=')
    ? rawSignature.slice(7)
    : rawSignature;

  if (computedSig !== incomingSig) {
    console.warn(`[payments] Webhook: signature mismatch computed="${computedSig.slice(0, 10)}…" incoming="${incomingSig.slice(0, 10)}…"`);
    return res.status(403).json({ error: 'Ongeldige webhook handtekening' });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: 'Ongeldig JSON in webhook payload' });
  }

  console.log('[payments] Webhook payload:', JSON.stringify(event, null, 2));

  try {
    await handleEvent(event);
    res.json({ ok: true });
  } catch (err) {
    console.error('[payments] Webhook verwerkingsfout:', err.message);
    res.status(500).json({ error: 'Interne fout bij verwerken webhook' });
  }
});

async function handleEvent(event) {
  const type = event.eventType ?? event.webhookEventType ?? event.event_type
    ?? event.type ?? event.event;
  const data = event.object ?? event.data ?? event;

  const userId = data.metadata?.userId ?? data.requestId;
  const productId = data.product?.id ?? data.productId ?? data.product_id;
  const plan =
    (productId && creemAdapter.planForProductId(productId)) ??
    data.metadata?.plan;

  console.log(`[payments] Event type="${type}" userId="${userId}" productId="${productId}" plan="${plan}"`);

  // Creem uses dot-notation in most docs but some SDK versions use underscores
  const normalizedType = type?.replace(/_/g, '.') ?? '';

  switch (normalizedType) {
    case 'checkout.completed': {
      if (userId && plan) {
        await creemAdapter.upgradePlan(userId, plan);
        notifyPlanUpdate(userId, plan);
        console.log(`[payments] Plan geactiveerd via checkout: user=${userId} plan=${plan}`);
      } else {
        console.warn(`[payments] checkout.completed maar userId="${userId}" plan="${plan}" ontbreekt`);
      }
      break;
    }

    case 'subscription.active': {
      if (userId && plan) {
        const subId = data.id;
        const customerId = data.customer?.id;
        await creemAdapter.upgradePlan(userId, plan);
        if (subId) await creemAdapter.saveSubscription(userId, subId, customerId, plan);
        notifyPlanUpdate(userId, plan);
        console.log(`[payments] Abonnement geactiveerd: user=${userId} plan=${plan}`);
      } else {
        console.warn(`[payments] subscription.active maar userId="${userId}" plan="${plan}" ontbreekt`);
      }
      break;
    }

    case 'subscription.canceled':
    case 'subscription.expired': {
      const subId = data.id;
      if (subId) {
        await creemAdapter.revokeSubscription(subId);
        console.log(`[payments] Abonnement beëindigd: id=${subId}`);
      }
      break;
    }

    default:
      console.log(`[payments] Onbekend/genegeerd event type: "${type}" (genormaliseerd: "${normalizedType}")`);
      break;
  }
}

module.exports = router;
