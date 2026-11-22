// Room lifecycle tests: timers, eviction and REST-triggered changes.
// Uses fake timers and a recording fake of io.to(room).emit().

jest.mock('../src/domains/game/liveRoundRepository', () => ({
  loadLiveRound: jest.fn().mockResolvedValue(null),
  saveLiveRound: jest.fn().mockResolvedValue(),
}));
jest.mock('../src/domains/rooms/roomRepository', () => ({
  deleteRoom: jest.fn().mockResolvedValue(),
  touchLastActive: jest.fn().mockResolvedValue(),
}));

const roomRepository = require('../src/domains/rooms/roomRepository');
const liveRounds = require('../src/domains/game/liveRoundRepository');
const { createRoomSessions } = require('../src/realtime/roomSessions');

function fakeIo() {
  const emitted = [];
  return {
    emitted,
    to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }),
  };
}

const dbRoom = (overrides = {}) => ({ id: 'ROOM01', name: 'Team', method: 'fibonacci', is_guest: false, ...overrides });

let io;
let sessions;

beforeEach(() => {
  jest.useFakeTimers();
  io = fakeIo();
  sessions = createRoomSessions(io, { guestTtlMs: 1000, emptyRoomTtlMs: 500, countdownStepMs: 100, persistDelayMs: 50 });
});

