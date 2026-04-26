const db = require('../config/database');
const { verify } = require('../auth/jwt');
const { ESTIMATION_METHODS, PLAN_LIMITS } = require('../config/plans');

// roomId → { id, name, method, isGuest, revealed, players: Map<socketId, player> }
const activeRooms = new Map();

// roomId → setTimeout handle (1-hour guest room inactivity timer)
const guestTimers = new Map();

const GUEST_TTL_MS = 60 * 60 * 1000; // 1 hour

function serializeRoom(room, mySocketId) {
  const players = [];
  for (const [socketId, p] of room.players) {
    players.push({
      socketId,
      name: p.name,
      userId: p.userId,
      hasVoted: p.vote !== null,
      vote: room.revealed ? p.vote : null,
      isMe: socketId === mySocketId,
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
    players,
  };
}

function calculateStats(players) {
  const votes = [...players.values()].map((p) => p.vote).filter(Boolean);
  if (!votes.length) return null;

  const distribution = {};
  for (const v of votes) distribution[v] = (distribution[v] || 0) + 1;

  const numericVotes = votes
    .filter((v) => v !== '?' && v !== '☕' && v !== '😊' && !['XS', 'S', 'M', 'L', 'XL', 'XXL'].includes(v))
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
      await db.query('DELETE FROM rooms WHERE id = $1', [roomId]);
    } catch (err) {
      console.error('Error deleting expired guest room:', err);
    }
  }, GUEST_TTL_MS);

  guestTimers.set(roomId, timer);
}

function resetGuestTimer(io, roomId) {
  scheduleGuestExpiry(io, roomId);
  db.query('UPDATE rooms SET last_active = NOW() WHERE id = $1', [roomId]).catch(console.error);
}

async function deleteGuestRoom(io, roomId) {
  if (guestTimers.has(roomId)) {
    clearTimeout(guestTimers.get(roomId));
    guestTimers.delete(roomId);
  }
  activeRooms.delete(roomId);
  try {
    await db.query('DELETE FROM rooms WHERE id = $1', [roomId]);
  } catch (err) {
    console.error('Error deleting empty guest room:', err);
  }
}

