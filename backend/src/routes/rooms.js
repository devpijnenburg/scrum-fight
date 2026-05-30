const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authMiddleware, optionalAuth } = require('../auth/middleware');
const { PLAN_LIMITS, VALID_METHODS } = require('../config/plans');

const ROOM_ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRoomId() {
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += ROOM_ID_CHARS[Math.floor(Math.random() * ROOM_ID_CHARS.length)];
  }
  return id;
}

async function uniqueRoomId() {
  for (let i = 0; i < 10; i++) {
    const id = generateRoomId();
    const { rows } = await db.query('SELECT id FROM rooms WHERE id = $1', [id]);
    if (!rows.length) return id;
  }
  throw new Error('Kon geen unieke kamer-ID genereren');
}

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

  let ownerId = null;
  let isGuest = true;
  let planLimitWarning = null;

  if (req.user) {
    ownerId = req.user.id;
    isGuest = false;

    const plan = req.user.plan || 'free';
    const limits = PLAN_LIMITS[plan];

    if (limits.maxRooms !== Infinity) {
      const { rows } = await db.query(
        `SELECT COUNT(*) FROM rooms WHERE owner_id = $1 AND is_guest = FALSE`,
        [ownerId]
      );
      if (parseInt(rows[0].count, 10) >= limits.maxRooms) {
        // Allow creation as a temporary (non-saved) room instead of blocking
        isGuest = true;
        ownerId = null;
        planLimitWarning = `Maximaal aantal kamers bereikt voor het ${plan}-plan (${limits.maxRooms}).`;
      }
    }
  }

  try {
    const id = await uniqueRoomId();
    const { rows } = await db.query(
      `INSERT INTO rooms (id, name, owner_id, method, is_guest)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, method, is_guest`,
      [id, name.trim().slice(0, 100), ownerId, method, isGuest]
    );
    const room = rows[0];
    if (planLimitWarning) room.planLimitWarning = planLimitWarning;
    res.status(201).json(room);
  } catch (err) {
    console.error('Create room error:', err);
    res.status(500).json({ error: 'Kon kamer niet aanmaken' });
  }
});

// ── List authenticated user's rooms ──────────────────────────────────────────

router.get('/', authMiddleware, async (req, res) => {
  // Query plan from DB — JWT may be stale after admin changes plan
  const { rows: userRows } = await db.query('SELECT plan FROM users WHERE id = $1', [req.user.id]);
  const plan = userRows[0]?.plan ?? 'free';
  const maxRooms = PLAN_LIMITS[plan]?.maxRooms ?? 3;

  const { rows } = await db.query(
    `SELECT id, name, method, last_active, created_at
     FROM rooms
     WHERE owner_id = $1 AND is_guest = FALSE
     ORDER BY last_active DESC`,
    [req.user.id]
  );

  const rooms = rows.map((r, i) => ({
    ...r,
    over_limit: maxRooms !== Infinity && i >= maxRooms,
  }));

  res.json({ rooms, maxRooms: maxRooms === Infinity ? null : maxRooms });
});

// ── Get single room ───────────────────────────────────────────────────────────

router.get('/:id', async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, name, method, is_guest FROM rooms WHERE id = $1`,
    [req.params.id.toUpperCase()]
  );
  if (!rows.length) return res.status(404).json({ error: 'Kamer niet gevonden' });
  res.json(rows[0]);
});

// ── Get room history ──────────────────────────────────────────────────────────

router.get('/:id/history', async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, votes, name, created_at
     FROM round_history
     WHERE room_id = $1
     ORDER BY created_at DESC
     LIMIT 20`,
    [req.params.id.toUpperCase()]
  );
  res.json(rows);
});

// ── Delete room ───────────────────────────────────────────────────────────────

router.delete('/:id', authMiddleware, async (req, res) => {
  const { rowCount } = await db.query(
    `DELETE FROM rooms WHERE id = $1 AND owner_id = $2`,
    [req.params.id.toUpperCase(), req.user.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Kamer niet gevonden of geen toegang' });
  res.json({ success: true });
});

module.exports = router;
