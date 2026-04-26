const db = require('../../config/database');
const { sign } = require('../jwt');

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

function isConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function getAuthUrl(state, redirectUri) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
  });
  return `${GOOGLE_AUTH_URL}?${params}`;
}

async function handleCallback(code, redirectUri) {
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const tokens = await tokenRes.json();
  if (!tokens.access_token) throw new Error('Google OAuth mislukt');

  const infoRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const profile = await infoRes.json();

  const { rows: existing } = await db.query(
    `SELECT id, name, email, plan FROM users WHERE oauth_provider = 'google' AND oauth_id = $1`,
    [profile.sub]
  );

  let user;
  if (existing.length) {
    user = existing[0];
    await db.query(
      `UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2`,
      [profile.name, user.id]
    );
    user.name = profile.name;
  } else {
    const { rows } = await db.query(
      `INSERT INTO users (name, email, oauth_provider, oauth_id)
       VALUES ($1, $2, 'google', $3)
       RETURNING id, name, email, plan`,
      [profile.name, profile.email, profile.sub]
    );
    user = rows[0];
  }

  return { user, token: sign({ id: user.id, name: user.name, plan: user.plan }) };
}

module.exports = { isConfigured, getAuthUrl, handleCallback };
