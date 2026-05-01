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
  diamond:  ['#dff7ff', '#5ec5f2', '#1e4f87', '#effcff'],
};

// ── Badge definitions ─────────────────────────────────────────────────────────

const TSHIRT_VALUES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const FIBONACCI_VALUES = ['0', '½', '1', '2', '3', '5', '8', '13', '20', '21', '34', '40', '55', '89', '100'];

function voteCount(d, values) {
  const list = Array.isArray(values) ? values : [values];
  return d.distribution
    .filter((x) => list.includes(x.value))
    .reduce((sum, x) => sum + x.count, 0);
}

function consensusRate(d) {
  const c = d.consensus;
  return c && c.total_rounds ? c.consensus_rounds / c.total_rounds : 0;
}

function atLeast(getValue, target) {
  return {
    unlock: (d) => getValue(d) >= target,
    progress: (d) => [Math.min(getValue(d), target), target],
  };
}

const BADGE_GROUPS = [
  {
    id: 'basics',
    icon: '♟',
    title: { nl: 'Basis & gebruik', en: 'Basics & usage' },
    badges: [
      { id: 'first_stem', tier: 'bronze', icon: '1', ...atLeast((d) => d.summary.total_rounds, 1),
        name: { nl: 'Eerste Stem', en: 'First Vote' }, desc: { nl: 'Breng je eerste schatting uit.', en: 'Cast your first estimate.' } },
      { id: 'team_player', tier: 'bronze', icon: '👥', ...atLeast((d) => d.summary.total_sessions, 5),
        name: { nl: 'Team Player', en: 'Team Player' }, desc: { nl: 'Doe mee aan 5 sessies.', en: 'Join 5 sessions.' } },
      { id: 'poker_regular', tier: 'silver', icon: '25', ...atLeast((d) => d.summary.total_rounds, 25),
        name: { nl: 'Poker Regular', en: 'Poker Regular' }, desc: { nl: 'Doe mee aan 25 sessies.', en: 'Play 25 rounds.' } },
      { id: 'planning_pro', tier: 'gold', icon: '100', ...atLeast((d) => d.summary.total_rounds, 100),
        name: { nl: 'Planning Pro', en: 'Planning Pro' }, desc: { nl: 'Doe mee aan 100 sessies.', en: 'Play 100 rounds.' } },
    ],
  },
  {
    id: 'estimation',
    icon: '♙',
    title: { nl: 'Estimation', en: 'Estimation' },
    badges: [
      { id: 'first_estimate', tier: 'bronze', icon: '1', ...atLeast((d) => d.summary.total_rounds, 1),
        name: { nl: 'First Estimate', en: 'First Estimate' }, desc: { nl: 'Schat je eerste story.', en: 'Estimate your first story.' } },
      { id: 'fibonacci_fan', tier: 'silver', icon: '↻', ...atLeast((d) => voteCount(d, FIBONACCI_VALUES), 10),
        name: { nl: 'Fibonacci Fan', en: 'Fibonacci Fan' }, desc: { nl: 'Gebruik Fibonacci kaarten in 10 sessies.', en: 'Use Fibonacci cards 10 times.' } },
      { id: 'consistent_estimator', tier: 'gold', icon: '◎', unlock: (d) => d.consensus?.total_rounds >= 10 && consensusRate(d) >= 0.7, progress: null,
        name: { nl: 'Consistent Estimator', en: 'Consistent Estimator' }, desc: { nl: 'Blijf binnen 1 punt van consensus (10x).', en: 'Stay close to consensus 10 times.' } },
      { id: 'sharp_estimator', tier: 'gold', icon: '🎯', ...atLeast((d) => d.consensus?.consensus_rounds || 0, 5),
        name: { nl: 'Sharp Estimator', en: 'Sharp Estimator' }, desc: { nl: 'Zit exact op de consensus (5x).', en: 'Match consensus exactly 5 times.' } },
      { id: 'estimation_sniper', tier: 'diamond', icon: '⌖', ...atLeast((d) => d.consensus?.consensus_rounds || 0, 25),
        name: { nl: 'Estimation Sniper', en: 'Estimation Sniper' }, desc: { nl: 'Zit exact goed (25x).', en: 'Match consensus exactly 25 times.' } },
      { id: 'outlier', tier: 'gold', icon: '☹', unlock: () => false, progress: null,
        name: { nl: 'Outlier', en: 'Outlier' }, desc: { nl: 'Zit 3+ punten naast de consensus.', en: 'Be 3+ points away from consensus.' } },
      { id: 'wild_guess', tier: 'bronze', icon: '😠', unlock: () => false, progress: null,
        name: { nl: 'Wild Guess', en: 'Wild Guess' }, desc: { nl: 'Zit 5+ punten naast de consensus.', en: 'Be 5+ points away from consensus.' } },
    ],
  },
  {
    id: 'tshirt',
    icon: '👕',
    title: { nl: 'T-shirt sizing', en: 'T-shirt sizing' },
    badges: [
      { id: 'size_matters', tier: 'bronze', icon: 'M', ...atLeast((d) => voteCount(d, TSHIRT_VALUES), 1),
        name: { nl: 'Size Matters', en: 'Size Matters' }, desc: { nl: 'Gebruik T-shirt sizing voor het eerst.', en: 'Use T-shirt sizing for the first time.' } },
      { id: 'sizer', tier: 'silver', icon: '20', ...atLeast((d) => voteCount(d, TSHIRT_VALUES), 20),
        name: { nl: 'Sizer', en: 'Sizer' }, desc: { nl: 'Schat 20 stories met T-shirt sizes.', en: 'Estimate 20 stories with T-shirt sizes.' } },
      { id: 'perfect_fit', tier: 'gold', icon: '✓', unlock: () => false, progress: null,
        name: { nl: 'Perfect Fit', en: 'Perfect Fit' }, desc: { nl: 'Zit 10x exact op de gekozen size.', en: 'Hit the chosen size exactly 10 times.' } },
      { id: 'size_guru', tier: 'gold', icon: '♛', unlock: () => false, progress: null,
        name: { nl: 'Size Guru', en: 'Size Guru' }, desc: { nl: 'Zit 50x correct met sizing.', en: 'Land 50 sizing estimates correctly.' } },
    ],
  },
  {
    id: 'team',
    icon: '♟',
    title: { nl: 'Team dynamics', en: 'Team dynamics' },
    badges: [
      { id: 'consensus_builder', tier: 'bronze', icon: '🤝', unlock: (d) => d.consensus?.total_rounds >= 10 && consensusRate(d) >= 0.6, progress: null,
        name: { nl: 'Consensus Builder', en: 'Consensus Builder' }, desc: { nl: 'Bereik consensus zonder discussie.', en: 'Help the team reach consensus.' } },
      { id: 'debate_starter', tier: 'silver', icon: '…', unlock: () => false, progress: null,
        name: { nl: 'Debate Starter', en: 'Debate Starter' }, desc: { nl: 'Start een discussie na afloop.', en: 'Start a discussion after revealing.' } },
      { id: 'healthy_debate', tier: 'silver', icon: '👥', unlock: () => false, progress: null,
        name: { nl: 'Healthy Debate', en: 'Healthy Debate' }, desc: { nl: 'Zorg voor 10 discussies met iedereen.', en: 'Take part in 10 healthy debates.' } },
      { id: 'alignment_master', tier: 'gold', icon: '◒', unlock: (d) => d.consensus?.total_rounds >= 20 && consensusRate(d) >= 0.8, progress: null,
        name: { nl: 'Alignment Master', en: 'Alignment Master' }, desc: { nl: 'Team bereikt 20x snel consensus.', en: 'Reach strong team alignment 20 times.' } },
      { id: 'silent_assassin', tier: 'silver', icon: '◉', unlock: () => false, progress: null,
        name: { nl: 'Silent Assassin', en: 'Silent Assassin' }, desc: { nl: 'Stem zonder discussie en zit goed.', en: 'Vote silently and land on target.' } },
    ],
  },
  {
    id: 'flow',
    icon: '◉',
    title: { nl: 'Snelheid & flow', en: 'Speed & flow' },
    badges: [
      { id: 'quick_flip', tier: 'bronze', icon: '⚡', unlock: () => false, progress: null,
        name: { nl: 'Quick Flip', en: 'Quick Flip' }, desc: { nl: 'Stem binnen 3 seconden.', en: 'Vote within 3 seconds.' } },
      { id: 'speed_estimator', tier: 'silver', icon: '20', ...atLeast((d) => d.maxDayRounds || 0, 20),
        name: { nl: 'Speed Estimator', en: 'Speed Estimator' }, desc: { nl: 'Stem snel in 20 rondes.', en: 'Move fast across 20 estimates.' } },
      { id: 'lightning_round', tier: 'gold', icon: '⚡', ...atLeast((d) => d.maxDayRounds || 0, 10),
        name: { nl: 'Lightning Round', en: 'Lightning Round' }, desc: { nl: 'Voltooi een sessie met 10 rondes op 1 dag.', en: 'Complete 10 rounds in a day.' } },
      { id: 'flow_state', tier: 'diamond', icon: '∿', unlock: () => false, progress: null,
        name: { nl: 'Flow State', en: 'Flow State' }, desc: { nl: '10 stories achter elkaar zonder revote.', en: 'Estimate 10 stories in a row without revotes.' } },
    ],
  },
  {
    id: 'consistency',
    icon: '▣',
    title: { nl: 'Consistentie & betrokkenheid', en: 'Consistency & engagement' },
    badges: [
      { id: 'daily_planner', tier: 'silver', icon: '3', ...atLeast((d) => d.streak?.max_streak || 0, 3),
        name: { nl: 'Daily Planner', en: 'Daily Planner' }, desc: { nl: 'Doe 3 dagen op rij mee.', en: 'Join 3 days in a row.' } },
      { id: 'sprint_ritual', tier: 'diamond', icon: '↻', ...atLeast((d) => d.streak?.max_streak || 0, 20),
        name: { nl: 'Sprint Ritual', en: 'Sprint Ritual' }, desc: { nl: 'Doe elke sprint mee aan planning.', en: 'Make planning a steady ritual.' } },
      { id: 'reliable_estimator', tier: 'gold', icon: '20', ...atLeast((d) => d.summary.total_sessions, 20),
        name: { nl: 'Reliable Estimator', en: 'Reliable Estimator' }, desc: { nl: 'Neem deel aan 20 sessies zonder te missen.', en: 'Join 20 sessions.' } },
      { id: 'always_there', tier: 'gold', icon: '50', ...atLeast((d) => d.summary.total_sessions, 50),
        name: { nl: 'Always There', en: 'Always There' }, desc: { nl: '50 sessies aanwezig.', en: 'Attend 50 sessions.' } },
    ],
  },
  {
    id: 'accuracy',
    icon: '◉',
    title: { nl: 'Accuracy & verbetering', en: 'Accuracy & improvement' },
    badges: [
      { id: 'learning_curve', tier: 'bronze', icon: '▥', ...atLeast((d) => d.summary.total_rounds, 5),
        name: { nl: 'Learning Curve', en: 'Learning Curve' }, desc: { nl: 'Verbeter je afwijking over 5 sessies.', en: 'Build accuracy over 5 sessions.' } },
      { id: 'accuracy_builder', tier: 'gold', icon: '◎', ...atLeast((d) => d.consensus?.consensus_rounds || 0, 20),
        name: { nl: 'Accuracy Builder', en: 'Accuracy Builder' }, desc: { nl: '<2 punten afwijking gemiddeld over 20 stories.', en: 'Stay close across 20 stories.' } },
      { id: 'precision_master', tier: 'diamond', icon: '★', ...atLeast((d) => d.consensus?.consensus_rounds || 0, 50),
        name: { nl: 'Precision Master', en: 'Precision Master' }, desc: { nl: '<1 punt afwijking gemiddeld.', en: 'Master precise estimates.' } },
      { id: 'reality_check', tier: 'silver', icon: '○', unlock: () => false, progress: null,
        name: { nl: 'Reality Check', en: 'Reality Check' }, desc: { nl: 'Vergelijk estimates met daadwerkelijke effort.', en: 'Compare estimates with real effort.' } },
      { id: 'estimator_2', tier: 'bronze', icon: '↗', unlock: () => false, progress: null,
        name: { nl: 'Estimator 2.0', en: 'Estimator 2.0' }, desc: { nl: 'Verbeter je accuracy na feedback.', en: 'Improve accuracy after feedback.' } },
    ],
  },
  {
    id: 'roles',
    icon: '♟',
    title: { nl: 'Facilitation & rollen', en: 'Facilitation & roles' },
    badges: [
      { id: 'scrum_starter', tier: 'silver', icon: '⚑', ...atLeast((d) => d.summary.total_sessions, 1),
        name: { nl: 'Scrum Starter', en: 'Scrum Starter' }, desc: { nl: 'Host je eerste sessie.', en: 'Host your first session.' } },
      { id: 'facilitator', tier: 'silver', icon: '♟', ...atLeast((d) => d.summary.total_sessions, 10),
        name: { nl: 'Facilitator', en: 'Facilitator' }, desc: { nl: 'Leid 10 sessies.', en: 'Facilitate 10 sessions.' } },
      { id: 'smooth_operator', tier: 'gold', icon: '👍', unlock: () => false, progress: null,
        name: { nl: 'Smooth Operator', en: 'Smooth Operator' }, desc: { nl: 'Leid een sessie zonder re-votes.', en: 'Run a session without revotes.' } },
      { id: 'time_keeper', tier: 'gold', icon: '⌛', unlock: () => false, progress: null,
        name: { nl: 'Time Keeper', en: 'Time Keeper' }, desc: { nl: 'Houd elke story binnen tijd.', en: 'Keep every story on time.' } },
      { id: 'discussion_master', tier: 'diamond', icon: '★', unlock: () => false, progress: null,
        name: { nl: 'Discussion Master', en: 'Discussion Master' }, desc: { nl: 'Faciliteer 10 constructieve discussies.', en: 'Facilitate 10 constructive discussions.' } },
    ],
  },
  {
    id: 'specials',
    icon: '♢',
    title: { nl: 'Specials & fun', en: 'Specials & fun' },
    badges: [
      { id: 'all_in_estimator', tier: 'gold', icon: '♛', ...atLeast((d) => d.summary.total_rounds, 500),
        name: { nl: 'All-In Estimator', en: 'All-In Estimator' }, desc: { nl: 'Stem altijd het hoogste punt in een sessie.', en: 'Go high when the story calls for it.' } },
      { id: 'lowballer', tier: 'diamond', icon: '↓', ...atLeast((d) => voteCount(d, ['0', '½', '1', 'XS', 'S']), 10),
        name: { nl: 'Lowballer', en: 'Lowballer' }, desc: { nl: 'Stem consequent het laagste.', en: 'Often choose the smallest estimates.' } },
      { id: 'middle_ground', tier: 'silver', icon: '=', ...atLeast((d) => voteCount(d, ['3', '5', '8', 'M']), 10),
        name: { nl: 'Middle Ground', en: 'Middle Ground' }, desc: { nl: 'Kies altijd het midden.', en: 'Often choose the middle.' } },
      { id: 'contrarian', tier: 'diamond', icon: '☻', ...atLeast((d) => voteCount(d, '?'), 10),
        name: { nl: 'Contrarian', en: 'Contrarian' }, desc: { nl: 'Wijkt 10x af van de groep.', en: 'Challenge the group 10 times.' } },
      { id: 'mind_reader', tier: 'diamond', icon: '◉', ...atLeast((d) => d.consensus?.consensus_rounds || 0, 10),
        name: { nl: 'Mind Reader', en: 'Mind Reader' }, desc: { nl: 'Zit 10x exact gelijk met de Product Owner.', en: 'Match the target 10 times.' } },
    ],
  },
  {
    id: 'ultra',
    icon: '◇',
    title: { nl: 'Ultra badges', en: 'Ultra badges' },
    badges: [
      { id: 'estimation_beast', tier: 'diamond', icon: '◈', ...atLeast((d) => d.summary.total_rounds, 500),
        name: { nl: 'Estimation Beast', en: 'Estimation Beast' }, desc: { nl: '500+ stories geschat.', en: 'Estimate 500+ stories.' } },
      { id: 'team_anchor', tier: 'diamond', icon: '⚓', unlock: (d) => d.consensus?.total_rounds >= 100 && consensusRate(d) >= 0.8, progress: null,
        name: { nl: 'Team Anchor', en: 'Team Anchor' }, desc: { nl: 'Altijd aanwezig + hoge accuracy.', en: 'High attendance and high accuracy.' } },
      { id: 'planning_legend', tier: 'diamond', icon: '♕', ...atLeast((d) => d.summary.total_sessions, 100),
        name: { nl: 'Planning Legend', en: 'Planning Legend' }, desc: { nl: '100 sessies + hoge precisie.', en: '100 sessions with strong precision.' } },
      { id: 'agile_master', tier: 'diamond', icon: '◇', unlock: (d) => d.summary.total_rounds >= 100 && consensusRate(d) >= 0.75 && (d.methodsCount || 0) >= 4, progress: null,
        name: { nl: 'Agile Master', en: 'Agile Master' }, desc: { nl: 'Combineert snelheid, accuracy en deelname.', en: 'Blend speed, accuracy, and participation.' } },
      { id: 'perfect_planner', tier: 'gold', icon: '♠', unlock: () => false, progress: null,
        name: { nl: 'Perfect Planner', en: 'Perfect Planner' }, desc: { nl: 'Verdien alle badges.', en: 'Earn every badge.' } },
    ],
  },
];

