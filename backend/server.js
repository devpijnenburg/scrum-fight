require('dotenv').config();
const { createServer } = require('http');
const { Server } = require('socket.io');

const pool = require('./src/shared/database');
const { runMigrations } = require('./src/db/migrate');
const { createApp, corsOrigin } = require('./src/app');
const { setupSocket, stopRealtime } = require('./src/realtime');
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
  stopRealtime();
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

runMigrations(pool)
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
