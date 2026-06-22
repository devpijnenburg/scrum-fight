const express = require('express');
const router = express.Router();
const speakeasy = require('speakeasy');
const local = require('../auth/strategies/local');
const google = require('../auth/strategies/google');
const github = require('../auth/strategies/github');
const { authMiddleware } = require('../auth/middleware');
const { verify, sign } = require('../auth/jwt');
const db = require('../config/database');

// In-memory store for OAuth state nonces (maps state → { provider, timestamp })
const oauthStates = new Map();

function generateState() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

function cleanExpiredStates() {
  const expiry = Date.now() - 10 * 60 * 1000; // 10 minutes
  for (const [key, val] of oauthStates) {
    if (val.timestamp < expiry) oauthStates.delete(key);
  }
}

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

router.post('/verify-totp', async (req, res) => {
  const { preAuthToken, code } = req.body;
  if (!preAuthToken || !code) {
    return res.status(400).json({ error: 'Token en code zijn verplicht' });
  }

  let payload;
  try {
    payload = verify(preAuthToken);
  } catch {
    return res.status(401).json({ error: 'Ongeldig of verlopen token' });
  }

  if (!payload.preAuth) {
    return res.status(401).json({ error: 'Ongeldig pre-auth token' });
  }

  const { rows } = await db.query(
    'SELECT id, name, plan, is_admin, totp_secret, totp_enabled FROM users WHERE id = $1',
    [payload.id]
  );
  const user = rows[0];
  if (!user || !user.totp_enabled) {
    return res.status(401).json({ error: 'Ongeldige aanvraag' });
  }

  const valid = speakeasy.totp.verify({ secret: user.totp_secret, encoding: 'base32', token: code, window: 1 });
  if (!valid) {
    return res.status(401).json({ error: 'Ongeldige code' });
  }

  const token = sign({ id: user.id, name: user.name, plan: user.plan, is_admin: user.is_admin });
  res.json({ token });
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
  const jwtToken = sign({ id: user.id, name: user.name, plan: user.plan, is_admin: user.is_admin });
  res.json({ token: jwtToken, user });
});

// ── E-mail 2FA verificatie ────────────────────────────────────────────────────

router.post('/verify-email-2fa', async (req, res) => {
  const { preAuthToken, code } = req.body;
  if (!preAuthToken || !code) {
    return res.status(400).json({ error: 'Token en code zijn verplicht' });
  }

  let payload;
  try {
    payload = verify(preAuthToken);
  } catch {
    return res.status(401).json({ error: 'Ongeldig of verlopen token' });
  }
  if (!payload.preAuth) {
    return res.status(401).json({ error: 'Ongeldig pre-auth token' });
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
  const user = userRows[0];
  const token = sign({ id: user.id, name: user.name, plan: user.plan, is_admin: user.is_admin });
  res.json({ token });
});

// ── Google OAuth ──────────────────────────────────────────────────────────────

router.get('/google', (req, res) => {
  if (!google.isConfigured()) {
    return res.status(501).json({ error: 'Google OAuth is niet geconfigureerd' });
  }
  cleanExpiredStates();
  const state = generateState();
  oauthStates.set(state, { provider: 'google', timestamp: Date.now() });
  const redirectUri = `${process.env.BASE_URL}/api/auth/google/callback`;
  res.redirect(google.getAuthUrl(state, redirectUri));
});

router.get('/google/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!state || !oauthStates.has(state)) {
    return res.redirect('/?error=oauth_state_invalid');
  }
  oauthStates.delete(state);
  try {
    const redirectUri = `${process.env.BASE_URL}/api/auth/google/callback`;
    const result = await google.handleCallback(code, redirectUri);
    if (result.requiresTotp) {
      res.redirect(`/totp-verify.html?preAuthToken=${result.preAuthToken}`);
    } else {
      res.redirect(`/dashboard.html?token=${result.token}`);
    }
  } catch (err) {
    console.error('Google OAuth error:', err);
    res.redirect('/?error=oauth_failed');
  }
});

// ── GitHub OAuth ──────────────────────────────────────────────────────────────

router.get('/github', (req, res) => {
  if (!github.isConfigured()) {
    return res.status(501).json({ error: 'GitHub OAuth is niet geconfigureerd' });
  }
  cleanExpiredStates();
  const state = generateState();
  oauthStates.set(state, { provider: 'github', timestamp: Date.now() });
  const redirectUri = `${process.env.BASE_URL}/api/auth/github/callback`;
  res.redirect(github.getAuthUrl(state, redirectUri));
});

router.get('/github/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!state || !oauthStates.has(state)) {
    return res.redirect('/?error=oauth_state_invalid');
  }
  oauthStates.delete(state);
  try {
    const redirectUri = `${process.env.BASE_URL}/api/auth/github/callback`;
    const result = await github.handleCallback(code, redirectUri);
    if (result.requiresTotp) {
      res.redirect(`/totp-verify.html?preAuthToken=${result.preAuthToken}`);
    } else {
      res.redirect(`/dashboard.html?token=${result.token}`);
    }
  } catch (err) {
    console.error('GitHub OAuth error:', err);
    res.redirect('/?error=oauth_failed');
  }
});

module.exports = router;
