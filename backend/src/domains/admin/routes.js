// /api/admin — admin portal (admins only).

const express = require('express');
const { requireAdmin } = require('../identity/middleware');
const admin = require('./adminService');
const { createLogger, maskEmail } = require('../../shared/logger');

const log = createLogger('admin');

// Auditregel: welke admin wat heeft gewijzigd.
const audit = (req, message, fields) => log.info(message, { admin: req.user.id, ...fields });

const router = express.Router();
router.use(requireAdmin);

// ── Users ───────────────────────────────────────────────────────────────────

router.get('/users', async (req, res) => {
  res.json(await admin.searchUsers(req.query));
});

router.put('/users/:id', async (req, res) => {
  const user = await admin.updateUser(req.params.id, req.body);
  const { name, email, plan, is_admin: isAdmin } = req.body || {};
  audit(req, 'Gebruiker bijgewerkt', {
    user: req.params.id,
    changed: Object.entries({ name, email, plan, is_admin: isAdmin })
      .filter(([, v]) => v !== undefined && v !== '').map(([k]) => k).join(',') || undefined,
    plan: plan || undefined,
    isAdmin: typeof isAdmin === 'boolean' ? isAdmin : undefined,
  });
  res.json(user);
});

router.delete('/users/:id', async (req, res) => {
  await admin.deleteUser(req.params.id);
  audit(req, 'Gebruiker verwijderd', { user: req.params.id });
  res.status(204).end();
});

// ── Organizations ───────────────────────────────────────────────────────────

router.get('/organizations', async (req, res) => {
  res.json(await admin.listOrganizations());
});

router.post('/organizations', async (req, res) => {
  const org = await admin.createOrganization(req.body);
  audit(req, 'Organisatie aangemaakt', { org: org?.id, slug: org?.slug, plan: org?.plan });
  res.status(201).json(org);
});

router.put('/organizations/:id', async (req, res) => {
  const org = await admin.updateOrganization(req.params.id, req.body);
  audit(req, 'Organisatie bijgewerkt', { org: req.params.id, plan: req.body?.plan || undefined });
  res.json(org);
});

router.delete('/organizations/:id', async (req, res) => {
  await admin.deleteOrganization(req.params.id);
  audit(req, 'Organisatie verwijderd', { org: req.params.id });
  res.json({ ok: true });
});

// ── Members ─────────────────────────────────────────────────────────────────

router.get('/organizations/:id/members', async (req, res) => {
  res.json(await admin.listMembers(req.params.id));
});

router.post('/organizations/:id/members', async (req, res) => {
  const member = await admin.addMember(req.params.id, req.body);
  audit(req, 'Lid toegevoegd aan organisatie', {
    org: req.params.id, email: maskEmail(req.body?.email), role: req.body?.role || 'member',
  });
  res.status(201).json(member);
});

router.delete('/organizations/:id/members/:userId', async (req, res) => {
  await admin.removeMember(req.params.id, req.params.userId);
  audit(req, 'Lid verwijderd uit organisatie', { org: req.params.id, user: req.params.userId });
  res.json({ ok: true });
});

module.exports = router;
