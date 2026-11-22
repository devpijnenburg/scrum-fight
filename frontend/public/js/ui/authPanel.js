import { t, applyTranslations } from '../core/i18n.js';
import { apiFetch, initOAuthButtons } from '../core/api.js';
import { getCurrentUser } from '../core/auth.js';

// <sf-auth-panel> — login, registration and the second login step in one
// component, shared by login.html, the in-room auth modal and
// totp-verify.html (OAuth + TOTP).
//
// Attributes:
//   initial-tab="register"           start on the registration tab
//   step="totp" pre-auth-token="…"   start directly at the TOTP step
//
// On success the session token is stored and an `auth-success` event
// (bubbling, detail: { token, user }) is dispatched; the page decides
// where to go next. Steps:
//   login | register → (totp | email-code) → success
// An unverified account gets a "resend verification email" action.

const AUTH_OAUTH_ICONS = {
  google: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/></svg>',
  github: '<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>',
};

let _authPanelSeq = 0;

export class SfAuthPanel extends HTMLElement {
  connectedCallback() {
    if (this._rendered) return;
    this._rendered = true;
    this._uid = `ap${++_authPanelSeq}`;
    this._preAuthToken = this.getAttribute('pre-auth-token');
    this._pendingEmail = '';
    this._render();
    this._wire();

    const step = this.getAttribute('step');
    if ((step === 'totp' || step === 'email-code') && this._preAuthToken) {
      this.showStep(step, { standalone: true });
    } else {
      this.showTab(this.getAttribute('initial-tab') === 'register' ? 'register' : 'login');
    }
    initOAuthButtons(this);
    applyTranslations();
  }

  _id(name) {
    return `${this._uid}-${name}`;
  }

  _render() {
    const id = (n) => this._id(n);
    this.innerHTML = `
      <div class="auth-tabs" data-part="tabs" role="tablist">
        <button type="button" class="auth-tab" data-tab="login" role="tab" data-i18n="login.tab.login">Inloggen</button>
        <button type="button" class="auth-tab" data-tab="register" role="tab" data-i18n="login.tab.register">Registreren</button>
      </div>

      <form class="auth-form" data-part="login" autocomplete="on">
        <div class="form-group">
          <label for="${id('login-email')}" data-i18n="login.email">E-mailadres</label>
          <input id="${id('login-email')}" name="email" type="email" class="input" autocomplete="email"
                 data-i18n-ph="login.email.ph" placeholder="naam@email.nl" required />
        </div>
        <div class="form-group">
          <label for="${id('login-password')}" data-i18n="login.password">Wachtwoord</label>
          <input id="${id('login-password')}" name="password" type="password" class="input" autocomplete="current-password"
                 data-i18n-ph="login.password.ph" placeholder="••••••••" required />
        </div>
        <button type="submit" class="btn btn-primary btn-full" data-i18n="login.btn">Inloggen →</button>
        <p class="form-error hidden" data-part="login-error" role="alert"></p>
        <button type="button" class="btn btn-ghost btn-full hidden" data-part="resend" data-i18n="login.unverified.resend">
          Verificatiemail opnieuw sturen
        </button>
      </form>

      <form class="auth-form hidden" data-part="register" autocomplete="on">
        <div class="form-group">
          <label for="${id('reg-name')}" data-i18n="login.register.name">Naam</label>
          <input id="${id('reg-name')}" name="name" type="text" class="input" maxlength="50" autocomplete="name"
                 data-i18n-ph="login.register.name.ph" placeholder="Jouw naam" required />
        </div>
        <div class="form-group">
          <label for="${id('reg-email')}" data-i18n="login.email">E-mailadres</label>
          <input id="${id('reg-email')}" name="email" type="email" class="input" autocomplete="email"
                 data-i18n-ph="login.email.ph" placeholder="naam@email.nl" required />
        </div>
        <div class="form-group">
          <label for="${id('reg-password')}">
            <span data-i18n="login.password">Wachtwoord</span> <small data-i18n="login.password.hint">(min. 8 tekens)</small>
          </label>
          <input id="${id('reg-password')}" name="password" type="password" class="input" minlength="8" autocomplete="new-password"
                 data-i18n-ph="login.password.ph" placeholder="••••••••" required />
        </div>
        <button type="submit" class="btn btn-primary btn-full" data-i18n="login.register.btn">Account aanmaken →</button>
        <p class="form-error hidden" data-part="register-error" role="alert"></p>
      </form>

      <p class="auth-notice hidden" data-part="notice" role="status"></p>

      <form class="auth-form hidden" data-part="code">
        <p class="totp-step-hint" data-part="code-hint"></p>
        <div class="form-group">
          <label for="${id('code')}" data-i18n="login.code.label">Verificatiecode</label>
          <input id="${id('code')}" name="code" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6"
                 class="input input-code" placeholder="000000" autocomplete="one-time-code" required />
        </div>
        <button type="submit" class="btn btn-primary btn-full" data-i18n="login.code.btn">Verifiëren →</button>
        <p class="form-error hidden" data-part="code-error" role="alert"></p>
        <button type="button" class="btn btn-ghost btn-full" data-part="back" data-i18n="login.back">← Terug</button>
      </form>

      <div class="oauth-divider" data-part="oauth-divider"><span data-i18n="login.oauth.divider">of ga verder met</span></div>
      <div class="oauth-buttons" data-part="oauth">
        <a href="/api/auth/google" class="btn btn-oauth" data-oauth-provider="google">${AUTH_OAUTH_ICONS.google} Google</a>
        <a href="/api/auth/github" class="btn btn-oauth" data-oauth-provider="github">${AUTH_OAUTH_ICONS.github} GitHub</a>
      </div>
    `;
  }

