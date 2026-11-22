// Room connection status: reconnect banner and blocking game actions offline.
import { jest } from '@jest/globals';

const handlers = {};
const socket = {
  connected: true,
  emit: jest.fn(),
  connect: jest.fn(),
  on: (event, fn) => { handlers[event] = fn; },
};
jest.unstable_mockModule('../public/js/room/socket.js', () => ({ socket }));

document.body.innerHTML = `
  <div id="connectionBanner" class="hidden"><small id="connectionHint" class="hidden"></small></div>`;

const { state } = await import('../public/js/room/state.js');
const { send, isOnline, markOnline, wireConnectionStatus, stopConnectionStatus } = await import('../public/js/room/connection.js');
wireConnectionStatus();

const banner = () => document.getElementById('connectionBanner');
const hint = () => document.getElementById('connectionHint');
const offlineClass = () => document.body.classList.contains('room-offline');

beforeEach(() => {
  jest.useFakeTimers();
  socket.connected = true;
  socket.emit.mockClear();
  socket.connect.mockClear();
  markOnline();
});
afterEach(() => jest.useRealTimers());

test('online: game actions are sent', () => {
  expect(isOnline()).toBe(true);
  expect(send('vote', { value: '5' })).toBe(true);
  expect(socket.emit).toHaveBeenCalledWith('vote', { value: '5' });
});

test('after a disconnect actions are blocked right away, the banner shows after a second', () => {
  socket.connected = false;
  handlers.disconnect('transport close');

  expect(send('vote', { value: '5' })).toBe(false);
  expect(socket.emit).not.toHaveBeenCalled();
  expect(banner().classList.contains('hidden')).toBe(true); // no flash for short blips

  jest.advanceTimersByTime(1000);
  expect(banner().classList.contains('hidden')).toBe(false);
  expect(offlineClass()).toBe(true);
  expect(hint().classList.contains('hidden')).toBe(true);

  jest.advanceTimersByTime(14000);
  expect(hint().classList.contains('hidden')).toBe(false);
});

test('a short blip that recovers within a second never shows the banner', () => {
  socket.connected = false;
  handlers.disconnect('transport close');
  jest.advanceTimersByTime(500);
  socket.connected = true;
  markOnline(); // room-state arrived again
  jest.advanceTimersByTime(5000);
  expect(banner().classList.contains('hidden')).toBe(true);
  expect(offlineClass()).toBe(false);
});

test('being connected is not enough: actions wait for the rejoin (room-state)', () => {
  socket.connected = false;
  handlers.disconnect('transport close');
  socket.connected = true; // reconnected, join-room not answered yet
  expect(send('reveal')).toBe(false);
  markOnline();
  expect(send('reveal')).toBe(true);
  expect(banner().classList.contains('hidden')).toBe(true);
  expect(state.joined).toBe(true);
});

test('reconnects manually after a server-initiated disconnect (deploy shutdown)', () => {
  socket.connected = false;
  handlers.disconnect('io server disconnect');
  jest.advanceTimersByTime(1000);
  expect(socket.connect).toHaveBeenCalledTimes(1);
});

test('a disconnect we started ourselves shows nothing', () => {
  socket.connected = false;
  handlers.disconnect('io client disconnect');
  jest.advanceTimersByTime(5000);
  expect(banner().classList.contains('hidden')).toBe(true);
});

test('when the page ends (room expired) the banner is hidden and actions stay blocked', () => {
  socket.connected = false;
  handlers.disconnect('transport close');
  jest.advanceTimersByTime(1000);
  stopConnectionStatus();
  expect(banner().classList.contains('hidden')).toBe(true);
  expect(send('vote', { value: '1' })).toBe(false);
});
