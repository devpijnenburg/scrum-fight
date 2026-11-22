// In-process domain events.
//
// Lets a domain announce that something happened without knowing who
// listens — e.g. the rooms domain emits `room.claimed` and the realtime
// layer pushes it to connected clients. Keeps domains free of socket.io.

const { EventEmitter } = require('events');

const domainEvents = new EventEmitter();

// A failing listener must never break the code that emitted the event.
function on(event, listener) {
  domainEvents.on(event, (...args) => {
    try {
      const result = listener(...args);
      if (result && typeof result.catch === 'function') {
        result.catch((err) => console.error(`[events] Listener for "${event}" failed:`, err));
      }
    } catch (err) {
      console.error(`[events] Listener for "${event}" failed:`, err);
    }
  });
}

function emit(event, payload) {
  domainEvents.emit(event, payload);
}

function removeAllListeners() {
  domainEvents.removeAllListeners();
}

const ROOM_CLAIMED = 'room.claimed';
const ROOM_DELETED = 'room.deleted';

module.exports = { on, emit, removeAllListeners, ROOM_CLAIMED, ROOM_DELETED };
