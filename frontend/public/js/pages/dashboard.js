// Dashboard: the user's saved rooms (entry module of dashboard.html).

import '../components/siteChrome.js';
import '../ui/methodSelect.js';
import { t, getLang } from '../core/i18n.js';
import { apiFetch } from '../core/api.js';
import { getCurrentUser } from '../core/auth.js';
import { escapeHtml } from '../core/html.js';
import { generateRoomName } from '../core/roomNames.js';
import { PLAN_RANK } from '../core/plans.js';
import { paymentsEnabled, showSubscriptionLinks } from '../core/payments.js';
import { openModal, closeModal, confirmDialog } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';

// ── Auth guard ────────────────────────────────────────────────────────────────
const urlParams = new URLSearchParams(location.search);
const oauthToken = urlParams.get('token');
if (oauthToken) {
  localStorage.setItem('token', oauthToken);
  history.replaceState({}, '', '/dashboard.html');
}

const user = getCurrentUser();

// ── Page init ─────────────────────────────────────────────────────────────────

function initDashboard() {
  document.getElementById('dashboardTitle').textContent = t('dashboard.welcome', { name: user.name });
  document.getElementById('planBadge').textContent = t('dashboard.plan_badge', { plan: user.plan.toUpperCase() });

  // The plan cards link to the subscription page; only plans above the
  // current one keep their upgrade button.
  const rank = PLAN_RANK[user.plan] ?? Infinity;
  document.querySelectorAll('.plan-card').forEach((card) => {
    if (card.dataset.plan === user.plan) card.setAttribute('data-active', 'true');
    if (PLAN_RANK[card.dataset.plan] <= rank) card.querySelector('.plan-upgrade-btn')?.remove();
  });
  // Without the payments feature the cards only compare the plans.
  paymentsEnabled().then((enabled) => {
    if (!enabled) document.querySelectorAll('.plan-upgrade-btn').forEach((btn) => btn.remove());
    document.getElementById('planInfoLink').classList.toggle('hidden', !showSubscriptionLinks(enabled, user));
  });

  document.getElementById('modalRoomName').value = generateRoomName();
  document.getElementById('modalRandomBtn').addEventListener('click', () => {
    document.getElementById('modalRoomName').value = generateRoomName();
  });

  document.getElementById('roomList').innerHTML = [1, 2, 3].map(() => `
    <div class="room-item-skeleton">
      <div class="skeleton skeleton-line-lg"></div>
      <div class="skeleton skeleton-line-sm"></div>
      <div class="skeleton skeleton-line-md"></div>
      <div class="skeleton skeleton-line-sm" style="width:40%"></div>
    </div>
  `).join('');

  // Room card buttons (rendered as HTML) are handled by delegation.
  document.getElementById('roomList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'copy') copyCode(btn.dataset.id);
    if (btn.dataset.action === 'delete') deleteRoom(btn.dataset.id);
  });

  loadRooms();
}

// ── Load rooms ────────────────────────────────────────────────────────────────

let _overLimitCount = 0;

async function loadRooms() {
  const list = document.getElementById('roomList');
  const notice = document.getElementById('planLimitNotice');
  try {
    const { rooms, maxRooms } = await apiFetch('/rooms');
    _overLimitCount = rooms.filter((r) => r.over_limit).length;

    if (_overLimitCount > 0 && maxRooms !== null) {
      notice.textContent = t('dashboard.plan_limit.notice', { count: rooms.length, max: maxRooms, excess: _overLimitCount });
      notice.classList.remove('hidden');
    } else {
      notice.classList.add('hidden');
    }

    if (!rooms.length) {
      list.innerHTML = `<p class="room-list-empty">${t('dashboard.rooms.empty')}</p>`;
      return;
    }
    list.innerHTML = rooms.map((r) => `
      <div class="room-item fade-in${r.over_limit ? ' room-item-over-limit' : ''}" data-id="${r.id}">
        <div class="room-item-name">
          ${escapeHtml(r.name)}
          ${r.over_limit ? `<span class="room-over-limit-badge">${t('dashboard.rooms.over_limit')}</span>` : ''}
        </div>
        <div class="room-item-meta">
          <span class="badge">${methodLabel(r.method)}</span>
          <span class="text-muted">${r.id}</span>
        </div>
        <div class="text-muted" style="font-size:.8rem;">${t('dashboard.rooms.active', { date: formatDate(r.last_active) })}</div>
        <div class="room-item-actions">
          <a href="/room.html?id=${r.id}" class="btn btn-primary btn-sm">${t('dashboard.rooms.open')}</a>
          <button class="btn btn-ghost btn-sm" data-action="copy" data-id="${escapeHtml(r.id)}">📋 Code</button>
          <button class="btn btn-ghost btn-sm" data-action="delete" data-id="${escapeHtml(r.id)}">🗑</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    if (err.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    list.innerHTML = `<p class="form-error">${t('dashboard.rooms.load_error', { error: escapeHtml(err.message) })}</p>`;
  }
}


// ── New room modal ────────────────────────────────────────────────────────────

document.getElementById('newRoomBtn').addEventListener('click', () => {
  document.getElementById('modalRoomName').value = generateRoomName();
  const errEl = document.getElementById('modalError');
  if (_overLimitCount > 0) {
    errEl.textContent = t('dashboard.plan_limit.create_blocked');
    errEl.classList.remove('hidden');
  } else {
    errEl.classList.add('hidden');
  }
  openModal('newRoomModal', { focus: '#modalRoomName' });
});

document.getElementById('newRoomModal').addEventListener('modal:close', () => {
  document.getElementById('modalError').classList.add('hidden');
});

document.getElementById('modalCreateBtn').addEventListener('click', async () => {
  const name = document.getElementById('modalRoomName').value.trim();
  const method = document.getElementById('modalMethod').value;
  const errEl = document.getElementById('modalError');
  errEl.classList.add('hidden');

  if (_overLimitCount > 0) {
    errEl.textContent = t('dashboard.plan_limit.create_blocked');
    errEl.classList.remove('hidden');
    return;
  }

  if (!name) {
    errEl.textContent = t('dashboard.modal.error');
    errEl.classList.remove('hidden');
    return;
  }

  try {
    const room = await apiFetch('/rooms', {
      method: 'POST',
      body: JSON.stringify({ name, method }),
    });
    if (room.planLimit) sessionStorage.setItem('planLimit', JSON.stringify(room.planLimit));
    closeModal('newRoomModal');
    window.location.href = `/room.html?id=${room.id}`;
  } catch (err) {
    if (err.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

// ── Actions ───────────────────────────────────────────────────────────────────

async function deleteRoom(id) {
  if (!(await confirmDialog(t('dashboard.rooms.delete_confirm')))) return;
  try {
    await apiFetch(`/rooms/${id}`, { method: 'DELETE' });
    loadRooms();
  } catch (err) {
    showToast(t('dashboard.rooms.delete_error', { error: err.message }), { icon: '⚠️' });
  }
}

function copyCode(id) {
  navigator.clipboard.writeText(id).catch(() => {});
  showToast(t('dashboard.rooms.copied', { id }), { icon: '📋' });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function methodLabel(method) {
  const map = {
    fibonacci: 'Fibonacci',
    modified_fibonacci: 'Fibonacci+',
    tshirt: 'T-shirt',
    powers_of_2: 'Powers of 2',
  };
  return map[method] || method;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(getLang() === 'nl' ? 'nl-NL' : 'en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────

if (!user) window.location.href = '/login.html';
else initDashboard();