module.exports = function setupSocket(io) {
  io.on('connection', (socket) => {

    // ── join-room ─────────────────────────────────────────────────────────────
    socket.on('join-room', async ({ roomId, playerName, token }) => {
      const normalizedId = (roomId || '').toUpperCase().trim();

      // Resolve player identity
      let userId = null;
      let name = (playerName || '').trim().slice(0, 50);

      if (token) {
        try {
          const payload = verify(token);
          userId = payload.id;
          name = payload.name;
        } catch {
          // invalid token — fall back to provided name
        }
      }

      if (!name) {
        socket.emit('error', { code: 'NAME_REQUIRED', message: 'Voer een naam in' });
        return;
      }

      // Verify room exists in DB
      let dbRoom;
      try {
        const { rows } = await db.query('SELECT * FROM rooms WHERE id = $1', [normalizedId]);
        if (!rows.length) {
          socket.emit('error', { code: 'ROOM_NOT_FOUND', message: 'Kamer niet gevonden' });
          return;
        }
        dbRoom = rows[0];
      } catch (err) {
        socket.emit('error', { code: 'SERVER_ERROR', message: 'Serverfout' });
        return;
      }

      // Check participant limit for authenticated room owners
      if (!dbRoom.is_guest && dbRoom.owner_id) {
        const { rows: ownerRows } = await db.query(
          'SELECT plan FROM users WHERE id = $1',
          [dbRoom.owner_id]
        );
        const plan = ownerRows[0]?.plan ?? 'free';
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

      // Init in-memory room if this is the first connection
      if (!activeRooms.has(normalizedId)) {
        activeRooms.set(normalizedId, {
          id: normalizedId,
          name: dbRoom.name,
          method: dbRoom.method,
          isGuest: dbRoom.is_guest,
          revealed: false,
          players: new Map(),
        });

        if (dbRoom.is_guest) {
          scheduleGuestExpiry(io, normalizedId);
        }
      }

      const room = activeRooms.get(normalizedId);
      room.players.set(socket.id, { name, userId, vote: null });

      socket.join(normalizedId);
      socket.data.roomId = normalizedId;

      // Send full state to the joining player
      socket.emit('room-state', serializeRoom(room, socket.id));

      // Notify everyone else
      socket.to(normalizedId).emit('player-joined', {
        socketId: socket.id,
        name,
        hasVoted: false,
      });

      // Update last_active for non-guest rooms
      if (!dbRoom.is_guest) {
        db.query('UPDATE rooms SET last_active = NOW() WHERE id = $1', [normalizedId]).catch(console.error);
      }
    });

    // ── vote ──────────────────────────────────────────────────────────────────
    socket.on('vote', ({ value }) => {
      const roomId = socket.data.roomId;
      const room = activeRooms.get(roomId);
      if (!room || room.revealed) return;

      const player = room.players.get(socket.id);
      if (!player) return;

      const allowed = ESTIMATION_METHODS[room.method]?.values ?? [];
      if (!allowed.includes(value)) return;

      player.vote = value;

      io.to(roomId).emit('player-voted', { socketId: socket.id });

      if (room.isGuest) resetGuestTimer(io, roomId);
    });

    // ── reveal ────────────────────────────────────────────────────────────────
    socket.on('reveal', async () => {
      const roomId = socket.data.roomId;
      const room = activeRooms.get(roomId);
      if (!room || room.revealed) return;

      const hasAnyVote = [...room.players.values()].some((p) => p.vote !== null);
      if (!hasAnyVote) return;

      room.revealed = true;

      const players = [...room.players.entries()].map(([socketId, p]) => ({
        socketId,
        name: p.name,
        vote: p.vote,
      }));

      io.to(roomId).emit('cards-revealed', {
        players,
        stats: calculateStats(room.players),
      });

      // Persist round history
      try {
        const votes = {};
        for (const [, p] of room.players) votes[p.name] = p.vote;
        await db.query(
          `INSERT INTO round_history (room_id, votes) VALUES ($1, $2)`,
          [roomId, JSON.stringify(votes)]
        );
        await db.query('UPDATE rooms SET last_active = NOW() WHERE id = $1', [roomId]);
      } catch (err) {
        console.error('Error saving round history:', err);
      }

      if (room.isGuest) resetGuestTimer(io, roomId);
    });

    // ── new-round ─────────────────────────────────────────────────────────────
    socket.on('new-round', () => {
      const roomId = socket.data.roomId;
      const room = activeRooms.get(roomId);
      if (!room) return;

      room.revealed = false;
      for (const player of room.players.values()) player.vote = null;

      io.to(roomId).emit('round-reset');

      if (room.isGuest) resetGuestTimer(io, roomId);
    });

    // ── update-room-name ──────────────────────────────────────────────────────
    socket.on('update-room-name', async ({ name }) => {
      const roomId = socket.data.roomId;
      const room = activeRooms.get(roomId);
      if (!room) return;

      const trimmed = (name || '').trim().slice(0, 100);
      if (!trimmed) return;

      room.name = trimmed;
      io.to(roomId).emit('room-name-updated', { name: trimmed });

      try {
        await db.query('UPDATE rooms SET name = $1 WHERE id = $2', [trimmed, roomId]);
      } catch (err) {
        console.error('Error updating room name:', err);
      }
    });

    // ── disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;

      const room = activeRooms.get(roomId);
      if (!room) return;

      const player = room.players.get(socket.id);
      room.players.delete(socket.id);

      io.to(roomId).emit('player-left', { socketId: socket.id, name: player?.name });

      // Guest room: delete immediately when empty, redirect all remaining clients
      if (room.isGuest && room.players.size === 0) {
        await deleteGuestRoom(io, roomId);
      }
    });
  });
};