  _part(name) {
    return this.querySelector(`[data-part="${name}"]`);
  }

  _text(key, fallback, vars) {
    const text = t(key, vars);
    return text === key ? fallback : text;
  }

  _showError(part, message) {
    const el = this._part(part);
    el.textContent = message;
    el.classList.toggle('hidden', !message);
  }

  _setBusy(form, busy) {
    form.querySelectorAll('button, input').forEach((el) => { el.disabled = busy; });
  }

  _wire() {
    this.querySelectorAll('.auth-tab').forEach((tab) => {
      tab.addEventListener('click', () => this.showTab(tab.dataset.tab));
    });

    this._part('login').addEventListener('submit', (e) => {
      e.preventDefault();
      this._login();
    });
    this._part('register').addEventListener('submit', (e) => {
      e.preventDefault();
      this._register();
    });
    this._part('code').addEventListener('submit', (e) => {
      e.preventDefault();
      this._verifyCode();
    });
    this._part('back').addEventListener('click', () => {
      if (this._standalone) {
        window.location.href = '/login.html';
        return;
      }
      this._preAuthToken = null;
      this.showTab('login');
    });
    this._part('resend').addEventListener('click', () => this._resendVerification());
  }

  // ── Views ─────────────────────────────────────────────────────────────────

  _toggleCredentialViews(visible) {
    for (const part of ['tabs', 'oauth-divider', 'oauth']) {
      this._part(part).classList.toggle('hidden', !visible);
    }
    if (visible) initOAuthButtons(this);
  }

  showTab(tab) {
    this._step = tab;
    this._toggleCredentialViews(true);
    this.querySelectorAll('.auth-tab').forEach((el) => {
      const active = el.dataset.tab === tab;
      el.classList.toggle('active', active);
      el.setAttribute('aria-selected', String(active));
    });
    this._part('login').classList.toggle('hidden', tab !== 'login');
    this._part('register').classList.toggle('hidden', tab !== 'register');
    this._part('code').classList.add('hidden');
    this._part('notice').classList.add('hidden');
    this._showError('login-error', '');
    this._showError('register-error', '');
    this._part('resend').classList.add('hidden');
  }

  showStep(step, { standalone = false } = {}) {
    this._step = step;
    this._standalone = standalone;
    this._toggleCredentialViews(false);
    this._part('login').classList.add('hidden');
    this._part('register').classList.add('hidden');
    this._part('notice').classList.add('hidden');
    this._part('code-hint').textContent = step === 'totp'
      ? this._text('login.totp.hint', 'Voer de 6-cijferige code in van je authenticator-app.')
      : this._text('login.emailcode.hint', 'We hebben je een inlogcode gemaild. Voer de 6-cijferige code in.');
    this._showError('code-error', '');
    const code = this._part('code');
    code.querySelector('input').value = '';
    code.classList.remove('hidden');
    code.querySelector('input').focus();
  }

