// Shared page chrome — defines <profile-menu>, <site-nav> and <site-footer>.
// Imported by every page entry (js/pages/*.js, js/room/index.js).
//
// Usage:
//   <site-nav></site-nav>              — brand + profile if logged in, lang switcher if not
//   <site-nav show-cta></site-nav>     — same + login/register buttons when not logged in
//   <site-footer></site-footer>        — footer with login/register links when logged out
//   <site-footer hide-auth></site-footer> — footer without the login/register links

import { t, applyTranslations, buildLangDropdown } from '../core/i18n.js';
import { apiFetch } from '../core/api.js';
import { getCurrentUser, logout } from '../core/auth.js';
import { escapeHtml } from '../core/html.js';
import { paymentsEnabled, showSubscriptionLinks } from '../core/payments.js';

// ── ProfileMenu ───────────────────────────────────────────────────────────────

class ProfileMenu extends HTMLElement {
  connectedCallback() {
    this._name = null;
    this._badgeCount = 0;
    this._boundOutsideClick = () => this.close();
    this._render();
    document.addEventListener('click', this._boundOutsideClick);
    this._loadBadgeCount();
  }

  disconnectedCallback() {
    document.removeEventListener('click', this._boundOutsideClick);
  }

  setName(name) {
    this._name = name;
    this._render();
  }

  refresh() {
    this._render();
  }

  close() {
    const menu = this.querySelector('.profile-menu');
    const btn  = this.querySelector('.profile-menu-btn');
    if (menu) menu.classList.add('hidden');
    if (btn)  btn.setAttribute('aria-expanded', 'false');
  }

  addBadgeCount(n) {
    this._badgeCount = (this._badgeCount || 0) + n;
    const countEl = this.querySelector('.pm-bell-count');
    if (countEl) {
      countEl.textContent = this._badgeCount;
      countEl.classList.remove('hidden');
    }
  }

  async _loadBadgeCount() {
    const user = getCurrentUser();
    if (!user) return;
    try {
      const rows = await apiFetch('/users/badges/recent?limit=50');
      // Badges earned since the last time the user saw the bell are "new".
      // Use localStorage so the threshold survives page reloads.
      const tsKey = 'sfBadgeBellSeen';
      const lastSeen = parseInt(localStorage.getItem(tsKey) || '0', 10);
      const newCount = rows.filter(r => new Date(r.earned_at).getTime() > lastSeen).length;
      // Mark as seen up to now — next load this batch won't count again.
      localStorage.setItem(tsKey, String(Date.now()));
      if (newCount > 0) this.addBadgeCount(newCount);
    } catch {
      // badges are optional
    }
  }

  _render() {
    const user     = getCurrentUser();
    const loggedIn = !!user;
    const name     = this._name || user?.name;

    if (!name && !loggedIn) {
      this.innerHTML = '';
      return;
    }

    const bellHtml = loggedIn ? `
      <button class="pm-bell _pm-bell" type="button" title="${t('nav.badges_title')}">
        🏅<span class="pm-bell-count hidden" id="pmBellCount">${this._badgeCount || 0}</span>
      </button>` : '';

    this.innerHTML = `
      <div class="profile-menu-wrap">
        ${bellHtml}
        <button class="profile-menu-btn" type="button" aria-haspopup="true" aria-expanded="false">
          <span class="profile-avatar">👤</span>
          <span class="profile-name-label">${escapeHtml(name || 'Profiel')}</span>
          <span class="profile-menu-arrow">▾</span>
        </button>
        <div class="profile-menu hidden">
          <a href="/stats.html" class="profile-menu-item">
            <span>🏅</span><span data-i18n="nav.stats">Statistieken</span>
          </a>
          ${loggedIn ? `
          <a href="/dashboard.html" class="profile-menu-item">
            <span>🚪</span><span data-i18n="nav.myrooms">Mijn kamers</span>
          </a>
          <a href="/profile.html" class="profile-menu-item">
            <span>🪪</span><span>Profiel &amp; Instellingen</span>
          </a>
          ${user?.is_admin ? `
          <a href="/admin.html" class="profile-menu-item">
            <span>🛡️</span><span>Beheerportaal</span>
          </a>
          ` : ''}
          <div class="profile-menu-divider"></div>
          <button class="profile-menu-item nav-logout-btn _pm-logout" type="button">
            <span>↪️</span><span data-i18n="nav.logout">Uitloggen</span>
          </button>
          ` : `
          <button class="profile-menu-item _pm-auth" type="button" data-i18n="room.auth.btn">
            Inloggen / Registreren
          </button>
          `}
          <div class="profile-menu-divider"></div>
          <div class="profile-menu-lang">
            <span data-i18n="room.menu.language">Taal</span>
            <div class="lang-switcher"></div>
          </div>
        </div>
      </div>
    `;

    // Restore badge count display after re-render
    if (this._badgeCount > 0) {
      const countEl = this.querySelector('.pm-bell-count');
      if (countEl) {
        countEl.textContent = this._badgeCount;
        countEl.classList.remove('hidden');
      }
    }

    this._wire();

    this.querySelectorAll('.lang-switcher').forEach(buildLangDropdown);
    applyTranslations();
  }

