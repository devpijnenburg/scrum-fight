# Architectuurplan — stabiliteit, domeinen en herbruikbare UI

Dit document beschrijft waar de codebase nu staat, waar we naartoe willen en in welke stappen we dat doen. Elke fase is een losse PR.

## Uitgangssituatie

### Stabiliteit
- Socket-handlers hadden geen vangnet: een event zonder payload (`socket.emit('vote')`) gooide een `TypeError` buiten de handler.
- `join-room` deed een databasequery buiten een try/catch (unhandled rejection bij een DB-hapering).
- Alle spelstatus leeft alleen in geheugen; permanente kamers worden nooit uit `activeRooms` opgeruimd.
- De socket-laag is ongetest en de deploy-workflow draaide geen tests.
- Migraties worden bij elke start opnieuw uitgevoerd, zonder versietabel.
- Rondes worden niet transactioneel opgeslagen en stemmen zijn gekeyd op naam.
- Beveiliging: standaard `JWT_SECRET`, geen rate limiting, `Math.random` voor codes en ID's, iedereen mag de kamernaam wijzigen, token in de URL na OAuth.
- Geen graceful shutdown; de healthcheck controleerde de database niet.

### Architectuur
- Backend half domeingericht: `routes/auth.js`, `profile.js`, `admin.js` en `users.js` bevatten directe SQL; `socket/index.js` mengt transport, spelregels, timers en persistentie.
- Domeinkennis verspreid (T-shirt-waarden in `calculateStats`, emoji-lijst in de socket-handler, consensuslogica alleen in de frontend).
- Foutmeldingen zijn Nederlandse strings vanuit de backend, terwijl de frontend i18n heeft.

### Frontend
- Globale scripts, `room.js` van ~1170 regels, `styles.css` van ~2600 regels.
- Duplicatie: settings (room.js én settings.js), login-/registratieformulier (login.html én room.html), methode-select op drie plekken, handgebouwde toasts en modals.
- Handmatige cache-busting via `?v=…`.

## Doelarchitectuur

### Backend
```
backend/src/
  app.js              # express-app (exporteerbaar voor tests)
  server.js           # start, migraties, shutdown
  shared/             # db, config, errors, logger, asyncHandler, rateLimit, socketHandler
  domains/
    identity/         # registratie, login, OAuth, 2FA, JWT, profiel
    rooms/            # kamers, claimen, plan-limieten, cleanup-job
    game/             # pure spelstatus (stemmen, reveal, countdown, stats, consensus)
    stats/            # gebruikersstatistieken
    badges/
    billing/          # plannen + payment-adapter
    admin/            # gebruikers- en organisatiebeheer
  realtime/           # dunne socket-adapter: valideert payload → roept game aan → broadcast
```
Regel: `game/` is pure logica zonder socket.io of database en dus volledig unit-testbaar. `realtime/` vertaalt alleen events.

### Frontend (vanilla, ES-modules, geen framework)
```
frontend/public/
  js/core/        # api, auth, i18n, settings, socket-client
  js/ui/          # <sf-modal>, <sf-toast>, <sf-auth-form>, <sf-method-select>, <site-nav>, kaart, badge-shield
  js/features/    # room/ (state, table, picker, analytics, reactions), dashboard/, stats/, admin/, profile/
  css/            # tokens.css, base.css, components/*.css, pages/*.css
```

## Fasen

1. **Vangnet** — wrapper om alle socket-handlers (try/catch + payload-validatie), `unhandledRejection`-logging, graceful shutdown, centrale JSON-errorhandler, healthcheck met DB-check, verplichte `JWT_SECRET` in productie, rate limiting op auth-endpoints, `crypto.randomInt` voor codes en ID's, tests als verplichte stap in de deploy-workflow.
2. **Game-domein lostrekken** — spelstatus en regels naar `domains/game` met unit-tests; socket-integratietests (join, vote, reveal, countdown, reconnect); opruimen van lege kamers en timers.
3. **Data-integriteit** — `schema_migrations`-tabel met automatische bestandsdetectie; rondes transactioneel opslaan en op speler-ID keyen; optioneel lopende ronde in Postgres bewaren.
4. **Backend-domeinen afmaken** — SQL uit routes naar repositories/services per domein; foutcodes i.p.v. teksten (frontend vertaalt); `app.js` los van `server.js`.
5. **UI-bouwstenen** — ES-modules; modal, toast, auth-formulier en methode-select als componenten; duplicaten weg; CSS splitsen.
6. **`room.js` opdelen** in feature-modules en cache-busting automatiseren met een content-hash bij de Docker-build.

