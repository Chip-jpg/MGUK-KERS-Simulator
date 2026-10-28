# Changelog

Tutte le modifiche rilevanti di KERS Lab sono documentate in questo file.

Il formato segue [Keep a Changelog](https://keepachangelog.com/it/1.1.0/) e il progetto
adotta il [Semantic Versioning](https://semver.org/lang/it/).

## [Unreleased]

## [0.5.1] - 2026-10-28

### Modificato

- Simulatori: i grafici in tempo reale stanno subito sotto la scena 3D, nella colonna di
  sinistra, invece che sotto il pannello dei parametri; scena un po' più bassa e grafici
  affiancati, così scena, comandi e grafici entrano in un solo schermo (1920×1080). Su schermi
  stretti l'ordine è scena → grafici → parametri.

## [0.5.0] - 2026-10-28

Versione essenziale ("slim"): l'app si concentra sul filo logico Faraday → alternatore →
MGU-K in frenata → energia ed effetto Joule → Goal 9 → Art. 32
([D13](docs/DECISIONS.md)).

### Rimosso

- Modalità **Interrogazione**: quiz, flashcard, ripasso degli errori e simulazione
  d'interrogazione, con la relativa voce della barra laterale e la rotta `#/interrogazione`
  (ora rimanda a Teoria).
- Sezione "Domande da interrogazione" in fondo a ogni scheda di teoria.
- Riferimenti alle slide del corso nell'interfaccia e nel testo della teoria (chip
  "Slide N", campo `slideRefs`, menzioni "(slide N)"). I numeri di slide restano solo nella
  documentazione per sviluppatori (`docs/PHYSICS.md`, tag `@slide`).
- Simulatori di approfondimento `field-biot-savart` e `pmsm-dq`, i moduli fisici
  `biotSavart` e `pmsm` con i loro test, le schede di teoria 15 (campo di Biot-Savart) e 16
  (PMSM d-q) e le sezioni §7–§8 di `docs/PHYSICS.md`.
- Screenshot `docs/media/field-biot-savart-*.png` e `docs/media/interrogazione-*.png`.

### Modificato

- Scheda 13 rinominata `13-filo-logico` ("Il filo logico: da Faraday all’Art. 32"): una
  pagina di sintesi della catena, senza copione orale né domande.
- Scheda "Dinamica della frenata" rinominata da `17-dinamica-frenata` a
  `15-dinamica-frenata`; collegamenti interni aggiornati.
- Formato delle schede di teoria: cinque titoli fissi (In breve, Formule, Spiegazione,
  Esempio numerico, Collegamento con KERS / MGU-K), senza `slideRefs` nel frontmatter.
- Glossario, `docs/ARCHITECTURE.md`, `docs/PHYSICS.md` (dinamica della vettura ora §7),
  `docs/OPEN_FACTS.md`, `docs/DESKTOP.md`, README e CONTRIBUTING aggiornati: 15 schede di
  teoria, 7 simulatori, nessun quiz. Nuova decisione D13 in `docs/DECISIONS.md`; nota in
  testa a `docs/QA_REPORT.md` sui rilievi ormai obsoleti.

## [0.4.1] - 2026-10-28

### Corretto

- Pedici testuali in tondo anche in "Frenata e recupero di energia" (E_rec, E_diss, t_rec,
  P_fren, P_MGU-K), nel bilancio di "rl-energy" (E_gen), in "pmsm-dq" e nella teoria 16
  (V_DC) e in una domanda del quiz (F_x,post).

### Modificato

- README aggiornato alla v0.4.0: 17 schede di teoria, 9 simulatori (tabella degli
  approfondimenti), 82 domande, app desktop, struttura del progetto e nuovi screenshot in
  `docs/media/`.

## [0.4.0] - 2026-10-28

Fase 4 completata: app desktop per Windows e verifica indipendente dei moduli avanzati.

### Aggiunto

- App desktop Windows con Tauri 2: installer NSIS (`.exe`, per utente) e `.msi`, WebView2
  incluso per l’installazione offline, CSP restrittiva, navigazione bloccata fuori dall’app;
  workflow `desktop.yml` che costruisce gli installer su Windows a ogni tag `v*` e li allega alla
  Release. Guida in `docs/DESKTOP.md` (eseguibile non firmato: avviso SmartScreen al primo
  avvio).

### Corretto

- Teoria 17: la formula della forza MGU-K e il bilancio energetico sono su due righe, senza
  scorrimento orizzontale a 1280×720; le formule più larghe della colonna diventano regioni
  raggiungibili da tastiera (WCAG 2.1.1) (QA-020).
- Test di accessibilità: axe su tutte le sezioni di teoria 01–17 e sull’indice, tema chiaro e
  scuro; zero violazioni di qualsiasi gravità anche per "pmsm-dq" e "car-dynamics" (QA-021).
- `docs/PHYSICS.md`: potenze dell’esempio PMSM ricalcolate (≈ 147 kW alla velocità base,
  ≈ 191–199 kW tra 2 e 3,2 volte) (QA-022).
- Biot-Savart: le linee di campo partono dal piano x = 0 ma nel solenoide ne escono un poco;
  descrizione corretta in `docs/PHYSICS.md` e nel modello (QA-023).
- `pmsmMtpa` con ψₘ = 0 e L_d = L_q restituisce i_d = 0, i_q = ±I invece di NaN (QA-024).
- Biot-Savart: scala del cursore "1 spira"; virgolette tipografiche nella fonte 2026 dei
  preset (QA-025).
- Teoria 17 e "car-dynamics": pedici testuali in tondo (E_freni, F_x,post, P_batt …); niente
  a capo dopo "(" nella Spiegazione (QA-026).
- `docs/OPEN_FACTS.md`: colonna "Where used" aggiornata per le sezioni 15–17 e i simulatori
  (QA-027).
- Build: soglia di avviso dei chunk a 600 kB, motivata in D12 (il solo chunk grande è three.js,
  caricato su richiesta) (QA-028).
- "car-dynamics": rendimento η minimo 0,5 (QA-029).
- Biot-Savart: un secondo montaggio sullo stesso contenitore sostituisce il primo (un solo
  Web Worker) (QA-030).

## [0.3.1] - 2026-10-28

Fase 4, terzo modulo di approfondimento.

### Aggiunto

- Simulatore "Dinamica della vettura: frenata combinata MGU-K + freni": vettura puntiforme con
  trasferimento di carico, pneumatici Pacejka al picco di aderenza (ABS ideale), resistenza
  aerodinamica e deportanza, MGU-K solo sull’asse posteriore limitata da Pₘₐₓ/η (D8) e
  dall’aderenza; confronto diretto con il modello a decelerazione costante di "Frenata e
  recupero di energia". Nuova scheda di teoria 17 e domande del quiz.
- Funzioni di fisica `vehicle-dynamics.ts` con test (bilancio energetico entro 1·10⁻⁶).

## [0.3.0] - 2026-10-28

Fase 4, primi due moduli di approfondimento.

### Aggiunto

- Simulatore "Campo magnetico di bobine reali (Biot-Savart)": spira, solenoide e bobine di
  Helmholtz; linee di campo calcolate in un Web Worker (RK4) e animate su GPU; confronto con il
  solenoide ideale della slide 14 (B = μ₀NI/l, L = μ₀N²S/l). Nuova scheda di teoria 15.
- Simulatore "Macchina sincrona a magneti permanenti: modello d-q": trasformate di
  Clarke/Park, coppia, limiti di corrente e tensione, MTPA e deflussaggio, mappe coppia/potenza-
  velocità in motore e in frenata; parametri illustrativi (il tipo reale dell’MGU-K resta
  [DA VERIFICARE]). Nuova scheda di teoria 16.
- Funzioni di fisica `biotSavart.ts` e `pmsm.ts` con test (copertura 100 % righe).
- Domande del quiz per le sezioni 15 e 16.

### Corretto

- Test di accessibilità del quiz instabile: le opzioni composte solo da una formula non avevano
  un nome accessibile per axe; ora hanno un `aria-label` in testo semplice, con test
  deterministici per ogni domanda.

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

[Unreleased]: https://github.com/Chip-jpg/MGUK-KERS-Simulator/compare/v0.5.1...HEAD
[0.5.1]: https://github.com/Chip-jpg/MGUK-KERS-Simulator/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/Chip-jpg/MGUK-KERS-Simulator/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/Chip-jpg/MGUK-KERS-Simulator/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/Chip-jpg/MGUK-KERS-Simulator/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/Chip-jpg/MGUK-KERS-Simulator/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/Chip-jpg/MGUK-KERS-Simulator/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Chip-jpg/MGUK-KERS-Simulator/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Chip-jpg/MGUK-KERS-Simulator/releases/tag/v0.1.0
