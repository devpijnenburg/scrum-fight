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
    'room.menu.analytics': 'Analyse',
    'room.menu.language': 'Taal',
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

    'room.analytics.toggle_title': 'Analyse',
    'room.analytics.title': '📊 Analyse',
    'room.analytics.current_round': 'Huidige ronde',
    'room.analytics.history': 'Vorige rondes',
    'room.analytics.empty': 'Nog geen rondes gespeeld.',
    'room.analytics.consensus_full': '🎉 Volledige consensus',
    'room.analytics.consensus_close': '⚡ Dicht bij elkaar',
    'room.analytics.consensus_spread': '⚠️ Grote spreiding',
    'room.analytics.just_now': 'zojuist',
    'room.analytics.mins_ago': '{n} min geleden',
    'room.analytics.hrs_ago': '{n} uur geleden',

    'room.settings.toggle_title': 'Instellingen',
    'room.settings.title': '⚙️ Instellingen',
    'room.settings.analytics_auto': 'Analyse automatisch openen bij reveal',
    'room.settings.default_method': 'Favoriete schattingsmethode',
    'room.settings.method_none': 'Geen voorkeur',
    'room.settings.save': 'Opslaan',
    'room.settings.shortcuts_label': 'Toetsenbordsnelkoppelingen',
    'room.settings.shortcut_cards': 'kaart kiezen',
    'room.settings.shortcut_reveal': 'reveal',
    'room.settings.shortcut_new': 'nieuwe ronde',

    'nav.dashboard': 'Dashboard',
    'nav.stats': 'Statistieken',

    'stats.title': '📊 Mijn statistieken',
    'stats.loading': 'Statistieken laden…',
    'stats.error': 'Kon statistieken niet laden.',
    'stats.empty': 'Nog geen statistieken. Speel een paar rondes om je eerste data te zien!',
    'stats.empty_cta': 'Kamer aanmaken →',
    'stats.member_since': 'Speelt sinds {date}',
    'stats.total_rounds': 'Rondes gespeeld',
    'stats.total_sessions': 'Sessies',
    'stats.fav_card': 'Favoriete kaart',
    'stats.avg_vote': 'Gemiddelde stem',
    'stats.dist_title': 'Stemverdeling',
    'stats.dist_desc': 'Hoe vaak koos jij elke kaartwaarde',
    'stats.activity_title': 'Activiteit',
    'stats.activity_desc': 'Rondes per dag (laatste 90 dagen)',
    'stats.heatmap_title': 'Activiteitsheatmap',
    'stats.heatmap_desc': 'Meest actieve dagen de afgelopen 3 maanden',
    'stats.heatmap_less': 'Minder',
    'stats.heatmap_more': 'Meer',
    'stats.hours_title': 'Actieve uren',
    'stats.hours_desc': 'Op welk tijdstip poker je het meest',

    'stats.personality.label': 'Poker-persoonlijkheid',
    'stats.personality.coffee': 'De Koffie-liefhebber',
    'stats.personality.coffee.desc': 'Jij denkt dat pauzes de beste schatting zijn.',
    'stats.personality.agnostic': 'De Twijfelaar',
    'stats.personality.agnostic.desc': 'Als je het niet weet, zeg je het eerlijk.',
    'stats.personality.minimalist': 'De Voorzichtige',
    'stats.personality.minimalist.desc': 'Jij schat altijd conservatief — beter te weinig dan te veel.',
    'stats.personality.maximalist': 'De Optimist',
    'stats.personality.maximalist.desc': 'Vol gas! Jij denkt groot en schat hoog.',
    'stats.personality.middleground': 'Het Midden',
    'stats.personality.middleground.desc': 'Jij zoekt altijd de gulden middenweg.',
    'stats.personality.fashionista': 'De Fashionista',
    'stats.personality.fashionista.desc': 'T-shirt maten? Dat is jouw ding.',

    'stats.streak_label': 'Huidige streak 🔥',
    'stats.streak_best': 'Beste: {n} dagen',
    'stats.consensus_label': 'Consensus rate',
    'stats.consensus_of': '{n} van {total} rondes',

    'stats.badges_title': 'Planning Poker badges & achievements',
    'stats.badges_desc': 'Verdien badges door stories te schatten, samen te werken en je team naar een hoger niveau te tillen.',

    'stats.badge.first_round': 'Eerste ronde',
    'stats.badge.first_round.desc': 'Speel je allereerste ronde.',
    'stats.badge.regular': 'Vaste speler',
    'stats.badge.regular.desc': 'Speel 25 rondes.',
    'stats.badge.veteran': 'Veteraan',
    'stats.badge.veteran.desc': 'Speel 100 rondes.',
    'stats.badge.grandmaster': 'Grootmeester',
    'stats.badge.grandmaster.desc': 'Speel 500 rondes.',
    'stats.badge.legend': 'Legende',
    'stats.badge.legend.desc': 'Speel 1000 rondes. Jij bent onsterfelijk.',
    'stats.badge.explorer': 'Ontdekker',
    'stats.badge.explorer.desc': 'Neem deel aan 5 verschillende sessies.',
    'stats.badge.globetrotter': 'Globetrotter',
    'stats.badge.globetrotter.desc': 'Neem deel aan 20 verschillende sessies.',
    'stats.badge.on_fire': 'On Fire',
    'stats.badge.on_fire.desc': '7 dagen op rij gespeeld.',
    'stats.badge.dedicated': 'Toegewijd',
    'stats.badge.dedicated.desc': '30 dagen op rij gespeeld.',
    'stats.badge.early_bird': 'Vroege vogel',
    'stats.badge.early_bird.desc': 'Poker voor 08:00 uur.',
    'stats.badge.night_owl': 'Nachtuil',
    'stats.badge.night_owl.desc': 'Poker na 22:00 uur.',
    'stats.badge.barista': 'Barista',
    'stats.badge.barista.desc': 'Kies 5× de koffie-kaart ☕.',
    'stats.badge.doubter': 'Twijfelaar',
    'stats.badge.doubter.desc': 'Kies 10× het vraagteken.',
    'stats.badge.allrounder': 'Allrounder',
    'stats.badge.allrounder.desc': 'Gebruik alle 4 schattingsmethoden.',
    'stats.badge.team_player': 'Teamspeler',
    'stats.badge.team_player.desc': 'Stem 70% van de tijd gelijk aan het team (min. 10 rondes).',
    'stats.badge.unicorn': 'Eenhoorn',
    'stats.badge.unicorn.desc': 'Kies 50× het vraagteken. Jij bent uniek.',
    'stats.badge.zombie': 'Zombie',
    'stats.badge.zombie.desc': 'Poker tussen 00:00 en 04:00. Slaap jij nooit?',
    'stats.badge.coffee_addict': 'Koffiejunk',
    'stats.badge.coffee_addict.desc': 'Kies 20× de koffie-kaart ☕.',
    'stats.badge.speedrunner': 'Speedrunner',
    'stats.badge.speedrunner.desc': 'Speel 10 rondes op één dag.',
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
    'room.menu.analytics': 'Analytics',
    'room.menu.language': 'Language',
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

    'room.analytics.toggle_title': 'Analytics',
    'room.analytics.title': '📊 Analytics',
    'room.analytics.current_round': 'Current round',
    'room.analytics.history': 'Previous rounds',
    'room.analytics.empty': 'No rounds played yet.',
    'room.analytics.consensus_full': '🎉 Full consensus',
    'room.analytics.consensus_close': '⚡ Close votes',
    'room.analytics.consensus_spread': '⚠️ High variance',
    'room.analytics.just_now': 'just now',
    'room.analytics.mins_ago': '{n} min ago',
    'room.analytics.hrs_ago': '{n} hr ago',

    'room.settings.toggle_title': 'Settings',
    'room.settings.title': '⚙️ Settings',
    'room.settings.analytics_auto': 'Auto-open analytics on reveal',
    'room.settings.default_method': 'Favourite estimation method',
    'room.settings.method_none': 'No preference',
    'room.settings.save': 'Save',
    'room.settings.shortcuts_label': 'Keyboard shortcuts',
    'room.settings.shortcut_cards': 'pick card',
    'room.settings.shortcut_reveal': 'reveal',
    'room.settings.shortcut_new': 'new round',

    'nav.dashboard': 'Dashboard',
    'nav.stats': 'Stats',

    'stats.title': '📊 My statistics',
    'stats.loading': 'Loading statistics…',
    'stats.error': 'Could not load statistics.',
    'stats.empty': "No stats yet. Play a few rounds to see your first data!",
    'stats.empty_cta': 'Create a room →',
    'stats.member_since': 'Playing since {date}',
    'stats.total_rounds': 'Rounds played',
    'stats.total_sessions': 'Sessions',
    'stats.fav_card': 'Favourite card',
    'stats.avg_vote': 'Average vote',
    'stats.dist_title': 'Vote distribution',
    'stats.dist_desc': 'How often you picked each card value',
    'stats.activity_title': 'Activity',
    'stats.activity_desc': 'Rounds per day (last 90 days)',
    'stats.heatmap_title': 'Activity heatmap',
    'stats.heatmap_desc': 'Most active days over the last 3 months',
    'stats.heatmap_less': 'Less',
    'stats.heatmap_more': 'More',
    'stats.hours_title': 'Active hours',
    'stats.hours_desc': 'What time of day you poker the most',

    'stats.personality.label': 'Poker personality',
    'stats.personality.coffee': 'The Coffee Lover',
    'stats.personality.coffee.desc': 'You think breaks are the best estimation.',
    'stats.personality.agnostic': 'The Doubter',
    'stats.personality.agnostic.desc': "When you don't know, you say so honestly.",
    'stats.personality.minimalist': 'The Cautious One',
    'stats.personality.minimalist.desc': 'You always estimate conservatively — better safe than sorry.',
    'stats.personality.maximalist': 'The Optimist',
    'stats.personality.maximalist.desc': 'Full throttle! You think big and estimate high.',
    'stats.personality.middleground': 'The Middle Ground',
    'stats.personality.middleground.desc': 'You always seek the golden middle way.',
    'stats.personality.fashionista': 'The Fashionista',
    'stats.personality.fashionista.desc': "T-shirt sizes? That's your thing.",

    'stats.streak_label': 'Current streak 🔥',
    'stats.streak_best': 'Best: {n} days',
    'stats.consensus_label': 'Consensus rate',
    'stats.consensus_of': '{n} of {total} rounds',

    'stats.badges_title': 'Planning Poker badges & achievements',
    'stats.badges_desc': 'Earn badges by estimating stories, collaborating, and lifting your team to the next level.',

    'stats.badge.first_round': 'First Round',
    'stats.badge.first_round.desc': 'Play your very first round.',
    'stats.badge.regular': 'Regular',
    'stats.badge.regular.desc': 'Play 25 rounds.',
    'stats.badge.veteran': 'Veteran',
    'stats.badge.veteran.desc': 'Play 100 rounds.',
    'stats.badge.grandmaster': 'Grandmaster',
    'stats.badge.grandmaster.desc': 'Play 500 rounds.',
    'stats.badge.legend': 'Legend',
    'stats.badge.legend.desc': 'Play 1000 rounds. You are immortal.',
    'stats.badge.explorer': 'Explorer',
    'stats.badge.explorer.desc': 'Join 5 different sessions.',
    'stats.badge.globetrotter': 'Globetrotter',
    'stats.badge.globetrotter.desc': 'Join 20 different sessions.',
    'stats.badge.on_fire': 'On Fire',
    'stats.badge.on_fire.desc': 'Played 7 days in a row.',
    'stats.badge.dedicated': 'Dedicated',
    'stats.badge.dedicated.desc': 'Played 30 days in a row.',
    'stats.badge.early_bird': 'Early Bird',
    'stats.badge.early_bird.desc': 'Poker before 08:00.',
    'stats.badge.night_owl': 'Night Owl',
    'stats.badge.night_owl.desc': 'Poker after 22:00.',
    'stats.badge.barista': 'Barista',
    'stats.badge.barista.desc': 'Pick the coffee card ☕ 5 times.',
    'stats.badge.doubter': 'The Doubter',
    'stats.badge.doubter.desc': 'Pick the question mark 10 times.',
    'stats.badge.allrounder': 'All-Rounder',
    'stats.badge.allrounder.desc': 'Use all 4 estimation methods.',
    'stats.badge.team_player': 'Team Player',
    'stats.badge.team_player.desc': 'Match the team vote 70% of the time (min. 10 rounds).',
    'stats.badge.unicorn': 'Unicorn',
    'stats.badge.unicorn.desc': 'Pick the question mark 50 times. You are one of a kind.',
    'stats.badge.zombie': 'Zombie',
    'stats.badge.zombie.desc': 'Poker between 00:00 and 04:00. Do you ever sleep?',
    'stats.badge.coffee_addict': 'Coffee Addict',
    'stats.badge.coffee_addict.desc': 'Pick the coffee card ☕ 20 times.',
    'stats.badge.speedrunner': 'Speedrunner',
    'stats.badge.speedrunner.desc': 'Play 10 rounds in a single day.',
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
