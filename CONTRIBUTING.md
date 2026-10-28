# Contribuire a KERS Lab

Grazie per l'interesse! Queste regole tengono la cronologia pulita e il codice
coerente con il programma del corso. _English hints are in italics._

## Lingue

- **Interfaccia e contenuti in italiano**: ogni testo visibile all'utente sta in
  `src/core/i18n/it.ts` (la teoria in `content/theory/*.md`). Numeri sempre con `formatIT` (virgola decimale, unità di misura).
- **Codice, identificatori, commenti e messaggi di commit in inglese.**

_Italian for user-facing text, English for code and commits._

## Flusso di lavoro: un branch per task

1. Ogni task ha un proprio branch `feat/<task-id>-<slug>` (es. `feat/A4-faraday`),
   oppure `fix/<slug>` / `docs/<slug>` per interventi piccoli.
2. Commit piccoli e mirati; apri una pull request verso il branch principale.
3. Il merge avviene con **squash**: il titolo della PR diventa il messaggio del commit,
   quindi deve rispettare i Conventional Commits.
4. Aggiorna `CHANGELOG.md` (sezione `## [Unreleased]`) e, se cambia la roadmap, il
   `README.md`.

_One branch per task, small commits, squash-merge; keep CHANGELOG and roadmap in sync._

## Conventional Commits

Formato: `tipo(scope): descrizione` — lo scope è libero.

| Tipo                        | Uso                                                                   |
| --------------------------- | --------------------------------------------------------------------- |
| `feat`                      | nuova funzionalità (`feat(sim/faraday): add rotating loop scene`)     |
| `fix`                       | correzione di un bug (`fix(physics): handle R = 0 in inducedCurrent`) |
| `docs`                      | documentazione o teoria (`docs(theory): add 04-lenz`)                 |
| `test`                      | solo test (`test(physics): assert slide-10 example`)                  |
| `refactor`, `perf`, `style` | modifiche senza cambiare il comportamento                             |
| `ci`, `build`, `chore`      | workflow, build, manutenzione                                         |

Il controllo è automatico (workflow **Commitlint**, configurazione in
`commitlint.config.js`). In locale:

```bash
echo "feat(ui): add slider" | npx commitlint   # controlla un messaggio
npm run lint:commits -- --from origin/main      # controlla i commit del branch
```

## Proprietà dei file

Ogni task possiede solo i propri percorsi (tabella completa in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §3). Non modificare file di altri task:
se un contratto condiviso (§4) non basta, apri una richiesta di modifica invece di
improvvisare. Le decisioni accettate finiscono in `docs/DECISIONS.md`.

| Percorso                                                                                        | Proprietario                   |
| ----------------------------------------------------------------------------------------------- | ------------------------------ |
| `src/physics/**`, `tests/physics/**`, `docs/PHYSICS.md`                                         | A1 — fisica                    |
| `content/theory/**`, `docs/OPEN_FACTS.md`                                                       | A2 — teoria                    |
| `src/core/**`, `src/ui/**`, `src/theory/**`, CSS globale                                        | A3 — shell e design system     |
| `src/sims/<id>/**`                                                                              | A4–A8 — un simulatore per task |
| `.github/**`, `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `LICENSE`, `commitlint.config.js` | A10 — DevOps                   |

_Only edit the paths your task owns; request contract changes instead of improvising._

## Test obbligatori

Prima di ogni pull request devono passare gli stessi controlli della CI:

```bash
npm run lint && npm run format:check && npm run typecheck && npm test && npm run build
npm run e2e   # se tocchi interfaccia o simulatori
```

- Ogni nuova logica ha i suoi unit test (Vitest) in `tests/**` o accanto al codice.
- La fisica deve verificare i valori di riferimento del contratto (es. esempio della
  slide 10 ⇒ I = 62,5 mA; 800 kg, 300→100 km/h ⇒ ΔE_k ≈ 2,47 MJ).
- I test che richiedono il DOM iniziano con `// @vitest-environment jsdom`.
- Gli smoke test end-to-end stanno in `e2e/<area>.spec.ts` (Playwright, Chromium).

_Every change ships with tests; CI must be green._

## Regola di purezza della fisica

`src/physics/**` è **TypeScript puro**: unità SI, funzioni pure, nessuno stato globale.
Vietati DOM (`window`, `document`…), Three.js, uPlot, KaTeX, marked, orologi
(`Date`, `performance`, timer) e import da `core/ ui/ sims/ theory/`. La regola
è imposta da ESLint. Ogni funzione esportata ha un TSDoc con formula, unità e
`@slide N`. L'integrazione nel tempo usa RK4 a passo fisso `dt = 1/240 s`.

_Physics is pure, deterministic, SI-only; ESLint enforces it._

## Onestà dei contenuti

- KERS Lab è un modello semplificato: ogni simulatore dichiara le sue ipotesi
  ("Modello semplificato: …").
- Nessun dato regolamentare o numerico senza fonte: se non è verificabile, marcalo
  `[DA VERIFICARE]` e aggiungilo a `docs/OPEN_FACTS.md`.
- Nessun logo, marchio o foto protetti (F1, FIA, scuderie); niente slide del corso nel
  repository.
- Niente riferimenti alle slide nell'interfaccia né nel testo della teoria (niente chip
  "Slide N", niente "(slide N)"): i numeri di slide restano solo in `docs/PHYSICS.md` e nei
  tag TSDoc `@slide` di `src/physics` ([D13](docs/DECISIONS.md)).
- Ogni scheda di teoria ha i cinque titoli fissi, nell'ordine: `## In breve`, `## Formule`,
  `## Spiegazione`, `## Esempio numerico`, `## Collegamento con KERS / MGU-K`; niente
  sezioni di domande e risposte.
- Mai committare segreti, token, `.env`, `node_modules` o file binari pesanti.

## Segnalazioni

Usa i modelli di issue: **bug**, **errore di fisica / contenuto** (con fonte) o
**proposta**.
