// Planning Poker room — real-time game logic

const params = new URLSearchParams(location.search);
const ROOM_ID = (params.get('id') || '').toUpperCase();
const NAME_FROM_URL = params.get('name') || '';

if (!ROOM_ID) {
  window.location.href = '/';
}

// ── State ─────────────────────────────────────────────────────────────────────

let mySocketId = null;
let myName = null;
let roomState = null;        // latest serialized room from server
let myVote = null;
let isRevealed = false;

// ── Socket connection ─────────────────────────────────────────────────────────

const socket = io();

// ── Name resolution ───────────────────────────────────────────────────────────

function resolveAndJoin() {
  const user = getCurrentUser();

  if (user) {
    // Logged-in user: name from token
    myName = user.name;
    joinRoom(user.name, localStorage.getItem('token'));
    return;
  }

  // Guest: use name from URL param or localStorage or show modal
  const savedName = NAME_FROM_URL || localStorage.getItem('userName') || '';
  if (savedName) {
    myName = savedName;
    joinRoom(savedName, null);
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
  joinRoom(name, null);
}

function joinRoom(name, token) {
  socket.emit('join-room', { roomId: ROOM_ID, playerName: name, token });
}

// ── Socket events ─────────────────────────────────────────────────────────────

socket.on('connect', () => {
  mySocketId = socket.id;
  resolveAndJoin();
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
    // Merge votes into local state
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
  document.getElementById('voteStatus').textContent = 'Kaarten onthuld!';
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
  document.title = `${name} — Planning Poker 🃏`;
});

socket.on('room-expired', ({ reason }) => {
  showOverlay(
    '😴',
    'Kamer verlopen',
    reason === 'inactivity'
      ? 'Deze gastkamer is verwijderd wegens inactiviteit.'
      : 'Deze kamer bestaat niet meer.'
  );
});

socket.on('error', ({ code, message }) => {
  if (code === 'ROOM_NOT_FOUND') {
    showOverlay('🚫', 'Kamer niet gevonden', 'Deze kamer bestaat niet (meer). Controleer de code of maak een nieuwe kamer aan.');
  } else if (code === 'ROOM_FULL') {
    showOverlay('😶', 'Kamer is vol', message);
  } else if (code === 'NAME_REQUIRED') {
    showNameModal();
  } else {
    showOverlay('⚠️', 'Fout', message || 'Er is een onbekende fout opgetreden.');
  }
});

// ── Actions ───────────────────────────────────────────────────────────────────

document.getElementById('revealBtn').addEventListener('click', () => {
  socket.emit('reveal');
});

document.getElementById('newRoundBtn').addEventListener('click', () => {
  socket.emit('new-round');
});

// Room name edit
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

// Copy code
document.getElementById('copyCodeBtn').addEventListener('click', () => {
  const code = document.getElementById('roomCodeDisplay').textContent;
  navigator.clipboard.writeText(code).catch(() => {});
  const btn = document.getElementById('copyCodeBtn');
  btn.textContent = '✅';
  setTimeout(() => { btn.textContent = '📋'; }, 1500);
});

// ── Render ────────────────────────────────────────────────────────────────────

function renderAll(state) {
  document.getElementById('roomNameDisplay').textContent = state.name;
  document.getElementById('roomCodeDisplay').textContent = state.id;
  document.getElementById('methodBadge').textContent = state.methodLabel;
  document.title = `${state.name} — Planning Poker 🃏`;

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

  // Remove old seats (keep table-label)
  table.querySelectorAll('.player-seat').forEach((el) => el.remove());

  const players = state.players;
  const count = players.length;
  if (!count) return;

  // Place players around the ellipse: top arc for opponents, bottom center for self
  players.forEach((player, i) => {
    const isMe = player.socketId === mySocketId;
    const angle = (2 * Math.PI * i) / count - Math.PI / 2; // start at top
    const rx = 42; // % of width
    const ry = 38; // % of height
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

  // Card back
  const back = document.createElement('div');
  back.className = 'card-face card-back-face';
  back.textContent = player.hasVoted ? '🂠' : '';

  // Card front
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

  // Flip if revealed and has voted
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

  // Update picker UI
  document.querySelectorAll('.picker-card').forEach((c) => c.classList.remove('selected'));
  cardEl.classList.add('selected');

  // Update local state
  if (roomState) {
    const me = roomState.players.find((p) => p.socketId === mySocketId);
    if (me) { me.vote = value; me.hasVoted = true; }
  }

  socket.emit('vote', { value });

  // Enable reveal button
  document.getElementById('revealBtn').disabled = false;

  // Re-render my seat card (show voted state)
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
    html += `<div class="stat-consensus">🎉 Consensus! Iedereen koos hetzelfde.</div>`;
  }

  if (stats.average !== undefined) {
    html += statItem(stats.average, 'Gemiddelde');
    html += statItem(stats.min, 'Minimum');
    html += statItem(stats.max, 'Maximum');
  }

  if (stats.mode) {
    html += statItem(stats.mode, 'Meest gekozen');
  }

  if (stats.distribution) {
    const distItems = Object.entries(stats.distribution)
      .sort((a, b) => b[1] - a[1])
      .map(([v, c]) => `<span>${v}: ${c}×</span>`)
      .join('');
    html += `<div class="stat-item"><div style="display:flex;gap:.6rem;flex-wrap:wrap;font-size:.85rem;color:var(--text-muted)">${distItems}</div><div class="stat-label">Verdeling</div></div>`;
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
  document.getElementById('voteStatus').textContent =
    isRevealed ? 'Kaarten onthuld!' : `${voted} van ${total} ${total === 1 ? 'speler heeft' : 'spelers hebben'} gestemd`;

  // Auto-enable reveal when at least one vote exists
  if (!isRevealed) {
    document.getElementById('revealBtn').disabled = voted === 0;
  }
}

function updatePlayerCount(count) {
  document.getElementById('playerCount').textContent = `${count} deelnemer${count === 1 ? '' : 's'}`;
}

function showOverlay(icon, title, message) {
  document.getElementById('overlayIcon').textContent = icon;
  document.getElementById('overlayTitle').textContent = title;
  document.getElementById('overlayMessage').textContent = message;
  document.getElementById('roomOverlay').classList.remove('hidden');
  // Auto-redirect after 5s
  setTimeout(() => { window.location.href = '/'; }, 5000);
}
