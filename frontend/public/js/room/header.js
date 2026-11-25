// Room header: editable room name, room code, share/invite popover and
// the banners under it.

import { state, ROOM_ID, $ } from './state.js';
import { send } from './connection.js';
import { t } from '../core/i18n.js';
import { errorText } from '../core/errors.js';
import { getCurrentUser } from '../core/auth.js';
import { planName, planShieldUrl } from '../core/plans.js';

export function renderHeader(room) {
  $('roomNameDisplay').textContent = room.name;
  $('roomCodeDisplay').textContent = room.id;
  $('methodBadge').textContent = room.methodLabel;
  document.title = `${room.name} — ScrumFight`;
  renderPlanBadge(room.ownerPlan);
}

// A room of a paying owner carries that plan's shield; free rooms and
// guest rooms show nothing.
function renderPlanBadge(ownerPlan) {
  const badge = $('roomPlanBadge');
  const paid = ownerPlan === 'pro' || ownerPlan === 'premium';
  badge.classList.toggle('hidden', !paid);
  if (!paid) return;
  const label = t('room.plan_badge', { plan: planName(ownerPlan) });
  badge.src = planShieldUrl(ownerPlan);
  badge.alt = label;
  badge.title = label;
  badge.dataset.plan = ownerPlan;
}

export function setRoomName(name) {
  if (state.room) state.room.name = name;
  $('roomNameDisplay').textContent = name;
  document.title = `${name} — ScrumFight`;
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
    if (newName && newName !== state.room?.name) send('update-room-name', { name: newName });
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

// Shown once after creating a room beyond the plan limit. The creating page
// stores the API's planLimit ({ code, plan, max }) in sessionStorage.
function takePlanLimitMessage() {
  const raw = sessionStorage.getItem('planLimit');
  sessionStorage.removeItem('planLimit');
  if (raw) {
    try {
      return errorText(JSON.parse(raw));
    } catch {
      // ignore malformed data
    }
  }
  // Older pages stored the backend's Dutch text directly.
  const legacy = sessionStorage.getItem('planLimitWarning');
  sessionStorage.removeItem('planLimitWarning');
  return legacy;
}

export function initPlanLimitBanner() {
  const message = takePlanLimitMessage();
  if (!message) return;
  $('planLimitMsg').textContent = `${message} `;
  const banner = $('planLimitBanner');
  banner.classList.remove('hidden');
  $('planLimitClose').addEventListener('click', () => banner.classList.add('hidden'));
}
