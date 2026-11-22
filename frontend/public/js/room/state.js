// Shared, mutable state of the room page. One object so every module reads
// and writes the same values (ES module bindings cannot be reassigned from
// outside their own module).

const params = new URLSearchParams(location.search);

export const ROOM_ID = (params.get('id') || '').toUpperCase();
export const FROM_JOIN_LINK = !!params.get('join');

// A name typed on the landing page is handed over once via sessionStorage.
export const NAME_FROM_SESSION = sessionStorage.getItem('pendingName') || '';
sessionStorage.removeItem('pendingName');

export const state = {
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
