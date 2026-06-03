// Dashboard page logic

const ADJECTIVES = [
  'Fluffy','Cosmic','Epic','Ninja','Turbo','Legendary','Quantum','Sneaky',
  'Blazing','Mysterious','Glittery','Thunderous','Magical','Hyper','Radical',
  'Zesty','Wobbly','Sparkly','Grumpy','Jolly',
];
const NOUNS = [
  'Unicorn','Dragon','Penguin','Elephant','Phoenix','Narwhal','Llama',
  'Gecko','Panda','Kraken','Platypus','Hamster','Octopus','Dinosaur','Giraffe',
  'Axolotl','Capybara','Quokka','Meerkat','Sloth',
];
const SUFFIXES = ['Sprint','Planning','Refinement','Poker','Session'];

function generateRoomName() {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  return `${pick(ADJECTIVES)} ${pick(NOUNS)} ${pick(SUFFIXES)}`;
}

// ── Auth guard ────────────────────────────────────────────────────────────────
const urlParams = new URLSearchParams(location.search);
const oauthToken = urlParams.get('token');
if (oauthToken) {
  localStorage.setItem('token', oauthToken);
  history.replaceState({}, '', '/dashboard.html');
}

const user = getCurrentUser();
if (!user) {
  window.location.href = '/login.html';
}

// ── Page init ─────────────────────────────────────────────────────────────────

updateNavbar();
document.getElementById('dashboardTitle').textContent = t('dashboard.welcome', { name: user.name });
document.getElementById('planBadge').textContent = t('dashboard.plan_badge', { plan: user.plan.toUpperCase() });

document.querySelectorAll('.plan-card').forEach((card) => {
  if (card.dataset.plan === user.plan) {
    card.setAttribute('data-active', 'true');
    const btn = card.querySelector('.plan-upgrade-btn');
    if (btn) btn.remove();
  }
});

// Billing period toggle (default: yearly)
let _billing = 'yearly';

document.querySelectorAll('.billing-toggle-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    _billing = btn.dataset.billing;
    document.querySelectorAll('.billing-toggle-btn').forEach((b) =>
      b.classList.toggle('billing-toggle-btn--active', b.dataset.billing === _billing)
    );
  });
});

// Wire upgrade buttons to Creem checkout
document.querySelectorAll('.plan-upgrade-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const plan = btn.dataset.target;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Laden…';
    try {
      const { url } = await apiFetch('/payments/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan, billing: _billing }),
      });
      window.location.href = url;
    } catch (err) {
      btn.disabled = false;
      btn.textContent = originalText;
      alert(err.message || 'Kon de betaalpagina niet openen. Probeer het later opnieuw.');
    }
  });
});

// After redirect back from Creem: refresh token so the new plan is shown immediately
(function handlePaymentReturn() {
  const params = new URLSearchParams(location.search);
  if (params.get('payment') !== 'success') return;
  history.replaceState({}, '', '/dashboard.html');

  const banner = document.createElement('div');
  banner.className = 'plan-limit-notice';
  banner.style.cssText = 'background:#22c55e;color:#fff;border-color:#16a34a';
  banner.textContent =
    '✓ Welkom als supporter! Jouw bijdrage houdt Scrum Fight draaiende — heel erg bedankt. 🙏 ' +
    'Je abonnement wordt bijgewerkt…';
  document.querySelector('.dashboard-header').insertAdjacentElement('afterend', banner);

  // Poll for plan update: webhook may arrive slightly after the redirect
  let attempts = 0;
  const maxAttempts = 10;
  const interval = setInterval(async () => {
    attempts++;
    try {
      const { token } = await apiFetch('/auth/refresh', { method: 'POST' });
      localStorage.setItem('token', token);
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.plan !== 'free' || attempts >= maxAttempts) {
        clearInterval(interval);
        if (payload.plan !== 'free') {
          banner.textContent =
            '✓ Welkom als supporter! Jouw bijdrage houdt Scrum Fight draaiende — heel erg bedankt. 🙏';
          window.location.reload();
        }
      }
    } catch {
      if (attempts >= maxAttempts) clearInterval(interval);
    }
  }, 2000);
})();

