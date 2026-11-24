const cron = require('node-cron');
const { deleteExpiredCodes } = require('./loginCodeRepository');
const { createLogger } = require('../../shared/logger');

const log = createLogger('jobs:login-code-cleanup');

// Hourly — removes expired email 2FA codes.
const SCHEDULE = '17 * * * *';

function register() {
  return cron.schedule(SCHEDULE, async () => {
    try {
      const removed = await deleteExpiredCodes();
      if (removed) log.info('Verlopen inlogcodes opgeruimd', { removed });
    } catch (err) {
      log.error('Opruimen mislukt', err);
    }
  });
}

module.exports = { register };
