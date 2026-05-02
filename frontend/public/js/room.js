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
let analyticsLoaded = false;
let currentStats = null;

// ── Settings (localStorage) ───────────────────────────────────────────────────

const SETTINGS_KEY = 'sfSettings';

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { return {}; }
}

function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

// ── Socket connection ─────────────────────────────────────────────────────────

const socket = io();

// ── Name resolution ───────────────────────────────────────────────────────────

function resolveAndJoin() {
  const user = getCurrentUser();

  if (user) {
    myName = user.name;
    setProfileName(user.name);
    joinRoomSocket(user.name, localStorage.getItem('token'));
    return;
  }

  const savedName = NAME_FROM_SESSION || localStorage.getItem('userName') || '';
  if (savedName) {
    myName = savedName;
    setProfileName(savedName);
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
  setProfileName(name);
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
  initAdBanner();
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
  currentStats = stats;
  if (roomState) {
    players.forEach(({ socketId, vote }) => {
      const p = roomState.players.find((p) => p.socketId === socketId);
      if (p) { p.vote = vote; p.hasVoted = true; }
    });
    roomState.revealed = true;
  }
  renderTable(roomState);
  showConsensusInline(stats);
  updateAnalyticsCurrent(stats);
  prependHistoryRound(players, stats);
  document.getElementById('revealBtn').classList.add('hidden');
  document.getElementById('newRoundBtn').classList.remove('hidden');
  document.getElementById('reactionBar').classList.remove('hidden');
  setPickerDisabled(true);
  document.getElementById('voteStatus').textContent = t('room.revealed');

  // Auto-open analytics panel based on settings
  const settings = loadSettings();
  if (settings.analyticsAutoOpen !== false) {
    openAnalyticsPanel();
  }
});