  focusFirstField() {
    const form = this._part(this._step === 'register' ? 'register' : this._step === 'login' ? 'login' : 'code');
    form.querySelector('input')?.focus();
  }

  _notice(message) {
    for (const part of ['login', 'register', 'code']) this._part(part).classList.add('hidden');
    const el = this._part('notice');
    el.textContent = message;
    el.classList.remove('hidden');
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async _login() {
    const form = this._part('login');
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    this._showError('login-error', '');
    this._part('resend').classList.add('hidden');
    if (!email || !password) {
      this._showError('login-error', this._text('errors.LOGIN_FIELDS_REQUIRED', 'E-mail en wachtwoord zijn verplicht'));
      return;
    }

    this._setBusy(form, true);
    try {
      const result = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      if (result.requiresTotp) {
        this._preAuthToken = result.preAuthToken;
        this.showStep('totp');
      } else if (result.requiresEmail2fa) {
        this._preAuthToken = result.preAuthToken;
        this.showStep('email-code');
      } else {
        this._succeed(result.token, result.user);
      }
    } catch (ex) {
      this._showError('login-error', ex.message);
      if (ex.code === 'EMAIL_NOT_VERIFIED') {
        this._pendingEmail = email;
        this._part('resend').classList.remove('hidden');
      }
    } finally {
      this._setBusy(form, false);
    }
  }

  async _register() {
    const form = this._part('register');
    const body = { name: form.elements.name.value.trim(), email: form.elements.email.value.trim(), password: form.elements.password.value };
    this._showError('register-error', '');
    if (!body.name || !body.email || !body.password) {
      this._showError('register-error', this._text('errors.REGISTER_FIELDS_REQUIRED', 'Naam, e-mail en wachtwoord zijn verplicht'));
      return;
    }

    this._setBusy(form, true);
    try {
      await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(body) });
      this._notice(this._text('login.register.check_email', '✉️ Controleer je e-mail voor een bevestigingslink.'));
    } catch (ex) {
      this._showError('register-error', ex.message);
    } finally {
      this._setBusy(form, false);
    }
  }

  async _verifyCode() {
    const form = this._part('code');
    const code = form.elements.code.value.trim();
    this._showError('code-error', '');
    if (!code) {
      this._showError('code-error', this._text('errors.CODE_REQUIRED', 'Code is verplicht'));
      return;
    }

    const endpoint = this._step === 'totp' ? '/auth/verify-totp' : '/auth/verify-email-2fa';
    this._setBusy(form, true);
    try {
      const { token } = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({ preAuthToken: this._preAuthToken, code }),
      });
      this._succeed(token, null);
    } catch (ex) {
      this._showError('code-error', ex.message);
    } finally {
      this._setBusy(form, false);
    }
  }

  async _resendVerification() {
    const button = this._part('resend');
    button.disabled = true;
    try {
      await apiFetch('/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email: this._pendingEmail }) });
      this._showError('login-error', '');
      this._notice(this._text('login.unverified.sent', '✉️ Als dit adres nog niet bevestigd is, hebben we een nieuwe link gestuurd.'));
    } catch (ex) {
      this._showError('login-error', ex.message);
    } finally {
      button.disabled = false;
    }
  }

  _succeed(token, user) {
    if (!token) {
      this._showError(this._step === 'login' ? 'login-error' : 'code-error',
        this._text('errors.SERVER_ERROR', 'Er ging iets mis, probeer het opnieuw'));
      return;
    }
    localStorage.setItem('token', token);
    const sessionUser = user || getCurrentUser();
    if (sessionUser?.name) localStorage.setItem('userName', sessionUser.name);
    this.dispatchEvent(new CustomEvent('auth-success', { bubbles: true, detail: { token, user: sessionUser } }));
  }
}

if (!customElements.get('sf-auth-panel')) {
  customElements.define('sf-auth-panel', SfAuthPanel);
}
