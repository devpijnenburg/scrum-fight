const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { authMiddleware } = require('../auth/middleware');
const creemAdapter = require('../payment/creem');

function isCreemConfigured() {
  return !!(process.env.CREEM_API_KEY && process.env.CREEM_WEBHOOK_SECRET);
}

// POST /api/payments/checkout
router.post('/checkout', authMiddleware, async (req, res) => {
  if (!isCreemConfigured()) {
    return res.status(503).json({ error: 'Betalingen zijn momenteel niet geconfigureerd' });
  }

  const { plan } = req.body;
  if (!['pro', 'premium'].includes(plan)) {
    return res.status(400).json({ error: 'Ongeldig plan. Kies pro of premium.' });
  }

  const baseUrl = (process.env.BASE_URL || 'http://localhost').replace(/\/$/, '');

  try {
    const url = await creemAdapter.createCheckout(req.user.id, plan, baseUrl);
    res.json({ url });
  } catch (err) {
    console.error('[payments] Checkout error:', err.message);
    res.status(500).json({ error: 'Kon geen betaalsessie aanmaken' });
  }
});

// POST /api/payments/webhook
// req.rawBody is set by the express.json() verify callback in server.js
router.post('/webhook', async (req, res) => {
  const webhookSecret = process.env.CREEM_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return res.status(503).json({ error: 'Webhook niet geconfigureerd' });
  }

  const signature = req.headers['creem-signature'];
  if (!signature) {
    return res.status(400).json({ error: 'Ontbrekende creem-signature header' });
  }

  const rawBody = req.rawBody || '';
  const computedSig = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  if (computedSig !== signature) {
    return res.status(403).json({ error: 'Ongeldige webhook handtekening' });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: 'Ongeldig JSON in webhook payload' });
  }

  try {
    await handleEvent(event);
    res.json({ ok: true });
  } catch (err) {
    console.error('[payments] Webhook verwerkingsfout:', err.message);
    res.status(500).json({ error: 'Interne fout bij verwerken webhook' });
  }
});

async function handleEvent(event) {
  // Creem sends eventType or webhookEventType
  const type = event.eventType ?? event.webhookEventType ?? event.event_type;
  const data = event.object ?? event.data ?? event;

  // Resolve user ID from referenceId, or from metadata
  const userId = data.referenceId ?? data.reference_id ?? data.metadata?.userId;
  // Product ID for plan mapping
  const productId = data.product?.id ?? data.productId;
  // Resolve plan: prefer product→plan mapping, fall back to metadata
  const plan =
    (productId && creemAdapter.planForProductId(productId)) ??
    data.metadata?.plan;

  switch (type) {
    case 'checkout.completed': {
      if (userId && plan) {
        await creemAdapter.upgradePlan(userId, plan);
        console.log(`[payments] Plan geactiveerd via checkout: user=${userId} plan=${plan}`);
      }
      break;
    }

    case 'subscription.active': {
      if (userId && plan) {
        const subId = data.id;
        const customerId = data.customer?.id;
        await creemAdapter.upgradePlan(userId, plan);
        if (subId) await creemAdapter.saveSubscription(userId, subId, customerId, plan);
        console.log(`[payments] Abonnement geactiveerd: user=${userId} plan=${plan}`);
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
      // subscription.paid, subscription.trialing, etc. require no plan changes
      break;
  }
}

module.exports = router;
