// Auth helpers shared across all pages.

function getCurrentUser() {
  const token = localStorage.getItem('token');
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.exp && payload.exp < Date.now() / 1000) {
      localStorage.removeItem('token');
      return null;
    }
    return payload; // { id, name, plan, exp, iat }
  } catch {
    return null;
  }
}

function logout() {
  localStorage.removeItem('token');
  window.location.href = '/';
}

// Hide footer auth links when already logged in
function initFooterAuth() {
  if (!getCurrentUser()) return;
  const el = document.getElementById('footerAuth');
  if (el) el.classList.add('hidden');
}

// Update navbar for logged-in state — renders a user dropdown
function updateNavbar() {
  const user = getCurrentUser();
  const navActions = document.getElementById('navActions');
  if (!navActions) return;

  if (user) {
    navActions.innerHTML = `
      <div class="nav-user-dropdown">
        <button class="nav-user-trigger" aria-expanded="false">
          👤 ${escapeHtml(user.name)} <span class="nav-user-arrow">▾</span>
        </button>
        <div class="nav-user-menu hidden">
          <a href="/stats.html"     class="nav-user-item" data-i18n="nav.profile">📊 Profiel</a>
          <a href="/dashboard.html" class="nav-user-item" data-i18n="nav.dashboard">🏠 Dashboard</a>
          <div class="nav-user-divider"></div>
          <button class="nav-user-item nav-user-item-danger" onclick="logout()" data-i18n="nav.logout">↪️ Uitloggen</button>
        </div>
      </div>
    `;

    const dropdown = navActions.querySelector('.nav-user-dropdown');
    const trigger  = dropdown.querySelector('.nav-user-trigger');
    const menu     = dropdown.querySelector('.nav-user-menu');

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const opening = menu.classList.contains('hidden');
      menu.classList.toggle('hidden', !opening);
      trigger.setAttribute('aria-expanded', String(opening));
    });

    if (typeof applyTranslations === 'function') applyTranslations();
  }
}

document.addEventListener('click', () => {
  document.querySelectorAll('.nav-user-menu').forEach(m => m.classList.add('hidden'));
  document.querySelectorAll('.nav-user-trigger').forEach(t => t.setAttribute('aria-expanded', 'false'));
});

document.addEventListener('DOMContentLoaded', initFooterAuth);

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
