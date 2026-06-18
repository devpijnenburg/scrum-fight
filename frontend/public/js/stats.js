// Stats page — personal poker analytics
// Badge definitions are in badges.js (loaded before this file)

// ── Chart defaults (dark theme) ───────────────────────────────────────────────

if (typeof Chart !== 'undefined') {
  Chart.defaults.color = '#94a3b8';
  Chart.defaults.borderColor = '#334155';
  Chart.defaults.font.family = 'Nunito, sans-serif';
}

// ── Auth guard ────────────────────────────────────────────────────────────────

const user = getCurrentUser();
if (!user) window.location.href = '/login.html';

// ── Badge rendering ───────────────────────────────────────────────────────────

function renderBadges(data, earnedIds = new Set()) {
  const container = document.getElementById('badgesGrid');
  container.innerHTML = '';

  // Badges in earnedIds but not yet seen on this page → show "NEW" chip.
  const SEEN_KEY = 'sfBadgesSeenOnStats';
  const seenOnStats = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'));
  const newBadgeIds = new Set([...earnedIds].filter(id => !seenOnStats.has(id)));
  // After rendering, mark all current earned badges as seen.
  localStorage.setItem(SEEN_KEY, JSON.stringify([...earnedIds]));

  BADGE_GROUPS.forEach((group) => {
    const section = document.createElement('section');
    section.className = 'badge-category';

    const unlockedCount = group.badges.filter((badge) => earnedIds.has(badge.id)).length;
    section.innerHTML = `
      <div class="badge-category-header">
        <h3><span>${group.icon}</span>${localText(group.title)}</h3>
        <span class="badge-category-count">${unlockedCount}/${group.badges.length}</span>
      </div>
      <div class="badge-category-grid"></div>
    `;

    const grid = section.querySelector('.badge-category-grid');
    group.badges.forEach((b) => {
      const unlocked = earnedIds.has(b.id);
      const isNew = newBadgeIds.has(b.id);
      let pct = null;
      if (b.progress) {
        const [cur, max] = b.progress(data);
        pct = max > 0 ? cur / max : 0;
      }

      const name = localText(b.name);
      const desc = localText(b.desc);
      const progressHtml = b.progress ? (() => {
        const [cur, max] = b.progress(data);
        const w = max > 0 ? Math.min(100, (cur / max) * 100) : 0;
        return `<div class="badge-progress">
          <div class="badge-progress-bar">
            <div class="badge-progress-fill tier-${b.tier}" style="width:${w}%"></div>
          </div>
          <div class="badge-progress-text">${cur}/${max}</div>
        </div>`;
      })() : '<div class="badge-tier-dots" aria-hidden="true"><span class="tier-bronze"></span><span class="tier-silver"></span><span class="tier-gold"></span><span class="tier-diamond"></span></div>';

      const card = document.createElement('div');
      card.className = `badge-card badge-tier-${b.tier}${unlocked ? ' badge-unlocked' : ' badge-locked'}${isNew ? ' badge-new' : ''}`;
      card.title = `${name}: ${desc}`;
      card.innerHTML = `
        ${isNew ? '<span class="badge-new-chip">★ NEW</span>' : ''}
        <div class="badge-shield">${shieldSvg(b.tier, b.icon, unlocked, pct)}</div>
        <div class="badge-name">${name}</div>
        <div class="badge-desc">${desc}</div>
        ${progressHtml}
      `;
      grid.appendChild(card);
    });

    container.appendChild(section);
  });
}

function localText(value) {
  return value?.[getLang()] || value?.en || value?.nl || '';
}

// ── Personality ───────────────────────────────────────────────────────────────

const PERSONALITIES = {
  coffee:      { icon: '☕', color: '#f59e0b' },
  agnostic:    { icon: '🤔', color: '#94a3b8' },
  minimalist:  { icon: '🛡️', color: '#06b6d4' },
  maximalist:  { icon: '🚀', color: '#8b5cf6' },
  middleground:{ icon: '⚖️', color: '#22c55e' },
  fashionista: { icon: '👕', color: '#ec4899' },
};

