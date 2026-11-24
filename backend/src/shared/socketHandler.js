// Safety net for socket.io event handlers.
//
// Socket.io does not catch exceptions thrown inside listeners: a sync throw
// escapes into the event emitter and an async rejection becomes an
// unhandled rejection. Every handler is therefore registered through `on()`,
// which normalises the payload to a plain object and logs (instead of
// propagating) any error.

const { createLogger } = require('./logger');

const log = createLogger('socket');

function asPayload(raw) {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

// Returns a trimmed string (max `maxLength` chars) or '' for anything else.
function str(value, maxLength = 200) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function on(socket, event, handler, { onError } = {}) {
  socket.on(event, (raw) => {
    const report = (err) => {
      log.error('Fout in socket-handler', { event, socket: socket.id, room: socket.data?.roomId || undefined }, err);
      if (onError) {
        try { onError(err); } catch { /* never let the error hook throw */ }
      }
    };
    try {
      const result = handler(asPayload(raw));
      if (result && typeof result.catch === 'function') result.catch(report);
    } catch (err) {
      report(err);
    }
  });
}

module.exports = { on, asPayload, str };
