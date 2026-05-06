const NON_NUMERIC = new Set(['?', '☕', '😊', 'XS', 'S', 'M', 'L', 'XL', 'XXL']);

function calculateStats(players) {
  const votes = [...players.values()].map((p) => p.vote).filter(Boolean);
  if (!votes.length) return null;

  const distribution = {};
  for (const v of votes) distribution[v] = (distribution[v] || 0) + 1;

  const numericVotes = votes
    .filter((v) => !NON_NUMERIC.has(v))
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

module.exports = { calculateStats };
