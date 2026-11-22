const express = require('express');
const cors = require('cors');

const pool = require('./config/database');
const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');
const profileRoutes = require('./routes/profile');

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

  app.use(cors({ origin: corsOrigin() }));
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/auth', authRoutes);
  app.use('/api/rooms', roomRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/profile', profileRoutes);

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

  // Central error handler. Express 5 forwards rejected promises from async
  // route handlers here, so a failing query never leaves a request hanging.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Ongeldige JSON', code: 'INVALID_JSON' });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Verzoek te groot', code: 'PAYLOAD_TOO_LARGE' });
    }
    console.error(`[http] ${req.method} ${req.originalUrl} failed:`, err);
    if (res.headersSent) return;
    res.status(500).json({ error: 'Serverfout', code: 'SERVER_ERROR' });
  });

  return app;
}

module.exports = { createApp, corsOrigin };
