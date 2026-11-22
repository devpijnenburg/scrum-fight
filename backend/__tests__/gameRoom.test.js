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

describe('GameRoom — returning players and persistence', () => {
  function roomWithVotes() {
    const room = makeRoom();
    room.addPlayer('s1', { name: 'Alice', key: 'k-alice' });
    room.addPlayer('s2', { name: 'Bob', key: 'k-bob' });
    room.castVote('s1', '5');
    room.setRoundName('Story 7');
    return room;
  }

  it('a player who leaves and rejoins with the same key gets their vote back', () => {
    const room = roomWithVotes();
    room.removePlayer('s1');
    const back = room.addPlayer('s9', { name: 'Alice', key: 'k-alice' });
    expect(back.vote).toBe('5');
    expect(room.absent.size).toBe(0);
  });

  it('a different key or no key starts without a vote', () => {
    const room = roomWithVotes();
    room.removePlayer('s1');
    expect(room.addPlayer('s3', { name: 'Eve', key: 'other' }).vote).toBeNull();
    expect(room.addPlayer('s4', { name: 'Guest' }).vote).toBeNull();
  });

  it('a new round forgets absent votes but remembers absent spectators', () => {
    const room = roomWithVotes();
    room.toggleSpectator('s2');
    room.removePlayer('s1');
    room.removePlayer('s2');
    room.newRound();
    expect(room.addPlayer('a', { name: 'Alice', key: 'k-alice' }).vote).toBeNull();
    expect(room.addPlayer('b', { name: 'Bob', key: 'k-bob' }).spectator).toBe(true);
  });

  it('snapshot → restore brings back round name, reveal state and keyed votes', () => {
    const before = roomWithVotes();
    before.removePlayer('s2'); // Bob had not voted: nothing to remember
    const snapshot = before.snapshot();
    expect(snapshot).toEqual({
      roundName: 'Story 7',
      revealed: false,
      players: { 'k-alice': { vote: '5', spectator: false, name: 'Alice', userId: null } },
    });

    const after = makeRoom();
    after.restore(JSON.parse(JSON.stringify(snapshot)));
    expect(after.roundName).toBe('Story 7');
    expect(after.addPlayer('x', { name: 'Alice', key: 'k-alice' }).vote).toBe('5');
    expect(after.toClientState('x')).toMatchObject({ myVote: '5', roundName: 'Story 7' });
  });

  it('restore drops votes that are not valid cards for the method', () => {
    const room = makeRoom('tshirt');
    room.restore({ roundName: 'x', revealed: false, players: { a: { vote: '13' }, b: { vote: 'M' } } });
    expect(room.addPlayer('1', { name: 'A', key: 'a' }).vote).toBeNull();
    expect(room.addPlayer('2', { name: 'B', key: 'b' }).vote).toBe('M');
  });

  it('restore tolerates missing or malformed snapshots', () => {
    const room = makeRoom();
    expect(() => room.restore(null)).not.toThrow();
    expect(() => room.restore('garbage')).not.toThrow();
    expect(room.revealed).toBe(false);
  });

  it('keeps the number of remembered absent players bounded', () => {
    const room = makeRoom();
    for (let i = 0; i < 250; i++) {
      room.addPlayer(`s${i}`, { name: `P${i}`, key: `k${i}` });
      room.castVote(`s${i}`, '3');
      room.removePlayer(`s${i}`);
    }
    expect(room.absent.size).toBe(200);
    expect(room.absent.has('k249')).toBe(true);
    expect(room.absent.has('k0')).toBe(false);
  });
});

describe('GameRoom — event-order hardening', () => {
  it('counts the vote of a player who dropped out before the reveal', () => {
    const room = makeRoom();
    room.addPlayer('s1', { name: 'Alice', key: 'ka' });
    room.addPlayer('s2', { name: 'Bob', key: 'kb', userId: 'u-bob' });
    room.castVote('s1', '3');
    room.castVote('s2', '8');
    room.removePlayer('s2'); // connection lost

    expect(room.revealMode()).toBe('immediate');
    const snapshot = room.reveal();
    expect(snapshot.players).toEqual([
      { socketId: 's1', name: 'Alice', userId: null, vote: '3' },
      { socketId: null, name: 'Bob', userId: 'u-bob', vote: '8' },
    ]);
    expect(snapshot.stats).toMatchObject({ min: 3, max: 8 });
    // … and the stats stay the same when Bob returns
    room.addPlayer('s3', { name: 'Bob', key: 'kb', userId: 'u-bob' });
    expect(room.toClientState('s3').stats).toMatchObject({ min: 3, max: 8 });
  });

  it('does not count a person twice when they return under a new key', () => {
    const room = makeRoom();
    room.addPlayer('s1', { name: 'Guest', key: 'old-tab' });
    room.castVote('s1', '5');
    room.removePlayer('s1');
    room.addPlayer('s2', { name: 'Guest', key: 'new-tab' }); // reopened the link in a new tab
    room.castVote('s2', '13');
    expect(room.reveal().players).toEqual([{ socketId: 's2', name: 'Guest', userId: null, vote: '13' }]);

    const withAccount = makeRoom();
    withAccount.addPlayer('a', { name: 'Eva', key: 'k1', userId: 'u1' });
    withAccount.castVote('a', '2');
    withAccount.removePlayer('a');
    withAccount.addPlayer('b', { name: 'Eva (werk)', key: 'k2', userId: 'u1' });
    expect(withAccount.absent.size).toBe(0);
  });

  it('finds a connected player by key and updates identity without losing the vote', () => {
    const room = makeRoom();
    room.addPlayer('s1', { name: 'Gast', key: 'k' });
    room.castVote('s1', '5');
    expect(room.findPlayerIdByKey('k')).toBe('s1');
    expect(room.findPlayerIdByKey('other')).toBeNull();
    expect(room.findPlayerIdByKey(null)).toBeNull();

    const updated = room.updatePlayer('s1', { name: 'Eva', userId: 'u1', emoticon: '🦊' });
    expect(updated).toMatchObject({ name: 'Eva', userId: 'u1', emoticon: '🦊', vote: '5', key: 'k' });
    expect(room.updatePlayer('nope', { name: 'x' })).toBeNull();
  });

  it('ignores absent entries without a name from older snapshots when revealing', () => {
    const room = makeRoom();
    room.restore({ roundName: '', revealed: false, players: { old: { vote: '5', spectator: false } } });
    room.addPlayer('s1', { name: 'Alice', key: 'ka' });
    room.castVote('s1', '3');
    expect(room.reveal().players).toHaveLength(1);
  });
});
