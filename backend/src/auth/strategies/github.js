const db = require('../../config/database');
const { sign } = require('../jwt');

const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';
const GITHUB_EMAILS_URL = 'https://api.github.com/user/emails';

function isConfigured() {
  return !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

function getAuthUrl(state, redirectUri) {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'read:user user:email',
    state,
  });
  return `${GITHUB_AUTH_URL}?${params}`;
}

async function handleCallback(code, redirectUri) {
  const tokenRes = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const tokens = await tokenRes.json();
  if (!tokens.access_token) throw new Error('GitHub OAuth mislukt');

  const [userRes, emailsRes] = await Promise.all([
    fetch(GITHUB_USER_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}`, 'User-Agent': 'PlanningPoker' },
    }),
    fetch(GITHUB_EMAILS_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}`, 'User-Agent': 'PlanningPoker' },
    }),
  ]);

  const profile = await userRes.json();
  const emails = await emailsRes.json();
  const primaryEmail = Array.isArray(emails)
    ? emails.find((e) => e.primary)?.email
    : null;

  const name = profile.name || profile.login;
  const email = primaryEmail || profile.email;

  const { rows: existing } = await db.query(
    `SELECT id, name, email, plan FROM users WHERE oauth_provider = 'github' AND oauth_id = $1`,
    [String(profile.id)]
  );

  let user;
  if (existing.length) {
    user = existing[0];
    await db.query(`UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2`, [name, user.id]);
    user.name = name;
  } else {
    const { rows } = await db.query(
      `INSERT INTO users (name, email, oauth_provider, oauth_id)
       VALUES ($1, $2, 'github', $3)
       RETURNING id, name, email, plan`,
      [name, email, String(profile.id)]
    );
    user = rows[0];
  }

  return { user, token: sign({ id: user.id, name: user.name, plan: user.plan }) };
}

module.exports = { isConfigured, getAuthUrl, handleCallback };
