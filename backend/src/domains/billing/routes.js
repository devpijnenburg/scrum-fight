// /api/payments — paid plans through Creem.

const express = require('express');
const billing = require('./billingService');
const { authMiddleware } = require('../identity/middleware');
const { rateLimit } = require('../../shared/rateLimit');

const MINUTE = 60 * 1000;
const limiters = {
  checkout: rateLimit({ name: 'checkout', windowMs: 10 * MINUTE, max: 15 }),
  portal:   rateLimit({ name: 'portal',   windowMs: 10 * MINUTE, max: 15 }),
};

const router = express.Router();

// Public: which plans can be bought and what they cost.
router.get('/offers', async (req, res) => {
  res.json(await billing.getOffers());
});

router.get('/subscription', authMiddleware, async (req, res) => {
  res.json(await billing.getSubscription(req.user));
});

router.post('/checkout', limiters.checkout, authMiddleware, async (req, res) => {
  res.json(await billing.startCheckout(req.user, req.body));
});

router.post('/confirm', authMiddleware, async (req, res) => {
  res.json(await billing.confirmReturn(req.user, req.body?.query));
});

router.post('/portal', limiters.portal, authMiddleware, async (req, res) => {
  res.json(await billing.createPortalLink(req.user));
});

// The webhook is mounted separately (see app.js): its signature covers the
// exact bytes Creem sent, so it needs the raw body instead of parsed JSON.
const webhookRouter = express.Router();

webhookRouter.post('/', express.raw({ type: () => true, limit: '1mb' }), async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  await billing.handleWebhook(rawBody, req.get('creem-signature'));
  res.json({ ok: true });
});

module.exports = router;
module.exports.webhookRouter = webhookRouter;
module.exports.limiters = limiters;
