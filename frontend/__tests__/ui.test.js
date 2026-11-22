'use strict';

// Shared UI building blocks in public/js/ui (classic scripts, run in jsdom).

const { openModal, closeModal, isModalOpen, confirmDialog } = require('../public/js/ui/modal.js');
const { showToast } = require('../public/js/ui/toast.js');
const settings = require('../public/js/ui/../settings.js');

const flush = () => new Promise((r) => setTimeout(r, 0));

function modalMarkup(id, attrs = '') {
  return `
    <button id="${id}Trigger">open</button>
    <div id="${id}" class="modal hidden" ${attrs}>
      <div class="modal-backdrop"></div>
      <div class="modal-card">
        <input id="${id}Input" />
        <button data-modal-close id="${id}Cancel">Annuleren</button>
      </div>
    </div>`;
}

const pressEscape = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

describe('modal', () => {
  beforeEach(() => {
    document.body.innerHTML = modalMarkup('m1') + modalMarkup('m2') + modalMarkup('s1', 'data-modal-static');
  });

  it('opens, focuses the first field and restores focus on close', () => {
    document.getElementById('m1Trigger').focus();
    openModal('m1');
    expect(isModalOpen('m1')).toBe(true);
    expect(document.activeElement.id).toBe('m1Input');
    closeModal('m1');
    expect(isModalOpen('m1')).toBe(false);
    expect(document.activeElement.id).toBe('m1Trigger');
  });

  it('closes on backdrop click and on [data-modal-close]', () => {
    openModal('m1');
    document.querySelector('#m1 .modal-backdrop').click();
    expect(isModalOpen('m1')).toBe(false);
    openModal('m1');
    document.getElementById('m1Cancel').click();
    expect(isModalOpen('m1')).toBe(false);
  });

  it('Escape closes only the topmost modal', () => {
    openModal('m1');
    openModal('m2');
    pressEscape();
    expect(isModalOpen('m2')).toBe(false);
    expect(isModalOpen('m1')).toBe(true);
    pressEscape();
    expect(isModalOpen('m1')).toBe(false);
  });

  it('a static modal ignores backdrop and Escape', () => {
    openModal('s1');
    document.querySelector('#s1 .modal-backdrop').click();
    pressEscape();
    expect(isModalOpen('s1')).toBe(true);
    closeModal('s1');
    expect(isModalOpen('s1')).toBe(false);
  });

  it('fires modal:open and modal:close once per transition', () => {
    const events = [];
    const el = document.getElementById('m1');
    el.addEventListener('modal:open', () => events.push('open'));
    el.addEventListener('modal:close', () => events.push('close'));
    openModal(el);
    openModal(el);
    closeModal(el);
    closeModal(el);
    expect(events).toEqual(['open', 'close']);
  });

  describe('confirmDialog', () => {
    it('resolves true on confirm', async () => {
      const answer = confirmDialog('Zeker?');
      expect(document.querySelector('#sfConfirmModal .confirm-message').textContent).toBe('Zeker?');
      document.querySelector('#sfConfirmModal .confirm-ok').click();
      await expect(answer).resolves.toBe(true);
    });

    it('resolves false on cancel, backdrop or Escape', async () => {
      let answer = confirmDialog('A');
      document.querySelector('#sfConfirmModal .confirm-cancel').click();
      await expect(answer).resolves.toBe(false);

      answer = confirmDialog('B');
      document.querySelector('#sfConfirmModal .modal-backdrop').click();
      await expect(answer).resolves.toBe(false);

      answer = confirmDialog('C');
      pressEscape();
      await expect(answer).resolves.toBe(false);
    });

    it('does not leak listeners between calls', async () => {
      const first = confirmDialog('1');
      document.querySelector('#sfConfirmModal .confirm-cancel').click();
      await first;
      const second = confirmDialog('2');
      document.querySelector('#sfConfirmModal .confirm-ok').click();
      await expect(second).resolves.toBe(true);
    });
  });
});

describe('toast', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '';
  });
  afterEach(() => jest.useRealTimers());

  it('escapes text and removes itself after the duration', () => {
    showToast('<img src=x onerror=alert(1)>', { icon: '⚠️', duration: 1000 });
    const toast = document.querySelector('#toastContainer .toast');
    expect(toast.querySelector('img')).toBeNull();
    expect(toast.textContent).toContain('<img src=x');
    jest.advanceTimersByTime(1000);
    expect(toast.classList.contains('toast-hide')).toBe(true);
    jest.advanceTimersByTime(600);
    expect(document.querySelector('.toast')).toBeNull();
  });

  it('supports trusted html and variants', () => {
    showToast('', { html: '<strong>Alice</strong>', variant: 'gold' });
    const toast = document.querySelector('.toast');
    expect(toast.classList.contains('toast-gold')).toBe(true);
    expect(toast.querySelector('strong').textContent).toBe('Alice');
  });
});

describe('settings', () => {
  beforeEach(() => localStorage.clear());

  it('returns defaults and merges saved changes', () => {
    expect(settings.loadSettings()).toEqual({ analyticsAutoOpen: true, defaultMethod: '' });
    settings.saveSettings({ defaultMethod: 'tshirt' });
    settings.saveSettings({ analyticsAutoOpen: false });
    expect(settings.loadSettings()).toEqual({ analyticsAutoOpen: false, defaultMethod: 'tshirt' });
  });

  it('survives corrupt storage', () => {
    localStorage.setItem('sfSettings', '{not json');
    expect(settings.loadSettings().analyticsAutoOpen).toBe(true);
  });
});

