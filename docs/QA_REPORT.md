# QA report — A11 independent verification

## Round 2 — re-verification of QA-001…QA-018

Date: 2026-10-28 · Base: `claude/new-session-u560qi` @ `3c0c1ed` · Branch: `qa/A11-r2`.
Scope: re-test every round-1 defect in code and in the browser, regression sweep, cross-consistency
spot-check. Read-only on source; scripts and screenshots in the scratchpad `a11r2/` (not committed).

### R2.1 Verdict

| Item                                   | Result | Notes                                                       |
| -------------------------------------- | ------ | ----------------------------------------------------------- |
| Physics core (`src/physics`)           | PASS   | unchanged; 100 % coverage                                   |
| Shell / UI (`src/core`, `src/ui`)      | PASS   | QA-001/003/004/005 fixed; nit QA-016 residue                |
| Sim `faraday`                          | PASS   | —                                                           |
| Sim `lenz`                             | PASS   | —                                                           |
| Sim `alternator-motor`                 | PASS   | —                                                           |
| Sim `kers-braking`                     | PASS   | —                                                           |
| Sim `joule-transformer`                | PASS   | QA-001 fixed                                                |
| Sim `rl-energy`                        | PASS   | —                                                           |
| Theory 01–09                           | PASS   | 01/02/07/09 hedged wording verified                         |
| Theory 10 kers-mguk                    | PASS   | numbers and wording aligned (QA-008/012/013)                |
| Theory 11, 12, 13, 14                  | PASS   | 13 formula count fixed; titles 10–12 keep " - " (nit)       |
| Quiz / Interrogazione                  | PASS   | page scroll gone; residual in-panel overflow QA-019 (minor) |
| CI / docs (README, PHYSICS, DECISIONS) | PASS   | —                                                           |

**Overall: PASS** for release v0.1.0 — no open blocker or major defect. One new minor defect
(QA-019) and two nit residues (QA-016) are recommended but not release-blocking.

### R2.2 Status of round-1 defects

