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
const setupSocket = require('./src/socket');
require('./src/jobs/cleanup');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
  connectionStateRecovery: {},
});

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);

app.get('/health', (_, res) => res.json({ status: 'ok' }));

async function runMigrations() {
  const sql = fs.readFileSync(
    path.join(__dirname, 'src/db/migrations/001_init.sql'),
    'utf8'
  );
  await pool.query(sql);
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
