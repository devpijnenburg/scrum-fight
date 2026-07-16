const crypto = require('crypto');

// In-memory store for OAuth state nonces (maps state → { provider, timestamp })
const states = new Map();
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function cleanExpiredStates() {
  const expiry = Date.now() - STATE_TTL_MS;
  for (const [key, val] of states) {
    if (val.timestamp < expiry) states.delete(key);
  }
}

function createState(provider) {
  cleanExpiredStates();
  const state = crypto.randomBytes(24).toString('hex');
  states.set(state, { provider, timestamp: Date.now() });
  return state;
}

// Returns true when the state is known and unexpired; a state can be
// consumed only once.
function consumeState(state) {
  cleanExpiredStates();
  if (!state || !states.has(state)) return false;
  states.delete(state);
  return true;
}

module.exports = { createState, consumeState };
