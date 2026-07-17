const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const local = require('../auth/strategies/local');
const google = require('../auth/strategies/google');
const github = require('../auth/strategies/github');
const { authMiddleware } = require('../auth/middleware');
const { verify, signSessionToken } = require('../auth/jwt');
const { verifyTotpCode } = require('../auth/totp');
const oauthStateStore = require('../auth/oauthStateStore');
const db = require('../config/database');
const { sendVerificationEmail } = require('../domain/users/userMailer');

// ── Provider discovery ────────────────────────────────────────────────────────

router.get('/providers', (req, res) => {
  res.json({
    google: google.isConfigured(),
    github: github.isConfigured(),
  });
});

// ── Email / password ──────────────────────────────────────────────────────────

router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Naam, e-mail en wachtwoord zijn verplicht' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Wachtwoord moet minimaal 8 tekens bevatten' });
  }
  try {
    const result = await local.register(name, email, password);
    res.status(201).json(result);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'E-mailadres is al in gebruik' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail en wachtwoord zijn verplicht' });
  }
  try {
    const result = await local.login(email, password);
    res.json(result);
  } catch (err) {
    if (err.code === 'EMAIL_NOT_VERIFIED') {
      return res.status(403).json({ error: err.message, code: 'EMAIL_NOT_VERIFIED' });
    }
    res.status(401).json({ error: err.message });
  }
});

// ── Verificatiemail opnieuw sturen ────────────────────────────────────────────

router.post('/resend-verification', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'E-mail is verplicht' });

  const { rows } = await db.query(
    'SELECT id, name, email, email_verified FROM users WHERE email = $1',
    [email.toLowerCase().trim()]
  );

  // Altijd 200 teruggeven om e-mailenumeratie te voorkomen
  if (!rows.length || rows[0].email_verified) {
    return res.json({ ok: true });
  }

  const user = rows[0];
  const token = crypto.randomUUID();
  await db.query(
    'UPDATE users SET email_verification_token = $1, updated_at = NOW() WHERE id = $2',
    [token, user.id]
  );

  await sendVerificationEmail(user, token);

  res.json({ ok: true });
});

// ── Current user ─────────────────────────────────────────────────────────────

router.get('/me', authMiddleware, async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, name, email, plan, is_admin, totp_enabled, oauth_provider, emoticon, created_at
     FROM users WHERE id = $1`,
    [req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Gebruiker niet gevonden' });
  res.json(rows[0]);
});

// ── 2FA-verificatie (TOTP + e-mailcode) ───────────────────────────────────────

// Validates the short-lived pre-auth token issued after the first login
// step. Returns its payload, or null when missing/invalid/expired.
function verifyPreAuthToken(preAuthToken) {
  try {
    const payload = verify(preAuthToken);
    return payload.preAuth ? payload : null;
  } catch {
    return null;
  }
}

router.post('/verify-totp', async (req, res) => {
  const { preAuthToken, code } = req.body;
  if (!preAuthToken || !code) {
    return res.status(400).json({ error: 'Token en code zijn verplicht' });
  }

  const payload = verifyPreAuthToken(preAuthToken);
  if (!payload) {
    return res.status(401).json({ error: 'Ongeldig of verlopen token' });
  }

  const { rows } = await db.query(
    'SELECT id, name, plan, is_admin, totp_secret, totp_enabled FROM users WHERE id = $1',
    [payload.id]
  );
  const user = rows[0];
  if (!user || !user.totp_enabled) {
    return res.status(401).json({ error: 'Ongeldige aanvraag' });
  }

  if (!verifyTotpCode(user.totp_secret, code)) {
    return res.status(401).json({ error: 'Ongeldige code' });
  }

  res.json({ token: signSessionToken(user) });
});

router.post('/verify-email-2fa', async (req, res) => {
  const { preAuthToken, code } = req.body;
  if (!preAuthToken || !code) {
    return res.status(400).json({ error: 'Token en code zijn verplicht' });
  }

  const payload = verifyPreAuthToken(preAuthToken);
  if (!payload) {
    return res.status(401).json({ error: 'Ongeldig of verlopen token' });
  }

  const { rows: codeRows } = await db.query(
    `DELETE FROM email_2fa_codes
     WHERE user_id = $1 AND code = $2 AND expires_at > NOW()
     RETURNING user_id`,
    [payload.id, code]
  );
  if (!codeRows.length) {
    return res.status(401).json({ error: 'Ongeldige of verlopen code' });
  }

  const { rows: userRows } = await db.query(
    'SELECT id, name, plan, is_admin FROM users WHERE id = $1',
    [payload.id]
  );
  res.json({ token: signSessionToken(userRows[0]) });
});

// ── E-mailverificatie ─────────────────────────────────────────────────────────

router.get('/verify-email', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token ontbreekt' });

  const { rows } = await db.query(
    `UPDATE users
     SET email_verified = true, email_verification_token = NULL, updated_at = NOW()
     WHERE email_verification_token = $1
     RETURNING id, name, email, plan, is_admin`,
    [token]
  );
  if (!rows.length) return res.status(400).json({ error: 'Ongeldig of verlopen token' });

  const user = rows[0];
  res.json({ token: signSessionToken(user), user });
});

// ── OAuth (Google, GitHub) ────────────────────────────────────────────────────
// Both providers share the same route pair: a redirect to the provider's
// consent screen (with a CSRF state nonce) and a callback that exchanges
// the code for a session or a TOTP pre-auth step.

function mountOAuthRoutes(provider, label, strategy) {
  const redirectUri = () => `${process.env.BASE_URL}/api/auth/${provider}/callback`;

  router.get(`/${provider}`, (req, res) => {
    if (!strategy.isConfigured()) {
      return res.status(501).json({ error: `${label} OAuth is niet geconfigureerd` });
    }
    const state = oauthStateStore.createState(provider);
    res.redirect(strategy.getAuthUrl(state, redirectUri()));
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
      console.error(`${label} OAuth error:`, err);
      res.redirect('/?error=oauth_failed');
    }
  });
}

mountOAuthRoutes('google', 'Google', google);
mountOAuthRoutes('github', 'GitHub', github);

module.exports = router;
