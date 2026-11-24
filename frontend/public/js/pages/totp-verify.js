// TOTP step after an OAuth login (entry module of totp-verify.html).
// The OAuth callback redirects here with ?preAuthToken=…

import '../core/errorReporter.js'; // als eerste: meldt ook fouten van de modules hieronder
import '../core/i18n.js';

const preAuthToken = new URLSearchParams(location.search).get('preAuthToken');

if (!preAuthToken) {
  window.location.href = '/login.html';
} else {
  // The panel reads its attributes when it upgrades, so set them before the
  // component module (which defines <sf-auth-panel>) is loaded.
  const panel = document.querySelector('sf-auth-panel');
  panel.setAttribute('pre-auth-token', preAuthToken);
  await import('../ui/authPanel.js');
  panel.addEventListener('auth-success', () => { window.location.href = '/dashboard.html'; });
}