afterEach(() => {
  sessions.stopAll();
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe('open', () => {
  it('reuses the live room on subsequent joins', async () => {
    const a = await sessions.open(dbRoom());
    a.addPlayer('s1', { name: 'Alice' });
    expect(await sessions.open(dbRoom())).toBe(a);
    expect(sessions.size).toBe(1);
  });
});

describe('guest rooms', () => {
  it('expire after inactivity: clients are told and the DB row is deleted', async () => {
    await sessions.open(dbRoom({ is_guest: true }));
    sessions.touch('ROOM01');

    await jest.advanceTimersByTimeAsync(1000);

    expect(io.emitted).toContainEqual({ room: 'ROOM01', event: 'room-expired', payload: { reason: 'inactivity' } });
    expect(roomRepository.deleteRoom).toHaveBeenCalledWith('ROOM01');
    expect(sessions.get('ROOM01')).toBeNull();
  });

  it('activity postpones the expiry', async () => {
    await sessions.open(dbRoom({ is_guest: true }));
    sessions.touch('ROOM01');
    await jest.advanceTimersByTimeAsync(800);
    sessions.touch('ROOM01');
    await jest.advanceTimersByTimeAsync(800);
    expect(sessions.get('ROOM01')).not.toBeNull();
  });

  it('stay in memory while empty (until the inactivity timer)', async () => {
    const room = await sessions.open(dbRoom({ is_guest: true }));
    room.addPlayer('s1', { name: 'Alice' });
    room.removePlayer('s1');
    sessions.playerLeft('ROOM01');
    await jest.advanceTimersByTimeAsync(600);
    expect(sessions.get('ROOM01')).not.toBeNull();
  });

  it('claiming cancels the expiry and announces it', async () => {
    const room = await sessions.open(dbRoom({ is_guest: true }));
    room.addPlayer('s1', { name: 'Alice' });
    sessions.touch('ROOM01');

    sessions.claim('ROOM01');
    await jest.advanceTimersByTimeAsync(5000);

    expect(room.isGuest).toBe(false);
    expect(io.emitted).toContainEqual({ room: 'ROOM01', event: 'room-claimed', payload: undefined });
    expect(roomRepository.deleteRoom).not.toHaveBeenCalled();
    expect(sessions.get('ROOM01')).toBe(room);
  });
});

describe('permanent rooms', () => {
  it('are evicted from memory after the empty-room grace period', async () => {
    const room = await sessions.open(dbRoom());
    room.addPlayer('s1', { name: 'Alice' });
    room.removePlayer('s1');
    sessions.playerLeft('ROOM01');

    await jest.advanceTimersByTimeAsync(499);
    expect(sessions.get('ROOM01')).toBe(room);
    await jest.advanceTimersByTimeAsync(1);
    expect(sessions.get('ROOM01')).toBeNull();
    expect(roomRepository.deleteRoom).not.toHaveBeenCalled();
  });

  it('a rejoin within the grace period keeps the room', async () => {
    const room = await sessions.open(dbRoom());
    room.addPlayer('s1', { name: 'Alice' });
    room.removePlayer('s1');
    sessions.playerLeft('ROOM01');

    await jest.advanceTimersByTimeAsync(300);
    (await sessions.open(dbRoom())).addPlayer('s2', { name: 'Alice' });
    await jest.advanceTimersByTimeAsync(1000);

    expect(sessions.get('ROOM01')).toBe(room);
  });
});

describe('countdown', () => {
  it('counts down and then calls onDone', async () => {
    await sessions.open(dbRoom());
    const onDone = jest.fn();
    expect(sessions.startCountdown('ROOM01', onDone)).toBe(true);
    expect(sessions.startCountdown('ROOM01', onDone)).toBe(false); // already running

    await jest.advanceTimersByTimeAsync(300);

    const counts = io.emitted.filter((e) => e.event === 'countdown').map((e) => e.payload.count);
    expect(counts).toEqual([3, 2, 1]);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(sessions.hasCountdown('ROOM01')).toBe(false);
  });

  it('can be cancelled', async () => {
    await sessions.open(dbRoom());
    const onDone = jest.fn();
    sessions.startCountdown('ROOM01', onDone);
    expect(sessions.cancelCountdown('ROOM01')).toBe(true);
    await jest.advanceTimersByTimeAsync(1000);
    expect(onDone).not.toHaveBeenCalled();
    expect(sessions.cancelCountdown('ROOM01')).toBe(false);
  });

  it('is cancelled when the last player leaves', async () => {
    const room = await sessions.open(dbRoom());
    room.addPlayer('s1', { name: 'Alice' });
    const onDone = jest.fn();
    sessions.startCountdown('ROOM01', onDone);

    room.removePlayer('s1');
    sessions.playerLeft('ROOM01');
    await jest.advanceTimersByTimeAsync(1000);

    expect(onDone).not.toHaveBeenCalled();
  });
});

describe('close', () => {
  it('tells clients and forgets the room including its timers', async () => {
    await sessions.open(dbRoom({ is_guest: true }));
    sessions.touch('ROOM01');
    sessions.startCountdown('ROOM01', jest.fn());

    sessions.close('ROOM01');

    expect(io.emitted).toContainEqual({ room: 'ROOM01', event: 'room-expired', payload: { reason: 'deleted' } });
    expect(sessions.get('ROOM01')).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('live round persistence', () => {
  it('restores the saved round when a room is opened', async () => {
    liveRounds.loadLiveRound.mockResolvedValueOnce({ roundName: 'Saved', revealed: false, players: { k: { vote: '8' } } });
    const room = await sessions.open(dbRoom());
    expect(room.roundName).toBe('Saved');
    expect(room.addPlayer('s1', { name: 'A', key: 'k' }).vote).toBe('8');
  });

  it('loads the saved round only once for concurrent joins', async () => {
    const [a, b] = await Promise.all([sessions.open(dbRoom()), sessions.open(dbRoom())]);
    expect(a).toBe(b);
    expect(liveRounds.loadLiveRound).toHaveBeenCalledTimes(1);
  });

  it('starts fresh when loading the saved round fails', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    liveRounds.loadLiveRound.mockRejectedValueOnce(new Error('db down'));
    const room = await sessions.open(dbRoom());
    expect(room.roundName).toBe('');
    spy.mockRestore();
  });

  it('batches rapid changes into one save of the latest snapshot', async () => {
    const room = await sessions.open(dbRoom());
    room.addPlayer('s1', { name: 'A', key: 'k' });
    room.castVote('s1', '3');
    sessions.persist('ROOM01');
    room.castVote('s1', '5');
    sessions.persist('ROOM01');
    await jest.advanceTimersByTimeAsync(50);
    expect(liveRounds.saveLiveRound).toHaveBeenCalledTimes(1);
    expect(liveRounds.saveLiveRound).toHaveBeenCalledWith('ROOM01', expect.objectContaining({
      players: { k: { vote: '5', spectator: false } },
    }));
  });

  it('flushAll writes pending saves immediately (graceful shutdown)', async () => {
    const room = await sessions.open(dbRoom());
    room.addPlayer('s1', { name: 'A', key: 'k' });
    room.castVote('s1', '13');
    sessions.persist('ROOM01');
    await sessions.flushAll();
    expect(liveRounds.saveLiveRound).toHaveBeenCalledWith('ROOM01', expect.objectContaining({
      players: { k: { vote: '13', spectator: false } },
    }));
  });

  it('evicting an empty room writes a pending save first; deleting it does not', async () => {
    const room = await sessions.open(dbRoom());
    room.addPlayer('s1', { name: 'A', key: 'k' });
    room.castVote('s1', '2');
    sessions.persist('ROOM01');
    sessions.evict('ROOM01');
    await sessions.flushAll();
    expect(liveRounds.saveLiveRound).toHaveBeenCalledTimes(1);

    liveRounds.saveLiveRound.mockClear();
    const again = await sessions.open(dbRoom());
    again.addPlayer('s2', { name: 'B', key: 'b' });
    sessions.persist('ROOM01');
    sessions.close('ROOM01');
    await jest.advanceTimersByTimeAsync(100);
    expect(liveRounds.saveLiveRound).not.toHaveBeenCalled();
  });
});
