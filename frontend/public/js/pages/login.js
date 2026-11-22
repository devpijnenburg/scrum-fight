// Login / registration page (entry module of login.html).

import '../components/siteChrome.js';
import '../ui/authPanel.js';

const panel = document.querySelector('sf-auth-panel');
if (location.hash === '#register') panel.showTab('register');
panel.addEventListener('auth-success', () => { window.location.href = '/dashboard.html'; });
