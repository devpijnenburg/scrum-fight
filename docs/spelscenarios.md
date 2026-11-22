# Spelscenario's — sequence-diagrammen

Dit document beschrijft de volgorde van events tussen de browsers, de server en de database voor elk scenario in een kamer. De diagrammen zijn Mermaid en renderen op GitHub.

**Deelnemers in de diagrammen**

| Naam | Wat |
|---|---|
| Speler A / B | Browser, `frontend/public/js/room/*` |
| Server | Socket-laag, `backend/src/realtime/index.js` + `roomSessions.js` |
| GameRoom | Spelstatus in geheugen, `backend/src/domains/game/gameRoom.js` |
| DB | Postgres (`rooms`, `round_history`, `user_votes`, `live_rounds`) |

**Basisregels**

- De server is de enige bron van waarheid. Een browser past zijn scherm aan op events van de server; alleen de eigen stem wordt optimistisch getoond.
- `room-state` is altijd de volledige stand. Na elke (her)verbinding zet de client álle knoppen en panelen opnieuw vanuit die stand.
- Binnen één socket-handler op de server draait alles na de laatste `await` zonder onderbreking. Controles en wijzigingen die bij elkaar horen staan daarom in zo'n synchroon stuk.
- Spelacties van de client gaan via `send()` en worden alleen verstuurd als de client verbonden én gejoind is.

---

## 1. Kamer joinen

```mermaid
sequenceDiagram
    autonumber
    participant A as Speler A
    participant S as Server
    participant G as GameRoom
    participant D as DB
    participant B as Speler B

    A->>A: handlers registreren, daarna socket.connect()
    A->>S: verbinding (connect)
    A->>S: join-room (roomId, naam of token, playerKey)
    S->>D: gebruiker opzoeken (bij token)
    S->>D: kamer opzoeken
    S->>D: plan van de eigenaar (deelnemerslimiet)
    Note over S: socket intussen weg? Dan stoppen (geen spookspeler)
    S->>D: lopende ronde laden (alleen eerste join na herstart)
    D-->>S: live_rounds of niets
    Note over S,G: vanaf hier synchroon
    S->>G: limiet controleren, addPlayer(socketId, key)
    G-->>S: speler (met bewaarde stem als de key bekend is)
    S-->>A: room-state (volledige stand, myVote)
    S-->>B: player-joined (hasVoted, spectator)
    S->>D: last_active bijwerken, live_rounds opslaan (na 200 ms)
    A->>A: markOnline, alles renderen
    A->>S: GET /api/rooms/:id/history
    S-->>A: laatste 20 rondes
```

**Naam bepalen (client, vóór stap 3):** account → naam die deze pagina al koos → naam van de landingspagina → onthouden naam → naam-modal. Wordt de naam ingevuld terwijl de verbinding weg is, dan wordt er niets gebufferd; de `connect`-handler joint zodra de verbinding terug is.

**Foutpaden:** `ROOM_NOT_FOUND`, `ROOM_FULL` (met `limit`) en `SERVER_ERROR` tonen een eindscherm; `NAME_REQUIRED` opent de naam-modal.

---

## 2. Stemmen en direct onthullen

Iedereen die geen toeschouwer is heeft gestemd.

```mermaid
sequenceDiagram
    autonumber
    participant A as Speler A
    participant S as Server
    participant G as GameRoom
    participant D as DB
    participant B as Speler B

    A->>A: kaart 5 gekozen (optimistisch getoond)
    A->>S: vote (5)
    S->>G: castVote
    S-->>A: player-voted (A)
    S-->>B: player-voted (A)
    B->>S: vote (8)
    S->>G: castVote
    S-->>A: player-voted (B)
    S-->>B: player-voted (B)
    Note over S,D: elke wijziging: live_rounds opslaan (na 200 ms)
    A->>S: set-round-name (als er nog een naam in de wachtrij stond)
    A->>S: reveal
    S->>G: revealMode() = immediate, reveal()
    G-->>S: momentopname (stemmen, statistieken, rondenaam)
    S-->>A: cards-revealed
    S-->>B: cards-revealed
    S->>D: recordRound (één transactie)
    S->>D: badges evalueren (per account)
    S-->>A: badge-earned / badge-announced (indien verdiend)
```

- Stemmen van spelers die tijdens de ronde zijn weggevallen tellen mee (in de momentopname met `socketId: null`).
- Een klik op een kaart die de reveal kruist, wordt door de server geweigerd. De client neemt bij `cards-revealed` zijn eigen stem over uit het serverantwoord en haalt een niet-getelde keuze weg.
- Wie niet gestemd heeft krijgt een kaart met "—".

---

## 3. Onthullen met countdown

Nog niet iedereen heeft gestemd.

```mermaid
sequenceDiagram
    autonumber
    participant A as Speler A
    participant S as Server
    participant G as GameRoom
    participant B as Speler B

    A->>S: reveal
    S->>G: revealMode() = countdown
    S-->>A: countdown (3)
    S-->>B: countdown (3)
    Note over S: timers per kamer in roomSessions
    B->>S: vote (3)
    S-->>A: player-voted (B)
    S-->>A: countdown (2)
    S-->>B: countdown (2)
    S-->>A: countdown (1)
    S-->>B: countdown (1)
    S->>G: reveal() (als de kamer nog bestaat en niet onthuld is)
    S-->>A: cards-revealed
    S-->>B: cards-revealed
```

