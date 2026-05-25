const express = require('express');
const router = express.Router();
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const db = require('../config/database');
const { authMiddleware } = require('../auth/middleware');

router.get('/totp/setup', authMiddleware, async (req, res) => {
  const { base32: secret } = speakeasy.generateSecret({ length: 20 });
  const { rows } = await db.query('SELECT email, name FROM users WHERE id = $1', [req.user.id]);
  const user = rows[0];
  const label = user.email || user.name;
  const otpauthUrl = speakeasy.otpauthURL({ secret, label: encodeURIComponent(label), issuer: 'Scrum Fight', encoding: 'base32' });
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
  res.json({ secret, qrDataUrl });
});

router.post('/totp/enable', authMiddleware, async (req, res) => {
  const { secret, code } = req.body;
  if (!secret || !code) {
    return res.status(400).json({ error: 'Secret en code zijn verplicht' });
  }
  const valid = speakeasy.totp.verify({ secret, encoding: 'base32', token: code, window: 1 });
  if (!valid) {
    return res.status(400).json({ error: 'Ongeldige code, probeer opnieuw' });
  }
  await db.query(
    'UPDATE users SET totp_secret = $1, totp_enabled = true, updated_at = NOW() WHERE id = $2',
    [secret, req.user.id]
  );
  res.json({ ok: true });
});

router.post('/totp/disable', authMiddleware, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code is verplicht' });

  const { rows } = await db.query(
    'SELECT totp_secret, totp_enabled FROM users WHERE id = $1',
    [req.user.id]
  );
  const user = rows[0];
  if (!user?.totp_enabled) {
    return res.status(400).json({ error: '2FA is niet ingeschakeld' });
  }
  const valid = speakeasy.totp.verify({ secret: user.totp_secret, encoding: 'base32', token: code, window: 1 });
  if (!valid) {
    return res.status(400).json({ error: 'Ongeldige code' });
  }
  await db.query(
    'UPDATE users SET totp_secret = NULL, totp_enabled = false, updated_at = NOW() WHERE id = $1',
    [req.user.id]
  );
  res.json({ ok: true });
});

module.exports = router;
