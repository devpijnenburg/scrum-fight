// Stats page — personal poker analytics

// ── Chart defaults (dark theme) ───────────────────────────────────────────────

Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = '#334155';
Chart.defaults.font.family = 'Nunito, sans-serif';

// ── Auth guard ────────────────────────────────────────────────────────────────

const user = getCurrentUser();
if (!user) window.location.href = '/login.html';

document.getElementById('navUser').textContent = `👤 ${user.name}`;
document.getElementById('logoutBtn').addEventListener('click', logout);

// ── Shield tier config ────────────────────────────────────────────────────────
// Each tier: [highlight, main, shadow, text-color]
const TIERS = {
  bronze:   ['#f5c97a', '#c47b2b', '#7c3a0a', '#fff3e0'],
  silver:   ['#f0f4f8', '#8896a8', '#4a5568', '#f0f4f8'],
  gold:     ['#fef3c7', '#d97706', '#78350f', '#fffbeb'],
  platinum: ['#e0f2fe', '#60a5fa', '#1e40af', '#eff6ff'],
  special_unicorn:  ['#f9a8d4', '#a855f7', '#4c1d95', '#fdf4ff'],
  special_zombie:   ['#86efac', '#16a34a', '#14532d', '#f0fdf4'],
  special_coffee:   ['#fed7aa', '#ea580c', '#7c2d12', '#fff7ed'],
  special_speed:    ['#fde68a', '#eab308', '#713f12', '#fefce8'],
};

// ── Badge definitions ─────────────────────────────────────────────────────────

