# KERS Lab — Specifica tecnica e di build

Riferimento tecnico per chi sviluppa KERS Lab; la presentazione del laboratorio è nel [README](../README.md).

## Tecnologie

- **Vite 5 + TypeScript 5** in modalità strict, senza framework UI: TypeScript «vanilla» e piccoli componenti.
- **Three.js r169** per le scene 3D e **uPlot 1.6** per i grafici in tempo reale.
- **marked 14 + KaTeX 0.16** per la teoria in Markdown con formule.
- **Vitest** per i test unitari; **Playwright + axe** per test end-to-end e accessibilità su Chromium.
- **ESLint + Prettier**, Conventional Commits con **commitlint**, **GitHub Actions** e **GitHub Pages**.
- **Tauri 2** per l'app desktop Windows.

L'app web è statica e funziona offline: nessuna richiesta di rete a runtime, font inclusi nel pacchetto. Anche l'app Windows usa la stessa build offline.

## Motore fisico e rappresentazione dei modelli

Il motore fisico è scritto in TypeScript puro, usa unità SI e non dipende dal DOM o da Three.js. La fisica avanza con **passo fisso di 1/240 s**, indipendentemente dalla frequenza di rendering. Il rendering ha un **limite fisso di 200 FPS**, senza selettore: monitor, GPU e browser determinano la frequenza effettiva. Il contatore FPS si attiva con il tasto accento grave (backtick, <code>`</code>).

Le scene sono guidate dai modelli: linee di campo calcolate, particelle di corrente proporzionali a i, temperature da modelli termici, nastri di energia proporzionali alla potenza. Le scale sono dichiarate nelle legende e nella tabella di trasparenza in [PHYSICS.md, §12](./PHYSICS.md).

I nove simulatori e i dettagli dei modelli:

| ID                  | Modello e rappresentazione                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `faraday`           | Bobina di N spire in rotazione nel campo uniforme; Φ(t), f.e.m.(t) e scale sempre visibili.                                                            |
| `lenz`              | Magnete in avvicinamento/allontanamento dalla bobina: campo indotto, verso della corrente e forza che si oppone alla variazione.                       |
| `alternator-motor`  | Stessa macchina come generatore e motore, forza magnetica sui conduttori percorsi da corrente e flussi di energia.                                     |
| `kers-drive`        | Auto e MGU-K reversibili, batteria finita, telemetria e confronto analitico della frenata conservato.                                                  |
| `joule-transformer` | Trasformatore ideale e perdite di linea: a parità di potenza, 10× tensione → 100× meno perdite.                                                        |
| `rl-energy`         | i(t) = I₀(1 − e^(−t/τ)), τ = L/R, energia ½LI² e bilancio energetico.                                                                                  |
| `car-dynamics`      | Approfondimento: pneumatici Pacejka, resistenza e deportanza, l'MGU-K sull'asse posteriore limitata da Pₘₐₓ/η e dall'aderenza.                         |
| `drive-sim`         | Dimostrazione finale con pedali e tastiera a risposta graduale: 800 kg, 300 → 100 km/h ≈ 2,47 MJ; modello longitudinale 1D, non un simulatore di giro. |
| `mguk-teardown`     | Spaccato 3D dell'MGU-K in frenata: statore, rotore, inverter e flussi di energia.                                                                      |

Ogni simulatore include sensori con dimensioni fisse accanto ai componenti, **F** per lo schermo intero e **P** per la vista di presentazione. Nella guida si tengono premuti Acceleratore e Freno con mouse, touch, Spazio/Invio oppure W/S e frecce. I preset 2025 (120 kW) e 2026 (350 kW) confrontano l'MGU-K con lo stesso veicolo e la stessa carica iniziale.

Ogni simulatore dichiara le proprie semplificazioni: campo uniforme, spira singola al posto della reale macchina trifase, trasformatore ideale, niente saturazione. Per l'MGU-K reale, la macchina trifase è un **dato del costruttore**; che sia sincrona a magneti permanenti è **una stima pubblicata, non un dato ufficiale**. Le formule e la corrispondenza con le slide sono in [PHYSICS.md](./PHYSICS.md); i dati non confermati sono marcati **[DA VERIFICARE]** in [OPEN_FACTS.md](./OPEN_FACTS.md).

## Grafica 3D e qualità

La qualità è selezionabile nel menu laterale e ricordata dal browser. Il rilevamento automatico sceglie il livello in base all'ambiente grafico:

- **Alta** — post-processing, ombre e riflessi; automatica nell'app per PC e con scheda grafica dedicata.
- **Bilanciata** — per schede grafiche integrate.
- **Base** — senza effetti, per PC senza accelerazione grafica.

L'override nell'URL accetta `?quality=alta`, `?quality=bilanciata` o `?quality=base`.

I dieci screenshot in [screenshots/](./screenshots/) sono stati acquisiti a **1280×720**, con tema scuro e `?quality=alta`, dalla build della testa della PR #44 (`58fc1b4`).

## Struttura del progetto

```text
README.md  LICENSE  CHANGELOG.md  CONTRIBUTING.md
docs/            BUILD_SPEC.md, ARCHITECTURE.md, PHYSICS.md (formule ↔ slide),
                 DECISIONS.md, OPEN_FACTS.md (dati da verificare), QA_REPORT.md,
                 DESKTOP.md, media/, screenshots/
content/theory/  NN-slug.md — schede di teoria (italiano)
src/
  core/          shell dell'app, router (hash), i18n (it.ts), tema, registro moduli
  physics/       TypeScript puro, unità SI, nessun DOM/Three.js
  render/        base grafica 3D comune
  ui/            componenti, slider, wrapper dei grafici
  sims/<id>/     un simulatore per cartella
  theory/        loader e renderer del Markdown
tests/  e2e/
.github/         workflow CI, deploy Pages, build desktop, modelli di issue e PR
src-tauri/       app desktop Windows (Tauri 2)
```

Dettagli in [ARCHITECTURE.md](./ARCHITECTURE.md); motivazioni e decisioni in [DECISIONS.md](./DECISIONS.md).

## Avvio rapido

Requisiti: **Node.js ≥ 20** (in CI si usa Node 22) e npm. Gli script sono definiti in [package.json](../package.json).

```bash
npm ci            # installa le dipendenze nelle versioni del lockfile
npm run dev       # server Vite → http://localhost:5173
npm run build     # tsc --noEmit e build Vite di produzione in dist/
npm run preview   # serve la build in locale
```

## Controlli di qualità e script

```bash
npm run lint           # eslint .
npm run format:check   # prettier --check .
npm run typecheck      # tsc --noEmit, TypeScript strict
npm test               # vitest run
npm run test:coverage  # vitest run --coverage
npm run e2e            # playwright test, Chromium
```

Altri script disponibili:

| Comando                 | Script                 |
| ----------------------- | ---------------------- |
| `npm run format`        | `prettier --write .`   |
| `npm run test:watch`    | `vitest`               |
| `npm run lint:commits`  | `commitlint --verbose` |
| `npm run tauri`         | `tauri`                |
| `npm run desktop:dev`   | `tauri dev`            |
| `npm run desktop:build` | `tauri build`          |

Per usare un Chromium già installato: `PW_CHROMIUM_PATH=/percorso/chrome npm run e2e`. La variabile `PW_PORT` permette di impostare la porta del server per i test end-to-end; può essere combinata con `PW_CHROMIUM_PATH`.

## CI e workflow

- [ci.yml](../.github/workflows/ci.yml) — **CI**: controlli automatici su push, pull request o avvio manuale.
- [commitlint.yml](../.github/workflows/commitlint.yml) — **Commitlint**: verifica dei Conventional Commits sulle pull request.
- [pages.yml](../.github/workflows/pages.yml) — **Deploy to GitHub Pages**: pubblicazione del sito sui tag `v*` o con avvio manuale.
- [desktop.yml](../.github/workflows/desktop.yml) — **Desktop (Windows)**: build degli installer sui tag `v*` o con avvio manuale.

## Come pubblicare una release

1. Una sola volta: in **Settings → Pages → Build and deployment → Source** scegli
   **GitHub Actions**; poi in **Settings → Environments → github-pages → Deployment
   branches and tags** aggiungi una regola **Tag** con pattern `v*`, mantenendo `main`.
   Senza questa regola i deploy avviati dai tag vengono rifiutati dalle regole di
   protezione dell’ambiente.
2. Aggiorna `CHANGELOG.md` (sposta le voci di `[Unreleased]` in una nuova sezione
   `## [X.Y.Z] - AAAA-MM-GG`) e la versione in `package.json`, poi fai il merge su `main`.
3. Crea e pubblica il tag annotato: il push del tag `v*` avvia il workflow
   [`pages.yml`](../.github/workflows/pages.yml), che compila e pubblica il sito su GitHub Pages.

   ```bash
   git tag -a vX.Y.Z -m "KERS Lab vX.Y.Z"
   git push origin vX.Y.Z
   ```

   Se l’esecuzione del tag fallisce o il sito non si aggiorna, avvia a mano il workflow:
   **Actions → Deploy to GitHub Pages → Run workflow** sul branch `main`
   (`workflow_dispatch`).

   Il sito viene compilato una sola volta dal tag o branch che ha avviato il deploy
   (`github.sha`): lo stesso build è servito sia alla radice sia in `/3d/`, così i
   vecchi collegamenti a `/3d/` continuano a funzionare.

4. Crea la **GitHub Release** dal tag (`Releases → Draft a new release`, oppure
   `gh release create vX.Y.Z --title "vX.Y.Z" --notes-file note.md`), copiando come note
   il testo della sezione corrispondente di `CHANGELOG.md`.

## App desktop (Windows)

Lo stesso tag `v*` avvia anche [`desktop.yml`](../.github/workflows/desktop.yml), che con
[Tauri 2](https://v2.tauri.app/) produce gli installer Windows (`.exe` NSIS e `.msi`) e li
allega alla Release del tag (se la Release non esiste ancora la crea: le note si
aggiornano poi con `gh release edit vX.Y.Z --notes-file note.md`). L’app usa la stessa
build del sito ed è completamente offline. Build locale su Windows: `npm run desktop:build`.
Prerequisiti, CSP e limitazioni (binario non firmato → avviso SmartScreen, nessun
aggiornamento automatico) in [`DESKTOP.md`](./DESKTOP.md).

## Contribuire

Leggere [CONTRIBUTING.md](../CONTRIBUTING.md): un branch per task, Conventional Commits, test obbligatori, fisica «pura», testi in italiano e codice in inglese.

## Documentazione di riferimento

- [README](../README.md): presentazione del laboratorio e roadmap.
- [ARCHITECTURE.md](./ARCHITECTURE.md): struttura dell'app.
- [DECISIONS.md](./DECISIONS.md): decisioni progettuali.
- [PHYSICS.md](./PHYSICS.md): formule, modelli, scale e corrispondenza con le slide.
- [OPEN_FACTS.md](./OPEN_FACTS.md): dati ancora da verificare.
- [DESKTOP.md](./DESKTOP.md): prerequisiti Windows, CSP e limitazioni desktop.
- [CHANGELOG.md](../CHANGELOG.md): cronologia delle modifiche; tag git e GitHub Release dalla v0.7.0.
