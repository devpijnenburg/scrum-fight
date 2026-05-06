const { calculateStats } = require('../utils/stats');

function players(...votes) {
  const map = new Map();
  votes.forEach((v, i) => map.set(`s${i}`, { vote: v }));
  return map;
}

describe('calculateStats', () => {
  test('returns null when no votes', () => {
    expect(calculateStats(players(null, null))).toBeNull();
  });

  test('returns null for empty map', () => {
    expect(calculateStats(new Map())).toBeNull();
  });

  test('detects allSame when everyone votes the same', () => {
    const result = calculateStats(players('5', '5', '5'));
    expect(result.allSame).toBe(true);
    expect(result.average).toBe(5);
    expect(result.min).toBe(5);
    expect(result.max).toBe(5);
  });

  test('calculates average, min, max and mode for numeric votes', () => {
    const result = calculateStats(players('3', '5', '8', '5'));
    expect(result.average).toBe(5.3);
    expect(result.min).toBe(3);
    expect(result.max).toBe(8);
    expect(result.mode).toBe('5');
    expect(result.allSame).toBe(false);
  });

  test('handles ½ as 0.5', () => {
    const result = calculateStats(players('½', '1'));
    expect(result.min).toBe(0.5);
    expect(result.average).toBe(0.8);
  });

  test('returns mode and distribution only for non-numeric votes', () => {
    const result = calculateStats(players('S', 'M', 'S'));
    expect(result.mode).toBe('S');
    expect(result.distribution).toEqual({ S: 2, M: 1 });
    expect(result.average).toBeUndefined();
  });

  test('ignores special cards (?, ☕, 😊) in numeric calculation', () => {
    const result = calculateStats(players('5', '?', '3'));
    expect(result.average).toBe(4);
    expect(result.min).toBe(3);
    expect(result.max).toBe(5);
  });

  test('distribution counts all vote values', () => {
    const result = calculateStats(players('5', '8', '5', '13'));
    expect(result.distribution).toEqual({ '5': 2, '8': 1, '13': 1 });
  });
});
