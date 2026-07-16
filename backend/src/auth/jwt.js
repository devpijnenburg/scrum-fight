const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'changeme_not_for_production';

function sign(payload, options = {}) {
  return jwt.sign(payload, SECRET, { expiresIn: '7d', ...options });
}

function verify(token) {
  return jwt.verify(token, SECRET);
}

// Full session token issued after successful authentication.
function signSessionToken(user) {
  return sign({ id: user.id, name: user.name, plan: user.plan, is_admin: user.is_admin });
}

// Short-lived token issued between password/OAuth success and 2FA verification.
function signPreAuthToken(userId, expiresIn = '5m') {
  return sign({ id: userId, preAuth: true }, { expiresIn });
}

module.exports = { sign, verify, signSessionToken, signPreAuthToken };
