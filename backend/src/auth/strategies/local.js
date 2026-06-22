const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../../config/database');
const { sign } = require('../jwt');
const { sendMail } = require('../../config/email');

async function register(name, email, password) {
  const hash = await bcrypt.hash(password, 12);
  const verificationToken = crypto.randomUUID();

  const { rows } = await db.query(
    `INSERT INTO users (name, email, password_hash, email_verification_token)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, email, plan, is_admin`,
    [name.trim(), email.toLowerCase().trim(), hash, verificationToken]
  );
  const user = rows[0];

  const baseUrl = process.env.BASE_URL || 'http://localhost';
  await sendMail(
    user.email,
    'Bevestig je e-mailadres — Scrum Fight',
    `Hoi ${user.name},\n\nKlik op de link hieronder om je e-mailadres te bevestigen:\n\n${baseUrl}/verify-email.html?token=${verificationToken}\n\nDeze link is eenmalig geldig.\n\nGroeten,\nScrum Fight`
  );

  return { requiresVerification: true };
}

async function login(email, password) {
  const { rows } = await db.query(
    `SELECT id, name, email, plan, is_admin, totp_enabled, email_2fa_enabled, email_verified, password_hash
     FROM users WHERE email = $1`,
    [email.toLowerCase().trim()]
  );
  if (!rows.length) throw new Error('Ongeldig e-mailadres of wachtwoord');

  const user = rows[0];
  if (!user.password_hash) throw new Error('Dit account gebruikt OAuth-login');

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new Error('Ongeldig e-mailadres of wachtwoord');

  if (!user.email_verified) {
    const err = new Error('E-mail nog niet geverifieerd');
    err.code = 'EMAIL_NOT_VERIFIED';
    throw err;
  }

  const { password_hash, totp_enabled, email_2fa_enabled, email_verified, ...safeUser } = user;

  if (totp_enabled) {
    const preAuthToken = sign({ id: user.id, preAuth: true }, { expiresIn: '5m' });
    return { user: safeUser, preAuthToken, requiresTotp: true };
  }

  if (email_2fa_enabled) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await db.query(
      `INSERT INTO email_2fa_codes (user_id, code, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '10 minutes')`,
      [user.id, code]
    );
    await sendMail(
      user.email,
      'Je inlogcode — Scrum Fight',
      `Hoi ${user.name},\n\nJe inlogcode is: ${code}\n\nDeze code is 10 minuten geldig.\n\nGroeten,\nScrum Fight`
    );
    const preAuthToken = sign({ id: user.id, preAuth: true }, { expiresIn: '10m' });
    return { user: safeUser, preAuthToken, requiresEmail2fa: true };
  }

  return {
    user: safeUser,
    token: sign({ id: safeUser.id, name: safeUser.name, plan: safeUser.plan, is_admin: safeUser.is_admin }),
  };
}

module.exports = { register, login };
