const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authMiddleware } = require('../auth/middleware');
const { getEarnedBadgeIds, getRecentBadges } = require('../domain/badges/badgeRepository');
const { fetchBadgeStats } = require('../domain/users/userStatsRepository');

// ── GET /api/users/stats ──────────────────────────────────────────────────────

router.get('/stats', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  try {
    // Run the badge-stats queries (shared with badge evaluation) in parallel
    // with the 5 additional queries that only the stats page needs.
    const [badgeStats, activity, byHour, sessions, consensusStreak, teamComparison] =
      await Promise.all([

        fetchBadgeStats(userId),

        // Activity last 90 days (heatmap)
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

        // Consecutive consensus streak
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

    const { summary, distribution, consensus, streak, methodsCount, maxDayRounds,
            spectatorSessions, totalReactions, hostedSessions } = badgeStats;

    res.json({
      summary,
      distribution,
      activity:          activity.rows,
      byHour:            byHour.rows,
      consensus,
      streak,
      methodsCount,
      maxDayRounds,
      sessions:          sessions.rows,
      consensusStreak:   consensusStreak.rows[0],
      spectatorSessions,
      totalReactions,
      hostedSessions,
      teamComparison:    teamComparison.rows[0],
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Kon statistieken niet ophalen' });
  }
});

// ── GET /api/users/badges ─────────────────────────────────────────────────────

router.get('/badges', authMiddleware, async (req, res) => {
  try {
    const earned = await getEarnedBadgeIds(req.user.id);
    res.json({ badgeIds: [...earned] });
  } catch (err) {
    console.error('Badges fetch error:', err);
    res.status(500).json({ error: 'Kon badges niet ophalen' });
  }
});

// ── GET /api/users/badges/recent ──────────────────────────────────────────────

router.get('/badges/recent', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const rows = await getRecentBadges(req.user.id, limit);
    res.json(rows);
  } catch (err) {
    console.error('Recent badges fetch error:', err);
    res.status(500).json({ error: 'Kon recente badges niet ophalen' });
  }
});

module.exports = router;
