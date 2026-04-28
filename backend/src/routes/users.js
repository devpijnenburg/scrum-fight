const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authMiddleware } = require('../auth/middleware');

// ── GET /api/users/stats ──────────────────────────────────────────────────────

router.get('/stats', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  try {
    const [summary, distribution, activity, byHour, consensus, streaks, methods, maxDay] =
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
      ]);

    res.json({
      summary:      summary.rows[0],
      distribution: distribution.rows,
      activity:     activity.rows,
      byHour:       byHour.rows,
      consensus:    consensus.rows[0],
      streak:       streaks.rows[0],
      methodsCount: methods.rows[0].count,
      maxDayRounds: maxDay.rows[0].max_day_rounds,
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Kon statistieken niet ophalen' });
  }
});

module.exports = router;
