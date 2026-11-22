// Domain errors with a stable, machine-readable code.
//
// Services throw AppError; the central error handler turns it into
//   { error: <Dutch fallback message>, code: <CODE>, ...details }
// The frontend translates `code` (see i18n `errors.<CODE>`) and falls back
// to `error` for codes it does not know yet.

class AppError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (code, message, details) => new AppError(400, code, message, details);
const unauthorized = (code, message, details) => new AppError(401, code, message, details);
const forbidden = (code, message, details) => new AppError(403, code, message, details);
const notFound = (code, message, details) => new AppError(404, code, message, details);
const conflict = (code, message, details) => new AppError(409, code, message, details);
const notImplemented = (code, message, details) => new AppError(501, code, message, details);

// Postgres unique_violation
const isUniqueViolation = (err) => err?.code === '23505';

// Express error middleware. Express 5 forwards rejected promises from async
// handlers here, so routes can simply throw.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  if (res.headersSent) return;

  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, code: err.code, ...err.details });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Ongeldige JSON', code: 'INVALID_JSON' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Verzoek te groot', code: 'PAYLOAD_TOO_LARGE' });
  }

  console.error(`[http] ${req.method} ${req.originalUrl} failed:`, err);
  res.status(500).json({ error: 'Serverfout', code: 'SERVER_ERROR' });
}

module.exports = {
  AppError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  notImplemented,
  isUniqueViolation,
  errorHandler,
};
