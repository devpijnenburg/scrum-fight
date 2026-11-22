// The round lifecycle on screen: full render from server state, reveal
// and reset. Socket events and the initial room state go through here.

import { state, $ } from './state.js';
import { t } from '../core/i18n.js';
import { renderHeader } from './header.js';
import { renderTable, updateVoteStatus, updatePlayerCount } from './table.js';
import { renderPickerCards, setPickerDisabled, clearPickerSelection, showSelectedCard, updateSpectatorUI } from './picker.js';
import {
  autoOpenAnalytics, updateAnalyticsCurrent, hideAnalyticsCurrent, prependHistoryRound, syncHistory,
  showConsensusInline, hideConsensusInline, setReactionBarEmojis,
} from './analytics.js';
import { hideCountdownOverlay } from './overlays.js';
import { cancelPendingRoundName } from './controls.js';

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

// The controls of a round that is still open for voting.
function showVotingControls() {
  hideConsensusInline();
  hideAnalyticsCurrent();
  $('reactionBar').classList.add('hidden');
  $('revealBtn').classList.remove('hidden');
  $('newRoundBtn').classList.add('hidden');
  $('roundNameInput').disabled = false;
  setPickerDisabled(false);
}

// Full state from the server (join and every reconnect). The page may show
// anything at this point — a round that ended while we were offline, a
// countdown that never finished — so every control is set from this state.
export function applyRoomState(room) {
  state.room = room;
  state.isRevealed = room.revealed;
  state.currentRoundName = room.roundName || '';
  state.currentStats = room.stats || null;
  state.mySpectator = room.players.find((p) => p.isMe)?.spectator || false;
  state.myVote = room.myVote ?? null;
  cancelPendingRoundName();
  $('roundNameInput').value = state.currentRoundName;

  hideCountdownOverlay();
  renderHeader(room);
  updatePlayerCount();
  renderPickerCards(room.cardValues);
  showSelectedCard(state.myVote); // a vote restored after a refresh or restart
  // noAnim: on (re)connect show cards in their final state without the
  // 3-D flip, which can glitch when a mobile tab is restored.
  renderTable(true);
  updateSpectatorUI();
  if (room.revealed) showRevealedControls(room.stats, room.roundName || '');
  else showVotingControls();
  updateVoteStatus();
  syncHistory();
}

export function applyReveal({ players, stats, roundName }) {
  hideCountdownOverlay();
  state.currentRoundName = roundName || state.currentRoundName;
  state.isRevealed = true;
  state.currentStats = stats;
  if (state.room) {
    for (const { socketId, vote } of players) {
      const p = state.room.players.find((pl) => pl.socketId === socketId);
      // Someone who did not vote shows "—", not an empty card.
      if (p) { p.vote = vote; p.hasVoted = vote !== null; }
    }
    state.room.revealed = true;
    // My own vote as the server counted it: a click that crossed the reveal
    // was not counted, so don't keep showing it as chosen.
    const mine = state.room.players.find((p) => p.socketId === state.mySocketId);
    if (mine && mine.vote !== state.myVote) {
      state.myVote = mine.vote;
      showSelectedCard(state.myVote);
    }
  }
  renderTable();
  prependHistoryRound(players, stats, state.currentRoundName);
  showRevealedControls(stats, state.currentRoundName);
  $('voteStatus').textContent = t('room.revealed');
}

export function applyRoundReset() {
  hideCountdownOverlay();
  cancelPendingRoundName();
  state.isRevealed = false;
  state.myVote = null;
  state.currentStats = null;
  state.currentRoundName = '';
  if (state.room) {
    state.room.revealed = false;
    state.room.players.forEach((p) => { p.vote = null; p.hasVoted = false; p.joinedMidRound = false; });
  }
  renderTable();
  showVotingControls();
  $('roundNameInput').value = '';
  clearPickerSelection();
  updateVoteStatus();
}
