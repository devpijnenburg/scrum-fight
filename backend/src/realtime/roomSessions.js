// Lifecycle of the in-memory game rooms: creation, timers and cleanup.
//
// Owns everything time-based around a GameRoom — the reveal countdown, the
// guest-room inactivity expiry and the eviction of empty permanent rooms —
// so the socket handlers stay thin and no timer outlives its room.

const { GameRoom } = require('../domains/game/gameRoom');
const roomRepository = require('../domains/rooms/roomRepository');
const liveRounds = require('../domains/game/liveRoundRepository');
const { createLogger } = require('../shared/logger');

const log = createLogger('realtime:rooms');
const roomType = (room) => (room.isGuest ? 'guest' : 'saved');

const DEFAULT_TIMING = {
  guestTtlMs: 60 * 60 * 1000,      // guest room expires after 1h of inactivity
  emptyRoomTtlMs: 10 * 60 * 1000,  // permanent room leaves memory 10 min after the last player
  countdownStepMs: 1000,           // 3-2-1 reveal countdown
  countdownFrom: 3,
  persistDelayMs: 200,             // batch rapid changes before writing the live round
  statusIntervalMs: 5 * 60 * 1000, // periodic "Status" log line (0 = off)
};

function createRoomSessions(io, timingOverrides = {}) {
  const timing = { ...DEFAULT_TIMING, ...timingOverrides };

  const rooms = new Map();        // roomId → GameRoom
  const guestTimers = new Map();  // roomId → timeout
  const emptyTimers = new Map();  // roomId → timeout
  const countdowns = new Map();   // roomId → timeout[]
  const loading = new Map();      // roomId → Promise<GameRoom> while the saved round loads
  const persistTimers = new Map();// roomId → timeout (debounced save)
  const writes = new Map();       // roomId → Promise of the last save (keeps saves in order)

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

  // Returns the live room for a DB row. On first join the room is created
  // and the round saved before a restart (if any) is restored into it.
  async function open(dbRoom) {
    const existing = rooms.get(dbRoom.id);
    if (existing) {
      if (clear(emptyTimers, existing.id)) log.debug('Lege kamer weer in gebruik, opruimen geannuleerd', { room: existing.id });
      return existing;
    }
    if (!loading.has(dbRoom.id)) {
      loading.set(dbRoom.id, (async () => {
        const room = new GameRoom({
          id: dbRoom.id,
          name: dbRoom.name,
          method: dbRoom.method,
          isGuest: dbRoom.is_guest,
        });
        let restored = false;
        try {
          const saved = await liveRounds.loadLiveRound(room.id);
          room.restore(saved);
          restored = Boolean(saved);
        } catch (err) {
          log.error('Opgeslagen ronde laden mislukt, kamer start met een lege ronde', { room: room.id }, err);
        }
        rooms.set(room.id, room);
        log.info('Kamer geopend', {
          room: room.id,
          type: roomType(room),
          method: room.method,
          restoredRound: restored || undefined,
          absentPlayers: restored ? room.absent.size : undefined,
          openRooms: rooms.size,
        });
        return room;
      })().finally(() => loading.delete(dbRoom.id)));
    }
    const room = await loading.get(dbRoom.id);
    clear(emptyTimers, room.id);
    return room;
  }

  // ── Live round persistence ────────────────────────────────────────────────

  function writeNow(roomId) {
    clear(persistTimers, roomId);
    const room = rooms.get(roomId);
    if (!room) return writes.get(roomId) || Promise.resolve();
    const state = room.snapshot();
    const previous = writes.get(roomId) || Promise.resolve();
    const write = previous
      .then(() => liveRounds.saveLiveRound(roomId, state))
      .catch((err) => log.error('Lopende ronde opslaan mislukt', { room: roomId }, err));
    writes.set(roomId, write);
    write.finally(() => { if (writes.get(roomId) === write) writes.delete(roomId); });
    return write;
  }

  // Schedules a save of the room's round (debounced).
  function persist(roomId) {
    if (!rooms.has(roomId) || persistTimers.has(roomId)) return;
    const timer = setTimeout(() => writeNow(roomId), timing.persistDelayMs);
    timer.unref?.();
    persistTimers.set(roomId, timer);
  }

  // Writes every pending save now and waits for all saves (used on shutdown).
  async function flushAll() {
    log.info('Lopende rondes opslaan voor afsluiten', { openRooms: rooms.size, pendingSaves: persistTimers.size });
    const pending = [...persistTimers.keys()].map((id) => writeNow(id));
    await Promise.all([...pending, ...writes.values()]);
  }

  // Drops a room from memory and cancels all of its timers. A pending save
  // is written first (unless the room itself was deleted).
  function evict(roomId, { keepRound = true, reason = 'empty' } = {}) {
    const existed = rooms.has(roomId);
    if (keepRound && persistTimers.has(roomId)) writeNow(roomId);
    clear(persistTimers, roomId);
    clear(guestTimers, roomId);
    clear(emptyTimers, roomId);
    clear(countdowns, roomId);
    rooms.delete(roomId);
    if (existed) log.info('Kamer gesloten', { room: roomId, reason, openRooms: rooms.size });
  }

  // ── Activity / guest expiry ───────────────────────────────────────────────

  function scheduleGuestExpiry(roomId) {
    clear(guestTimers, roomId);
    const timer = setTimeout(async () => {
      guestTimers.delete(roomId);
      const room = rooms.get(roomId);
      if (!room) return;
      log.info('Gastkamer verlopen door inactiviteit', {
        room: roomId, players: room.playerCount, idleMinutes: Math.round(timing.guestTtlMs / 60000),
      });
      io.to(roomId).emit('room-expired', { reason: 'inactivity' });
      evict(roomId, { keepRound: false, reason: 'guest-expired' });
      try {
        await roomRepository.deleteRoom(roomId);
      } catch (err) {
        log.error('Verlopen gastkamer verwijderen mislukt', { room: roomId }, err);
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
      log.error('last_active bijwerken mislukt', { room: roomId }, err));
  }

  // Called after a player left. Empty permanent rooms are evicted after a
  // grace period (long enough to survive a page refresh or reconnect);
  // empty guest rooms keep living until their inactivity timer fires.
  function playerLeft(roomId) {
    const room = rooms.get(roomId);
    if (!room || !room.isEmpty) return;
    if (clear(countdowns, roomId)) log.debug('Countdown gestopt: kamer is leeg', { room: roomId });
    if (room.isGuest) {
      log.info('Kamer is leeg, gastkamer blijft tot de inactiviteitstimer afloopt', { room: roomId });
      return;
    }
    clear(emptyTimers, roomId);
    log.info('Kamer is leeg, wordt uit het geheugen gehaald als niemand terugkomt', {
      room: roomId, graceMinutes: Math.round(timing.emptyRoomTtlMs / 60000),
    });
    const timer = setTimeout(() => {
      emptyTimers.delete(roomId);
      if (rooms.get(roomId)?.isEmpty) evict(roomId, { reason: 'empty' });
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
    log.info('Live kamer is nu permanent (geclaimd)', { room: roomId, players: room.playerCount });
    io.to(roomId).emit('room-claimed');
    playerLeft(roomId); // starts the empty-room grace period if nobody is in it
  }

  // The room was deleted: tell everyone in it and forget it.
  function close(roomId, reason = 'deleted') {
    const room = rooms.get(roomId);
    if (!room) return;
    log.info('Live kamer gesloten, spelers worden weggestuurd', { room: roomId, reason, players: room.playerCount });
    io.to(roomId).emit('room-expired', { reason });
    evict(roomId, { keepRound: false, reason });
  }

  function stopAll() {
    clearInterval(statusTimer);
    for (const id of [...rooms.keys()]) evict(id, { reason: 'shutdown' });
  }

  // ── Periodieke status ─────────────────────────────────────────────────────

  function stats() {
    let players = 0;
    let spectators = 0;
    for (const room of rooms.values()) {
      for (const player of room.players.values()) {
        players += 1;
        if (player.spectator) spectators += 1;
      }
    }
    return { openRooms: rooms.size, players, spectators };
  }

  // Eén regel per interval zolang er kamers open zijn, plus één keer als de
  // laatste kamer dicht is gegaan. Een lege server logt dus niets.
  let lastHadRooms = false;
  function reportStatus() {
    const current = stats();
    if (!current.openRooms && !lastHadRooms) return null;
    lastHadRooms = current.openRooms > 0;
    const fields = {
      ...current,
      sockets: io.engine?.clientsCount,
      rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    };
    log.info('Status', fields);
    return fields;
  }

  const statusTimer = timing.statusIntervalMs > 0 ? setInterval(reportStatus, timing.statusIntervalMs) : null;
  statusTimer?.unref?.();

  return {
    timing,
    get,
    open,
    evict,
    persist,
    flushAll,
    touch,
    playerLeft,
    hasCountdown,
    startCountdown,
    cancelCountdown,
    claim,
    close,
    stopAll,
    stats,
    reportStatus,
    get size() { return rooms.size; },
  };
}

module.exports = { createRoomSessions, DEFAULT_TIMING };
