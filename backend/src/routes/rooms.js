const express = require('express');
const router = express.Router();
const { authMiddleware, optionalAuth } = require('../auth/middleware');
const { VALID_METHODS } = require('../config/plans');
const roomRepository = require('../domain/rooms/roomRepository');
const roomService = require('../domain/rooms/roomService');
const { getPlan } = require('../domain/users/userRepository');
const { claimGuestRoom } = require('../socket');

// ── Create room ───────────────────────────────────────────────────────────────
// Both guests and authenticated users can create rooms.
// Guests: is_guest=TRUE, owner_id=NULL, 1-hour TTL enforced by socket handler.
// Auth users: is_guest=FALSE, owner_id set, plan limits checked, 30-day TTL.

router.post('/', optionalAuth, async (req, res) => {
  const { name, method } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Kamernaam is verplicht' });
  }
  if (!VALID_METHODS.includes(method)) {
    return res.status(400).json({ error: 'Ongeldige schattingsmethode' });
  }

  try {
    const room = await roomService.createRoom(req.user, {
      name: name.trim().slice(0, 100),
      method,
    });
    res.status(201).json(room);
  } catch (err) {
    console.error('Create room error:', err);
    res.status(500).json({ error: 'Kon kamer niet aanmaken' });
  }
});

// ── List authenticated user's rooms ──────────────────────────────────────────

router.get('/', authMiddleware, async (req, res) => {
  // Query plan from DB — JWT may be stale after admin changes plan
  const plan = await getPlan(req.user.id);
  const maxRooms = roomService.maxRoomsForPlan(plan);

  const rows = await roomRepository.listOwnedRooms(req.user.id);

  const rooms = rows.map((r, i) => ({
    ...r,
    over_limit: maxRooms !== Infinity && i >= maxRooms,
  }));

  res.json({ rooms, maxRooms: maxRooms === Infinity ? null : maxRooms });
});

// ── Get single room ───────────────────────────────────────────────────────────

router.get('/:id', async (req, res) => {
  const room = await roomRepository.findRoomById(req.params.id.toUpperCase());
  if (!room) return res.status(404).json({ error: 'Kamer niet gevonden' });
  res.json({ id: room.id, name: room.name, method: room.method, is_guest: room.is_guest });
});

// ── Get room history ──────────────────────────────────────────────────────────

router.get('/:id/history', async (req, res) => {
  const rows = await roomRepository.getRoundHistory(req.params.id.toUpperCase());
  res.json(rows);
});

// ── Claim (upgrade) a guest room ─────────────────────────────────────────────
// Converts an ownerless guest room into a permanent room owned by the caller,
// subject to their plan's room limit. Cancels the guest-room inactivity TTL.

router.post('/:id/claim', authMiddleware, async (req, res) => {
  const roomId = req.params.id.toUpperCase();
  const plan = req.user.plan || 'free';

  if (await roomService.hasReachedRoomLimit(req.user.id, plan)) {
    return res.status(403).json({ error: roomService.roomLimitMessage(plan) });
  }

  const room = await roomRepository.claimRoom(roomId, req.user.id);
  if (!room) {
    return res.status(409).json({ error: 'Kamer kan niet geclaimd worden (bestaat niet meer of is al permanent)' });
  }

  claimGuestRoom(roomId);
  res.json(room);
});

// ── Delete room ───────────────────────────────────────────────────────────────

router.delete('/:id', authMiddleware, async (req, res) => {
  const deleted = await roomRepository.deleteOwnedRoom(req.params.id.toUpperCase(), req.user.id);
  if (!deleted) return res.status(404).json({ error: 'Kamer niet gevonden of geen toegang' });
  res.json({ success: true });
});

module.exports = router;
