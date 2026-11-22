// Socket.io adapter for the game.
//
// Each handler: normalise the payload → ask the GameRoom what changed →
// broadcast and persist. Game rules live in domain/game, timers and room
// lifecycle in roomSessions.

const { verify } = require('../domains/identity/jwt');
const { PLAN_LIMITS } = require('../domains/billing/plans');
const { evaluateBadgesForUser } = require('../domains/badges/badgeEvaluator');
const { isAllowedReaction } = require('../domains/game/gameRoom');
const roomRepository = require('../domains/rooms/roomRepository');
const userRepository = require('../domains/identity/userRepository');
const activityRepository = require('../domains/stats/activityRepository');
const events = require('../shared/events');
const { on, str } = require('../shared/socketHandler');
const { createRoomSessions } = require('./roomSessions');

const REVEAL_COOLDOWN_MS = 2000;
const SPECTATOR_LOG_INTERVAL_MS = 60_000;

// The active sessions, so the REST layer (routes/rooms.js) can notify
// connected clients when a room is claimed or deleted.
let sessions = null;

async function resolveIdentity(token, playerName) {
  const fallback = { userId: null, name: str(playerName, 50), emoticon: '' };
  if (typeof token !== 'string' || !token) return fallback;

  let payload;
  try {
    payload = verify(token);
  } catch {
    return fallback; // invalid/expired token — fall back to provided name
  }
  if (payload.preAuth) return fallback; // a 2FA pre-auth token is not a session
  const user = await userRepository.findById(payload.id);
  if (!user) return fallback;
  return { userId: user.id, name: user.name, emoticon: user.emoticon || '⚔️' };
}

async function participantLimit(dbRoom) {
  if (dbRoom.is_guest || !dbRoom.owner_id) return Infinity;
  const plan = await userRepository.getPlan(dbRoom.owner_id);
  return PLAN_LIMITS[plan]?.maxParticipants ?? PLAN_LIMITS.free.maxParticipants;
}

