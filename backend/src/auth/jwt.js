const jwt = require('jsonwebtoken');

const DEV_FALLBACK_SECRET = 'changeme_not_for_production';

// Placeholder values from .env.example / docker-compose.yml that must never
// be used to sign real sessions.
const PLACEHOLDER_SECRETS = new Set([
  DEV_FALLBACK_SECRET,
  'change_this_in_production',
  'your_very_secret_key_here',
]);

// In production a real secret is mandatory; elsewhere we fall back to a
// development secret so local runs and tests work without configuration.
function resolveSecret(env = process.env) {
  const secret = env.JWT_SECRET;
  if (env.NODE_ENV === 'production' && (!secret || PLACEHOLDER_SECRETS.has(secret))) {
    throw new Error('JWT_SECRET must be set to a non-default value in production');
  }
  return secret || DEV_FALLBACK_SECRET;
}

const SECRET = resolveSecret();

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

module.exports = { sign, verify, signSessionToken, signPreAuthToken, resolveSecret };