| ID     | Sev   | Status                       | Evidence (round 2)                                                                                                                                                                                                                                                                                                                                                                                       |
| ------ | ----- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| QA-001 | major | Verified-fixed               | `parseNumberIT` (`src/ui/slider.ts`) treats valid thousands groups as grouping. Browser (prod build): Enter on `20.000` → `20.000` (range 20000, not invalid); typed `25.000` → 25000; `12.345,5` → 12.500 (snapped); `abc` → `aria-invalid=true`; P `10.000.000` + Enter unchanged. Enter on every slider field of all 6 sims (40 fields) leaves the value unchanged. Round-trip unit test + e2e added. |
| QA-002 | major | Verified-fixed (page scroll) | `#/interrogazione` 1280×720 dark + light: `scrollWidth − clientWidth = 0`; e2e asserts it in 3 quiz states. Residual overflow **inside** the side panel → new QA-019 (minor).                                                                                                                                                                                                                            |
| QA-003 | minor | Verified-fixed               | `tickDigits` exported and tested: 0,25 → 2, 2,5 → 1, float noise absorbed (`tests/ui/plot-ticks.test.ts`).                                                                                                                                                                                                                                                                                               |
| QA-004 | minor | Verified-fixed               | Field width from `--slider-chars`; P at max `100.000.000`: scrollWidth 137 = clientWidth 137. No clipped field on any sim.                                                                                                                                                                                                                                                                               |
| QA-005 | minor | Verified-fixed               | `src/core/debug.ts` `registerDebugHook` used by all 6 sims; bundle has `import.meta.env.DEV` stripped. Prod preview with `--disable-blink-features=AutomationControlled` + `navigator.webdriver` forced `false`: `Object.keys(window.__kersDebug ?? {})` = `[]` on all 6 sims; with `?kersDebug` → `["faraday"]`. Hooks unregister on dispose.                                                           |
| QA-006 | minor | Verified-fixed               | Alternator panel shows "Teoria: Alternatore (07) · Motore e forza di Lorentz (09) · KERS/MGU-K (10)", hrefs resolve to the three theory routes.                                                                                                                                                                                                                                                          |
| QA-007 | minor | Verified-fixed               | grep `magneti permanenti` / `PMSM` over content, src, README: every MGU-K statement is hedged ("generalmente descritta come sincrona a magneti permanenti", `[DA VERIFICARE]` in 07/09/10/README). Glossary/quiz PMSM entries define the acronym only; quiz adds "tipo esatto non pubblico".                                                                                                             |
| QA-008 | minor | Verified-fixed               | PHYSICS.md §4 example now t = 3 s: 2.469 MJ, P 1.235 → 0.412 MW, absorbed 0.40 MJ, stored 0.36 MJ (14.6 %), discs 2.069 + MGU-K 0.040 MJ, 18.5 s; 350 kW variant 1.05 MJ / 6.3 s. Matches theory 10, quiz, sim.                                                                                                                                                                                          |
| QA-009 | minor | Verified-fixed               | README embeds `e2e/screenshots/theory-dark-1280x720.png` and `sim-empty-dark-1280x720.png`; both exist and are tracked.                                                                                                                                                                                                                                                                                  |
| QA-010 | minor | Verified-fixed               | Screenshots go to `test-results/screenshots/` (gitignored) unless `UPDATE_SCREENSHOTS=1`. `git status --short` after the full e2e run: empty.                                                                                                                                                                                                                                                            |
| QA-011 | minor | Verified-fixed               | `sm-mguk-limite`: "può inviare alla batteria al massimo $P_{\max}$ (assorbe meccanicamente al massimo $P_{\max}/\eta$)"; explanation de-duplicated.                                                                                                                                                                                                                                                      |
| QA-012 | minor | Verified-fixed               | "Tempo per assorbire tutta ΔE_k alla potenza massima (in batteria … η·ΔE_k)" in theory 10 (Formule + Esempio), sim formula label, balance row + hint, quiz generator. No "recuperare tutta" left.                                                                                                                                                                                                        |
| QA-013 | nit   | Verified-fixed               | lenz `[4, 7, 8, 9, 11]`; kers-braking sim and theory 10 frontmatter both `[16, 17, 18, 19]`; PHYSICS.md documents the alignment (function table still "none (extension)", consistent).                                                                                                                                                                                                                   |
| QA-014 | nit   | Verified-fixed               | 09 trimmed (24 kW line removed), 10 tightened; sources and `[DA VERIFICARE]` markers intact. Optional item, accepted.                                                                                                                                                                                                                                                                                    |
| QA-015 | nit   | Verified-fixed               | 13 "Le otto formule" (8 counted); 06 "ed energia"; `63{,}2\ \%` (and other `%` in 06/08/10).                                                                                                                                                                                                                                                                                                             |
| QA-016 | nit   | Still-open (partial)         | Fixed: Φ, Pₘₐₓ, ΔEₖ, τₑₛₜ, `2,0·10⁻¹⁰`, `exp(−t/τ)`, "1 spira" (faraday, lenz), curly apostrophes in sims. Residue: theory titles 10/11/12 still use " - " (`content/theory/10-kers-mguk.md:3`, `11-…:3`, `12-…:3`, visible in the sidebar); straight `'` remains in shell tagline (`src/core/i18n/it.ts:11-12`) and quiz text. Fix: " – " in the three `titleIT`; pick one apostrophe style.            |
| QA-017 | nit   | Verified-fixed               | Screenshots: lenz "B indotto" below the coil; alternator arrowheads stop before the boxes; joule labels clear of the pylons; rl-energy "Generatore E" right of the battery, energy plot dimmed with hint "Chiudi l’interruttore per avviare il transitorio".                                                                                                                                             |
| QA-018 | nit   | Verified-fixed               | `formulas.flush()` in `render()`. Running alternator, same instant: formula ε −14,52 V / i −2,90 A / τ −2,145 N·m = readouts −14,52 V / −2,90 A / −2,145 N·m.                                                                                                                                                                                                                                            |

### R2.3 New defects

| ID     | Sev   | Owner | File:line                                                                                                       | Defect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Evidence                                                                                                                                                                                                                                                                | Suggested fix                                                                                                                                                         |
| ------ | ----- | ----- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| QA-019 | minor | A9    | `src/quiz/quiz.css:42-46` (`.quiz__controls`, `.quiz__filters`); `src/styles/components.css:365` (`.segmented`) | At 1280×720 (both themes) the Interrogazione side panel content still overflows its card: panel `.quiz__controls` box x 941–1248, `scrollWidth 332 > clientWidth 305`; the "Allenamento / Simulazione interrogazione" toggle and the "Sezione" `<select>` end at x ≈ 1274, i.e. across the card border and right padding. The page no longer scrolls (QA-002 assertion passes), but the toggle does not wrap: `<fieldset>` has `min-inline-size: min-content` and the grid items keep `min-width: auto`, so `flex-wrap: wrap` never triggers. Not reproduced at 1920×1080. | `a11r2/shots/quiz-dark.png`, `quiz-side-light-1280.png`; measurement `a11r2/q2.mjs`. Injecting `.quiz .segmented, .quiz__controls > *, .quiz__filters > *, .quiz__field > * { min-width: 0; min-inline-size: 0 }` → 305 = 305, toggle wraps (`quiz-side-fixprobe.png`). | Add that rule to `quiz.css` (or `min-inline-size: 0` on `.segmented` globally); extend the e2e no-overflow check to `.quiz__controls` (`scrollWidth <= clientWidth`). |