// Only show plan upgrade section for free users;
// if a paid user lands on #abonnement, redirect to profile
if (user.plan !== 'free') {
  const planInfoSection = document.querySelector('.plan-info');
  if (planInfoSection) planInfoSection.classList.add('hidden');
  if (location.hash === '#abonnement') {
    window.location.replace('/profile.html#abonnement');
  }
}

document.getElementById('modalRoomName').value = generateRoomName();
document.getElementById('modalRandomBtn').addEventListener('click', () => {
  document.getElementById('modalRoomName').value = generateRoomName();
});

// ── Load rooms ────────────────────────────────────────────────────────────────

let _overLimitCount = 0;

async function loadRooms() {
  const list = document.getElementById('roomList');
  const notice = document.getElementById('planLimitNotice');
  try {
    const { rooms, maxRooms } = await apiFetch('/rooms');
    _overLimitCount = rooms.filter((r) => r.over_limit).length;

    if (_overLimitCount > 0 && maxRooms !== null) {
      notice.innerHTML = `⚠️ Je hebt ${rooms.length} kamer${rooms.length !== 1 ? 's' : ''}, maar je huidige abonnement staat er maximaal ${maxRooms} toe. Verwijder ${_overLimitCount} kamer${_overLimitCount !== 1 ? 's' : ''} om weer nieuwe kamers op te slaan.`;
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
          ${r.over_limit ? '<span class="room-over-limit-badge">Boven limiet</span>' : ''}
        </div>
        <div class="room-item-meta">
          <span class="badge">${methodLabel(r.method)}</span>
          <span class="text-muted">${r.id}</span>
        </div>
        <div class="text-muted" style="font-size:.8rem;">${t('dashboard.rooms.active', { date: formatDate(r.last_active) })}</div>
        <div class="room-item-actions">
          <a href="/room.html?id=${r.id}" class="btn btn-primary btn-sm">${t('dashboard.rooms.open')}</a>
          <button class="btn btn-ghost btn-sm" onclick="copyCode('${r.id}')">📋 Code</button>
          <button class="btn btn-ghost btn-sm" onclick="deleteRoom('${r.id}')">🗑</button>
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

document.getElementById('roomList').innerHTML = [1, 2, 3].map(() => `
  <div class="room-item-skeleton">
    <div class="skeleton skeleton-line-lg"></div>
    <div class="skeleton skeleton-line-sm"></div>
    <div class="skeleton skeleton-line-md"></div>
    <div class="skeleton skeleton-line-sm" style="width:40%"></div>
  </div>
`).join('');

loadRooms();

// ── New room modal ────────────────────────────────────────────────────────────

document.getElementById('newRoomBtn').addEventListener('click', () => {
  document.getElementById('modalRoomName').value = generateRoomName();
  const errEl = document.getElementById('modalError');
  if (_overLimitCount > 0) {
    errEl.textContent = 'Je hebt meer kamers dan je abonnement toestaat. Verwijder eerst kamers voordat je nieuwe aanmaakt.';
    errEl.classList.remove('hidden');
  } else {
    errEl.classList.add('hidden');
  }
  document.getElementById('newRoomModal').classList.remove('hidden');
});

document.getElementById('modalBackdrop').addEventListener('click', closeModal);
document.getElementById('modalCancelBtn').addEventListener('click', closeModal);

function closeModal() {
  document.getElementById('newRoomModal').classList.add('hidden');
  document.getElementById('modalError').classList.add('hidden');
}

document.getElementById('modalCreateBtn').addEventListener('click', async () => {
  const name = document.getElementById('modalRoomName').value.trim();
  const method = document.getElementById('modalMethod').value;
  const errEl = document.getElementById('modalError');
  errEl.classList.add('hidden');

  if (_overLimitCount > 0) {
    errEl.textContent = 'Je hebt meer kamers dan je abonnement toestaat. Verwijder eerst kamers voordat je nieuwe aanmaakt.';
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
    if (room.planLimitWarning) sessionStorage.setItem('planLimitWarning', room.planLimitWarning);
    closeModal();
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
  if (!confirm(t('dashboard.rooms.delete_confirm'))) return;
  try {
    await apiFetch(`/rooms/${id}`, { method: 'DELETE' });
    loadRooms();
  } catch (err) {
    alert(t('dashboard.rooms.delete_error', { error: err.message }));
  }
}

function copyCode(id) {
  navigator.clipboard.writeText(id).catch(() => {});
  alert(t('dashboard.rooms.copied', { id }));
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

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