  _wire() {
    const btn  = this.querySelector('.profile-menu-btn');
    const menu = this.querySelector('.profile-menu');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = !menu.classList.contains('hidden');
      menu.classList.toggle('hidden', isOpen);
      btn.setAttribute('aria-expanded', String(!isOpen));
    });

    menu.addEventListener('click', (e) => e.stopPropagation());

    this.querySelector('._pm-logout')?.addEventListener('click', () => {
      logout();
    });

    this.querySelector('._pm-auth')?.addEventListener('click', () => {
      this.close();
      this.dispatchEvent(new CustomEvent('profile-auth-request', { bubbles: true }));
    });

    this.querySelector('._pm-bell')?.addEventListener('click', (e) => {
      e.stopPropagation();
      window.location.href = '/stats.html#badges';
    });
  }
}

if (!customElements.get('profile-menu')) customElements.define('profile-menu', ProfileMenu);

// ── SiteNav ───────────────────────────────────────────────────────────────────

class SiteNav extends HTMLElement {
  connectedCallback() {
    this._render();
  }

  _render() {
    const user    = getCurrentUser();
    const showCta = this.hasAttribute('show-cta');

    this.innerHTML = `
      <nav class="navbar">
        <a href="/" class="navbar-brand">⚔️ Scrum Fight <small class="navbar-subtitle">Story Estimator 2.0</small></a>
        <div class="navbar-actions">
          ${user
            ? `<div class="lang-switcher _nav-lang"></div><profile-menu></profile-menu>`
            : `<div class="lang-switcher _nav-lang"></div>
               ${showCta
                 ? `<a href="/login.html" class="btn btn-ghost" data-i18n="nav.login">Inloggen</a>
                    <a href="/login.html#register" class="btn btn-primary btn-sm" data-i18n="nav.register">Registreren</a>`
                 : ''}`
          }
        </div>
      </nav>
    `;

    this.querySelectorAll('._nav-lang').forEach(buildLangDropdown);
    applyTranslations();
  }
}

if (!customElements.get('site-nav')) customElements.define('site-nav', SiteNav);

// ── SiteFooter ────────────────────────────────────────────────────────────────

class SiteFooter extends HTMLElement {
  connectedCallback() {
    const loggedIn = !!getCurrentUser();
    const showAuth = !this.hasAttribute('hide-auth') && !loggedIn;

    this.innerHTML = `
      <footer class="site-footer">
        <div class="footer-inner">
          <div class="footer-left">
            <div class="lang-switcher"></div>
            <span class="footer-copy" data-i18n="footer.copy">© 2026 Scrum Fight</span>
          </div>
          <nav class="footer-links">
            <a href="/privacy.html" data-i18n="footer.privacy">Privacybeleid</a>
            <a href="/subscription.html" class="hidden _footer-subscription" data-i18n="footer.subscription">Abonnementen</a>
            <a href="/terms.html" data-i18n="footer.terms">Algemene voorwaarden</a>
            ${showAuth ? `
            <span class="footer-auth" id="footerAuth">
              <a href="/login.html" data-i18n="footer.login">Inloggen</a>
              <a href="/login.html#register" data-i18n="footer.register">Registreren</a>
            </span>` : ''}
          </nav>
        </div>
      </footer>
    `;

    this.querySelectorAll('.lang-switcher').forEach(buildLangDropdown);
    applyTranslations();

    // Only shown where the payments feature is on (or to manage a paid plan).
    paymentsEnabled().then((enabled) => {
      const link = this.querySelector('._footer-subscription');
      if (link && showSubscriptionLinks(enabled, getCurrentUser())) link.classList.remove('hidden');
    });
  }
}

if (!customElements.get('site-footer')) customElements.define('site-footer', SiteFooter);

export { ProfileMenu, SiteNav, SiteFooter };
