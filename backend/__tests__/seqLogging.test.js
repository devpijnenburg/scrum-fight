const { installSeqLogging } = require('../src/shared/seqLogging');

// Een eigen "console" per test, zodat de echte console van Jest ongemoeid blijft.
function fakeConsole() {
  const lines = [];
  const target = {};
  for (const m of ['log', 'info', 'warn', 'error']) {
    target[m] = (...args) => lines.push([m, ...args]);
  }
  return { target, lines };
}

function fakeFetch(status = 201) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts, events: opts.body.split('\n').map((l) => JSON.parse(l)) });
    return { ok: status >= 200 && status < 300, status };
  };
  fn.calls = calls;
  return fn;
}

describe('seqLogging', () => {
  test('staat uit zonder SEQ_URL', () => {
    const { target } = fakeConsole();
    const original = target.log;
    const seq = installSeqLogging({ url: '', apiKey: 'k', target });
    expect(seq.enabled).toBe(false);
    expect(target.log).toBe(original);
  });

  test('staat uit zonder SEQ_API_KEY en waarschuwt', () => {
    const { target, lines } = fakeConsole();
    const seq = installSeqLogging({ url: 'http://seq:5341', apiKey: '', target });
    expect(seq.enabled).toBe(false);
    expect(lines.some(([m, msg]) => m === 'warn' && /SEQ_API_KEY ontbreekt/.test(msg))).toBe(true);
  });

  test('stuurt logregels als CLEF met API-key, niveau, tag en stacktrace', async () => {
    const { target, lines } = fakeConsole();
    const fetchImpl = fakeFetch();
    const seq = installSeqLogging({
      url: 'http://seq:5341/', apiKey: 'geheim', environment: 'test', target, fetchImpl,
    });
    try {
      target.log('[billing] subscription %s actief', 'sub_1');
      target.warn('[mail] SMTP ontbreekt');
      target.error('[jobs:room-cleanup] Error during cleanup:', new Error('kapot'));
      await seq.flush();

      // Uitvoer naar de console blijft bestaan.
      expect(lines.filter(([m]) => m !== 'info')).toHaveLength(3);

      expect(fetchImpl.calls).toHaveLength(1);
      const { url, opts, events } = fetchImpl.calls[0];
      expect(url).toBe('http://seq:5341/ingest/clef');
      expect(opts.headers['X-Seq-ApiKey']).toBe('geheim');
      expect(opts.headers['Content-Type']).toBe('application/vnd.serilog.clef');

      expect(events.map((e) => e['@l'])).toEqual(['Information', 'Warning', 'Error']);
      expect(events[0]['@m']).toBe('[billing] subscription sub_1 actief');
      expect(events[0]).toMatchObject({ Application: 'scrum-fight', Environment: 'test', Component: 'billing' });
      expect(events[2].Component).toBe('jobs:room-cleanup');
      expect(events[2]['@m']).toBe('[jobs:room-cleanup] Error during cleanup: kapot');
      expect(events[2]['@x']).toMatch(/Error: kapot/);
    } finally {
      seq.uninstall();
    }
  });

  test('een falende Seq geeft één melding en breekt niets', async () => {
    const { target, lines } = fakeConsole();
    const fetchImpl = fakeFetch(401);
    const seq = installSeqLogging({ url: 'http://seq:5341', apiKey: 'fout', target, fetchImpl });
    try {
      target.log('een');
      await seq.flush();
      target.log('twee');
      await seq.flush();
      const meldingen = lines.filter(([m, msg]) => m === 'error' && /Versturen naar Seq mislukt/.test(msg));
      expect(meldingen).toHaveLength(1);
    } finally {
      seq.uninstall();
    }
  });

  test('uninstall zet de console terug', () => {
    const { target } = fakeConsole();
    const original = target.error;
    const seq = installSeqLogging({ url: 'http://seq:5341', apiKey: 'k', target, fetchImpl: fakeFetch() });
    expect(target.error).not.toBe(original);
    seq.uninstall();
    expect(target.error).toBe(original);
  });
});