function setupSocket(io, timing = {}) {
  sessions = createRoomSessions(io, timing);
  const rooms = sessions;

  // REST-side changes to rooms are pushed to connected clients.
  events.removeAllListeners();
  events.on(events.ROOM_CLAIMED, ({ roomId }) => rooms.claim(roomId));
  events.on(events.ROOM_DELETED, ({ roomId }) => rooms.close(roomId, 'deleted'));

  // Reveals the cards, broadcasts the result and persists the round.
  async function reveal(room) {
    const snapshot = room.reveal();
    if (!snapshot) return;

    io.to(room.id).emit('cards-revealed', {
      players: snapshot.players.map(({ socketId, name, vote }) => ({ socketId, name, vote })),
      stats: snapshot.stats,
      roundName: snapshot.roundName,
    });

    try {
      await roomRepository.recordRound(room.id, snapshot.roundName, snapshot.players);
    } catch (err) {
      console.error('[realtime] Error saving round history:', err);
      return;
    }
    if (room.isGuest) rooms.touch(room.id);
    setImmediate(() => announceBadges(room.id, snapshot.players));
  }

  // Fire-and-forget badge evaluation — only after the votes were persisted.
  async function announceBadges(roomId, players) {
    try {
      for (const p of players) {
        if (!p.userId || !p.vote) continue;
        const badgeIds = await evaluateBadgesForUser(p.userId);
        if (!badgeIds.length) continue;
        io.to(p.socketId).emit('badge-earned', { badgeIds });
        for (const badgeId of badgeIds) {
          io.to(roomId).emit('badge-announced', { playerName: p.name, badgeId });
        }
      }
    } catch (err) {
      console.error('[realtime] Badge evaluation failed:', err);
    }
  }

  // Removes a socket from the room it is in (if any) and tells the others.
  function leaveCurrentRoom(socket) {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    socket.data.roomId = null;
    socket.leave(roomId);

    const room = rooms.get(roomId);
    const player = room?.removePlayer(socket.id);
    if (!player) return;

    io.to(roomId).emit('player-left', { socketId: socket.id, name: player.name });
    rooms.playerLeft(roomId);
  }

  io.on('connection', (socket) => {
    // Same shape as REST errors: a stable code (translated by the client via
    // i18n `errors.<CODE>`), a Dutch fallback message and optional details.
    const sendError = (code, message, details = {}) => socket.emit('error', { code, message, ...details });
    // The room this socket is a player in, or null.
    const currentRoom = () => {
      const room = rooms.get(socket.data.roomId);
      return room && room.hasPlayer(socket.id) ? room : null;
    };

    // ── join-room ───────────────────────────────────────────────────────────
    on(socket, 'join-room', async ({ roomId, playerName, token }) => {
      const id = str(roomId, 20).toUpperCase();
      if (!id) return sendError('ROOM_NOT_FOUND', 'Kamer niet gevonden');

      const { userId, name, emoticon } = await resolveIdentity(token, playerName);
      if (!name) return sendError('NAME_REQUIRED', 'Voer een naam in');

      const dbRoom = await roomRepository.findRoomById(id);
      if (!dbRoom) return sendError('ROOM_NOT_FOUND', 'Kamer niet gevonden');

      const limit = await participantLimit(dbRoom);
      const live = rooms.get(id);
      if ((live?.playerCount ?? 0) >= limit && !live?.hasPlayer(socket.id)) {
        return sendError('ROOM_FULL', `Kamer is vol (max ${limit} deelnemers voor dit plan)`, { limit });
      }

      // A socket is a player in at most one room.
      if (socket.data.roomId && socket.data.roomId !== id) leaveCurrentRoom(socket);

      const room = rooms.open(dbRoom);
      room.addPlayer(socket.id, { name, userId, emoticon });
      socket.join(id);
      socket.data.roomId = id;

      socket.emit('room-state', room.toClientState(socket.id));
      socket.to(id).emit('player-joined', {
        socketId: socket.id,
        name,
        emoticon,
        hasVoted: false,
        spectator: false,
      });

      rooms.touch(id);
    }, { onError: () => sendError('SERVER_ERROR', 'Serverfout') });

    // ── vote ────────────────────────────────────────────────────────────────
    on(socket, 'vote', ({ value }) => {
      const room = currentRoom();
      if (!room || !room.castVote(socket.id, value)) return;
      io.to(room.id).emit('player-voted', { socketId: socket.id });
      if (room.isGuest) rooms.touch(room.id);
    });

    // ── toggle-spectator ────────────────────────────────────────────────────
    on(socket, 'toggle-spectator', () => {
      const room = currentRoom();
      if (!room) return;
      const spectator = room.toggleSpectator(socket.id);
      if (spectator === null) return;

      const player = room.getPlayer(socket.id);
      if (spectator && player.userId) {
        const now = Date.now();
        if (!player.lastSpectatorLog || now - player.lastSpectatorLog > SPECTATOR_LOG_INTERVAL_MS) {
          player.lastSpectatorLog = now;
          activityRepository.recordSpectatorSession(player.userId, room.id).catch(console.error);
        }
      }

      io.to(room.id).emit('spectator-toggled', { socketId: socket.id, spectator });
    });

    // ── reveal ──────────────────────────────────────────────────────────────
    on(socket, 'reveal', async () => {
      const room = currentRoom();
      if (!room) return;

      // Flood control: at most one reveal attempt per cooldown per socket
      const now = Date.now();
      if (socket.data.lastRevealAt && now - socket.data.lastRevealAt < REVEAL_COOLDOWN_MS) return;
      socket.data.lastRevealAt = now;

      if (rooms.hasCountdown(room.id)) return;

      const mode = room.revealMode();
      if (mode === 'immediate') {
        await reveal(room);
      } else if (mode === 'countdown') {
        rooms.startCountdown(room.id, (r) =>
          reveal(r).catch((err) => console.error('[realtime] Error revealing after countdown:', err)));
      }
    });

    // ── new-round ───────────────────────────────────────────────────────────
    on(socket, 'new-round', () => {
      const room = currentRoom();
      if (!room) return;

      if (rooms.cancelCountdown(room.id)) io.to(room.id).emit('countdown-cancelled');
      room.newRound();
      io.to(room.id).emit('round-reset');
      if (room.isGuest) rooms.touch(room.id);
    });

    // ── set-round-name ──────────────────────────────────────────────────────
    on(socket, 'set-round-name', ({ name }) => {
      const room = currentRoom();
      if (!room || !room.setRoundName(str(name, 100))) return;
      socket.to(room.id).emit('round-name-set', { name: room.roundName });
    });

    // ── react ───────────────────────────────────────────────────────────────
    on(socket, 'react', ({ emoji }) => {
      const room = currentRoom();
      if (!room || !room.revealed || !isAllowedReaction(emoji)) return;

      const player = room.getPlayer(socket.id);
      if (player.userId) {
        activityRepository.recordReaction(player.userId, room.id, emoji).catch(console.error);
      }
      io.to(room.id).emit('reaction', { name: player.name, emoji });
    });

    // ── update-room-name ────────────────────────────────────────────────────
    on(socket, 'update-room-name', async ({ name }) => {
      const room = currentRoom();
      if (!room) return;
      const newName = room.rename(str(name, 100));
      if (!newName) return;

      io.to(room.id).emit('room-name-updated', { name: newName });
      await roomRepository.updateRoomName(room.id, newName);
    });

    // ── disconnect ──────────────────────────────────────────────────────────
    on(socket, 'disconnect', () => leaveCurrentRoom(socket));
  });

  return sessions;
}

// Called by the REST layer when a logged-in user claims a guest room.
function claimGuestRoom(roomId) {
  sessions?.claim(roomId);
}

// Called by the REST layer when a room is deleted.
function closeRoom(roomId) {
  sessions?.close(roomId, 'deleted');
}

function stopRealtime() {
  sessions?.stopAll();
}

module.exports = setupSocket;
module.exports.setupSocket = setupSocket;
module.exports.claimGuestRoom = claimGuestRoom;
module.exports.closeRoom = closeRoom;
module.exports.stopRealtime = stopRealtime;
