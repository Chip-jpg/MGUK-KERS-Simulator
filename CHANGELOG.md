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

[Unreleased]: https://github.com/Chip-jpg/MGUK-KERS-Simulator/commits/HEAD
