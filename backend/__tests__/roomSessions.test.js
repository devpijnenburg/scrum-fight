// Room lifecycle tests: timers, eviction and REST-triggered changes.
// Uses fake timers and a recording fake of io.to(room).emit().

jest.mock('../src/domains/rooms/roomRepository', () => ({
  deleteRoom: jest.fn().mockResolvedValue(),
  touchLastActive: jest.fn().mockResolvedValue(),
}));

const roomRepository = require('../src/domains/rooms/roomRepository');
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
  sessions = createRoomSessions(io, { guestTtlMs: 1000, emptyRoomTtlMs: 500, countdownStepMs: 100 });
});

afterEach(() => {
  sessions.stopAll();
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe('open', () => {
  it('reuses the live room on subsequent joins', () => {
    const a = sessions.open(dbRoom());
    a.addPlayer('s1', { name: 'Alice' });
    expect(sessions.open(dbRoom())).toBe(a);
    expect(sessions.size).toBe(1);
  });
});

describe('guest rooms', () => {
  it('expire after inactivity: clients are told and the DB row is deleted', async () => {
    sessions.open(dbRoom({ is_guest: true }));
    sessions.touch('ROOM01');

    await jest.advanceTimersByTimeAsync(1000);

    expect(io.emitted).toContainEqual({ room: 'ROOM01', event: 'room-expired', payload: { reason: 'inactivity' } });
    expect(roomRepository.deleteRoom).toHaveBeenCalledWith('ROOM01');
    expect(sessions.get('ROOM01')).toBeNull();
  });

  it('activity postpones the expiry', async () => {
    sessions.open(dbRoom({ is_guest: true }));
    sessions.touch('ROOM01');
    await jest.advanceTimersByTimeAsync(800);
    sessions.touch('ROOM01');
    await jest.advanceTimersByTimeAsync(800);
    expect(sessions.get('ROOM01')).not.toBeNull();
  });

  it('stay in memory while empty (until the inactivity timer)', async () => {
    const room = sessions.open(dbRoom({ is_guest: true }));
    room.addPlayer('s1', { name: 'Alice' });
    room.removePlayer('s1');
    sessions.playerLeft('ROOM01');
    await jest.advanceTimersByTimeAsync(600);
    expect(sessions.get('ROOM01')).not.toBeNull();
  });

  it('claiming cancels the expiry and announces it', async () => {
    const room = sessions.open(dbRoom({ is_guest: true }));
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
    const room = sessions.open(dbRoom());
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
    const room = sessions.open(dbRoom());
    room.addPlayer('s1', { name: 'Alice' });
    room.removePlayer('s1');
    sessions.playerLeft('ROOM01');

    await jest.advanceTimersByTimeAsync(300);
    sessions.open(dbRoom()).addPlayer('s2', { name: 'Alice' });
    await jest.advanceTimersByTimeAsync(1000);

    expect(sessions.get('ROOM01')).toBe(room);
  });
});

describe('countdown', () => {
  it('counts down and then calls onDone', async () => {
    sessions.open(dbRoom());
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
    sessions.open(dbRoom());
    const onDone = jest.fn();
    sessions.startCountdown('ROOM01', onDone);
    expect(sessions.cancelCountdown('ROOM01')).toBe(true);
    await jest.advanceTimersByTimeAsync(1000);
    expect(onDone).not.toHaveBeenCalled();
    expect(sessions.cancelCountdown('ROOM01')).toBe(false);
  });

  it('is cancelled when the last player leaves', async () => {
    const room = sessions.open(dbRoom());
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
    sessions.open(dbRoom({ is_guest: true }));
    sessions.touch('ROOM01');
    sessions.startCountdown('ROOM01', jest.fn());

    sessions.close('ROOM01');

    expect(io.emitted).toContainEqual({ room: 'ROOM01', event: 'room-expired', payload: { reason: 'deleted' } });
    expect(sessions.get('ROOM01')).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });
});
