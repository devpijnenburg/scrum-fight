// Visual feedback: floating emoji reactions and badge celebrations.

import { $ } from './state.js';
import { t, getLang } from '../core/i18n.js';
import { escapeHtml } from '../core/html.js';
import { findBadge, shieldSvg } from '../core/badges.js';
import { showToast } from '../ui/toast.js';
import { prependHistoryNote } from './analytics.js';

const REACTION_LIFETIME_MS = 2200;
const CELEBRATION_MS = 7000;
const CONFETTI_COLORS = ['#f5c97a', '#c47b2b', '#5ec5f2', '#d97706', '#22c55e', '#8b5cf6', '#ec4899', '#f59e0b'];

export function spawnFloatingEmoji(emoji, name) {
  const area = document.querySelector('.table-area');
  if (!area) return;
  const el = document.createElement('div');
  el.className = 'floating-reaction';
  el.textContent = emoji;
  el.title = name;
  el.style.left = `${15 + Math.random() * 70}%`;
  area.appendChild(el);
  setTimeout(() => el.remove(), REACTION_LIFETIME_MS);
}

function badgeName(badge, fallback) {
  if (!badge) return fallback;
  const lang = getLang();
  return badge.name[lang] || badge.name.en || badge.name.nl || fallback;
}

let celebrationTimer = null;

// Full-screen celebration for a badge the current player just earned.
export function showBadgeCelebration(badgeId) {
  const overlay = $('badgeCelebration');
  if (!overlay) return;
  const badge = findBadge(badgeId);

  $('celebrationShield').innerHTML = badge ? shieldSvg(badge.tier, badge.icon, true, 1) : '';
  $('celebrationName').textContent = badgeName(badge, badgeId);
  $('celebrationUnlocked').textContent = t('stats.badge_unlocked');

  const confetti = $('celebrationConfetti');
  confetti.innerHTML = '';
  for (let i = 0; i < 40; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-particle';
    p.style.left = `${Math.random() * 100}%`;
    p.style.animationDelay = `${Math.random() * 1.2}s`;
    p.style.animationDuration = `${1.5 + Math.random() * 1.5}s`;
    p.style.background = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    confetti.appendChild(p);
  }

  const dismiss = () => {
    clearTimeout(celebrationTimer);
    overlay.classList.add('hidden');
  };
  clearTimeout(celebrationTimer);
  overlay.classList.remove('hidden');
  celebrationTimer = setTimeout(dismiss, CELEBRATION_MS);
  $('celebrationClose').onclick = dismiss;
  overlay.onclick = (e) => { if (e.target === overlay) dismiss(); };
}

// Another player earned a badge: note it in the history and show a toast.
export function announceBadge(playerName, badgeId) {
  const name = badgeName(findBadge(badgeId), badgeId);
  const html = `<strong>${escapeHtml(playerName)}</strong> ${escapeHtml(t('room.badge.announced'))} <em>${escapeHtml(name)}</em>`;

  const note = document.createElement('div');
  note.className = 'badge-timeline-item fade-in';
  note.innerHTML = `<span class="badge-timeline-icon">🏅</span><span class="badge-timeline-text">${html}</span>`;
  prependHistoryNote(note);

  showToast('', { icon: '🏅', variant: 'gold', html });
}
