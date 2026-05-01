const { verify } = require('./jwt');
const db = require('../config/database');

async function getUserFromToken(token) {
  const payload = verify(token);
  const { rows } = await db.query(
    'SELECT id, name, plan FROM users WHERE id = $1',
    [payload.id]
  );
  return rows[0] || null;
}

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const user = await getUserFromToken(header.slice(7));
    if (!user) return res.status(401).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

async function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      req.user = await getUserFromToken(header.slice(7));
    } catch {
      // ignore invalid tokens — treat as unauthenticated
    }
  }
  next();
}

module.exports = { authMiddleware, optionalAuth };
