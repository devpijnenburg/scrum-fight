const user = getCurrentUser();
if (!user) window.location.href = '/login.html';

updateNavbar();

// ── Emoji categories ──────────────────────────────────────────────────────────

const EMOJI_CATEGORIES = [
  {
    label: '😀 Smileys',
    emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','😟','🙁','☹','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠','💩','🤡','👹','👺','👻','👽','👾','🤖'],
  },
  {
    label: '👋 Mensen',
    emojis: ['👋','🤚','🖐','✋','🖖','🤙','👌','🤌','🤏','✌','🤞','🤟','🤘','👈','👉','👆','👇','☝','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','✍','💅','💪','🦾','🦵','🦶','👂','🦻','👃','🧠','🦷','🦴','👀','👁','👅','💋','👶','🧒','👦','👧','🧑','👱','👨','🧔','👩','🧓','👴','👵','🙍','🙎','🙅','🙆','💁','🙋','🧏','🙇','🤦','🤷','💆','💇','🚶','🧍','🧎','🏃','💃','🕺','🧘','🛀'],
  },
  {
    label: '🐶 Dieren',
    emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐽','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🦗','🦟','🦂','🐢','🐍','🦎','🐊','🦖','🦕','🐉','🐲','🦭','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐈','🐓','🦃','🦤','🦚','🦜','🦢','🦩','🕊','🐇','🦝','🦨','🦡','🦫','🦦','🦥','🐁','🐀','🐿','🦔','🐾'],
  },
  {
    label: '🌿 Natuur',
    emojis: ['🌵','🎄','🌲','🌳','🌴','🪵','🌱','🌿','☘','🍀','🎍','🪴','🎋','🍃','🍂','🍁','🍄','🌾','💐','🌷','🌹','🥀','🌺','🌸','🌼','🌻','🌞','🌛','🌜','🌚','🌕','🌙','⭐','🌟','💫','✨','☄','🌈','⛅','❄','☃','⛄','🌬','🌀','🌊','🔥','💧','🌍','🌎','🌏','🌋','⛰','🏔'],
  },
  {
    label: '🍎 Eten',
    emojis: ['🍎','🍊','🍋','🍌','🍍','🥭','🍑','🍒','🍓','🫐','🥝','🍅','🫒','🥥','🥑','🍆','🥕','🌽','🌶','🥒','🥬','🥦','🧄','🧅','🍄','🌰','🥜','🍞','🥐','🥖','🥨','🥞','🧇','🧀','🍖','🍗','🥩','🥓','🌭','🍔','🍟','🍕','🌮','🌯','🥙','🥚','🍳','🥘','🍲','🥗','🍿','🍱','🍣','🍤','🍙','🍚','🍛','🍜','🍝','🍡','🥟','🦀','🦞','🦐','🦑','🦪','🍦','🍧','🍨','🍩','🍪','🎂','🍰','🧁','🍫','🍬','🍭','🍯','🥛','☕','🍵','🧃','🥤','🧋','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧊'],
  },
  {
    label: '⚽ Sport',
    emojis: ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🏓','🏸','⛳','🏹','🎣','🤿','🎿','🛷','🥌','🎯','🪀','🪁','🎮','🕹','🎰','🎲','♟','🧩','🏆','🥇','🥈','🥉','🎖','🏅','🎗','🎫','🎟','🎭','🎨','🎪','🎤','🎧','🎼','🎹','🎷','🎺','🎸','🎻','🥁','🎵','🎶','🎬','🎥'],
  },
  {
    label: '✈️ Reizen',
    emojis: ['🚗','🚕','🚙','🚌','🚎','🏎','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🛵','🚲','🛴','🛹','🛼','⚓','⛵','🚤','🛥','🛳','⛴','🚢','✈','🛩','🚁','🛸','🛰','🪂','💺','🌐','🗺','🧭','🏕','🏖','🏜','🏝','🏞','🏟','🏛','🏗','🏠','🏡','🏢','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','🏯','🏰','💒','🗼','🗽','⛪','🕌','🛕','⛩','🕍','⛲','🌁','🌃','🏙','🌄','🌅','🌆','🌇','🌉','🌌','🎇','🎆'],
  },
  {
    label: '⚔️ Objecten',
    emojis: ['⌚','📱','💻','⌨','🖥','📷','📸','📹','🎥','📡','🔋','🔌','💡','🔦','🕯','💰','💵','💳','🔮','💎','🔑','🗝','🔨','🪓','⛏','⚒','🛠','🗡','⚔','🛡','🔧','🔩','🪛','⚙','🔗','⛓','🧲','🪜','🧰','🔭','🔬','💊','💉','🩹','🩺','🏷','📩','📧','💌','📦','📫','✏','✒','📝','📌','📍','✂','🔒','🔓','🔐','🎃','🎉','🎊','🎈','🎀','🎁','🪄','🧸','🖼','🧵','🧶','🪞','🪟','🛋','🪑','🚿','🛁','🧹','🧺','🧻','🧼','🧽','🛒'],
  },
  {
    label: '❤️ Symbolen',
    emojis: ['❤','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣','💕','💞','💓','💗','💖','💘','💝','💟','☮','✝','☪','🕉','☸','✡','🔯','🛐','♻','✅','❌','☑','✔','🔰','💯','🔱','⚜','♾','🆘','🆒','🆕','🅰','🅱','🅾','🅿','⭕','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔶','🔷','🔸','🔹','🔺','🔻','💠','🔘','🏁','🚩','🎌','🏴','🏳','💤','⚠','♿','🔃','🔄'],
  },
];

