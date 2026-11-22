const { verify } = require('../auth/jwt');
const { ESTIMATION_METHODS, PLAN_LIMITS } = require('../config/plans');
const { evaluateBadgesForUser } = require('../domain/badges/badgeEvaluator');
const roomRepository = require('../domain/rooms/roomRepository');
const userRepository = require('../domain/users/userRepository');
const { on, str } = require('../shared/socketHandler');

// roomId → { id, name, method, isGuest, revealed, players: Map<socketId, player> }
const activeRooms = new Map();

// roomId → setTimeout handle (1-hour guest room inactivity timer)
const guestTimers = new Map();

// roomId → [timer, timer, timer] — active countdown timers
const countdownTimers = new Map();

const GUEST_TTL_MS = 60 * 60 * 1000; // 1 hour

// Set once setupSocket(io) runs, so REST routes (rooms.js) can reach
// connected clients (e.g. to announce a room being claimed).
let ioInstance = null;

function serializeRoom(room, mySocketId) {
  const players = [];
  for (const [socketId, p] of room.players) {
    players.push({
      socketId,
      name: p.name,
      emoticon: p.emoticon || '',
      userId: p.userId,
      hasVoted: p.vote !== null,
      vote: room.revealed ? p.vote : null,
      isMe: socketId === mySocketId,
      spectator: p.spectator || false,
    });
  }
  return {
    id: room.id,
    name: room.name,
    method: room.method,
    methodLabel: ESTIMATION_METHODS[room.method]?.label ?? room.method,
    cardValues: ESTIMATION_METHODS[room.method]?.values ?? [],
    isGuest: room.isGuest,
    revealed: room.revealed,
    roundName: room.roundName || '',
    players,
    stats: room.revealed ? calculateStats(room.players) : null,
  };
}

function calculateStats(players) {
  const votes = [...players.values()].map((p) => p.vote).filter(Boolean);
  if (!votes.length) return null;

  const distribution = {};
  for (const v of votes) distribution[v] = (distribution[v] || 0) + 1;

  const numericVotes = votes
    .filter((v) => v !== '?' && v !== '☕' && !['XS', 'S', 'M', 'L', 'XL', 'XXL'].includes(v))
    .map((v) => (v === '½' ? 0.5 : parseFloat(v)))
    .filter((n) => !isNaN(n));

  const mode = Object.entries(distribution).sort((a, b) => b[1] - a[1])[0]?.[0];
  const allSame = new Set(votes).size === 1;

  if (numericVotes.length > 0) {
    const avg = numericVotes.reduce((a, b) => a + b, 0) / numericVotes.length;
    return {
      average: parseFloat(avg.toFixed(1)),
      min: Math.min(...numericVotes),
      max: Math.max(...numericVotes),
      mode,
      distribution,
      allSame,
    };
  }

  return { mode, distribution, allSame };
}

function scheduleGuestExpiry(io, roomId) {
  if (guestTimers.has(roomId)) clearTimeout(guestTimers.get(roomId));

  const timer = setTimeout(async () => {
    const room = activeRooms.get(roomId);
    if (!room) return;

    io.to(roomId).emit('room-expired', { reason: 'inactivity' });
    activeRooms.delete(roomId);
    guestTimers.delete(roomId);

    try {
      await roomRepository.deleteRoom(roomId);
    } catch (err) {
      console.error('Error deleting expired guest room:', err);
    }
  }, GUEST_TTL_MS);

  guestTimers.set(roomId, timer);
}

function resetGuestTimer(io, roomId) {
  scheduleGuestExpiry(io, roomId);
  roomRepository.touchLastActive(roomId).catch(console.error);
}

// Called by the REST layer when a logged-in user claims a guest room —
// cancels the inactivity TTL and flips the in-memory room to permanent
// so subsequent join/vote/reveal handlers stop resetting a guest timer.
function claimGuestRoom(roomId) {
  if (guestTimers.has(roomId)) {
    clearTimeout(guestTimers.get(roomId));
    guestTimers.delete(roomId);
  }
  const room = activeRooms.get(roomId);
  if (room) {
    room.isGuest = false;
    if (ioInstance) ioInstance.to(roomId).emit('room-claimed');
  }
}

