const db = require('../../config/database');
const { signSessionToken, signPreAuthToken } = require('../jwt');

// Shared logic for OAuth strategies (Google, GitHub, …).

// Finds the user linked to this OAuth account (refreshing their display
// name from the provider profile) or creates a new account.
async function upsertOAuthUser(provider, oauthId, { name, email }) {
  const { rows: existing } = await db.query(
    `SELECT id, name, email, plan, is_admin, totp_enabled FROM users
     WHERE oauth_provider = $1 AND oauth_id = $2`,
    [provider, oauthId]
  );

  if (existing.length) {
    const user = existing[0];
    await db.query(
      `UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2`,
      [name, user.id]
    );
    user.name = name;
    return user;
  }

  const { rows } = await db.query(
    `INSERT INTO users (name, email, oauth_provider, oauth_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, email, plan, is_admin, totp_enabled`,
    [name, email, provider, oauthId]
  );
  return rows[0];
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
