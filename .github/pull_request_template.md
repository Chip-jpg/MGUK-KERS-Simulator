<!--
Titolo della PR = messaggio del commit di squash-merge: usa Conventional Commits.
PR title = squash-merge commit message: use Conventional Commits,
e.g. `feat(sim/faraday): add rotating loop scene`, `docs(theory): …`, `fix(physics): …`.
-->

## Cosa cambia / What changes

<!-- Breve descrizione. Collega l'issue: "Closes #123". -->

## Task e file posseduti / Task and owned paths

- Task: <!-- es. A4 — Sim faraday -->
- Branch: <!-- feat/<task-id>-<slug> -->
- [ ] Ho modificato solo i file che il mio task possiede (vedi `docs/ARCHITECTURE.md` §3). / I only touched paths my task owns.

## Verifica / Verification

- [ ] `npm run lint`
- [ ] `npm run format:check`
- [ ] `npm run typecheck`
- [ ] `npm test` (nuovi test per la nuova logica / new tests for new logic)
- [ ] `npm run build`
- [ ] `npm run e2e` (se tocca UI o simulatori / if UI or simulators changed)

<!-- Incolla qui l'output rilevante dei test. / Paste relevant test output here. -->

## Fisica e contenuti / Physics and content

- [ ] `src/physics` resta puro (niente DOM, Three.js, orologi). / Physics stays pure.
- [ ] Formule coerenti con le slide (numero di slide citato). / Formulas match the slides (slide number cited).
- [ ] Testi dell'interfaccia in italiano, codice e commit in inglese. / Italian UI text, English code and commits.
- [ ] Numeri non verificati marcati `[DA VERIFICARE]` con fonte o voce in `docs/OPEN_FACTS.md`. / Unverified numbers flagged.
- [ ] Nessun logo o immagine protetti (F1, FIA, team). / No copyrighted logos or images.

## Screenshot

<!-- Per modifiche visive: prima / dopo, tema chiaro e scuro. / For visual changes: before/after, light and dark. -->
