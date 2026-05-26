// Web Component — profile dropdown, shared across all pages.
// Uses light DOM so styles.css applies without extra work.
//
// On room page: call el.setName(name) to show the button for guests too.
// On other pages: only renders when getCurrentUser() returns a user.
//
// Dispatches 'profile-auth-request' (bubbles) when guest clicks login button.

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

  // Called by room.js after the player joins (works for guests too)
  setName(name) {
    this._name = name;
    this._render();
  }

  // Re-reads auth state and re-renders (e.g. after in-room login)
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
            <span>🔐</span><span>Profiel &amp; 2FA</span>
          </a>
          <button class="profile-menu-item _pm-settings" type="button">
            <span>⚙️</span><span data-i18n="room.settings.toggle_title">Instellingen</span>
          </button>
          ${user?.is_admin ? `
          <a href="/admin.html" class="profile-menu-item">
            <span>⚙️</span><span>Beheerportaal</span>
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

    // Prevent outside-click from closing when clicking inside the menu
    menu.addEventListener('click', (e) => e.stopPropagation());

    this.querySelector('._pm-settings')?.addEventListener('click', () => {
      this.close();
      if (typeof openSettingsModal === 'function') openSettingsModal();
    });

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