- Een tweede `reveal` tijdens de countdown wordt genegeerd; per socket geldt bovendien een wachttijd van 2 seconden.
- `new-round` tijdens de countdown stopt de timers: de server stuurt `countdown-cancelled` en daarna `round-reset`.
- Vertrekt de laatste speler, dan stoppen de timers ook.
- Wie tijdens de countdown opnieuw verbindt, krijgt `room-state`; de client verbergt dan een countdown die is blijven staan.

---

## 4. Nieuwe ronde

```mermaid
sequenceDiagram
    autonumber
    participant A as Speler A
    participant S as Server
    participant G as GameRoom
    participant D as DB
    participant B as Speler B

    A->>S: new-round
    S->>S: lopende countdown stoppen (indien actief)
    S->>G: newRound() (stemmen en rondenaam leeg)
    S-->>A: round-reset
    S-->>B: round-reset
    S->>D: live_rounds opslaan
    A->>A: stemknoppen terug, kaartkeuze en rondenaam leeg
    B->>B: stemknoppen terug, kaartkeuze en rondenaam leeg
```

Bewaarde stemmen van afwezige spelers horen bij de oude ronde en vervallen; afwezige toeschouwers blijven toeschouwer.

---

## 5. Toeschouwer worden en weer meedoen

```mermaid
sequenceDiagram
    autonumber
    participant A as Speler A
    participant S as Server
    participant G as GameRoom
    participant D as DB
    participant B as Speler B

    A->>S: toggle-spectator
    S->>G: toggleSpectator (stem vervalt)
    S-->>A: spectator-toggled (A, true)
    S-->>B: spectator-toggled (A, true)
    S->>D: toeschouwersessie loggen (account, max 1x per minuut)
    A->>A: kaartkiezer verbergen
    A->>S: toggle-spectator
    S-->>A: spectator-toggled (A, false)
    S-->>B: spectator-toggled (A, false)
```

Wisselen kan alleen zolang de kaarten niet onthuld zijn. Toeschouwers tellen niet mee voor "iedereen heeft gestemd".

---

## 6. Verbinding kwijt en herstellen

```mermaid
sequenceDiagram
    autonumber
    participant A as Speler A
    participant S as Server
    participant G as GameRoom
    participant B as Speler B

    Note over A,S: verbinding valt weg
    A->>A: disconnect: acties geblokkeerd
    A->>A: na 1 s melding Verbinding herstellen, na 15 s tip
    S->>G: removePlayer (stem bewaard onder playerKey)
    S-->>B: player-left (A)
    Note over A,S: verbinding terug (socket.io probeert opnieuw)
    A->>S: verbinding (nieuw socketId)
    A->>S: join-room (zelfde playerKey)
    S->>G: addPlayer: stem en toeschouwerstand terug
    S-->>A: room-state (myVote)
    S-->>B: player-joined (hasVoted)
    A->>A: markOnline, hele scherm opnieuw vanuit room-state
    A->>S: GET history (gemiste rondes)
```

**Overname.** Merkt de server de oude socket nog niet als dood (netwerkwissel) of is het tabblad gedupliceerd, dan staat er nog een speler met dezelfde `playerKey` aan tafel:

```mermaid
sequenceDiagram
    autonumber
    participant O as Oude socket / tab
    participant N as Nieuwe socket / tab
    participant S as Server
    participant G as GameRoom
    participant B as Speler B

    N->>S: join-room (playerKey gelijk aan die van de oude socket)
    S->>G: findPlayerIdByKey = oude socket
    S->>G: removePlayer(oud), addPlayer(nieuw) met dezelfde stem
    S-->>B: player-left (oud)
    S-->>O: session-replaced
    S-->>N: room-state (myVote)
    S-->>B: player-joined (nieuw, hasVoted)
    O->>O: eindscherm: geopend in een ander tabblad
```

Een terugkerende speler telt niet mee voor de deelnemerslimiet en krijgt dus geen "kamer vol".

---

## 7. Deploy tijdens een ronde

```mermaid
sequenceDiagram
    autonumber
    participant A as Speler A
    participant S1 as Server (oud)
    participant D as DB
    participant S2 as Server (nieuw)

    Note over S1: SIGTERM
    S1->>S1: jobs stoppen
    S1-->>A: verbinding verbroken (io.close)
    S1->>D: alle lopende rondes wegschrijven (flushAll)
    S1->>D: pool sluiten
    A->>A: melding Verbinding herstellen
    Note over S2: start, migraties
    A->>S2: verbinding
    A->>S2: join-room (playerKey)
    S2->>D: lopende ronde laden
    D-->>S2: rondenaam, onthuld, stemmen per key
    S2-->>A: room-state (rondenaam, myVote)
    A->>A: melding weg, eigen kaart gemarkeerd
```

