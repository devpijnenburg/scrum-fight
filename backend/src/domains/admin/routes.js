// /api/admin — admin portal (admins only).

const express = require('express');
const { requireAdmin } = require('../identity/middleware');
const admin = require('./adminService');

const router = express.Router();
router.use(requireAdmin);

// ── Users ───────────────────────────────────────────────────────────────────

router.get('/users', async (req, res) => {
  res.json(await admin.searchUsers(req.query));
});

router.put('/users/:id', async (req, res) => {
  res.json(await admin.updateUser(req.params.id, req.body));
});

router.delete('/users/:id', async (req, res) => {
  await admin.deleteUser(req.params.id);
  res.status(204).end();
});

// ── Organizations ───────────────────────────────────────────────────────────

router.get('/organizations', async (req, res) => {
  res.json(await admin.listOrganizations());
});

router.post('/organizations', async (req, res) => {
  res.status(201).json(await admin.createOrganization(req.body));
});

router.put('/organizations/:id', async (req, res) => {
  res.json(await admin.updateOrganization(req.params.id, req.body));
});

router.delete('/organizations/:id', async (req, res) => {
  await admin.deleteOrganization(req.params.id);
  res.json({ ok: true });
});

// ── Members ─────────────────────────────────────────────────────────────────

router.get('/organizations/:id/members', async (req, res) => {
  res.json(await admin.listMembers(req.params.id));
});

router.post('/organizations/:id/members', async (req, res) => {
  res.status(201).json(await admin.addMember(req.params.id, req.body));
});

router.delete('/organizations/:id/members/:userId', async (req, res) => {
  await admin.removeMember(req.params.id, req.params.userId);
  res.json({ ok: true });
});

module.exports = router;
