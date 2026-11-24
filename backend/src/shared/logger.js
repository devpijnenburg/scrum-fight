// Gestructureerde logging voor de backend.
//
//   const log = createLogger('rooms');
//   log.info('Kamer aangemaakt', { room: 'K7M2QX', type: 'guest', method: 'fibonacci' });
//
// geeft op stdout één nette regel:
//
//   [rooms] Kamer aangemaakt  room=K7M2QX type=guest method=fibonacci
//
// De regel gaat via console.* naar buiten, zodat `docker logs`, de workflow
// "Backend logs" en de Seq-koppeling (shared/seqLogging.js) hem gewoon oppakken.
// Seq krijgt de velden daarnaast als losse properties, zodat je erop kunt
// filteren (bv. `room = 'K7M2QX'`).
//
// Niveaus: debug < info < warn < error. LOG_LEVEL bepaalt vanaf welk niveau er
// gelogd wordt (standaard `info`; in de tests `warn`, zodat de uitvoer rustig blijft).

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const CONSOLE_METHOD = { debug: 'log', info: 'info', warn: 'warn', error: 'error' };

function thresholdFrom(env = process.env) {
  const wanted = String(env.LOG_LEVEL || '').toLowerCase();
  if (LEVELS[wanted]) return LEVELS[wanted];
  return env.NODE_ENV === 'test' ? LEVELS.warn : LEVELS.info;
}

let threshold = thresholdFrom();

// Velden van de regel die nu gelogd wordt; seqLogging leest ze uit terwijl
// console.* (synchroon) wordt aangeroepen.
let currentFields = null;

function currentLogFields() {
  return currentFields;
}

function formatValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    return value === '' || /[\s"=]/.test(value) ? JSON.stringify(value) : value;
  }
  if (value !== null && typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// "key=value key2="met spaties"" — velden die undefined zijn worden weggelaten.
function formatFields(fields) {
  return Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${formatValue(v)}`)
    .join(' ');
}

function formatLine(component, message, fields) {
  const tail = fields ? formatFields(fields) : '';
  return `[${component}] ${message}${tail ? `  ${tail}` : ''}`;
}

function write(level, component, message, fields, error, target = console) {
  if (LEVELS[level] < threshold) return;
  const clean = fields
    ? Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined))
    : null;
  const line = formatLine(component, message, clean);
  const args = error ? [line, error] : [line];
  currentFields = clean;
  try {
    target[CONSOLE_METHOD[level]](...args);
  } finally {
    currentFields = null;
  }
}

// Een logger per component. Het laatste argument mag een Error zijn; die wordt
// met stacktrace gelogd: log.error('Opslaan mislukt', { room }, err)
function createLogger(component, { target } = {}) {
  const logger = {};
  for (const level of Object.keys(LEVELS)) {
    logger[level] = (message, fields, error) => {
      if (fields instanceof Error) [fields, error] = [undefined, fields];
      write(level, component, message, fields, error, target);
    };
  }
  logger.child = (sub) => createLogger(`${component}:${sub}`, { target });
  return logger;
}

function setLogLevel(level) {
  if (LEVELS[level]) threshold = LEVELS[level];
}

function resetLogLevel() {
  threshold = thresholdFrom();
}

module.exports = {
  createLogger,
  currentLogFields,
  formatLine,
  setLogLevel,
  resetLogLevel,
  LEVELS,
};
