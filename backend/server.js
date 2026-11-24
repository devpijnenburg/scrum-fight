require('dotenv').config();
// Zo vroeg mogelijk, zodat ook de opstartmeldingen in Seq komen.
const seq = require('./src/shared/seqLogging').installSeqLogging();
const { createServer } = require('http');
const { Server } = require('socket.io');

const pool = require('./src/shared/database');
const { runMigrations } = require('./src/db/migrate');
const { createApp, corsOrigin } = require('./src/app');
const { setupSocket, stopRealtime } = require('./src/realtime');
const { startJobs, stopJobs } = require('./src/jobs');
const { describeState } = require('./src/domains/billing/creemClient');
const { createLogger } = require('./src/shared/logger');

const log = createLogger('server');

// ── Process-level safety net ─────────────────────────────────────────────────
// A stray rejection is logged instead of silently crashing the process.
// Uncaught exceptions leave the process in an unknown state, so we log and
// shut down cleanly; the container orchestrator restarts us.
process.on('unhandledRejection', (reason) => {
  log.error('Unhandled promise rejection', reason instanceof Error ? reason : { reason: String(reason) });
});
process.on('uncaughtException', (err) => {
  log.error('Uncaught exception, server stopt', err);
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
  log.info('Afsluiten gestart', { signal });

  const force = setTimeout(() => {
    log.error('Afsluiten duurt te lang, proces wordt geforceerd gestopt', { timeoutMs: SHUTDOWN_TIMEOUT_MS });
    process.exit(exitCode || 1);
  }, SHUTDOWN_TIMEOUT_MS);
  force.unref();

  stopJobs();
  // io.close() disconnects all sockets and closes the underlying HTTP server.
  // Then save the rounds in progress (they are restored when players
  // reconnect to the new process) before closing the DB pool.
  io.close(async () => {
    try {
      await stopRealtime();
    } catch (err) {
      log.error('Lopende rondes opslaan mislukt', err);
    }
    try {
      await pool.end();
    } catch (err) {
      log.error('Databasepool sluiten mislukt', err);
    }
    log.info('Afsluiten voltooid');
    await seq.flush();
    process.exit(exitCode);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

const PORT = process.env.PORT || 3000;

runMigrations(pool)
  .then(() => {
    startJobs();
    createLogger('billing').info(`Betalingen: ${describeState()}`);
    httpServer.listen(PORT, () => {
      log.info('Server luistert', { port: PORT, logLevel: process.env.LOG_LEVEL || 'info' });
    });
  })
  .catch((err) => {
    log.error('Starten mislukt', err);
    seq.flush().finally(() => process.exit(1));
  });
