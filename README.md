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
- **Abonnementsplannen** — free, pro en premium met instelbare limieten
- **Automatische opruiming** — inactieve kamers worden na 30 dagen verwijderd (behalve premium)

## Plannen

| Plan    | Kamers | Deelnemers per kamer | Bewaring |
|---------|--------|----------------------|----------|
| Free    | 3      | 5                    | 30 dagen |
| Pro     | 20     | 15                   | 30 dagen |
| Premium | ∞      | ∞                    | Nooit    |

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
│       │   ├── billing/              # Plannen + betaal-adapter (Manual / Stripe-stub)
│       │   └── admin/                # Gebruikers- en organisatiebeheer
│       ├── realtime/                 # Socket.io-adapter + levenscyclus van live kamers
│       ├── shared/                   # Database, transacties, fouten, events, mailer, rate limit
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
        └── js/
            ├── api.js, auth.js, i18n.js, settings.js   # Kern: API, sessie, vertalingen, voorkeuren
            ├── ui/                   # Herbruikbare UI: modal, toast, methodSelect, authPanel
            ├── navbar.js             # <site-nav>, <profile-menu>, <site-footer>
            └── room.js, dashboard.js, …                # Paginascripts
```

## Socket.io events

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
