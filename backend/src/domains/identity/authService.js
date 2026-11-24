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
const { createLogger, maskEmail } = require('../../shared/logger');

const log = createLogger('auth');

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
    if (isUniqueViolation(err)) {
      log.info('Registratie geweigerd: e-mailadres al in gebruik', { email: maskEmail(email) });
      throw conflict('EMAIL_IN_USE', 'E-mailadres is al in gebruik');
    }
    throw err;
  }

  log.info('Account aangemaakt', { user: user.id, method: 'password', email: maskEmail(email) });
  await sendVerificationEmail(user, verificationToken);
  return { requiresVerification: true };
}

// Always succeeds from the caller's point of view, to prevent email enumeration.
async function resendVerification(email) {
  if (!email) throw badRequest('EMAIL_REQUIRED', 'E-mail is verplicht');

  const user = await users.findVerificationState(email);
  if (!user || user.email_verified) return;

  const token = crypto.randomUUID();
  log.info('Verificatiemail opnieuw verstuurd', { user: user.id });
  await users.setVerificationToken(user.id, token);
  await sendVerificationEmail(user, token);
}

async function verifyEmail(token) {
  if (!token) throw badRequest('TOKEN_MISSING', 'Token ontbreekt');
  const user = await users.verifyEmailByToken(token);
  if (!user) {
    log.info('E-mailverificatie mislukt: ongeldig of verlopen token');
    throw badRequest('TOKEN_INVALID', 'Ongeldig of verlopen token');
  }
  log.info('E-mailadres bevestigd', { user: user.id });
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
  const failed = (reason, fields = {}) =>
    log.warn('Inloggen mislukt', { method: 'password', reason, email: maskEmail(email), ...fields });
  if (!user) {
    failed('unknown-email');
    throw invalidCredentials();
  }
  if (!user.password_hash) {
    failed('oauth-account', { user: user.id });
    throw unauthorized('OAUTH_ACCOUNT', 'Dit account gebruikt OAuth-login');
  }
  if (!(await bcrypt.compare(password, user.password_hash))) {
    failed('wrong-password', { user: user.id });
    throw invalidCredentials();
  }
  if (!user.email_verified) {
    log.info('Inloggen geweigerd: e-mailadres nog niet bevestigd', { user: user.id });
    throw forbidden('EMAIL_NOT_VERIFIED', 'E-mail nog niet geverifieerd');
  }

  // eslint-disable-next-line no-unused-vars
  const { password_hash, totp_enabled, email_2fa_enabled, email_verified, ...safeUser } = user;

  if (totp_enabled) {
    log.info('Wachtwoord juist, wacht op TOTP-code', { user: user.id });
    return { user: safeUser, preAuthToken: signPreAuthToken(user.id), requiresTotp: true };
  }

  if (email_2fa_enabled) {
    log.info('Wachtwoord juist, inlogcode per e-mail verstuurd', { user: user.id });
    const code = crypto.randomInt(100000, 1000000).toString();
    await loginCodes.createCode(user.id, code, LOGIN_CODE_MINUTES);
    await sendLoginCodeEmail(user, code);
    return {
      user: safeUser,
      preAuthToken: signPreAuthToken(user.id, `${LOGIN_CODE_MINUTES}m`),
      requiresEmail2fa: true,
    };
  }

  log.info('Ingelogd', { user: user.id, method: 'password' });
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
  log.warn('Tweede inlogstap mislukt', { reason: 'preauth-invalid' });
  throw unauthorized('PREAUTH_INVALID', 'Ongeldig of verlopen token');
}

function requireTokenAndCode(preAuthToken, code) {
  if (!preAuthToken || !code) throw badRequest('TOKEN_AND_CODE_REQUIRED', 'Token en code zijn verplicht');
}

async function completeTotpLogin({ preAuthToken, code }) {
  requireTokenAndCode(preAuthToken, code);
  const userId = preAuthUserId(preAuthToken);

  const user = await users.findTotpState(userId);
  if (!user || !user.totp_enabled) {
    log.warn('Tweede inlogstap mislukt', { method: 'totp', reason: 'totp-not-enabled', user: userId });
    throw unauthorized('INVALID_REQUEST', 'Ongeldige aanvraag');
  }
  if (!verifyTotpCode(user.totp_secret, code)) {
    log.warn('Tweede inlogstap mislukt', { method: 'totp', reason: 'wrong-code', user: userId });
    throw unauthorized('INVALID_CODE', 'Ongeldige code');
  }

  log.info('Ingelogd', { user: userId, method: 'password+totp' });
  return { token: signSessionToken(user) };
}

async function completeEmailCodeLogin({ preAuthToken, code }) {
  requireTokenAndCode(preAuthToken, code);
  const userId = preAuthUserId(preAuthToken);

  if (!(await loginCodes.consumeCode(userId, code))) {
    log.warn('Tweede inlogstap mislukt', { method: 'email-code', reason: 'wrong-or-expired-code', user: userId });
    throw unauthorized('CODE_INVALID_OR_EXPIRED', 'Ongeldige of verlopen code');
  }
  const user = await users.findSessionUser(userId);
  if (!user) throw unauthorized('INVALID_REQUEST', 'Ongeldige aanvraag');
  log.info('Ingelogd', { user: userId, method: 'password+email-code' });
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
