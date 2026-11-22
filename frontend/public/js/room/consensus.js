// Pure consensus rules for a revealed round — no DOM, no globals.
// Levels: full | near | coffee | question | close | spread | neutral

const NON_NUMERIC = new Set(['?', '☕', 'XS', 'S', 'M', 'L', 'XL', 'XXL']);

function specialLevel(dist, totalVoters) {
  if (totalVoters < 1) return null;
  const modeCount = Math.max(...Object.values(dist));
  if (modeCount / totalVoters >= 0.8) return 'near';
  const threshold = Math.max(2, Math.round(totalVoters * 0.35));
  if ((dist['☕'] || 0) >= threshold) return 'coffee';
  if ((dist['?'] || 0) >= threshold) return 'question';
  return null;
}

// From the server's stats object ({ allSame, distribution, min, max, … }).
export function consensusLevel(stats) {
  if (!stats) return 'neutral';
  if (stats.allSame) return 'full';
  const dist = stats.distribution || {};
  const totalVoters = Object.values(dist).reduce((a, b) => a + b, 0);
  const special = specialLevel(dist, totalVoters);
  if (special) return special;
  if (stats.max !== undefined && stats.min !== undefined && stats.max - stats.min <= 2) return 'close';
  if (stats.max !== undefined) return 'spread';
  return 'neutral';
}

// From a stored round ({ name: vote }), used for history entries.
export function consensusLevelFromVotes(votes) {
  const vals = Object.values(votes || {}).filter(Boolean);
  if (!vals.length) return 'neutral';
  if (new Set(vals).size === 1) return 'full';
  const dist = {};
  vals.forEach((v) => { dist[v] = (dist[v] || 0) + 1; });
  const special = specialLevel(dist, vals.length);
  if (special) return special;
  const nums = vals
    .filter((v) => !NON_NUMERIC.has(v))
    .map((v) => (v === '½' ? 0.5 : parseFloat(v)))
    .filter((n) => !isNaN(n));
  if (!nums.length) return 'neutral';
  return Math.max(...nums) - Math.min(...nums) <= 2 ? 'close' : 'spread';
}

// i18n key for a level's label ('' for neutral).
export function consensusLabelKey(level) {
  return level === 'neutral' ? '' : `room.analytics.consensus_${level}`;
}

// Reaction emoji offered after a reveal, matching the mood of the round.
export const REACTION_SETS = {
  full:     ['🚀', '🎉', '🏆', '🥳', '🙌'],
  near:     ['⭐', '🎯', '👏', '💪', '🤝'],
  coffee:   ['☕', '😴', '💤', '😪', '🛋️'],
  question: ['🤯', '🤔', '🧐', '💭', '❓'],
  close:    ['👍', '😊', '🎲', '💡', '👀'],
  spread:   ['🤷', '😅', '💬', '⚠️', '🌊'],
  neutral:  ['🔥', '😬', '☕', '💭', '🎲'],
};

export function reactionsFor(level) {
  return REACTION_SETS[level] || REACTION_SETS.neutral;
}
