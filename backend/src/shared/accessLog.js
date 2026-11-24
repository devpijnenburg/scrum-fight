// Eén logregel per HTTP-verzoek: methode, pad (zonder querystring), status en
// duur. Zo zie je trage of falende endpoints zonder dat er een fout gegooid
// hoeft te worden. Registreren na requestContext, zodat de regel req=… krijgt.
//
// Niveau: 5xx → warn (de fout zelf logt de errorhandler), de health-check →
// debug (die wordt elke paar seconden aangeroepen), de rest → info.

const { createLogger } = require('./logger');

const log = createLogger('http');
const QUIET_PATHS = new Set(['/api/health']);

function levelFor(status, path) {
  if (status >= 500) return 'warn';
  if (QUIET_PATHS.has(path)) return 'debug';
  return 'info';
}

function accessLog(req, res, next) {
  const started = process.hrtime.bigint();
  const path = req.originalUrl.split('?')[0];

  res.on('close', () => {
    const ms = Number((process.hrtime.bigint() - started) / 1000n) / 1000;
    const aborted = !res.writableFinished;
    const status = aborted ? undefined : res.statusCode;
    const level = aborted ? 'info' : levelFor(status, path);
    log[level](aborted ? 'Request afgebroken door de client' : 'Request afgehandeld', {
      method: req.method,
      path,
      status,
      ms: Math.round(ms * 10) / 10,
      user: req.user?.id,
    });
  });
  next();
}

module.exports = { accessLog, levelFor };
