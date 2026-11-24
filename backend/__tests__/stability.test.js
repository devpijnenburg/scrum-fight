// Tests for the phase-1 safety net: rate limiting, JWT secret policy,
// health check and the central error handler.

jest.mock('../src/shared/database', () => ({ query: jest.fn() }));

const request = require('supertest');
const express = require('express');
const db = require('../src/shared/database');
const { rateLimit } = require('../src/shared/rateLimit');
const { resolveSecret } = require('../src/domains/identity/jwt');
const { createApp, corsOrigin } = require('../src/app');

afterEach(() => jest.clearAllMocks());

describe('rateLimit', () => {
  function buildApp(max) {
    const app = express();
    app.get('/limited', rateLimit({ name: 'test', windowMs: 60_000, max }), (_req, res) => res.json({ ok: true }));
    return app;
  }

  it('allows requests up to the limit and then returns 429', async () => {
    const app = buildApp(2);
    expect((await request(app).get('/limited')).status).toBe(200);
    expect((await request(app).get('/limited')).status).toBe(200);
    const res = await request(app).get('/limited');
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('RATE_LIMITED');
    expect(res.headers['retry-after']).toBeDefined();
  });
});

describe('auth rate limiting', () => {
  it('blocks repeated 2FA code guesses', async () => {
    const app = createApp();
    const codes = [];
    for (let i = 0; i < 11; i++) {
      codes.push((await request(app).post('/api/auth/verify-totp').send({})).status);
    }
    expect(codes.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});

describe('resolveSecret', () => {
  it('falls back to a dev secret outside production', () => {
    expect(resolveSecret({ NODE_ENV: 'development' })).toBeTruthy();
  });

  it('refuses a missing or placeholder secret in production', () => {
    expect(() => resolveSecret({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
    expect(() => resolveSecret({ NODE_ENV: 'production', JWT_SECRET: 'change_this_in_production' })).toThrow();
  });

  it('accepts a real secret in production', () => {
    expect(resolveSecret({ NODE_ENV: 'production', JWT_SECRET: 's3cr3t-value' })).toBe('s3cr3t-value');
  });
});

describe('corsOrigin', () => {
  it('defaults to BASE_URL without trailing slash', () => {
    expect(corsOrigin({ BASE_URL: 'https://scrumfight.com/' })).toBe('https://scrumfight.com');
  });

  it('supports a comma-separated CORS_ORIGIN list', () => {
    expect(corsOrigin({ CORS_ORIGIN: 'https://a.nl, https://b.nl' })).toEqual(['https://a.nl', 'https://b.nl']);
  });

  it('falls back to * when nothing is configured', () => {
    expect(corsOrigin({})).toBe('*');
  });
});

describe('app', () => {
  const app = createApp();

  it('health check reports ok when the DB responds', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'ok' });
  });

  it('health check reports 503 when the DB is unreachable', async () => {
    db.query.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
  });

  it('returns JSON 500 when a route handler rejects', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    db.query.mockRejectedValueOnce(new Error('db down'));
    const res = await request(app).get('/api/rooms/ABC123');
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('SERVER_ERROR');
    spy.mockRestore();
  });

  it('returns 400 on malformed JSON', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .set('Content-Type', 'application/json')
      .send('{bad json');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_JSON');
  });

  it('returns JSON 404 for unknown API routes', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
  });
});

describe('rateLimit logging', () => {
  const { setLogLevel, resetLogLevel } = require('../src/shared/logger');

  it('logs once per window when a client is blocked', async () => {
    setLogLevel('warn');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const app = express();
      app.get('/limited', rateLimit({ name: 'test-log', windowMs: 60_000, max: 1 }), (_req, res) => res.json({ ok: true }));
      for (let i = 0; i < 4; i++) await request(app).get('/limited');
      const lines = warn.mock.calls.map(([line]) => line).filter((l) => l.startsWith('[rate-limit]'));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(/^\[rate-limit\] Te veel verzoeken, verzoeken worden geweigerd {2}limiter=test-log ip=\S+ max=1 windowMinutes=1$/);
    } finally {
      warn.mockRestore();
      resetLogLevel();
    }
  });
});
