const { fetchBadgeStats } = require('../users/userStatsRepository');
const { BADGE_UNLOCK_FNS } = require('./badgeDefinitions');
const { getEarnedBadgeIds, insertNewBadges } = require('./badgeRepository');

/**
 * Evaluates and persists newly earned badges for a user.
 * Never throws — errors are logged and an empty array is returned.
 */
async function evaluateBadgesForUser(userId) {
  try {
    const [stats, alreadyEarned] = await Promise.all([
      fetchBadgeStats(userId),
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