const BADGES = [
  // ── Milestone (rounds played) ─────────────────────────────────────────────
  {
    id: 'first_round', tier: 'bronze', emoji: '🃏', milestone: '×1',
    unlock: (d) => d.summary.total_rounds >= 1,
    progress: (d) => [Math.min(d.summary.total_rounds, 1), 1],
  },
  {
    id: 'regular', tier: 'bronze', emoji: '🎯', milestone: '×25',
    unlock: (d) => d.summary.total_rounds >= 25,
    progress: (d) => [Math.min(d.summary.total_rounds, 25), 25],
  },
  {
    id: 'veteran', tier: 'silver', emoji: '⚔️', milestone: '×100',
    unlock: (d) => d.summary.total_rounds >= 100,
    progress: (d) => [Math.min(d.summary.total_rounds, 100), 100],
  },
  {
    id: 'grandmaster', tier: 'gold', emoji: '🏆', milestone: '×500',
    unlock: (d) => d.summary.total_rounds >= 500,
    progress: (d) => [Math.min(d.summary.total_rounds, 500), 500],
  },
  {
    id: 'legend', tier: 'platinum', emoji: '👑', milestone: '×1000',
    unlock: (d) => d.summary.total_rounds >= 1000,
    progress: (d) => [Math.min(d.summary.total_rounds, 1000), 1000],
  },
  // ── Sessions ──────────────────────────────────────────────────────────────
  {
    id: 'explorer', tier: 'bronze', emoji: '🗺️', milestone: '5 sess',
    unlock: (d) => d.summary.total_sessions >= 5,
    progress: (d) => [Math.min(d.summary.total_sessions, 5), 5],
  },
  {
    id: 'globetrotter', tier: 'silver', emoji: '🌍', milestone: '20 sess',
    unlock: (d) => d.summary.total_sessions >= 20,
    progress: (d) => [Math.min(d.summary.total_sessions, 20), 20],
  },
  // ── Streaks ───────────────────────────────────────────────────────────────
  {
    id: 'on_fire', tier: 'silver', emoji: '🔥', milestone: '7 dagen',
    unlock: (d) => (d.streak?.max_streak || 0) >= 7,
    progress: (d) => [Math.min(d.streak?.max_streak || 0, 7), 7],
  },
  {
    id: 'dedicated', tier: 'gold', emoji: '📅', milestone: '30 dagen',
    unlock: (d) => (d.streak?.max_streak || 0) >= 30,
    progress: (d) => [Math.min(d.streak?.max_streak || 0, 30), 30],
  },
  // ── Time-based ────────────────────────────────────────────────────────────
  {
    id: 'early_bird', tier: 'bronze', emoji: '🌅', milestone: '< 8:00',
    unlock: (d) => d.byHour.some(h => h.hour >= 5 && h.hour <= 7 && h.count > 0),
    progress: null,
  },
  {
    id: 'night_owl', tier: 'silver', emoji: '🦉', milestone: '> 22:00',
    unlock: (d) => d.byHour.some(h => (h.hour >= 22 || h.hour <= 3) && h.count > 0),
    progress: null,
  },
  // ── Vote style ────────────────────────────────────────────────────────────
  {
    id: 'barista', tier: 'bronze', emoji: '☕', milestone: '☕ ×5',
    unlock: (d) => (d.distribution.find(x => x.value === '☕')?.count || 0) >= 5,
    progress: (d) => [Math.min(d.distribution.find(x => x.value === '☕')?.count || 0, 5), 5],
  },
  {
    id: 'doubter', tier: 'bronze', emoji: '🤔', milestone: '? ×10',
    unlock: (d) => (d.distribution.find(x => x.value === '?')?.count || 0) >= 10,
    progress: (d) => [Math.min(d.distribution.find(x => x.value === '?')?.count || 0, 10), 10],
  },
  {
    id: 'allrounder', tier: 'gold', emoji: '🎪', milestone: '4 methodes',
    unlock: (d) => (d.methodsCount || 0) >= 4,
    progress: (d) => [Math.min(d.methodsCount || 0, 4), 4],
  },
  {
    id: 'team_player', tier: 'gold', emoji: '🤝', milestone: '70% consensus',
    unlock: (d) => {
      const c = d.consensus;
      return c && c.total_rounds >= 10 && c.consensus_rounds / c.total_rounds >= 0.7;
    },
    progress: null,
  },
  // ── Special / grappig ─────────────────────────────────────────────────────
  {
    id: 'unicorn', tier: 'special_unicorn', emoji: '🦄', milestone: '? ×50',
    unlock: (d) => (d.distribution.find(x => x.value === '?')?.count || 0) >= 50,
    progress: (d) => [Math.min(d.distribution.find(x => x.value === '?')?.count || 0, 50), 50],
  },
  {
    id: 'zombie', tier: 'special_zombie', emoji: '🧟', milestone: '00-04u',
    unlock: (d) => d.byHour.some(h => h.hour >= 0 && h.hour <= 3 && h.count > 0),
    progress: null,
  },
  {
    id: 'coffee_addict', tier: 'special_coffee', emoji: '☕', milestone: '☕ ×20',
    unlock: (d) => (d.distribution.find(x => x.value === '☕')?.count || 0) >= 20,
    progress: (d) => [Math.min(d.distribution.find(x => x.value === '☕')?.count || 0, 20), 20],
  },
  {
    id: 'speedrunner', tier: 'special_speed', emoji: '⚡', milestone: '10 op 1 dag',
    unlock: (d) => (d.maxDayRounds || 0) >= 10,
    progress: (d) => [Math.min(d.maxDayRounds || 0, 10), 10],
  },
];

// ── SVG shield generator ──────────────────────────────────────────────────────

