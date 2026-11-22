// Room header: editable room name, room code, share/invite popover and
// the banners under it.

import { state, ROOM_ID, $ } from './state.js';
import { socket } from './socket.js';
import { t, getCurrentUser } from './globals.js';

export function renderHeader(room) {
  $('roomNameDisplay').textContent = room.name;
  $('roomCodeDisplay').textContent = room.id;
  $('methodBadge').textContent = room.methodLabel;
  document.title = `${room.name} — Scrum Fight`;
}

export function setRoomName(name) {
  if (state.room) state.room.name = name;
  $('roomNameDisplay').textContent = name;
  document.title = `${name} — Scrum Fight`;
}

function wireRoomNameEditor() {
  const display = $('roomNameDisplay');
  const input = $('roomNameInput');
  const editBtn = $('editNameBtn');

  editBtn.addEventListener('click', () => {
    input.value = state.room?.name || '';
    display.classList.add('hidden');
    editBtn.classList.add('hidden');
    input.classList.remove('hidden');
    input.focus();
    input.select();
  });

  input.addEventListener('blur', () => {
    const newName = input.value.trim();
    display.classList.remove('hidden');
    editBtn.classList.remove('hidden');
    input.classList.add('hidden');
    if (newName && newName !== state.room?.name) socket.emit('update-room-name', { name: newName });
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') {
      input.value = state.room?.name || '';
      input.blur();
    }
  });
}

function wireCopyCode() {
  const btn = $('copyCodeBtn');
  btn.addEventListener('click', () => {
    navigator.clipboard.writeText($('roomCodeDisplay').textContent).catch(() => {});
    btn.textContent = '✅';
    setTimeout(() => { btn.textContent = '📋'; }, 1500);
  });
}

function wireSharePopover() {
  const shareBtn = $('shareBtn');
  const popover = $('sharePopover');
  const url = $('shareUrl');

  shareBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelector('profile-menu')?.close();
    url.value = `${location.origin}/room.html?id=${ROOM_ID}&join=1`;
    popover.classList.toggle('hidden');
    if (!popover.classList.contains('hidden')) url.select();
  });

  $('sharePopoverCopyBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(url.value).catch(() => {});
    const msg = $('shareCopiedMsg');
    msg.textContent = t('room.share.copied');
    msg.classList.remove('hidden');
    setTimeout(() => msg.classList.add('hidden'), 2000);
  });

  document.addEventListener('click', (e) => {
    if (!popover.classList.contains('hidden') && !popover.contains(e.target) && e.target !== shareBtn) {
      popover.classList.add('hidden');
    }
  });
}

export function wireHeader() {
  wireRoomNameEditor();
  wireCopyCode();
  wireSharePopover();
}

// Ads are hidden for paying plans.
export function initAdBanner() {
  const plan = getCurrentUser()?.plan;
  $('adBanner').classList.toggle('hidden', plan === 'pro' || plan === 'premium');
}

// Shown once after creating a room beyond the plan limit (set by the creating page).
export function initPlanLimitBanner() {
  const warning = sessionStorage.getItem('planLimitWarning');
  if (!warning) return;
  sessionStorage.removeItem('planLimitWarning');
  $('planLimitMsg').textContent = `${warning} `;
  const banner = $('planLimitBanner');
  banner.classList.remove('hidden');
  $('planLimitClose').addEventListener('click', () => banner.classList.add('hidden'));
}
