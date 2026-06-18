const db = require('../../config/database');

async function getEarnedBadgeIds(userId) {
  const { rows } = await db.query(
    'SELECT badge_id FROM user_badges WHERE user_id = $1',
    [userId]
  );
  return new Set(rows.map((r) => r.badge_id));
}

async function insertNewBadges(userId, badgeIds) {
  if (!badgeIds.length) return [];
  const { rows } = await db.query(
    `INSERT INTO user_badges (user_id, badge_id)
     SELECT $1, unnest($2::text[])
     ON CONFLICT (user_id, badge_id) DO NOTHING
     RETURNING badge_id`,
    [userId, badgeIds]
  );
  return rows.map((r) => r.badge_id);
}

async function getRecentBadges(userId, limit = 20) {
  const { rows } = await db.query(
    `SELECT badge_id, earned_at
     FROM user_badges
     WHERE user_id = $1
     ORDER BY earned_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return rows;
}

module.exports = { getEarnedBadgeIds, insertNewBadges, getRecentBadges };
