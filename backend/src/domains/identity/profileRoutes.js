// /api/profile — account settings of the logged-in user.

const express = require('express');
const { authMiddleware } = require('./middleware');
const profile = require('./profileService');

const router = express.Router();
router.use(authMiddleware);

router.get('/totp/setup', async (req, res) => {
  res.json(await profile.startTotpSetup(req.user.id));
});

router.post('/totp/enable', async (req, res) => {
  await profile.enableTotp(req.user.id, req.body);
  res.json({ ok: true });
});

router.post('/totp/disable', async (req, res) => {
  await profile.disableTotp(req.user.id, req.body);
  res.json({ ok: true });
});

router.post('/email-2fa/enable', async (req, res) => {
  await profile.enableEmail2fa(req.user.id);
  res.json({ ok: true });
});

router.post('/email-2fa/disable', async (req, res) => {
  await profile.disableEmail2fa(req.user.id);
  res.json({ ok: true });
});

router.get('/emoticon', async (req, res) => {
  res.json({ emoticon: await profile.getEmoticon(req.user.id) });
});

router.put('/emoticon', async (req, res) => {
  const emoticon = await profile.setEmoticon(req.user.id, req.body.emoticon);
  res.json({ ok: true, emoticon });
});

module.exports = router;
