const cron = require('node-cron');
const { deleteStaleGuestRooms } = require('./roomRepository');
const { createLogger } = require('../../shared/logger');

const log = createLogger('jobs:room-cleanup');

// Daily at 03:00 — deletes stale guest rooms as a safety net behind the
// real-time inactivity expiry handled by the socket layer.
const SCHEDULE = '0 3 * * *';

function register() {
  return cron.schedule(SCHEDULE, async () => {
    log.info('Opruimen van oude gastkamers gestart');
    try {
      const removed = await deleteStaleGuestRooms();
      log.info('Oude gastkamers opgeruimd', { removed });
    } catch (err) {
      log.error('Opruimen mislukt', err);
    }
  });
}

module.exports = { register };
