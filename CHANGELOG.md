# Changelog

Tutte le modifiche rilevanti di KERS Lab sono documentate in questo file.

Il formato segue [Keep a Changelog](https://keepachangelog.com/it/1.1.0/) e il progetto
adotta il [Semantic Versioning](https://semver.org/lang/it/).

## [Unreleased]

## [0.2.0] - 2026-10-28

Rifinitura dopo la verifica di qualità (QA round 2).

### Aggiunto

- README: sezione "Come pubblicare una release" (GitHub Pages, tag, Release).

### Corretto

- QA-016 completato: apostrofo tipografico ’ al posto di quello dritto `'` nei testi
  delle domande numeriche generate (testo e soluzione passo passo), nel titolo statico
  della pagina e nella meta-descrizione (`index.html`), nella descrizione di
  `package.json` e nei titoli delle schede di teoria 01–14 (es. "dell’induzione"), con
  test che impediscono regressioni.

## [0.1.0] - 2026-10-28

Prima release: Fasi 1–3 complete.

### Aggiunto

- Shell dell'app e design system: navigazione Teoria / Simulatori / Interrogazione,
  tema chiaro/scuro, token di design, componenti condivisi (slider con campo numerico,
  selettori, grafici, pannello formule KaTeX), tutto offline senza richieste esterne.
- Motore fisico (`src/physics`) con copertura dei test al 100 %: flusso, Faraday-Neumann,
  Lenz, autoinduzione e circuito RL, alternatore e motore, trasformatore e perdite Joule,
  frenata con recupero KERS/MGU-K.
- Teoria in 14 schede (dal flusso del campo magnetico al glossario), con formule KaTeX,
  riferimenti alle slide, fonti e marcatori `[DA VERIFICARE]`.
- Sei simulatori: "Flusso e legge di Faraday-Neumann", "Legge di Lenz",
  "Autoinduzione, circuito RL, energia", "Alternatore ⇄ motore (MGU-K)",
  "Trasformatore e perdite Joule", "Frenata e recupero di energia".
- Modalità Interrogazione con 73 domande (53 fisse a scelta multipla e a voce, 20
  generatori numerici con parametri casuali e soluzione passo passo), ripasso a scatole
  di Leitner e simulazione d'interrogazione da 10 domande.
- Scaffold del progetto (A0): Vite 5 + TypeScript strict, ESLint + Prettier, Vitest e
  Playwright; shell dell'app con router a hash, tema chiaro/scuro, formattazione
  numerica italiana (`formatIT`) e testi in `i18n/it.ts`; registro dei simulatori con
  scoperta automatica; render loop a passo fisso (1/240 s, max 60 fps, pausa a scheda
  nascosta); stub dell'API fisica (§4.2) con test di tipo; contratti condivisi in
  `docs/ARCHITECTURE.md` e decisioni in `docs/DECISIONS.md`.
- CI e igiene del repository (A10):
  - workflow **CI** su ogni push e pull request: lint, controllo formattazione,
    typecheck, unit test con copertura, build con artefatto `dist`, job separato di
    smoke test Playwright (Chromium) con report caricato in caso di errore;
  - workflow **Deploy to GitHub Pages** sui tag `v*` (e avvio manuale);
  - workflow **Commitlint** sui titoli e sui commit delle pull request
    (`@commitlint/config-conventional`, `commitlint.config.js`, script
    `npm run lint:commits`);
  - modelli di issue (bug, errore di fisica/contenuto, proposta) e di pull request;
  - Dependabot (npm settimanale, GitHub Actions mensile, major bloccate);
  - `README.md` (italiano + riassunto in inglese), `CONTRIBUTING.md`, licenza MIT.

### Corretto

Correzioni dalla revisione QA indipendente, round 1 (`docs/QA_REPORT.md`):

- QA-001: il campo numerico degli slider interpreta il separatore delle migliaia
  italiano (`20.000` non diventa più 20).
- QA-002: niente scorrimento orizzontale nella modalità Interrogazione a 1280×720.
- QA-003: le etichette degli assi dei grafici usano i decimali richiesti dal passo
  (0,25 / 2,5).
- QA-004: i valori grandi non vengono più tagliati nel campo numerico degli slider.
- QA-005: un solo controllo condiviso per gli hook di debug, non più installati in
  produzione.
- QA-006: il simulatore alternatore ⇄ motore rimanda anche alle schede 07 e 09.
- QA-007: l'MGU-K è descritto ovunque come "macchina trifase, generalmente descritta come
  sincrona a magneti permanenti" (dato `[DA VERIFICARE]`), con la spira singola come
  modello semplificato.
- QA-008: l'esempio KERS di `docs/PHYSICS.md` usa t = 3 s come teoria, quiz e simulatore
  (0,36 MJ in batteria, ≈ 0,40 MJ assorbiti, 18,5 s).
- QA-009: il README mostra gli screenshot presenti in `e2e/screenshots/` invece di
  immagini mancanti.
- QA-010: i test end-to-end non sovrascrivono più gli screenshot versionati.
- QA-011: domanda del quiz sul limite dell'MGU-K riferita alla potenza elettrica P_max.
- QA-012: "tempo per assorbire tutta ΔE_k alla potenza massima" al posto di "recuperare".
- QA-013: riferimenti alle slide allineati (Lenz, KERS: teoria 10 e simulatore [16–19]).
- QA-014: schede 09 e 10 più concise, fonti e marcatori invariati.
- QA-015: conteggio delle formule nella scheda 13, "ed energia", spaziatura "63,2 %".
- QA-016: notazione nei testi dell'interfaccia (pedici, esponenti, "1 spira", apostrofi,
  trattini nei titoli); completata nel round 2 con il trattino lungo " – " nei titoli
  delle schede 10, 11 e 12 e l'apostrofo tipografico (’) nel sottotitolo dell'app e nei
  testi del quiz.
- QA-017: etichette delle scene che non si sovrappongono più; grafico energie nascosto
  prima della chiusura dell'interruttore.
- QA-018: pannello formule e letture aggiornati nello stesso fotogramma.

Correzioni dal round 2 della revisione QA:

- QA-019: il pannello laterale dell'Interrogazione non deborda più dalla propria scheda a
  1280×720 (il selettore "Allenamento / Simulazione interrogazione" va a capo).

### Note

- Dati ancora `[DA VERIFICARE]` (dettagli in `docs/OPEN_FACTS.md`): energia recuperabile
  per giro nel 2026 (circa 7–9 MJ, variabile per evento); tipo di macchina dell'MGU-K
  ("generalmente descritta come sincrona a magneti permanenti"); punteggiatura della
  citazione dei traguardi 9.4 e 9.5 dell'Agenda 2030; capacità utile dell'accumulatore
  2014–2025 (non usata nei testi).
- I 60 fps non sono stati misurati sul portatile di riferimento: sono disponibili solo
  misure in Chromium headless.

[Unreleased]: https://github.com/Chip-jpg/MGUK-KERS-Simulator/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Chip-jpg/MGUK-KERS-Simulator/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Chip-jpg/MGUK-KERS-Simulator/releases/tag/v0.1.0
