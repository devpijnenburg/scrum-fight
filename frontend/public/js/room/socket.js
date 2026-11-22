// The one socket.io connection of the room page. The socket.io client is
// served by the backend as a classic script (/socket.io/socket.io.js),
// which defines window.io before this module runs.
//
// autoConnect is off: events.js connects once every handler is registered,
// so the first 'connect' (which triggers joining the room) is never missed
// while other modules are still loading.
export const socket = window.io({ autoConnect: false });
