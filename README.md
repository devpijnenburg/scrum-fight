# ScrumFight — Planning Poker

Real-time Planning Poker tool voor Scrum-teams. Maak een kamer aan, deel de code met je team en schat samen user stories — zonder dat iemand elkaars keuze beïnvloedt vóór de reveal.

## Features

- **Real-time stemmen** via Socket.io — iedereen stemt tegelijk, kaarten worden tegelijk onthuld
- **Meerdere schattingsmethoden** — Fibonacci, Modified Fibonacci, T-shirt maten, Powers of 2
- **Spectator modus** — toeschouwers kunnen de sessie bijwonen zonder te stemmen; de countdown wacht niet op hen
- **Consensus-indicatoren** — automatische herkenning van volledige consensus, bijna-consensus, ☕-runs, ?-runs, dichtbij en verspreid
- **Analyticspaneel** — statistieken per ronde (gemiddelde, min, max, modus, verdeling) en volledige rondegeschiedenis
- **Emoji-reacties** — spelers kunnen na een reveal reageren met context-gevoelige emoji's
- **Ronde namen** — optionele naam per ronde voor eenvoudig terugkijken in de geschiedenis
- **Emoticons per speler** — accountgebruikers kiezen een persoonlijk emoticon dat naast hun naam verschijnt
- **Kamer naam bewerken** — de kamernaam is live aanpasbaar voor alle deelnemers
- **Late-joiner markering** — spelers die midden in een ronde joinen worden apart aangeduid
- **Toetsenbordsnelkoppelingen** — `1`–`9` voor kaarten, `R` voor reveal, `N` voor nieuwe ronde
- **Meerdere kamers** — elk team heeft een eigen kamer met unieke toegangscode
- **Gastdeelname** — joinen zonder account is mogelijk
- **Accounts & sessiebewaring** — inloggen via e-mail/wachtwoord of OAuth (Google / GitHub)
- **Abonnementsplannen** — free, pro en premium met instelbare limieten; betalen via [Creem](https://creem.io)
- **Automatische opruiming** — gastkamers verdwijnen na 1 uur inactiviteit; opgeslagen kamers blijven bewaard tot de eigenaar ze verwijdert

## Plannen

| Plan    | Opgeslagen kamers | Deelnemers per kamer |
|---------|-------------------|----------------------|
| Free    | 3                 | 7                    |
| Pro     | 20                | 15                   |
| Premium | ∞                 | ∞                    |

De limieten staan in `backend/src/domains/billing/plans.js`. Opgeslagen kamers worden in geen enkel plan automatisch verwijderd; alleen gastkamers (zonder account) verlopen na 1 uur inactiviteit.

## Technische stack

| Laag      | Technologie                        |
|-----------|------------------------------------|
| Frontend  | HTML / CSS / JavaScript (Nginx)    |
| Backend   | Node.js + Express + Socket.io      |
| Database  | PostgreSQL 16                      |
| Auth      | JWT + bcrypt + OAuth (Google/GitHub)|
| Deployment| Docker Compose                     |

## Snel starten

### Vereisten

- [Docker](https://docs.docker.com/get-docker/) + Docker Compose

### Installatie

```bash
git clone https://github.com/devpijnenburg/scrum-fight.git
cd scrum-fight
cp .env.example .env
```

Pas `.env` aan — stel minimaal een sterk `JWT_SECRET` en `POSTGRES_PASSWORD` in.

```bash
docker compose up --build
```

Open `http://localhost` in je browser.

### Cache busting

Bij het bouwen van de frontend-image voegt `frontend/scripts/stamp-assets.mjs` aan elke CSS/JS-verwijzing een content-hash toe (`?v=…`). Dat gebeurt in de HTML, in de `@import`s van `styles.css` en in de imports tussen ES-modules. nginx laat bestanden met zo'n hash een jaar cachen; HTML en bestanden zonder hash worden altijd gerevalideerd. Je hoeft dus nooit meer met de hand een versie op te hogen. Lokaal (Aspire, zonder build-stap) worden de bestanden gewoon zonder hash en met `no-cache` geserveerd.

### Lokaal ontwikkelen met Aspire

Als alternatief voor Docker Compose kun je lokaal ontwikkelen met [Aspire](https://aspire.dev). De backend draait dan direct op Node (geen image-build nodig) en wijzigingen in `frontend/public` zijn meteen zichtbaar.

Vereisten: .NET 10 SDK, Node.js 20+, Docker en de Aspire CLI (`dotnet tool install -g Aspire.Cli`).

```bash
cd aspire
aspire run
```

| Onderdeel | Adres |
|-----------|-------|
| App       | `http://localhost:8088` |
| Dashboard | link verschijnt in de terminal (logs, traces, resources) |
| Mailpit   | via het dashboard (`mailpit`) — alle uitgaande mail komt hier binnen |

Postgres draait als persistente container met een eigen volume (`scrum-fight-postgres`), dus de data blijft bewaard tussen runs. Het `JWT_SECRET` wordt eenmalig gegenereerd en in user secrets opgeslagen. OAuth (Google/GitHub) is in deze opzet niet ingesteld.

## Configuratie

Alle instellingen via `.env`:

```env
POSTGRES_DB=planningpoker
POSTGRES_USER=poker
POSTGRES_PASSWORD=changeme          # verander dit

JWT_SECRET=your_very_secret_key     # verander dit

# OAuth — leeg laten om een provider uit te schakelen
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

BASE_URL=http://localhost            # publieke URL van de app
PORT=80                             # poort voor de frontend-container
```

### OAuth instellen (optioneel)

**Google:** maak een OAuth 2.0 client aan in de [Google Cloud Console](https://console.cloud.google.com). Voeg `<BASE_URL>/api/auth/google/callback` toe als redirect URI.

**GitHub:** registreer een OAuth app in [GitHub Developer Settings](https://github.com/settings/developers). Callback URL: `<BASE_URL>/api/auth/github/callback`.

### Betalingen instellen (optioneel)

Betaalde plannen lopen via [Creem](https://creem.io). Zonder configuratie staan betalingen uit en toont de abonnementspagina geen koopknoppen.

1. Maak in Creem vier abonnementsproducten aan: Pro en Premium, elk maandelijks en jaarlijks. De prijzen op de abonnementspagina komen rechtstreeks uit Creem.
2. Maak een webhook aan naar `<BASE_URL>/api/payments/webhook` en laat die in elk geval `checkout.completed` en alle `subscription.*`-events sturen.
3. Zet de API-sleutel, het webhook-secret en de vier product-ID's in `.env` (zie `.env.example`). Voor de pipeline zijn dat de gelijknamige secrets per GitHub-omgeving (`test` en `production`).

Een testsleutel (`creem_test_…`) gebruikt automatisch de sandbox van Creem, een live-sleutel de echte API.

**Aan en uit zetten.** `PAYMENTS_ENABLED=true` zet de verkoop aan; standaard staat die uit. Uit betekent: geen koopknoppen, geen nieuwe abonnementen en geen planwijzigingen. Webhooks en "Abonnement beheren" voor bestaande abonnees blijven werken. Op de server zet je de schakelaar om met de workflow **Betalingen aan/uit** (omgeving kiezen, dan `aan`, `uit` of `status`); de keuze blijft bij volgende deploys behouden. Een nieuwe omgeving start met test aan en productie uit.

**Eigen sleutels per omgeving.** Zet de zes `CREEM_*`-secrets als *environment secrets* in de GitHub-omgevingen `test` (sandbox: testsleutel, het webhook-secret en de product-ID's uit Test Mode) en `production` (live). Laat ze niet ook op repository-niveau staan: een ontbrekend environment secret valt daar stil op terug. Als vangnet legt `PAYMENTS_MODE` in de compose-bestanden vast welke soort sleutel een omgeving accepteert (`test` of `live`); met de verkeerde soort staan betalingen daar uit en meldt de backend dat bij het opstarten.

De API-sleutel heeft rechten nodig voor checkouts aanmaken én lezen, producten lezen, abonnementen lezen en wijzigen en het klantportaal (klanten); het eenvoudigst is "Full access". De backend controleert bij het opstarten de leesrechten en de product-ID's en logt `Creem-toegang: …`; een deploy toont die regels en geeft een waarschuwing als er iets mist. De pipeline vervangt de `SMTP_*`-, `CREEM_*`- en `SEQ_API_KEY`-regels in `.env`/`.env.test` bij elke deploy, zodat er nooit oude waarden blijven staan.

Hoe het werkt: "Upgraden" stuurt de klant naar de betaalpagina van Creem. Bij terugkomst controleert de backend de handtekening van de redirect en activeert het plan direct (klopt die handtekening niet, dan haalt de backend de checkout bij Creem op en activeert op basis daarvan; de reden staat dan in de log); de webhook houdt daarna verlengingen, opzeggingen en planwijzigingen bij. `users.plan` wordt altijd afgeleid van de abonnementen in de tabel `subscriptions`. Opzeggen en de betaalmethode wijzigen doet de klant in het klantportaal van Creem ("Abonnement beheren").

### Logging

De backend logt via `backend/src/shared/logger.js` in één vaste vorm:

```
[realtime] Speler is de kamer binnengekomen  room=K7M2QX player=Alice user=guest socket=sQ1x… via=join players=2 limit=7
```

Er wordt gelogd als een kamer wordt aangemaakt, geopend, geclaimd, verwijderd of gesloten, als spelers joinen, weggaan of geweigerd worden, en bij onthullen en nieuwe rondes. Daarnaast logt de backend inloggen (ook mislukte pogingen), 2FA-wijzigingen, geblokkeerde clients (rate limit) en elke adminactie. E-mailadressen worden altijd gemaskeerd (`j***@example.nl`). Verder krijgt elk HTTP-verzoek een request-id (`req=…` in elke regel, header `X-Request-Id`) en een eigen logregel met status en duur, logt de server elke 5 minuten een statusregel met open kamers en spelers, en komen onafgevangen fouten uit de browser binnen via `POST /api/client-errors`. `LOG_LEVEL` (`debug`, `info`, `warn`, `error`; standaard `info`) bepaalt hoeveel je ziet. Alle logregels per flow, met activiteitendiagrammen, staan in [`docs/kamerflows.md`](docs/kamerflows.md).

### Logging naar Seq (optioneel)

Op de server stuurt de backend al zijn logregels (`console.log/info/warn/error`) ook naar de centrale [Seq](https://datalust.co/seq) van [murderbot-stack](https://github.com/devpijnenburg/murderbot-stack), te bekijken op <https://logs.murderbot.nl>. De uitvoer in `docker logs` en de workflow **Backend logs** blijft gewoon werken.

- De backend hangt via het gedeelde Docker-netwerk `murderbot` aan Seq en logt naar `http://seq:5341` (`SEQ_URL`, staat vast in de compose-bestanden).
- `SEQ_API_KEY` is een Seq-API-key met alleen de permissie **Ingest**. In de pipeline is dat de secret `SEQ_API_KEY`. Zonder key staat de koppeling uit en meldt de backend dat één keer bij het opstarten.
- Elk event krijgt `Application = scrum-fight`, `Environment` (`test` of `production`) en `Component` (de tag aan het begin van de regel, bv. `billing` of `jobs:room-cleanup`). De velden van de logregel (`room`, `player`, `user`, `reason`, …) komen als losse properties mee, dus je kunt filteren op bv. `room = 'K7M2QX'`. Regels van de logger krijgen ook een vast eventtype (`@EventType`) en een property `Event` (het bericht zonder velden), zodat je per soort kunt tellen: `Event = 'Kamer aangemaakt'`. Fouten krijgen de stacktrace mee. Filter in Seq bijvoorbeeld op `Application = 'scrum-fight' and Environment = 'production'`.
- Lokaal en in de tests is er geen `SEQ_URL`, dus daar gebeurt niets.

## Projectstructuur

```
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── server.js                     # Opstart: migraties, Socket.io, jobs, graceful shutdown
│   └── src/
│       ├── app.js                    # Express-app: routes per domein + centrale errorhandler
│       ├── domains/                  # Eén map per domein: routes → service → repository
│       │   ├── identity/             # Registratie, login, 2FA, OAuth, JWT, profiel
│       │   ├── rooms/                # Kamers, claimen, plan-limieten, opruimjob
│       │   ├── game/                 # Pure spelregels (GameRoom, statistieken)
│       │   ├── stats/                # Persoonlijke statistieken en activiteit
│       │   ├── badges/               # Badge-definities, -evaluatie en -opslag
│       │   ├── billing/              # Plannen, abonnementen en betalingen (Creem)
│       │   ├── admin/                # Gebruikers- en organisatiebeheer
│       │   └── monitoring/           # Fouten uit de browser ontvangen en loggen
│       ├── realtime/                 # Socket.io-adapter + levenscyclus van live kamers
│       ├── shared/                   # Database, transacties, fouten, events, logger, request-id, mailer, rate limit
│       ├── jobs/                     # Register van achtergrondjobs
│       └── db/                       # Migratierunner + genummerde SQL-migraties
└── frontend/
    ├── nginx.conf
    └── public/
        ├── index.html                # Landingspagina
        ├── login.html                # <sf-auth-panel>
        ├── dashboard.html            # Kamerbeheer
        ├── room.html                 # Poker-tafel
        ├── css/
        │   ├── styles.css            # Ingang: importeert de rest in vaste volgorde
        │   ├── tokens.css, base.css  # Kleuren/variabelen, reset, animaties
        │   ├── components/           # Gedeelde UI: knoppen, modal, toast, auth, navbar, …
        │   ├── pages/                # Stijlen per pagina
        │   └── responsive.css        # Breakpoints en reduced motion (laatst)
        └── js/                       # Alles ES-modules; elke pagina laadt één entry
            ├── core/                 # i18n, api, auth, settings, badges, html, roomNames
            ├── ui/                   # Herbruikbare UI: modal, toast, methodSelect, authPanel
            ├── components/           # siteChrome: <site-nav>, <profile-menu>, <site-footer>
            ├── pages/                # Entry per pagina: landing, login, dashboard, profile, stats, admin, …
            └── room/                 # Kamerpagina (entry: room/index.js)
```

## Socket.io events

De volgorde van deze events per scenario (joinen, stemmen, onthullen, herverbinden, deploy) staat met sequence-diagrammen in [`docs/spelscenarios.md`](docs/spelscenarios.md). Wat de server daarbij beslist en logt (kamer aanmaken, joinen, verlaten, levenscyclus van een kamer) staat met activiteitendiagrammen in [`docs/kamerflows.md`](docs/kamerflows.md).

| Event               | Richting       | Beschrijving                                      |
|---------------------|----------------|---------------------------------------------------|
| `join-room`         | client → server| Kamer joinen met roomId + token/naam              |
| `vote`              | client → server| Kaartwaarde kiezen (geblokkeerd voor spectators)  |
| `reveal`            | client → server| Alle kaarten omdraaien                            |
| `new-round`         | client → server| Volgende ronde starten                            |
| `set-round-name`    | client → server| Naam instellen voor de huidige ronde              |
| `update-room-name`  | client → server| Kamernaam wijzigen                                |
| `toggle-spectator`  | client → server| Spectator modus aan/uitzetten                     |
| `react`             | client → server| Emoji-reactie versturen (na reveal)               |
| `room-state`        | server → client| Volledige staat bij join                          |
| `player-joined`     | server → room  | Broadcast: nieuwe speler                          |
| `player-left`       | server → room  | Broadcast: speler verlaat kamer                   |
| `player-voted`      | server → room  | Broadcast: iemand heeft gestemd                   |
| `spectator-toggled` | server → room  | Broadcast: spectator status gewijzigd             |
| `countdown`         | server → room  | Aftelling (3, 2, 1) als niet iedereen gestemd heeft|
| `countdown-cancelled`| server → room | Aftelling geannuleerd (nieuwe ronde gestart)      |
| `cards-revealed`    | server → room  | Broadcast: kaarten + statistieken                 |
| `round-reset`       | server → room  | Broadcast: ronde gereset                          |
| `round-name-set`    | server → room  | Broadcast: rondenaam bijgewerkt                   |
| `room-name-updated` | server → room  | Broadcast: kamernaam bijgewerkt                   |
| `reaction`          | server → room  | Broadcast: emoji-reactie van een speler           |
| `room-expired`      | server → client| Gastkamer verlopen wegens inactiviteit            |

## Deployment op een VPS

```bash
git clone https://github.com/devpijnenburg/scrum-fight.git
cd scrum-fight
cp .env.example .env
# Vul .env in met productiewaarden en jouw domeinnaam als BASE_URL
docker compose up -d
```

Voor HTTPS: zet Nginx als reverse proxy voor de containers met een Let's Encrypt certificaat (bijv. via [nginx-proxy-manager](https://nginxproxymanager.com) of Certbot).
