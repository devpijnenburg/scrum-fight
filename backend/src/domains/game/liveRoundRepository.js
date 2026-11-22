const db = require('../../shared/database');

// Persistence of the round in progress per room (table `live_rounds`).
// The state is GameRoom#snapshot(): { roundName, revealed, players }.

async function saveLiveRound(roomId, state) {
  await db.query(
    `INSERT INTO live_rounds (room_id, state, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (room_id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()`,
    [roomId, JSON.stringify(state)]
  );
}

async function loadLiveRound(roomId) {
  const { rows } = await db.query('SELECT state FROM live_rounds WHERE room_id = $1', [roomId]);
  return rows[0]?.state ?? null;
}

// Rounds nobody touched for a day are abandoned.
async function deleteStaleLiveRounds(maxAgeHours = 24) {
  const { rowCount } = await db.query(
    `DELETE FROM live_rounds WHERE updated_at < NOW() - make_interval(hours => $1)`,
    [maxAgeHours]
  );
  return rowCount;
}

module.exports = { saveLiveRound, loadLiveRound, deleteStaleLiveRounds };
