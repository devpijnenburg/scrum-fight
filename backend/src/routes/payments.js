const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { authMiddleware } = require('../auth/middleware');
const polarAdapter = require('../payment/polar');

function isPolarConfigured() {
  return !!(
    process.env.POLAR_ACCESS_TOKEN &&
    process.env.POLAR_WEBHOOK_SECRET
  );
}

// POST /api/payments/checkout
router.post('/checkout', authMiddleware, async (req, res) => {
  if (!isPolarConfigured()) {
    return res.status(503).json({ error: 'Betalingen zijn momenteel niet geconfigureerd' });
  }

  const { plan } = req.body;
  if (!['pro', 'premium'].includes(plan)) {
    return res.status(400).json({ error: 'Ongeldig plan. Kies pro of premium.' });
  }

  const baseUrl = (process.env.BASE_URL || 'http://localhost').replace(/\/$/, '');

  try {
    const url = await polarAdapter.createCheckout(req.user.id, plan, baseUrl);
    res.json({ url });
  } catch (err) {
    console.error('[payments] Checkout error:', err.message);
    res.status(500).json({ error: 'Kon geen betaalsessie aanmaken' });
  }
});

// POST /api/payments/webhook
// express.raw() is applied in server.js before this route so req.rawBody is available
router.post('/webhook', async (req, res) => {
  const webhookSecret = process.env.POLAR_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return res.status(503).json({ error: 'Webhook niet geconfigureerd' });
  }

  const msgId = req.headers['webhook-id'];
  const msgTimestamp = req.headers['webhook-timestamp'];
  const msgSignature = req.headers['webhook-signature'];

  if (!msgId || !msgTimestamp || !msgSignature) {
    return res.status(400).json({ error: 'Ontbrekende webhook headers' });
  }

  // Reject replays older than 5 minutes
  const ageMs = Math.abs(Date.now() - parseInt(msgTimestamp, 10) * 1000);
  if (ageMs > 5 * 60 * 1000) {
    return res.status(400).json({ error: 'Webhook tijdstempel verlopen' });
  }

  const rawBody = req.rawBody || '';
  const signedContent = `${msgId}.${msgTimestamp}.${rawBody}`;

  // Secret is base64-encoded after optional 'whsec_' prefix
  const secretBytes = Buffer.from(webhookSecret.replace(/^whsec_/, ''), 'base64');
  const computedSig = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent)
    .digest('base64');

  const receivedSigs = msgSignature.split(' ').map((s) => s.replace(/^v1,/, ''));
  if (!receivedSigs.some((sig) => sig === computedSig)) {
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
  const { type, data } = event;

  switch (type) {
    case 'order.created': {
      // One-time purchase
      const userId = data.metadata?.userId ?? data.customer?.externalId;
      const plan =
        polarAdapter.planForProductId(data.productId) ??
        data.metadata?.plan;

      if (userId && plan) {
        await polarAdapter.upgradePlan(userId, plan);
        console.log(`[payments] Plan geactiveerd via order: user=${userId} plan=${plan}`);
      }
      break;
    }

    case 'subscription.active': {
      // Subscription activated or renewed
      const userId = data.metadata?.userId ?? data.customer?.externalId;
      const plan =
        polarAdapter.planForProductId(data.productId) ??
        data.metadata?.plan;

      if (userId && plan) {
        await polarAdapter.upgradePlan(userId, plan);
        await polarAdapter.saveSubscription(userId, data.id, data.customerId, plan);
        console.log(`[payments] Abonnement geactiveerd: user=${userId} plan=${plan}`);
      }
      break;
    }

    case 'subscription.revoked': {
      // Subscription expired or cancelled — downgrade to free
      if (data.id) {
        await polarAdapter.revokeSubscription(data.id);
        console.log(`[payments] Abonnement ingetrokken: id=${data.id}`);
      }
      break;
    }

    default:
      // Other events (subscription.canceled, etc.) require no action
      break;
  }
}

module.exports = router;
