const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authMiddleware } = require('../auth/middleware');

// ── GET /api/users/stats ──────────────────────────────────────────────────────

router.get('/stats', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  try {
    const [summary, distribution, activity, byHour, consensus, streaks, methods, maxDay,
           sessions, consensusStreak, teamComparison] =
      await Promise.all([

        // Summary totals
        db.query(
          `SELECT
             COUNT(*)::int                AS total_rounds,
             COUNT(DISTINCT room_id)::int AS total_sessions,
             MIN(created_at)              AS first_vote_at
           FROM user_votes WHERE user_id = $1`,
          [userId]
        ),

        // Vote distribution
        db.query(
          `SELECT value, COUNT(*)::int AS count
           FROM user_votes WHERE user_id = $1
           GROUP BY value ORDER BY count DESC`,
          [userId]
        ),

        // Activity last 90 days
        db.query(
          `SELECT DATE(created_at AT TIME ZONE 'UTC')::text AS day,
                  COUNT(*)::int AS rounds
           FROM user_votes
           WHERE user_id = $1 AND created_at > NOW() - INTERVAL '90 days'
           GROUP BY day ORDER BY day`,
          [userId]
        ),

        // Active hours
        db.query(
          `SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC')::int AS hour,
                  COUNT(*)::int AS count
           FROM user_votes WHERE user_id = $1
           GROUP BY hour ORDER BY hour`,
          [userId]
        ),

        // Consensus rate — how often user voted same as round mode
        db.query(
          `WITH vote_vals AS (
             SELECT rh.id AS round_id, val.v AS vote_val
             FROM round_history rh
             JOIN user_votes uv ON uv.round_id = rh.id AND uv.user_id = $1
             CROSS JOIN LATERAL (SELECT value AS v FROM jsonb_each_text(rh.votes)) val
           ),
           modes AS (
             SELECT round_id, vote_val,
               ROW_NUMBER() OVER (PARTITION BY round_id ORDER BY COUNT(*) DESC) AS rn
             FROM vote_vals GROUP BY round_id, vote_val
           )
           SELECT
             COUNT(*) FILTER (WHERE uv.value = m.vote_val)::int AS consensus_rounds,
             COUNT(*)::int AS total_rounds
           FROM user_votes uv
           JOIN modes m ON m.round_id = uv.round_id AND m.rn = 1
           WHERE uv.user_id = $1`,
          [userId]
        ),

        // Longest and current active-day streak
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
             MAX(len)::int AS max_streak,
             COALESCE((SELECT len FROM streaks ORDER BY last_day DESC LIMIT 1), 0)::int AS current_streak
           FROM streaks`,
          [userId]
        ),

        // Distinct estimation methods used
        db.query(
          `SELECT COUNT(DISTINCT r.method)::int AS count
           FROM user_votes uv
           JOIN rooms r ON r.id = uv.room_id
           WHERE uv.user_id = $1`,
          [userId]
        ),

        // Max rounds in a single day (Speedrunner badge)
        db.query(
          `SELECT COALESCE(MAX(cnt), 0)::int AS max_day_rounds
           FROM (
             SELECT COUNT(*)::int AS cnt
             FROM user_votes WHERE user_id = $1
             GROUP BY DATE(created_at AT TIME ZONE 'UTC')
           ) sub`,
          [userId]
        ),

        // Last 10 sessions
        db.query(
          `SELECT r.id                AS room_id,
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
           LIMIT 10`,
          [userId]
        ),

        // Consensus streak — consecutive rounds where user voted with the majority
        db.query(
          `WITH ranked AS (
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
           FROM streaks`,
          [userId]
        ),

        // Team comparison — user avg vs team avg on numeric rounds
        db.query(
          `WITH numeric_rounds AS (
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
           WHERE user_num IS NOT NULL AND team_avg IS NOT NULL`,
          [userId]
        ),
      ]);

    res.json({
      summary:          summary.rows[0],
      distribution:     distribution.rows,
      activity:         activity.rows,
      byHour:           byHour.rows,
      consensus:        consensus.rows[0],
      streak:           streaks.rows[0],
      methodsCount:     methods.rows[0].count,
      maxDayRounds:     maxDay.rows[0].max_day_rounds,
      sessions:         sessions.rows,
      consensusStreak:  consensusStreak.rows[0],
      teamComparison:   teamComparison.rows[0],
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Kon statistieken niet ophalen' });
  }
});

module.exports = router;
