// HTTP behaviour of the identity, profile, admin and rooms domains:
// error codes, the 2FA session boundary and domain events.

jest.mock('../src/shared/database', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('speakeasy', () => ({ totp: { verify: jest.fn() } }));

const request = require('supertest');
const db = require('../src/shared/database');
const speakeasy = require('speakeasy');
const events = require('../src/shared/events');
const { sign, signPreAuthToken } = require('../src/domains/identity/jwt');
const { createApp } = require('../src/app');
const { AppError, errorHandler } = require('../src/shared/errors');

const app = createApp();
const bearer = (payload) => `Bearer ${sign(payload)}`;

const alice = { id: 'u1', name: 'Alice', plan: 'free', is_admin: false, totp_enabled: false };
const admin = { ...alice, id: 'admin-1', is_admin: true };

// The auth middleware always loads the user first.
const mockAuthUser = (user) => db.query.mockResolvedValueOnce({ rows: [user] });

afterEach(() => {
  jest.clearAllMocks();
  db.query.mockReset();
  events.removeAllListeners();
});

describe('errorHandler', () => {
  it('serialises AppError with status, code and details', () => {
    const res = { headersSent: false, status: jest.fn().mockReturnThis(), json: jest.fn() };
    errorHandler(new AppError(403, 'ROOM_LIMIT_REACHED', 'msg', { max: 3 }), {}, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'msg', code: 'ROOM_LIMIT_REACHED', max: 3 });
  });
});

describe('identity', () => {
  it('responds with a machine-readable code next to the message', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'a@b.nl' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'E-mail en wachtwoord zijn verplicht', code: 'LOGIN_FIELDS_REQUIRED' });
  });

  it('rejects a 2FA pre-auth token as a session (no 2FA bypass)', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${signPreAuthToken('u1')}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESSION_INVALID');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('returns 401 UNAUTHORIZED without a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('returns 500 (not 401) when the database fails during login', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    db.query.mockRejectedValueOnce(new Error('connection lost'));
    const res = await request(app).post('/api/auth/login').send({ email: 'a@b.nl', password: 'x' });
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('SERVER_ERROR');
    spy.mockRestore();
  });

  describe('email-code login', () => {
    it('issues a session for a valid, unexpired code', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ user_id: 'u1' }] })                      // consume code
        .mockResolvedValueOnce({ rows: [{ id: 'u1', name: 'Alice', plan: 'free', is_admin: false }] });
      const res = await request(app)
        .post('/api/auth/verify-email-2fa')
        .send({ preAuthToken: signPreAuthToken('u1', '10m'), code: '123456' });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
    });

    it('rejects an invalid or expired code', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(app)
        .post('/api/auth/verify-email-2fa')
        .send({ preAuthToken: signPreAuthToken('u1', '10m'), code: '000000' });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('CODE_INVALID_OR_EXPIRED');
    });

    it('rejects a session token where a pre-auth token is required', async () => {
      const res = await request(app)
        .post('/api/auth/verify-email-2fa')
        .send({ preAuthToken: sign({ id: 'u1' }), code: '123456' });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('PREAUTH_INVALID');
    });
  });
});

