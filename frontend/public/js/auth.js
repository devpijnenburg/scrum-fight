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
// point subscription link to dashboard for logged-in users
function initFooterAuth() {
  const user = getCurrentUser();
  const subLink = document.getElementById('footerSubscriptionLink');
  const supportLink = document.getElementById('landingSupportLink');

  if (user) {
    const el = document.getElementById('footerAuth');
    if (el) el.classList.add('hidden');

    // Free users: show upgrade options on dashboard
    // Paid users: show subscription status on profile
    const subDest = user.plan && user.plan !== 'free'
      ? '/profile.html#abonnement'
      : '/dashboard.html#abonnement';

    if (subLink) subLink.href = subDest;
    if (supportLink) {
      supportLink.href = subDest;
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
