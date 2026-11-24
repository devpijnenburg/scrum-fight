// Email verification link target (entry module of verify-email.html).

import '../core/errorReporter.js'; // als eerste: meldt ook fouten van de modules hieronder
import { apiFetch } from '../core/api.js';

const token = new URLSearchParams(location.search).get('token');
const msg = document.getElementById('verifyMessage');
const err = document.getElementById('verifyError');
const link = document.getElementById('loginLink');

function fail(message) {
  msg.textContent = '';
  err.textContent = message;
  err.classList.remove('hidden');
  link.classList.remove('hidden');
}

if (!token) {
  fail('Ongeldige link — token ontbreekt.');
} else {
  try {
    const { token: jwt } = await apiFetch(`/auth/verify-email?token=${encodeURIComponent(token)}`);
    localStorage.setItem('token', jwt);
    msg.textContent = '✓ E-mailadres bevestigd! Je wordt doorgestuurd…';
    setTimeout(() => { window.location.href = '/dashboard.html'; }, 1500);
  } catch (ex) {
    fail(ex.message || 'De bevestigingslink is ongeldig of verlopen.');
  }
}
