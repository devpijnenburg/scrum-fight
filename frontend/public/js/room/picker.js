// The card picker: the row of cards a player votes with.

import { state, $ } from './state.js';
import { socket } from './socket.js';
import { renderTable, updateVoteStatus } from './table.js';

const pickerCards = () => document.querySelectorAll('#cardPickerRow .picker-card');

export function renderPickerCards(values) {
  const row = $('cardPickerRow');
  row.innerHTML = '';
  for (const value of values) {
    const card = document.createElement('button');
    card.className = 'picker-card';
    card.textContent = value;
    card.dataset.value = value;
    card.addEventListener('click', () => castVote(value, card));
    row.appendChild(card);
  }
}

export function castVote(value, cardEl) {
  if (state.isRevealed) return;
  state.myVote = value;

  pickerCards().forEach((c) => c.classList.remove('selected'));
  cardEl.classList.add('selected');

  const me = state.room?.players.find((p) => p.socketId === state.mySocketId);
  if (me) { me.vote = value; me.hasVoted = true; }

  socket.emit('vote', { value });
  $('revealBtn').disabled = false;
  renderTable();
  updateVoteStatus();
}

export function setPickerDisabled(disabled) {
  pickerCards().forEach((c) => {
    c.classList.toggle('disabled', disabled);
    c.disabled = disabled;
  });
}

// Marks the card with this value as the player's choice (e.g. after rejoining).
export function showSelectedCard(value) {
  pickerCards().forEach((c) => c.classList.toggle('selected', value !== null && c.dataset.value === value));
}

export function clearPickerSelection() {
  pickerCards().forEach((c) => c.classList.remove('selected'));
}

// Selects a card by its 1-based position (0 = tenth card) or by value.
export function pickByPosition(position) {
  const cards = [...document.querySelectorAll('.picker-card:not(.disabled)')];
  const target = position === 0 ? cards[9] : cards[position - 1];
  target?.click();
}

export function pickByValue(value) {
  [...document.querySelectorAll('.picker-card:not(.disabled)')].find((c) => c.dataset.value === value)?.click();
}

export function updateSpectatorUI() {
  $('cardPicker').classList.toggle('hidden', state.mySpectator);
  $('spectatorBar').classList.toggle('hidden', !state.mySpectator);
}