## Status

| Fase | Status |
|------|--------|
| 1. Vangnet | ✅ uitgevoerd (PR #70) |
| 2. Game-domein | ✅ uitgevoerd (PR #71) |
| 3. Data-integriteit | ✅ uitgevoerd (PR #72) |
| 4. Backend-domeinen | ✅ uitgevoerd (PR #73) |
| 5. UI-bouwstenen | ✅ uitgevoerd (PR #74) |
| 6. Kamerpagina + cache busting | ✅ uitgevoerd (PR #75) |
| 7. Alle pagina's ES-modules | ✅ uitgevoerd |

### Notities fase 2
- Spelregels staan in `backend/src/domains/game/` (`GameRoom`, `voteStats`); de socket-adapter in `backend/src/realtime/` (`index.js` voor events, `roomSessions.js` voor timers en levenscyclus). `src/socket/` is vervallen.
- (Fase 4: `domain/` is hernoemd naar `domains/`, en de routes staan per domein.)
- Lege permanente kamers verdwijnen 10 minuten na de laatste speler uit het geheugen. Gastkamers blijven tot hun inactiviteitstimer afloopt.
- Een kamer die via de REST-API wordt verwijderd, krijgt direct `room-expired` (`reason: 'deleted'`).

### Notities fase 3
- Migraties: elk genummerd `.sql`-bestand in `backend/src/db/migrations/` draait precies één keer, in een eigen transactie, en wordt vastgelegd in `schema_migrations`. Een nieuwe migratie is alleen een nieuw bestand. Een advisory lock laat gelijktijdige starts op elkaar wachten.
- Rondes worden in één transactie opgeslagen (ronde, stemmen per gebruiker, `last_active`).
- In `round_history.votes` blijft het formaat `{ naam: stem }`, zodat de historie en de bestaande rijen blijven werken. Dubbele namen krijgen een achtervoegsel (`Alex (2)`) in plaats van elkaar te overschrijven.
- De optionele stap "lopende ronde in Postgres bewaren" is bewust niet gedaan: een deploy wist nog steeds de stemmen van een lopende ronde (niet de historie). Oppakken als dat in de praktijk stoort.

### Notities fase 4
- Elk domein in `backend/src/domains/<domein>/` heeft dezelfde lagen: `routes.js` (alleen HTTP), een service (regels en validatie, gooit `AppError`), en een repository (alle SQL).
- Afhankelijkheden lopen één kant op: `identity` en `billing` zijn de basis, en daar bouwen `rooms`, `game`, `stats`, `badges` en `admin` op. Geen enkel domein kent socket.io.
- REST-wijzigingen die live clients moeten zien (kamer geclaimd of verwijderd) gaan via `shared/events.js`; `realtime/` luistert daarop.
- Fouten: services gooien `AppError(status, code, message)`. De API antwoordt met `{ error, code, ...details }`. De frontend vertaalt `code` via `errors.<CODE>` in `i18n.js`, met `error` als fallback.
- Nog niet vertaald: de `planLimitWarning` bij het aanmaken van een kamer (een succesantwoord) en de foutteksten van de socket-laag. Pak dit op in fase 5/6, samen met de frontend.

### Notities fase 5
- Herbruikbare UI staat in `frontend/public/js/ui/`:
  - `modal.js`: `openModal`, `closeModal`, `confirmDialog`. Werkt met de bestaande `.modal`-markup en regelt backdrop, `[data-modal-close]`, Escape en focus. Met `data-modal-static` is een modal niet weg te klikken.
  - `toast.js`: `showToast`.
  - `methodSelect.js`: één lijst met schattingsmethodes. `<select data-method-select>` wordt automatisch gevuld en kiest de favoriete methode uit de instellingen voor.
  - `authPanel.js`: `<sf-auth-panel>` met inloggen, registreren, de TOTP- of e-mailcodestap en het opnieuw sturen van de verificatiemail. Wordt gebruikt op `login.html`, in de kamer en op `totp-verify.html`.
- `js/settings.js` is de enige plek voor gebruikersvoorkeuren.
- CSS: `styles.css` importeert `tokens` → `base` → `components/*` → `pages/*` → `responsive`. De pagina's zien er pixel voor pixel hetzelfde uit als voor de splitsing (gecontroleerd met screenshots).
- **Bewust uitgesteld naar fase 6:** ES-modules. De scripts zijn nog klassiek (globals). De nieuwe UI-bestanden zijn zo geschreven dat ze later als module te exporteren zijn: geen afhankelijkheid van paginacode, en een `module.exports`-tak voor de tests.

### Notities fase 6
- De kamerpagina bestaat uit ES-modules in `frontend/public/js/room/`, met `index.js` als entry. Ze delen één `state`-object (`state.js`) en hebben één socket (`socket.js`). De bestanden splitsen de verantwoordelijkheden:
  - identiteit en joinen;
  - de socket-events;
  - de rondecyclus;
  - tafel, kaartkiezer en analysepaneel;
  - header;
  - bediening en sneltoetsen;
  - vieringen en overlays.

  De consensusregels staan puur in `consensus.js`, met unit-tests.
- `room/globals.js` is de enige plek waar de kamermodules de klassieke helpers aanspreken (i18n, api, auth, settings, ui/*). Worden die helpers later modules, dan hoeft alleen dat bestand te veranderen.
- Er zijn geen importcycli tussen de kamermodules. Het stempelscript faalt bewust bij een cyclus, omdat een module anders twee URL's (en twee instanties) zou krijgen.
- Cache busting zit in de Docker-build (`scripts/stamp-assets.mjs`, multi-stage `Dockerfile`). nginx cachet bestanden met hash een jaar (`immutable`).

### Wat nog kan (niet in dit plan)
- De lopende ronde in Postgres bewaren, zodat een deploy geen stemmen van een actieve ronde wist.

### Notities fase 7 — alle pagina's als ES-modules
- Er zijn geen klassieke scripts en geen globals meer, op twee externe na: `socket.io.js` (geserveerd door de backend) en Chart.js (CDN). Elke pagina laadt precies één `<script type="module">`:
  - `js/pages/<pagina>.js`;
  - `js/room/index.js` voor de kamer.
- Indeling:
  - `js/core/`: i18n, api, auth, settings, badges, html, roomNames;
  - `js/ui/`: modal, toast, methodSelect, authPanel;
  - `js/components/siteChrome.js`: navigatie, profielmenu en footer.
- Geen inline `onclick` meer. Knoppen in gegenereerde HTML gebruiken `data-action` met één gedelegeerde listener per container.
- `npm run lint` (ESLint, `no-undef`) draait in CI. Met modules faalt een vergeten import anders pas op het moment dat dat codepad draait.
- Het stempelscript stempelt ook `import './x.js'` en `export … from`, en faalt bij een relatieve import zonder hash. Zo'n import zou een tweede module-instantie met eigen toestand opleveren.
- Gerepareerd: de kamer-socket verbond soms vóórdat de event-handlers geregistreerd waren, waardoor de speler niet joinde (sinds fase 6). De socket verbindt nu pas als alle handlers klaarstaan.

### Notities — vertaling van socket-fouten en planlimiet
- Socket-fouten hebben dezelfde vorm als REST-fouten: `{ code, message, …details }`, bijvoorbeeld `{ code: 'ROOM_FULL', limit: 5 }`.
- Een kamer die boven de limiet wordt aangemaakt, levert `planLimit: { code: 'ROOM_LIMIT_REACHED', plan, max }` op. Het oude tekstveld `planLimitWarning` blijft voorlopig mee komen voor oudere clients.
- De frontend vertaalt alles via `js/core/errors.js` (`errorText`), met de i18n-entry `errors.<CODE>`. De planlimietbanner in de kamer en de waarschuwingen op het dashboard staan nu ook in NL en EN.
