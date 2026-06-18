// Badge unlock logic — mirrors the evaluatable badges from frontend BADGE_GROUPS.
// Badges with unlock: () => false in the frontend are omitted here.
// Uses the same stats-object shape as GET /api/users/stats.

const TSHIRT_VALUES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const FIBONACCI_VALUES = ['0', '½', '1', '2', '3', '5', '8', '13', '20', '21', '34', '40', '55', '89', '100'];

function voteCount(d, values) {
  const list = Array.isArray(values) ? values : [values];
  return d.distribution
    .filter((x) => list.includes(x.value))
    .reduce((sum, x) => sum + x.count, 0);
}

function consensusRate(d) {
  const c = d.consensus;
  return c && c.total_rounds ? c.consensus_rounds / c.total_rounds : 0;
}

function atLeast(getValue, target) {
  return (d) => getValue(d) >= target;
}

const BADGE_UNLOCK_FNS = [
  // Basics
  { id: 'first_stem',           unlock: atLeast((d) => d.summary.total_rounds, 1) },
  { id: 'team_player',          unlock: atLeast((d) => d.summary.total_sessions, 5) },
  { id: 'poker_regular',        unlock: atLeast((d) => d.summary.total_rounds, 25) },
  { id: 'planning_pro',         unlock: atLeast((d) => d.summary.total_rounds, 100) },

  // Estimation
  { id: 'first_estimate',       unlock: atLeast((d) => d.summary.total_rounds, 1) },
  { id: 'fibonacci_fan',        unlock: atLeast((d) => voteCount(d, FIBONACCI_VALUES), 10) },
  { id: 'consistent_estimator', unlock: (d) => (d.consensus?.total_rounds >= 10) && consensusRate(d) >= 0.7 },
  { id: 'sharp_estimator',      unlock: atLeast((d) => d.consensus?.consensus_rounds || 0, 5) },
  { id: 'estimation_sniper',    unlock: atLeast((d) => d.consensus?.consensus_rounds || 0, 25) },

  // T-shirt sizing
  { id: 'size_matters',         unlock: atLeast((d) => voteCount(d, TSHIRT_VALUES), 1) },
  { id: 'sizer',                unlock: atLeast((d) => voteCount(d, TSHIRT_VALUES), 20) },

  // Team dynamics
  { id: 'consensus_builder',    unlock: (d) => (d.consensus?.total_rounds >= 10) && consensusRate(d) >= 0.6 },
  { id: 'alignment_master',     unlock: (d) => (d.consensus?.total_rounds >= 20) && consensusRate(d) >= 0.8 },

  // Speed & flow
  { id: 'speed_estimator',      unlock: atLeast((d) => d.maxDayRounds || 0, 20) },
  { id: 'lightning_round',      unlock: atLeast((d) => d.maxDayRounds || 0, 10) },

  // Consistency & engagement
  { id: 'daily_planner',        unlock: atLeast((d) => d.streak?.max_streak || 0, 3) },
  { id: 'sprint_ritual',        unlock: atLeast((d) => d.streak?.max_streak || 0, 20) },
  { id: 'reliable_estimator',   unlock: atLeast((d) => d.summary.total_sessions, 20) },
  { id: 'always_there',         unlock: atLeast((d) => d.summary.total_sessions, 50) },

  // Accuracy & improvement
  { id: 'learning_curve',       unlock: atLeast((d) => d.summary.total_rounds, 5) },
  { id: 'accuracy_builder',     unlock: atLeast((d) => d.consensus?.consensus_rounds || 0, 20) },
  { id: 'precision_master',     unlock: atLeast((d) => d.consensus?.consensus_rounds || 0, 50) },

  // Facilitation & roles
  { id: 'scrum_starter',        unlock: atLeast((d) => d.summary.total_sessions, 1) },
  { id: 'facilitator',          unlock: atLeast((d) => d.summary.total_sessions, 10) },

  // Coffee
  { id: 'coffee_break',         unlock: atLeast((d) => voteCount(d, ['☕']), 1) },
  { id: 'barista',              unlock: atLeast((d) => voteCount(d, ['☕']), 15) },
  { id: 'coffee_addict',        unlock: atLeast((d) => voteCount(d, ['☕']), 40) },
  { id: 'espresso_yourself',    unlock: atLeast((d) => voteCount(d, ['☕']), 75) },

  // Question mark
  { id: 'first_doubt',          unlock: atLeast((d) => voteCount(d, ['?']), 3) },
  { id: 'sceptic',              unlock: atLeast((d) => voteCount(d, ['?']), 20) },
  { id: 'philosopher',          unlock: atLeast((d) => voteCount(d, ['?']), 50) },
  { id: 'oracle',               unlock: atLeast((d) => voteCount(d, ['?']), 100) },

  // Spectator
  { id: 'ghost',                unlock: atLeast((d) => d.spectatorSessions || 0, 1) },
  { id: 'phantom',              unlock: atLeast((d) => d.spectatorSessions || 0, 15) },
  { id: 'eternal_watcher',      unlock: atLeast((d) => d.spectatorSessions || 0, 50) },

  // Reactions
  { id: 'reactor',              unlock: atLeast((d) => d.totalReactions || 0, 10) },
  { id: 'hype_machine',         unlock: atLeast((d) => d.totalReactions || 0, 100) },
  { id: 'emoji_god',            unlock: atLeast((d) => d.totalReactions || 0, 500) },

  // Specials & fun
  { id: 'all_in_estimator',     unlock: atLeast((d) => d.summary.total_rounds, 500) },
  { id: 'lowballer',            unlock: atLeast((d) => voteCount(d, ['0', '½', '1', 'XS', 'S']), 10) },
  { id: 'middle_ground',        unlock: atLeast((d) => voteCount(d, ['3', '5', '8', 'M']), 10) },
  { id: 'contrarian',           unlock: atLeast((d) => voteCount(d, ['?']), 10) },
  { id: 'mind_reader',          unlock: atLeast((d) => d.consensus?.consensus_rounds || 0, 10) },
  { id: 'eight_ball',           unlock: atLeast((d) => voteCount(d, ['8']), 20) },
  { id: 'centurion',            unlock: atLeast((d) => voteCount(d, ['100']), 5) },
  { id: 'pessimist',            unlock: atLeast((d) => voteCount(d, ['89', '100', 'XXL']), 10) },

  // Ultra
  { id: 'estimation_beast',     unlock: atLeast((d) => d.summary.total_rounds, 500) },
  { id: 'team_anchor',          unlock: (d) => (d.consensus?.total_rounds >= 100) && consensusRate(d) >= 0.8 },
  { id: 'planning_legend',      unlock: atLeast((d) => d.summary.total_sessions, 100) },
  { id: 'agile_master',         unlock: (d) => d.summary.total_rounds >= 100 && consensusRate(d) >= 0.75 && (d.methodsCount || 0) >= 4 },
];

module.exports = { BADGE_UNLOCK_FNS };