// ── SVG shield generator ──────────────────────────────────────────────────────

function shieldSvg(tier, icon, unlocked, pct) {
  const [hi, mid, dark, txt] = TIERS[tier] || TIERS.bronze;
  const id = `sh-${Math.random().toString(36).slice(2, 7)}`;

  const outline = 'M50,5 L90,18 L96,58 Q94,94 50,116 Q6,94 4,58 L10,18 Z';
  const bevel = 'M50,11 L84,22 L89,58 Q87,88 50,106 Q13,88 11,58 L16,22 Z';
  const face = 'M50,17 L78,27 L82,58 Q80,82 50,98 Q20,82 18,58 L22,27 Z';
  const iconPlate = 'M50,31 L70,40 L70,63 Q70,80 50,88 Q30,80 30,63 L30,40 Z';

  const grayFilter = unlocked ? '' : `<filter id="gray-${id}"><feColorMatrix type="saturate" values="0"/></filter>`;
  const grayAttr   = unlocked ? '' : `filter="url(#gray-${id})" opacity="0.5"`;

  const circum = 306;
  const dash = pct != null ? `${pct * circum} ${circum}` : '';
  const progressRing = pct != null && unlocked ? `
    <path d="${outline}" fill="none" stroke="${hi}" stroke-width="4"
          stroke-dasharray="${dash}" stroke-linecap="round" opacity="0.95"/>` : '';

  const glowFilter = unlocked ? `
    <filter id="glow-${id}" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3.4" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>` : '';
  const glowAttr = unlocked ? `filter="url(#glow-${id})"` : '';

  const lockIcon = unlocked ? '' : `
    <g opacity="0.72">
      <rect x="66" y="91" width="16" height="13" rx="3" fill="#0f172a" stroke="#e2e8f0" stroke-width="1.4"/>
      <path d="M69,91 v-5 a5,5 0 0 1 10,0 v5" fill="none" stroke="#e2e8f0" stroke-width="1.4"/>
    </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120" role="img">
  <defs>
    <linearGradient id="rim-${id}" x1="0.1" y1="0" x2="0.9" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="18%" stop-color="${hi}"/>
      <stop offset="52%" stop-color="${mid}"/>
      <stop offset="100%" stop-color="${dark}"/>
    </linearGradient>
    <linearGradient id="face-${id}" x1="0.18" y1="0.1" x2="0.82" y2="1">
      <stop offset="0%"   stop-color="${hi}"/>
      <stop offset="36%"  stop-color="${mid}"/>
      <stop offset="100%" stop-color="#111827"/>
    </linearGradient>
    <radialGradient id="shine-${id}" cx="34%" cy="22%" r="58%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.7"/>
      <stop offset="45%" stop-color="#ffffff" stop-opacity="0.1"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow-${id}" x="-30%" y="-20%" width="160%" height="150%">
      <feDropShadow dx="0" dy="5" stdDeviation="3" flood-color="#020617" flood-opacity="0.7"/>
    </filter>
    ${grayFilter}${glowFilter}
  </defs>
  <g ${grayAttr} filter="url(#shadow-${id})">
    <path d="${outline}" fill="url(#rim-${id})" ${glowAttr}/>
    <path d="${bevel}" fill="#020617" opacity="0.58"/>
    <path d="${face}" fill="url(#face-${id})"/>
    <path d="${face}" fill="url(#shine-${id})"/>
    <path d="${bevel}" fill="none" stroke="#ffffff" stroke-width="1.4" opacity="0.38"/>
    <path d="${outline}" fill="none" stroke="#020617" stroke-width="2.2" opacity="0.72"/>
    <path d="${iconPlate}" fill="rgba(2,6,23,.36)" stroke="${hi}" stroke-width="1.5" opacity="0.92"/>
    <path d="M25,30 Q50,17 75,30" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.35"/>
    <text x="50" y="61" font-size="${String(icon).length > 2 ? 21 : 29}" text-anchor="middle" dominant-baseline="middle"
          font-family="Nunito,sans-serif" font-weight="900" fill="${txt}" stroke="#020617" stroke-width="2.6" paint-order="stroke">${icon}</text>
    ${lockIcon}
  </g>
  ${progressRing}
</svg>`;
}

// ── Badge rendering ───────────────────────────────────────────────────────────

function renderBadges(data) {
  const container = document.getElementById('badgesGrid');
  container.innerHTML = '';

  BADGE_GROUPS.forEach((group) => {
    const section = document.createElement('section');
    section.className = 'badge-category';

    const unlockedCount = group.badges.filter((badge) => badge.unlock(data)).length;
    section.innerHTML = `
      <div class="badge-category-header">
        <h3><span>${group.icon}</span>${localText(group.title)}</h3>
        <span class="badge-category-count">${unlockedCount}/${group.badges.length}</span>
      </div>
      <div class="badge-category-grid"></div>
    `;

    const grid = section.querySelector('.badge-category-grid');
    group.badges.forEach((b) => {
      const unlocked = b.unlock(data);
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
      card.className = `badge-card badge-tier-${b.tier}${unlocked ? ' badge-unlocked' : ' badge-locked'}`;
      card.title = `${name}: ${desc}`;
      card.innerHTML = `
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
