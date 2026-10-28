# Changelog

Tutte le modifiche rilevanti di KERS Lab sono documentate in questo file.

Il formato segue [Keep a Changelog](https://keepachangelog.com/it/1.1.0/) e il progetto
adotta il [Semantic Versioning](https://semver.org/lang/it/).

## [Unreleased]

### Aggiunto

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
  trattini nei titoli).
- QA-017: etichette delle scene che non si sovrappongono più; grafico energie nascosto
  prima della chiusura dell'interruttore.
- QA-018: pannello formule e letture aggiornati nello stesso fotogramma.

[Unreleased]: https://github.com/Chip-jpg/MGUK-KERS-Simulator/commits/HEAD
