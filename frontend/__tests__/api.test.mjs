// apiFetch error handling: backend error codes are translated via i18n,
// with the backend's Dutch message as fallback.
import { jest } from '@jest/globals';
import { apiFetch, apiErrorMessage } from '../public/js/core/api.js';
import { setLang } from '../public/js/core/i18n.js';

function mockFetchError(status, body) {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status, json: async () => body });
}

beforeEach(() => localStorage.clear());

test('translates known codes in the current language', () => {
  setLang('en');
  expect(apiErrorMessage({ error: 'Kamer niet gevonden', code: 'ROOM_NOT_FOUND' })).toBe('Room not found');
  setLang('nl');
  expect(apiErrorMessage({ error: 'x', code: 'ROOM_NOT_FOUND' })).toBe('Kamer niet gevonden');
});

test('fills placeholders from the error body', () => {
  setLang('en');
  expect(apiErrorMessage({ code: 'ROOM_LIMIT_REACHED', plan: 'free', max: 3 }))
    .toBe('Room limit reached for the free plan (3).');
});

test('falls back to the backend message for unknown codes, or a generic one', () => {
  expect(apiErrorMessage({ error: 'Iets nieuws', code: 'SOMETHING_NEW' })).toBe('Iets nieuws');
  expect(apiErrorMessage({})).toBe('Verzoek mislukt');
});

test('apiFetch throws an Error with translated message, status and code', async () => {
  setLang('en');
  mockFetchError(409, { error: 'E-mailadres is al in gebruik', code: 'EMAIL_IN_USE' });
  await expect(apiFetch('/auth/register', { method: 'POST' })).rejects.toMatchObject({
    message: 'Email address is already in use',
    status: 409,
    code: 'EMAIL_IN_USE',
  });
});

test('apiFetch sends the bearer token and drops it on 401', async () => {
  localStorage.setItem('token', 'old');
  mockFetchError(401, { error: 'Unauthorized', code: 'SESSION_INVALID' });
  await expect(apiFetch('/auth/me')).rejects.toMatchObject({ status: 401 });
  expect(global.fetch).toHaveBeenCalledWith('/api/auth/me', expect.objectContaining({
    headers: expect.objectContaining({ Authorization: 'Bearer old' }),
  }));
  expect(localStorage.getItem('token')).toBeNull();
});

test('apiFetch returns null for 204 and parsed JSON otherwise', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce({ ok: true, status: 204 });
  await expect(apiFetch('/x', { method: 'DELETE' })).resolves.toBeNull();
  global.fetch = jest.fn().mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ a: 1 }) });
  await expect(apiFetch('/x')).resolves.toEqual({ a: 1 });
});
