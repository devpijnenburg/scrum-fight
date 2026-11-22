// Server → client socket events. Each handler updates the shared state and
// delegates rendering to the feature modules.

import { state, $ } from './state.js';
import { socket } from './socket.js';
import { t } from '../core/i18n.js';
import { errorText } from '../core/errors.js';
import { refreshPlayers, renderTable, updateVoteStatus } from './table.js';
import { clearPickerSelection, updateSpectatorUI } from './picker.js';
import { applyRoomState, applyReveal, applyRoundReset } from './rounds.js';
import { showCountdownOverlay, hideCountdownOverlay, showOverlay } from './overlays.js';
import { setRoomName, initAdBanner, initPlanLimitBanner } from './header.js';
import { resolveAndJoin, showNameModal, claimRoomIfLoggedIn, initRoomAuth } from './identity.js';
import { spawnFloatingEmoji, showBadgeCelebration, announceBadge } from './celebrations.js';
import { wireConnectionStatus, markOnline, stopConnectionStatus } from './connection.js';

const findPlayer = (socketId) => state.room?.players.find((p) => p.socketId === socketId);

export function registerSocketEvents() {
  // 'connect' also fires after every reconnect: always (re)join, but run the
  // one-time page setup (which attaches listeners) only once.
  let pageInitDone = false;
  socket.on('connect', () => {
    state.mySocketId = socket.id;
    resolveAndJoin();
    if (pageInitDone) return;
    pageInitDone = true;
    initRoomAuth();
    initAdBanner();
    initPlanLimitBanner();
  });

  // Restored from the back/forward cache (mobile): the socket stays
  // disconnected unless we reconnect explicitly.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted && socket.disconnected) socket.connect();
  });

  wireConnectionStatus();

  socket.on('room-state', (room) => {
    markOnline();
    applyRoomState(room);
    if (room.isGuest) claimRoomIfLoggedIn();
  });

  socket.on('room-claimed', () => {
    if (state.room) state.room.isGuest = false;
  });

  socket.on('player-joined', ({ socketId, name, emoticon, spectator, hasVoted, vote }) => {
    if (!state.room) return;
    // A returning player (refresh, reconnect, server restart) may already
    // have voted in this round.
    const player = {
      socketId, name, emoticon: emoticon || '', hasVoted: Boolean(hasVoted), vote: vote ?? null,
      spectator: spectator || false, joinedMidRound: state.room.revealed && !hasVoted,
    };
    // The same socket can join again (e.g. after logging in): replace, don't add a seat.
    const index = state.room.players.findIndex((p) => p.socketId === socketId);
    if (index === -1) state.room.players.push(player);
    else state.room.players[index] = { ...player, isMe: state.room.players[index].isMe, joinedMidRound: state.room.players[index].joinedMidRound };
    refreshPlayers();
  });

  socket.on('player-left', ({ socketId }) => {
    if (!state.room) return;
    state.room.players = state.room.players.filter((p) => p.socketId !== socketId);
    refreshPlayers();
  });

  socket.on('player-voted', ({ socketId }) => {
    const p = findPlayer(socketId);
    if (p) p.hasVoted = true;
    renderTable();
    updateVoteStatus();
  });

  socket.on('spectator-toggled', ({ socketId, spectator }) => {
    const p = findPlayer(socketId);
    if (p) {
      p.spectator = spectator;
      if (spectator) { p.hasVoted = false; p.vote = null; }
    }
    if (socketId === state.mySocketId) {
      state.mySpectator = spectator;
      if (spectator) { state.myVote = null; clearPickerSelection(); }
      updateSpectatorUI();
    }
    renderTable();
    updateVoteStatus();
  });

  socket.on('countdown', ({ count }) => showCountdownOverlay(count));
  socket.on('countdown-cancelled', () => hideCountdownOverlay());

  socket.on('round-name-set', ({ name }) => {
    state.currentRoundName = name;
    $('roundNameInput').value = name;
  });

  socket.on('cards-revealed', (payload) => applyReveal(payload));
  socket.on('round-reset', () => applyRoundReset());
  socket.on('room-name-updated', ({ name }) => setRoomName(name));

  socket.on('room-expired', ({ reason }) => {
    stopConnectionStatus();
    showOverlay('😴', t('room.overlay.expired'),
      reason === 'inactivity' ? t('room.expired_inactivity') : t('room.expired_other'));
  });

  // This tab's seat was taken over by another tab with the same session
  // (a duplicated tab). Stop here instead of fighting over the seat.
  socket.on('session-replaced', () => {
    stopConnectionStatus();
    socket.disconnect();
    showOverlay('🪟', t('room.replaced.title'), t('room.replaced.msg'));
  });

  // Errors carry { code, message, …details }; the text comes from i18n.
  socket.on('error', (err = {}) => {
    if (err.code !== 'NAME_REQUIRED') stopConnectionStatus();
    if (err.code === 'ROOM_NOT_FOUND') showOverlay('🚫', t('room.not_found'), t('room.not_found_msg'));
    else if (err.code === 'ROOM_FULL') showOverlay('😶', t('room.full'), errorText(err));
    else if (err.code === 'NAME_REQUIRED') showNameModal();
    else showOverlay('⚠️', t('room.error'), errorText(err, t('room.error_unknown')));
  });

  socket.on('reaction', ({ name, emoji }) => spawnFloatingEmoji(emoji, name));

  socket.on('badge-earned', ({ badgeIds }) => {
    badgeIds.forEach((id, i) => setTimeout(() => showBadgeCelebration(id), i * 1200));
    document.querySelector('profile-menu')?.addBadgeCount(badgeIds.length);
  });

  socket.on('badge-announced', ({ playerName, badgeId }) => announceBadge(playerName, badgeId));

  // All handlers are in place: now connect (see socket.js).
  socket.connect();
}
