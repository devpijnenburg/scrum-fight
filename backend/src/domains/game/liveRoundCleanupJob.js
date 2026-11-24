const cron = require('node-cron');
const { deleteStaleLiveRounds } = require('./liveRoundRepository');
const { createLogger } = require('../../shared/logger');

const log = createLogger('jobs:live-round-cleanup');

// Daily at 03:30 — removes rounds that were abandoned for over a day.
const SCHEDULE = '30 3 * * *';

function register() {
  return cron.schedule(SCHEDULE, async () => {
    try {
      const removed = await deleteStaleLiveRounds();
      if (removed) log.info('Verlaten rondes opgeruimd', { removed });
    } catch (err) {
      log.error('Opruimen mislukt', err);
    }
  });
}

module.exports = { register };
