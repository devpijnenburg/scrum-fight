// Stats page — personal poker analytics

// ── Chart defaults (dark theme) ───────────────────────────────────────────────

Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = '#334155';
Chart.defaults.font.family = 'Nunito, sans-serif';

// ── Auth guard ────────────────────────────────────────────────────────────────

const user = getCurrentUser();
if (!user) {
  window.location.href = '/login.html';
}

document.getElementById('navUser').textContent = `👤 ${user.name}`;
document.getElementById('logoutBtn').addEventListener('click', logout);

// ── Personality definitions ───────────────────────────────────────────────────

const PERSONALITIES = {
  coffee:     { icon: '☕', key: 'stats.personality.coffee',     color: '#f59e0b' },
  agnostic:   { icon: '🤔', key: 'stats.personality.agnostic',   color: '#94a3b8' },
  minimalist: { icon: '🛡️', key: 'stats.personality.minimalist', color: '#06b6d4' },
  maximalist: { icon: '🚀', key: 'stats.personality.maximalist', color: '#8b5cf6' },
  middleground:{ icon: '⚖️',key: 'stats.personality.middle',    color: '#22c55e' },
  fashionista: { icon: '👕', key: 'stats.personality.fashionista',color: '#ec4899' },
};

function derivePersonality(distribution) {
  const total = distribution.reduce((s, d) => s + d.count, 0);
  if (!total) return null;

  const get = (val) => distribution.find((d) => d.value === val)?.count || 0;
  const coffeeRate = get('☕') / total;
  const qRate = get('?') / total;

  if (coffeeRate > 0.2) return 'coffee';
  if (qRate > 0.25) return 'agnostic';

  const tshirt = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  const nonNumeric = ['?', '☕', '😊', ...tshirt];
  const numericEntries = distribution.filter((d) => !nonNumeric.includes(d.value));
  const tshirtEntries  = distribution.filter((d) => tshirt.includes(d.value));

  if (!numericEntries.length && tshirtEntries.length) return 'fashionista';

  if (!numericEntries.length) return null;

  const totalNumeric = numericEntries.reduce((s, d) => s + d.count, 0);
  const avgNum = numericEntries.reduce((s, d) => {
    const v = d.value === '½' ? 0.5 : parseFloat(d.value);
    return isNaN(v) ? s : s + v * d.count;
  }, 0) / totalNumeric;

  const allVals = numericEntries.map((d) => d.value === '½' ? 0.5 : parseFloat(d.value)).filter((n) => !isNaN(n));
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const third = (max - min) / 3;

  if (avgNum <= min + third) return 'minimalist';
  if (avgNum >= max - third) return 'maximalist';
  return 'middleground';
}

// ── Heatmap ───────────────────────────────────────────────────────────────────

