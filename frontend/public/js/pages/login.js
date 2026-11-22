// Login / registration page (entry module of login.html).

import '../components/siteChrome.js';
import '../ui/authPanel.js';

const panel = document.querySelector('sf-auth-panel');
if (location.hash === '#register') panel.showTab('register');

// ?next=/page lets another page send the visitor here and get them back.
// Only local paths are accepted, so the link cannot redirect elsewhere.
const next = new URLSearchParams(location.search).get('next') || '';
const destination = /^\/(?![/\\])/.test(next) ? next : '/dashboard.html';
panel.addEventListener('auth-success', () => { window.location.href = destination; });
