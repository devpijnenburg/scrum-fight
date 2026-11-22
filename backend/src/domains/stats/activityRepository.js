const db = require('../../shared/database');

// Room activity of account users that feeds stats and badges
// (spectator sessions and emoji reactions).

async function recordSpectatorSession(userId, roomId) {
  await db.query(
    'INSERT INTO user_spectator_sessions (user_id, room_id) VALUES ($1, $2)',
    [userId, roomId]
  );
}

async function recordReaction(userId, roomId, emoji) {
  await db.query(
    'INSERT INTO user_reactions (user_id, room_id, emoji) VALUES ($1, $2, $3)',
    [userId, roomId, emoji]
  );
}

module.exports = { recordSpectatorSession, recordReaction };
