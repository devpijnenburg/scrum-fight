// Scrum Fight room — real-time game logic

const params = new URLSearchParams(location.search);
const ROOM_ID = (params.get('id') || '').toUpperCase();
const NAME_FROM_SESSION = sessionStorage.getItem('pendingName') || '';
sessionStorage.removeItem('pendingName');

if (!ROOM_ID) {
  window.location.href = '/';
}

// ── State ─────────────────────────────────────────────────────────────────────

let mySocketId = null;
let myName = null;
let roomState = null;
let myVote = null;
let isRevealed = false;

// ── Socket connection ─────────────────────────────────────────────────────────

const socket = io();

// ── Name resolution ───────────────────────────────────────────────────────────

function resolveAndJoin() {
  const user = getCurrentUser();

  if (user) {
    myName = user.name;
    joinRoomSocket(user.name, localStorage.getItem('token'));
    return;
  }

  const savedName = NAME_FROM_SESSION || localStorage.getItem('userName') || '';
  if (savedName) {
    myName = savedName;
    joinRoomSocket(savedName, null);
  } else {
    showNameModal();
  }
}

function showNameModal() {
  document.getElementById('nameModal').classList.remove('hidden');
  document.getElementById('nameInput').focus();

  document.getElementById('nameSubmitBtn').addEventListener('click', submitName);
  document.getElementById('nameInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitName();
  });
}

function submitName() {
  const name = document.getElementById('nameInput').value.trim();
  if (!name) {
    document.getElementById('nameError').classList.remove('hidden');
    return;
  }
  document.getElementById('nameModal').classList.add('hidden');
  myName = name;
  localStorage.setItem('userName', name);
  joinRoomSocket(name, null);
}

function joinRoomSocket(name, token) {
  socket.emit('join-room', { roomId: ROOM_ID, playerName: name, token });
}

// ── Socket events ─────────────────────────────────────────────────────────────

socket.on('connect', () => {
  mySocketId = socket.id;
  resolveAndJoin();
  initRoomAuth();
});

socket.on('room-state', (state) => {
  roomState = state;
  isRevealed = state.revealed;
  renderAll(state);
});

socket.on('player-joined', ({ socketId, name }) => {
  if (!roomState) return;
  roomState.players.push({ socketId, name, hasVoted: false, vote: null });
  renderTable(roomState);
  updatePlayerCount(roomState.players.length);
  updateVoteStatus();
});

socket.on('player-left', ({ socketId }) => {
  if (!roomState) return;
  roomState.players = roomState.players.filter((p) => p.socketId !== socketId);
  renderTable(roomState);
  updatePlayerCount(roomState.players.length);
  updateVoteStatus();
});

socket.on('player-voted', ({ socketId }) => {
  if (!roomState) return;
  const p = roomState.players.find((p) => p.socketId === socketId);
  if (p) p.hasVoted = true;
  renderTable(roomState);
  updateVoteStatus();
});

socket.on('cards-revealed', ({ players, stats }) => {
  isRevealed = true;
  if (roomState) {
    players.forEach(({ socketId, vote }) => {
      const p = roomState.players.find((p) => p.socketId === socketId);
      if (p) { p.vote = vote; p.hasVoted = true; }
    });
    roomState.revealed = true;
  }
  renderTable(roomState);
  showStats(stats);
  document.getElementById('revealBtn').classList.add('hidden');
  document.getElementById('newRoundBtn').classList.remove('hidden');
  setPickerDisabled(true);
  document.getElementById('voteStatus').textContent = t('room.revealed');
});

socket.on('round-reset', () => {
  isRevealed = false;
  myVote = null;
  if (roomState) {
    roomState.revealed = false;
    roomState.players.forEach((p) => { p.vote = null; p.hasVoted = false; });
  }
  renderTable(roomState);
  document.getElementById('statsPanel').classList.add('hidden');
  document.getElementById('revealBtn').classList.remove('hidden');
  document.getElementById('revealBtn').disabled = true;
  document.getElementById('newRoundBtn').classList.add('hidden');
  setPickerDisabled(false);
  clearPickerSelection();
  updateVoteStatus();
});

