const db = require('../../config/database');

// All persistence for the rooms domain (rooms, round_history, user_votes).

async function findRoomById(id) {
  const { rows } = await db.query('SELECT * FROM rooms WHERE id = $1', [id]);
  return rows[0] || null;
}

async function roomIdExists(id) {
  const { rows } = await db.query('SELECT id FROM rooms WHERE id = $1', [id]);
  return rows.length > 0;
}

async function insertRoom({ id, name, ownerId, method, isGuest }) {
  const { rows } = await db.query(
    `INSERT INTO rooms (id, name, owner_id, method, is_guest)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, method, is_guest`,
    [id, name, ownerId, method, isGuest]
  );
  return rows[0];
}

async function listOwnedRooms(ownerId) {
  const { rows } = await db.query(
    `SELECT id, name, method, last_active, created_at
     FROM rooms
     WHERE owner_id = $1 AND is_guest = FALSE
     ORDER BY last_active DESC`,
    [ownerId]
  );
  return rows;
}

async function countOwnedRooms(ownerId) {
  const { rows } = await db.query(
    `SELECT COUNT(*) FROM rooms WHERE owner_id = $1 AND is_guest = FALSE`,
    [ownerId]
  );
  return parseInt(rows[0].count, 10);
}

async function claimRoom(id, ownerId) {
  const { rows } = await db.query(
    `UPDATE rooms SET is_guest = FALSE, owner_id = $1
     WHERE id = $2 AND is_guest = TRUE
     RETURNING id, name, method, is_guest`,
    [ownerId, id]
  );
  return rows[0] || null;
}

async function deleteOwnedRoom(id, ownerId) {
  const { rowCount } = await db.query(
    `DELETE FROM rooms WHERE id = $1 AND owner_id = $2`,
    [id, ownerId]
  );
  return rowCount > 0;
}

async function deleteRoom(id) {
  await db.query('DELETE FROM rooms WHERE id = $1', [id]);
}

async function touchLastActive(id) {
  await db.query('UPDATE rooms SET last_active = NOW() WHERE id = $1', [id]);
}

async function updateRoomName(id, name) {
  await db.query('UPDATE rooms SET name = $1 WHERE id = $2', [name, id]);
}

// Guest rooms inactive for over an hour (safety net — the socket layer
// handles real-time expiry). Non-guest rooms are never auto-deleted.
async function deleteStaleGuestRooms() {
  const { rowCount } = await db.query(`
    DELETE FROM rooms
    WHERE is_guest = TRUE
      AND last_active < NOW() - INTERVAL '1 hour'
  `);
  return rowCount;
}

async function getRoundHistory(roomId, limit = 20) {
  const { rows } = await db.query(
    `SELECT id, votes, name, created_at
     FROM round_history
     WHERE room_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [roomId, limit]
  );
  return rows;
}

// Persists a finished round: the vote snapshot plus per-user vote rows
// for authenticated players, and bumps the room's activity timestamp.
async function recordRound(roomId, roundName, players) {
  const votes = {};
  for (const p of players) votes[p.name] = p.vote;

  const { rows } = await db.query(
    `INSERT INTO round_history (room_id, votes, name) VALUES ($1, $2, $3) RETURNING id`,
    [roomId, JSON.stringify(votes), roundName || null]
  );
  const roundId = rows[0].id;

  for (const p of players) {
    if (p.userId && p.vote) {
      await db.query(
        `INSERT INTO user_votes (user_id, room_id, round_id, value) VALUES ($1, $2, $3, $4)`,
        [p.userId, roomId, roundId, p.vote]
      );
    }
  }

  await touchLastActive(roomId);
}

module.exports = {
  findRoomById,
  roomIdExists,
  insertRoom,
  listOwnedRooms,
  countOwnedRooms,
  claimRoom,
  deleteOwnedRoom,
  deleteRoom,
  touchLastActive,
  updateRoomName,
  deleteStaleGuestRooms,
  getRoundHistory,
  recordRound,
};
