const db = require('../../config/database');
const { BADGE_UNLOCK_FNS } = require('./badgeDefinitions');
const { getEarnedBadgeIds, insertNewBadges } = require('./badgeRepository');

// Fetches the stats subset needed for badge evaluation (lighter than the full /users/stats endpoint).
async function fetchStatsForUser(userId) {
  const [summary, distribution, consensus, streaks, methods, maxDay, spectatorRows, reactionRows] = await Promise.all([
    db.query(
      `SELECT COUNT(*)::int AS total_rounds,
              COUNT(DISTINCT room_id)::int AS total_sessions
       FROM user_votes WHERE user_id = $1`,
      [userId]
    ),
    db.query(
      `SELECT value, COUNT(*)::int AS count
       FROM user_votes WHERE user_id = $1
       GROUP BY value ORDER BY count DESC`,
      [userId]
    ),
    db.query(
      `WITH vote_vals AS (
         SELECT rh.id AS round_id, uv.value AS uv_val, val.v AS rv_val
         FROM round_history rh
         JOIN user_votes uv ON uv.round_id = rh.id AND uv.user_id = $1
         CROSS JOIN LATERAL (SELECT value AS v FROM jsonb_each_text(rh.votes)) val
       ),
       modes AS (
         SELECT round_id, rv_val,
           ROW_NUMBER() OVER (PARTITION BY round_id ORDER BY COUNT(*) DESC) AS rn
         FROM vote_vals GROUP BY round_id, rv_val
       )
       SELECT
         COUNT(*) FILTER (WHERE uv_val = modes.rv_val AND modes.rn = 1)::int AS consensus_rounds,
         COUNT(DISTINCT uv.round_id)::int AS total_rounds
       FROM user_votes uv
       JOIN modes ON modes.round_id = uv.round_id
       WHERE uv.user_id = $1`,
      [userId]
    ),
    db.query(
      `WITH days AS (
         SELECT DISTINCT DATE(created_at AT TIME ZONE 'UTC') AS d
         FROM user_votes WHERE user_id = $1
       ),
       grouped AS (
         SELECT d, d - (ROW_NUMBER() OVER (ORDER BY d))::int AS grp FROM days
       ),
       streaks AS (
         SELECT COUNT(*)::int AS len, MAX(d) AS last_day FROM grouped GROUP BY grp
       )
       SELECT
         COALESCE(MAX(len), 0)::int AS max_streak
       FROM streaks`,
      [userId]
    ),
    db.query(
      `SELECT COUNT(DISTINCT r.method)::int AS count
       FROM user_votes uv
       JOIN rooms r ON r.id = uv.room_id
       WHERE uv.user_id = $1`,
      [userId]
    ),
    db.query(
      `SELECT COALESCE(MAX(cnt), 0)::int AS max_day_rounds
       FROM (
         SELECT COUNT(*)::int AS cnt
         FROM user_votes WHERE user_id = $1
         GROUP BY DATE(created_at AT TIME ZONE 'UTC')
       ) sub`,
      [userId]
    ),
    db.query(
      'SELECT COUNT(*)::int AS spectator_sessions FROM user_spectator_sessions WHERE user_id = $1',
      [userId]
    ).catch(() => ({ rows: [{ spectator_sessions: 0 }] })),
    db.query(
      'SELECT COUNT(*)::int AS total_reactions FROM user_reactions WHERE user_id = $1',
      [userId]
    ).catch(() => ({ rows: [{ total_reactions: 0 }] })),
  ]);

  return {
    summary:          summary.rows[0],
    distribution:     distribution.rows,
    consensus:        consensus.rows[0],
    streak:           streaks.rows[0],
    methodsCount:     methods.rows[0].count,
    maxDayRounds:     maxDay.rows[0].max_day_rounds,
    spectatorSessions: spectatorRows.rows[0].spectator_sessions,
    totalReactions:   reactionRows.rows[0].total_reactions,
  };
}

// Returns newly earned badge IDs for userId. Never throws.
async function evaluateBadgesForUser(userId) {
  try {
    const [stats, alreadyEarned] = await Promise.all([
      fetchStatsForUser(userId),
      getEarnedBadgeIds(userId),
    ]);

    const candidates = BADGE_UNLOCK_FNS
      .filter(({ id, unlock }) => !alreadyEarned.has(id) && unlock(stats))
      .map(({ id }) => id);

    if (!candidates.length) return [];

    return await insertNewBadges(userId, candidates);
  } catch (err) {
    console.error('[badges] Evaluation error for user', userId, err.message);
    return [];
  }
}

module.exports = { evaluateBadgesForUser };
