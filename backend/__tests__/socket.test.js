// Socket handler robustness tests.
// Uses an in-process fake of the socket.io server/socket API, so no network
// or database is needed.

jest.mock('../src/shared/database', () => ({ query: jest.fn(), connect: jest.fn() }));

const { EventEmitter } = require('events');
const db = require('../src/shared/database');
const setupSocket = require('../src/realtime');

function createFakeIo() {
  const io = new EventEmitter();
  io.broadcasts = []; // { room, event, payload }
  io.to = (room) => ({
    emit: (event, payload) => io.broadcasts.push({ room, event, payload }),
  });
  return io;
}

let socketSeq = 0;
function connect(io) {
  const socket = new EventEmitter();
  socket.id = `sock-${++socketSeq}`;
  socket.data = {};
  socket.rooms = new Set();
  socket.sent = []; // { event, payload } emitted to this socket only
  const realEmit = socket.emit.bind(socket);
  // Client → server: trigger(event, payload). Server → client: socket.emit.
  socket.trigger = (event, ...args) => realEmit(event, ...args);
  socket.emit = (event, payload) => { socket.sent.push({ event, payload }); return true; };
  socket.join = (room) => socket.rooms.add(room);
  socket.leave = (room) => socket.rooms.delete(room);
  socket.to = (room) => ({
    emit: (event, payload) => io.broadcasts.push({ room, event, payload, except: socket.id }),
  });
  io.emit('connection', socket);
  return socket;
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

const EVENTS = [
  'join-room', 'vote', 'toggle-spectator', 'reveal', 'new-round',
  'set-round-name', 'react', 'update-room-name', 'disconnect',
];
const BAD_PAYLOADS = [undefined, null, 42, 'text', [], [1, 2], { value: 5 }, { name: {} }];

let io;
let sessions;
let errorSpy;

beforeEach(() => {
  io = createFakeIo();
  sessions = setupSocket(io);
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  db.query.mockReset();
  db.query.mockResolvedValue({ rows: [] });
  // Transactions run on a dedicated client that shares the same query mock
  db.connect.mockImplementation(async () => ({ query: (...args) => db.query(...args), release: () => {} }));
});

afterEach(() => {
  sessions.stopAll();
  errorSpy.mockRestore();
  jest.useRealTimers();
});

describe('payload validation', () => {
  it.each(EVENTS)('"%s" never throws on malformed payloads', async (event) => {
    const socket = connect(io);
    for (const payload of BAD_PAYLOADS) {
      expect(() => socket.trigger(event, payload)).not.toThrow();
    }
    await flush();
  });

  it('join-room without a room id reports ROOM_NOT_FOUND', async () => {
    const socket = connect(io);
    socket.trigger('join-room');
    await flush();
    expect(socket.sent).toContainEqual({
      event: 'error',
      payload: expect.objectContaining({ code: 'ROOM_NOT_FOUND' }),
    });
  });

  it('join-room with a non-string name reports NAME_REQUIRED', async () => {
    const socket = connect(io);
    socket.trigger('join-room', { roomId: 'ABC123', playerName: { evil: true } });
    await flush();
    expect(socket.sent).toContainEqual({
      event: 'error',
      payload: expect.objectContaining({ code: 'NAME_REQUIRED' }),
    });
  });
});

describe('error handling', () => {
  it('join-room reports SERVER_ERROR instead of crashing when the DB fails', async () => {
    db.query.mockRejectedValue(new Error('connection refused'));
    const socket = connect(io);

    socket.trigger('join-room', { roomId: 'abc123', playerName: 'Alice' });
    await flush();

    expect(socket.sent).toContainEqual({
      event: 'error',
      payload: expect.objectContaining({ code: 'SERVER_ERROR' }),
    });
    expect(errorSpy).toHaveBeenCalled();
  });

  it('a failing room-name update is logged, not propagated', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'ROOMB1', name: 'R', method: 'fibonacci', is_guest: false, owner_id: null }] });
    const socket = connect(io);
    socket.trigger('join-room', { roomId: 'ROOMB1', playerName: 'Alice' });
    await flush();

    db.query.mockRejectedValue(new Error('db down'));
    socket.trigger('update-room-name', { name: 'New name' });
    await flush();

    expect(io.broadcasts).toContainEqual(
      expect.objectContaining({ event: 'room-name-updated', payload: { name: 'New name' } })
    );
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('room flow', () => {
  const dbRoom = { id: 'ROOMA1', name: 'Team', method: 'fibonacci', is_guest: false, owner_id: null };

  async function joinRoom(name, roomId = dbRoom.id) {
    db.query.mockResolvedValueOnce({ rows: [{ ...dbRoom, id: roomId }] });
    const socket = connect(io);
    socket.trigger('join-room', { roomId: roomId.toLowerCase(), playerName: name });
    await flush();
    return socket;
  }

  it('joins, votes and reveals', async () => {
    const alice = await joinRoom('Alice');
    const state = alice.sent.find((m) => m.event === 'room-state');
    expect(state.payload).toMatchObject({ id: 'ROOMA1', players: [expect.objectContaining({ name: 'Alice' })] });

    alice.trigger('vote', { value: '5' });
    expect(io.broadcasts).toContainEqual(expect.objectContaining({ event: 'player-voted' }));

    alice.trigger('reveal');
    await flush();
    const revealed = io.broadcasts.find((b) => b.event === 'cards-revealed');
    expect(revealed.payload.players).toEqual([expect.objectContaining({ name: 'Alice', vote: '5' })]);
  });

  it('ignores votes that are not valid cards for the method', async () => {
    const alice = await joinRoom('Alice', 'ROOMA2');
    alice.trigger('vote', { value: 'XL' });
    alice.trigger('vote', { value: 5 });
    expect(io.broadcasts.filter((b) => b.event === 'player-voted')).toHaveLength(0);
  });

  it('leaves the previous room when joining another one', async () => {
    const alice = await joinRoom('Alice', 'ROOMA3');
    db.query.mockResolvedValueOnce({ rows: [{ ...dbRoom, id: 'ROOMA4' }] });
    alice.trigger('join-room', { roomId: 'ROOMA4', playerName: 'Alice' });
    await flush();

    expect(io.broadcasts).toContainEqual(
      expect.objectContaining({ room: 'ROOMA3', event: 'player-left', payload: expect.objectContaining({ socketId: alice.id }) })
    );
    expect([...alice.rooms]).toEqual(['ROOMA4']);
  });

  it('removes the player on disconnect', async () => {
    const alice = await joinRoom('Alice', 'ROOMA5');
    alice.trigger('disconnect');
    expect(io.broadcasts).toContainEqual(
      expect.objectContaining({ room: 'ROOMA5', event: 'player-left' })
    );
    // A second disconnect is a no-op
    const before = io.broadcasts.length;
    alice.trigger('disconnect');
    expect(io.broadcasts).toHaveLength(before);
  });
});
