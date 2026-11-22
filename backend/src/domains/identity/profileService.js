// Account settings: TOTP, email 2FA and the player emoticon.

const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const users = require('./userRepository');
const { verifyTotpCode } = require('./totp');
const { badRequest } = require('../../shared/errors');

const DEFAULT_EMOTICON = '⚔️';
const MAX_EMOTICON_CHARS = 8;

// ── TOTP ────────────────────────────────────────────────────────────────────

async function startTotpSetup(userId) {
  const { base32: secret } = speakeasy.generateSecret({ length: 20 });
  const contact = await users.findContact(userId);
  const label = contact?.email || contact?.name || 'Scrum Fight';
  const otpauthUrl = speakeasy.otpauthURL({
    secret,
    label: encodeURIComponent(label),
    issuer: 'Scrum Fight',
    encoding: 'base32',
  });
  return { secret, qrDataUrl: await QRCode.toDataURL(otpauthUrl) };
}

async function enableTotp(userId, { secret, code }) {
  if (!secret || !code) throw badRequest('SECRET_AND_CODE_REQUIRED', 'Secret en code zijn verplicht');
  if (!verifyTotpCode(secret, code)) throw badRequest('INVALID_CODE_RETRY', 'Ongeldige code, probeer opnieuw');
  await users.enableTotp(userId, secret);
}

async function disableTotp(userId, { code }) {
  if (!code) throw badRequest('CODE_REQUIRED', 'Code is verplicht');
  const state = await users.findTotpState(userId);
  if (!state?.totp_enabled) throw badRequest('TOTP_NOT_ENABLED', '2FA is niet ingeschakeld');
  if (!verifyTotpCode(state.totp_secret, code)) throw badRequest('INVALID_CODE', 'Ongeldige code');
  await users.disableTotp(userId);
}

// ── Email 2FA ───────────────────────────────────────────────────────────────

async function enableEmail2fa(userId) {
  const flags = await users.findTwoFactorFlags(userId);
  if (flags?.totp_enabled) {
    throw badRequest('TOTP_ACTIVE', 'Schakel TOTP eerst uit voordat je e-mail 2FA inschakelt');
  }
  if (flags?.email_2fa_enabled) throw badRequest('EMAIL_2FA_ALREADY_ENABLED', 'E-mail 2FA is al ingeschakeld');
  await users.setEmail2fa(userId, true);
}

async function disableEmail2fa(userId) {
  const flags = await users.findTwoFactorFlags(userId);
  if (!flags?.email_2fa_enabled) throw badRequest('EMAIL_2FA_NOT_ENABLED', 'E-mail 2FA is niet ingeschakeld');
  await users.setEmail2fa(userId, false);
}

// ── Emoticon ────────────────────────────────────────────────────────────────

async function getEmoticon(userId) {
  return (await users.getEmoticon(userId)) || DEFAULT_EMOTICON;
}

async function setEmoticon(userId, emoticon) {
  if (typeof emoticon !== 'string' || !emoticon.trim()) {
    throw badRequest('EMOTICON_REQUIRED', 'Emoticon is verplicht');
  }
  const trimmed = emoticon.trim();
  if ([...trimmed].length > MAX_EMOTICON_CHARS) throw badRequest('EMOTICON_INVALID', 'Ongeldige emoticon');
  await users.setEmoticon(userId, trimmed);
  return trimmed;
}

module.exports = {
  startTotpSetup,
  enableTotp,
  disableTotp,
  enableEmail2fa,
  disableEmail2fa,
  getEmoticon,
  setEmoticon,
};
