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
        return res.status(403).json({
          error: `Maximaal aantal kamers bereikt voor het ${plan}-plan (${limits.maxRooms}).`,
        });
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
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Create room error:', err);
    res.status(500).json({ error: 'Kon kamer niet aanmaken' });
  }
});

// ── List authenticated user's rooms ──────────────────────────────────────────

router.get('/', authMiddleware, async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, name, method, last_active, created_at
     FROM rooms
     WHERE owner_id = $1 AND is_guest = FALSE
     ORDER BY last_active DESC`,
    [req.user.id]
  );
  res.json(rows);
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
