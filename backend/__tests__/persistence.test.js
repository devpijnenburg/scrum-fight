// Migration runner and transactional round persistence.

jest.mock('../src/config/database', () => ({ query: jest.fn(), connect: jest.fn() }));

const fs = require('fs');
const os = require('os');
const path = require('path');
const pool = require('../src/config/database');
const { runMigrations, listMigrationFiles } = require('../src/db/migrate');
const { recordRound, buildVoteSnapshot } = require('../src/domain/rooms/roomRepository');

// A fake pg client that records every query and answers via `respond`.
function fakeClient(respond = () => ({ rows: [] })) {
  const client = {
    queries: [],
    released: false,
    query: jest.fn(async (sql, params) => {
      client.queries.push({ sql: sql.trim(), params });
      return respond(sql.trim(), params);
    }),
    release: jest.fn(() => { client.released = true; }),
  };
  return client;
}

const sqlOf = (client) => client.queries.map((q) => q.sql.split('\n')[0].trim());

function tempMigrations(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrations-'));
  for (const [name, sql] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), sql);
  return dir;
}

afterEach(() => jest.clearAllMocks());

describe('listMigrationFiles', () => {
  it('finds all real migrations in order, including 010', () => {
    const files = listMigrationFiles();
    expect(files[0]).toBe('001_init.sql');
    expect(files).toContain('010_indexes.sql');
    expect([...files].sort()).toEqual(files);
  });

  it('ignores files that are not numbered .sql migrations', () => {
    const dir = tempMigrations({ '002_b.sql': '', '001_a.sql': '', 'README.md': '', 'notes.sql': '' });
    expect(listMigrationFiles(dir)).toEqual(['001_a.sql', '002_b.sql']);
  });
});

describe('runMigrations', () => {
  const log = () => {};

  it('applies only pending migrations, each in its own transaction', async () => {
    const dir = tempMigrations({ '001_a.sql': 'SELECT 1', '002_b.sql': 'SELECT 2', '003_c.sql': 'SELECT 3' });
    const client = fakeClient((sql) =>
      sql.startsWith('SELECT name FROM schema_migrations') ? { rows: [{ name: '001_a.sql' }] } : { rows: [] });
    pool.connect.mockResolvedValue(client);

    const applied = await runMigrations(pool, { dir, log });

    expect(applied).toEqual(['002_b.sql', '003_c.sql']);
    expect(sqlOf(client)).toEqual([
      'SELECT pg_advisory_lock($1)',
      'CREATE TABLE IF NOT EXISTS schema_migrations (',
      'SELECT name FROM schema_migrations',
      'BEGIN', 'SELECT 2', 'INSERT INTO schema_migrations (name) VALUES ($1)', 'COMMIT',
      'BEGIN', 'SELECT 3', 'INSERT INTO schema_migrations (name) VALUES ($1)', 'COMMIT',
      'SELECT pg_advisory_unlock($1)',
    ]);
    expect(client.released).toBe(true);
  });

  it('rolls back a failing migration, stops and still releases the lock', async () => {
    const dir = tempMigrations({ '001_a.sql': 'BROKEN SQL', '002_b.sql': 'SELECT 2' });
    const client = fakeClient((sql) => {
      if (sql === 'BROKEN SQL') throw new Error('syntax error');
      return { rows: [] };
    });
    pool.connect.mockResolvedValue(client);

    await expect(runMigrations(pool, { dir, log })).rejects.toThrow('Migration 001_a.sql failed: syntax error');

    const sql = sqlOf(client);
    expect(sql).toContain('ROLLBACK');
    expect(sql).not.toContain('SELECT 2');
    expect(sql).not.toContain('COMMIT');
    expect(sql.at(-1)).toBe('SELECT pg_advisory_unlock($1)');
    expect(client.released).toBe(true);
  });

  it('does nothing when the schema is up to date', async () => {
    const dir = tempMigrations({ '001_a.sql': 'SELECT 1' });
    const client = fakeClient((sql) =>
      sql.startsWith('SELECT name') ? { rows: [{ name: '001_a.sql' }] } : { rows: [] });
    pool.connect.mockResolvedValue(client);

    expect(await runMigrations(pool, { dir, log })).toEqual([]);
    expect(sqlOf(client)).not.toContain('BEGIN');
  });
});

describe('buildVoteSnapshot', () => {
  it('keeps every vote when players share a name', () => {
    expect(buildVoteSnapshot([
      { name: 'Alex', vote: '3' },
      { name: 'Alex', vote: '8' },
      { name: 'Alex (2)', vote: '5' },
      { name: 'Sam', vote: null },
    ])).toEqual({ Alex: '3', 'Alex (2)': '8', 'Alex (2) (2)': '5', Sam: null });
  });
});

describe('recordRound', () => {
  const players = [
    { name: 'Alice', userId: 'u1', vote: '5' },
    { name: 'Guest', userId: null, vote: '3' },
    { name: 'Bob', userId: 'u2', vote: null }, // did not vote
  ];

  it('writes round, user votes and activity in one transaction', async () => {
    const client = fakeClient((sql) =>
      sql.startsWith('INSERT INTO round_history') ? { rows: [{ id: 'round-1' }] } : { rows: [] });
    pool.connect.mockResolvedValue(client);

    await expect(recordRound('ROOM01', 'Story 1', players)).resolves.toBe('round-1');

    expect(sqlOf(client)).toEqual([
      'BEGIN',
      'INSERT INTO round_history (room_id, votes, name) VALUES ($1, $2, $3) RETURNING id',
      'INSERT INTO user_votes (user_id, room_id, round_id, value)',
      'UPDATE rooms SET last_active = NOW() WHERE id = $1',
      'COMMIT',
    ]);
    const userVotes = client.queries[2].params;
    expect(userVotes).toEqual([['u1'], 'ROOM01', 'round-1', ['5']]);
    expect(client.released).toBe(true);
  });

  it('rolls back everything when a write fails', async () => {
    const client = fakeClient((sql) => {
      if (sql.startsWith('INSERT INTO round_history')) return { rows: [{ id: 'round-1' }] };
      if (sql.startsWith('INSERT INTO user_votes')) throw new Error('fk violation');
      return { rows: [] };
    });
    pool.connect.mockResolvedValue(client);

    await expect(recordRound('ROOM01', '', players)).rejects.toThrow('fk violation');
    expect(sqlOf(client)).toContain('ROLLBACK');
    expect(sqlOf(client)).not.toContain('COMMIT');
    expect(client.released).toBe(true);
  });

  it('skips the user_votes insert when no account holder voted', async () => {
    const client = fakeClient((sql) =>
      sql.startsWith('INSERT INTO round_history') ? { rows: [{ id: 'round-2' }] } : { rows: [] });
    pool.connect.mockResolvedValue(client);

    await recordRound('ROOM01', '', [{ name: 'Guest', userId: null, vote: '3' }]);
    expect(sqlOf(client).some((s) => s.startsWith('INSERT INTO user_votes'))).toBe(false);
  });
});
