// /api/auth — registration, login, verification and OAuth.

const express = require('express');
const auth = require('./authService');
const google = require('./oauth/google');
const github = require('./oauth/github');
const oauthStateStore = require('./oauth/oauthStateStore');
const { authMiddleware } = require('./middleware');
const { rateLimit } = require('../../shared/rateLimit');
const { notImplemented } = require('../../shared/errors');
const { createLogger } = require('../../shared/logger');

const log = createLogger('auth');

const router = express.Router();
const MINUTE = 60 * 1000;

// Brute-force protection on credential and code endpoints (per client IP).
const limiters = {
  login:     rateLimit({ name: 'login',    windowMs: 15 * MINUTE, max: 20 }),
  register:  rateLimit({ name: 'register', windowMs: 60 * MINUTE, max: 10 }),
  resend:    rateLimit({ name: 'resend',   windowMs: 15 * MINUTE, max: 5 }),
  twoFactor: rateLimit({ name: '2fa',      windowMs: 15 * MINUTE, max: 10 }),
};

router.get('/providers', (req, res) => {
  res.json({ google: google.isConfigured(), github: github.isConfigured() });
});

// ── Email / password ────────────────────────────────────────────────────────

router.post('/register', limiters.register, async (req, res) => {
  res.status(201).json(await auth.register(req.body));
});

router.post('/login', limiters.login, async (req, res) => {
  res.json(await auth.login(req.body));
});

router.post('/resend-verification', limiters.resend, async (req, res) => {
  await auth.resendVerification(req.body.email);
  res.json({ ok: true });
});

router.get('/verify-email', async (req, res) => {
  res.json(await auth.verifyEmail(req.query.token));
});

router.get('/me', authMiddleware, async (req, res) => {
  res.json(await auth.getCurrentUser(req.user.id));
});

// A new session token carrying the user's current name, plan and role.
router.post('/refresh', authMiddleware, async (req, res) => {
  res.json(await auth.refreshSession(req.user.id));
});

// ── Second login step ───────────────────────────────────────────────────────

router.post('/verify-totp', limiters.twoFactor, async (req, res) => {
  res.json(await auth.completeTotpLogin(req.body));
});

router.post('/verify-email-2fa', limiters.twoFactor, async (req, res) => {
  res.json(await auth.completeEmailCodeLogin(req.body));
});

// ── OAuth (Google, GitHub) ──────────────────────────────────────────────────
// Each provider gets a redirect to its consent screen (with a CSRF state
// nonce) and a callback that exchanges the code for a session or a TOTP step.

function mountOAuthRoutes(provider, label, strategy) {
  const redirectUri = () => `${process.env.BASE_URL}/api/auth/${provider}/callback`;

  router.get(`/${provider}`, (req, res) => {
    if (!strategy.isConfigured()) {
      throw notImplemented('OAUTH_NOT_CONFIGURED', `${label} OAuth is niet geconfigureerd`);
    }
    res.redirect(strategy.getAuthUrl(oauthStateStore.createState(provider), redirectUri()));
  });

  router.get(`/${provider}/callback`, async (req, res) => {
    const { code, state } = req.query;
    if (!oauthStateStore.consumeState(state)) {
      return res.redirect('/?error=oauth_state_invalid');
    }
    try {
      const result = await strategy.handleCallback(code, redirectUri());
      if (result.requiresTotp) {
        res.redirect(`/totp-verify.html?preAuthToken=${result.preAuthToken}`);
      } else {
        res.redirect(`/dashboard.html?token=${result.token}`);
      }
    } catch (err) {
      log.error('OAuth-login mislukt', { provider: label }, err);
      res.redirect('/?error=oauth_failed');
    }
  });
}

mountOAuthRoutes('google', 'Google', google);
mountOAuthRoutes('github', 'GitHub', github);

module.exports = router;
module.exports.limiters = limiters;
