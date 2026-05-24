const { authMiddleware } = require('./middleware');

async function requireAdmin(req, res, next) {
  await new Promise((resolve) => authMiddleware(req, res, resolve));
  if (res.headersSent) return;
  if (!req.user?.is_admin) return res.status(403).json({ error: 'Toegang geweigerd' });
  next();
}

module.exports = { requireAdmin };