describe('profile', () => {
  it('validates the emoticon', async () => {
    mockAuthUser(alice);
    const res = await request(app)
      .put('/api/profile/emoticon')
      .set('Authorization', bearer({ id: 'u1' }))
      .send({ emoticon: '🦊🦊🦊🦊🦊🦊🦊🦊🦊' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('EMOTICON_INVALID');
  });

  it('refuses email 2FA while TOTP is active', async () => {
    mockAuthUser(alice);
    db.query.mockResolvedValueOnce({ rows: [{ totp_enabled: true, email_2fa_enabled: false }] });
    const res = await request(app)
      .post('/api/profile/email-2fa/enable')
      .set('Authorization', bearer({ id: 'u1' }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TOTP_ACTIVE');
  });

  it('disables TOTP only with a valid code', async () => {
    mockAuthUser(alice);
    db.query.mockResolvedValueOnce({ rows: [{ id: 'u1', totp_enabled: true, totp_secret: 'S' }] });
    speakeasy.totp.verify.mockReturnValueOnce(false);
    const res = await request(app)
      .post('/api/profile/totp/disable')
      .set('Authorization', bearer({ id: 'u1' }))
      .send({ code: '111111' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_CODE');
  });
});

describe('admin', () => {
  it('is forbidden for non-admins', async () => {
    mockAuthUser(alice);
    const res = await request(app).get('/api/admin/users').set('Authorization', bearer({ id: 'u1' }));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('caps the page size and returns the total', async () => {
    mockAuthUser(admin);
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'u1' }] })
      .mockResolvedValueOnce({ rows: [{ count: '41' }] });
    const res = await request(app)
      .get('/api/admin/users?limit=500&page=2')
      .set('Authorization', bearer({ id: 'admin-1' }));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(41);
    const [, params] = db.query.mock.calls[1];
    expect(params).toEqual(['%', 100, 200]);
  });

  it('maps a duplicate slug to 409 SLUG_IN_USE', async () => {
    mockAuthUser(admin);
    db.query.mockRejectedValueOnce({ code: '23505' });
    const res = await request(app)
      .post('/api/admin/organizations')
      .set('Authorization', bearer({ id: 'admin-1' }))
      .send({ name: 'Acme', slug: 'acme' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SLUG_IN_USE');
  });

  it('refuses new members when the organization is full', async () => {
    mockAuthUser(admin);
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'u2' }] })                           // user by email
      .mockResolvedValueOnce({ rows: [{ max_members: 2, member_count: 2 }] });   // capacity
    const res = await request(app)
      .post('/api/admin/organizations/org-1/members')
      .set('Authorization', bearer({ id: 'admin-1' }))
      .send({ email: 'bob@x.nl' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ORG_FULL');
  });

  it('rejects an unknown plan', async () => {
    mockAuthUser(admin);
    const res = await request(app)
      .put('/api/admin/users/u1')
      .set('Authorization', bearer({ id: 'admin-1' }))
      .send({ plan: 'platinum' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PLAN');
  });
});

describe('rooms', () => {
  it('announces a deleted room as a domain event', async () => {
    const deleted = jest.fn();
    events.on(events.ROOM_DELETED, deleted);
    mockAuthUser(alice);
    db.query.mockResolvedValueOnce({ rowCount: 1 });

    const res = await request(app).delete('/api/rooms/abc123').set('Authorization', bearer({ id: 'u1' }));

    expect(res.status).toBe(200);
    expect(deleted).toHaveBeenCalledWith({ roomId: 'ABC123' });
  });

  it('announces a claimed room and reports the limit with details', async () => {
    const claimed = jest.fn();
    events.on(events.ROOM_CLAIMED, claimed);

    mockAuthUser(alice);
    db.query
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'G1', name: 'R', method: 'fibonacci', is_guest: false }] });
    await request(app).post('/api/rooms/g1/claim').set('Authorization', bearer({ id: 'u1' }));
    expect(claimed).toHaveBeenCalledWith({ roomId: 'G1' });

    mockAuthUser(alice);
    db.query.mockResolvedValueOnce({ rows: [{ count: '3' }] });
    const res = await request(app).post('/api/rooms/g2/claim').set('Authorization', bearer({ id: 'u1' }));
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'ROOM_LIMIT_REACHED', plan: 'free', max: 3 });
  });

  it('returns ROOM_NOT_FOUND for unknown rooms', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/rooms/NOPE00');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ROOM_NOT_FOUND');
  });
});

describe('events', () => {
  it('a failing listener does not break the emitter', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const after = jest.fn();
    events.on('x', () => { throw new Error('boom'); });
    events.on('x', after);
    expect(() => events.emit('x', 1)).not.toThrow();
    expect(after).toHaveBeenCalledWith(1);
    spy.mockRestore();
  });
});
