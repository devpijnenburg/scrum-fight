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
| 2. Game-domein | ✅ uitgevoerd |
| 3–6 | open |

### Notities fase 2
- Spelregels staan in `backend/src/domain/game/` (`GameRoom`, `voteStats`); de socket-adapter in `backend/src/realtime/` (`index.js` voor events, `roomSessions.js` voor timers en levenscyclus). `src/socket/` is vervallen.
- De mapnaam blijft voorlopig `domain/`; het hernoemen naar `domains/` en het verplaatsen van routes per domein hoort bij fase 4.
- Lege permanente kamers verdwijnen 10 minuten na de laatste speler uit het geheugen. Gastkamers blijven tot hun inactiviteitstimer afloopt.
- Een kamer die via de REST-API wordt verwijderd, krijgt direct `room-expired` (`reason: 'deleted'`).
