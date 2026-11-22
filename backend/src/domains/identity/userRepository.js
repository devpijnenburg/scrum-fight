const db = require('../../shared/database');

// All persistence for user accounts (table `users`).

const normalizeEmail = (email) => String(email).toLowerCase().trim();

// ── Lookups ─────────────────────────────────────────────────────────────────

// Public identity used in rooms.
async function findById(id) {
  const { rows } = await db.query('SELECT id, name, emoticon FROM users WHERE id = $1', [id]);
  return rows[0] || null;
}

// Identity attached to authenticated requests.
async function findAuthUser(id) {
  const { rows } = await db.query(
    'SELECT id, name, plan, is_admin, totp_enabled FROM users WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

// Fields needed to sign a session token.
async function findSessionUser(id) {
  const { rows } = await db.query('SELECT id, name, plan, is_admin FROM users WHERE id = $1', [id]);
  return rows[0] || null;
}

async function findProfile(id) {
  const { rows } = await db.query(
    `SELECT id, name, email, plan, is_admin, totp_enabled, oauth_provider, emoticon, created_at
     FROM users WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function findContact(id) {
  const { rows } = await db.query('SELECT email, name FROM users WHERE id = $1', [id]);
  return rows[0] || null;
}

async function findIdByEmail(email) {
  const { rows } = await db.query('SELECT id FROM users WHERE email = $1', [normalizeEmail(email)]);
  return rows[0]?.id ?? null;
}

async function getPlan(id) {
  const { rows } = await db.query('SELECT plan FROM users WHERE id = $1', [id]);
  return rows[0]?.plan ?? 'free';
}

// ── Password accounts ───────────────────────────────────────────────────────

async function createLocalUser({ name, email, passwordHash, verificationToken }) {
  const { rows } = await db.query(
    `INSERT INTO users (name, email, password_hash, email_verification_token)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, email, plan, is_admin`,
    [name.trim(), normalizeEmail(email), passwordHash, verificationToken]
  );
  return rows[0];
}

async function findLoginCandidate(email) {
  const { rows } = await db.query(
    `SELECT id, name, email, plan, is_admin, totp_enabled, email_2fa_enabled, email_verified, password_hash
     FROM users WHERE email = $1`,
    [normalizeEmail(email)]
  );
  return rows[0] || null;
}

async function findVerificationState(email) {
  const { rows } = await db.query(
    'SELECT id, name, email, email_verified FROM users WHERE email = $1',
    [normalizeEmail(email)]
  );
  return rows[0] || null;
}

async function setVerificationToken(id, token) {
  await db.query(
    'UPDATE users SET email_verification_token = $1, updated_at = NOW() WHERE id = $2',
    [token, id]
  );
}

// Marks the account with this one-time token as verified; returns the user or null.
async function verifyEmailByToken(token) {
  const { rows } = await db.query(
    `UPDATE users
     SET email_verified = true, email_verification_token = NULL, updated_at = NOW()
     WHERE email_verification_token = $1
     RETURNING id, name, email, plan, is_admin`,
    [token]
  );
  return rows[0] || null;
}

// ── Two-factor settings ─────────────────────────────────────────────────────

async function findTotpState(id) {
  const { rows } = await db.query(
    'SELECT id, name, plan, is_admin, totp_secret, totp_enabled FROM users WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

async function findTwoFactorFlags(id) {
  const { rows } = await db.query(
    'SELECT totp_enabled, email_2fa_enabled FROM users WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

async function enableTotp(id, secret) {
  await db.query(
    'UPDATE users SET totp_secret = $1, totp_enabled = true, updated_at = NOW() WHERE id = $2',
    [secret, id]
  );
}

async function disableTotp(id) {
  await db.query(
    'UPDATE users SET totp_secret = NULL, totp_enabled = false, updated_at = NOW() WHERE id = $1',
    [id]
  );
}

async function setEmail2fa(id, enabled) {
  await db.query(
    'UPDATE users SET email_2fa_enabled = $1, updated_at = NOW() WHERE id = $2',
    [enabled, id]
  );
}

// ── Profile ─────────────────────────────────────────────────────────────────

async function getEmoticon(id) {
  const { rows } = await db.query('SELECT emoticon FROM users WHERE id = $1', [id]);
  return rows[0]?.emoticon || null;
}

async function setEmoticon(id, emoticon) {
  await db.query('UPDATE users SET emoticon = $1, updated_at = NOW() WHERE id = $2', [emoticon, id]);
}

// ── OAuth accounts ──────────────────────────────────────────────────────────

async function findByOAuth(provider, oauthId) {
  const { rows } = await db.query(
    `SELECT id, name, email, plan, is_admin, totp_enabled FROM users
     WHERE oauth_provider = $1 AND oauth_id = $2`,
    [provider, oauthId]
  );
  return rows[0] || null;
}

async function updateName(id, name) {
  await db.query('UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2', [name, id]);
}

async function createOAuthUser({ provider, oauthId, name, email }) {
  const { rows } = await db.query(
    `INSERT INTO users (name, email, oauth_provider, oauth_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, email, plan, is_admin, totp_enabled`,
    [name, email, provider, oauthId]
  );
  return rows[0];
}

module.exports = {
  findById,
  findAuthUser,
  findSessionUser,
  findProfile,
  findContact,
  findIdByEmail,
  getPlan,
  createLocalUser,
  findLoginCandidate,
  findVerificationState,
  setVerificationToken,
  verifyEmailByToken,
  findTotpState,
  findTwoFactorFlags,
  enableTotp,
  disableTotp,
  setEmail2fa,
  getEmoticon,
  setEmoticon,
  findByOAuth,
  updateName,
  createOAuthUser,
};
