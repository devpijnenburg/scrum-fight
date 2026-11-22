// A deploy in miniature: players vote on server A, A shuts down gracefully,
// server B starts with the same (mocked, in-memory) database and the players
// reconnect with their per-tab player key. The round must carry on.

const mockStore = new Map(); // live_rounds table: roomId → state
jest.mock('../src/domains/game/liveRoundRepository', () => ({
  saveLiveRound: jest.fn(async (roomId, state) => { mockStore.set(roomId, JSON.parse(JSON.stringify(state))); }),
  loadLiveRound: jest.fn(async (roomId) => mockStore.get(roomId) ?? null),
}));
jest.mock('../src/domains/rooms/roomRepository', () => ({
  findRoomById: jest.fn(async (id) => (id === 'TEAM01'
    ? { id: 'TEAM01', name: 'Team', method: 'fibonacci', is_guest: false, owner_id: null }
    : null)),
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
const { setupSocket, stopRealtime } = require('../src/realtime');

const servers = [];

async function startServer() {
  const http = createServer();
  const io = new Server(http);
  setupSocket(io, { persistDelayMs: 10 });
  await new Promise((r) => http.listen(0, r));
  const url = `http://localhost:${http.address().port}`;
  // Graceful shutdown as in server.js: close sockets, then save live rounds.
  let closed = false;
  const shutdown = () => {
    if (closed) return Promise.resolve();
    closed = true;
    return new Promise((resolve) => io.close(async () => { await stopRealtime(); resolve(); }));
  };
  servers.push(shutdown);
  return { url, shutdown };
}

const clients = [];
const next = (client, event, ms = 2000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Timed out waiting for "${event}"`)), ms);
  client.once(event, (payload) => { clearTimeout(timer); resolve(payload); });
});

async function join(url, name, playerKey) {
  const client = connectClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  clients.push(client);
  await next(client, 'connect');
  const state = next(client, 'room-state');
  client.emit('join-room', { roomId: 'TEAM01', playerName: name, playerKey });
  return { client, state: await state };
}

beforeEach(() => mockStore.clear());

afterEach(async () => {
  while (clients.length) clients.pop().disconnect();
  while (servers.length) await servers.pop()(); // also when a test failed halfway
});

it('keeps votes, round name and spectators across a restart', async () => {
  // ── Server A: a round in progress ──────────────────────────────────────
  const a = await startServer();
  const alice = await join(a.url, 'Alice', 'key-alice');
  const bob = await join(a.url, 'Bob', 'key-bob');
  const carol = await join(a.url, 'Carol', 'key-carol');

  alice.client.emit('set-round-name', { name: 'Story 42' });
  alice.client.emit('vote', { value: '5' });
  bob.client.emit('vote', { value: '8' });
  carol.client.emit('toggle-spectator');
  await new Promise((r) => setTimeout(r, 100));

  await a.shutdown(); // deploy: SIGTERM → graceful shutdown
  expect(mockStore.get('TEAM01')).toMatchObject({
    roundName: 'Story 42',
    revealed: false,
    players: {
      'key-alice': { vote: '5', spectator: false },
      'key-bob': { vote: '8', spectator: false },
      'key-carol': { vote: null, spectator: true },
    },
  });

  // ── Server B: players come back with their keys ────────────────────────
  const b = await startServer();
  const alice2 = await join(b.url, 'Alice', 'key-alice');
  expect(alice2.state).toMatchObject({ roundName: 'Story 42', revealed: false, myVote: '5' });

  const joined = next(alice2.client, 'player-joined');
  const bob2 = await join(b.url, 'Bob', 'key-bob');
  expect(await joined).toMatchObject({ name: 'Bob', hasVoted: true, vote: null });
  expect(bob2.state.myVote).toBe('8');
  expect(bob2.state.players.find((p) => p.name === 'Alice')).toMatchObject({ hasVoted: true, vote: null });

  const carol2 = await join(b.url, 'Carol', 'key-carol');
  expect(carol2.state.players.find((p) => p.isMe).spectator).toBe(true);

  // A newcomer without a saved key starts empty
  const dave = await join(b.url, 'Dave', 'key-dave');
  expect(dave.state.myVote).toBeNull();

  // The restored votes count: Dave still has to vote, so countdown → reveal
  const revealed = next(alice2.client, 'cards-revealed', 6000);
  alice2.client.emit('reveal');
  const result = await revealed;
  const votes = Object.fromEntries(result.players.map((p) => [p.name, p.vote]));
  expect(votes).toMatchObject({ Alice: '5', Bob: '8', Carol: null, Dave: null });
  expect(result.roundName).toBe('Story 42');

  await b.shutdown();
}, 20000);

it('a refresh on the same server keeps the vote too', async () => {
  const s = await startServer();
  const first = await join(s.url, 'Eve', 'key-eve');
  first.client.emit('vote', { value: '13' });
  await new Promise((r) => setTimeout(r, 50));
  first.client.disconnect(); // page refresh: the old socket goes away …
  await new Promise((r) => setTimeout(r, 50));
  const again = await join(s.url, 'Eve', 'key-eve'); // … and the same tab rejoins
  expect(again.state.myVote).toBe('13');
  await s.shutdown();
});
