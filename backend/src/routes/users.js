const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authMiddleware } = require('../auth/middleware');

// ── GET /api/users/stats ──────────────────────────────────────────────────────
// Returns personal voting statistics for the authenticated user.

router.get('/stats', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  try {
    // Summary: total rounds, total unique rooms, first vote date
    const { rows: summary } = await db.query(
      `SELECT
         COUNT(*)::int                  AS total_rounds,
         COUNT(DISTINCT room_id)::int   AS total_sessions,
         MIN(created_at)                AS first_vote_at
       FROM user_votes
       WHERE user_id = $1`,
      [userId]
    );

    // Vote distribution: how often each value was chosen
    const { rows: distribution } = await db.query(
      `SELECT value, COUNT(*)::int AS count
       FROM user_votes
       WHERE user_id = $1
       GROUP BY value
       ORDER BY count DESC`,
      [userId]
    );

    // Activity: rounds per day for last 90 days
    const { rows: activity } = await db.query(
      `SELECT DATE(created_at AT TIME ZONE 'UTC')::text AS day,
              COUNT(*)::int AS rounds
       FROM user_votes
       WHERE user_id = $1
         AND created_at > NOW() - INTERVAL '90 days'
       GROUP BY day
       ORDER BY day`,
      [userId]
    );

    // Activity by hour-of-day (UTC) — for "most active time" insight
    const { rows: byHour } = await db.query(
      `SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC')::int AS hour,
              COUNT(*)::int AS count
       FROM user_votes
       WHERE user_id = $1
       GROUP BY hour
       ORDER BY hour`,
      [userId]
    );

    res.json({
      summary: summary[0],
      distribution,
      activity,
      byHour,
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Kon statistieken niet ophalen' });
  }
});

module.exports = router;
