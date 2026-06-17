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
  const newlyEarned = [];
  for (const badgeId of badgeIds) {
    const { rowCount } = await db.query(
      `INSERT INTO user_badges (user_id, badge_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, badge_id) DO NOTHING`,
      [userId, badgeId]
    );
    if (rowCount > 0) newlyEarned.push(badgeId);
  }
  return newlyEarned;
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
