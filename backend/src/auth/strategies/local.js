const bcrypt = require('bcryptjs');
const db = require('../../config/database');
const { sign } = require('../jwt');

async function register(name, email, password) {
  const hash = await bcrypt.hash(password, 12);
  const { rows } = await db.query(
    `INSERT INTO users (name, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, name, email, plan`,
    [name.trim(), email.toLowerCase().trim(), hash]
  );
  const user = rows[0];
  return { user, token: sign({ id: user.id, name: user.name, plan: user.plan }) };
}

async function login(email, password) {
  const { rows } = await db.query(
    `SELECT id, name, email, plan, password_hash
     FROM users WHERE email = $1`,
    [email.toLowerCase().trim()]
  );
  if (!rows.length) throw new Error('Ongeldig e-mailadres of wachtwoord');

  const user = rows[0];
  if (!user.password_hash) throw new Error('Dit account gebruikt OAuth-login');

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new Error('Ongeldig e-mailadres of wachtwoord');

  const { password_hash, ...safeUser } = user;
  return { user: safeUser, token: sign({ id: safeUser.id, name: safeUser.name, plan: safeUser.plan }) };
}

module.exports = { register, login };
