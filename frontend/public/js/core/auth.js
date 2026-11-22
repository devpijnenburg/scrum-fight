// Session helpers: the JWT in localStorage and the current user.

export function getCurrentUser() {
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

export function logout() {
  localStorage.removeItem('token');
  window.location.href = '/';
}

// Hide footer auth links when already logged in
function initFooterAuth() {
  if (!getCurrentUser()) return;
  const el = document.getElementById('footerAuth');
  if (el) el.classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', initFooterAuth);
