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
// filteren (bv. `room = 'K7M2QX'`), en een vast eventtype per soort regel
// (component + bericht), zodat je in Seq per soort kunt tellen en groeperen.
//
// Persoonsgegevens: log geen volledige e-mailadressen, gebruik maskEmail().
//
// Niveaus: debug < info < warn < error. LOG_LEVEL bepaalt vanaf welk niveau er
// gelogd wordt (standaard `info`; in de tests `error`, zodat de uitvoer rustig blijft).

const crypto = require('crypto');
const { currentContext } = require('./requestContext');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const CONSOLE_METHOD = { debug: 'log', info: 'info', warn: 'warn', error: 'error' };

function thresholdFrom(env = process.env) {
  const wanted = String(env.LOG_LEVEL || '').toLowerCase();
  if (LEVELS[wanted]) return LEVELS[wanted];
  return env.NODE_ENV === 'test' ? LEVELS.error : LEVELS.info;
}

let threshold = thresholdFrom();

// De regel die nu gelogd wordt; seqLogging leest hem uit terwijl console.*
// (synchroon) wordt aangeroepen. { component, message, fields, eventType }
let current = null;

function currentLogEvent() {
  return current;
}

// Stabiel eventtype (8 hex-tekens) per soort regel: hetzelfde component en
// bericht geven altijd hetzelfde type, ongeacht de velden.
const eventTypes = new Map();
function eventTypeOf(component, message) {
  const key = `${component}\u0000${message}`;
  let type = eventTypes.get(key);
  if (!type) {
    type = crypto.createHash('sha1').update(key).digest('hex').slice(0, 8);
    if (eventTypes.size < 5000) eventTypes.set(key, type);
  }
  return type;
}

// "jan.jansen@example.nl" → "j***@example.nl". Het domein blijft zichtbaar,
// zodat je een storing bij één mailprovider nog kunt herkennen.
function maskEmail(email) {
  if (typeof email !== 'string' || !email) return undefined;
  const at = email.lastIndexOf('@');
  if (at < 1) return '***';
  return `${email[0]}***${email.slice(at)}`;
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

function withoutKeys(context, fields) {
  if (!context) return null;
  if (!fields) return context;
  return Object.fromEntries(Object.entries(context).filter(([k]) => !(k in fields)));
}

function formatLine(component, message, fields) {
  const tail = fields ? formatFields(fields) : '';
  return `[${component}] ${message}${tail ? `  ${tail}` : ''}`;
}

function write(level, component, message, fields, error, target = console) {
  if (LEVELS[level] < threshold) return;
  // Velden van het lopende verzoek (req=…) komen achteraan, tenzij al gezet.
  const merged = { ...fields, ...withoutKeys(currentContext(), fields) };
  const entries = Object.entries(merged).filter(([, v]) => v !== undefined);
  const clean = entries.length ? Object.fromEntries(entries) : null;
  const line = formatLine(component, message, clean);
  const args = error ? [line, error] : [line];
  current = { component, message, fields: clean, eventType: eventTypeOf(component, message) };
  try {
    target[CONSOLE_METHOD[level]](...args);
  } finally {
    current = null;
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
  currentLogEvent,
  eventTypeOf,
  maskEmail,
  formatLine,
  setLogLevel,
  resetLogLevel,
  LEVELS,
};