// ── Profile data ──────────────────────────────────────────────────────────────

let _totpSecret = null;
let _currentEmoticon = '⚔️';

const PROFILE_PLANS = [
  {
    key: 'free',
    name: 'Free',
    features: ['Sla 3 kamers op', '5 deelnemers', '30 dagen bewaard'],
  },
  {
    key: 'pro',
    name: 'Pro',
    features: ['Sla 20 kamers op', '15 deelnemers', '30 dagen bewaard'],
  },
  {
    key: 'premium',
    name: 'Premium',
    features: ['Sla onbeperkt kamers op', 'Onbeperkt deelnemers', 'Kamers nooit verwijderd'],
    premium: true,
  },
];

const PLAN_RANK = { free: 0, pro: 1, premium: 2 };

let _profileBilling = 'yearly';

function renderSubscriptionSection(currentPlan, subscriptionDate) {
  // Status line
  const statusEl = document.getElementById('subscriptionStatus');
  if (subscriptionDate && currentPlan !== 'free') {
    const dateStr = new Date(subscriptionDate).toLocaleDateString('nl-NL', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    statusEl.innerHTML = `<p class="text-muted" style="font-size:.9rem">Laatste betaling: <strong style="color:var(--text)">${dateStr}</strong></p>`;
  } else {
    statusEl.innerHTML = '';
  }

  // Billing toggle (only relevant for upgrade options)
  const hasUpgradeOptions = PLAN_RANK[currentPlan] < PLAN_RANK['premium'];
  const cardsEl = document.getElementById('subscriptionPlanCards');

  const toggleHtml = hasUpgradeOptions ? `
    <div class="billing-toggle" id="profileBillingToggle" style="margin-bottom:1rem">
      <button class="billing-toggle-btn" data-billing="monthly">Maandelijks</button>
      <button class="billing-toggle-btn billing-toggle-btn--active" data-billing="yearly">
        Jaarlijks <span class="billing-save-badge">Bespaar ~17%</span>
      </button>
    </div>` : '';

  // Plan cards
  const cardsHtml = PROFILE_PLANS.map((plan) => {
    const isActive = plan.key === currentPlan;
    const canUpgrade = !isActive && PLAN_RANK[plan.key] > PLAN_RANK[currentPlan] && plan.key !== 'free';
    return `
      <div class="plan-card${plan.premium ? ' plan-card-premium' : ''}" data-plan="${plan.key}"${isActive ? ' data-active="true"' : ''}>
        ${plan.premium ? '<div class="plan-badge">⭐ Premium</div>' : ''}
        <div class="plan-name">${plan.name}</div>
        <ul class="plan-features">
          ${plan.features.map((f) => `<li>✓ ${f}</li>`).join('')}
        </ul>
        ${canUpgrade ? `<button class="btn btn-primary btn-sm plan-upgrade-btn" data-target="${plan.key}">Upgraden</button>` : ''}
      </div>`;
  }).join('');

  cardsEl.innerHTML = toggleHtml + `<div class="plan-cards">${cardsHtml}</div>`;

  // Wire billing toggle
  cardsEl.querySelectorAll('.billing-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      _profileBilling = btn.dataset.billing;
      cardsEl.querySelectorAll('.billing-toggle-btn').forEach((b) =>
        b.classList.toggle('billing-toggle-btn--active', b.dataset.billing === _profileBilling)
      );
    });
  });

  // Wire upgrade buttons
  cardsEl.querySelectorAll('.plan-upgrade-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const plan = btn.dataset.target;
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Laden…';
      try {
        const { url } = await apiFetch('/payments/checkout', {
          method: 'POST',
          body: JSON.stringify({ plan, billing: _profileBilling }),
        });
        window.location.href = url;
      } catch (err) {
        btn.disabled = false;
        btn.textContent = originalText;
        alert(err.message || 'Kon de betaalpagina niet openen. Probeer het later opnieuw.');
      }
    });
  });
}

