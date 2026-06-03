require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const pool = require('./src/config/database');
const authRoutes = require('./src/routes/auth');
const roomRoutes = require('./src/routes/rooms');
const userRoutes = require('./src/routes/users');
const adminRoutes = require('./src/routes/admin');
const profileRoutes = require('./src/routes/profile');
const paymentsRoutes = require('./src/routes/payments');
const setupSocket = require('./src/socket');
require('./src/jobs/cleanup');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
  connectionStateRecovery: {},
});

app.use(cors());
// Always preserve raw body — needed for HMAC signature verification on the
// webhook route. The path check was removed because req.path inside the verify
// callback can behave unexpectedly with router mounts.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/payments', paymentsRoutes);

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

const MIGRATIONS = [
  '001_init.sql',
  '002_user_votes.sql',
  '003_round_name.sql',
  '004_admin_organizations.sql',
  '005_emoticon.sql',
  '006_creem_subscriptions.sql',
  '007_subscription_period.sql',
];

async function runMigrations() {
  for (const file of MIGRATIONS) {
    const sql = fs.readFileSync(path.join(__dirname, 'src/db/migrations', file), 'utf8');
    await pool.query(sql);
  }
  console.log('[db] Migrations applied');
}

setupSocket(io);

const PORT = process.env.PORT || 3000;

runMigrations()
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(`[server] Listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[server] Failed to start:', err);
    process.exit(1);
  });
