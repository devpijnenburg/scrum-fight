// Shared, mutable state of the room page. One object so every module reads
// and writes the same values (ES module bindings cannot be reassigned from
// outside their own module).

const params = new URLSearchParams(location.search);

export const ROOM_ID = (params.get('id') || '').toUpperCase();
export const FROM_JOIN_LINK = !!params.get('join');

// A name typed on the landing page is handed over once via sessionStorage.
export const NAME_FROM_SESSION = sessionStorage.getItem('pendingName') || '';
sessionStorage.removeItem('pendingName');

// Stable key for this player in this room, kept per browser tab (it
// survives a page refresh). The server uses it to give a returning player
// their vote back — after a refresh, a reconnect or a server restart.
// crypto.randomUUID() needs a secure context (https/localhost);
// getRandomValues() works everywhere.
function randomKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function playerKeyFor(roomId) {
  const storageKey = `sfPlayerKey:${roomId}`;
  try {
    let key = sessionStorage.getItem(storageKey);
    if (!key) {
      key = randomKey();
      sessionStorage.setItem(storageKey, key);
    }
    return key;
  } catch {
    return randomKey(); // storage unavailable: still stable for this page load
  }
}

export const PLAYER_KEY = playerKeyFor(ROOM_ID);

export const state = {
  joined: false,         // connected and the server sent the room state
  mySocketId: null,
  myName: null,
  room: null,            // last room state from the server, kept in sync by events
  myVote: null,
  mySpectator: false,
  isRevealed: false,
  analyticsLoaded: false,
  currentStats: null,
  currentRoundName: '',
};

export const $ = (id) => document.getElementById(id);
