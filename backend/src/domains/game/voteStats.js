// Pure statistics over a set of revealed votes.

// Converts a card value to a number, or null for non-numeric cards
// ('?', '☕', T-shirt sizes, …).
function cardToNumber(value) {
  if (value === '½') return 0.5;
  if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value)) return null;
  return parseFloat(value);
}

// votes: array of card values (null/empty entries are ignored).
// Returns null when nobody voted.
function calculateStats(votes) {
  const cast = votes.filter(Boolean);
  if (!cast.length) return null;

  const distribution = {};
  for (const v of cast) distribution[v] = (distribution[v] || 0) + 1;

  const mode = Object.entries(distribution).sort((a, b) => b[1] - a[1])[0][0];
  const allSame = Object.keys(distribution).length === 1;

  const numeric = cast.map(cardToNumber).filter((n) => n !== null);
  if (!numeric.length) return { mode, distribution, allSame };

  const avg = numeric.reduce((a, b) => a + b, 0) / numeric.length;
  return {
    average: parseFloat(avg.toFixed(1)),
    min: Math.min(...numeric),
    max: Math.max(...numeric),
    mode,
    distribution,
    allSame,
  };
}

module.exports = { calculateStats, cardToNumber };
