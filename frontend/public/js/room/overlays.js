// Full-screen overlays: the reveal countdown and the "room gone" screen.

import { state, $ } from './state.js';

export function showCountdownOverlay(count) {
  const num = $('countdownNumber');
  num.textContent = count;
  // Re-trigger the pop animation by replacing the element
  const clone = num.cloneNode(true);
  num.replaceWith(clone);
  $('countdownOverlay').classList.remove('hidden');
  $('revealBtn').classList.add('hidden');
  $('newRoundBtn').classList.add('hidden');
}

export function hideCountdownOverlay() {
  $('countdownOverlay').classList.add('hidden');
  if (!state.isRevealed) $('revealBtn').classList.remove('hidden');
}

const LEAVE_AFTER_MS = 5000;

// Shows a terminal message (room expired, not found, full) and returns home.
export function showOverlay(icon, title, message) {
  $('overlayIcon').textContent = icon;
  $('overlayTitle').textContent = title;
  $('overlayMessage').textContent = message;
  $('roomOverlay').classList.remove('hidden');
  setTimeout(() => { window.location.href = '/'; }, LEAVE_AFTER_MS);
}