async function loadProfile() {
  const data = await apiFetch('/auth/me');
  document.getElementById('profileSubtitle').textContent = data.email || data.name;
  document.getElementById('profileName').textContent = data.name;
  document.getElementById('profileEmail').textContent = data.email || '—';
  document.getElementById('profileAuth').textContent = data.oauth_provider
    ? data.oauth_provider.charAt(0).toUpperCase() + data.oauth_provider.slice(1)
    : 'E-mail / wachtwoord';
  document.getElementById('profilePlan').textContent = data.plan.toUpperCase();
  setTotpState(data.totp_enabled);

  renderSubscriptionSection(data.plan, data.subscription_date);

  _currentEmoticon = data.emoticon || '⚔️';
  document.getElementById('emoticonPreviewIcon').textContent = _currentEmoticon;
  document.getElementById('emoticonPreviewName').textContent = data.name;
  updateEmoticonSelection(_currentEmoticon);
}

// ── Emoticon picker ───────────────────────────────────────────────────────────

let _activeCategory = 0;

function buildEmoticonPicker() {
  const tabsEl = document.getElementById('emoticonTabs');
  const gridEl = document.getElementById('emoticonGrid');

  EMOJI_CATEGORIES.forEach((cat, idx) => {
    const tab = document.createElement('button');
    tab.className = `emoticon-tab${idx === 0 ? ' active' : ''}`;
    tab.textContent = cat.label.split(' ')[0];
    tab.title = cat.label;
    tab.addEventListener('click', () => {
      _activeCategory = idx;
      tabsEl.querySelectorAll('.emoticon-tab').forEach((t, i) => t.classList.toggle('active', i === idx));
      renderEmoticonGrid(idx);
    });
    tabsEl.appendChild(tab);
  });

  renderEmoticonGrid(0);
}

function renderEmoticonGrid(catIdx) {
  const gridEl = document.getElementById('emoticonGrid');
  gridEl.innerHTML = '';
  EMOJI_CATEGORIES[catIdx].emojis.forEach((emoji) => {
    const btn = document.createElement('button');
    btn.className = `emoticon-btn${emoji === _currentEmoticon ? ' selected' : ''}`;
    btn.textContent = emoji;
    btn.title = emoji;
    btn.addEventListener('click', () => selectEmoticon(emoji));
    gridEl.appendChild(btn);
  });
}

function updateEmoticonSelection(emoticon) {
  document.querySelectorAll('.emoticon-btn').forEach((btn) => {
    btn.classList.toggle('selected', btn.textContent === emoticon);
  });
}

