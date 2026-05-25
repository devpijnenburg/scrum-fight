// Auth flow integration tests.
// Database and bcrypt are mocked so no real DB is needed.

jest.mock('../src/config/database', () => ({ query: jest.fn() }));
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('$2a$12$hashed'),
  compare: jest.fn(),
}));
jest.mock('otplib', () => ({
  authenticator: {
    generateSecret: jest.fn().mockReturnValue('TESTSECRET'),
    keyuri: jest.fn().mockReturnValue('otpauth://totp/test'),
    verify: jest.fn(),
  },
}));
jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,test'),
}));

const request = require('supertest');
const express = require('express');
const db = require('../src/config/database');
const bcrypt = require('bcryptjs');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../src/routes/auth'));
  return app;
}

const app = buildApp();

afterEach(() => jest.clearAllMocks());

// ── Helpers ────────────────────────────────────────────────────────────────────

const baseUser = {
  id: 'uuid-1',
  name: 'Alice',
  email: 'alice@test.com',
  plan: 'free',
  is_admin: false,
  totp_enabled: false,
  password_hash: '$2a$12$hashed',
};

// ── POST /api/auth/register ────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  it('creates a new user and returns a JWT', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 'uuid-1', name: 'Alice', email: 'alice@test.com', plan: 'free', is_admin: false }],
    });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Alice', email: 'alice@test.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.email).toBe('alice@test.com');
    expect(res.body.user.password_hash).toBeUndefined();
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'alice@test.com', password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/verplicht/i);
  });

  it('returns 400 when password is shorter than 8 characters', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Alice', email: 'alice@test.com', password: 'short' });

    expect(res.status).toBe(400);
  });

  it('returns 409 when email is already in use', async () => {
    db.query.mockRejectedValueOnce({ code: '23505' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Alice', email: 'existing@test.com', password: 'password123' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/gebruik/i);
  });
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials and returns a JWT', async () => {
    db.query.mockResolvedValueOnce({ rows: [baseUser] });
    bcrypt.compare.mockResolvedValueOnce(true);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@test.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.requiresTotp).toBeUndefined();
  });

  it('returns requiresTotp + preAuthToken when 2FA is enabled — no full JWT', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ ...baseUser, totp_enabled: true }] });
    bcrypt.compare.mockResolvedValueOnce(true);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@test.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.requiresTotp).toBe(true);
    expect(res.body).toHaveProperty('preAuthToken');
    // Must NOT hand out a full JWT before TOTP is verified
    expect(res.body.token).toBeUndefined();
  });

  it('returns 401 with wrong password', async () => {
    db.query.mockResolvedValueOnce({ rows: [baseUser] });
    bcrypt.compare.mockResolvedValueOnce(false);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@test.com', password: 'wrong' });

    expect(res.status).toBe(401);
  });

  it('returns 401 for unknown email', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.com', password: 'password123' });

    expect(res.status).toBe(401);
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@test.com' });

    expect(res.status).toBe(400);
  });

  it('returns 401 for OAuth-only accounts', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ ...baseUser, password_hash: null }],
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@test.com', password: 'password123' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/OAuth/i);
  });
});
