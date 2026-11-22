// Account authentication: registration, password login, email
// verification and the second login step (TOTP or email code).

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const users = require('./userRepository');
const loginCodes = require('./loginCodeRepository');
const { signSessionToken, signPreAuthToken, verify } = require('./jwt');
const { verifyTotpCode } = require('./totp');
const { sendVerificationEmail, sendLoginCodeEmail } = require('./userMailer');
const { badRequest, unauthorized, forbidden, conflict, notFound, isUniqueViolation } = require('../../shared/errors');

const MIN_PASSWORD_LENGTH = 8;
const LOGIN_CODE_MINUTES = 10;

// ── Registration & verification ─────────────────────────────────────────────

async function register({ name, email, password }) {
  if (!name || !email || !password) {
    throw badRequest('REGISTER_FIELDS_REQUIRED', 'Naam, e-mail en wachtwoord zijn verplicht');
  }
  if (String(password).length < MIN_PASSWORD_LENGTH) {
    throw badRequest('PASSWORD_TOO_SHORT', 'Wachtwoord moet minimaal 8 tekens bevatten');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const verificationToken = crypto.randomUUID();
  let user;
  try {
    user = await users.createLocalUser({ name, email, passwordHash, verificationToken });
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict('EMAIL_IN_USE', 'E-mailadres is al in gebruik');
    throw err;
  }

  await sendVerificationEmail(user, verificationToken);
  return { requiresVerification: true };
}

// Always succeeds from the caller's point of view, to prevent email enumeration.
async function resendVerification(email) {
  if (!email) throw badRequest('EMAIL_REQUIRED', 'E-mail is verplicht');

  const user = await users.findVerificationState(email);
  if (!user || user.email_verified) return;

  const token = crypto.randomUUID();
  await users.setVerificationToken(user.id, token);
  await sendVerificationEmail(user, token);
}

async function verifyEmail(token) {
  if (!token) throw badRequest('TOKEN_MISSING', 'Token ontbreekt');
  const user = await users.verifyEmailByToken(token);
  if (!user) throw badRequest('TOKEN_INVALID', 'Ongeldig of verlopen token');
  return { token: signSessionToken(user), user };
}

// ── Login ───────────────────────────────────────────────────────────────────

const invalidCredentials = () => unauthorized('INVALID_CREDENTIALS', 'Ongeldig e-mailadres of wachtwoord');

// Returns one of:
//   { user, token }                                   — logged in
//   { user, preAuthToken, requiresTotp: true }        — TOTP step next
//   { user, preAuthToken, requiresEmail2fa: true }    — email code sent
async function login({ email, password }) {
  if (!email || !password) {
    throw badRequest('LOGIN_FIELDS_REQUIRED', 'E-mail en wachtwoord zijn verplicht');
  }

  const user = await users.findLoginCandidate(email);
  if (!user) throw invalidCredentials();
  if (!user.password_hash) throw unauthorized('OAUTH_ACCOUNT', 'Dit account gebruikt OAuth-login');
  if (!(await bcrypt.compare(password, user.password_hash))) throw invalidCredentials();
  if (!user.email_verified) throw forbidden('EMAIL_NOT_VERIFIED', 'E-mail nog niet geverifieerd');

  // eslint-disable-next-line no-unused-vars
  const { password_hash, totp_enabled, email_2fa_enabled, email_verified, ...safeUser } = user;

  if (totp_enabled) {
    return { user: safeUser, preAuthToken: signPreAuthToken(user.id), requiresTotp: true };
  }

  if (email_2fa_enabled) {
    const code = crypto.randomInt(100000, 1000000).toString();
    await loginCodes.createCode(user.id, code, LOGIN_CODE_MINUTES);
    await sendLoginCodeEmail(user, code);
    return {
      user: safeUser,
      preAuthToken: signPreAuthToken(user.id, `${LOGIN_CODE_MINUTES}m`),
      requiresEmail2fa: true,
    };
  }

  return { user: safeUser, token: signSessionToken(safeUser) };
}

// Validates the short-lived pre-auth token issued after the first login step.
function preAuthUserId(preAuthToken) {
  try {
    const payload = verify(preAuthToken);
    if (payload.preAuth) return payload.id;
  } catch {
    // fall through
  }
  throw unauthorized('PREAUTH_INVALID', 'Ongeldig of verlopen token');
}

function requireTokenAndCode(preAuthToken, code) {
  if (!preAuthToken || !code) throw badRequest('TOKEN_AND_CODE_REQUIRED', 'Token en code zijn verplicht');
}

async function completeTotpLogin({ preAuthToken, code }) {
  requireTokenAndCode(preAuthToken, code);
  const userId = preAuthUserId(preAuthToken);

  const user = await users.findTotpState(userId);
  if (!user || !user.totp_enabled) throw unauthorized('INVALID_REQUEST', 'Ongeldige aanvraag');
  if (!verifyTotpCode(user.totp_secret, code)) throw unauthorized('INVALID_CODE', 'Ongeldige code');

  return { token: signSessionToken(user) };
}

async function completeEmailCodeLogin({ preAuthToken, code }) {
  requireTokenAndCode(preAuthToken, code);
  const userId = preAuthUserId(preAuthToken);

  if (!(await loginCodes.consumeCode(userId, code))) {
    throw unauthorized('CODE_INVALID_OR_EXPIRED', 'Ongeldige of verlopen code');
  }
  const user = await users.findSessionUser(userId);
  if (!user) throw unauthorized('INVALID_REQUEST', 'Ongeldige aanvraag');
  return { token: signSessionToken(user) };
}

async function getCurrentUser(userId) {
  const profile = await users.findProfile(userId);
  if (!profile) throw notFound('USER_NOT_FOUND', 'Gebruiker niet gevonden');
  return profile;
}

// The session token carries a copy of the plan; after a plan change the
// client swaps its token for a fresh one.
async function refreshSession(userId) {
  const user = await users.findSessionUser(userId);
  if (!user) throw notFound('USER_NOT_FOUND', 'Gebruiker niet gevonden');
  return { token: signSessionToken(user) };
}

module.exports = {
  register,
  resendVerification,
  verifyEmail,
  login,
  completeTotpLogin,
  completeEmailCodeLogin,
  getCurrentUser,
  refreshSession,
};