socket.on('round-reset', () => {
  isRevealed = false;
  myVote = null;
  currentStats = null;
  if (roomState) {
    roomState.revealed = false;
    roomState.players.forEach((p) => { p.vote = null; p.hasVoted = false; });
  }
  renderTable(roomState);
  document.getElementById('consensusBadge').classList.add('hidden');
  document.getElementById('analyticsCurrent').classList.add('hidden');
  document.getElementById('reactionBar').classList.add('hidden');
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

socket.on('reaction', ({ name, emoji }) => {
  spawnFloatingEmoji(emoji, name);
});

function spawnFloatingEmoji(emoji, name) {
  const area = document.querySelector('.table-area');
  if (!area) return;
  const el = document.createElement('div');
  el.className = 'floating-reaction';
  el.textContent = emoji;
  el.title = name;
  el.style.left = `${15 + Math.random() * 70}%`;
  area.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

// Wire reaction buttons once
document.querySelectorAll('.reaction-btn').forEach(btn => {
  btn.addEventListener('click', () => socket.emit('react', { emoji: btn.dataset.emoji }));
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

// ── Profile menu ─────────────────────────────────────────────────────────────

const profileMenuBtn = document.getElementById('profileMenuBtn');
const profileMenu = document.getElementById('profileMenu');

profileMenuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = !profileMenu.classList.contains('hidden');
  profileMenu.classList.toggle('hidden', isOpen);
  profileMenuBtn.setAttribute('aria-expanded', String(!isOpen));
});

profileMenu.addEventListener('click', (e) => e.stopPropagation());

document.addEventListener('click', () => closeProfileMenu());

function closeProfileMenu() {
  profileMenu.classList.add('hidden');
  profileMenuBtn.setAttribute('aria-expanded', 'false');
}

function setProfileName(name) {
  const label = document.getElementById('profileNameLabel');
  if (label) label.textContent = name || 'Profiel';
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  const key = e.key.toLowerCase();

  if (key === 'r') {
    const btn = document.getElementById('revealBtn');
    if (!btn.disabled && !btn.classList.contains('hidden')) socket.emit('reveal');
    return;
  }

  if (key === 'n') {
    const btn = document.getElementById('newRoundBtn');
    if (!btn.classList.contains('hidden')) socket.emit('new-round');
    return;
  }

  // 1-9 select picker card by position
  const idx = parseInt(e.key, 10);
  if (!isNaN(idx)) {
    const cards = [...document.querySelectorAll('.picker-card:not(.disabled)')];
    const target = idx === 0 ? cards[9] : cards[idx - 1];
    if (target) target.click();
    return;
  }

  // ? key selects the ? card
  if (e.key === '?') {
    const qCard = [...document.querySelectorAll('.picker-card:not(.disabled)')]
      .find((c) => c.dataset.value === '?');
    if (qCard) qCard.click();
  }
});

// ── Analytics panel ───────────────────────────────────────────────────────────

function openAnalyticsPanel() {
  const panel = document.getElementById('analyticsPanel');
  panel.classList.remove('hidden');
  if (!analyticsLoaded) loadHistory();
}

function closeAnalyticsPanel() {
  document.getElementById('analyticsPanel').classList.add('hidden');
}

document.getElementById('analyticsToggleBtn').addEventListener('click', () => {
  const panel = document.getElementById('analyticsPanel');
  if (panel.classList.contains('hidden')) openAnalyticsPanel();
  else closeAnalyticsPanel();
  closeProfileMenu();
});

document.getElementById('analyticsPanelCloseBtn').addEventListener('click', closeAnalyticsPanel);

async function loadHistory() {
  analyticsLoaded = true;
  try {
    const rows = await apiFetch(`/rooms/${ROOM_ID}/history`, { method: 'GET' });
    const list = document.getElementById('analyticsHistoryList');
    const empty = document.getElementById('analyticsHistoryEmpty');

    if (!rows.length) { empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');

    rows.forEach((row, i) => {
      const el = buildHistoryRoundEl(row.votes, null, row.created_at, rows.length - i);
      list.appendChild(el);
    });
  } catch {
    // history is optional — silently skip
  }
}

function prependHistoryRound(players, stats) {
  analyticsLoaded = true;
  const list = document.getElementById('analyticsHistoryList');
  document.getElementById('analyticsHistoryEmpty').classList.add('hidden');

  const votes = {};
  players.forEach((p) => { votes[p.name] = p.vote; });

  const roundNum = list.querySelectorAll('.history-round').length + 1;
  const el = buildHistoryRoundEl(votes, stats, new Date().toISOString(), roundNum);
  list.insertBefore(el, list.firstChild);
}

function buildHistoryRoundEl(votes, stats, createdAt, roundNum) {
  const level = stats ? consensusLevel(stats) : consensusLevelFromVotes(votes);
  const badge = consensusBadgeHtml(level);
  const time = formatRelativeTime(createdAt);

  const voteItems = Object.entries(votes || {})
    .map(([name, vote]) => `<span class="history-vote"><strong>${escapeHtml(name)}</strong> ${escapeHtml(vote || '–')}</span>`)
    .join('');

  const el = document.createElement('div');
  el.className = 'history-round fade-in';
  el.innerHTML = `
    <div class="history-round-hd">
      <span class="history-round-num">#${roundNum}</span>
      ${badge}
      <span class="history-round-time">${time}</span>
    </div>
    <div class="history-round-votes">${voteItems}</div>
  `;
  return el;
}

function updateAnalyticsCurrent(stats) {
  const section = document.getElementById('analyticsCurrent');
  const consensusEl = document.getElementById('analyticsConsensus');
  const grid = document.getElementById('analyticsStatsGrid');

  if (!stats) { section.classList.add('hidden'); return; }

  const level = consensusLevel(stats);
  consensusEl.innerHTML = level !== 'neutral'
    ? `<div class="consensus-badge-lg consensus-badge-${level}">${consensusBadgeText(level)}</div>`
    : '';

  let html = '';
  if (stats.allSame) html += `<div class="stat-consensus">${t('room.stats.consensus')}</div>`;
  if (stats.average !== undefined) {
    html += statItem(stats.average, t('room.stats.average'));
    html += statItem(stats.min, t('room.stats.min'));
    html += statItem(stats.max, t('room.stats.max'));
  }
  if (stats.mode) html += statItem(stats.mode, t('room.stats.mode'));
  if (stats.distribution) {
    const distItems = Object.entries(stats.distribution)
      .sort((a, b) => b[1] - a[1])
      .map(([v, c]) => `<span>${v}: ${c}×</span>`)
      .join('');
    html += `<div class="stat-item"><div style="display:flex;gap:.6rem;flex-wrap:wrap;font-size:.85rem;color:var(--text-muted)">${distItems}</div><div class="stat-label">${t('room.stats.distribution')}</div></div>`;
  }

  grid.innerHTML = html;
  section.classList.remove('hidden');
}

// ── Consensus helpers ─────────────────────────────────────────────────────────

function consensusLevel(stats) {
  if (!stats) return 'neutral';
  if (stats.allSame) return 'full';
  if (stats.max !== undefined && stats.min !== undefined && stats.max - stats.min <= 2) return 'close';
  if (stats.max !== undefined) return 'spread';
  return 'neutral';
}

function consensusLevelFromVotes(votes) {
  const vals = Object.values(votes || {}).filter(Boolean);
  if (!vals.length) return 'neutral';
  if (new Set(vals).size === 1) return 'full';
  const nums = vals
    .filter((v) => !['?', '☕', '😊', 'XS', 'S', 'M', 'L', 'XL', 'XXL'].includes(v))
    .map((v) => (v === '½' ? 0.5 : parseFloat(v)))
    .filter((n) => !isNaN(n));
  if (!nums.length) return 'neutral';
  return Math.max(...nums) - Math.min(...nums) <= 2 ? 'close' : 'spread';
}

function consensusBadgeText(level) {
  if (level === 'full')   return t('room.analytics.consensus_full');
  if (level === 'close')  return t('room.analytics.consensus_close');
  if (level === 'spread') return t('room.analytics.consensus_spread');
  return '';
}

function consensusBadgeHtml(level) {
  if (level === 'neutral') return '';
  return `<span class="consensus-badge-sm consensus-badge-sm-${level}">${consensusBadgeText(level)}</span>`;
}

function showConsensusInline(stats) {
  const badge = document.getElementById('consensusBadge');
  const level = consensusLevel(stats);
  if (!stats || level === 'neutral') { badge.classList.add('hidden'); return; }
  badge.className = `consensus-badge consensus-badge-${level}`;
  badge.textContent = consensusBadgeText(level);
  badge.classList.remove('hidden');
}

function formatRelativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('room.analytics.just_now');
  if (mins < 60) return t('room.analytics.mins_ago', { n: mins });
  return t('room.analytics.hrs_ago', { n: Math.floor(mins / 60) });
}

// ── Auth button (guests only) ─────────────────────────────────────────────────

function initRoomAuth() {
  const user = getCurrentUser();
  if (user) {
    showRoomUserBadge(user.name);
    initSettings();
    return;
  }

  const authBtn = document.getElementById('roomAuthBtn');
  authBtn.classList.remove('hidden');
  authBtn.addEventListener('click', () => {
    closeProfileMenu();
    openRoomAuthModal();
  });

  document.querySelectorAll('#roomAuthModal .auth-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#roomAuthModal .auth-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('roomLoginForm').classList.toggle('hidden', tab.dataset.tab !== 'login');
      document.getElementById('roomRegisterForm').classList.toggle('hidden', tab.dataset.tab !== 'register');
    });
  });

  document.getElementById('roomAuthBackdrop').addEventListener('click', closeRoomAuthModal);
  initOAuthButtons(document.getElementById('roomAuthModal'));

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
  initSettings();
}

