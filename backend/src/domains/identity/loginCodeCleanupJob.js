const cron = require('node-cron');
const { deleteExpiredCodes } = require('./loginCodeRepository');

// Hourly — removes expired email 2FA codes.
const SCHEDULE = '17 * * * *';

function register() {
  return cron.schedule(SCHEDULE, async () => {
    try {
      const removed = await deleteExpiredCodes();
      if (removed) console.log(`[jobs:login-code-cleanup] Removed ${removed} expired login codes`);
    } catch (err) {
      console.error('[jobs:login-code-cleanup] Error during cleanup:', err);
    }
  });
}

module.exports = { register };
