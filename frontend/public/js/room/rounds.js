// The round lifecycle on screen: full render from server state, reveal
// and reset. Socket events and the initial room state go through here.

import { state, $ } from './state.js';
import { t } from '../core/i18n.js';
import { renderHeader } from './header.js';
import { renderTable, updateVoteStatus, updatePlayerCount } from './table.js';
import { renderPickerCards, setPickerDisabled, clearPickerSelection, updateSpectatorUI } from './picker.js';
import {
  autoOpenAnalytics, updateAnalyticsCurrent, hideAnalyticsCurrent, prependHistoryRound,
  showConsensusInline, hideConsensusInline, setReactionBarEmojis,
} from './analytics.js';
import { hideCountdownOverlay } from './overlays.js';

function showRevealedControls(stats, roundName) {
  $('revealBtn').classList.add('hidden');
  $('newRoundBtn').classList.remove('hidden');
  $('roundNameInput').disabled = true;
  $('reactionBar').classList.remove('hidden');
  setPickerDisabled(true);
  if (stats) {
    showConsensusInline(stats);
    setReactionBarEmojis(stats);
    updateAnalyticsCurrent(stats, roundName);
    autoOpenAnalytics();
  }
}

// Full state from the server (join and reconnect).
export function applyRoomState(room) {
  state.room = room;
  state.isRevealed = room.revealed;
  state.currentRoundName = room.roundName || '';
  state.mySpectator = room.players.find((p) => p.isMe)?.spectator || false;
  $('roundNameInput').value = state.currentRoundName;

  renderHeader(room);
  updatePlayerCount();
  renderPickerCards(room.cardValues);
  // noAnim: on (re)connect show cards in their final state without the
  // 3-D flip, which can glitch when a mobile tab is restored.
  renderTable(true);
  updateVoteStatus();
  updateSpectatorUI();
  if (room.revealed) showRevealedControls(room.stats, room.roundName || '');
}

export function applyReveal({ players, stats, roundName }) {
  hideCountdownOverlay();
  state.currentRoundName = roundName || state.currentRoundName;
  state.isRevealed = true;
  state.currentStats = stats;
  if (state.room) {
    for (const { socketId, vote } of players) {
      const p = state.room.players.find((pl) => pl.socketId === socketId);
      if (p) { p.vote = vote; p.hasVoted = true; }
    }
    state.room.revealed = true;
  }
  renderTable();
  prependHistoryRound(players, stats, state.currentRoundName);
  showRevealedControls(stats, state.currentRoundName);
  $('voteStatus').textContent = t('room.revealed');
}

export function applyRoundReset() {
  hideCountdownOverlay();
  state.isRevealed = false;
  state.myVote = null;
  state.currentStats = null;
  state.currentRoundName = '';
  if (state.room) {
    state.room.revealed = false;
    state.room.players.forEach((p) => { p.vote = null; p.hasVoted = false; p.joinedMidRound = false; });
  }
  renderTable();
  hideConsensusInline();
  hideAnalyticsCurrent();
  $('reactionBar').classList.add('hidden');
  $('revealBtn').classList.remove('hidden');
  $('revealBtn').disabled = true;
  $('newRoundBtn').classList.add('hidden');
  const roundName = $('roundNameInput');
  roundName.value = '';
  roundName.disabled = false;
  setPickerDisabled(false);
  clearPickerSelection();
  updateVoteStatus();
}
