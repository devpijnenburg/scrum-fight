// Auth flow integration tests.
// Database and bcrypt are mocked so no real DB is needed.

jest.mock('../src/shared/database', () => ({ query: jest.fn() }));
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('$2a$12$hashed'),
  compare: jest.fn(),
}));
jest.mock('speakeasy', () => ({
  generateSecret: jest.fn().mockReturnValue({ base32: 'TESTSECRET' }),
  otpauthURL: jest.fn().mockReturnValue('otpauth://totp/test'),
  totp: { verify: jest.fn() },
}));
jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,test'),
}));

const request = require('supertest');
const db = require('../src/shared/database');
const bcrypt = require('bcryptjs');

function buildApp() {
  return require('../src/app').createApp();
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
  email_verified: true,
  password_hash: '$2a$12$hashed',
};

// ── POST /api/auth/register ────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  it('creates a new user and requires email verification — no JWT yet', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 'uuid-1', name: 'Alice', email: 'alice@test.com', plan: 'free', is_admin: false }],
    });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Alice', email: 'alice@test.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.requiresVerification).toBe(true);
    // Must NOT hand out a JWT before the email address is verified
    expect(res.body.token).toBeUndefined();
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

  it('returns 403 with EMAIL_NOT_VERIFIED when the email is not verified yet', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ ...baseUser, email_verified: false }] });
    bcrypt.compare.mockResolvedValueOnce(true);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@test.com', password: 'password123' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
    expect(res.body.token).toBeUndefined();
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

describe('logging', () => {
  const { setLogLevel, resetLogLevel } = require('../src/shared/logger');
  let warn;
  let info;

  beforeEach(() => {
    setLogLevel('info');
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    info = jest.spyOn(console, 'info').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
    info.mockRestore();
    resetLogLevel();
  });

  const lines = (spy) => spy.mock.calls.map(([line]) => line);

  it('gives every request an id, logs it on every line and returns it in X-Request-Id', async () => {
    db.query.mockResolvedValueOnce({ rows: [baseUser] });
    bcrypt.compare.mockResolvedValueOnce(true);
    const res = await request(app).post('/api/auth/login').send({ email: 'alice@test.com', password: 'password123' });
    const id = res.headers['x-request-id'];
    expect(id).toMatch(/^[0-9a-f]{8}$/);
    await new Promise((r) => setImmediate(r)); // access log runs on 'close'

    const mine = lines(info).filter((l) => l.endsWith(`req=${id}`));
    expect(mine).toEqual([
      expect.stringMatching(/^\[auth\] Ingelogd /),
      expect.stringMatching(/^\[http\] Request afgehandeld {2}method=POST path=\/api\/auth\/login status=200 ms=[\d.]+ req=/),
    ]);
  });

  it('keeps a safe X-Request-Id from the proxy and replaces an unsafe one', async () => {
    const ok = await request(app).get('/api/auth/providers').set('X-Request-Id', 'nginx-abc123');
    expect(ok.headers['x-request-id']).toBe('nginx-abc123');
    const bad = await request(app).get('/api/auth/providers').set('X-Request-Id', 'x y<script>');
    expect(bad.headers['x-request-id']).toMatch(/^[0-9a-f]{8}$/);
  });

  it('logs the path without the query string', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await request(app).get('/api/auth/verify-email?token=geheim-token');
    await new Promise((r) => setImmediate(r));
    expect(JSON.stringify(info.mock.calls)).not.toContain('geheim-token');
    expect(lines(info)).toContainEqual(expect.stringMatching(/path=\/api\/auth\/verify-email status=400 /));
  });

  it('logs a failed login with a masked email address', async () => {
    db.query.mockResolvedValueOnce({ rows: [baseUser] });
    bcrypt.compare.mockResolvedValueOnce(false);
    await request(app).post('/api/auth/login').send({ email: 'alice@test.com', password: 'wrong' });

    expect(lines(warn)).toContainEqual(expect.stringMatching(
      /^\[auth\] Inloggen mislukt {2}method=password reason=wrong-password email=a\*\*\*@test\.com user=uuid-1 req=[0-9a-f]{8}$/
    ));
    expect(JSON.stringify(warn.mock.calls)).not.toContain('alice@test.com');
  });

  it('logs a successful login without the email address', async () => {
    db.query.mockResolvedValueOnce({ rows: [baseUser] });
    bcrypt.compare.mockResolvedValueOnce(true);
    await request(app).post('/api/auth/login').send({ email: 'alice@test.com', password: 'password123' });

    expect(lines(info)).toContainEqual(expect.stringMatching(/^\[auth\] Ingelogd {2}user=uuid-1 method=password req=[0-9a-f]{8}$/));
  });
});
