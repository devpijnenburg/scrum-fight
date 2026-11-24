const { createLogger, formatLine, setLogLevel, resetLogLevel } = require('../src/shared/logger');
const { installSeqLogging } = require('../src/shared/seqLogging');

function fakeConsole() {
  const calls = [];
  const target = {};
  for (const m of ['log', 'info', 'warn', 'error']) target[m] = (...args) => calls.push([m, ...args]);
  return { target, calls };
}

afterEach(() => resetLogLevel());

describe('logger', () => {
  test('maakt een nette regel met component, bericht en velden', () => {
    expect(formatLine('rooms', 'Kamer aangemaakt', { room: 'ABC123', name: 'Sprint 4', guest: true, n: 3 }))
      .toBe('[rooms] Kamer aangemaakt  room=ABC123 name="Sprint 4" guest=true n=3');
    expect(formatLine('rooms', 'Zonder velden')).toBe('[rooms] Zonder velden');
    expect(formatLine('x', 'leeg', { a: '', b: 'a=b', c: { d: 1 } })).toBe('[x] leeg  a="" b="a=b" c={"d":1}');
  });

  test('laat undefined velden weg en geeft een Error door aan de console', () => {
    setLogLevel('debug');
    const { target, calls } = fakeConsole();
    const log = createLogger('realtime', { target });
    const err = new Error('kapot');
    log.error('Opslaan mislukt', { room: 'R1', extra: undefined }, err);
    log.warn('Alleen een fout', err);
    expect(calls[0]).toEqual(['error', '[realtime] Opslaan mislukt  room=R1', err]);
    expect(calls[1]).toEqual(['warn', '[realtime] Alleen een fout', err]);
  });

  test('respecteert het logniveau', () => {
    const { target, calls } = fakeConsole();
    const log = createLogger('a', { target });
    setLogLevel('info');
    log.debug('niet');
    log.info('wel');
    setLogLevel('error');
    log.warn('niet');
    expect(calls.map((c) => c[1])).toEqual(['[a] wel']);
  });

  test('child voegt een subcomponent toe', () => {
    setLogLevel('info');
    const { target, calls } = fakeConsole();
    createLogger('jobs', { target }).child('room-cleanup').info('klaar');
    expect(calls[0][1]).toBe('[jobs:room-cleanup] klaar');
  });

  test('velden gaan als losse properties naar Seq', async () => {
    setLogLevel('info');
    const { target } = fakeConsole();
    const sent = [];
    const fetchImpl = async (_url, opts) => {
      sent.push(...opts.body.split('\n').map((l) => JSON.parse(l)));
      return { ok: true, status: 201 };
    };
    const seq = installSeqLogging({ url: 'http://seq:5341', apiKey: 'k', target, fetchImpl });
    try {
      createLogger('realtime', { target }).info('Speler is de kamer binnengekomen', { room: 'R1', player: 'Alice', players: 2 });
      target.info('[los] zonder velden');
      await seq.flush();
      expect(sent[0]).toMatchObject({
        '@m': '[realtime] Speler is de kamer binnengekomen  room=R1 player=Alice players=2',
        Component: 'realtime', room: 'R1', player: 'Alice', players: 2,
      });
      expect(sent[1].room).toBeUndefined();
    } finally {
      seq.uninstall();
    }
  });
});
