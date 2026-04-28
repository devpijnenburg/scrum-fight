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

// Update navbar for logged-in state
function updateNavbar() {
  const user = getCurrentUser();
  const navActions = document.getElementById('navActions');
  if (!navActions) return;

  if (user) {
    navActions.innerHTML = `
      <span class="navbar-user">👤 ${escapeHtml(user.name)}</span>
      <a href="/dashboard.html" class="btn btn-ghost btn-sm">Dashboard</a>
      <button class="btn btn-ghost btn-sm" onclick="logout()">Uitloggen</button>
    `;
  }
}

document.addEventListener('DOMContentLoaded', initFooterAuth);

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
