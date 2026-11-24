// Stuurt alle console.log/info/warn/error-regels ook naar de centrale Seq-instantie
// (murderbot-stack). De gewone uitvoer naar stdout/stderr blijft ongewijzigd, zodat
// `docker logs` en de workflow "Backend logs" blijven werken.
//
// Alleen actief als SEQ_URL én SEQ_API_KEY gezet zijn. Events gaan in batches als
// CLEF naar `${SEQ_URL}/ingest/clef`. Lukt versturen niet, dan gaat die batch
// verloren en staat er één melding op stderr; de applicatie merkt er verder niets van.

const util = require('util');
const { currentLogFields } = require('./logger');

const LEVELS = {
  log: 'Information',
  info: 'Information',
  warn: 'Warning',
  error: 'Error',
};

const NOOP = { enabled: false, flush: async () => {}, uninstall: () => {} };

function installSeqLogging({
  url = process.env.SEQ_URL,
  apiKey = process.env.SEQ_API_KEY,
  application = 'scrum-fight',
  environment = process.env.SEQ_ENVIRONMENT,
  fetchImpl = globalThis.fetch,
  target = console,
  flushIntervalMs = 2000,
  maxBatch = 100,
  maxQueue = 2000,
  timeoutMs = 5000,
} = {}) {
  if (!url) return NOOP;
  if (!apiKey) {
    target.warn('[seq] SEQ_URL is gezet maar SEQ_API_KEY ontbreekt; logging naar Seq staat uit.');
    return NOOP;
  }

  const endpoint = `${url.replace(/\/+$/, '')}/ingest/clef`;
  const original = {};
  const replaced = {};
  let queue = [];
  let dropped = 0;
  let failing = false;
  let sending = Promise.resolve();

  function toEvent(level, args) {
    const error = args.find((a) => a instanceof Error);
    const parts = args.map((a) => (a instanceof Error ? a.message : a));
    const message = util.format(...parts);
    const event = {
      '@t': new Date().toISOString(),
      '@l': level,
      '@m': message,
      Application: application,
    };
    if (environment) event.Environment = environment;
    // De bestaande logregels beginnen met een tag als "[billing]" of "[jobs:room-cleanup]".
    const tag = /^\[([^\]]+)\]/.exec(message);
    if (tag) event.Component = tag[1];
    // Regels van shared/logger.js dragen hun velden mee als losse properties.
    const fields = currentLogFields();
    if (fields) {
      for (const [key, value] of Object.entries(fields)) {
        if (!(key in event)) event[key] = value;
      }
    }
    if (error && error.stack) event['@x'] = error.stack;
    return event;
  }

  function enqueue(event) {
    queue.push(event);
    if (queue.length > maxQueue) {
      dropped += queue.length - maxQueue;
      queue = queue.slice(-maxQueue);
    }
    if (queue.length >= maxBatch) flush();
  }

  async function send(batch) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/vnd.serilog.clef',
          'X-Seq-ApiKey': apiKey,
        },
        body: batch.map((e) => JSON.stringify(e)).join('\n'),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (failing) {
        failing = false;
        original.info('[seq] Logging naar Seq werkt weer.');
      }
    } catch (err) {
      // Eén melding per storing, niet bij elke batch; via de originele console
      // zodat dit niet zelf weer naar Seq gaat.
      if (!failing) {
        failing = true;
        original.error(`[seq] Versturen naar Seq mislukt (${err.message}); events gaan verloren tot het weer werkt.`);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  function flush() {
    if (dropped > 0) {
      queue.unshift(toEvent('Warning', [`[seq] ${dropped} logregels weggegooid: wachtrij vol`]));
      dropped = 0;
    }
    while (queue.length > 0) {
      const batch = queue.splice(0, maxBatch);
      sending = sending.then(() => send(batch));
    }
    return sending;
  }

  for (const [method, level] of Object.entries(LEVELS)) {
    replaced[method] = target[method];
    original[method] = target[method].bind(target);
    target[method] = (...args) => {
      original[method](...args);
      try {
        enqueue(toEvent(level, args));
      } catch {
        // Logging mag de applicatie nooit laten falen.
      }
    };
  }

  const timer = setInterval(flush, flushIntervalMs);
  timer.unref();

  function uninstall() {
    clearInterval(timer);
    for (const method of Object.keys(LEVELS)) target[method] = replaced[method];
  }

  original.info(`[seq] Logging naar ${endpoint} staat aan (Application=${application}${environment ? `, Environment=${environment}` : ''}).`);
  return { enabled: true, flush, uninstall };
}

module.exports = { installSeqLogging };