function derivePersonality(distribution) {
  const total = distribution.reduce((s, d) => s + d.count, 0);
  if (!total) return null;
  const get = (v) => distribution.find((d) => d.value === v)?.count || 0;
  if (get('☕') / total > 0.2) return 'coffee';
  if (get('?')  / total > 0.25) return 'agnostic';
  const tshirt = ['XS','S','M','L','XL','XXL'];
  const numericEntries = distribution.filter((d) => !['?','☕','😊',...tshirt].includes(d.value));
  if (!numericEntries.length && distribution.some(d => tshirt.includes(d.value))) return 'fashionista';
  if (!numericEntries.length) return null;
  const totalN = numericEntries.reduce((s, d) => s + d.count, 0);
  const avg = numericEntries.reduce((s, d) => {
    const v = d.value === '½' ? 0.5 : parseFloat(d.value);
    return isNaN(v) ? s : s + v * d.count;
  }, 0) / totalN;
  const vals = numericEntries.map(d => d.value === '½' ? 0.5 : parseFloat(d.value)).filter(n => !isNaN(n));
  const range = Math.max(...vals) - Math.min(...vals);
  if (range === 0) return 'middleground';
  const third = (Math.min(...vals) + range / 3);
  const twoThird = (Math.min(...vals) + 2 * range / 3);
  if (avg <= third) return 'minimalist';
  if (avg >= twoThird) return 'maximalist';
  return 'middleground';
}

// ── Heatmap ───────────────────────────────────────────────────────────────────

function buildHeatmap(activityRows) {
  const wrap = document.getElementById('heatmapWrap');
  const byDay = {};
  let maxCount = 0;
  activityRows.forEach(({ day, rounds }) => { byDay[day] = rounds; if (rounds > maxCount) maxCount = rounds; });

  const days = [];
  const today = new Date(); today.setHours(0,0,0,0);
  for (let i = 90; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d);
  }

  const grid = document.createElement('div');
  grid.className = 'heatmap-grid';

  const labelCol = document.createElement('div');
  labelCol.className = 'heatmap-labels';
  ['Ma','Di','Wo','Do','Vr','Za','Zo'].forEach(l => {
    const span = document.createElement('span'); span.textContent = l; labelCol.appendChild(span);
  });
  grid.appendChild(labelCol);

  const weeks = [];
  let week = [];
  days.forEach(d => {
    const dow = (d.getDay() + 6) % 7;
    if (dow === 0 && week.length) { weeks.push(week); week = []; }
    week.push(d);
  });
  if (week.length) weeks.push(week);

  weeks.forEach(wk => {
    const col = document.createElement('div');
    col.className = 'heatmap-col';
    const firstDow = (wk[0].getDay() + 6) % 7;
    for (let i = 0; i < firstDow; i++) {
      const g = document.createElement('div'); g.className = 'heatmap-cell heatmap-ghost'; col.appendChild(g);
    }
    wk.forEach(d => {
      const key = d.toISOString().slice(0, 10);
      const count = byDay[key] || 0;
      const level = maxCount === 0 ? 0 : Math.ceil((count / maxCount) * 4);
      const cell = document.createElement('div');
      cell.className = `heatmap-cell heatmap-level-${level}`;
      cell.title = `${key}: ${count} ronde${count !== 1 ? 's' : ''}`;
      col.appendChild(cell);
    });
    grid.appendChild(col);
  });

  wrap.appendChild(grid);

  const legend = document.createElement('div');
  legend.className = 'heatmap-legend';
  legend.innerHTML = `<span>${t('stats.heatmap_less')}</span>`;
  for (let i = 0; i <= 4; i++) {
    const cell = document.createElement('div'); cell.className = `heatmap-cell heatmap-level-${i}`; legend.appendChild(cell);
  }
  legend.innerHTML += `<span>${t('stats.heatmap_more')}</span>`;
  wrap.appendChild(legend);
}

// ── Charts ────────────────────────────────────────────────────────────────────

