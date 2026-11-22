const { verify } = require('./jwt');
const users = require('./userRepository');
const { unauthorized, forbidden } = require('../../shared/errors');

function bearerToken(req) {
  const header = req.headers.authorization;
  return header && header.startsWith('Bearer ') ? header.slice(7) : null;
}

// Resolves the user for a session token; null when invalid, expired or the
// user no longer exists. The DB is always consulted, so plan or admin
// changes apply immediately even though the JWT carries stale copies.
async function userFromToken(token) {
  let payload;
  try {
    payload = verify(token);
  } catch {
    return null;
  }
  if (payload.preAuth) return null; // a 2FA pre-auth token is not a session
  return users.findAuthUser(payload.id);
}

async function authMiddleware(req, res, next) {
  const token = bearerToken(req);
  if (!token) return next(unauthorized('UNAUTHORIZED', 'Unauthorized'));
  const user = await userFromToken(token);
  if (!user) return next(unauthorized('SESSION_INVALID', 'Invalid or expired token'));
  req.user = user;
  next();
}

// Attaches req.user when a valid token is present; never rejects.
async function optionalAuth(req, res, next) {
  const token = bearerToken(req);
  if (token) {
    try {
      req.user = (await userFromToken(token)) || undefined;
    } catch {
      // treat as unauthenticated
    }
  }
  next();
}

async function requireAdmin(req, res, next) {
  await authMiddleware(req, res, (err) => {
    if (err) return next(err);
    if (!req.user.is_admin) return next(forbidden('FORBIDDEN', 'Toegang geweigerd'));
    next();
  });
}

module.exports = { authMiddleware, optionalAuth, requireAdmin };
