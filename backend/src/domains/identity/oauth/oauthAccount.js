const users = require('../userRepository');
const { signSessionToken, signPreAuthToken } = require('../jwt');

const { createLogger, maskEmail } = require('../../../shared/logger');

const log = createLogger('auth');

// Shared logic for OAuth strategies (Google, GitHub, …).

// Finds the user linked to this OAuth account (refreshing their display
// name from the provider profile) or creates a new account.
async function upsertOAuthUser(provider, oauthId, { name, email }) {
  const existing = await users.findByOAuth(provider, oauthId);
  if (existing) {
    await users.updateName(existing.id, name);
    return { ...existing, name };
  }
  const user = await users.createOAuthUser({ provider, oauthId, name, email });
  log.info('Account aangemaakt', { user: user.id, method: provider, email: maskEmail(email) });
  return user;
}

// Builds the login result: a TOTP pre-auth step when 2FA is enabled,
// otherwise a full session token.
function buildAuthResult(user) {
  if (user.totp_enabled) {
    return { user, preAuthToken: signPreAuthToken(user.id), requiresTotp: true };
  }
  return { user, token: signSessionToken(user) };
}

module.exports = { upsertOAuthUser, buildAuthResult };