socket.on('room-name-updated', ({ name }) => {
  if (roomState) roomState.name = name;
  document.getElementById('roomNameDisplay').textContent = name;
  document.title = `${name} — Scrum Fight`;
});

socket.on('room-expired', ({ reason }) => {
  showOverlay(
    '😴',
    t('room.overlay.expired'),
    reason === 'inactivity' ? t('room.expired_inactivity') : t('room.expired_other')
  );
});

socket.on('error', ({ code, message }) => {
  if (code === 'ROOM_NOT_FOUND') {
    showOverlay('🚫', t('room.not_found'), t('room.not_found_msg'));
  } else if (code === 'ROOM_FULL') {
    showOverlay('😶', t('room.full'), message);
  } else if (code === 'NAME_REQUIRED') {
    showNameModal();
  } else {
    showOverlay('⚠️', t('room.error'), message || t('room.error_unknown'));
  }
});

// ── Actions ───────────────────────────────────────────────────────────────────

document.getElementById('revealBtn').addEventListener('click', () => {
  socket.emit('reveal');
});

document.getElementById('newRoundBtn').addEventListener('click', () => {
  socket.emit('new-round');
});

const roomNameDisplay = document.getElementById('roomNameDisplay');
const roomNameInput = document.getElementById('roomNameInput');
const editNameBtn = document.getElementById('editNameBtn');

editNameBtn.addEventListener('click', () => {
  roomNameInput.value = roomState?.name || '';
  roomNameDisplay.classList.add('hidden');
  editNameBtn.classList.add('hidden');
  roomNameInput.classList.remove('hidden');
  roomNameInput.focus();
  roomNameInput.select();
});

function saveRoomName() {
  const newName = roomNameInput.value.trim();
  roomNameDisplay.classList.remove('hidden');
  editNameBtn.classList.remove('hidden');
  roomNameInput.classList.add('hidden');
  if (newName && newName !== roomState?.name) {
    socket.emit('update-room-name', { name: newName });
  }
}

roomNameInput.addEventListener('blur', saveRoomName);
roomNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') roomNameInput.blur();
  if (e.key === 'Escape') {
    roomNameInput.value = roomState?.name || '';
    roomNameInput.blur();
  }
});

document.getElementById('copyCodeBtn').addEventListener('click', () => {
  const code = document.getElementById('roomCodeDisplay').textContent;
  navigator.clipboard.writeText(code).catch(() => {});
  const btn = document.getElementById('copyCodeBtn');
  btn.textContent = '✅';
  setTimeout(() => { btn.textContent = '📋'; }, 1500);
});

// ── Auth button (guests only) ─────────────────────────────────────────────────

function initRoomAuth() {
  const user = getCurrentUser();
  if (user) {
    showRoomUserBadge(user.name);
    return;
  }

  const authBtn = document.getElementById('roomAuthBtn');
  authBtn.classList.remove('hidden');
  authBtn.addEventListener('click', () => openRoomAuthModal());

  // Tab switching
  document.querySelectorAll('#roomAuthModal .auth-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#roomAuthModal .auth-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('roomLoginForm').classList.toggle('hidden', tab.dataset.tab !== 'login');
      document.getElementById('roomRegisterForm').classList.toggle('hidden', tab.dataset.tab !== 'register');
    });
  });

  document.getElementById('roomAuthBackdrop').addEventListener('click', closeRoomAuthModal);

  document.getElementById('roomLoginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('roomLoginError');
    err.classList.add('hidden');
    try {
      const { user, token } = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: document.getElementById('roomLoginEmail').value,
          password: document.getElementById('roomLoginPassword').value,
        }),
      });
      onRoomAuthSuccess(user, token);
    } catch (ex) {
      err.textContent = ex.message;
      err.classList.remove('hidden');
    }
  });

  document.getElementById('roomRegisterForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('roomRegError');
    err.classList.add('hidden');
    try {
      const { user, token } = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: document.getElementById('roomRegName').value,
          email: document.getElementById('roomRegEmail').value,
          password: document.getElementById('roomRegPassword').value,
        }),
      });
      onRoomAuthSuccess(user, token);
    } catch (ex) {
      err.textContent = ex.message;
      err.classList.remove('hidden');
    }
  });

  // Pass current room URL as redirect for OAuth
  const returnUrl = encodeURIComponent(location.pathname + location.search);
  document.getElementById('roomGoogleBtn').href = `/api/auth/google?return=${returnUrl}`;
  document.getElementById('roomGithubBtn').href = `/api/auth/github?return=${returnUrl}`;
}

