// Profile page: account details, emoticon, preferences and 2FA (entry module of profile.html).

import '../core/errorReporter.js'; // als eerste: meldt ook fouten van de modules hieronder
import '../components/siteChrome.js';
import '../ui/methodSelect.js';
import { t, getLang } from '../core/i18n.js';
import { apiFetch } from '../core/api.js';
import { paymentsEnabled } from '../core/payments.js';
import { planName, planShieldUrl } from '../core/plans.js';
import { getCurrentUser } from '../core/auth.js';
import { loadSettings, saveSettings } from '../core/settings.js';
import { showToast } from '../ui/toast.js';

const user = getCurrentUser();

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

async function loadProfile() {
  const data = await apiFetch('/auth/me');
  document.getElementById('profileSubtitle').textContent = data.email || data.name;
  document.getElementById('profileName').textContent = data.name;
  document.getElementById('profileEmail').textContent = data.email || '—';
  document.getElementById('profileAuth').textContent = data.oauth_provider
    ? data.oauth_provider.charAt(0).toUpperCase() + data.oauth_provider.slice(1)
    : 'E-mail / wachtwoord';
  document.getElementById('profilePlan').textContent = data.plan.toUpperCase();
  const emblem = document.getElementById('profilePlanEmblem');
  if (planShieldUrl(data.plan)) {
    emblem.src = planShieldUrl(data.plan);
    emblem.alt = t('plans.emblem_alt', { plan: planName(data.plan) });
    emblem.classList.remove('hidden');
  }
  setTotpState(data.totp_enabled);
  loadSubscription(data.plan);

  _currentEmoticon = data.emoticon || '⚔️';
  document.getElementById('emoticonPreviewIcon').textContent = _currentEmoticon;
  document.getElementById('emoticonPreviewName').textContent = data.name;
  updateEmoticonSelection(_currentEmoticon);
}

// ── Subscription ──────────────────────────────────────────────────────────────

// A short summary; choosing, changing and cancelling happen on the subscription page.
async function loadSubscription(plan) {
  const textEl = document.getElementById('profileSubscriptionText');
  const linkEl = document.getElementById('profileSubscriptionLink');
  textEl.textContent = t('profile.subscription.free');
  linkEl.textContent = t('profile.subscription.view');

  let subscription = null;
  try {
    ({ subscription } = await apiFetch('/payments/subscription'));
  } catch {
    // Without subscription details the plan name below is still correct.
  }

  if (plan === 'free' && !subscription) {
    // Nothing to buy or manage while the payments feature is off.
    linkEl.classList.toggle('hidden', !(await paymentsEnabled()));
    return;
  }
  linkEl.textContent = t('subscription.manage');
  const planName = (subscription?.plan || plan).toUpperCase();
  let text = t('profile.subscription.paid', { plan: planName });
  if (subscription?.currentPeriodEnd) {
    const date = new Date(subscription.currentPeriodEnd).toLocaleDateString(
      getLang() === 'nl' ? 'nl-NL' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    text += ` ${t(subscription.endsAtPeriodEnd ? 'subscription.status.ends' : 'subscription.status.renews', { date })}`;
  }
  textEl.textContent = text;
}

// ── Emoticon picker ───────────────────────────────────────────────────────────

function buildEmoticonPicker() {
  const tabsEl = document.getElementById('emoticonTabs');

  EMOJI_CATEGORIES.forEach((cat, idx) => {
    const tab = document.createElement('button');
    tab.className = `emoticon-tab${idx === 0 ? ' active' : ''}`;
    tab.textContent = cat.label.split(' ')[0];
    tab.title = cat.label;
    tab.addEventListener('click', () => {
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

function loadSettingsIntoForm() {
  const settings = loadSettings();
  document.getElementById('settingAnalyticsAuto').checked = settings.analyticsAutoOpen !== false;
  document.getElementById('settingDefaultMethod').value   = settings.defaultMethod || '';
}

document.getElementById('saveSettingsBtn').addEventListener('click', () => {
  saveSettings({
    analyticsAutoOpen: document.getElementById('settingAnalyticsAuto').checked,
    defaultMethod:     document.getElementById('settingDefaultMethod').value,
  });

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
    showToast('Fout bij ophalen QR-code: ' + ex.message, { icon: '⚠️' });
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

if (!user) {
  window.location.href = '/login.html';
} else {
  buildEmoticonPicker();
  loadSettingsIntoForm();
  loadProfile();
}
