const { Pool } = require('pg');
const { createLogger } = require('./logger');

const log = createLogger('db');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.on('error', (err) => {
  log.error('Onverwachte fout van een databaseverbinding', err);
});

module.exports = pool;
