const db = require('../../shared/database');

// One-time email login codes (table `email_2fa_codes`).

async function createCode(userId, code, validMinutes = 10) {
  await db.query(
    `INSERT INTO email_2fa_codes (user_id, code, expires_at)
     VALUES ($1, $2, NOW() + make_interval(mins => $3))`,
    [userId, code, validMinutes]
  );
}

// Consumes a valid code; returns true when it existed and had not expired.
async function consumeCode(userId, code) {
  const { rows } = await db.query(
    `DELETE FROM email_2fa_codes
     WHERE user_id = $1 AND code = $2 AND expires_at > NOW()
     RETURNING user_id`,
    [userId, code]
  );
  return rows.length > 0;
}

async function deleteExpiredCodes() {
  const { rowCount } = await db.query('DELETE FROM email_2fa_codes WHERE expires_at < NOW()');
  return rowCount;
}

module.exports = { createCode, consumeCode, deleteExpiredCodes };
