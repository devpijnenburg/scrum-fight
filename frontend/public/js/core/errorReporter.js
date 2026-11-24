// Stuurt onafgevangen fouten in de browser naar de backend (/api/client-errors),
// zodat ze in docker logs en Seq naast de serverlogs staan.
//
// Elke pagina-entry importeert deze module als eerste. Ze heeft bewust geen
// imports: als een andere module stukgaat, moet deze nog werken.
//
// Ruis blijft weg: per pagina-load hooguit MAX_REPORTS meldingen, dezelfde fout
// maar één keer, en fouten uit browserextensies of scripts van een ander domein
// (die de browser alleen als "Script error." doorgeeft) worden genegeerd.

const ENDPOINT = '/api/client-errors';
const MAX_REPORTS = 5;

const seen = new Set();
let sent = 0;

// Alleen fouten uit onze eigen scripts (of zonder bron, zoals rejections).
export function isOwnSource(source, origin = location.origin) {
  if (!source) return true;
  return source.startsWith(origin);
}

export function shouldReport(report, origin = location.origin) {
  if (sent >= MAX_REPORTS) return false;
  if (!report.message || /^Script error\.?$/i.test(report.message)) return false;
  if (!isOwnSource(report.source, origin)) return false;
  const key = `${report.kind}|${report.message}|${report.source}|${report.line}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}

export function reportFromError(event) {
  const error = event.error;
  return {
    kind: 'error',
    message: String(error?.message || event.message || '').slice(0, 500),
    source: event.filename || undefined,
    line: event.lineno || undefined,
    column: event.colno || undefined,
    stack: typeof error?.stack === 'string' ? error.stack.slice(0, 4000) : undefined,
  };
}

export function reportFromRejection(event) {
  const reason = event.reason;
  const message = reason instanceof Error ? reason.message : (() => {
    try {
      return typeof reason === 'string' ? reason : JSON.stringify(reason);
    } catch {
      return String(reason);
    }
  })();
  return {
    kind: 'unhandledrejection',
    message: String(message || '').slice(0, 500),
    stack: typeof reason?.stack === 'string' ? reason.stack.slice(0, 4000) : undefined,
  };
}

function token() {
  try {
    return localStorage.getItem('token');
  } catch {
    return null;
  }
}

export function send(report) {
  const body = JSON.stringify({
    ...report,
    page: location.pathname,
    browser: navigator.userAgent.slice(0, 200),
  });
  const headers = { 'Content-Type': 'application/json' };
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;
  sent += 1;
  // keepalive: de melding komt ook aan als de pagina net wordt verlaten.
  return fetch(ENDPOINT, { method: 'POST', headers, body, keepalive: true }).catch(() => {});
}

function handle(report) {
  try {
    if (shouldReport(report)) send(report);
  } catch {
    // Het melden van een fout mag zelf nooit een fout veroorzaken.
  }
}

// Alleen voor tests.
export function resetForTests() {
  seen.clear();
  sent = 0;
}

if (typeof window !== 'undefined' && !window.__sfErrorReporter) {
  window.__sfErrorReporter = true;
  window.addEventListener('error', (event) => {
    // Een kapotte <img> of <script> geeft ook een 'error'-event, zonder message.
    if (!event.message && !event.error) return;
    handle(reportFromError(event));
  });
  window.addEventListener('unhandledrejection', (event) => handle(reportFromRejection(event)));
}