function buildDistChart(distribution) {
  if (!distribution.length) return;
  const ctx = document.getElementById('distChart').getContext('2d');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: distribution.map(d => d.value),
      datasets: [{ data: distribution.map(d => d.count), backgroundColor: 'rgba(139,92,246,.7)', borderColor: '#8b5cf6', borderWidth: 1, borderRadius: 4 }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.raw}×` } } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: '#1e293b' } }, x: { grid: { display: false } } },
    },
  });
}

function buildActivityChart(activityRows) {
  const ctx = document.getElementById('activityChart').getContext('2d');
  const byDay = {};
  activityRows.forEach(({ day, rounds }) => { byDay[day] = rounds; });
  const labels = [], data = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    labels.push(key.slice(5)); data.push(byDay[key] || 0);
  }
  new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: 'rgba(6,182,212,.6)', borderColor: '#06b6d4', borderWidth: 1, borderRadius: 3 }] },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: '#1e293b' } }, x: { ticks: { maxTicksLimit: 10, maxRotation: 0 }, grid: { display: false } } },
    },
  });
}

function buildHoursChart(byHour) {
  const ctx = document.getElementById('hoursChart').getContext('2d');
  const data = Array(24).fill(0);
  byHour.forEach(({ hour, count }) => { data[hour] = count; });
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
      datasets: [{ data, backgroundColor: 'rgba(34,197,94,.6)', borderColor: '#22c55e', borderWidth: 1, borderRadius: 3 }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: '#1e293b' } }, x: { ticks: { maxTicksLimit: 8, maxRotation: 0 }, grid: { display: false } } },
    },
  });
}

// ── Badge toast ───────────────────────────────────────────────────────────────

const SEEN_BADGES_KEY = 'sfSeenBadges';

async function showBadgeToastsFromDb() {
  try {
    const { badgeIds } = await apiFetch('/users/badges');
    const seen = new Set(JSON.parse(sessionStorage.getItem(SEEN_BADGES_KEY) || '[]'));
    sessionStorage.setItem(SEEN_BADGES_KEY, JSON.stringify(badgeIds));
    if (seen.size === 0) return;
    const newOnes = badgeIds.filter(id => !seen.has(id));
    newOnes.forEach((id, i) => setTimeout(() => showToast(id), i * 700));
  } catch {
    // badges are optional — silently skip
  }
}

function showToast(badgeId) {
  const badge = BADGES.find(b => b.id === badgeId);
  if (!badge) return;
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'badge-toast-item';
  toast.innerHTML = `
    <div class="badge-toast-shield">${shieldSvg(badge.tier, badge.icon, true, 1)}</div>
    <div class="badge-toast-body">
      <div class="badge-toast-label">${t('stats.toast_unlocked')}</div>
      <div class="badge-toast-name">${localText(badge.name)}</div>
    </div>
    <button class="badge-toast-close" onclick="this.closest('.badge-toast-item').remove()">✕</button>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('badge-toast-hide');
    setTimeout(() => toast.remove(), 400);
  }, 5500);
}

// ── Sessions table ────────────────────────────────────────────────────────────