### R2.4 Runs

```
npm run lint            → clean
npm run format:check    → All matched files use Prettier code style!
npm run typecheck       → clean
npm test                → Test Files 38 passed (38) · Tests 500 passed (500)
npm run build           → ✓ built in 3.50s (three.module 496.51 kB, no >500 kB warning)
npx vitest run --coverage → physics 100 % stmts / 100 % branch / 100 % funcs / 100 % lines
PW_PORT=4440 … npm run e2e -- --workers=2 → 71 passed (2.6m)
git status --short (after e2e) → empty
```

Own sweep on the production preview (1280×720, 23 routes × dark + light = 46 screenshots in
`a11r2/shots/`): horizontal page scroll 0 on every route; axe-core WCAG 2.0/2.1 A+AA **0
violations** on all 46; **0** non-same-origin requests; **0** console errors / page errors. Visual
review of all 6 sims, the quiz and theory 10 (both themes in the subset): no empty canvases, no
clipping, no label overlaps; only finding QA-019.

### R2.5 Cross-consistency spot-check

- KERS defaults (800 kg, 300 → 100 km/h, 3 s, 120 kW, η 0,9): sim shows "In batteria: 0,360 MJ";
  theory 10 2,47 MJ / 0,36 MJ / ≈ 0,40 MJ absorbed / 2,07 MJ discs / 18,5 s; PHYSICS.md same; quiz
  `sm-mguk-limite` 2,47 MJ, 820 kW, 0,36 MJ; "assorbire" wording everywhere — consistent.
- MGU-K machine type hedged in theory 01/02/07/09/10/13, alternator note, quiz, README — consistent
  with OPEN_FACTS #8.
