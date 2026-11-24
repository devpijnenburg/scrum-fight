jest.mock('../src/shared/database', () => ({ query: jest.fn() }));

const request = require('supertest');
const { createApp } = require('../src/app');
const { setLogLevel, resetLogLevel } = require('../src/shared/logger');

const app = createApp();
let warn;

beforeEach(() => {
  setLogLevel('warn');
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  resetLogLevel();
});

const browserCalls = () => warn.mock.calls.filter(([line]) => line.startsWith('[browser]'));

describe('POST /api/client-errors', () => {
  it('logs the browser error with its stack and without query strings', async () => {
    const res = await request(app).post('/api/client-errors').send({
      kind: 'error',
      message: 'x is not a function',
      page: '/room.html?room=ABC123',
      source: 'https://scrumfight.example/js/room/table.js?v=1a2b3c',
      line: 42,
      column: 7,
      stack: 'TypeError: x is not a function\n    at render (https://scrumfight.example/js/room/table.js?v=1a2b3c:42:7)',
      browser: 'Firefox/140',
    });
    expect(res.status).toBe(204);

    const [[line, err]] = browserCalls();
    expect(line).toMatch(
      /^\[browser\] Fout in de browser {2}kind=error page=\/room\.html source=https:\/\/scrumfight\.example\/js\/room\/table\.js line=42 column=7 browser=Firefox\/140 req=\w+$/
    );
    expect(err.message).toBe('x is not a function');
    expect(err.stack).toContain('table.js:42:7');
    expect(err.stack).not.toContain('?v=');
  });

  it('accepts junk without crashing and caps long fields', async () => {
    const res = await request(app).post('/api/client-errors').send({ message: 'm'.repeat(5000), line: 'nope', kind: 'evil' });
    expect(res.status).toBe(204);
    const [[line, err]] = browserCalls();
    expect(line).toMatch(/kind=error/);
    expect(line).not.toMatch(/line=/);
    expect(err.message).toHaveLength(500);
  });
});