function openRoomAuthModal() {
  document.getElementById('roomAuthModal').classList.remove('hidden');
  document.getElementById('roomLoginEmail').focus();
}

function closeRoomAuthModal() {
  document.getElementById('roomAuthModal').classList.add('hidden');
}

function onRoomAuthSuccess(user, token) {
  localStorage.setItem('token', token);
  localStorage.setItem('userName', user.name);
  closeRoomAuthModal();
  document.getElementById('roomAuthBtn').classList.add('hidden');
  showRoomUserBadge(user.name);
}

function showRoomUserBadge(name) {
  const badge = document.getElementById('roomUserBadge');
  badge.textContent = `👤 ${name}`;
  badge.classList.remove('hidden');
}

// ── Share / invite ────────────────────────────────────────────────────────────

const shareBtn = document.getElementById('shareBtn');
const sharePopover = document.getElementById('sharePopover');
const shareUrl = document.getElementById('shareUrl');

shareBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const link = `${location.origin}/?join=${ROOM_ID}`;
  shareUrl.value = link;
  sharePopover.classList.toggle('hidden');
  if (!sharePopover.classList.contains('hidden')) {
    shareUrl.select();
  }
});

document.getElementById('sharePopoverCopyBtn').addEventListener('click', () => {
  navigator.clipboard.writeText(shareUrl.value).catch(() => {});
  const msg = document.getElementById('shareCopiedMsg');
  msg.textContent = t('room.share.copied');
  msg.classList.remove('hidden');
  setTimeout(() => msg.classList.add('hidden'), 2000);
});

document.addEventListener('click', (e) => {
  if (!sharePopover.classList.contains('hidden') && !sharePopover.contains(e.target) && e.target !== shareBtn) {
    sharePopover.classList.add('hidden');
  }
});

// ── Render ────────────────────────────────────────────────────────────────────

function renderAll(state) {
  document.getElementById('roomNameDisplay').textContent = state.name;
  document.getElementById('roomCodeDisplay').textContent = state.id;
  document.getElementById('methodBadge').textContent = state.methodLabel;
  document.title = `${state.name} — Scrum Fight`;

  updatePlayerCount(state.players.length);
  renderPickerCards(state.cardValues);
  renderTable(state);
  updateVoteStatus();

  if (state.revealed) {
    document.getElementById('revealBtn').classList.add('hidden');
    document.getElementById('newRoundBtn').classList.remove('hidden');
    setPickerDisabled(true);
  }
}

// ── Poker table rendering ─────────────────────────────────────────────────────

function renderTable(state) {
  if (!state) return;
  const table = document.getElementById('pokerTable');
  table.querySelectorAll('.player-seat').forEach((el) => el.remove());

  const players = state.players;
  const count = players.length;
  if (!count) return;

  players.forEach((player, i) => {
    const isMe = player.socketId === mySocketId;
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    const rx = 42;
    const ry = 38;
    const cx = 50 + rx * Math.cos(angle);
    const cy = 50 + ry * Math.sin(angle);

    const seat = document.createElement('div');
    seat.className = 'player-seat pop-in';
    seat.style.left = `${cx}%`;
    seat.style.top = `${cy}%`;

    const card = createCardEl(player, state.revealed, isMe);
    const nameTag = document.createElement('div');
    nameTag.className = `player-name-tag${isMe ? ' is-me' : ''}`;
    nameTag.textContent = player.name;

    seat.appendChild(card);
    seat.appendChild(nameTag);
    table.appendChild(seat);
  });
}

