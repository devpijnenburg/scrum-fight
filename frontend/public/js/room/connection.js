// Connection status of the room page.
//
// While the socket is disconnected (network blip, server deploy) the page
// shows "Reconnecting…", greys out the table and controls, and blocks game
// actions: socket.io would otherwise buffer them and send them on reconnect
// *before* the player has rejoined, where the server ignores them.
// The page counts as online again once the server sent the room state.

import { state, $ } from './state.js';
import { socket } from './socket.js';

const SHOW_AFTER_MS = 1000;  // don't flash the banner for very short blips
const HINT_AFTER_MS = 15000; // then suggest checking the connection

let showTimer = null;
let hintTimer = null;

export function isOnline() {
  return state.joined && socket.connected;
}

// Emits a game action only when connected and joined; returns whether it was sent.
export function send(event, payload) {
  if (!isOnline()) return false;
  socket.emit(event, payload);
  return true;
}

function showBanner() {
  $('connectionBanner').classList.remove('hidden');
  document.body.classList.add('room-offline');
  hintTimer = setTimeout(() => $('connectionHint').classList.remove('hidden'), HINT_AFTER_MS - SHOW_AFTER_MS);
}

export function markOffline() {
  state.joined = false;
  if (showTimer) return;
  showTimer = setTimeout(showBanner, SHOW_AFTER_MS);
}

// Called when the server sent the room state again (or the page ends).
export function markOnline() {
  state.joined = true;
  clearTimeout(showTimer);
  clearTimeout(hintTimer);
  showTimer = null;
  hintTimer = null;
  $('connectionBanner').classList.add('hidden');
  $('connectionHint').classList.add('hidden');
  document.body.classList.remove('room-offline');
}

// The page is over (room expired, not found, full): no reconnect banner.
export function stopConnectionStatus() {
  markOnline();
  state.joined = false;
}

export function wireConnectionStatus() {
  socket.on('disconnect', (reason) => {
    if (reason === 'io client disconnect') return; // we closed it ourselves
    markOffline();
    // After a server-initiated disconnect (e.g. shutdown during a deploy)
    // socket.io does not reconnect on its own.
    if (reason === 'io server disconnect') setTimeout(() => socket.connect(), 1000);
  });
}
