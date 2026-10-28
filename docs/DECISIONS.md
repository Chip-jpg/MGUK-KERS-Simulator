# Decisions log

Architecture and process decisions. New entries are appended by the orchestrator
(agents propose them via change requests). Format: ID, date, decision, reason.

## D1 — Repository and app name (2026-10-27)

The project lives in the existing GitHub repository `Chip-jpg/MGUK-KERS-Simulator`.
Its **root plays the role of the `kers-lab/` folder** of the planned layout (there is
no nested `kers-lab/` directory). The app name stays **"KERS Lab"** (npm package
name `kers-lab`).

## D2 — Branching (2026-10-27)

Only the branch `claude/new-session-u560qi` is pushed to the remote. Per-task
`feat/<task-id>-<slug>` branches exist only locally (one git worktree per agent)
and are squash-merged by the orchestrator.

## D3 — Toolchain pins (2026-10-27)

Exact versions are pinned in `package.json` (no `^`), lockfile committed:

| Package                      | Version           | Note                                                                                                                                                                            |
| ---------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| vite                         | 5.4.21            | latest 5.x                                                                                                                                                                      |
| typescript                   | 5.9.3             | strict + `noUncheckedIndexedAccess`                                                                                                                                             |
| three / @types/three         | 0.169.0 / 0.169.0 | r169                                                                                                                                                                            |
| katex                        | 0.16.47           |                                                                                                                                                                                 |
| marked                       | 14.1.4            |                                                                                                                                                                                 |
| uplot                        | 1.6.32            |                                                                                                                                                                                 |
| vitest / @vitest/coverage-v8 | 2.1.9             | 2.x line is built on Vite 5 (same major as the app); Vitest 3 would also work but is not needed                                                                                 |
| @playwright/test             | 1.63.0            | matches the pre-installed Chromium build (`/opt/pw-browsers/chromium-1243`); set `PW_CHROMIUM_PATH` to use a specific executable, never run `playwright install` in the sandbox |
| eslint / typescript-eslint   | 9.39.5 / 8.72.1   | flat config, `eslint-config-prettier` 9                                                                                                                                         |
| prettier                     | 3.9.10            |                                                                                                                                                                                 |
| jsdom                        | 25.0.1            | dev only, per-file `// @vitest-environment jsdom`                                                                                                                               |

`npm audit` (2026-10-27) reports advisories in dev-only tooling of the Vite 5 /
Vitest 2 line (vite, esbuild dev server, vitest, tinypool). They do not ship in the
static production bundle; revisit when moving to Vite 6+ (stack change → needs
approval). The only runtime advisory is **katex 0.16.x, severity low**
(GHSA-238p-pmpm-9mq7: prototype pollution can bypass `trust` restrictions; fixed in
0.19, outside the pinned 0.16 line). Mitigation: KaTeX is only fed our own bundled
Markdown and the renderer must keep `trust: false` (the default).

## D4 — Simulator discovery via `import.meta.glob` (2026-10-27)

`src/core/registry.ts#loadSimModules` eagerly imports every `src/sims/*/index.ts`
and registers its default export. Sim agents therefore never edit a shared file to
add a simulator, which keeps file ownership disjoint. Lazy loading (code-splitting
Three.js per sim) can be introduced later by A3 without changing the `SimModule`
contract.

## D5 — Hash routing and in-page anchors (2026-10-27)

Routing is hash-based (`#/teoria`, `#/teoria/<id>`, `#/sim`, `#/sim/<id>`, default
`#/teoria`; since v0.5.0 any other hash, including the former `#/interrogazione`, is rewritten
to its canonical form) so GitHub Pages needs no rewrites. Consequence: in-page links must
**not** use `href="#something"` (that would change the route); use buttons +
`element.scrollIntoView()` / `focus()` instead (e.g. skip link, theory TOC).

## D6 — Type-level contract test for the physics API (2026-10-27)

`tests/physics/stubs.test.ts` uses `expectTypeOf(...).toEqualTypeOf<...>()`, so any
drift from the §4.2 signatures fails `npm run typecheck`. `Function.length` is not
used (TypeScript optional parameters still count towards it).

## D7 — Slide references not given by the spec (2026-10-27)

The §4.2 contract gives no slide number for `jouleLoss`, `lineLoss`,
`lorentzForce`, `kineticEnergyDelta`, `kersBrakingEvent`. The stubs use the closest
slide (16–17 energy balance, 20/22–23 transport) or state `@slide none` where the
deck has no matching slide (Lorentz force, kinetic energy). A1 confirms or corrects
these in `docs/PHYSICS.md`.

## D8 — KERS braking model (2026-10-27, orchestrator, from A1)

`kersBrakingEvent` assumes constant deceleration over `tBrake`. `Pmax` is the MGU-K
**electrical** cap, so the mechanical power the MGU-K absorbs is
`min(P_brake(t), Pmax/η)`. `recovered = η·recoverable` and
`dissipated = dEk − recovered` (disc-brake heat + MGU-K/converter losses; split via
`kersDissipationSplit`). `timeToRecoverAtPmax = η·dEk/Pmax`. For `v₁ < v₂` the
function returns the negative `dEk` and zeros elsewhere. Full model in
`docs/PHYSICS.md`.

## D9 — Lazy simulator loading and e2e config (2026-10-27, orchestrator, from A3)

- `loadSimModules()` is async; `loadSim(id)` and `availableSimIds()` load each
  `src/sims/<id>/index.ts` lazily so Three.js stays out of the initial bundle (extends D4).
