// i18n — NL / EN translations

const TRANSLATIONS = {
  nl: {
    'nav.login': 'Inloggen',
    'nav.register': 'Registreren',
    'nav.logout': 'Uitloggen',

    'landing.subtitle': 'Real-time scrum estimaties voor jouw team',
    'landing.anon': '✅ Geen account nodig — gewoon een naam invullen en spelen!',
    'landing.create.title': '✨ Kamer aanmaken',
    'landing.create.yourname': 'Jouw naam',
    'landing.create.yourname.ph': 'bijv. Alice',
    'landing.create.roomname': 'Kamernaam',
    'landing.create.random.title': 'Nieuwe willekeurige naam',
    'landing.create.method': 'Schattingsmethode',
    'landing.create.method.fibonacci': 'Fibonacci 😊',
    'landing.create.method.modified_fibonacci': 'Modified Fibonacci',
    'landing.create.method.tshirt': 'T-shirt maten',
    'landing.create.method.powers_of_2': 'Powers of 2',
    'landing.create.btn': 'Kamer aanmaken →',
    'landing.join.title': '🚪 Kamer joinen',
    'landing.join.code': 'Kamercode',
    'landing.join.code.ph': 'ABC123',
    'landing.join.search': 'Kamer zoeken →',
    'landing.join.searching': 'Zoeken…',
    'landing.join.yourname': 'Jouw naam',
    'landing.join.yourname.ph': 'bijv. Bob',
    'landing.join.back': '← Terug',
    'landing.join.btn': 'Joinen →',
    'landing.join.found': '✅ "{name}" gevonden!',

    'login.tab.login': 'Inloggen',
    'login.tab.register': 'Registreren',
    'login.email': 'E-mailadres',
    'login.email.ph': 'naam@email.nl',
    'login.password': 'Wachtwoord',
    'login.password.ph': '••••••••',
    'login.password.hint': '(min. 8 tekens)',
    'login.btn': 'Inloggen →',
    'login.register.name': 'Naam',
    'login.register.name.ph': 'Jouw naam',
    'login.register.btn': 'Account aanmaken →',
    'login.oauth.divider': 'of ga verder met',

    'dashboard.welcome': 'Welkom terug, {name}!',
    'dashboard.plan_badge': 'Huidig plan: {plan}',
    'dashboard.newroom': '+ Nieuwe kamer',
    'dashboard.modal.title': 'Nieuwe kamer aanmaken',
    'dashboard.modal.roomname': 'Kamernaam',
    'dashboard.modal.method': 'Schattingsmethode',
    'dashboard.modal.cancel': 'Annuleren',
    'dashboard.modal.create': 'Aanmaken →',
    'dashboard.modal.error': 'Vul een kamernaam in',
    'dashboard.rooms.title': 'Mijn kamers',
    'dashboard.rooms.empty': 'Je hebt nog geen kamers. Maak er een aan!',
    'dashboard.rooms.open': 'Openen →',
    'dashboard.rooms.active': 'Actief: {date}',
    'dashboard.rooms.load_error': 'Kamers laden mislukt: {error}',
    'dashboard.rooms.delete_confirm': 'Kamer verwijderen? Dit kan niet ongedaan worden.',
    'dashboard.rooms.delete_error': 'Verwijderen mislukt: {error}',
    'dashboard.rooms.copied': 'Kamercode {id} gekopieerd!',
    'dashboard.plan.title': 'Abonnement',
    'dashboard.plan.upgrade': 'Upgraden',
    'dashboard.plan.free': 'Free',
    'dashboard.plan.rooms_3': '✓ 3 kamers',
    'dashboard.plan.players_5': '✓ 5 deelnemers',
    'dashboard.plan.days_30': '✓ 30 dagen bewaard',
    'dashboard.plan.rooms_20': '✓ 20 kamers',
    'dashboard.plan.players_15': '✓ 15 deelnemers',
    'dashboard.plan.rooms_unlimited': '✓ Onbeperkt kamers',
    'dashboard.plan.players_unlimited': '✓ Onbeperkt deelnemers',
    'dashboard.plan.never_deleted': '✓ Kamers nooit verwijderd',

    'room.name_modal.title': '👋 Wat is jouw naam?',
    'room.name_modal.ph': 'bijv. Alice',
    'room.name_modal.error': 'Vul een naam in',
    'room.name_modal.btn': 'Joinen →',
    'room.overlay.expired': 'Kamer verlopen',
    'room.overlay.expired_msg': 'Deze kamer is niet meer beschikbaar.',
    'room.overlay.home': 'Terug naar home →',
    'room.code_label': 'Code:',
    'ad.label': 'Advertentie',
    'ad.placeholder': 'Hier komt jouw advertentie',
    'ad.upgrade': 'Upgrade naar Pro om advertenties te verwijderen →',
    'room.auth.btn': 'Inloggen / Registreren',
    'room.auth.title': 'Account',
    'room.auth.success': 'Welkom, {name}!',
    'room.share': '🔗 Uitnodigen',
    'room.share.title': 'Kopieer uitnodigingslink',
    'room.share.copy_btn': 'Kopieer',
    'room.share.copied': '✅ Link gekopieerd!',
    'room.share.label': 'Uitnodigingslink',
    'room.reveal': '👁 Reveal',
    'room.new_round': '🔄 Nieuwe ronde',
    'room.pick': 'Kies jouw kaart:',
    'room.revealed': 'Kaarten onthuld!',
    'room.voted': '{voted} van {total} {word} gestemd',
    'room.player_s': 'speler heeft',
    'room.player_p': 'spelers hebben',
    'room.participants_s': '{count} deelnemer',
    'room.participants_p': '{count} deelnemers',
    'room.expired_inactivity': 'Deze gastkamer is verwijderd wegens inactiviteit.',
    'room.expired_other': 'Deze kamer bestaat niet meer.',
    'room.not_found': 'Kamer niet gevonden',
    'room.not_found_msg': 'Deze kamer bestaat niet (meer). Controleer de code of maak een nieuwe kamer aan.',
    'room.full': 'Kamer is vol',
    'room.error': 'Fout',
    'room.error_unknown': 'Er is een onbekende fout opgetreden.',
    'room.stats.consensus': '🎉 Consensus! Iedereen koos hetzelfde.',
    'room.stats.average': 'Gemiddelde',
    'room.stats.min': 'Minimum',
    'room.stats.max': 'Maximum',
    'room.stats.mode': 'Meest gekozen',
    'room.stats.distribution': 'Verdeling',

    'error.name': 'Vul jouw naam in',
    'error.roomname': 'Vul een kamernaam in',
    'error.code': 'Voer een geldige kamercode in',
    'error.room_not_found': 'Kamer niet gevonden. Controleer de code en probeer opnieuw.',
    'oauth.state_invalid': 'OAuth verificatie mislukt, probeer opnieuw.',
    'oauth.failed': 'OAuth inloggen mislukt, probeer opnieuw.',
    'oauth.error': 'Er is een fout opgetreden.',

    'footer.privacy': 'Privacybeleid',
    'footer.terms': 'Algemene voorwaarden',
    'footer.copy': '© 2025 Scrum Fight',
    'footer.login': 'Inloggen',
    'footer.register': 'Registreren',
  },
  en: {
    'nav.login': 'Log in',
    'nav.register': 'Sign up',
    'nav.logout': 'Log out',

    'landing.subtitle': 'Real-time scrum estimates for your team',
    'landing.anon': '✅ No account needed — just enter a name and play!',
    'landing.create.title': '✨ Create room',
    'landing.create.yourname': 'Your name',
    'landing.create.yourname.ph': 'e.g. Alice',
    'landing.create.roomname': 'Room name',
    'landing.create.random.title': 'Generate random name',
    'landing.create.method': 'Estimation method',
    'landing.create.method.fibonacci': 'Fibonacci 😊',
    'landing.create.method.modified_fibonacci': 'Modified Fibonacci',
    'landing.create.method.tshirt': 'T-shirt sizes',
    'landing.create.method.powers_of_2': 'Powers of 2',
    'landing.create.btn': 'Create room →',
    'landing.join.title': '🚪 Join room',
    'landing.join.code': 'Room code',
    'landing.join.code.ph': 'ABC123',
    'landing.join.search': 'Find room →',
    'landing.join.searching': 'Searching…',
    'landing.join.yourname': 'Your name',
    'landing.join.yourname.ph': 'e.g. Bob',
    'landing.join.back': '← Back',
    'landing.join.btn': 'Join →',
    'landing.join.found': '✅ "{name}" found!',

    'login.tab.login': 'Log in',
    'login.tab.register': 'Sign up',
    'login.email': 'Email address',
    'login.email.ph': 'name@email.com',
    'login.password': 'Password',
    'login.password.ph': '••••••••',
    'login.password.hint': '(min. 8 characters)',
    'login.btn': 'Log in →',
    'login.register.name': 'Name',
    'login.register.name.ph': 'Your name',
    'login.register.btn': 'Create account →',
    'login.oauth.divider': 'or continue with',

    'dashboard.welcome': 'Welcome back, {name}!',
    'dashboard.plan_badge': 'Current plan: {plan}',
    'dashboard.newroom': '+ New room',
    'dashboard.modal.title': 'Create new room',
    'dashboard.modal.roomname': 'Room name',
    'dashboard.modal.method': 'Estimation method',
    'dashboard.modal.cancel': 'Cancel',
    'dashboard.modal.create': 'Create →',
    'dashboard.modal.error': 'Enter a room name',
    'dashboard.rooms.title': 'My rooms',
    'dashboard.rooms.empty': "You don't have any rooms yet. Create one!",
    'dashboard.rooms.open': 'Open →',
    'dashboard.rooms.active': 'Active: {date}',
    'dashboard.rooms.load_error': 'Failed to load rooms: {error}',
    'dashboard.rooms.delete_confirm': 'Delete room? This cannot be undone.',
    'dashboard.rooms.delete_error': 'Delete failed: {error}',
    'dashboard.rooms.copied': 'Room code {id} copied!',
    'dashboard.plan.title': 'Subscription',
    'dashboard.plan.upgrade': 'Upgrade',
    'dashboard.plan.free': 'Free',
    'dashboard.plan.rooms_3': '✓ 3 rooms',
    'dashboard.plan.players_5': '✓ 5 participants',
    'dashboard.plan.days_30': '✓ Saved for 30 days',
    'dashboard.plan.rooms_20': '✓ 20 rooms',
    'dashboard.plan.players_15': '✓ 15 participants',
    'dashboard.plan.rooms_unlimited': '✓ Unlimited rooms',
    'dashboard.plan.players_unlimited': '✓ Unlimited participants',
    'dashboard.plan.never_deleted': '✓ Rooms never deleted',

    'room.name_modal.title': '👋 What is your name?',
    'room.name_modal.ph': 'e.g. Alice',
    'room.name_modal.error': 'Please enter a name',
    'room.name_modal.btn': 'Join →',
    'room.overlay.expired': 'Room expired',
    'room.overlay.expired_msg': 'This room is no longer available.',
    'room.overlay.home': 'Back to home →',
    'room.code_label': 'Code:',
    'ad.label': 'Advertisement',
    'ad.placeholder': 'Your ad goes here',
    'ad.upgrade': 'Upgrade to Pro to remove ads →',
    'room.auth.btn': 'Log in / Sign up',
    'room.auth.title': 'Account',
    'room.auth.success': 'Welcome, {name}!',
    'room.share': '🔗 Invite',
    'room.share.title': 'Copy invite link',
    'room.share.copy_btn': 'Copy',
    'room.share.copied': '✅ Link copied!',
    'room.share.label': 'Invite link',
    'room.reveal': '👁 Reveal',
    'room.new_round': '🔄 New round',
    'room.pick': 'Pick your card:',
    'room.revealed': 'Cards revealed!',
    'room.voted': '{voted} of {total} {word} voted',
    'room.player_s': 'player has',
    'room.player_p': 'players have',
    'room.participants_s': '{count} participant',
    'room.participants_p': '{count} participants',
    'room.expired_inactivity': 'This guest room was removed due to inactivity.',
    'room.expired_other': 'This room no longer exists.',
    'room.not_found': 'Room not found',
    'room.not_found_msg': 'This room does not exist. Check the code or create a new room.',
    'room.full': 'Room is full',
    'room.error': 'Error',
    'room.error_unknown': 'An unknown error occurred.',
    'room.stats.consensus': '🎉 Consensus! Everyone chose the same.',
    'room.stats.average': 'Average',
    'room.stats.min': 'Minimum',
    'room.stats.max': 'Maximum',
    'room.stats.mode': 'Most chosen',
    'room.stats.distribution': 'Distribution',

    'error.name': 'Please enter your name',
    'error.roomname': 'Please enter a room name',
    'error.code': 'Enter a valid room code',
    'error.room_not_found': 'Room not found. Check the code and try again.',
    'oauth.state_invalid': 'OAuth verification failed, please try again.',
    'oauth.failed': 'OAuth sign in failed, please try again.',
    'oauth.error': 'An error occurred.',

    'footer.privacy': 'Privacy Policy',
    'footer.terms': 'Terms & Conditions',
    'footer.copy': '© 2025 Scrum Fight',
    'footer.login': 'Log in',
    'footer.register': 'Sign up',
  },
};

