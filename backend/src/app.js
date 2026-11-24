const express = require('express');
const cors = require('cors');

const pool = require('./shared/database');
const { errorHandler } = require('./shared/errors');
const { requestContext } = require('./shared/requestContext');
const { accessLog } = require('./shared/accessLog');

const identityRoutes = require('./domains/identity/routes');
const profileRoutes = require('./domains/identity/profileRoutes');
const roomRoutes = require('./domains/rooms/routes');
const statsRoutes = require('./domains/stats/routes');
const badgeRoutes = require('./domains/badges/routes');
const adminRoutes = require('./domains/admin/routes');
const billingRoutes = require('./domains/billing/routes');
const clientErrorRoutes = require('./domains/monitoring/routes');

// Allowed browser origins. The frontend is served same-origin through nginx,
// so CORS only matters for cross-origin setups; default to BASE_URL.
function corsOrigin(env = process.env) {
  const raw = env.CORS_ORIGIN || env.BASE_URL;
  if (!raw) return '*';
  const origins = raw.split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean);
  return origins.length === 1 ? origins[0] : origins;
}

function createApp() {
  const app = express();

  // Behind nginx: trust the first proxy so req.ip is the real client IP
  // (needed for per-IP rate limiting).
  app.set('trust proxy', 1);

  // Request-id (X-Request-Id) en één logregel per verzoek.
  app.use(requestContext);
  app.use(accessLog);

  app.use(cors({ origin: corsOrigin() }));
  // Before express.json(): the payment webhook verifies the raw request body.
  app.use('/api/payments/webhook', billingRoutes.webhookRouter);
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/auth', identityRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/rooms', roomRoutes);
  app.use('/api/users', statsRoutes, badgeRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/payments', billingRoutes);
  app.use('/api/client-errors', clientErrorRoutes);

  // Liveness + readiness: reports unhealthy when the database is unreachable.
  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', db: 'ok' });
    } catch {
      res.status(503).json({ status: 'error', db: 'unreachable' });
    }
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Niet gevonden', code: 'NOT_FOUND' }));
  app.use(errorHandler);

  return app;
}

module.exports = { createApp, corsOrigin };
