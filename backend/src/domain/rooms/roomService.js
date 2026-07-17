const roomRepository = require('./roomRepository');
const { PLAN_LIMITS } = require('../../config/plans');

const ROOM_ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_ID_LENGTH = 6;

function generateRoomId() {
  let id = '';
  for (let i = 0; i < ROOM_ID_LENGTH; i++) {
    id += ROOM_ID_CHARS[Math.floor(Math.random() * ROOM_ID_CHARS.length)];
  }
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
// room is created instead and a warning is attached.
async function createRoom(user, { name, method }) {
  let ownerId = null;
  let isGuest = true;
  let planLimitWarning = null;

  if (user) {
    const plan = user.plan || 'free';
    if (await hasReachedRoomLimit(user.id, plan)) {
      planLimitWarning = roomLimitMessage(plan);
    } else {
      ownerId = user.id;
      isGuest = false;
    }
  }

  const id = await generateUniqueRoomId();
  const room = await roomRepository.insertRoom({ id, name, ownerId, method, isGuest });
  if (planLimitWarning) room.planLimitWarning = planLimitWarning;
  return room;
}

module.exports = {
  generateUniqueRoomId,
  maxRoomsForPlan,
  hasReachedRoomLimit,
  roomLimitMessage,
  createRoom,
};