function createCardEl(player, revealed, isMe) {
  const container = document.createElement('div');
  container.className = 'card-container';

  const card = document.createElement('div');
  card.className = 'card';

  const back = document.createElement('div');
  back.className = 'card-face card-back-face';
  back.textContent = player.hasVoted ? '🂠' : '';

  const front = document.createElement('div');
  front.className = 'card-face card-front-face';
  front.setAttribute('data-value', player.vote || '');

  const value = player.vote || '';
  front.innerHTML = `
    <span class="card-corner card-corner-tl">${value}</span>
    <span class="card-value">${value}</span>
    <span class="card-corner card-corner-br">${value}</span>
  `;

  card.appendChild(back);
  card.appendChild(front);

  if (revealed && player.hasVoted) {
    card.classList.add('flipped');
  }

  container.appendChild(card);
  return container;
}

// ── Card picker ───────────────────────────────────────────────────────────────

function renderPickerCards(values) {
  const row = document.getElementById('cardPickerRow');
  row.innerHTML = '';
  values.forEach((val) => {
    const card = document.createElement('button');
    card.className = 'picker-card';
    card.textContent = val;
    card.dataset.value = val;
    card.addEventListener('click', () => castVote(val, card));
    row.appendChild(card);
  });
}

function castVote(value, cardEl) {
  if (isRevealed) return;
  myVote = value;

  document.querySelectorAll('.picker-card').forEach((c) => c.classList.remove('selected'));
  cardEl.classList.add('selected');

  if (roomState) {
    const me = roomState.players.find((p) => p.socketId === mySocketId);
    if (me) { me.vote = value; me.hasVoted = true; }
  }

  socket.emit('vote', { value });
  document.getElementById('revealBtn').disabled = false;
  renderTable(roomState);
  updateVoteStatus();
}

function setPickerDisabled(disabled) {
  document.querySelectorAll('.picker-card').forEach((c) => {
    c.classList.toggle('disabled', disabled);
    c.disabled = disabled;
  });
}

function clearPickerSelection() {
  document.querySelectorAll('.picker-card').forEach((c) => c.classList.remove('selected'));
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function showStats(stats) {
  const panel = document.getElementById('statsPanel');
  const grid = document.getElementById('statsGrid');

  if (!stats) { panel.classList.add('hidden'); return; }

  let html = '';

  if (stats.allSame) {
    html += `<div class="stat-consensus">${t('room.stats.consensus')}</div>`;
  }

  if (stats.average !== undefined) {
    html += statItem(stats.average, t('room.stats.average'));
    html += statItem(stats.min, t('room.stats.min'));
    html += statItem(stats.max, t('room.stats.max'));
  }

  if (stats.mode) {
    html += statItem(stats.mode, t('room.stats.mode'));
  }

  if (stats.distribution) {
    const distItems = Object.entries(stats.distribution)
      .sort((a, b) => b[1] - a[1])
      .map(([v, c]) => `<span>${v}: ${c}×</span>`)
      .join('');
    html += `<div class="stat-item"><div style="display:flex;gap:.6rem;flex-wrap:wrap;font-size:.85rem;color:var(--text-muted)">${distItems}</div><div class="stat-label">${t('room.stats.distribution')}</div></div>`;
  }

  grid.innerHTML = html;
  panel.classList.remove('hidden');
}

function statItem(value, label) {
  return `<div class="stat-item"><div class="stat-value">${value}</div><div class="stat-label">${label}</div></div>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function updateVoteStatus() {
  if (!roomState) return;
  const voted = roomState.players.filter((p) => p.hasVoted).length;
  const total = roomState.players.length;
  const word = total === 1 ? t('room.player_s') : t('room.player_p');
  document.getElementById('voteStatus').textContent =
    isRevealed ? t('room.revealed') : t('room.voted', { voted, total, word });

  if (!isRevealed) {
    document.getElementById('revealBtn').disabled = voted === 0;
  }
}

function updatePlayerCount(count) {
  const key = count === 1 ? 'room.participants_s' : 'room.participants_p';
  document.getElementById('playerCount').textContent = t(key, { count });
}

function showOverlay(icon, title, message) {
  document.getElementById('overlayIcon').textContent = icon;
  document.getElementById('overlayTitle').textContent = title;
  document.getElementById('overlayMessage').textContent = message;
  document.getElementById('roomOverlay').classList.remove('hidden');
  setTimeout(() => { window.location.href = '/'; }, 5000);
}
