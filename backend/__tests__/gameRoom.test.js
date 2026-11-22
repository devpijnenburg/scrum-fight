// Unit tests for the pure game domain (no sockets, timers or DB).

const { GameRoom, isAllowedReaction } = require('../src/domains/game/gameRoom');
const { calculateStats, cardToNumber } = require('../src/domains/game/voteStats');

function makeRoom(method = 'fibonacci') {
  return new GameRoom({ id: 'ROOM01', name: 'Team', method, isGuest: false });
}

describe('calculateStats', () => {
  it('returns null without votes', () => {
    expect(calculateStats([])).toBeNull();
    expect(calculateStats([null, null])).toBeNull();
  });

  it('computes numeric statistics and ignores special cards', () => {
    expect(calculateStats(['3', '5', '5', '?', '☕', null])).toEqual({
      average: 4.3,
      min: 3,
      max: 5,
      mode: '5',
      distribution: { 3: 1, 5: 2, '?': 1, '☕': 1 },
      allSame: false,
    });
  });

  it('treats ½ and 0 as numbers', () => {
    expect(calculateStats(['½', '0'])).toMatchObject({ average: 0.3, min: 0, max: 0.5 });
  });

  it('only reports mode and distribution for T-shirt sizes', () => {
    expect(calculateStats(['M', 'M'])).toEqual({ mode: 'M', distribution: { M: 2 }, allSame: true });
  });

  it('cardToNumber rejects non-numeric cards', () => {
    expect(cardToNumber('XL')).toBeNull();
    expect(cardToNumber('?')).toBeNull();
    expect(cardToNumber('13')).toBe(13);
  });
});

describe('GameRoom', () => {
  it('accepts only valid cards from non-spectators before the reveal', () => {
    const room = makeRoom();
    room.addPlayer('a', { name: 'Alice' });
    expect(room.castVote('a', '5')).toBe(true);
    expect(room.castVote('a', 'XL')).toBe(false);
    expect(room.castVote('a', 5)).toBe(false);
    expect(room.castVote('nobody', '5')).toBe(false);

    room.toggleSpectator('a');
    expect(room.castVote('a', '3')).toBe(false);
  });

  it('clears the vote when becoming a spectator', () => {
    const room = makeRoom();
    room.addPlayer('a', { name: 'Alice' });
    room.castVote('a', '8');
    expect(room.toggleSpectator('a')).toBe(true);
    expect(room.getPlayer('a').vote).toBeNull();
    expect(room.toggleSpectator('a')).toBe(false);
  });

  describe('revealMode', () => {
    it('is none without votes', () => {
      const room = makeRoom();
      room.addPlayer('a', { name: 'Alice' });
      expect(room.revealMode()).toBe('none');
    });

    it('is countdown while someone still has to vote', () => {
      const room = makeRoom();
      room.addPlayer('a', { name: 'Alice' });
      room.addPlayer('b', { name: 'Bob' });
      room.castVote('a', '3');
      expect(room.revealMode()).toBe('countdown');
    });

    it('ignores spectators when deciding whether everyone voted', () => {
      const room = makeRoom();
      room.addPlayer('a', { name: 'Alice' });
      room.addPlayer('b', { name: 'Bob' });
      room.toggleSpectator('b');
      room.castVote('a', '3');
      expect(room.revealMode()).toBe('immediate');
    });

    it('is none after the reveal', () => {
      const room = makeRoom();
      room.addPlayer('a', { name: 'Alice' });
      room.castVote('a', '3');
      room.reveal();
      expect(room.revealMode()).toBe('none');
    });
  });

  it('reveal returns a snapshot once and locks voting', () => {
    const room = makeRoom();
    room.addPlayer('a', { name: 'Alice', userId: 'u1' });
    room.castVote('a', '5');
    room.setRoundName('  Story 42  ');

    const snapshot = room.reveal();
    expect(snapshot).toEqual({
      roundName: 'Story 42',
      stats: expect.objectContaining({ average: 5 }),
      players: [{ socketId: 'a', name: 'Alice', userId: 'u1', vote: '5' }],
    });
    expect(room.reveal()).toBeNull();
    expect(room.castVote('a', '8')).toBe(false);
    expect(room.setRoundName('late')).toBe(false);
  });

  it('newRound clears votes, round name and the revealed flag', () => {
    const room = makeRoom();
    room.addPlayer('a', { name: 'Alice' });
    room.castVote('a', '5');
    room.setRoundName('x');
    room.reveal();
    room.newRound();
    expect(room.revealed).toBe(false);
    expect(room.roundName).toBe('');
    expect(room.getPlayer('a').vote).toBeNull();
  });

  it('hides votes in the client state until the reveal', () => {
    const room = makeRoom();
    room.addPlayer('a', { name: 'Alice' });
    room.addPlayer('b', { name: 'Bob' });
    room.castVote('a', '5');

    const before = room.toClientState('b');
    expect(before.players).toEqual([
      expect.objectContaining({ name: 'Alice', hasVoted: true, vote: null, isMe: false }),
      expect.objectContaining({ name: 'Bob', hasVoted: false, isMe: true }),
    ]);
    expect(before.stats).toBeNull();
    expect(before.cardValues).toContain('13');

    room.reveal();
    expect(room.toClientState('b').players[0].vote).toBe('5');
  });

  it('rename rejects empty names and trims long ones', () => {
    const room = makeRoom();
    expect(room.rename('   ')).toBeNull();
    expect(room.name).toBe('Team');
    expect(room.rename('x'.repeat(150))).toHaveLength(100);
  });

  it('removePlayer reports whether the player was present', () => {
    const room = makeRoom();
    room.addPlayer('a', { name: 'Alice' });
    expect(room.removePlayer('a')).toMatchObject({ name: 'Alice' });
    expect(room.removePlayer('a')).toBeNull();
    expect(room.isEmpty).toBe(true);
  });
});

describe('isAllowedReaction', () => {
  it('only allows the curated emoji set', () => {
    expect(isAllowedReaction('🔥')).toBe(true);
    expect(isAllowedReaction('💩')).toBe(false);
    expect(isAllowedReaction(undefined)).toBe(false);
  });
});