// ── Core ──────────────────────────────────────────────────────────────────────

const SUPPORTED = ['nl', 'en'];
const DEFAULT_LANG = 'en';

function detectLang() {
  const stored = localStorage.getItem('lang');
  if (stored && SUPPORTED.includes(stored)) return stored;
  const browser = (navigator.language || '').slice(0, 2).toLowerCase();
  return SUPPORTED.includes(browser) ? browser : DEFAULT_LANG;
}

let currentLang = detectLang();

function t(key, vars = {}) {
  const dict = TRANSLATIONS[currentLang] || TRANSLATIONS[DEFAULT_LANG];
  let str = dict[key] ?? TRANSLATIONS[DEFAULT_LANG][key] ?? key;
  for (const [k, v] of Object.entries(vars)) {
    str = str.replaceAll(`{${k}}`, v);
  }
  return str;
}

function setLang(lang) {
  if (!SUPPORTED.includes(lang)) return;
  currentLang = lang;
  localStorage.setItem('lang', lang);
  applyTranslations();
  updateLangSwitcher();
}

function getLang() { return currentLang; }

// ── DOM application ───────────────────────────────────────────────────────────

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPh);
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  document.documentElement.lang = currentLang;
}

const LANG_META = {
  nl: { flag: '🇳🇱', label: 'NL' },
  en: { flag: '🇬🇧', label: 'EN' },
};

