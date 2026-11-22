'use strict';

// apiFetch error handling: backend error codes are translated via i18n,
// with the backend's Dutch message as fallback.

const fs = require('fs');
const path = require('path');

const load = (file) => fs.readFileSync(path.resolve(__dirname, '../public/js', file), 'utf8');

// Classic (non-module) scripts: evaluate in the global scope like the browser does.
function loadScripts(...files) {
  // eslint-disable-next-line no-eval
  (0, eval)(files.map(load).join('\n;\n') + `
    ;globalThis.apiFetch = apiFetch;
    globalThis.apiErrorMessage = apiErrorMessage;
    if (typeof t === 'function') { globalThis.t = t; globalThis.setLang = setLang; }`);
}

function mockFetchError(status, body) {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status, json: async () => body });
}

describe('without i18n (pages that only load api.js)', () => {
  beforeAll(() => loadScripts('api.js'));

  it('falls back to the backend message', () => {
    expect(apiErrorMessage({ error: 'Kamer niet gevonden', code: 'ROOM_NOT_FOUND' })).toBe('Kamer niet gevonden');
  });

  it('uses a generic message when the body has none', () => {
    expect(apiErrorMessage({})).toBe('Verzoek mislukt');
  });
});

describe('with i18n', () => {
  beforeAll(() => {
    delete globalThis.t;
    loadScripts('i18n.js', 'api.js');
  });
  beforeEach(() => localStorage.clear());

  it('translates known codes in the current language', () => {
    setLang('en');
    expect(apiErrorMessage({ error: 'Kamer niet gevonden', code: 'ROOM_NOT_FOUND' })).toBe('Room not found');
    setLang('nl');
    expect(apiErrorMessage({ error: 'x', code: 'ROOM_NOT_FOUND' })).toBe('Kamer niet gevonden');
  });

  it('fills placeholders from the error body', () => {
    setLang('en');
    expect(apiErrorMessage({ code: 'ROOM_LIMIT_REACHED', plan: 'free', max: 3 }))
      .toBe('Room limit reached for the free plan (3).');
  });

  it('falls back to the backend message for unknown codes', () => {
    expect(apiErrorMessage({ error: 'Iets nieuws', code: 'SOMETHING_NEW' })).toBe('Iets nieuws');
  });

  it('apiFetch throws an Error with translated message, status and code', async () => {
    setLang('en');
    mockFetchError(409, { error: 'E-mailadres is al in gebruik', code: 'EMAIL_IN_USE' });
    await expect(apiFetch('/auth/register', { method: 'POST' })).rejects.toMatchObject({
      message: 'Email address is already in use',
      status: 409,
      code: 'EMAIL_IN_USE',
    });
  });

  it('drops the stored token on 401', async () => {
    localStorage.setItem('token', 'old');
    mockFetchError(401, { error: 'Unauthorized', code: 'SESSION_INVALID' });
    await expect(apiFetch('/auth/me')).rejects.toMatchObject({ status: 401 });
    expect(localStorage.getItem('token')).toBeNull();
  });
});
