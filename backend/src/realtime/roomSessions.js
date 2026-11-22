// Lifecycle of the in-memory game rooms: creation, timers and cleanup.
//
// Owns everything time-based around a GameRoom — the reveal countdown, the
// guest-room inactivity expiry and the eviction of empty permanent rooms —
// so the socket handlers stay thin and no timer outlives its room.

const { GameRoom } = require('../domain/game/gameRoom');
const roomRepository = require('../domain/rooms/roomRepository');

const DEFAULT_TIMING = {
  guestTtlMs: 60 * 60 * 1000,      // guest room expires after 1h of inactivity
  emptyRoomTtlMs: 10 * 60 * 1000,  // permanent room leaves memory 10 min after the last player
  countdownStepMs: 1000,           // 3-2-1 reveal countdown
  countdownFrom: 3,
};

function createRoomSessions(io, timingOverrides = {}) {
  const timing = { ...DEFAULT_TIMING, ...timingOverrides };

  const rooms = new Map();        // roomId → GameRoom
  const guestTimers = new Map();  // roomId → timeout
  const emptyTimers = new Map();  // roomId → timeout
  const countdowns = new Map();   // roomId → timeout[]

  const clear = (map, id) => {
    const handle = map.get(id);
    if (handle === undefined) return false;
    for (const t of [].concat(handle)) clearTimeout(t);
    map.delete(id);
    return true;
  };

  function get(roomId) {
    return rooms.get(roomId) || null;
  }

  // Returns the live room for a DB row, creating it on first join.
  function open(dbRoom) {
    let room = rooms.get(dbRoom.id);
    if (!room) {
      room = new GameRoom({
        id: dbRoom.id,
        name: dbRoom.name,
        method: dbRoom.method,
        isGuest: dbRoom.is_guest,
      });
      rooms.set(room.id, room);
    }
    clear(emptyTimers, room.id);
    return room;
  }

  // Drops a room from memory and cancels all of its timers.
  function evict(roomId) {
    clear(guestTimers, roomId);
    clear(emptyTimers, roomId);
    clear(countdowns, roomId);
    rooms.delete(roomId);
  }

  // ── Activity / guest expiry ───────────────────────────────────────────────

  function scheduleGuestExpiry(roomId) {
    clear(guestTimers, roomId);
    const timer = setTimeout(async () => {
      guestTimers.delete(roomId);
      if (!rooms.has(roomId)) return;
      io.to(roomId).emit('room-expired', { reason: 'inactivity' });
      evict(roomId);
      try {
        await roomRepository.deleteRoom(roomId);
      } catch (err) {
        console.error('[realtime] Error deleting expired guest room:', err);
      }
    }, timing.guestTtlMs);
    timer.unref?.(); // lifecycle timers must not keep the process alive
    guestTimers.set(roomId, timer);
  }

  // Records activity: guest rooms restart their inactivity timer, every room
  // bumps last_active in the database.
  function touch(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    if (room.isGuest) scheduleGuestExpiry(roomId);
    roomRepository.touchLastActive(roomId).catch((err) =>
      console.error('[realtime] Error updating last_active:', err));
  }

  // Called after a player left. Empty permanent rooms are evicted after a
  // grace period (long enough to survive a page refresh or reconnect);
  // empty guest rooms keep living until their inactivity timer fires.
  function playerLeft(roomId) {
    const room = rooms.get(roomId);
    if (!room || !room.isEmpty) return;
    clear(countdowns, roomId);
    if (room.isGuest) return;
    clear(emptyTimers, roomId);
    const timer = setTimeout(() => {
      emptyTimers.delete(roomId);
      if (rooms.get(roomId)?.isEmpty) evict(roomId);
    }, timing.emptyRoomTtlMs);
    timer.unref?.();
    emptyTimers.set(roomId, timer);
  }

  // ── Countdown ─────────────────────────────────────────────────────────────

  function hasCountdown(roomId) {
    return countdowns.has(roomId);
  }

  // Broadcasts countdownFrom … 1, then calls onDone(room) if the room still
  // exists and has not been revealed in the meantime.
  function startCountdown(roomId, onDone) {
    if (countdowns.has(roomId)) return false;
    const { countdownFrom, countdownStepMs } = timing;
    io.to(roomId).emit('countdown', { count: countdownFrom });

    const timers = [];
    for (let step = 1; step < countdownFrom; step++) {
      timers.push(setTimeout(
        () => io.to(roomId).emit('countdown', { count: countdownFrom - step }),
        step * countdownStepMs
      ));
    }
    timers.push(setTimeout(() => {
      countdowns.delete(roomId);
      const room = rooms.get(roomId);
      if (room && !room.revealed) onDone(room);
    }, countdownFrom * countdownStepMs));

    countdowns.set(roomId, timers);
    return true;
  }

  // Returns true when a running countdown was cancelled.
  function cancelCountdown(roomId) {
    return clear(countdowns, roomId);
  }

  // ── Changes triggered from the REST layer ─────────────────────────────────

  // A logged-in user claimed a guest room: it becomes permanent.
  function claim(roomId) {
    clear(guestTimers, roomId);
    const room = rooms.get(roomId);
    if (!room) return;
    room.isGuest = false;
    io.to(roomId).emit('room-claimed');
    playerLeft(roomId); // starts the empty-room grace period if nobody is in it
  }

  // The room was deleted: tell everyone in it and forget it.
  function close(roomId, reason = 'deleted') {
    if (!rooms.has(roomId)) return;
    io.to(roomId).emit('room-expired', { reason });
    evict(roomId);
  }

  function stopAll() {
    for (const id of [...rooms.keys()]) evict(id);
  }

  return {
    timing,
    get,
    open,
    evict,
    touch,
    playerLeft,
    hasCountdown,
    startCountdown,
    cancelCountdown,
    claim,
    close,
    stopAll,
    get size() { return rooms.size; },
  };
}

module.exports = { createRoomSessions, DEFAULT_TIMING };
