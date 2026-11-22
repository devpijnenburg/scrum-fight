// Rooms: creation, listing, claiming and deletion, including plan limits.

const { randomInt } = require('crypto');
const roomRepository = require('./roomRepository');
const users = require('../identity/userRepository');
const { PLAN_LIMITS, VALID_METHODS } = require('../billing/plans');
const events = require('../../shared/events');
const { badRequest, forbidden, notFound, conflict } = require('../../shared/errors');

const ROOM_ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_ID_LENGTH = 6;
const MAX_ROOM_NAME = 100;

const normalizeRoomId = (id) => String(id || '').toUpperCase().trim();

function generateRoomId() {
  let id = '';
  for (let i = 0; i < ROOM_ID_LENGTH; i++) id += ROOM_ID_CHARS[randomInt(ROOM_ID_CHARS.length)];
  return id;
}

async function generateUniqueRoomId() {
  for (let i = 0; i < 10; i++) {
    const id = generateRoomId();
    if (!(await roomRepository.roomIdExists(id))) return id;
  }
  throw new Error('Kon geen unieke kamer-ID genereren');
}

function maxRoomsForPlan(plan) {
  return PLAN_LIMITS[plan]?.maxRooms ?? PLAN_LIMITS.free.maxRooms;
}

async function hasReachedRoomLimit(userId, plan) {
  const maxRooms = maxRoomsForPlan(plan);
  if (maxRooms === Infinity) return false;
  return (await roomRepository.countOwnedRooms(userId)) >= maxRooms;
}

function roomLimitMessage(plan) {
  return `Maximaal aantal kamers bereikt voor het ${plan}-plan (${maxRoomsForPlan(plan)}).`;
}

// Creates a room for a guest or an authenticated user.
// Guests always get a temporary (is_guest) room; authenticated users get a
// saved room unless their plan limit is reached, in which case a temporary
// room is created instead and the response carries
//   planLimit: { code: 'ROOM_LIMIT_REACHED', plan, max }  (translated by the client)
//   planLimitWarning: '<Dutch text>'                        (fallback for older clients)
async function createRoom(user, { name, method }) {
  const trimmedName = typeof name === 'string' ? name.trim().slice(0, MAX_ROOM_NAME) : '';
  if (!trimmedName) throw badRequest('ROOM_NAME_REQUIRED', 'Kamernaam is verplicht');
  if (!VALID_METHODS.includes(method)) throw badRequest('INVALID_METHOD', 'Ongeldige schattingsmethode');

  let ownerId = null;
  let isGuest = true;
  let planLimit = null;

  if (user) {
    const plan = user.plan || 'free';
    if (await hasReachedRoomLimit(user.id, plan)) {
      planLimit = { code: 'ROOM_LIMIT_REACHED', plan, max: maxRoomsForPlan(plan) };
    } else {
      ownerId = user.id;
      isGuest = false;
    }
  }

  const id = await generateUniqueRoomId();
  const room = await roomRepository.insertRoom({ id, name: trimmedName, ownerId, method, isGuest });
  if (planLimit) {
    room.planLimit = planLimit;
    room.planLimitWarning = roomLimitMessage(planLimit.plan);
  }
  return room;
}

// Saved rooms of a user, newest activity first. Rooms beyond the current
// plan limit (e.g. after a downgrade) are flagged over_limit.
async function listRooms(userId) {
  // Plan is read from the DB — the JWT may be stale after an admin change.
  const plan = await users.getPlan(userId);
  const maxRooms = maxRoomsForPlan(plan);
  const rows = await roomRepository.listOwnedRooms(userId);
  return {
    rooms: rows.map((r, i) => ({ ...r, over_limit: maxRooms !== Infinity && i >= maxRooms })),
    maxRooms: maxRooms === Infinity ? null : maxRooms,
  };
}

async function getRoom(id) {
  const room = await roomRepository.findRoomById(normalizeRoomId(id));
  if (!room) throw notFound('ROOM_NOT_FOUND', 'Kamer niet gevonden');
  return { id: room.id, name: room.name, method: room.method, is_guest: room.is_guest };
}

async function getHistory(id) {
  return roomRepository.getRoundHistory(normalizeRoomId(id));
}

// Converts an ownerless guest room into a permanent room owned by the user,
// subject to their plan's room limit.
async function claimRoom(user, id) {
  const roomId = normalizeRoomId(id);
  const plan = user.plan || 'free';

  if (await hasReachedRoomLimit(user.id, plan)) {
    throw forbidden('ROOM_LIMIT_REACHED', roomLimitMessage(plan), { plan, max: maxRoomsForPlan(plan) });
  }
  const room = await roomRepository.claimRoom(roomId, user.id);
  if (!room) {
    throw conflict('ROOM_NOT_CLAIMABLE', 'Kamer kan niet geclaimd worden (bestaat niet meer of is al permanent)');
  }
  events.emit(events.ROOM_CLAIMED, { roomId });
  return room;
}

async function deleteRoom(user, id) {
  const roomId = normalizeRoomId(id);
  if (!(await roomRepository.deleteOwnedRoom(roomId, user.id))) {
    throw notFound('ROOM_NOT_FOUND_OR_FORBIDDEN', 'Kamer niet gevonden of geen toegang');
  }
  events.emit(events.ROOM_DELETED, { roomId });
}

module.exports = {
  generateUniqueRoomId,
  maxRoomsForPlan,
  hasReachedRoomLimit,
  roomLimitMessage,
  createRoom,
  listRooms,
  getRoom,
  getHistory,
  claimRoom,
  deleteRoom,
};
