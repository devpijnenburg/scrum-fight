const cron = require('node-cron');
const db = require('../config/database');

// Runs daily at 03:00 to delete stale rooms.
cron.schedule('0 3 * * *', async () => {
  console.log('[cleanup] Running room cleanup job...');
  try {
    // Guest rooms older than 1 hour (safety net — socket handler handles real-time)
    const { rowCount: guestCount } = await db.query(`
      DELETE FROM rooms
      WHERE is_guest = TRUE
        AND last_active < NOW() - INTERVAL '1 hour'
    `);

    // Non-guest rooms with 30-day inactivity, excluding premium users
    const { rowCount: staleCount } = await db.query(`
      DELETE FROM rooms r
      WHERE r.is_guest = FALSE
        AND r.last_active < NOW() - INTERVAL '30 days'
        AND (
          r.owner_id IS NULL
          OR EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = r.owner_id AND u.plan != 'premium'
          )
        )
    `);

    console.log(`[cleanup] Removed ${guestCount} stale guest rooms, ${staleCount} inactive user rooms`);
  } catch (err) {
    console.error('[cleanup] Error during cleanup:', err);
  }
});
