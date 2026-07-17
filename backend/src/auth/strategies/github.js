const { upsertOAuthUser, buildAuthResult } = require('./oauthAccount');

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

  const user = await upsertOAuthUser('github', String(profile.id), {
    name: profile.name || profile.login,
    email: primaryEmail || profile.email,
  });
  return buildAuthResult(user);
}

module.exports = { isConfigured, getAuthUrl, handleCallback };
