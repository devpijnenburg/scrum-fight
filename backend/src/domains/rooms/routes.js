// /api/rooms
//
// Guests: is_guest=TRUE, owner_id=NULL, expire after 1 hour of inactivity.
// Authenticated users: saved rooms within their plan limit.

const express = require('express');
const { authMiddleware, optionalAuth } = require('../identity/middleware');
const rooms = require('./roomService');

const router = express.Router();

router.post('/', optionalAuth, async (req, res) => {
  res.status(201).json(await rooms.createRoom(req.user, req.body));
});

router.get('/', authMiddleware, async (req, res) => {
  res.json(await rooms.listRooms(req.user.id));
});

router.get('/:id', async (req, res) => {
  res.json(await rooms.getRoom(req.params.id));
});

router.get('/:id/history', async (req, res) => {
  res.json(await rooms.getHistory(req.params.id));
});

router.post('/:id/claim', authMiddleware, async (req, res) => {
  res.json(await rooms.claimRoom(req.user, req.params.id));
});

router.delete('/:id', authMiddleware, async (req, res) => {
  await rooms.deleteRoom(req.user, req.params.id);
  res.json({ success: true });
});

module.exports = router;
