require('dotenv').config();
const { createServer } = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const pool = require('./src/config/database');
const { createApp, corsOrigin } = require('./src/app');
const setupSocket = require('./src/socket');
const { startJobs, stopJobs } = require('./src/jobs');

// ── Process-level safety net ─────────────────────────────────────────────────
// A stray rejection is logged instead of silently crashing the process.
// Uncaught exceptions leave the process in an unknown state, so we log and
// shut down cleanly; the container orchestrator restarts us.
process.on('unhandledRejection', (reason) => {
  console.error('[process] Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[process] Uncaught exception, shutting down:', err);
  shutdown('uncaughtException', 1);
});

const app = createApp();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: corsOrigin() },
  connectionStateRecovery: {},
});

const MIGRATIONS = [
  '001_init.sql',
  '002_user_votes.sql',
  '003_round_name.sql',
  '004_admin_organizations.sql',
  '005_emoticon.sql',
  '006_user_badges.sql',
  '007_spectator_reactions.sql',
  '008_email_verification.sql',
  '009_verify_existing_accounts.sql',
];

async function runMigrations() {
  for (const file of MIGRATIONS) {
    const sql = fs.readFileSync(path.join(__dirname, 'src/db/migrations', file), 'utf8');
    await pool.query(sql);
  }
  console.log('[db] Migrations applied');
}

setupSocket(io);

// ── Graceful shutdown ────────────────────────────────────────────────────────
const SHUTDOWN_TIMEOUT_MS = 10_000;
let shuttingDown = false;

function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} received, shutting down…`);

  const force = setTimeout(() => {
    console.error('[server] Shutdown timed out, forcing exit');
    process.exit(exitCode || 1);
  }, SHUTDOWN_TIMEOUT_MS);
  force.unref();

  stopJobs();
  // io.close() disconnects all sockets and closes the underlying HTTP server.
  io.close(async () => {
    try {
      await pool.end();
    } catch (err) {
      console.error('[server] Error closing DB pool:', err);
    }
    console.log('[server] Shutdown complete');
    process.exit(exitCode);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

const PORT = process.env.PORT || 3000;

runMigrations()
  .then(() => {
    startJobs();
    httpServer.listen(PORT, () => {
      console.log(`[server] Listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[server] Failed to start:', err);
    process.exit(1);
  });
