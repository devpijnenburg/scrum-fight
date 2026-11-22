// /api/users/badges — badges earned by the logged-in user.

const express = require('express');
const { authMiddleware } = require('../identity/middleware');
const { getEarnedBadgeIds, getRecentBadges } = require('./badgeRepository');

const router = express.Router();
const MAX_RECENT = 50;

router.get('/badges', authMiddleware, async (req, res) => {
  const earned = await getEarnedBadgeIds(req.user.id);
  res.json({ badgeIds: [...earned] });
});

router.get('/badges/recent', authMiddleware, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, MAX_RECENT);
  res.json(await getRecentBadges(req.user.id, limit));
});

module.exports = router;
