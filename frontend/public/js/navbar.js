// Single navbar file — defines <profile-menu> and <site-nav>.
// Include this on every page instead of profile-menu.js.
//
// Usage:
//   <site-nav></site-nav>              — brand + profile if logged in, lang switcher if not
//   <site-nav show-cta></site-nav>     — same + login/register buttons when not logged in

// ── ProfileMenu ───────────────────────────────────────────────────────────────

class ProfileMenu extends HTMLElement {
  connectedCallback() {
    this._name = null;
    this._boundOutsideClick = () => this.close();
    this._render();
    document.addEventListener('click', this._boundOutsideClick);
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

  _render() {
    const user     = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    const loggedIn = !!user;
    const name     = this._name || user?.name;

    if (!name && !loggedIn) {
      this.innerHTML = '';
      return;
    }

    this.innerHTML = `
      <div class="profile-menu-wrap">
        <button class="profile-menu-btn" type="button" aria-haspopup="true" aria-expanded="false">
          <span class="profile-avatar">👤</span>
          <span class="profile-name-label">${typeof escapeHtml === 'function' ? escapeHtml(name || 'Profiel') : (name || 'Profiel')}</span>
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

    this._wire();

    if (typeof buildLangDropdown === 'function') {
      this.querySelectorAll('.lang-switcher').forEach(buildLangDropdown);
    }
    if (typeof applyTranslations === 'function') applyTranslations();
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
      if (typeof logout === 'function') logout();
    });

    this.querySelector('._pm-auth')?.addEventListener('click', () => {
      this.close();
      this.dispatchEvent(new CustomEvent('profile-auth-request', { bubbles: true }));
    });
  }
}

customElements.define('profile-menu', ProfileMenu);

// ── SiteNav ───────────────────────────────────────────────────────────────────

class SiteNav extends HTMLElement {
  connectedCallback() {
    this._render();
  }

  _render() {
    const user    = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    const showCta = this.hasAttribute('show-cta');

    this.innerHTML = `
      <nav class="navbar">
        <a href="/" class="navbar-brand">⚔️ Scrum Fight <small class="navbar-subtitle">Story Estimator 2.0</small></a>
        <div class="navbar-actions">
          ${user
            ? '<profile-menu></profile-menu>'
            : `<div class="lang-switcher _nav-lang"></div>
               ${showCta
                 ? `<a href="/login.html" class="btn btn-ghost" data-i18n="nav.login">Inloggen</a>
                    <a href="/login.html#register" class="btn btn-primary btn-sm" data-i18n="nav.register">Registreren</a>`
                 : ''}`
          }
        </div>
      </nav>
    `;

    if (typeof buildLangDropdown === 'function') {
      this.querySelectorAll('._nav-lang').forEach(buildLangDropdown);
    }
    if (typeof applyTranslations === 'function') applyTranslations();
  }
}

customElements.define('site-nav', SiteNav);