function buildLangDropdown(container) {
  container.innerHTML = '';
  container.classList.add('lang-dropdown');

  const toggle = document.createElement('button');
  toggle.className = 'lang-toggle';
  toggle.type = 'button';

  const menu = document.createElement('div');
  menu.className = 'lang-menu hidden';

  SUPPORTED.forEach((lang) => {
    const { flag, label } = LANG_META[lang];
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'lang-option';
    option.dataset.lang = lang;
    option.innerHTML = `<span class="lang-flag">${flag}</span><span class="lang-code">${label}</span>`;
    option.addEventListener('click', () => {
      setLang(lang);
      menu.classList.add('hidden');
    });
    menu.appendChild(option);
  });

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('hidden');
  });

  container.appendChild(toggle);
  container.appendChild(menu);

  updateLangSwitcher();
}

function updateLangSwitcher() {
  document.querySelectorAll('.lang-dropdown').forEach((container) => {
    const { flag, label } = LANG_META[currentLang];
    const toggle = container.querySelector('.lang-toggle');
    if (toggle) {
      toggle.innerHTML = `<span class="lang-flag">${flag}</span><span class="lang-code">${label}</span><span class="lang-arrow">▾</span>`;
    }
    container.querySelectorAll('.lang-option').forEach((opt) => {
      opt.classList.toggle('lang-option-active', opt.dataset.lang === currentLang);
    });
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.lang-switcher').forEach(buildLangDropdown);
  applyTranslations();

  document.addEventListener('click', () => {
    document.querySelectorAll('.lang-menu').forEach((m) => m.classList.add('hidden'));
  });
});
