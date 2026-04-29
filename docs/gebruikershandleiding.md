# Scrum Fight — Gebruikershandleiding

> Real-time planning poker voor Scrum-teams. Geen installatie, geen gedoe — gewoon een link delen en schatten.

---

## Inhoudsopgave

1. [Wat is Scrum Fight?](#1-wat-is-scrum-fight)
2. [Aan de slag](#2-aan-de-slag)
3. [In de poker-kamer](#3-in-de-poker-kamer)
4. [Dashboard](#4-dashboard)
5. [Mijn statistieken](#5-mijn-statistieken)
6. [Badges](#6-badges)
7. [Abonnementen](#7-abonnementen)

---

## 1. Wat is Scrum Fight?

Scrum Fight is een gratis planning poker tool voor agile teams. Iedereen in het team kiest gelijktijdig een kaart om een user story te schatten. Pas na de reveal ziet iedereen elkaars keuze, zodat er geen groepsdruk is.

**Voordelen ten opzichte van alternatieven:**
- Geen account nodig om mee te spelen — gewoon een naam en een kamercode
- Real-time updates via WebSockets (geen pagina verversing)
- Volledige ronde-geschiedenis per kamer
- Persoonlijke statistieken en badges voor terugkerende gebruikers
- Tweetalig: Nederlands en Engels

---

## 2. Aan de slag

### Kamer aanmaken (anoniem — geen account nodig)

1. Ga naar de homepagina
2. Vul bij **"Kamer aanmaken"** jouw naam en een kamernaam in
3. Kies een schattingsmethode (zie [sectie 3](#schattingsmethoden))
4. Klik **"Kamer aanmaken →"**
5. Deel de kamercode of uitnodigingslink met je team

Anonieme kamers worden na **1 uur inactiviteit** automatisch verwijderd.

### Kamer joinen

1. Ga naar de homepagina
2. Vul bij **"Kamer joinen"** de kamercode in (bijv. `ABC123`)
3. Vul jouw naam in en klik **"Joinen →"**

### Account aanmaken

Met een account krijg je toegang tot:
- Een persoonlijk dashboard met al jouw kamers
- Statistieken en badges
- Langere bewaring van kamers (afhankelijk van abonnement)

Registreer via de **"Inloggen / Registreren"** knop, of gebruik Google / GitHub OAuth.

---

## 3. In de poker-kamer

### Stemmen & kaarten kiezen

Elke deelnemer kiest één kaart uit het dek. De gekozen waarde is **verborgen voor de rest** totdat de host op **"Reveal"** klikt. Tot die tijd zien andere deelnemers alleen dat jij gestemd hebt (een omgedraaide kaart), niet welke waarde.

### Schattingsmethoden

| Methode | Kaartwaarden |
|---------|-------------|
| **Fibonacci** | 😊 · 1 · 2 · 3 · 5 · 8 · 13 · 21 · 34 · ? · ☕ |
| **Modified Fibonacci** | 0 · ½ · 1 · 2 · 3 · 5 · 8 · 13 · 20 · 40 · 100 · ? · ☕ |
| **T-shirt maten** | XS · S · M · L · XL · XXL · ? |
| **Powers of 2** | 1 · 2 · 4 · 8 · 16 · 32 · 64 · ? · ☕ |

**Speciale kaarten:**
- **?** — Je weet het nog niet of wil je niet vastleggen
- **☕** — Pauze nodig voor dit item

### Reveal & resultaten

Na de reveal toont Scrum Fight:
- Wie wat heeft gestemd
- Gemiddelde, minimum en maximum (voor numerieke methoden)
- De meest gekozen waarde (modus)
- Een verdeling per kaartwaarde
- Een **consensus-indicator**: groen (volledige consensus), oranje (kleine spreiding), rood (grote spreiding)

### Toetsenbordsnelkoppelingen

| Toets | Actie |
|-------|-------|
| `1` – `9` | Kies de kaart op die positie in het huidige dek |
| `R` | Reveal (kaarten onthullen) |
| `N` | Nieuwe ronde starten |

### Analytisch zijpaneel (📊)

Klik op de **📊** knop (rechtsboven in de kamer) om het analyse-paneel te openen. Het paneel toont:
- Statistieken van de huidige ronde na reveal
- Een scrollbare lijst van alle vorige rondes in deze sessie

Het paneel opent automatisch na elke reveal (dit is uit te zetten in de instellingen).

### Instellingen (⚙️)

De **⚙️** knop is zichtbaar voor ingelogde gebruikers. Hier stel je in:
- **Analyse automatisch openen** — paneel direct tonen na elke reveal (aan/uit)
- **Favoriete schattingsmethode** — wordt als standaard geselecteerd bij het aanmaken van een nieuwe kamer

Instellingen worden lokaal opgeslagen (localStorage) en zijn per browser.

---

## 4. Dashboard

Het dashboard is beschikbaar voor gebruikers met een account via `/dashboard.html`.

### Kamers beheren

- Overzicht van al jouw kamers met naam, methode en laatste activiteit
- **Openen →** om direct naar de kamer te gaan
- Kopieer de kamercode met één klik
- Verwijder een kamer (onomkeerbaar)

### Nieuwe kamer aanmaken

Klik **"+ Nieuwe kamer"** om een kamer aan te maken met:
- Een naam (of klik 🎲 voor een willekeurige naam)
- Een schattingsmethode

---

## 5. Mijn statistieken

Beschikbaar via `/stats.html` voor ingelogde gebruikers.

### Stat-kaarten

| Kaart | Omschrijving |
|-------|-------------|
| Rondes gespeeld | Totaal aantal rondes waaraan je hebt deelgenomen |
| Sessies | Aantal unieke kamers |
| Favoriete kaart | De waarde die je het vaakst hebt gekozen |
| Gemiddelde stem | Gemiddelde van al jouw numerieke stemmen |
| Huidige streak | Aantal opeenvolgende dagen dat je hebt gespeeld |
| Consensus rate | Hoe vaak jouw stem overeenkomt met de meest gekozen waarde |

### Grafieken

- **Stemverdeling** — staafdiagram: hoe vaak je elke kaartwaarde hebt gekozen
- **Activiteit** — rondes per dag over de laatste 90 dagen
- **Activiteitsheatmap** — GitHub-stijl kalender van de afgelopen 3 maanden
- **Actieve uren** — op welk tijdstip van de dag je het meest pokert

### Poker-persoonlijkheid

Scrum Fight bepaalt jouw poker-persoonlijkheid op basis van je stempatroon:

| Type | Trigger | Omschrijving |
|------|---------|-------------|
| ☕ De Koffie-liefhebber | > 20% koffie-kaarten | Jij denkt dat pauzes de beste schatting zijn |
| 🤔 De Twijfelaar | > 25% vraagtekens | Als je het niet weet, zeg je het eerlijk |
| 🛡️ De Voorzichtige | Laag numeriek gemiddelde | Jij schat altijd conservatief |
| 🚀 De Optimist | Hoog numeriek gemiddelde | Vol gas — jij denkt groot en schat hoog |
| ⚖️ Het Midden | Gemiddeld numeriek gemiddelde | Jij zoekt altijd de gulden middenweg |
| 👕 De Fashionista | Alleen T-shirt maten | T-shirt maten? Dat is jouw ding |

---

## 6. Badges

Badges verschijnen op de statistiekenpagina als heraldische schilden. Ontgrendelde badges zijn volledig gekleurd; nog niet behaalde badges zijn grijs met een 🔒 slot-icoontje. Een voortgangsbalk toont hoe ver je bent.

### Schildtiers

| Tier | Kleur | Moeilijkheidsgraad |
|------|-------|-------------------|
| Brons | Warm oranje | Makkelijk — voor beginners |
| Zilver | Lichtgrijs | Gemiddeld — regelmatig spelen |
| Goud | Geel-amber | Gevorderd — toegewijd gebruik |
| Platina | IJsblauw | Extreem — voor de meest hardnekkige spelers |
| Speciaal | Eigen kleur per badge | Grappige of onverwachte prestaties |

### Alle 19 badges

| # | Badge | Tier | Emoji | Mijlpaal | Hoe ontgrendelen |
|---|-------|------|-------|----------|-----------------|
| 1 | Eerste ronde | Brons | 🃏 | ×1 | Speel je allereerste ronde |
| 2 | Vaste speler | Brons | 🎯 | ×25 | Speel 25 rondes |
| 3 | Ontdekker | Brons | 🗺️ | 5 sess | Neem deel aan 5 verschillende sessies |
| 4 | Vroege vogel | Brons | 🌅 | < 8:00 | Poker minstens één keer vóór 08:00 uur |
| 5 | Barista | Brons | ☕ | ☕ ×5 | Kies 5× de koffie-kaart |
| 6 | Twijfelaar | Brons | 🤔 | ? ×10 | Kies 10× het vraagteken |
| 7 | Veteraan | Zilver | ⚔️ | ×100 | Speel 100 rondes |
| 8 | Globetrotter | Zilver | 🌍 | 20 sess | Neem deel aan 20 verschillende sessies |
| 9 | On Fire | Zilver | 🔥 | 7 dagen | Speel 7 dagen achter elkaar |
| 10 | Nachtuil | Zilver | 🦉 | > 22:00 | Poker minstens één keer na 22:00 uur |
| 11 | Grootmeester | Goud | 🏆 | ×500 | Speel 500 rondes |
| 12 | Toegewijd | Goud | 📅 | 30 dagen | Speel 30 dagen achter elkaar |
| 13 | Allrounder | Goud | 🎪 | 4 methodes | Speel met alle 4 schattingsmethoden |
| 14 | Teamspeler | Goud | 🤝 | 70% consensus | Stem 70%+ gelijk aan het team (min. 10 rondes) |
| 15 | Legende | Platina | 👑 | ×1000 | Speel 1000 rondes — jij bent onsterfelijk |
| 16 | Eenhoorn | Speciaal 🟣 | 🦄 | ? ×50 | Kies 50× het vraagteken — jij bent uniek |
| 17 | Zombie | Speciaal 🟢 | 🧟 | 00–04u | Poker tussen middernacht en 04:00 — slaap jij nooit? |
| 18 | Koffiejunk | Speciaal 🟠 | ☕ | ☕ ×20 | Kies 20× de koffie-kaart |
| 19 | Speedrunner | Speciaal 🟡 | ⚡ | 10 op 1 dag | Speel 10 rondes op één enkele dag |

---

## 7. Abonnementen

| Functie | Free | Pro | Premium |
|---------|------|-----|---------|
| Kamers | 3 | 20 | Onbeperkt |
| Deelnemers per kamer | 5 | 15 | Onbeperkt |
| Bewaring | 30 dagen | 30 dagen | Nooit verwijderd |
| Advertenties | Ja | Nee | Nee |
| Statistieken & badges | Ja | Ja | Ja |
| Ronde-geschiedenis | Ja | Ja | Ja |

> Upgraden kan via het dashboard onder **"Abonnement"**.