async function selectEmoticon(emoji) {
  _currentEmoticon = emoji;
  document.getElementById('emoticonPreviewIcon').textContent = emoji;
  updateEmoticonSelection(emoji);

  const statusEl = document.getElementById('emoticonStatus');
  statusEl.classList.add('hidden');
  try {
    await apiFetch('/profile/emoticon', {
      method: 'PUT',
      body: JSON.stringify({ emoticon: emoji }),
    });
  } catch (ex) {
    statusEl.textContent = 'Fout bij opslaan: ' + ex.message;
    statusEl.classList.remove('hidden');
  }
}

// ── Settings (merged) ─────────────────────────────────────────────────────────

const SETTINGS_KEY = 'sfSettings';

function loadSettingsIntoForm() {
  let settings = {};
  try { settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { /* ignore */ }
  document.getElementById('settingAnalyticsAuto').checked = settings.analyticsAutoOpen !== false;
  document.getElementById('settingDefaultMethod').value   = settings.defaultMethod || '';
}

document.getElementById('saveSettingsBtn').addEventListener('click', () => {
  let settings = {};
  try { settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { /* ignore */ }
  settings.analyticsAutoOpen = document.getElementById('settingAnalyticsAuto').checked;
  settings.defaultMethod     = document.getElementById('settingDefaultMethod').value;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));

  const statusEl = document.getElementById('settingsSaveStatus');
  statusEl.classList.remove('hidden');
  setTimeout(() => statusEl.classList.add('hidden'), 2000);
});

// ── 2FA ───────────────────────────────────────────────────────────────────────

function setTotpState(enabled) {
  document.getElementById('totpDisabled').classList.toggle('hidden', enabled);
  document.getElementById('totpEnabled').classList.toggle('hidden', !enabled);
  document.getElementById('totpSetup').classList.add('hidden');
  document.getElementById('totpDisableConfirm').classList.add('hidden');
}

document.getElementById('totpSetupBtn').addEventListener('click', async () => {
  document.getElementById('totpDisabled').classList.add('hidden');
  document.getElementById('totpSetup').classList.remove('hidden');
  try {
    const { secret, qrDataUrl } = await apiFetch('/profile/totp/setup');
    _totpSecret = secret;
    document.getElementById('totpQr').src = qrDataUrl;
    document.getElementById('totpSecret').textContent = secret;
    document.getElementById('totpEnableCode').focus();
  } catch (ex) {
    alert('Fout bij ophalen QR-code: ' + ex.message);
    setTotpState(false);
  }
});

document.getElementById('totpSetupCancelBtn').addEventListener('click', () => {
  _totpSecret = null;
  setTotpState(false);
});

document.getElementById('totpEnableBtn').addEventListener('click', async () => {
  const err = document.getElementById('totpEnableError');
  err.classList.add('hidden');
  const code = document.getElementById('totpEnableCode').value.trim();
  try {
    await apiFetch('/profile/totp/enable', {
      method: 'POST',
      body: JSON.stringify({ secret: _totpSecret, code }),
    });
    _totpSecret = null;
    setTotpState(true);
  } catch (ex) {
    err.textContent = ex.message;
    err.classList.remove('hidden');
  }
});

document.getElementById('totpEnableCode').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('totpEnableBtn').click();
});

document.getElementById('totpDisableBtn').addEventListener('click', () => {
  document.getElementById('totpEnabled').classList.add('hidden');
  document.getElementById('totpDisableConfirm').classList.remove('hidden');
  document.getElementById('totpDisableCode').focus();
});

document.getElementById('totpDisableCancelBtn').addEventListener('click', () => {
  setTotpState(true);
});

document.getElementById('totpDisableConfirmBtn').addEventListener('click', async () => {
  const err = document.getElementById('totpDisableError');
  err.classList.add('hidden');
  const code = document.getElementById('totpDisableCode').value.trim();
  try {
    await apiFetch('/profile/totp/disable', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    setTotpState(false);
  } catch (ex) {
    err.textContent = ex.message;
    err.classList.remove('hidden');
  }
});

document.getElementById('totpDisableCode').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('totpDisableConfirmBtn').click();
});

// ── Init ──────────────────────────────────────────────────────────────────────

buildEmoticonPicker();
loadSettingsIntoForm();
loadProfile();
