// Player actions: reveal, new round, round name, spectator mode, reactions
// and keyboard shortcuts.

import { state, $ } from './state.js';
import { send } from './connection.js';
import { pickByPosition, pickByValue } from './picker.js';

const REVEAL_COOLDOWN_MS = 2000;   // matches the server-side flood control
const ROUND_NAME_DEBOUNCE_MS = 400;

let revealCoolingDown = false;

function requestReveal() {
  const btn = $('revealBtn');
  if (btn.disabled || btn.classList.contains('hidden') || revealCoolingDown) return;
  if (!send('reveal')) return;
  revealCoolingDown = true;
  setTimeout(() => { revealCoolingDown = false; }, REVEAL_COOLDOWN_MS);
}

function requestNewRound() {
  if ($('newRoundBtn').classList.contains('hidden')) return;
  send('new-round');
}

function wireRoundName() {
  let timer = null;
  $('roundNameInput').addEventListener('input', (e) => {
    state.currentRoundName = e.target.value;
    clearTimeout(timer);
    timer = setTimeout(() => send('set-round-name', { name: state.currentRoundName }), ROUND_NAME_DEBOUNCE_MS);
  });
}

function wireKeyboard() {
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.querySelector('.modal:not(.hidden)')) return; // don't act behind a dialog

    const key = e.key.toLowerCase();
    if (key === 'r') return requestReveal();
    if (key === 'n') return requestNewRound();
    if (e.key === '?') return pickByValue('?');

    const position = parseInt(e.key, 10); // 1–9 pick by position, 0 = tenth card
    if (!isNaN(position)) pickByPosition(position);
  });
}

export function wireControls() {
  $('revealBtn').addEventListener('click', requestReveal);
  $('newRoundBtn').addEventListener('click', () => send('new-round'));
  $('spectatorToggleBtn').addEventListener('click', () => send('toggle-spectator'));
  $('spectatorJoinBtn').addEventListener('click', () => send('toggle-spectator'));
  document.querySelectorAll('.reaction-btn').forEach((btn) => {
    btn.addEventListener('click', () => send('react', { emoji: btn.dataset.emoji }));
  });
  wireRoundName();
  wireKeyboard();
}
