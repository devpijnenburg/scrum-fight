// /api/users/stats — personal statistics of the logged-in user.

const express = require('express');
const { authMiddleware } = require('../identity/middleware');
const { fetchUserStats } = require('./statsRepository');

const router = express.Router();

router.get('/stats', authMiddleware, async (req, res) => {
  res.json(await fetchUserStats(req.user.id));
});

module.exports = router;
