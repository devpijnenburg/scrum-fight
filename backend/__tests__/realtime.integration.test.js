// End-to-end socket tests: a real socket.io server and real clients over
// localhost. Only the repositories are mocked.

jest.mock('../src/domains/rooms/roomRepository', () => ({
  findRoomById: jest.fn(),
  touchLastActive: jest.fn().mockResolvedValue(),
  recordRound: jest.fn().mockResolvedValue(),
  updateRoomName: jest.fn().mockResolvedValue(),
  deleteRoom: jest.fn().mockResolvedValue(),
}));
jest.mock('../src/domains/identity/userRepository', () => ({
  findById: jest.fn(),
  getPlan: jest.fn().mockResolvedValue('free'),
}));
jest.mock('../src/domains/stats/activityRepository', () => ({
  recordSpectatorSession: jest.fn().mockResolvedValue(),
  recordReaction: jest.fn().mockResolvedValue(),
}));
jest.mock('../src/domains/badges/badgeEvaluator', () => ({
  evaluateBadgesForUser: jest.fn().mockResolvedValue([]),
}));

const { createServer } = require('http');
const { Server } = require('socket.io');
const { io: connectClient } = require('socket.io-client');
const roomRepository = require('../src/domains/rooms/roomRepository');
const userRepository = require('../src/domains/identity/userRepository');
const { sign } = require('../src/domains/identity/jwt');
const { setupSocket, closeRoom, claimGuestRoom } = require('../src/realtime');

const ROOMS = {
  TEAM01: { id: 'TEAM01', name: 'Team', method: 'fibonacci', is_guest: false, owner_id: 'owner-1' },
  GUEST1: { id: 'GUEST1', name: 'Guest', method: 'tshirt', is_guest: true, owner_id: null },
};

let httpServer;
let ioServer;
let sessions;
let url;
const clients = [];

beforeAll((done) => {
  httpServer = createServer();
  ioServer = new Server(httpServer);
  sessions = setupSocket(ioServer, { countdownStepMs: 20, emptyRoomTtlMs: 100, guestTtlMs: 60_000 });
  httpServer.listen(0, () => {
    url = `http://localhost:${httpServer.address().port}`;
    done();
  });
});

afterAll((done) => {
  sessions.stopAll();
  ioServer.close(() => done());
});

beforeEach(() => {
  roomRepository.findRoomById.mockImplementation(async (id) => ROOMS[id] || null);
});

afterEach(() => {
  while (clients.length) clients.pop().disconnect();
  sessions.stopAll();
  jest.clearAllMocks();
  userRepository.getPlan.mockResolvedValue('free');
});

function connect() {
  const client = connectClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  clients.push(client);
  return client;
}

// Resolves with the payload of the next `event` on `client`.
function next(client, event, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for "${event}"`)), timeoutMs);
    client.once(event, (payload) => { clearTimeout(timer); resolve(payload); });
  });
}

// Resolves once `event` has fired `count` times on `client`.
function nextN(client, event, count, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    const payloads = [];
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${count}× "${event}"`)), timeoutMs);
    const handler = (payload) => {
      payloads.push(payload);
      if (payloads.length < count) return;
      client.off(event, handler);
      clearTimeout(timer);
      resolve(payloads);
    };
    client.on(event, handler);
  });
}

