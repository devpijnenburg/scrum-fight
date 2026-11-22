// Who is playing: name resolution and joining, the name prompt, in-room
// login for guests and claiming a guest room after login.

import { state, ROOM_ID, PLAYER_KEY, FROM_JOIN_LINK, NAME_FROM_SESSION, $ } from './state.js';
import { socket } from './socket.js';
import { t } from '../core/i18n.js';
import { apiFetch } from '../core/api.js';
import { getCurrentUser } from '../core/auth.js';
import { openModal, closeModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import { showOverlay } from './overlays.js';

const profileMenu = () => document.querySelector('profile-menu');

export function setProfileName(name) {
  profileMenu()?.setName(name);
}

function joinAs(name, token = null) {
  state.myName = name;
  setProfileName(name);
  socket.emit('join-room', { roomId: ROOM_ID, playerName: name, token, playerKey: PLAYER_KEY });
}

// Called on every (re)connect. Order: account → name chosen earlier in this
// page → name from the landing page → remembered name → ask for a name.
export async function resolveAndJoin() {
  const user = getCurrentUser();
  if (user) return joinAs(user.name, localStorage.getItem('token'));
  if (state.myName) return joinAs(state.myName);
  if (NAME_FROM_SESSION) return joinAs(NAME_FROM_SESSION);

  const savedName = localStorage.getItem('userName') || '';
  if (savedName && !FROM_JOIN_LINK) return joinAs(savedName);

  try {
    const room = await apiFetch(`/rooms/${ROOM_ID}`);
    showNameModal(room.name, savedName);
  } catch {
    showOverlay('🚫', t('room.not_found'), t('room.not_found_msg'));
  }
}

// ── Name prompt ─────────────────────────────────────────────────────────────

function submitName() {
  const name = $('nameInput').value.trim();
  if (!name) {
    $('nameError').classList.remove('hidden');
    return;
  }
  closeModal('nameModal');
  localStorage.setItem('userName', name);
  joinAs(name);
}

export function showNameModal(roomName, prefillName = '') {
  const label = $('joinRoomLabel');
  if (roomName && label) {
    label.textContent = roomName;
    label.classList.remove('hidden');
  }
  const input = $('nameInput');
  if (prefillName) input.value = prefillName;
  openModal('nameModal', { focus: '#nameInput' });
  if (prefillName) input.select();
}

export function wireNameModal() {
  $('nameSubmitBtn').addEventListener('click', submitName);
  $('nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitName(); });
}

// ── Accounts ────────────────────────────────────────────────────────────────

// A logged-in user in a still-guest room silently claims it, converting it
// to a permanent room (subject to their plan's room limit) so it no longer
// expires after an hour of inactivity and its analytics history is kept.
export async function claimRoomIfLoggedIn() {
  if (!getCurrentUser()) return;
  try {
    await apiFetch(`/rooms/${ROOM_ID}/claim`, { method: 'POST' });
    if (state.room) state.room.isGuest = false;
    showToast(t('room.claimed'), { icon: '💾' });
  } catch {
    // Plan limit reached, room already claimed by someone else, etc. — non-critical.
  }
}

function onLoggedIn(user) {
  closeModal('roomAuthModal');
  setProfileName(user?.name || getCurrentUser()?.name || '');
  profileMenu()?.refresh();
  $('footerAuth')?.classList.add('hidden');
  if (state.room?.isGuest) claimRoomIfLoggedIn();
}

export function initRoomAuth() {
  const user = getCurrentUser();
  if (user) {
    setProfileName(user.name);
    profileMenu()?.refresh();
    return;
  }

  // Guest: the profile menu asks for the in-room auth modal.
  const panel = document.querySelector('#roomAuthModal sf-auth-panel');
  document.addEventListener('profile-auth-request', () => {
    openModal('roomAuthModal');
    panel.focusFirstField();
  });
  panel.addEventListener('auth-success', (e) => onLoggedIn(e.detail.user));
}
