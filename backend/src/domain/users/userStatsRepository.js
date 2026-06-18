const db = require('../../config/database');

// Shared SQL fragments reused by badge evaluation and the stats API endpoint.

const CONSENSUS_SQL = `
  WITH vote_vals AS (
    SELECT rh.id AS round_id, val.v AS vote_val
    FROM round_history rh
    JOIN user_votes uv ON uv.round_id = rh.id AND uv.user_id = $1
    CROSS JOIN LATERAL (SELECT value AS v FROM jsonb_each_text(rh.votes)) val
  ),
  modes AS (
    SELECT round_id, vote_val,
      ROW_NUMBER() OVER (PARTITION BY round_id ORDER BY COUNT(*) DESC, vote_val) AS rn
    FROM vote_vals GROUP BY round_id, vote_val
  )
  SELECT
    COUNT(*) FILTER (WHERE uv.value = m.vote_val)::int AS consensus_rounds,
    COUNT(*)::int AS total_rounds
  FROM user_votes uv
  JOIN modes m ON m.round_id = uv.round_id AND m.rn = 1
  WHERE uv.user_id = $1`;

const STREAK_SQL = `
  WITH days AS (
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
    MAX(len)::int AS max_streak,
    COALESCE((SELECT len FROM streaks ORDER BY last_day DESC LIMIT 1), 0)::int AS current_streak
  FROM streaks`;

/**
 * Fetches the stats subset required for badge evaluation.
 * Also consumed by the /api/users/stats endpoint to avoid duplicate queries.
 */
async function fetchBadgeStats(userId) {
  const [summary, distribution, consensus, streak, methods, maxDay, spectator, reactions] =
    await Promise.all([
      db.query(
        `SELECT COUNT(*)::int                AS total_rounds,
                COUNT(DISTINCT room_id)::int AS total_sessions,
                MIN(created_at)              AS first_vote_at
         FROM user_votes WHERE user_id = $1`,
        [userId]
      ),
      db.query(
        `SELECT value, COUNT(*)::int AS count
         FROM user_votes WHERE user_id = $1
         GROUP BY value ORDER BY count DESC`,
        [userId]
      ),
      db.query(CONSENSUS_SQL, [userId]),
      db.query(STREAK_SQL, [userId]),
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
    summary:           summary.rows[0],
    distribution:      distribution.rows,
    consensus:         consensus.rows[0],
    streak:            streak.rows[0],
    methodsCount:      methods.rows[0].count,
    maxDayRounds:      maxDay.rows[0].max_day_rounds,
    spectatorSessions: spectator.rows[0].spectator_sessions,
    totalReactions:    reactions.rows[0].total_reactions,
  };
}

module.exports = { fetchBadgeStats };
