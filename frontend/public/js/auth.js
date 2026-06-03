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

// Hide footer auth links when already logged in;
// point subscription link to dedicated subscription page for logged-in users
function initFooterAuth() {
  const user = getCurrentUser();
  const subLink = document.getElementById('footerSubscriptionLink');
  const supportLink = document.getElementById('landingSupportLink');

  if (user) {
    const el = document.getElementById('footerAuth');
    if (el) el.classList.add('hidden');

    if (subLink) subLink.href = '/subscription.html';
    if (supportLink) {
      supportLink.href = '/subscription.html';
      supportLink.textContent = 'Bekijk abonnementen';
    }
  } else {
    if (subLink) subLink.href = '/login.html#register';
    if (supportLink) {
      supportLink.href = '/login.html#register';
      supportLink.textContent = 'Maak een gratis account aan';
    }
  }
}

// Update navbar for logged-in state — no-op, handled by <site-nav> component
function updateNavbar() {}

document.addEventListener('DOMContentLoaded', initFooterAuth);

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