async function doReveal(io, room, roomId) {
  room.revealed = true;

  const players = [...room.players.entries()].map(([socketId, p]) => ({
    socketId,
    name: p.name,
    vote: p.vote,
  }));

  io.to(roomId).emit('cards-revealed', {
    players,
    stats: calculateStats(room.players),
    roundName: room.roundName || '',
  });

  try {
    await roomRepository.recordRound(roomId, room.roundName, [...room.players.values()]);

    // Fire-and-forget badge evaluation — only when votes were persisted successfully
    setImmediate(async () => {
      try {
        for (const [socketId, p] of room.players) {
          if (!p.userId || !p.vote) continue;
          const newBadges = await evaluateBadgesForUser(p.userId);
          if (newBadges.length > 0) {
            io.to(socketId).emit('badge-earned', { badgeIds: newBadges });
            for (const badgeId of newBadges) {
              io.to(roomId).emit('badge-announced', { playerName: p.name, badgeId });
            }
          }
        }
      } catch (err) {
        console.error('[socket] Badge evaluation failed:', err);
      }
    });
  } catch (err) {
    console.error('Error saving round history:', err);
  }

  if (room.isGuest) resetGuestTimer(io, roomId);
}

async function deleteGuestRoom(io, roomId) {
  if (guestTimers.has(roomId)) {
    clearTimeout(guestTimers.get(roomId));
    guestTimers.delete(roomId);
  }
  activeRooms.delete(roomId);
  try {
    await roomRepository.deleteRoom(roomId);
  } catch (err) {
    console.error('Error deleting empty guest room:', err);
  }
}

const ALLOWED_REACTIONS = new Set([
  '🔥', '🤯', '😬', '👏', '🎉',
  '🏆', '🥳', '🙌', '⭐', '💪', '🎯', '😊', '🤝',
  '🤔', '💬', '🤷', '😅', '🧐', '☕', '💭',
  '🚀', '😴', '💤', '😪', '🛋️', '❓',
  '👍', '🎲', '💡', '👀', '⚠️', '🌊',
]);

// Removes a socket from the room it is currently in (if any) and tells the
// remaining players. Used on disconnect and when a socket switches rooms.
function leaveCurrentRoom(io, socket) {
  const roomId = socket.data.roomId;
  if (!roomId) return;
  socket.data.roomId = null;
  socket.leave(roomId);

  const room = activeRooms.get(roomId);
  if (!room) return;

  const player = room.players.get(socket.id);
  if (!room.players.delete(socket.id)) return;

  io.to(roomId).emit('player-left', { socketId: socket.id, name: player?.name });
  // Guest rooms remain available until their inactivity timer expires.
}

async function resolveIdentity(token, playerName) {
  const fallback = { userId: null, name: str(playerName, 50), emoticon: '' };
  if (typeof token !== 'string' || !token) return fallback;

  let payload;
  try {
    payload = verify(token);
  } catch {
    return fallback; // invalid/expired token — fall back to provided name
  }
  const user = await userRepository.findById(payload.id);
  if (!user) return fallback;
  return { userId: user.id, name: user.name, emoticon: user.emoticon || '⚔️' };
}

