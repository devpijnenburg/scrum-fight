const cron = require('node-cron');
const { deleteStaleLiveRounds } = require('./liveRoundRepository');

// Daily at 03:30 — removes rounds that were abandoned for over a day.
const SCHEDULE = '30 3 * * *';

function register() {
  return cron.schedule(SCHEDULE, async () => {
    try {
      const removed = await deleteStaleLiveRounds();
      if (removed) console.log(`[jobs:live-round-cleanup] Removed ${removed} abandoned rounds`);
    } catch (err) {
      console.error('[jobs:live-round-cleanup] Error during cleanup:', err);
    }
  });
}

module.exports = { register };