- Italian proofreading of changed strings: correct ("ed energia", "1 spira", "Tempo per assorbire
  tutta ΔEₖ…", "Chiudi l’interruttore per avviare il transitorio"); only QA-016 residue above.

---

# Round 1

Date: 2026-10-27 · Base: `claude/new-session-u560qi` @ `42e4791` · Branch: `qa/A11`.
Scope: §6 A11 checks 1–5. Read-only on source; screenshots and scripts kept outside the
repo (scratchpad `a11/`). Rule: any blocker/major defect makes its item **FAIL**.

## 1. Summary

| Item                                   | Result   | Blocking defects                   |
| -------------------------------------- | -------- | ---------------------------------- |
| Physics core (`src/physics`)           | PASS     | —                                  |
| Shell / UI (`src/core`, `src/ui`)      | **FAIL** | QA-001                             |
| Sim `faraday`                          | PASS     | —                                  |
| Sim `lenz`                             | PASS     | —                                  |
| Sim `alternator-motor`                 | PASS     | —                                  |
| Sim `kers-braking`                     | PASS     | —                                  |
| Sim `joule-transformer`                | **FAIL** | QA-001 (shared slider bug hits it) |
| Sim `rl-energy`                        | PASS     | —                                  |
| Theory 01–09                           | PASS     | —                                  |
| Theory 10 kers-mguk                    | PASS     | — (minor QA-008, QA-014)           |
| Theory 11 agenda-2030-goal-9           | PASS     | — (9.4/9.5 punctuation still open) |
| Theory 12 art-32-costituzione          | PASS     | —                                  |
| Theory 13 filo-logico                  | PASS     | —                                  |
| Theory 14 glossario                    | PASS     | —                                  |
| Quiz / Interrogazione                  | **FAIL** | QA-002                             |
| CI / docs (README, PHYSICS, DECISIONS) | PASS     | — (minor QA-009, QA-010)           |

No blockers. 2 major defects, both small fixes.

## 2. Defects

Severity: blocker / major / minor / nit. Owner: A1 physics, A2 theory, A3 ui/core,
A4 faraday, A5 lenz, A6 alternator-motor, A7 kers-braking, A8 joule-transformer + rl-energy,
A9 quiz, A10 docs/CI.

| ID     | Sev   | Owner       | File:line                                                                                                                                                                                                | Defect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Evidence                                                                                                                                                            | Suggested fix                                                                                                                                                                                                                                                                                        |
| ------ | ----- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| QA-001 | major | A3          | `src/ui/slider.ts:49-58` (`parseNumberIT`)                                                                                                                                                               | The numeric field displays Italian thousands grouping (`formatIT(20000,0)` = `"20.000"`), but `parseNumberIT` treats a lone `.` as a decimal point. Pressing Enter on the **unchanged** field `V₁ = 20.000` sets V₁ to 20 → clamped to **10.000 V**; typing `25.000` also gives 10.000. `P = 10.000.000` is rejected as invalid (`aria-invalid="true"`). Every slider whose value is ≥ 10 000 is affected (today: joule-transformer V₁ and P).                                                        | Playwright: `v1Before "20.000" → v1After "10.000"`, `pAfter invalid=true`, `v1Typed25000 "10.000"` (`a11/plots.mjs`); screenshot `a11/shots/joule-after-enter.png`. | Parse with Italian rules: `.` is a grouping separator when it is followed by exactly 3 digits (`/^\d{1,3}(\.\d{3})+(,\d+)?$/`) or when a `,` is present; or format the input field without grouping (`useGrouping:false`). Add a round-trip test `parseNumberIT(fmt(v)) === v` for every param spec. |
| QA-002 | major | A9          | `src/quiz/quiz.css:11`, `src/quiz/index.ts:202`                                                                                                                                                          | Horizontal page scroll at 1280×720 on `#/interrogazione` (both themes): `.quiz__controls` / `.quiz__score` end at x = 1291 (11 px clipped). The right column's min-content (nowrap segmented "Allenamento / Simulazione interrogazione") exceeds the `1fr` track. Violates "responsive down to 1280×720".                                                                                                                                                                                             | `scrollWidth − clientWidth = 11` (`a11/shots.json`); `a11/shots/quiz-dark.png` (right panel cut at the edge).                                                       | Let segmented options wrap (`flex-wrap: wrap`) or shorten the label ("Simulazione"), or use `minmax(0, 1fr)` + `min-width: 0` on `.quiz__side`. Add `#/interrogazione` to the no-hscroll assertion in `e2e/screenshots.spec.ts`.                                                                     |
| QA-003 | minor | A3          | `src/ui/plot.ts:75-82` (`tickDigits`)                                                                                                                                                                    | Tick decimals are `−floor(log10(step))`: a step of 0,25 gets 1 decimal (labels `0,3 / 0,8` instead of `0,25 / 0,75`), a step of 2,5 gets 0 decimals (`3 / 8`). uPlot's default increments include 2,5·10ⁿ, so this occurs on scrolling time axes. (Confirms the known item.)                                                                                                                                                                                                                          | Code reading; e.g. `tickDigits([0, 0.25])` → 1.                                                                                                                     | Use the decimals needed by the step itself: `d = max(0, −floor(log10(step)))`, then `while (abs(step·10^d − round(step·10^d)) > 1e-9) d++` (cap 6).                                                                                                                                                  |
| QA-004 | minor | A3          | `src/styles/components.css:252-260` (`.slider__number` width 6.5 rem)                                                                                                                                    | Large values are clipped in the numeric field: `10.000.000` renders as `10.000.00(` (scrollWidth 108 > clientWidth 102). (Confirms the known item.)                                                                                                                                                                                                                                                                                                                                                   | `a11/shots/s-joule-transformer-dark.png`; `pWidth [108,102]`.                                                                                                       | Size the field from the formatted max (`ch` units) or show P in MW (`unit: 'MW'`, SI conversion at the boundary as kers-braking does with kW).                                                                                                                                                       |
| QA-005 | minor | A4, A6, A8  | `src/sims/faraday/index.ts:47-50`, `src/sims/alternator-motor/index.ts:~162+`, `src/sims/joule-transformer/index.ts:193-195`, `src/sims/rl-energy/index.ts:335-337`, `src/sims/kers-braking/index.ts:54` | `window.__kersDebug` is installed unconditionally in production by faraday, alternator-motor, joule-transformer, rl-energy (kers-braking also when `navigator.webdriver`); only lenz gates it on `import.meta.env.DEV` / `?kersDebug`. Some hooks expose controls (step/mount counters). Inconsistent, leaks internals into the shipped bundle. (Confirms the known item.)                                                                                                                            | Production preview: `Object.keys(window.__kersDebug)` = `faraday, alternator-motor, joule-transformer, rl-energy` (`a11/shots.json`).                               | One shared helper in `src/core` (e.g. `debugEnabled() = import.meta.env.DEV \|\| navigator.webdriver \|\| /[?&]kersDebug/.test(location.search)`) used by all six sims.                                                                                                                              |
| QA-006 | minor | A6          | `src/sims/alternator-motor/index.ts:437`                                                                                                                                                                 | `theoryId` is only `10-kers-mguk`; the motor half (Lorentz, principio inverso) is theory 09 and the generator half theory 07, but neither is linked from the sim. (Confirms the known item.)                                                                                                                                                                                                                                                                                                          | Sim page header shows a single "Vai alla teoria".                                                                                                                   | Keep `theoryId` (contract allows one) but add in-panel links to 07 and 09 (e.g. in the mode description / model note).                                                                                                                                                                               |
| QA-007 | minor | A2, A6, A10 | `src/sims/alternator-motor/panel.ts:11`; `content/theory/01-…md:53`, `02-…md:117`, `07-…md:49`, `13-…md:49,79`; `README.md` "Modello semplificato"                                                       | OPEN_FACTS #8 (MGU-K = three-phase PMSM) is **DA VERIFICARE**, and theory 09/10 hedge it ("generalmente descritta come…", `[DA VERIFICARE]`), but other places state it as plain fact: alternator note "l'MGU-K reale è una macchina sincrona trifase a magneti permanenti", theory 01/02/10 "rotore a magneti", 07 "con magneti permanenti sul rotore", 13 script and answer, README.                                                                                                                | grep + screenshot `a11/shots/s-alternator-motor-dark.png`.                                                                                                          | Use the hedged wording everywhere ("trifase, generalmente descritta come sincrona a magneti permanenti") or link to 10 where the `[DA VERIFICARE]` lives.                                                                                                                                            |
| QA-008 | minor | A1          | `docs/PHYSICS.md:156-159`                                                                                                                                                                                | KERS worked example uses `t_brake = 2.5 s` (recovered 0.30 MJ), while theory 10, quiz, sim defaults and OPEN_FACTS use **3 s** (0.36 MJ). Same model, but the reference docs disagree with the numbers the student sees.                                                                                                                                                                                                                                                                              | PHYSICS.md §4 vs `content/theory/10-kers-mguk.md:116-127`, `src/sims/kers-braking/model.ts:52`.                                                                     | Re-run the example with 3 s: peak ≈ 1.23 MW, recovered 0.36 MJ, dissipated ≈ 2.11 MJ (2.07 discs + 0.04 MGU-K), t ≈ 18.5 s.                                                                                                                                                                          |
| QA-009 | minor | A10         | `README.md:44-54`                                                                                                                                                                                        | README embeds `docs/media/*.png` and `alternator-motor.gif`; `docs/media/` does not exist → broken images on GitHub.                                                                                                                                                                                                                                                                                                                                                                                  | `ls docs/media` → no such directory.                                                                                                                                | Commit the screenshots (the e2e already produces suitable PNGs) or replace the table with a text placeholder until v0.1.0.                                                                                                                                                                           |
| QA-010 | minor | A3 / A10    | `e2e/screenshots.spec.ts:33`                                                                                                                                                                             | `npm run e2e` overwrites the committed `e2e/screenshots/*.png` (6 files modified after my run), so every local e2e run dirties the tree and risks noisy commits.                                                                                                                                                                                                                                                                                                                                      | `git status` after e2e: 6 × `M e2e/screenshots/...png`.                                                                                                             | Write to `test-results/` (gitignored) and copy deliberately, or only write when `UPDATE_SCREENSHOTS=1`.                                                                                                                                                                                              |
| QA-011 | minor | A9          | `content/quiz/quiz.json:495` (`sm-mguk-limite`)                                                                                                                                                          | Correct option says "l'MGU-K può assorbire al massimo P_max"; under D8 P_max is the **electrical** cap and the MGU-K absorbs up to P_max/η mechanically. Contradicts theory 10 wording.                                                                                                                                                                                                                                                                                                               | quiz.json vs `10-kers-mguk.md:89`.                                                                                                                                  | "…può inviare alla batteria al massimo P_max (potenza elettrica)".                                                                                                                                                                                                                                   |
| QA-012 | minor | A2 / A7     | `content/theory/10-kers-mguk.md:97`; kers panel row "Tempo per recuperare tutta ΔE_k…"                                                                                                                   | `t = η·ΔE_k/P_max` is the time to **absorb** all ΔE_k at the cap (storing only η·ΔE_k); "recuperare tutta ΔE_k" suggests 100 % storage. The sim adds a clarifying line; theory does not.                                                                                                                                                                                                                                                                                                              | Theory 10 Formule; `a11/shots/full-kers-braking.png`.                                                                                                               | "Tempo per assorbire tutta ΔE_k alla potenza massima (in batteria η·ΔE_k)".                                                                                                                                                                                                                          |
| QA-013 | nit   | A5          | `src/sims/lenz/index.ts:501`                                                                                                                                                                             | `slideRefs [2,3,4,5,6,7,8,9,11]` is very broad (theory 04 is `[11]`; 9 chips in the header). Also kers-braking `[16–19]` vs theory 10 `[8,11,17,18,19]` vs PHYSICS "none (extension)". (Confirms the known item.)                                                                                                                                                                                                                                                                                     | Sim index screenshot `a11/shots/sim-dark.png`.                                                                                                                      | lenz `[4, 7, 8, 9, 11]` (magnet experiment, flux, F-N, i, Lenz); align kers-braking with theory 10.                                                                                                                                                                                                  |
| QA-014 | nit   | A2          | `content/theory/09,10,11,12,13,14`                                                                                                                                                                       | Length vs ≈250–450 words (body incl. Q&A, formulas excluded): 09 ≈ 560, 10 ≈ 830, 11 ≈ 660, 12 ≈ 690, 13 ≈ 970, 14 ≈ 700; 01/02/04/07/08 ≈ 480–495. D10 assessment: 11/12 (verbatim UN/Constitution text), 13 (the 5-minute script is itself the requirement, ≈ 640 words ≈ 5 min) and 14 (≥ 30 terms, 41 present) are **defensible**. 10 is defensible as the core section but the "Numeri del regolamento" list could move to a compact table; 09 could drop the 24 kW power line. No cut required. | `wc -w` script (body only).                                                                                                                                         | Optional trim of 10 (≈ 100 words) and 09.                                                                                                                                                                                                                                                            |
| QA-015 | nit   | A2          | `13-…md:18`; `06-…md:132`; `06-…md:100`                                                                                                                                                                  | "Le sei formule" but 8 formulas follow; "tra calore Joule … e energia" → "ed energia"; `63{,}2\%` without the space used elsewhere (`63,2 %`).                                                                                                                                                                                                                                                                                                                                                        | File lines.                                                                                                                                                         | Fix wording; `63{,}2\ \%`.                                                                                                                                                                                                                                                                           |
| QA-016 | nit   | A3–A8       | UI strings (sim summaries, readouts, plot legends)                                                                                                                                                       | ASCII pseudo-notation in Italian UI text: `Φ_B`, `P_max`, `t_f`, `R_w`, `τ_est`, `P_mecc`, `e^(−t/τ)`, `2,0·10^-10` (alternator balance error); slider min label "1 spire" (faraday, lenz); mixed `'` and `’` apostrophes; titles 10–12 use " - " instead of " – ".                                                                                                                                                                                                                                   | Screenshots `full-*.png`, `sim-dark.png`.                                                                                                                           | Use Unicode subscripts / KaTeX (`Φ_B` → `Φ_B` as `Φ<sub>B</sub>`), `10⁻¹⁰`, "1 spira", one apostrophe style.                                                                                                                                                                                         |
| QA-017 | nit   | A5, A6, A8  | scenes                                                                                                                                                                                                   | Minor visual: lenz "B indotto" label sits on the coil; alternator energy-flow arrow heads overlap the "Energia elettrica" box text; rl-energy "Generatore E" label crossed by the battery symbol and the "Energie nel tempo" plot shows empty 0–100 axes before the switch is closed; lenz y-axes show only two ticks. Nothing unreadable.                                                                                                                                                            | `a11/shots/s-lenz-light.png`, `full-alternator-motor.png`, `full-rl-energy.png`, `full-lenz.png`.                                                                   | Offset labels; hide the energy plot (or show a hint) until the transient starts.                                                                                                                                                                                                                     |
| QA-018 | nit   | A6          | `src/ui/formulaPanel.ts:126-129` / alternator render                                                                                                                                                     | Formula panel flushes on the next animation frame, readouts immediately; at ω ≈ 15 rad/s the two panels can show visibly different ε / i at the same instant (e.g. 7,96 V vs 3,25 V). Values agree when paused.                                                                                                                                                                                                                                                                                       | `a11/alt.mjs` output.                                                                                                                                               | Call `formulas.flush()` after `update()` inside `render()` (already inside rAF).                                                                                                                                                                                                                     |

Known items re-checked: ">500 kB three.js chunk warning" — **not reproduced**: `three.module` is 496.51 kB, Vite printed no warning in this build (still borderline; info only).

## 3. Physics audit (check 1)

All `src/physics` functions re-derived against SPEC §1 and `docs/PHYSICS.md`; all correct.

- `fluxUniform` Φ = BS cos α (s7); `emfFaraday` −NΔΦ/Δt, Δt ≤ 0 throws (s8); `emfMotional` Blv (s8);
  `inducedCurrent` R ≤ 0 throws (s9). `rotatingLoop`: Φ = BS cos ωt ⇒ −N dΦ/dt = NBSω sin ωt ✓ (s18–19).
- `lenzSign` = −sign(dΦ/dt) with the n̂/counter-clockwise convention of PHYSICS §2 — consistent with
  f.e.m. = −dΦ/dt. Lenz sim: n̂ = +x toward the magnet; N approaching ⇒ m_x < 0, Φ more negative,
  sign +1, induced field toward the magnet ⇒ coil face N ⇒ repulsion ✓ (opposite sign label to PHYSICS §2
  only because n̂ is chosen the other way; documented).
- `solenoidInductance` μN²S/l, `emfSelf` −L di/dt, `rlCurrent` I₀(1−e^{−Rt/L}) via `expm1`, R = 0 limit
  E·t/L ✓, `magneticEnergy` ½LI² ✓. `rl-energy` RK4 state [i, ∫Ei, ∫Ri²] with sub-steps ≤ τ/50 ✓.
- `transformerSecondary` V₁N₂/N₁, `transformerCurrent` I₁N₁/N₂ (V₁I₁ = V₂I₂) ✓; `lineLoss` I = P/V,
  RI², fraction ✓. joule-transformer chain: V_rec = V₂ − RI, V_out·I_out = P − RI² ✓.
- `lorentzForce` BIL sin θ ✓. alternator-motor: τ_em = 2·(w/2)·sin θ·N·B·s·L = NBSs·sin θ; generator
  s = −i ⇒ τ_em·ω = −ε·i (Lenz braking) ✓; motor with in-phase supply ⇒ τ ∝ sin²θ ≥ 0 ✓; energy
  integrals carried in the RK4 state (residual ≈ 2·10⁻¹⁰ on screen).
- Lenz dipole model: Φ = μ₀m a²/(2(z²+a²)^{3/2}) (exact by reciprocity), F = N i ∂Φ/∂z ✓.
- Faraday peak detection: max over step samples + bisection at Φ zero-crossings (where |ε| peaks) ✓;
  e2e gate B = 1,2 T, S = 0,05 m², N = 200, ω = 50 rad/s passes.
- KERS (D8): P_b(t) = m a v(t) linear; MGU-K mech. intake min(P_b, P_max/η); closed form of
  `recoverable` re-derived (t* = t_f(P₀−C)/(P₀−P₁)) ✓; recovered + dissipated = ΔE_k exactly;
  edge cases (v₁ < v₂, P_max = 0/∞, η = 0) behave as documented. Physically honest for a teaching
  model; the η = 0 limit (MGU-K absorbs without bound, stores nothing) is a mathematical limit — fine
  because it is documented. `stateAt` sub-event trick is exact for constant deceleration ✓.
- Hard targets: 62,5 mA, 2,469 MJ, ÷100, V₁I₁ = V₂I₂, 0,632·I₀, peak = NBSω — all asserted in tests.
- Slides 21–23 numbering (PHYSICS asks QA to verify against the deck): **cannot verify**, the deck is
  not in the repo; numbering follows SPEC §1.

## 4. Theory fact-check (check 2)

- All 14 files: six fixed headings in order ✓; 3–5 Q&A (01–12: 4, 13–14: 3) ✓; relative links resolve
  (e2e "relative links resolve to hash routes; no math errors") ✓; glossary 41 terms ✓.
- Slide formulas and worked numbers re-computed: 01 (Φ at 0/60/90°), 02, 03 (62,5 mA), 04 (5 mW),
  05 (1,57 mH, 0,31 V), 06 (3 A, 0,05 s, 1,9 A, 0,90 J), 07 (63 V / 44 V), 08 (500 A 1,25 MW vs
  50 A 12,5 kW), 09 (24 N, 24 N·m), 10 (2,47 MJ, 1,23→0,41 MW, 0,36 / 1,05 MJ, 2,07 / 1,30 MJ,
  18,5 s), 11 (0,56 kWh, 28 kWh), 12 (1,24 MW), 14 conversions — **all correct**.
- Real-world facts (web search spot-check, 2026-10-27):
  - MGU-K 120 kW, 2 MJ/lap MGU-K→ES, 4 MJ/lap ES→MGU-K (2014–2025): confirmed (FIA leaflet, Honda). ✓ sourced.
  - 2026 MGU-K 350 kW, MGU-H removed: confirmed (Honda, Mercedes, PlanetF1). ✓ sourced.
  - 2026 per-lap energy "7–9 MJ": secondary sources only (≈ 8,5 MJ) — correctly `[DA VERIFICARE]`.
  - 2026 min. mass 768 kg = 722 kg car + driver + 46 kg estimated tyres: confirmed (FIA release,
    Red Bull guide); "incl. driver" ✓.
  - Art. 32 text ✓ verbatim. L. cost. 1/2022: Art. 9 "Tutela l'ambiente, la biodiversità e gli
    ecosistemi, anche nell'interesse delle future generazioni" ✓; Art. 41 quotes ✓ (nuance: the "fini
    sociali e ambientali" clause applies to public **and** private economic activity — text's
    paraphrase "la legge la indirizza" is acceptable).
  - Targets 9.4/9.5 Italian text: search confirms content but could not retrieve the verbatim UNRIC
    text → remains `[DA VERIFICARE]` (correctly marked in file 11 and OPEN_FACTS #9).
- Every F1/real-world number in theory carries "Fonte:" or `[DA VERIFICARE]` ✓, except the PMSM
  topology wording (QA-007). Unsourced but harmless engineering claims: 03 "la macchina elettrica gira
  molto più veloce delle ruote" (true via gearing; nit).

## 5. Runs (check 3)

```
npm run lint            → clean
npm run format:check    → All matched files use Prettier code style!
npm run typecheck       → clean
npm test                → Test Files 33 passed (33) · Tests 438 passed (438)
npm run build           → ✓ built in 4.55s (three.module 496.51 kB, no >500 kB warning)
npx vitest run --coverage → src/physics 100 % stmts / 100 % branch / 100 % funcs / 100 % lines
PW_PORT=4420 … npm run e2e -- --workers=2 → 65 passed (2.6m)
```

Headless fps (SwiftShader software GL, 2 parallel workers — **informative only**):
alternator-motor 30.1, faraday 39.1 (scene 41.3), joule-transformer 47.2, kers-braking 41.6,
lenz 38.3, rl-energy 59.1 rAF/s. **Real ≥ 60 fps on the target RTX 3060 laptop is unmeasured.**
Leak specs (mount/unmount ×20): GPU object counts constant for every sim (e.g. alternator
geometries 5 → 5, kers 20 → 20); faraday heap after GC 5.56 → 7.02 MB, Δ(#10→#20) 0.16 MB (plateau).
Render-loop contract: all six sims use `createLoop` (no raw `requestAnimationFrame` in `src/sims`);
`src/core/loop.ts` caps at `maxFps = 60` and pauses on `document.hidden` (unit-tested in
`tests/core/loop.test.ts`).

Own screenshots (1280×720, dark + light, 46 PNGs): theory index + 14 theory pages, sim index + 6 sims,
quiz, plus full-page sims — in the scratchpad `a11/shots/` (not committed). Visual review of a
representative subset: no empty canvases, no unreadable contrast; horizontal scroll only on the quiz
(QA-002); clipping QA-004; overlaps QA-017.

Runtime network: Playwright request log over all 23 routes × 2 themes → **0 non-same-origin
requests**. Console: no errors (only SwiftShader "GPU stall due to ReadPixels" warnings).

## 6. Accessibility and Italian (check 4)

- axe-core WCAG 2.0/2.1 A+AA on **all 23 routes × 2 themes**: **0 violations** (any impact).
  Repo e2e axe specs: 12 shell + 14 sim pages pass.
- Keyboard: e2e covers skip link, sidebar, TOC, theme toggle, every sim's sliders/toggles and a
  keyboard-only quiz run — all pass. My manual pass on joule-transformer found QA-001 (Enter on the
  number field corrupts the value).
- Italian: no dot decimals in UI/prose (only target numbers "9.4/9.5", correct); units spaced
  (NBSP in `formatIT`); terminology f.e.m. / MGU-K consistent. Issues: QA-015, QA-016.

## 7. Cross-consistency (check 5)

| Sim               | Defaults / displayed                                          | Theory                | Match                                                       |
| ----------------- | ------------------------------------------------------------- | --------------------- | ----------------------------------------------------------- |
| kers-braking      | 2,47 MJ · 0,36 MJ · 2,07 + 0,04 MJ · 14,6 % · 18,5 s · 823 kW | 10: same (820 kW ≈)   | ✓                                                           |
| joule-transformer | 20 kV×10, 10 MW, 5 Ω → 50 A, 12,5 kW (0,125 %)                | 08: same              | ✓                                                           |
| rl-energy         | 12 V, 4 Ω, 0,2 H → 3 A, τ 0,05 s, 63,2 %                      | 06: same (U = 0,90 J) | ✓                                                           |
| faraday           | B 0,5 T, S 0,02 m², N 50                                      | 01 example S, B same  | ✓ (07's 50 Hz example not reachable: ω max 100 rad/s — nit) |
| lenz              | N approaching ⇒ face N, repulsive                             | 04                    | ✓                                                           |
| alternator-motor  | generator Lenz torque < 0, motor torque ≥ 0                   | 07/09/10              | ✓ (links QA-006)                                            |

Every sim's `theoryId` exists; every sim shows "Modello semplificato:" ✓. Quiz answers agree with
theory except QA-011. No copyrighted logos/images (only e2e screenshots; scenes are abstract
geometry) ✓. Personal data: grep for the student's name / class / school in tracked files → none
(the only occurrence is the repository owner's own git author name on the initial commit, which
predates this project; not added by agents).

## 8. Re-test checklist for round 2

QA-001 (round-trip test), QA-002 (no-hscroll on `#/interrogazione`), then spot-check QA-003–QA-012.