function shieldSvg(tier, emoji, milestone, unlocked, pct) {
  const [hi, mid, dark, txt] = TIERS[tier] || TIERS.bronze;
  const id = `sh-${Math.random().toString(36).slice(2, 7)}`;

  // Shield path (heraldic shape, 100×120 viewBox)
  const outline = 'M50,6 L92,22 L92,64 Q92,98 50,114 Q8,98 8,64 L8,22 Z';
  const inner   = 'M50,11 L87,26 L87,64 Q87,94 50,109 Q13,94 13,64 L13,26 Z';

  const grayFilter = unlocked ? '' : `<filter id="gray-${id}"><feColorMatrix type="saturate" values="0"/></filter>`;
  const grayAttr   = unlocked ? '' : `filter="url(#gray-${id})" opacity="0.45"`;

  // Progress arc on the outline ring (SVG stroke-dasharray)
  const circum = 280; // approximate perimeter of shield outline
  const dash = pct != null ? `${pct * circum} ${circum}` : '';
  const progressRing = pct != null && unlocked ? `
    <path d="${outline}" fill="none" stroke="${hi}" stroke-width="3.5"
          stroke-dasharray="${dash}" stroke-linecap="round" opacity="0.7"/>` : '';

  const glowFilter = unlocked ? `
    <filter id="glow-${id}" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>` : '';
  const glowAttr = unlocked ? `filter="url(#glow-${id})"` : '';

  // Lock icon for locked badges
  const lockIcon = unlocked ? '' : `
    <text x="73" y="98" font-size="14" text-anchor="middle" opacity="0.7">🔒</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120" role="img">
  <defs>
    <linearGradient id="g-${id}" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0%"   stop-color="${hi}"/>
      <stop offset="45%"  stop-color="${mid}"/>
      <stop offset="100%" stop-color="${dark}"/>
    </linearGradient>
    ${grayFilter}${glowFilter}
  </defs>
  <g ${grayAttr}>
    <!-- Shield shadow -->
    <path d="${outline}" fill="${dark}" opacity="0.5" transform="translate(2,3)"/>
    <!-- Shield body -->
    <path d="${outline}" fill="url(#g-${id})" ${glowAttr}/>
    <!-- Inner bevel highlight -->
    <path d="${inner}" fill="none" stroke="${hi}" stroke-width="1.5" opacity="0.4"/>
    <!-- Emoji icon -->
    <text x="50" y="60" font-size="30" text-anchor="middle" dominant-baseline="middle">${emoji}</text>
    <!-- Milestone label -->
    <text x="50" y="97" font-size="9.5" text-anchor="middle" dominant-baseline="middle"
          font-family="Nunito,sans-serif" font-weight="800" fill="${txt}" opacity="0.95">${milestone}</text>
    ${lockIcon}
  </g>
  ${progressRing}
</svg>`;
}

// ── Badge rendering ───────────────────────────────────────────────────────────

function renderBadges(data) {
  const container = document.getElementById('badgesGrid');
  container.innerHTML = '';

  // Sort: unlocked first, then by badge index
  const sorted = BADGES.map((b, i) => ({ b, i, unlocked: b.unlock(data) }))
    .sort((a, b) => b.unlocked - a.unlocked || a.i - b.i);

  sorted.forEach(({ b, unlocked }) => {
    let pct = null;
    if (b.progress) {
      const [cur, max] = b.progress(data);
      pct = max > 0 ? cur / max : 0;
    }

    const name = t(`stats.badge.${b.id}`);
    const desc = t(`stats.badge.${b.id}.desc`);
    const progressHtml = b.progress ? (() => {
      const [cur, max] = b.progress(data);
      const w = max > 0 ? Math.min(100, (cur / max) * 100) : 0;
      return `<div class="badge-progress">
        <div class="badge-progress-bar">
          <div class="badge-progress-fill tier-${b.tier}" style="width:${w}%"></div>
        </div>
        <div class="badge-progress-text">${cur}/${max}</div>
      </div>`;
    })() : '';

    const card = document.createElement('div');
    card.className = `badge-card badge-tier-${b.tier}${unlocked ? ' badge-unlocked' : ' badge-locked'}`;
    card.title = `${name}: ${desc}`;
    card.innerHTML = `
      <div class="badge-shield">${shieldSvg(b.tier, b.emoji, b.milestone, unlocked, pct)}</div>
      <div class="badge-name">${name}</div>
      <div class="badge-desc">${desc}</div>
      ${progressHtml}
    `;
    container.appendChild(card);
  });
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

// ── Main ──────────────────────────────────────────────────────────────────────

async function loadStats() {
  try {
    const data = await apiFetch('/users/stats', { method: 'GET' });

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

    // Badges
    renderBadges(data);

    // Charts
    buildDistChart(data.distribution);
    buildActivityChart(data.activity);
    buildHeatmap(data.activity);
    buildHoursChart(data.byHour);

  } catch (err) {
    document.getElementById('statsLoading').textContent = t('stats.error');
    console.error(err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  updateNavbar();
  loadStats();
});
