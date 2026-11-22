// Translating backend errors (REST bodies and socket 'error' events).
import { errorText } from '../public/js/core/errors.js';
import { setLang } from '../public/js/core/i18n.js';

beforeEach(() => localStorage.clear());

test('socket ROOM_FULL is translated with its limit', () => {
  setLang('en');
  expect(errorText({ code: 'ROOM_FULL', message: 'Kamer is vol (max 5 …)', limit: 5 }))
    .toBe('This room is full (max. 5 participants on this plan).');
  setLang('nl');
  expect(errorText({ code: 'ROOM_FULL', limit: 15 }))
    .toBe('Deze kamer is vol (max. 15 deelnemers voor dit plan).');
});

test('plan limit from room creation is translated with plan and max', () => {
  setLang('en');
  expect(errorText({ code: 'ROOM_LIMIT_REACHED', plan: 'free', max: 3 }))
    .toBe('Room limit reached for the free plan (3).');
});

test('falls back to the REST error, then the socket message, then the given fallback', () => {
  expect(errorText({ code: 'NEW_CODE', error: 'REST tekst' })).toBe('REST tekst');
  expect(errorText({ code: 'NEW_CODE', message: 'Socket tekst' })).toBe('Socket tekst');
  expect(errorText({}, 'Standaard')).toBe('Standaard');
  expect(errorText(undefined, 'Standaard')).toBe('Standaard');
});

test('every code the backend sends over the socket has NL and EN text', async () => {
  const { TRANSLATIONS } = await import('../public/js/core/i18n.js');
  for (const code of ['ROOM_NOT_FOUND', 'NAME_REQUIRED', 'ROOM_FULL', 'SERVER_ERROR', 'ROOM_LIMIT_REACHED']) {
    expect(TRANSLATIONS.nl[`errors.${code}`]).toBeTruthy();
    expect(TRANSLATIONS.en[`errors.${code}`]).toBeTruthy();
  }
});