async function join(name, roomId = 'TEAM01', extra = {}) {
  const client = connect();
  await next(client, 'connect');
  const state = next(client, 'room-state');
  client.emit('join-room', { roomId, playerName: name, ...extra });
  return { client, state: await state };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

it('joins a room and sees the other players', async () => {
  const alice = await join('Alice');
  const joined = next(alice.client, 'player-joined');
  const bob = await join('Bob');

  expect(await joined).toMatchObject({ name: 'Bob', hasVoted: false });
  expect(bob.state.players.map((p) => p.name)).toEqual(['Alice', 'Bob']);
  expect(bob.state.cardValues).toContain('21');
});

it('uses the account name and emoticon for a valid token', async () => {
  userRepository.findById.mockResolvedValue({ id: 'u1', name: 'Account Alice', emoticon: '🦊' });
  const { state } = await join('ignored', 'TEAM01', { token: sign({ id: 'u1' }) });
  expect(state.players[0]).toMatchObject({ name: 'Account Alice', emoticon: '🦊', userId: 'u1' });
});

it('reveals immediately when everyone voted and persists the round', async () => {
  const alice = await join('Alice');
  const bob = await join('Bob');

  const votes = nextN(alice.client, 'player-voted', 2);
  alice.client.emit('vote', { value: '3' });
  bob.client.emit('vote', { value: '5' });
  await votes;

  const revealed = next(alice.client, 'cards-revealed');
  bob.client.emit('reveal');
  const result = await revealed;

  expect(result.players.map((p) => p.vote).sort()).toEqual(['3', '5']);
  expect(result.stats).toMatchObject({ average: 4, min: 3, max: 5 });
  await sleep(20);
  expect(roomRepository.recordRound).toHaveBeenCalledWith('TEAM01', '', expect.any(Array));
});

it('runs a 3-2-1 countdown when not everyone voted', async () => {
  const alice = await join('Alice');
  await join('Bob');

  const counts = [];
  alice.client.on('countdown', ({ count }) => counts.push(count));
  alice.client.emit('vote', { value: '8' });
  await next(alice.client, 'player-voted');

  const revealed = next(alice.client, 'cards-revealed');
  alice.client.emit('reveal');
  const result = await revealed;

  expect(counts).toEqual([3, 2, 1]);
  expect(result.players.find((p) => p.name === 'Bob').vote).toBeNull();
});

it('new-round cancels a running countdown', async () => {
  const alice = await join('Alice');
  await join('Bob');
  alice.client.emit('vote', { value: '8' });
  await next(alice.client, 'player-voted');

  alice.client.emit('reveal');
  await next(alice.client, 'countdown');
  const cancelled = next(alice.client, 'countdown-cancelled');
  const reset = next(alice.client, 'round-reset');
  alice.client.emit('new-round');
  await cancelled;
  await reset;

  let revealedAnyway = false;
  alice.client.on('cards-revealed', () => { revealedAnyway = true; });
  await sleep(100);
  expect(revealedAnyway).toBe(false);
});

it('keeps the round going for a player who reconnects', async () => {
  const alice = await join('Alice');
  const bob = await join('Bob');
  alice.client.emit('vote', { value: '13' });
  await next(bob.client, 'player-voted');

  const left = next(alice.client, 'player-left');
  bob.client.disconnect();
  expect(await left).toMatchObject({ name: 'Bob' });

  const bobAgain = await join('Bob');
  expect(bobAgain.state.players.map((p) => p.name)).toEqual(['Alice', 'Bob']);
  expect(bobAgain.state.players[0].hasVoted).toBe(true);
});

it('enforces the participant limit of the owner plan', async () => {
  for (let i = 0; i < 5; i++) await join(`P${i}`);

  const sixth = connect();
  await next(sixth, 'connect');
  const error = next(sixth, 'error');
  sixth.emit('join-room', { roomId: 'TEAM01', playerName: 'Too many' });
  expect(await error).toMatchObject({ code: 'ROOM_FULL' });
});

it('reports ROOM_NOT_FOUND for unknown rooms', async () => {
  const client = connect();
  await next(client, 'connect');
  const error = next(client, 'error');
  client.emit('join-room', { roomId: 'NOPE00', playerName: 'Alice' });
  expect(await error).toMatchObject({ code: 'ROOM_NOT_FOUND' });
});

it('survives malformed events from a client', async () => {
  const alice = await join('Alice');
  for (const event of ['join-room', 'vote', 'reveal', 'react', 'update-room-name', 'set-round-name']) {
    alice.client.emit(event);
    alice.client.emit(event, null);
    alice.client.emit(event, 'garbage');
  }
  // The server still answers afterwards
  const voted = next(alice.client, 'player-voted');
  alice.client.emit('vote', { value: '2' });
  await voted;
});

it('evicts an empty permanent room from memory after the grace period', async () => {
  const alice = await join('Alice');
  expect(sessions.get('TEAM01')).not.toBeNull();
  alice.client.disconnect();
  await sleep(200);
  expect(sessions.get('TEAM01')).toBeNull();
});

it('notifies players when the room is deleted via the REST API', async () => {
  const alice = await join('Alice');
  const expired = next(alice.client, 'room-expired');
  closeRoom('TEAM01');
  expect(await expired).toEqual({ reason: 'deleted' });
  expect(sessions.get('TEAM01')).toBeNull();
});

it('announces when a guest room is claimed', async () => {
  const alice = await join('Alice', 'GUEST1');
  expect(alice.state.isGuest).toBe(true);
  const claimed = next(alice.client, 'room-claimed');
  claimGuestRoom('GUEST1');
  await claimed;
  expect(sessions.get('GUEST1').isGuest).toBe(false);
});