- `playwright.config.ts` honours `PW_PORT` (parallel worktrees must not share port 4173) and sets `VITE_THEORY_FIXTURES=true` for the preview server (only used when
  `content/theory/` is empty).
- Accessibility gate: Lighthouse cannot run offline here; `@axe-core/playwright`
  (WCAG 2.0/2.1 A+AA, zero violations) is the accepted proxy.
- ~~Quiz extension point~~ — removed in v0.5.0 (D13).

## D10 — Theory length (2026-10-27, orchestrator)

Files 10–13 exceed the ≈450-word guideline (core KERS section with sourced
regulation list, verbatim UN/Constitution quotations, the oral script). Accepted
for now; A11 assesses whether any must be shortened.

## D11 — Tauri 2 Windows packaging (2026-10-28, P4.4)

- **Pins (exact):** crates `tauri =2.12.4`, `tauri-build =2.7.3`; npm
  `@tauri-apps/cli 2.12.3` (all ≥ 2 weeks old at pin time; 3.0 is still alpha).
  `src-tauri/Cargo.lock` is committed. Rust edition 2021, MSRV 1.90.
- **Shell:** no custom commands, no external plugins; one inline `on_navigation` hook keeps
  the window on the app origin (external source links are blocked, not opened). Capability
  `default` grants only `core:default`.
- **Bundles:** `nsis` (per-user, no admin) + `msi`, Windows x64 only, built by
  `.github/workflows/desktop.yml` on `v*` tags / manual dispatch; a separate job with
  `contents: write` attaches them to the tag's Release (`softprops/action-gh-release@v2`).
  Binaries are unsigned (SmartScreen warning) and there is no auto-update.
- **WebView2:** `embedBootstrapper` (≈ +1.8 MB). WebView2 ships with Windows 11 / updated
  Windows 10; `offlineInstaller` (≈ +127 MB) is the documented switch for offline PCs.
- **CSP:** `default-src 'self'`; `script-src 'self'` (plus the hash of the inline theme
  script, added by Tauri at build time); `style-src 'self' 'unsafe-inline'` (KaTeX/uPlot
  inline styles; Tauri's style-src rewriting is disabled so `'unsafe-inline'` stays
  effective); `img-src 'self' data: blob:`; `font-src 'self' data:`; `worker-src 'self'`;
  `connect-src 'self' ipc: http://ipc.localhost` ('self' for Vite's modulepreload polyfill); `object-src 'none'`; `base-uri 'self'`;
  `form-action 'none'`. Derived by grepping `dist/` (no `eval`, no `blob:` worker, no remote
  network fetch). Details in `docs/DESKTOP.md`.

## D12 — Chunk-size warning limit and focusable overflowing formulas (2026-10-28, F6)

- `build.chunkSizeWarningLimit = 600` (kB) in `vite.config.ts` (QA-028). The only chunk above
  Vite's 500 kB default is `three.module` (≈ 511 kB minified, ≈ 130 kB gzip), loaded lazily
  with the 3D simulators (D4/D9) and not referenced by `dist/index.html`. Any new chunk above
  600 kB still warns; revisit (e.g. `manualChunks`) if three.js grows past it.
- Display formulas (`.math-display`, `overflow-x: auto`) that are wider than the column get
  `tabindex="0"`, `role="group"` and an `aria-label` at runtime, and lose them when they fit
  again (`src/theory/scrollable.ts`, ResizeObserver; QA-020). This satisfies WCAG 2.1.1 /
  axe `scrollable-region-focusable` without adding a tab stop to every formula. Authors
  should still split formulas that overflow at 1280×720; `e2e/a11y.spec.ts` checks every
  theory section in both themes (QA-021).

## D13 — Slim scope (v0.5.0) (2026-10-28, orchestrator, owner's decision)

The app is reduced to what supports the owner’s own presentation of the topic.

1. **No Interrogazione mode.** The quiz, flashcards and spaced repetition (`#/interrogazione`,
   `src/quiz/`, `content/quiz/`) are removed, together with the `## Domande da interrogazione`
   section of every theory file. Theory 13 becomes a plain one-page summary of the logical
   chain (`13-filo-logico`), with no first-person oral script and no Q&A. _Reason:_ the owner
   presents the topic personally; the app explains and lets the reader explore, it does not
   interrogate.
2. **No slide references in the UI.** Slide chips on theory pages, sim headers and formula
   panels, the `slideRefs` frontmatter key and every "(slide N)" mention in theory text and
   sim strings are removed. Slide numbers remain only in developer documentation
   (`docs/PHYSICS.md`) and in the `@slide` TSDoc tags of `src/physics` (D7 still applies
   there). _Reason:_ the numbers are only meaningful to someone holding the teacher’s deck;
   for any other reader they are noise.
3. **Only one Phase 4 module kept.** `car-dynamics` (theory renamed `15-dinamica-frenata`)
   stays; `field-biot-savart` and `pmsm-dq` are removed entirely (simulators, physics
   modules `biotSavart.ts` / `pmsm.ts` and their tests, theory 15 and 16, `PHYSICS.md` §7–§8,
   README rows, e2e specs). _Reason:_ the content is limited to the thread
   Faraday → alternatore → MGU-K in frenata → energia e Joule → Goal 9 → Art. 32; finite-coil
   fields and d-q control of a PMSM are outside it, while car dynamics directly extends the
   KERS braking model of `kers-braking` (theory 10) with aderenza, aerodinamica and the
   rear-axle limit of the MGU-K.

Result: 15 theory sections (five fixed headings each, §4.4), 7 simulators, two sidebar
areas (Teoria, Simulatori). Unknown routes, including the former `#/interrogazione`, fall
back to `#/teoria`.
