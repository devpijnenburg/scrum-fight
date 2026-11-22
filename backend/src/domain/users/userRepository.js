const db = require('../../config/database');

async function findById(id) {
  const { rows } = await db.query(
    'SELECT id, name, emoticon FROM users WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

async function getPlan(id) {
  const { rows } = await db.query('SELECT plan FROM users WHERE id = $1', [id]);
  return rows[0]?.plan ?? 'free';
}

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

// Email 2FA codes are single-use and valid for 10 minutes; expired rows
// are only kept until the next cleanup run.
async function deleteExpiredLoginCodes() {
  const { rowCount } = await db.query('DELETE FROM email_2fa_codes WHERE expires_at < NOW()');
  return rowCount;
}

module.exports = { findById, getPlan, recordSpectatorSession, recordReaction, deleteExpiredLoginCodes };