function showRoomUserBadge(name) {
  setProfileName(name);
}

function initAdBanner() {
  const user = getCurrentUser();
  const isPaid = user && (user.plan === 'pro' || user.plan === 'premium');
  document.getElementById('adBanner').classList.toggle('hidden', isPaid);
}

// ── Settings (account users only) ────────────────────────────────────────────

function initSettings() {
  const settingsBtn = document.getElementById('settingsBtn');
  settingsBtn.classList.remove('hidden');

  // Guard against double-init (e.g. after in-room login)
  if (settingsBtn.dataset.initialized) return;
  settingsBtn.dataset.initialized = '1';

  settingsBtn.addEventListener('click', () => {
    closeProfileMenu();
    openSettingsModal();
  });
  document.getElementById('settingsBackdrop').addEventListener('click', closeSettingsModal);
  document.getElementById('settingsCancelBtn').addEventListener('click', closeSettingsModal);
  document.getElementById('settingsSaveBtn').addEventListener('click', () => {
    const settings = loadSettings();
    settings.analyticsAutoOpen = document.getElementById('settingAnalyticsAuto').checked;
    settings.defaultMethod = document.getElementById('settingDefaultMethod').value;
    saveSettings(settings);
    closeSettingsModal();
  });
}

function openSettingsModal() {
  const settings = loadSettings();
  document.getElementById('settingAnalyticsAuto').checked = settings.analyticsAutoOpen !== false;
  document.getElementById('settingDefaultMethod').value = settings.defaultMethod || '';
  document.getElementById('settingsModal').classList.remove('hidden');
}

function closeSettingsModal() {
  document.getElementById('settingsModal').classList.add('hidden');
}

// ── Share / invite ────────────────────────────────────────────────────────────

const shareBtn = document.getElementById('shareBtn');
const sharePopover = document.getElementById('sharePopover');
const shareUrl = document.getElementById('shareUrl');

shareBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  closeProfileMenu();
  const link = `${location.origin}/?join=${ROOM_ID}`;
  shareUrl.value = link;
  sharePopover.classList.toggle('hidden');
  if (!sharePopover.classList.contains('hidden')) shareUrl.select();
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
    const rx = 42, ry = 38;
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
  if (revealed && player.hasVoted) card.classList.add('flipped');

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function statItem(value, label) {
  return `<div class="stat-item"><div class="stat-value">${value}</div><div class="stat-label">${label}</div></div>`;
}

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