function setupSocket(io) {
  ioInstance = io;
  io.on('connection', (socket) => {
    const emitServerError = () =>
      socket.emit('error', { code: 'SERVER_ERROR', message: 'Serverfout' });

    // ── join-room ─────────────────────────────────────────────────────────────
    on(socket, 'join-room', async ({ roomId, playerName, token }) => {
      const normalizedId = str(roomId, 20).toUpperCase();
      if (!normalizedId) {
        socket.emit('error', { code: 'ROOM_NOT_FOUND', message: 'Kamer niet gevonden' });
        return;
      }

      const { userId, name, emoticon } = await resolveIdentity(token, playerName);

      if (!name) {
        socket.emit('error', { code: 'NAME_REQUIRED', message: 'Voer een naam in' });
        return;
      }

      // Verify room exists in DB
      const dbRoom = await roomRepository.findRoomById(normalizedId);
      if (!dbRoom) {
        socket.emit('error', { code: 'ROOM_NOT_FOUND', message: 'Kamer niet gevonden' });
        return;
      }

      // Check participant limit for authenticated room owners
      if (!dbRoom.is_guest && dbRoom.owner_id) {
        const plan = await userRepository.getPlan(dbRoom.owner_id);
        const limit = PLAN_LIMITS[plan]?.maxParticipants ?? 5;

        if (limit !== Infinity) {
          const current = activeRooms.get(normalizedId)?.players?.size ?? 0;
          if (current >= limit && !activeRooms.get(normalizedId)?.players?.has(socket.id)) {
            socket.emit('error', {
              code: 'ROOM_FULL',
              message: `Kamer is vol (max ${limit} deelnemers voor dit plan)`,
            });
            return;
          }
        }
      }

      // A socket is in at most one room: leave the previous one first.
      if (socket.data.roomId && socket.data.roomId !== normalizedId) {
        leaveCurrentRoom(io, socket);
      }

      // Init in-memory room if this is the first connection
      if (!activeRooms.has(normalizedId)) {
        activeRooms.set(normalizedId, {
          id: normalizedId,
          name: dbRoom.name,
          method: dbRoom.method,
          isGuest: dbRoom.is_guest,
          revealed: false,
          roundName: '',
          players: new Map(),
        });

        if (dbRoom.is_guest) {
          scheduleGuestExpiry(io, normalizedId);
        }
      }

      const room = activeRooms.get(normalizedId);
      room.players.set(socket.id, { name, userId, emoticon, vote: null, spectator: false });

      socket.join(normalizedId);
      socket.data.roomId = normalizedId;

      // Send full state to the joining player
      socket.emit('room-state', serializeRoom(room, socket.id));

      // Notify everyone else
      socket.to(normalizedId).emit('player-joined', {
        socketId: socket.id,
        name,
        emoticon,
        hasVoted: false,
        spectator: false,
      });

      // Update last_active for non-guest rooms
      if (!dbRoom.is_guest) {
        roomRepository.touchLastActive(normalizedId).catch(console.error);
      } else {
        resetGuestTimer(io, normalizedId);
      }
    }, { onError: emitServerError });

    // ── vote ──────────────────────────────────────────────────────────────────
    on(socket, 'vote', ({ value }) => {
      const roomId = socket.data.roomId;
      const room = activeRooms.get(roomId);
      if (!room || room.revealed) return;

      const player = room.players.get(socket.id);
      if (!player || player.spectator) return;

      const allowed = ESTIMATION_METHODS[room.method]?.values ?? [];
      if (typeof value !== 'string' || !allowed.includes(value)) return;

      player.vote = value;

      io.to(roomId).emit('player-voted', { socketId: socket.id });

      if (room.isGuest) resetGuestTimer(io, roomId);
    });

    // ── toggle-spectator ──────────────────────────────────────────────────────
    on(socket, 'toggle-spectator', () => {
      const roomId = socket.data.roomId;
      const room = activeRooms.get(roomId);
      if (!room || room.revealed) return;

      const player = room.players.get(socket.id);
      if (!player) return;

      player.spectator = !player.spectator;
      if (player.spectator) {
        player.vote = null;
        if (player.userId) {
          const now = Date.now();
          if (!player._lastSpectatorInsert || now - player._lastSpectatorInsert > 60_000) {
            player._lastSpectatorInsert = now;
            userRepository.recordSpectatorSession(player.userId, roomId).catch(console.error);
          }
        }
      }

      io.to(roomId).emit('spectator-toggled', {
        socketId: socket.id,
        spectator: player.spectator,
      });
    });

    // ── reveal ────────────────────────────────────────────────────────────────
    on(socket, 'reveal', async () => {
      const roomId = socket.data.roomId;
      const room = activeRooms.get(roomId);
      if (!room || room.revealed) return;

      // Flood control: max één reveal-poging per 2 seconden per socket
      const now = Date.now();
      if (socket.data.lastRevealAt && now - socket.data.lastRevealAt < 2000) return;
      socket.data.lastRevealAt = now;

      const voters = [...room.players.values()].filter((p) => !p.spectator);
      const hasAnyVote = voters.some((p) => p.vote !== null);
      if (!hasAnyVote) return;

      // Ignore if a countdown is already running
      if (countdownTimers.has(roomId)) return;

      const allVoted = voters.length > 0 && voters.every((p) => p.vote !== null);

      if (allVoted) {
        await doReveal(io, room, roomId);
      } else {
        // Not everyone voted — start a 3-second countdown
        io.to(roomId).emit('countdown', { count: 3 });

        const timers = [];
        timers.push(setTimeout(() => io.to(roomId).emit('countdown', { count: 2 }), 1000));
        timers.push(setTimeout(() => io.to(roomId).emit('countdown', { count: 1 }), 2000));
        timers.push(setTimeout(() => {
          countdownTimers.delete(roomId);
          const r = activeRooms.get(roomId);
          if (r && !r.revealed) {
            doReveal(io, r, roomId).catch((err) =>
              console.error('[socket] Error revealing after countdown:', err));
          }
        }, 3000));

        countdownTimers.set(roomId, timers);
      }
    });

    // ── new-round ─────────────────────────────────────────────────────────────
    on(socket, 'new-round', () => {
      const roomId = socket.data.roomId;
      const room = activeRooms.get(roomId);
      if (!room) return;

      // Cancel any active countdown
      if (countdownTimers.has(roomId)) {
        for (const t of countdownTimers.get(roomId)) clearTimeout(t);
        countdownTimers.delete(roomId);
        io.to(roomId).emit('countdown-cancelled');
      }

      room.revealed = false;
      room.roundName = '';
      for (const player of room.players.values()) player.vote = null;

      io.to(roomId).emit('round-reset');

      if (room.isGuest) resetGuestTimer(io, roomId);
    });

    // ── set-round-name ────────────────────────────────────────────────────────
    on(socket, 'set-round-name', ({ name }) => {
      const roomId = socket.data.roomId;
      const room = activeRooms.get(roomId);
      if (!room || room.revealed) return;

      room.roundName = str(name, 100);
      socket.to(roomId).emit('round-name-set', { name: room.roundName });
    });

    // ── react ─────────────────────────────────────────────────────────────────
    on(socket, 'react', ({ emoji }) => {
      const roomId = socket.data.roomId;
      const room = activeRooms.get(roomId);
      if (!room || !room.revealed) return;

      if (typeof emoji !== 'string' || !ALLOWED_REACTIONS.has(emoji)) return;

      const player = room.players.get(socket.id);
      if (!player) return;

      if (player.userId) {
        userRepository.recordReaction(player.userId, roomId, emoji).catch(console.error);
      }

      io.to(roomId).emit('reaction', { name: player.name, emoji });
    });

    // ── update-room-name ──────────────────────────────────────────────────────
    on(socket, 'update-room-name', async ({ name }) => {
      const roomId = socket.data.roomId;
      const room = activeRooms.get(roomId);
      if (!room || !room.players.has(socket.id)) return;

      const trimmed = str(name, 100);
      if (!trimmed) return;

      room.name = trimmed;
      io.to(roomId).emit('room-name-updated', { name: trimmed });

      await roomRepository.updateRoomName(roomId, trimmed);
    });

    // ── disconnect ────────────────────────────────────────────────────────────
    on(socket, 'disconnect', () => leaveCurrentRoom(io, socket));
  });
}

module.exports = setupSocket;
module.exports.claimGuestRoom = claimGuestRoom;
