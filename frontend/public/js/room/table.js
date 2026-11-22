// The poker table: player seats with their cards, vote progress and
// participant count.

import { state, $ } from './state.js';
import { t } from '../core/i18n.js';

const SEAT_RADIUS_X = 42; // % of the table
const SEAT_RADIUS_Y = 38;

function createCardEl(player, revealed, noAnim) {
  const container = document.createElement('div');
  container.className = `card-container${player.joinedMidRound ? ' card-mid-round' : ''}${player.spectator ? ' card-spectator' : ''}`;

  if (player.spectator) {
    const placeholder = document.createElement('div');
    placeholder.className = 'card-spectator-placeholder';
    container.appendChild(placeholder);
    return container;
  }

  const card = document.createElement('div');
  card.className = 'card';

  const back = document.createElement('div');
  back.className = `card-face card-back-face${player.hasVoted ? '' : ' card-unvoted'}`;
  back.textContent = player.hasVoted ? '🂠' : '?';

  const front = document.createElement('div');
  front.className = 'card-face card-front-face';
  if (revealed && !player.hasVoted) {
    front.classList.add('card-no-vote');
    front.innerHTML = '<span class="card-value">—</span>';
  } else {
    const value = player.vote || '';
    front.setAttribute('data-value', value);
    for (const cls of ['card-corner card-corner-tl', 'card-value', 'card-corner card-corner-br']) {
      const span = document.createElement('span');
      span.className = cls;
      span.textContent = value;
      front.appendChild(span);
    }
  }

  card.append(back, front);
  if (revealed) {
    // noAnim: show the flipped state directly (e.g. after a reconnect)
    if (noAnim) card.style.transition = 'none';
    card.classList.add('flipped');
    if (noAnim) requestAnimationFrame(() => { card.style.transition = ''; });
  }

  container.appendChild(card);
  return container;
}

export function renderTable(noAnim = false) {
  const room = state.room;
  if (!room) return;
  const table = $('pokerTable');
  table.querySelectorAll('.player-seat, .table-waiting').forEach((el) => el.remove());

  const players = room.players;
  if (players.length < 2 && !room.revealed) {
    const hint = document.createElement('div');
    hint.className = 'table-waiting';
    hint.textContent = t('room.table_waiting');
    table.appendChild(hint);
  }

  players.forEach((player, i) => {
    const isMe = player.socketId === state.mySocketId;
    const angle = (2 * Math.PI * i) / players.length - Math.PI / 2;

    const seat = document.createElement('div');
    seat.className = 'player-seat pop-in';
    seat.style.left = `${50 + SEAT_RADIUS_X * Math.cos(angle)}%`;
    seat.style.top = `${50 + SEAT_RADIUS_Y * Math.sin(angle)}%`;

    const nameTag = document.createElement('div');
    nameTag.className = `player-name-tag${isMe ? ' is-me' : ''}${player.spectator ? ' is-spectator' : ''}`;
    const displayName = player.emoticon ? `${player.emoticon} ${player.name}` : player.name;
    nameTag.textContent = player.spectator ? `${displayName} 👁` : displayName;

    seat.append(createCardEl(player, room.revealed, noAnim), nameTag);

    if (player.joinedMidRound) {
      const lateLabel = document.createElement('div');
      lateLabel.className = 'player-late-label';
      lateLabel.textContent = t('room.late_joiner');
      seat.appendChild(lateLabel);
    }
    table.appendChild(seat);
  });
}

export function updateVoteStatus() {
  const room = state.room;
  if (!room) return;
  const voters = room.players.filter((p) => !p.spectator);
  const voted = voters.filter((p) => p.hasVoted).length;
  const total = voters.length;
  const el = $('voteStatus');

  if (state.isRevealed) {
    el.innerHTML = `<span class="vc-revealed">${t('room.revealed')}</span>`;
    return;
  }
  if (total === 0) {
    el.innerHTML = '';
    $('revealBtn').disabled = true;
    return;
  }

  const pct = Math.round((voted / total) * 100);
  el.innerHTML = `
    <div class="vc-row">
      <span class="vc-num">${voted}</span><span class="vc-sep">/</span><span class="vc-total">${total}</span>
      <span class="vc-label">${t('room.voted_label')}</span>
    </div>
    <div class="vc-bar"><div class="vc-bar-fill${voted === total ? ' complete' : ''}" style="width:${pct}%"></div></div>
  `;
  $('revealBtn').disabled = voted === 0;
}

export function updatePlayerCount() {
  const count = state.room?.players.length ?? 0;
  const key = count === 1 ? 'room.participants_s' : 'room.participants_p';
  $('playerCount').textContent = t(key, { count });
}

// Re-render everything that depends on the player list.
export function refreshPlayers() {
  renderTable();
  updatePlayerCount();
  updateVoteStatus();
}
