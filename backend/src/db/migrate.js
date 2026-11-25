// Versioned database migrations.
//
// Every *.sql file in ./migrations runs exactly once, in file-name order,
// each inside its own transaction together with its row in
// schema_migrations. A new migration only needs a new file — no list to
// keep in sync. An advisory lock makes concurrent starts (e.g. two backend
// containers) wait for each other instead of racing.
//
// Migrations 001–009 predate this table and are idempotent, so on an
// existing database they simply run once more and get recorded.

const fs = require('fs');
const path = require('path');
const { createLogger } = require('../shared/logger');

const dbLog = createLogger('db');
const defaultLog = (message, fields) => dbLog.info(message, fields);

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const LOCK_KEY = 727_101; // arbitrary, unique to this app's migration runner

function listMigrationFiles(dir = MIGRATIONS_DIR) {
  return fs.readdirSync(dir)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort();
}

// `log(message, fields)` — standaard de gedeelde logger (component `db`).
async function runMigrations(pool, { dir = MIGRATIONS_DIR, log = defaultLog } = {}) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       TEXT        PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);

    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.name));
    const pending = listMigrationFiles(dir).filter((f) => !applied.has(f));

    for (const file of pending) {
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        log('Migratie uitgevoerd', { migration: file });
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        err.message = `Migration ${file} failed: ${err.message}`;
        throw err;
      }
    }

    if (pending.length) log('Migraties klaar', { applied: pending.length });
    else log('Databaseschema is up-to-date', { migrations: applied.size });
    return pending;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    client.release();
  }
}

module.exports = { runMigrations, listMigrationFiles };
