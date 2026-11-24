// /api/client-errors — fouten uit de browser (frontend/public/js/core/errorReporter.js).
//
// De browser stuurt onafgevangen fouten en promise-rejections hierheen, zodat
// ze naast de serverlogs in docker logs en Seq staan. Alles wat binnenkomt is
// onbetrouwbare invoer: velden worden afgekapt, de querystring van URL's
// verdwijnt en per IP geldt een rate limit.

const express = require('express');
const { rateLimit } = require('../../shared/rateLimit');
const { optionalAuth } = require('../identity/middleware');
const { createLogger } = require('../../shared/logger');

const log = createLogger('browser');
const router = express.Router();
const MINUTE = 60 * 1000;

const limiter = rateLimit({ name: 'client-errors', windowMs: 15 * MINUTE, max: 30 });

const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : undefined);
const int = (value) => (Number.isInteger(value) && value >= 0 ? value : undefined);
// Pad of URL zonder querystring en fragment (daar kunnen tokens in staan).
const withoutQuery = (value, max) => text(value, max)?.split(/[?#]/)[0] || undefined;

// Stacktraces bevatten URL's van de eigen scripts, mét ?v=-hash; die halen we
// weg zodat dezelfde fout na een deploy nog op dezelfde manier oogt.
const cleanStack = (stack) => text(stack, 4000)?.replace(/\?v=[\w-]+/g, '');

router.post('/', limiter, optionalAuth, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const message = text(body.message, 500) || '(geen foutmelding)';
  const kind = body.kind === 'unhandledrejection' ? 'unhandledrejection' : 'error';

  const err = new Error(message);
  err.name = 'BrowserError';
  err.stack = cleanStack(body.stack) || `BrowserError: ${message}`;

  log.warn('Fout in de browser', {
    kind,
    page: withoutQuery(body.page, 200),
    source: withoutQuery(body.source, 300),
    line: int(body.line),
    column: int(body.column),
    browser: text(body.browser, 200),
    user: req.user?.id,
  }, err);
  res.status(204).end();
});

module.exports = router;