function buildHeatmap(activityRows) {
  const wrap = document.getElementById('heatmapWrap');

  // Build a map of day→count
  const byDay = {};
  let maxCount = 0;
  activityRows.forEach(({ day, rounds }) => {
    byDay[day] = rounds;
    if (rounds > maxCount) maxCount = rounds;
  });

  // Generate last 91 days (13 weeks)
  const days = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 90; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d);
  }

  // Day-of-week labels (Mon–Sun)
  const DOW_LABELS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];

  const grid = document.createElement('div');
  grid.className = 'heatmap-grid';

  // Column for DOW labels
  const labelCol = document.createElement('div');
  labelCol.className = 'heatmap-labels';
  DOW_LABELS.forEach((l) => {
    const span = document.createElement('span');
    span.textContent = l;
    labelCol.appendChild(span);
  });
  grid.appendChild(labelCol);

  // Group days into weeks (columns)
  const weeks = [];
  let week = [];
  days.forEach((d) => {
    const dow = (d.getDay() + 6) % 7; // Mon=0, Sun=6
    if (dow === 0 && week.length) {
      weeks.push(week);
      week = [];
    }
    week.push(d);
  });
  if (week.length) weeks.push(week);

  weeks.forEach((wk) => {
    const col = document.createElement('div');
    col.className = 'heatmap-col';

    // Pad top if first day of week isn't Monday
    const firstDow = (wk[0].getDay() + 6) % 7;
    for (let i = 0; i < firstDow; i++) {
      const ghost = document.createElement('div');
      ghost.className = 'heatmap-cell heatmap-ghost';
      col.appendChild(ghost);
    }

    wk.forEach((d) => {
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

  // Legend
  const legend = document.createElement('div');
  legend.className = 'heatmap-legend';
  legend.innerHTML = `<span>${t('stats.heatmap_less')}</span>`;
  for (let i = 0; i <= 4; i++) {
    const cell = document.createElement('div');
    cell.className = `heatmap-cell heatmap-level-${i}`;
    legend.appendChild(cell);
  }
  legend.innerHTML += `<span>${t('stats.heatmap_more')}</span>`;
  wrap.appendChild(legend);
}

// ── Charts ────────────────────────────────────────────────────────────────────

function buildDistChart(distribution) {
  if (!distribution.length) return;

  const ctx = document.getElementById('distChart').getContext('2d');
  const labels = distribution.map((d) => d.value);
  const counts = distribution.map((d) => d.count);

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: counts,
        backgroundColor: 'rgba(139,92,246,.7)',
        borderColor: '#8b5cf6',
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.raw}×`,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1 },
          grid: { color: '#1e293b' },
        },
        x: { grid: { display: false } },
      },
    },
  });
}

function buildActivityChart(activityRows) {
  const ctx = document.getElementById('activityChart').getContext('2d');

  // Fill all 90 days with 0 if no data
  const byDay = {};
  activityRows.forEach(({ day, rounds }) => { byDay[day] = rounds; });

  const labels = [];
  const data = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    labels.push(key.slice(5)); // MM-DD
    data.push(byDay[key] || 0);
  }

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: 'rgba(6,182,212,.6)',
        borderColor: '#06b6d4',
        borderWidth: 1,
        borderRadius: 3,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1 },
          grid: { color: '#1e293b' },
        },
        x: {
          ticks: {
            maxTicksLimit: 10,
            maxRotation: 0,
          },
          grid: { display: false },
        },
      },
    },
  });
}

function buildHoursChart(byHour) {
  const ctx = document.getElementById('hoursChart').getContext('2d');

  const labels = Array.from({ length: 24 }, (_, i) => `${i}:00`);
  const data = Array(24).fill(0);
  byHour.forEach(({ hour, count }) => { data[hour] = count; });

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: 'rgba(34,197,94,.6)',
        borderColor: '#22c55e',
        borderWidth: 1,
        borderRadius: 3,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1 },
          grid: { color: '#1e293b' },
        },
        x: {
          ticks: { maxTicksLimit: 8, maxRotation: 0 },
          grid: { display: false },
        },
      },
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
    document.getElementById('statsSubtitle').textContent = firstDate
      ? t('stats.member_since', { date: firstDate })
      : '';

    // Quick stat cards
    document.getElementById('statRounds').textContent = data.summary.total_rounds;
    document.getElementById('statSessions').textContent = data.summary.total_sessions;

    const favCard = data.distribution[0]?.value || '—';
    document.getElementById('statFavorite').textContent = favCard;

    const numericVotes = data.distribution.filter(
      (d) => !['?', '☕', '😊', 'XS', 'S', 'M', 'L', 'XL', 'XXL'].includes(d.value)
    );
    const totalNum = numericVotes.reduce((s, d) => s + d.count, 0);
    const avgNum = totalNum
      ? numericVotes.reduce((s, d) => s + (d.value === '½' ? 0.5 : parseFloat(d.value)) * d.count, 0) / totalNum
      : null;
    document.getElementById('statAverage').textContent = avgNum !== null ? avgNum.toFixed(1) : '—';

    // Poker personality
    const pType = derivePersonality(data.distribution);
    if (pType) {
      const p = PERSONALITIES[pType];
      const badge = document.getElementById('personalityBadge');
      badge.innerHTML = `
        <span class="personality-icon">${p.icon}</span>
        <div>
          <div class="personality-label">${t('stats.personality.label')}</div>
          <div class="personality-name" style="color:${p.color}">${t(p.key)}</div>
          <div class="personality-desc">${t(p.key + '.desc')}</div>
        </div>
      `;
      badge.classList.remove('hidden');
    }

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
