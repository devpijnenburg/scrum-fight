// Melden van browserfouten aan de backend.
import { jest } from '@jest/globals';
import {
  shouldReport, reportFromError, reportFromRejection, resetForTests, isOwnSource,
} from '../public/js/core/errorReporter.js';

const ORIGIN = 'http://localhost';

beforeEach(() => {
  resetForTests();
  localStorage.clear();
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
});

const report = (overrides = {}) => ({
  kind: 'error', message: 'boom', source: `${ORIGIN}/js/room/table.js`, line: 1, ...overrides,
});

test('only reports errors from our own scripts', () => {
  expect(isOwnSource(`${ORIGIN}/js/x.js`, ORIGIN)).toBe(true);
  expect(isOwnSource(undefined, ORIGIN)).toBe(true);
  expect(isOwnSource('chrome-extension://abc/content.js', ORIGIN)).toBe(false);
  expect(shouldReport(report({ source: 'https://cdn.example/lib.js' }), ORIGIN)).toBe(false);
  expect(shouldReport(report({ message: 'Script error.' }), ORIGIN)).toBe(false);
});

test('reports the same error only once', () => {
  expect(shouldReport(report(), ORIGIN)).toBe(true);
  expect(shouldReport(report(), ORIGIN)).toBe(false);
});

test('builds a report from an error event and a rejection', () => {
  const error = new TypeError('x is not a function');
  expect(reportFromError({ error, filename: `${ORIGIN}/js/a.js`, lineno: 3, colno: 9 })).toMatchObject({
    kind: 'error', message: 'x is not a function', source: `${ORIGIN}/js/a.js`, line: 3, column: 9,
  });
  expect(reportFromRejection({ reason: new Error('nope') })).toMatchObject({ kind: 'unhandledrejection', message: 'nope' });
  expect(reportFromRejection({ reason: { code: 42 } }).message).toBe('{"code":42}');
});

test('an uncaught error is sent to the backend with the page and the session token', async () => {
  localStorage.setItem('token', 'abc');
  window.dispatchEvent(new ErrorEvent('error', {
    message: 'kapot', error: new Error('kapot'), filename: `${location.origin}/js/pages/x.js`, lineno: 5,
  }));
  expect(global.fetch).toHaveBeenCalledTimes(1);
  const [url, options] = global.fetch.mock.calls[0];
  expect(url).toBe('/api/client-errors');
  expect(options.keepalive).toBe(true);
  expect(options.headers.Authorization).toBe('Bearer abc');
  expect(JSON.parse(options.body)).toMatchObject({ kind: 'error', message: 'kapot', line: 5, page: location.pathname });
});
