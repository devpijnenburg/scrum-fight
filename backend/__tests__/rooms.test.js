// Rooms route integration tests.
// Database is mocked so no real DB is needed.

jest.mock('../src/config/database', () => ({ query: jest.fn() }));

const request = require('supertest');
const express = require('express');
const db = require('../src/config/database');
const { sign } = require('../src/auth/jwt');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/rooms', require('../src/routes/rooms'));
  return app;
}

const app = buildApp();

afterEach(() => jest.clearAllMocks());

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeToken(userId = 'user-1') {
  return `Bearer ${sign({ id: userId })}`;
}

const baseUser = { id: 'user-1', name: 'Alice', plan: 'free', is_admin: false, totp_enabled: false };

function mockAuth(user = baseUser) {
  db.query.mockResolvedValueOnce({ rows: [user] });
}

function makeRoom(id, overrides = {}) {
  return {
    id,
    name: `Room ${id}`,
    method: 'fibonacci',
    last_active: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ── GET /api/rooms ────────────────────────────────────────────────────────────

describe('GET /api/rooms', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/rooms');
    expect(res.status).toBe(401);
  });

  it('returns rooms with over_limit=false when under plan limit', async () => {
    mockAuth({ ...baseUser, plan: 'free' });         // authMiddleware
    db.query.mockResolvedValueOnce({ rows: [{ plan: 'free' }] }); // plan query
    db.query.mockResolvedValueOnce({                 // rooms query
      rows: [makeRoom('R1'), makeRoom('R2')],
    });

    const res = await request(app)
      .get('/api/rooms')
      .set('Authorization', makeToken());

    expect(res.status).toBe(200);
    expect(res.body.maxRooms).toBe(3);
    expect(res.body.rooms).toHaveLength(2);
    expect(res.body.rooms.every((r) => r.over_limit === false)).toBe(true);
  });

  it('marks rooms beyond the plan limit as over_limit', async () => {
    // User was on pro, now downgraded to free (max 3), but still has 5 rooms in DB
    mockAuth({ ...baseUser, plan: 'free' });
    db.query.mockResolvedValueOnce({ rows: [{ plan: 'free' }] });
    db.query.mockResolvedValueOnce({
      rows: [makeRoom('R1'), makeRoom('R2'), makeRoom('R3'), makeRoom('R4'), makeRoom('R5')],
    });

    const res = await request(app)
      .get('/api/rooms')
      .set('Authorization', makeToken());

    expect(res.status).toBe(200);
    expect(res.body.maxRooms).toBe(3);
    expect(res.body.rooms).toHaveLength(5);
    expect(res.body.rooms.slice(0, 3).every((r) => r.over_limit === false)).toBe(true);
    expect(res.body.rooms.slice(3).every((r) => r.over_limit === true)).toBe(true);
  });

  it('never marks rooms over_limit for premium users', async () => {
    mockAuth({ ...baseUser, plan: 'premium' });
    db.query.mockResolvedValueOnce({ rows: [{ plan: 'premium' }] });
    db.query.mockResolvedValueOnce({
      rows: Array.from({ length: 50 }, (_, i) => makeRoom(`R${i}`)),
    });

    const res = await request(app)
      .get('/api/rooms')
      .set('Authorization', makeToken());

    expect(res.status).toBe(200);
    expect(res.body.maxRooms).toBeNull();
    expect(res.body.rooms.every((r) => r.over_limit === false)).toBe(true);
  });

  it('reads plan from DB, not JWT, so stale tokens are handled correctly', async () => {
    // JWT says 'pro' but DB says 'free' (admin downgraded the user)
    const jwtUser = { ...baseUser, plan: 'pro' };
    mockAuth(jwtUser);
    db.query.mockResolvedValueOnce({ rows: [{ plan: 'free' }] }); // DB says free
    db.query.mockResolvedValueOnce({
      rows: [makeRoom('R1'), makeRoom('R2'), makeRoom('R3'), makeRoom('R4')],
    });

    const res = await request(app)
      .get('/api/rooms')
      .set('Authorization', makeToken());

    expect(res.status).toBe(200);
    expect(res.body.maxRooms).toBe(3);
    // 4th room must be over_limit even though JWT indicated pro
    expect(res.body.rooms[3].over_limit).toBe(true);
  });

  it('falls back to free limits when plan is unknown', async () => {
    mockAuth({ ...baseUser, plan: 'unknown_plan' });
    db.query.mockResolvedValueOnce({ rows: [{ plan: 'unknown_plan' }] });
    db.query.mockResolvedValueOnce({
      rows: [makeRoom('R1'), makeRoom('R2'), makeRoom('R3'), makeRoom('R4')],
    });

    const res = await request(app)
      .get('/api/rooms')
      .set('Authorization', makeToken());

    expect(res.status).toBe(200);
    expect(res.body.maxRooms).toBe(3);
    expect(res.body.rooms[3].over_limit).toBe(true);
  });
});

// ── POST /api/rooms ───────────────────────────────────────────────────────────

describe('POST /api/rooms', () => {
  it('creates a saved room for an authenticated user under the plan limit', async () => {
    mockAuth({ ...baseUser, plan: 'free' });
    db.query.mockResolvedValueOnce({ rows: [{ count: '1' }] }); // room count < 3
    db.query.mockResolvedValueOnce({ rows: [] });               // uniqueRoomId check
    db.query.mockResolvedValueOnce({                            // INSERT
      rows: [{ id: 'ABCDE1', name: 'My Room', method: 'fibonacci', is_guest: false }],
    });

    const res = await request(app)
      .post('/api/rooms')
      .set('Authorization', makeToken())
      .send({ name: 'My Room', method: 'fibonacci' });

    expect(res.status).toBe(201);
    expect(res.body.is_guest).toBe(false);
    expect(res.body.planLimitWarning).toBeUndefined();
  });

  it('creates a guest room with a warning when the plan limit is reached', async () => {
    mockAuth({ ...baseUser, plan: 'free' });
    db.query.mockResolvedValueOnce({ rows: [{ count: '3' }] }); // at limit
    db.query.mockResolvedValueOnce({ rows: [] });               // uniqueRoomId check
    db.query.mockResolvedValueOnce({                            // INSERT
      rows: [{ id: 'GUEST1', name: 'My Room', method: 'fibonacci', is_guest: true }],
    });

    const res = await request(app)
      .post('/api/rooms')
      .set('Authorization', makeToken())
      .send({ name: 'My Room', method: 'fibonacci' });

    expect(res.status).toBe(201);
    expect(res.body.is_guest).toBe(true);
    expect(res.body.planLimitWarning).toMatch(/Maximaal/);
  });

  it('creates a guest room for unauthenticated users', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });               // uniqueRoomId check
    db.query.mockResolvedValueOnce({
      rows: [{ id: 'GUEST2', name: 'Quick Room', method: 'fibonacci', is_guest: true }],
    });

    const res = await request(app)
      .post('/api/rooms')
      .send({ name: 'Quick Room', method: 'fibonacci' });

    expect(res.status).toBe(201);
    expect(res.body.is_guest).toBe(true);
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .send({ method: 'fibonacci' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/verplicht/i);
  });

  it('returns 400 when estimation method is invalid', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .send({ name: 'My Room', method: 'invalid_method' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/methode/i);
  });
});
