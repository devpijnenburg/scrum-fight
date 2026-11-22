// Pure in-memory game state for one planning-poker room.
//
// No socket.io, timers or database in here: every method mutates state and
// returns what changed, so the realtime layer decides what to broadcast and
// persist. That keeps all game rules unit-testable.

const { ESTIMATION_METHODS } = require('../billing/plans');
const { calculateStats } = require('./voteStats');

const MAX_PLAYER_NAME = 50;
const MAX_ROUND_NAME = 100;
const MAX_ROOM_NAME = 100;

const REACTIONS = new Set([
  '🔥', '🤯', '😬', '👏', '🎉',
  '🏆', '🥳', '🙌', '⭐', '💪', '🎯', '😊', '🤝',
  '🤔', '💬', '🤷', '😅', '🧐', '☕', '💭',
  '🚀', '😴', '💤', '😪', '🛋️', '❓',
  '👍', '🎲', '💡', '👀', '⚠️', '🌊',
]);

function isAllowedReaction(emoji) {
  return typeof emoji === 'string' && REACTIONS.has(emoji);
}

class GameRoom {
  constructor({ id, name, method, isGuest }) {
    this.id = id;
    this.name = name;
    this.method = method;
    this.isGuest = Boolean(isGuest);
    this.revealed = false;
    this.roundName = '';
    this.players = new Map(); // playerId (socket id) → player
  }

  get cardValues() {
    return ESTIMATION_METHODS[this.method]?.values ?? [];
  }

  get methodLabel() {
    return ESTIMATION_METHODS[this.method]?.label ?? this.method;
  }

  get playerCount() {
    return this.players.size;
  }

  get isEmpty() {
    return this.players.size === 0;
  }

  hasPlayer(playerId) {
    return this.players.has(playerId);
  }

  getPlayer(playerId) {
    return this.players.get(playerId) || null;
  }

  // ── Membership ────────────────────────────────────────────────────────────

  addPlayer(playerId, { name, userId = null, emoticon = '' }) {
    const player = {
      name: String(name).slice(0, MAX_PLAYER_NAME),
      userId,
      emoticon,
      vote: null,
      spectator: false,
    };
    this.players.set(playerId, player);
    return player;
  }

  // Returns the removed player, or null if they were not in the room.
  removePlayer(playerId) {
    const player = this.players.get(playerId);
    if (!player) return null;
    this.players.delete(playerId);
    return player;
  }

  // ── Voting ────────────────────────────────────────────────────────────────

  // Returns true when the vote was accepted.
  castVote(playerId, value) {
    if (this.revealed) return false;
    const player = this.players.get(playerId);
    if (!player || player.spectator) return false;
    if (typeof value !== 'string' || !this.cardValues.includes(value)) return false;
    player.vote = value;
    return true;
  }

  // Returns the new spectator flag, or null when not allowed.
  toggleSpectator(playerId) {
    if (this.revealed) return null;
    const player = this.players.get(playerId);
    if (!player) return null;
    player.spectator = !player.spectator;
    if (player.spectator) player.vote = null;
    return player.spectator;
  }

  get voters() {
    return [...this.players.values()].filter((p) => !p.spectator);
  }

  // What a reveal request should do right now:
  //   'none'      — nothing to reveal (already revealed or no votes yet)
  //   'immediate' — every voter has voted
  //   'countdown' — some voters still have to vote
  revealMode() {
    if (this.revealed) return 'none';
    const voters = this.voters;
    if (!voters.some((p) => p.vote !== null)) return 'none';
    return voters.every((p) => p.vote !== null) ? 'immediate' : 'countdown';
  }

  stats() {
    return calculateStats([...this.players.values()].map((p) => p.vote));
  }

  // Reveals the cards. Returns the round snapshot, or null when already revealed.
  reveal() {
    if (this.revealed) return null;
    this.revealed = true;
    return {
      roundName: this.roundName,
      stats: this.stats(),
      players: [...this.players.entries()].map(([socketId, p]) => ({
        socketId,
        name: p.name,
        userId: p.userId,
        vote: p.vote,
      })),
    };
  }

  newRound() {
    this.revealed = false;
    this.roundName = '';
    for (const player of this.players.values()) player.vote = null;
  }

  // ── Naming ────────────────────────────────────────────────────────────────

  // Returns true when the round name was changed.
  setRoundName(name) {
    if (this.revealed) return false;
    this.roundName = String(name ?? '').trim().slice(0, MAX_ROUND_NAME);
    return true;
  }

  // Returns the new name, or null when the name is empty.
  rename(name) {
    const trimmed = String(name ?? '').trim().slice(0, MAX_ROOM_NAME);
    if (!trimmed) return null;
    this.name = trimmed;
    return trimmed;
  }

  // ── Serialisation ─────────────────────────────────────────────────────────

  // Full state as seen by one player: votes stay hidden until the reveal.
  toClientState(viewerId) {
    const players = [...this.players.entries()].map(([socketId, p]) => ({
      socketId,
      name: p.name,
      emoticon: p.emoticon || '',
      userId: p.userId,
      hasVoted: p.vote !== null,
      vote: this.revealed ? p.vote : null,
      isMe: socketId === viewerId,
      spectator: p.spectator,
    }));
    return {
      id: this.id,
      name: this.name,
      method: this.method,
      methodLabel: this.methodLabel,
      cardValues: this.cardValues,
      isGuest: this.isGuest,
      revealed: this.revealed,
      roundName: this.roundName,
      players,
      stats: this.revealed ? this.stats() : null,
    };
  }
}

module.exports = { GameRoom, isAllowedReaction, REACTIONS };
