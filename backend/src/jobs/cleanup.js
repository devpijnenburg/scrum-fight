const cron = require('node-cron');
const db = require('../config/database');

// Runs daily at 03:00 to delete stale guest rooms.
// Non-guest (claimed/permanent) rooms are never auto-deleted — their round
// history is only removed when the owner explicitly deletes the room.
cron.schedule('0 3 * * *', async () => {
  console.log('[cleanup] Running room cleanup job...');
  try {
    // Guest rooms older than 1 hour (safety net — socket handler handles real-time)
    const { rowCount: guestCount } = await db.query(`
      DELETE FROM rooms
      WHERE is_guest = TRUE
        AND last_active < NOW() - INTERVAL '1 hour'
    `);

    console.log(`[cleanup] Removed ${guestCount} stale guest rooms`);
  } catch (err) {
    console.error('[cleanup] Error during cleanup:', err);
  }
});
