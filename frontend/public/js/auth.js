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

// Update navbar for logged-in state — injects the shared <profile-menu> component
function updateNavbar() {
  const user = getCurrentUser();
  const navActions = document.getElementById('navActions');
  if (!navActions) return;

  if (user) {
    const outerLang = document.getElementById('navLang');
    if (outerLang) outerLang.classList.add('hidden');
    navActions.innerHTML = '<profile-menu></profile-menu>';
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