describe('method select', () => {
  let fillMethodSelect;
  beforeAll(() => {
    global.loadSettings = settings.loadSettings;
    document.body.innerHTML = '';
    ({ fillMethodSelect } = require('../public/js/ui/methodSelect.js'));
  });
  beforeEach(() => localStorage.clear());

  it('lists all methods and defaults to Fibonacci+', () => {
    const select = fillMethodSelect(document.createElement('select'));
    expect([...select.options].map((o) => o.value)).toEqual(['fibonacci', 'modified_fibonacci', 'tshirt', 'powers_of_2']);
    expect(select.value).toBe('modified_fibonacci');
  });

  it('preselects the preferred method from settings', () => {
    settings.saveSettings({ defaultMethod: 'powers_of_2' });
    expect(fillMethodSelect(document.createElement('select')).value).toBe('powers_of_2');
  });

  it('offers "no preference" when asked and keeps it selected', () => {
    settings.saveSettings({ defaultMethod: 'tshirt' });
    const select = document.createElement('select');
    select.setAttribute('data-include-none', '');
    fillMethodSelect(select);
    expect(select.options[0].value).toBe('');
    expect(select.value).toBe('');
  });
});

describe('<sf-auth-panel>', () => {
  beforeAll(() => {
    require('../public/js/ui/authPanel.js');
  });

  function mount(attrs = '') {
    document.body.innerHTML = `<div class="auth-card"><sf-auth-panel ${attrs}></sf-auth-panel></div>`;
    return document.querySelector('sf-auth-panel');
  }
  const part = (panel, name) => panel.querySelector(`[data-part="${name}"]`);
  const visible = (el) => !el.classList.contains('hidden');

  async function submitLogin(panel) {
    const form = part(panel, 'login');
    form.elements.email.value = 'a@b.nl';
    form.elements.password.value = 'secret123';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    await flush();
  }

  beforeEach(() => {
    localStorage.clear();
    global.apiFetch = jest.fn();
  });

  it('switches tabs', () => {
    const panel = mount();
    expect(visible(part(panel, 'login'))).toBe(true);
    panel.querySelector('[data-tab="register"]').click();
    expect(visible(part(panel, 'register'))).toBe(true);
    expect(visible(part(panel, 'login'))).toBe(false);
  });

  it('logs in directly and emits auth-success', async () => {
    const panel = mount();
    const onSuccess = jest.fn();
    panel.addEventListener('auth-success', (e) => onSuccess(e.detail));
    apiFetch.mockResolvedValueOnce({ token: 'tok', user: { name: 'Alice' } });

    await submitLogin(panel);

    expect(localStorage.getItem('token')).toBe('tok');
    expect(localStorage.getItem('userName')).toBe('Alice');
    expect(onSuccess).toHaveBeenCalledWith({ token: 'tok', user: { name: 'Alice' } });
  });

  it.each([
    ['requiresTotp', '/auth/verify-totp'],
    ['requiresEmail2fa', '/auth/verify-email-2fa'],
  ])('handles %s with a code step', async (flag, endpoint) => {
    const panel = mount();
    const onSuccess = jest.fn();
    panel.addEventListener('auth-success', onSuccess);
    apiFetch.mockResolvedValueOnce({ [flag]: true, preAuthToken: 'pre', user: { name: 'A' } });

    await submitLogin(panel);
    expect(visible(part(panel, 'code'))).toBe(true);
    expect(visible(part(panel, 'tabs'))).toBe(false);
    expect(localStorage.getItem('token')).toBeNull();

    apiFetch.mockResolvedValueOnce({ token: 'session' });
    const code = part(panel, 'code');
    code.elements.code.value = '123456';
    code.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    await flush();

    expect(apiFetch).toHaveBeenLastCalledWith(endpoint, expect.objectContaining({
      body: JSON.stringify({ preAuthToken: 'pre', code: '123456' }),
    }));
    expect(localStorage.getItem('token')).toBe('session');
    expect(onSuccess).toHaveBeenCalled();
  });

  it('offers to resend the verification email for unverified accounts', async () => {
    const panel = mount();
    apiFetch.mockRejectedValueOnce(Object.assign(new Error('E-mail nog niet geverifieerd'), { code: 'EMAIL_NOT_VERIFIED' }));
    await submitLogin(panel);
    expect(part(panel, 'login-error').textContent).toBe('E-mail nog niet geverifieerd');
    expect(visible(part(panel, 'resend'))).toBe(true);

    apiFetch.mockResolvedValueOnce({ ok: true });
    part(panel, 'resend').click();
    await flush();
    expect(apiFetch).toHaveBeenLastCalledWith('/auth/resend-verification', expect.objectContaining({
      body: JSON.stringify({ email: 'a@b.nl' }),
    }));
    expect(visible(part(panel, 'notice'))).toBe(true);
  });

  it('never stores a missing token', async () => {
    const panel = mount();
    apiFetch.mockResolvedValueOnce({ user: { name: 'A' } });
    await submitLogin(panel);
    expect(localStorage.getItem('token')).toBeNull();
    expect(visible(part(panel, 'login-error'))).toBe(true);
  });

  it('starts at the TOTP step when given a pre-auth token', () => {
    const panel = mount('step="totp" pre-auth-token="pre"');
    expect(visible(part(panel, 'code'))).toBe(true);
    expect(visible(part(panel, 'login'))).toBe(false);
  });

  it('gives each instance unique field ids', () => {
    document.body.innerHTML = '<sf-auth-panel></sf-auth-panel><sf-auth-panel></sf-auth-panel>';
    const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