Niet bewaard: een lopende countdown. Na een disconnect die de server zelf startte, begint de client zelf een nieuwe verbindingspoging.

---

## 8. Inloggen in de kamer en de kamer claimen

```mermaid
sequenceDiagram
    autonumber
    participant A as Speler A (gast)
    participant S as Server
    participant G as GameRoom
    participant D as DB
    participant B as Speler B

    A->>S: POST /api/auth/login
    S-->>A: sessietoken
    A->>S: join-room (token, zelfde socket)
    S->>G: updatePlayer: naam, account en emoticon (stem blijft)
    S-->>A: room-state
    S-->>B: player-joined (zelfde socketId: stoel vervangen)
    A->>S: POST /api/rooms/:id/claim (als het een gastkamer is)
    S->>D: kamer wordt permanent (atomair, binnen planlimiet)
    S-->>A: room-claimed
    S-->>B: room-claimed
    Note over S: inactiviteitstimer van de gastkamer gestopt
```

Claimen meerdere ingelogde spelers tegelijk, dan wint er één (de `UPDATE … WHERE is_guest`); de anderen krijgen een 409 die de client negeert.

---

## 9. Kamer verwijderd of verlopen

```mermaid
sequenceDiagram
    autonumber
    participant E as Eigenaar (dashboard)
    participant S as Server
    participant D as DB
    participant A as Speler A

    E->>S: DELETE /api/rooms/:id
    S->>D: kamer verwijderen (rondes en live_rounds mee)
    S->>S: event room.deleted, kamer uit geheugen, timers gestopt
    S-->>A: room-expired (deleted)
    A->>A: eindscherm, daarna naar de startpagina
```

Een gastkamer zonder activiteit krijgt na een uur hetzelfde `room-expired` (reden `inactivity`) en wordt verwijderd. Een lege permanente kamer verdwijnt na 10 minuten alleen uit het geheugen; de lopende ronde blijft in `live_rounds` staan.

---

## Volgorde- en race-situaties

| Situatie | Wat er zonder bescherming gebeurt | Bescherming |
|---|---|---|
| Socket valt weg terwijl `join-room` nog op de database wacht | Spookspeler die nooit meer verdwijnt | Na elke `await` controleert de server `socket.disconnected` |
| Nieuwe socket van hetzelfde tabblad joint terwijl de oude nog "leeft" | Dubbele stoel, stem kwijt, of "kamer vol" bij een volle kamer | Overname op `playerKey`; terugkerende speler telt niet voor de limiet |
| Twee joins tegelijk voor de laatste plek | Limiet met één overschreden | Limietcontrole en `addPlayer` in hetzelfde synchrone stuk |
| Dezelfde socket joint twee keer (naam ingevuld tijdens reconnect, inloggen) | Dubbele stoel bij anderen, stem gewist | Server werkt de speler bij; client vervangt de stoel met hetzelfde `socketId` |
| Client verbindt voordat de handlers geregistreerd zijn | Eerste `connect` gemist, speler joint niet | `autoConnect: false`, verbinden na registratie |
| Actie verstuurd terwijl de verbinding weg is | socket.io buffert en stuurt vóór de nieuwe join; server negeert het | `send()` blokkeert tot verbonden én gejoind |
| Ronde eindigt of begint terwijl een speler offline is | Verkeerde knoppen, vastgelopen countdown, ontbrekende historie | `room-state` zet het hele scherm; historie wordt opnieuw opgehaald |
| Kaart aangeklikt terwijl een ander onthult | Kaart lijkt gekozen maar telt niet | Client neemt eigen stem over uit `cards-revealed` |
| Rondenaam getypt en meteen onthuld | Ronde zonder (volledige) naam opgeslagen | Wachtende naam wordt vóór `reveal` verstuurd; vervalt bij een nieuwe ronde |
| Speler stemt en valt weg vóór de reveal | Stem telt niet, maar verschijnt later wel aan tafel | Stemmen van afwezigen tellen mee; dubbeltelling voorkomen bij terugkeer onder een andere key |
| Twee reveals kort na elkaar | Dubbele ronde in de historie | `reveal()` werkt één keer per ronde; countdown één per kamer; wachttijd per socket |
| Deploy tijdens een ronde | Stemmen weg | `live_rounds`, wegschrijven bij shutdown, herstel bij eerste join |
| Meerdere schrijfacties voor dezelfde kamer | Oudere stand overschrijft nieuwere | Schrijfacties per kamer in volgorde, altijd de laatste momentopname |

**Bekende, geaccepteerde randgevallen**

- Wordt een kamer verwijderd precies tussen het opzoeken en het openen tijdens een join, dan zit die ene speler in een kamer die niet meer bestaat. Opslaan faalt dan (wordt gelogd); na herladen krijgt de speler "kamer niet gevonden".
- Twee gelijktijdige naamswijzigingen van de kamer: in het geheugen wint de laatste, in de database kan de andere als laatste aankomen. Bij de volgende wijziging of herstart trekt dit recht.
- Een gedupliceerd browsertabblad deelt de `playerKey` met het origineel; het nieuwste tabblad neemt de stoel over en het andere stopt.