function renderSessions(sessions) {
  const tbody = document.getElementById('sessionsTbody');
  if (!sessions?.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-muted" style="text-align:center;padding:1rem">${t('stats.sessions_empty')}</td></tr>`;
    return;
  }
  const locale = getLang() === 'nl' ? 'nl-NL' : 'en-GB';
  sessions.forEach(s => {
    const date = new Date(s.last_active).toLocaleDateString(locale, { dateStyle: 'medium' });
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><a href="/room.html?id=${escapeHtml(s.room_id)}" class="session-room-link">${escapeHtml(s.room_name)}</a></td>
      <td class="text-muted">${escapeHtml(s.method)}</td>
      <td>${s.rounds}</td>
      <td>${s.fav_value ? escapeHtml(s.fav_value) : '—'}</td>
      <td class="text-muted">${date}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function loadStats() {
  try {
    const [data, badgeData] = await Promise.all([
      apiFetch('/users/stats', { method: 'GET' }),
      apiFetch('/users/badges').catch(() => ({ badgeIds: [] })),
    ]);
    const earnedIds = new Set(badgeData.badgeIds || []);

    document.getElementById('statsLoading').classList.add('hidden');

    if (!data.summary.total_rounds) {
      document.getElementById('statsEmpty').classList.remove('hidden');
      return;
    }

    document.getElementById('statsContent').classList.remove('hidden');

    // Subtitle
    const firstDate = data.summary.first_vote_at
      ? new Date(data.summary.first_vote_at).toLocaleDateString(getLang() === 'nl' ? 'nl-NL' : 'en-GB', { dateStyle: 'long' })
      : '';
    if (firstDate) document.getElementById('statsSubtitle').textContent = t('stats.member_since', { date: firstDate });

    // Quick stat cards
    document.getElementById('statRounds').textContent    = data.summary.total_rounds;
    document.getElementById('statSessions').textContent  = data.summary.total_sessions;

    const favCard = data.distribution[0]?.value || '—';
    document.getElementById('statFavorite').textContent  = favCard;

    const numericEntries = data.distribution.filter(d => !['?','☕','😊','XS','S','M','L','XL','XXL'].includes(d.value));
    const totalN = numericEntries.reduce((s, d) => s + d.count, 0);
    const avgNum = totalN
      ? numericEntries.reduce((s, d) => s + (d.value === '½' ? 0.5 : parseFloat(d.value)) * d.count, 0) / totalN
      : null;
    document.getElementById('statAverage').textContent   = avgNum !== null ? avgNum.toFixed(1) : '—';

    // Extra stats: streak + consensus
    const streak = data.streak?.current_streak || 0;
    const maxStreak = data.streak?.max_streak || 0;
    document.getElementById('statStreak').textContent    = `${streak} 🔥`;
    document.getElementById('statStreakMax').textContent = t('stats.streak_best', { n: maxStreak });

    const c = data.consensus;
    const consensusPct = c && c.total_rounds >= 5
      ? Math.round((c.consensus_rounds / c.total_rounds) * 100)
      : null;
    document.getElementById('statConsensus').textContent = consensusPct !== null ? `${consensusPct}%` : '—';
    document.getElementById('statConsensusRounds').textContent = c
      ? t('stats.consensus_of', { n: c.consensus_rounds, total: c.total_rounds })
      : '';

    // Consensus streak
    const cs = data.consensusStreak;
    const curCS  = cs?.current_consensus_streak || 0;
    const maxCS  = cs?.max_consensus_streak || 0;
    document.getElementById('statConsensusStreak').textContent = `${curCS} 🎯`;
    document.getElementById('statConsensusStreakMax').textContent = t('stats.streak_best', { n: maxCS });

    // Team comparison
    const tc = data.teamComparison;
    if (tc && tc.compared_rounds >= 5 && tc.team_avg > 0) {
      const diff = tc.user_avg - tc.team_avg;
      const pct  = Math.round((diff / tc.team_avg) * 100);
      const sign = pct >= 0 ? '+' : '';
      document.getElementById('statTeamDiff').textContent    = `${sign}${pct}%`;
      document.getElementById('statTeamDiffSub').textContent = t('stats.team_diff_sub', { rounds: tc.compared_rounds });
    }

    // Sessions table
    renderSessions(data.sessions);

    // Personality badge
    const pType = derivePersonality(data.distribution);
    if (pType) {
      const p = PERSONALITIES[pType];
      const badge = document.getElementById('personalityBadge');
      badge.innerHTML = `
        <span class="personality-icon">${p.icon}</span>
        <div>
          <div class="personality-label">${t('stats.personality.label')}</div>
          <div class="personality-name" style="color:${p.color}">${t('stats.personality.' + pType)}</div>
          <div class="personality-desc">${t('stats.personality.' + pType + '.desc')}</div>
        </div>`;
      badge.classList.remove('hidden');
    }

    // Badges — DB is source of truth for unlocked state
    renderBadges(data, earnedIds);
    showBadgeToastsFromDb();

    // Charts (guard against CDN failure)
    if (typeof Chart !== 'undefined') {
      buildDistChart(data.distribution);
      buildActivityChart(data.activity);
      buildHoursChart(data.byHour);
    }
    buildHeatmap(data.activity);

  } catch (err) {
    document.getElementById('statsLoading').textContent = t('stats.error');
    console.error(err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  updateNavbar();
  loadStats();
});
