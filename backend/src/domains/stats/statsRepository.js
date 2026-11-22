const db = require('../../shared/database');

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
  const [summary, distribution, consensus, streak, methods, maxDay, spectator, reactions, hosted] =
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
      db.query(
        'SELECT COUNT(*)::int AS hosted_sessions FROM rooms WHERE owner_id = $1',
        [userId]
      ),
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
    hostedSessions:    hosted.rows[0].hosted_sessions,
  };
}


// ── Stats-page-only queries ─────────────────────────────────────────────────

// Activity last 90 days (heatmap)
const ACTIVITY_SQL = `SELECT DATE(created_at AT TIME ZONE 'UTC')::text AS day,
                  COUNT(*)::int AS rounds
           FROM user_votes
           WHERE user_id = $1 AND created_at > NOW() - INTERVAL '90 days'
           GROUP BY day ORDER BY day`;

// Votes per hour of day
const BY_HOUR_SQL = `SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC')::int AS hour,
                  COUNT(*)::int AS count
           FROM user_votes WHERE user_id = $1
           GROUP BY hour ORDER BY hour`;

// Last 10 sessions
const SESSIONS_SQL = `SELECT r.id                AS room_id,
                  r.name              AS room_name,
                  r.method,
                  COUNT(uv.id)::int   AS rounds,
                  MAX(uv.created_at)  AS last_active,
                  (SELECT value FROM user_votes
                   WHERE user_id = $1 AND room_id = r.id
                   GROUP BY value ORDER BY COUNT(*) DESC LIMIT 1) AS fav_value
           FROM user_votes uv
           JOIN rooms r ON r.id = uv.room_id
           WHERE uv.user_id = $1
           GROUP BY r.id, r.name, r.method
           ORDER BY last_active DESC
           LIMIT 10`;

// Longest and current streak of voting with the majority
const CONSENSUS_STREAK_SQL = `WITH ranked AS (
             SELECT uv.value AS user_vote,
                    uv.created_at,
                    ROW_NUMBER() OVER (ORDER BY uv.created_at) AS rn,
                    (SELECT v FROM (
                       SELECT val.v, COUNT(*) AS c
                       FROM jsonb_each_text(rh.votes) AS val(k,v)
                       GROUP BY val.v ORDER BY c DESC LIMIT 1
                     ) sub) AS mode_vote
             FROM user_votes uv
             JOIN round_history rh ON rh.id = uv.round_id
             WHERE uv.user_id = $1
           ),
           with_flag AS (
             SELECT *, (user_vote = mode_vote) AS hit,
                    rn - ROW_NUMBER() OVER (PARTITION BY (user_vote = mode_vote) ORDER BY rn) AS grp
             FROM ranked
           ),
           streaks AS (
             SELECT COUNT(*)::int AS len, MAX(rn) AS last_rn, hit
             FROM with_flag GROUP BY grp, hit
           )
           SELECT
             COALESCE(MAX(len) FILTER (WHERE hit), 0)::int AS max_consensus_streak,
             COALESCE(
               (SELECT len FROM streaks WHERE hit ORDER BY last_rn DESC LIMIT 1), 0
             )::int AS current_consensus_streak
           FROM streaks`;

// User average vs team average on numeric rounds
const TEAM_COMPARISON_SQL = `WITH numeric_rounds AS (
             SELECT
               CASE WHEN uv.value = '½' THEN 0.5
                    WHEN uv.value ~ '^[0-9]+(\\.[0-9]*)?$' THEN uv.value::float
                    ELSE NULL END AS user_num,
               (SELECT AVG(CASE WHEN v = '½' THEN 0.5
                                WHEN v ~ '^[0-9]+(\\.[0-9]*)?$' THEN v::float
                                ELSE NULL END)
                FROM jsonb_each_text(rh.votes) AS e(k,v)
               ) AS team_avg
             FROM user_votes uv
             JOIN round_history rh ON rh.id = uv.round_id
             WHERE uv.user_id = $1
           )
           SELECT
             ROUND(AVG(user_num)::numeric, 2)::float AS user_avg,
             ROUND(AVG(team_avg)::numeric, 2)::float  AS team_avg,
             COUNT(*)::int                             AS compared_rounds
           FROM numeric_rounds
           WHERE user_num IS NOT NULL AND team_avg IS NOT NULL`;

/**
 * Everything the personal stats page shows: the badge stats plus the
 * queries only that page needs, all run in parallel.
 */
async function fetchUserStats(userId) {
  const [badgeStats, activity, byHour, sessions, consensusStreak, teamComparison] = await Promise.all([
    fetchBadgeStats(userId),
    db.query(ACTIVITY_SQL, [userId]),
    db.query(BY_HOUR_SQL, [userId]),
    db.query(SESSIONS_SQL, [userId]),
    db.query(CONSENSUS_STREAK_SQL, [userId]),
    db.query(TEAM_COMPARISON_SQL, [userId]),
  ]);

  return {
    summary:           badgeStats.summary,
    distribution:      badgeStats.distribution,
    activity:          activity.rows,
    byHour:            byHour.rows,
    consensus:         badgeStats.consensus,
    streak:            badgeStats.streak,
    methodsCount:      badgeStats.methodsCount,
    maxDayRounds:      badgeStats.maxDayRounds,
    sessions:          sessions.rows,
    consensusStreak:   consensusStreak.rows[0],
    spectatorSessions: badgeStats.spectatorSessions,
    totalReactions:    badgeStats.totalReactions,
    hostedSessions:    badgeStats.hostedSessions,
    teamComparison:    teamComparison.rows[0],
  };
}

module.exports = { fetchBadgeStats, fetchUserStats };
