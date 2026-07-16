const cron = require('node-cron');
const { deleteStaleGuestRooms } = require('../domain/rooms/roomRepository');

// Daily at 03:00 — deletes stale guest rooms as a safety net behind the
// real-time inactivity expiry handled by the socket layer.
const SCHEDULE = '0 3 * * *';

function register() {
  cron.schedule(SCHEDULE, async () => {
    console.log('[jobs:room-cleanup] Running room cleanup...');
    try {
      const removed = await deleteStaleGuestRooms();
      console.log(`[jobs:room-cleanup] Removed ${removed} stale guest rooms`);
    } catch (err) {
      console.error('[jobs:room-cleanup] Error during cleanup:', err);
    }
  });
}

module.exports = { register };
