// Minimal in-memory fixed-window rate limiter (single backend instance).
// Keyed by client IP + limiter name; requires `app.set('trust proxy', …)`
// when running behind nginx so `req.ip` is the real client address.

const { createLogger } = require('./logger');

const log = createLogger('rate-limit');

function rateLimit({ name, windowMs, max, message = 'Te veel verzoeken, probeer het later opnieuw' }) {
  const hits = new Map(); // key → { count, resetAt }

  // Periodically drop expired windows so the map cannot grow unbounded.
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }, windowMs);
  sweeper.unref();

  function middleware(req, res, next) {
    const key = `${name}:${req.ip}`;
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    if (entry.count > max) {
      // Eén logregel per IP en venster, niet bij elk geweigerd verzoek.
      if (!entry.logged) {
        entry.logged = true;
        log.warn('Te veel verzoeken, verzoeken worden geweigerd', {
          limiter: name, ip: req.ip, max, windowMinutes: Math.round(windowMs / 60000),
        });
      }
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ error: message, code: 'RATE_LIMITED' });
    }
    next();
  }

  middleware.reset = () => hits.clear();
  return middleware;
}

module.exports = { rateLimit };
