// The analytics side panel (current round stats + round history), the
// inline consensus badge and the mood-based reaction buttons.

import { ROOM_ID, $ } from './state.js';
import { t } from '../core/i18n.js';
import { apiFetch } from '../core/api.js';
import { escapeHtml } from '../core/html.js';
import { loadSettings } from '../core/settings.js';
import { consensusLevel, consensusLevelFromVotes, consensusLabelKey, reactionsFor } from './consensus.js';

const consensusText = (level) => (level === 'neutral' ? '' : t(consensusLabelKey(level)));

// ── Panel ───────────────────────────────────────────────────────────────────

export function isAnalyticsOpen() {
  return !$('analyticsPanel').classList.contains('hidden');
}

export function openAnalyticsPanel() {
  $('analyticsPanel').classList.remove('hidden');
  $('analyticsTab').classList.add('panel-open');
}

export function closeAnalyticsPanel() {
  $('analyticsPanel').classList.add('hidden');
  $('analyticsTab').classList.remove('panel-open');
}

// Opens the panel after a reveal unless the user turned that off.
export function autoOpenAnalytics() {
  if (loadSettings().analyticsAutoOpen !== false) openAnalyticsPanel();
}

export function wireAnalyticsPanel() {
  $('analyticsTab').addEventListener('click', () => {
    if (isAnalyticsOpen()) closeAnalyticsPanel();
    else openAnalyticsPanel();
  });
  $('analyticsPanelCloseBtn').addEventListener('click', closeAnalyticsPanel);
  document.querySelector('.analytics-panel-close-mobile')?.addEventListener('click', closeAnalyticsPanel);
}

// ── History ─────────────────────────────────────────────────────────────────

function formatRelativeTime(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return t('room.analytics.just_now');
  if (mins < 60) return t('room.analytics.mins_ago', { n: mins });
  return t('room.analytics.hrs_ago', { n: Math.floor(mins / 60) });
}

function consensusBadgeHtml(level) {
  if (level === 'neutral') return '';
  return `<span class="consensus-badge-sm consensus-badge-sm-${level}">${consensusText(level)}</span>`;
}

function buildHistoryRoundEl(votes, stats, createdAt, roundNum, roundName) {
  const level = stats ? consensusLevel(stats) : consensusLevelFromVotes(votes);
  const nameHtml = roundName ? `<span class="history-round-name">${escapeHtml(roundName)}</span>` : '';
  const voteItems = Object.entries(votes || {})
    .map(([name, vote]) => `<span class="history-vote"><strong>${escapeHtml(name)}</strong> ${escapeHtml(vote || '–')}</span>`)
    .join('');

  const el = document.createElement('div');
  el.className = 'history-round fade-in';
  el.innerHTML = `
    <div class="history-round-hd">
      <span class="history-round-num">#${roundNum}</span>
      ${nameHtml}
      ${consensusBadgeHtml(level)}
      <span class="history-round-time">${formatRelativeTime(createdAt)}</span>
    </div>
    <div class="history-round-votes">${voteItems}</div>
  `;
  return el;
}

// Replaces the round history with what the server has. Called on every
// (re)join, so rounds played while this tab was offline show up as well.
let historyRequest = 0;
export async function syncHistory() {
  const request = ++historyRequest;
  try {
    const rows = await apiFetch(`/rooms/${ROOM_ID}/history`, { method: 'GET' });
    if (request !== historyRequest) return; // a newer sync is on its way
    const list = $('analyticsHistoryList');
    list.querySelectorAll('.history-round').forEach((el) => el.remove());
    const hasNotes = list.children.length > 0;
    $('analyticsHistoryEmpty').classList.toggle('hidden', rows.length > 0 || hasNotes);
    rows.forEach((row, i) => {
      list.appendChild(buildHistoryRoundEl(row.votes, null, row.created_at, rows.length - i, row.name || ''));
    });
  } catch {
    // history is optional — silently skip
  }
}

export function prependHistoryRound(players, stats, roundName) {
  const list = $('analyticsHistoryList');
  $('analyticsHistoryEmpty').classList.add('hidden');

  const votes = {};
  players.forEach((p) => { votes[p.name] = p.vote; });
  const roundNum = list.querySelectorAll('.history-round').length + 1;
  list.insertBefore(buildHistoryRoundEl(votes, stats, new Date().toISOString(), roundNum, roundName || ''), list.firstChild);
}

// Adds a non-round entry (e.g. a badge announcement) to the top of the history.
export function prependHistoryNote(el) {
  $('analyticsHistoryEmpty')?.classList.add('hidden');
  const list = $('analyticsHistoryList');
  list.insertBefore(el, list.firstChild);
}

// ── Current round ───────────────────────────────────────────────────────────

const statItem = (value, label) =>
  `<div class="stat-item"><div class="stat-value">${value}</div><div class="stat-label">${label}</div></div>`;

export function updateAnalyticsCurrent(stats, roundName) {
  const section = $('analyticsCurrent');
  const consensusEl = $('analyticsConsensus');
  if (!stats) { section.classList.add('hidden'); return; }

  const level = consensusLevel(stats);
  consensusEl.innerHTML = level !== 'neutral'
    ? `<div class="consensus-badge-lg consensus-badge-${level}">${consensusText(level)}</div>`
    : '';

  let nameEl = section.querySelector('.analytics-round-name');
  if (!nameEl) {
    nameEl = document.createElement('p');
    nameEl.className = 'analytics-round-name';
    section.insertBefore(nameEl, consensusEl);
  }
  nameEl.textContent = roundName || '';
  nameEl.classList.toggle('hidden', !roundName);

  let html = '';
  if (stats.allSame) html += `<div class="stat-consensus">${t('room.stats.consensus')}</div>`;
  if (stats.average !== undefined) {
    html += statItem(stats.average, t('room.stats.average'));
    html += statItem(stats.min, t('room.stats.min'));
    html += statItem(stats.max, t('room.stats.max'));
  }
  if (stats.mode) html += statItem(escapeHtml(stats.mode), t('room.stats.mode'));
  if (stats.distribution) {
    const distItems = Object.entries(stats.distribution)
      .sort((a, b) => b[1] - a[1])
      .map(([v, c]) => `<span>${escapeHtml(v)}: ${c}×</span>`)
      .join('');
    html += `<div class="stat-item"><div style="display:flex;gap:.6rem;flex-wrap:wrap;font-size:.85rem;color:var(--text-muted)">${distItems}</div><div class="stat-label">${t('room.stats.distribution')}</div></div>`;
  }

  $('analyticsStatsGrid').innerHTML = html;
  section.classList.remove('hidden');
}

export function hideAnalyticsCurrent() {
  $('analyticsCurrent').classList.add('hidden');
}

// ── Inline consensus badge & reactions ──────────────────────────────────────

export function showConsensusInline(stats) {
  const badge = $('consensusBadge');
  const level = consensusLevel(stats);
  if (!stats || level === 'neutral') { badge.classList.add('hidden'); return; }
  badge.className = `consensus-badge consensus-badge-${level}`;
  badge.textContent = consensusText(level);
  badge.classList.remove('hidden');
}

export function hideConsensusInline() {
  $('consensusBadge').classList.add('hidden');
}

export function setReactionBarEmojis(stats) {
  const emojis = reactionsFor(consensusLevel(stats));
  document.querySelectorAll('.reaction-btn').forEach((btn, i) => {
    btn.dataset.emoji = emojis[i];
    btn.textContent = emojis[i];
  });
}
