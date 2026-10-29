# KERS Lab — Architecture

> **KERS Lab** — *"Dall'induzione di Faraday all'MGU-K"*. One static web app, two
> areas behind one sidebar: **Teoria** (Italian theory pages rendered from Markdown +
> KaTeX) and **Simulatori** (interactive 3D scenes + live plots). The former
> **Interrogazione** area (quiz / oral-exam trainer) was removed in v0.5.0
> ([D13](./DECISIONS.md)).
>
> This document freezes the shared contracts (§4.1–§4.5, frozen by task A0). Agents
> may **not** change them; they file a change request with the orchestrator, who
> records any accepted change in [`DECISIONS.md`](./DECISIONS.md).

## 1. Layers

```
            ┌────────────────────────────────────────────────────────────┐
  browser → │ index.html → src/main.ts → src/core/app.ts (shell)         │
            │   ├─ core/router.ts   hash routes → page                   │
            │   ├─ core/registry.ts SimModule registry (auto-discovery)  │
            │   ├─ core/theme.ts    data-theme on <html>                 │
            │   ├─ core/i18n/it.ts  every UI string (Italian)            │
            │   └─ core/format.ts   formatIT (decimal comma)             │
            ├────────────────────────────────────────────────────────────┤
            │ ui/      components: Slider, Plot (uPlot), FormulaPanel …  │
            │ theory/  Markdown loader + renderer (marked + KaTeX)       │
            │ sims/<id>/  one folder per simulator (Three.js + ui/)      │
            ├────────────────────────────────────────────────────────────┤
            │ physics/  PURE TypeScript, SI units, no DOM/Three/clock    │
            └────────────────────────────────────────────────────────────┘
```

Dependency rule (arrows point to allowed imports):

- `physics` → nothing (only its own files). **Enforced by ESLint**: in
  `src/physics/**` the imports `three`, `uplot`, `katex`, `marked` and any path into
  `core/ ui/ sims/ theory/` are errors, and so are the globals `window`,
  `document`, `navigator`, `localStorage`, `sessionStorage`, `Date`, `performance`,
  `requestAnimationFrame`, `cancelAnimationFrame`, `setTimeout`, `setInterval`,
  `process`.
- `core` → `physics` (only `PHYSICS_DT`), browser APIs.
- `ui`, `theory` → `core`, `physics`.
- `sims/<id>` → `core`, `ui`, `physics`, `three`, `uplot`. A sim never imports
  another sim.

Runtime is **offline-first**: no network requests at runtime, fonts bundled.

## 2. Folder layout (§3, exact)

The repository root **is** the `kers-lab/` folder (see DECISIONS D1).

```
kers-lab/
  README.md  LICENSE  CHANGELOG.md  CONTRIBUTING.md
  docs/            # ARCHITECTURE.md, PHYSICS.md (formula ↔ slide map), DECISIONS.md
  content/theory/  # NN-slug.md  (Italian)
  src/
    core/          # app shell, router, i18n (it.ts), theme, module registry
    physics/       # PURE TS, no DOM/Three imports, SI units
    ui/            # components, plots wrapper, sliders
    sims/<id>/     # one folder per simulator: index.ts, scene.ts, panel.ts
    theory/        # markdown loader/renderer
  tests/ e2e/
  .github/workflows/
```

Additionally: root configs (`package.json`, `tsconfig.json`,
`vite.config.ts`, `playwright.config.ts`, `eslint.config.js`, `.prettierrc`,
`.editorconfig`), `index.html`, `src/main.ts`.

### Scaffold contents (A0)

| Path | Purpose |
|---|---|
| `src/core/types.ts` | `SimModule`, `AppContext`, `Disposable` (verbatim §4.3), `ParamSpec`, `ParamsSchema<T>`, `Theme` |
| `src/core/registry.ts` | `SIM_IDS`, `SimId`, `createRegistry()`, `registry`, `loadSimModules()` |
| `src/core/router.ts` | `Route`, `parseRoute`, `formatRoute`, `createRouter` |
| `src/core/format.ts` | `formatIT(n, digits = 2, unit?)` via `Intl.NumberFormat('it-IT')`, NBSP before unit, `—` for non-finite |
| `src/core/theme.ts` | `initTheme`, `toggleTheme`, `applyTheme`, `getTheme`, `prefersReducedMotion` |
| `src/core/loop.ts` | `createLoop` — render-loop contract (§4 below) |
| `src/core/i18n/it.ts` | `it` / `t` typed string table, all UI text |
| `src/core/app.ts` | minimal shell: nav, theme toggle, route → page, mount/dispose sims |
| `src/physics/index.ts` | §4.2 stubs throwing `NotImplementedError`, `rk4Step`, `PHYSICS_DT` |
| `src/physics/errors.ts` | `NotImplementedError` |

## 3. File ownership per task

Each agent works in its own worktree on `feat/<task-id>-<slug>`, owns only these
paths and never edits a file it does not own. If a contract is insufficient it stops
and returns a change request.

| Task | Owner of | Notes |
|---|---|---|
| **A0** Architect / scaffold | root config, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` (initial), `src/core/` skeleton, `.github/` stubs, stub `src/physics/index.ts`, `src/main.ts`, `index.html` | done when lint/typecheck/test/build pass on the empty shell |
| **A1** Physics core | `src/physics/**`, `tests/physics/**`, `docs/PHYSICS.md` | implements §4.2 exactly, RK4, constants (μ₀ …); coverage ≥ 95 % on `src/physics` |
| **A2** Theory writer | `content/theory/**`, `docs/OPEN_FACTS.md` | 15 files since v0.5.0, §4.4 format |
| **A3** UI shell & design system | `src/core/**` (extends A0), `src/ui/**`, `src/theory/**`, global CSS | sidebar, theory renderer, sim layout, tokens §4.5, `Slider`, `Plot`, `FormulaPanel` |
| **A4** Sim `faraday` | `src/sims/faraday/**` | |
| **A5** Sim `lenz` | `src/sims/lenz/**` | |
| **A6** Sim `alternator-motor` | `src/sims/alternator-motor/**` | |
| **A7** Sim `kers-braking` | `src/sims/kers-braking/**` | |
| **A8** Sims `joule-transformer`, `rl-energy` | `src/sims/joule-transformer/**`, `src/sims/rl-energy/**` | |
| ~~**A9** Quiz / Interrogazione~~ | ~~`content/quiz/**`, `src/quiz/**`~~ | removed in v0.5.0 (D13) |
| **P4** Sim `car-dynamics` | `src/sims/car-dynamics/**`, `src/physics/vehicle-dynamics.ts` | Phase 4; the other two Phase 4 sims (`field-biot-savart`, `pmsm-dq`) were removed in v0.5.0 (D13) |
| **A10** DevOps & repo hygiene | `.github/**`, `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `LICENSE` | extends `ci.yml`, Pages deploy |
| **A11** Independent QA | `docs/QA_REPORT.md`, issues list (read-only on source) | must not be an agent that built the code |

Tests for a sim live next to it or under `tests/sims/<id>/**` (owned by that sim's
agent); e2e specs under `e2e/<area>.spec.ts` (owned by the area's agent; A10 owns
the CI wiring).

Dependency graph: **A0 → (A1 ∥ A2 ∥ A3 ∥ A10) → (A4 ∥ A5 ∥ A6 ∥ A7 ∥ A8 ∥ A9) → A11
→ fix loop → release v0.1.0 → Phase 4.**

v0.5.0 "slim" refactor (D13): **R1** owned all app code (`src/**`, `tests/**`, `e2e/**`,
configs), **R2** owned `content/theory/**`, `docs/**`, `README.md`, `CHANGELOG.md`,
`CONTRIBUTING.md`; the two worked in parallel against a frozen list of theory ids and
`SIM_IDS`.

## 4. Shared contracts (verbatim, frozen)

**4.1 Physics conventions:** SI units everywhere internally (T, m, m², rad/s, V, A, Ω, H, J, W, kg, m/s). Degrees only at the UI boundary. Pure functions, no global state, no `Date.now()`. Every exported function has a TSDoc comment with formula, units, and `@slide N` reference. Time integration for anything dynamic: fixed-step **RK4**, dt = 1/240 s with an accumulator in the render loop (render at display rate, physics deterministic).

**4.2 Physics API (A1 implements; sims consume):**
```ts
// flux & induction
fluxUniform(B:number, S:number, alphaRad:number): number            // Φ = B S cosα            @slide 7
emfFaraday(dPhi:number, dt:number, N?:number): number               // −N ΔΦ/Δt                @slide 8
emfMotional(B:number, l:number, v:number): number                   // B l v                   @slide 8
rotatingLoop(B:number,S:number,N:number,omega:number,t:number):
  { phi:number; emf:number; V0:number }                             // Φ=BS cos ωt, emf=NBSω sin ωt  @slide 18-19
inducedCurrent(emf:number, R:number): number                        // @slide 9
// Lenz
lenzSign(dPhiDt:number): -1|0|1                                     // induced field opposes ΔΦ  @slide 11
// inductance / RL / energy
solenoidInductance(N:number,S:number,l:number,mu?:number): number   // μ0 N² S / l              @slide 14
emfSelf(L:number, dIdt:number): number                              // −L di/dt                 @slide 13
rlCurrent(emfDC:number,R:number,L:number,t:number): number          // I0(1−e^{−Rt/L})          @slide 15
magneticEnergy(L:number,I:number): number                           // ½ L I²                   @slide 17
// transformer & losses
transformerSecondary(V1:number,N1:number,N2:number): number         // @slide 20
transformerCurrent(I1:number,N1:number,N2:number): number           // ideal: P conserved
jouleLoss(R:number,I:number): number                                // R I²
lineLoss(P:number,V:number,Rline:number): { I:number; loss:number; fraction:number } // I=P/V
// machine & vehicle
lorentzForce(B:number,I:number,L:number,theta?:number): number      // B I L sinθ (inverse principle)
kineticEnergyDelta(m:number,v1:number,v2:number): number            // ½ m (v1² − v2²)
kersBrakingEvent(p:{ m:number; v1:number; v2:number; Pmax:number; eta:number; tBrake:number }):
  { dEk:number; recoverable:number; recovered:number; dissipated:number; timeToRecoverAtPmax:number; powerTrace:Array<{t:number; pKers:number; pBrakes:number}> }
```
Numeric sanity targets the tests must assert: slide-10 example ⇒ I = 62.5 mA (±0.1 mA); m = 800 kg, 300→100 km/h ⇒ ΔE_k ≈ 2.47 MJ; 10× transmission voltage ⇒ line loss ÷100 at equal P and R; ideal transformer conserves V₁I₁ = V₂I₂; `rlCurrent(t=τ)` = 0.632·I₀ (±1e-3); rotatingLoop peak emf = N·B·S·ω.

Slide-10 worked example (the 62.5 mA target): S = 5.0·10⁻² m², Δt = 0.46 s, B: 1.2·10⁻³ → 3.5·10⁻³ T, R = 4 mΩ ⇒ **I = 62.5 mA**.

Additions by A0 (not part of the frozen list, same rules apply):
`PHYSICS_DT = 1/240`, `rk4Step(f, t, y, dt): number[]` with
`f: (t: number, y: readonly number[]) => number[]` (vector state, must not mutate
`y`), `NotImplementedError`, and the type aliases `KersBrakingParams`,
`KersBrakingResult`, `OdeRhs`. The exact signatures are guarded at type level by
`tests/physics/stubs.test.ts`.

**4.3 Simulator module interface (A3 defines, A4–A9 implement):**
```ts
export interface SimModule {
  id: string; titleIT: string; summaryIT: string;
  theoryId: string;                            // links to content/theory/<theoryId>.md
  mount(host: HTMLElement, ctx: AppContext): Disposable;   // must be idempotent & leak-free
}
export interface AppContext { theme: 'dark'|'light'; reducedMotion: boolean; formatIT(n:number, digits?:number, unit?:string): string; }
export interface Disposable { dispose(): void }   // stops RAF, removes listeners, disposes Three/uPlot resources
```
Each sim exposes parameters through one typed `params` object with `{min,max,step,default,unit,labelIT}` per field so UI and tests can read them.

v0.5.0 (D13): `slideRefs` was removed from `SimModule` — slide numbers are not shown in
the UI any more; they live only in `docs/PHYSICS.md` and the `@slide` TSDoc tags.

In code (`src/core/types.ts`):

```ts
export interface ParamSpec { min: number; max: number; step: number; default: number; unit: string; labelIT: string }
export type ParamsSchema<T> = Record<keyof T, ParamSpec>;
```

**4.4 Theory file format** (frontmatter + Markdown): `id, titleIT, goal(optional), order, level("base"|"approfondimento")`; `id` equals the file stem. Math with `$…$` / `$$…$$`. Fixed sections in this order, using these exact Italian headings: `## In breve`, `## Formule`, `## Spiegazione`, `## Esempio numerico`, `## Collegamento con KERS / MGU-K`.

v0.5.0 (D13): the `slideRefs` frontmatter key and the sixth section `## Domande da
interrogazione` were removed; the text does not cite slide numbers. Files where a heading
does not naturally apply (11–14) keep it with short, honest content.

Example skeleton:

```markdown
---
id: 03-faraday-neumann
titleIT: Legge di Faraday-Neumann
order: 3
level: base
---

## In breve
## Formule
## Spiegazione
## Esempio numerico
## Collegamento con KERS / MGU-K
```

The five headings are also available in code as `t.theory.headings`
(`src/core/i18n/it.ts`).

**4.5 Design tokens (A3):** CSS custom properties for colour, spacing, type scale, radius, with dark/light sets; one accent colour; physical quantities have fixed colours across all sims (B = blue, E/emf = amber, current = red, force = green, energy = purple); every colour pair ≥ WCAG AA contrast.

The active theme is the `data-theme="dark|light"` attribute on `<html>` (set by
`src/core/theme.ts`; default = system preference, toggle persisted in
`localStorage` key `kers-lab.theme`). Token sets must key off that attribute.

## 5. Render-loop contract (`src/core/loop.ts`)

Every animated simulator drives time with **one** `createLoop` per mount:

```ts
const loop = createLoop({
  step(dt) { /* advance physics state by exactly dt = 1/240 s (RK4 if dynamic) */ },
  render(alpha) { /* draw; alpha ∈ [0,1) = leftover accumulator fraction */ },
});
// Disposable.dispose() of the sim must call loop.dispose().
```

Guarantees:

1. **Fixed physics step** `dt = PHYSICS_DT = 1/240 s`, accumulated from real elapsed
   time; physics is deterministic and independent of the display rate.
2. **Render capped at 60 fps** (`maxFps`, default 60) — on 120/144 Hz displays frames
   are skipped so the average is ≈ 60 fps (thermal budget, §1).
3. **Spiral-of-death guard:** at most `maxFrameTime` (0.25 s) of simulated time per
   frame.
4. **Auto-pause** while `document.hidden`; on return no catch-up burst (the clock is
   re-anchored). A user `pause()` survives visibility changes; `resume()` undoes it;
   `stepOnce()` advances exactly one step and renders (for the "Step" button).
5. **`dispose()`** cancels the pending `requestAnimationFrame` and removes the
   `visibilitychange` listener; idempotent.

The browser services are injectable (`options.env: LoopEnv`) so tests run the loop
with a fake clock (see `tests/core/loop.test.ts`).

## 6. How simulators register

1. Create `src/sims/<id>/index.ts` where `<id>` is one of `SIM_IDS`
   (`faraday`, `lenz`, `alternator-motor`, `kers-braking`, `joule-transformer`,
   `rl-energy`, `car-dynamics`).
2. `export default` a `SimModule` whose `id` equals the folder name:

   ```ts
   import type { SimModule } from '../../core/types';
   const sim: SimModule = {
     id: 'faraday',
     titleIT: 'Flusso e legge di Faraday-Neumann',
     summaryIT: '…',
     theoryId: '03-faraday-neumann',
     mount(host, ctx) { /* build scene, createLoop, … */ return { dispose() { /* … */ } }; },
   };
   export default sim;
   ```
3. Export the typed parameter schema from the same folder:
   `export const params: ParamsSchema<FaradayParams> = { … }`.
4. Nothing else: the registry discovers every `src/sims/*/index.ts` via a **lazy**
   `import.meta.glob` (A3, as foreseen by DECISIONS D4): each sim is its own chunk
   (with its Three.js / uPlot), loaded by `loadSim(id)` when the user opens it or
   the Simulatori index. `availableSimIds()` lists the folders without loading them;
   `loadSimModules()` (now `async`) loads all. The registry rejects unknown or
   duplicate ids and lists modules in `SIM_IDS` order. No shared file needs
   editing.

`mount` must be idempotent and leak-free: `dispose()` stops the loop, removes every
listener, disposes all Three.js geometries/materials/textures/renderers and uPlot
instances, and empties `host`.

## 7. Routing

Hash-based (DECISIONS D5): `#/teoria` (default), `#/teoria/<theoryId>`, `#/sim`,
`#/sim/<simId>`. Ids match `/^[a-z0-9][a-z0-9-]*$/`; anything
else (including the former `#/interrogazione`, removed in v0.5.0) falls back to
`#/teoria`. Build links with `formatRoute(route)`; never use
`href="#anchor"` for in-page navigation.

## 8. Conventions

- Code, identifiers, commits: English. Every user-facing string: Italian, from
  `src/core/i18n/it.ts` (theory text from `content/theory/*.md`).
- Numbers in the UI: always `formatIT` (decimal comma, NBSP before the unit).
- Conventional Commits (`feat(sim/faraday): …`, `docs(theory): …`, `test(physics): …`).
- Gate before every merge: `npm run lint && npm run typecheck && npm test && npm run build`.
- UI tests needing a DOM start with `// @vitest-environment jsdom`.
- E2E: `npm run e2e` (Playwright, Chromium). Set `PW_CHROMIUM_PATH` to a local
  Chromium executable when browsers cannot be downloaded.
- Stack is pinned (DECISIONS D3); substitutions require approval.
- E2E: `PW_PORT` (default 4173) changes the preview port when several checkouts
  run Playwright at the same time. Specs: `e2e/shell.spec.ts` (navigation +
  keyboard), `e2e/a11y.spec.ts` (axe-core, WCAG 2.1 A/AA, zero serious/critical),
  `e2e/screenshots.spec.ts` (writes `e2e/screenshots/*.png`).

## 9. UI kit (A3)

Simulators import everything from the barrel **`src/ui/index.ts`**
(`import { createSimLayout, createSlider, … } from '../../ui';`). The app shell
never imports the barrel, so uPlot stays out of the initial bundle. Every
component returns a handle with `dispose()`; call them all from the sim's own
`dispose()`. All visible text comes from `src/core/i18n/it.ts` or the caller
(`…IT` parameters are Italian).

### 9.1 Page layout

The shell renders the page header from the `SimModule` metadata (h1 `titleIT`,
`summaryIT`, "Vai alla teoria" → `#/teoria/<theoryId>`) and hands
`mount()` an empty `host`. Inside `mount`:

```ts
createSimLayout(host: HTMLElement, o?: { modelNoteIT?: string }): SimLayout
// SimLayout: { root, toolbar, scene, sceneOverlay, controls, formulas, plots, note,
//              setModelNote(textIT), setFormulasOverlay(show), dispose() }
```

| Region | Use |
|---|---|
| `scene` | left column, `position: relative`, fills the height; append the Three.js canvas (CSS forces 100 % × 100 %). Size the renderer from `scene.clientWidth/clientHeight` + a `ResizeObserver`. |
| `sceneOverlay` | absolutely positioned layer over the scene for HTML labels (`pointer-events: none`, `aria-hidden`). |
| `toolbar` | above the scene; already contains the **"Mostra formule"** toggle (moves `formulas` over the scene, `aria-pressed`). |
| `controls` | right column, inside the "Parametri" panel: sliders, toggles. |
| `formulas` | right column, below the controls: put the `FormulaPanel` here. |
| `plots` | full width under scene + side; auto-hidden while empty; responsive grid. |
| `note` | "**Modello semplificato:** …" (§9 honesty rule) — pass `modelNoteIT`. |

Below 1100 px width the side column stacks under the scene.

### 9.2 Components

```ts
createSimToolbar(layout.toolbar, {
  loop?: Pick<Loop,'pause'|'resume'|'stepOnce'|'isPaused'>,  // from createLoop
  onReset: () => void, onPauseChange?: (paused) => void, onStep?: () => void,
}): { element, refresh(), dispose() }        // Reimposta · Pausa/Riprendi · Passo

createSlider({ spec: ParamSpec, value?, digits?, onInput?(v), id?, hintIT? }):
  { element, value, set(v, emit = false), reset(), setDisabled(b), dispose() }
// range input (arrows, PgUp/PgDn, Home/End) + numeric field ("0,5" or "0.5",
// Enter/blur commits, ↑/↓ steps, Shift×10, Esc reverts); label = spec.labelIT,
// unit always shown, aria-valuetext via formatIT, values clamped + snapped to step.

createToggle({ labelIT, checked?, onChange?(b) }): { element, checked, set(b, emit?), dispose() }
createSegmented({ labelIT, options: [{ value, labelIT }], value, onChange?(v) }):
  { element, value, set(v, emit?), dispose() }     // radio group, e.g. Generatore / Motore
createButton({ labelIT, onClick, variant?: 'primary'|'secondary'|'ghost', icon?, ariaLabel?, title? })

createFormulaPanel(layout.formulas, items: FormulaItem[], o?: { titleIT? }):
  { element, update(values: Record<string, number>), flush(), dispose() }
// FormulaItem: { key, tex, labelIT?, unit?, digits? (2), scale? (×, e.g. 1000 A→mA),
//                quantity?: 'b'|'emf'|'i'|'f'|'energy', symbolTex? }
// KaTeX is rendered once; update() may be called every physics step — the DOM is
// written at most once per animation frame, numbers via formatIT.

createPlot(layout.plots, {
  titleIT, series: [{ labelIT, unit?, quantity?, digits?, dash?, width?, fill? }],
  xLabelIT?, xUnit?, yLabelIT?, capacity? (600), height? (220), xWindow?, yRange?, theme?,
}): { element, chart, push(x, ...ys), setData(xs, ...ys), clear(), dispose() }
// uPlot wrapper: ring buffer (RingBuffer), redraw ≤ 1 per frame, ResizeObserver,
// axis + legend numbers via formatIT, quantity colours, follows the theme toggle.

renderTex(tex, displayMode?): { html, error? }         // KaTeX, trust:false, throwOnError:false
el(tag, { class, text, attrs, dataset }, children)     // tiny DOM helper; listen(), uniqueId()
```

Also re-exported: `formatIT`, `createLoop`/`Loop`, `onThemeChange(cb) → off`,
`currentTheme()`.

### 9.3 Colours and theme

Tokens live in `src/styles/tokens.css` (`--color-*`, `--space-*`, `--fs-*`,
`--radius-*`, dark + light sets keyed on `html[data-theme]`). One accent colour
(teal, `--color-accent`). Physical quantities have fixed colours in every sim:

| Quantity | CSS | TS |
|---|---|---|
| B (campo magnetico) | `--q-b` (blue) | `quantityColor('b', theme)` |
| E / f.e.m. | `--q-emf` (amber) | `'emf'` |
| current i | `--q-i` (red) | `'i'` |
| force F | `--q-f` (green) | `'f'` |
| energy | `--q-energy` (purple) | `'energy'` |

`src/ui/colors.ts` exports the same values resolved to hex for both themes
(`PALETTES`, `getPalette(theme)`, `quantityColor()`, `quantityColorHex()` for
`new THREE.Color(n)`). `tests/ui/colors.test.ts` fails if CSS and TS drift, and
checks WCAG AA: every text colour (incl. quantity colours) ≥ 4.5:1 on `bg`,
`surface`, `surface-2`; control outlines and accent ≥ 3:1. CSS helpers:
`.q-b … .q-energy` (sets `--q`) and `.text-q-*`.

`ctx.theme` and `ctx.reducedMotion` are **live getters**. To recolour Three.js
materials on toggle, subscribe with `onThemeChange(theme => …)` and unsubscribe
in `dispose()`. With `ctx.reducedMotion` a sim should start paused (or animate
without camera motion).

### 9.4 Theory renderer (`src/theory/`)

- `content.ts`: `content/theory/*.md` bundled with `import.meta.glob(…, { query:
  '?raw', eager: true })`; `getTheory() → { docs, errors }` (0 files → empty, invalid
  files skipped and reported), `findTheoryDoc`, `neighbours` (prev/next by `order`).
  When `content/theory/` is empty and the build sets `VITE_THEORY_FIXTURES=true`
  (Playwright webServer only), `tests/fixtures/theory/*.md` are used.
- `frontmatter.ts`: YAML subset (strings, quoted strings, ints, `[1, 2]`, `[]`,
  block lists).
- `markdown.ts`: `renderMarkdown(md) → { html, toc, mathErrors }` — marked 14 +
  `$…$` / `$$…$$` KaTeX extension (errors shown inline as `.math-error`), heading
  ids (accent-free slugs), TOC from `##`, `NN-slug.md` → `#/teoria/NN-slug`, raw
  HTML escaped, images dropped, unsafe URLs removed, external links open in a new
  tab. `tests/theory/content.test.ts` renders every real theory file and requires
  zero KaTeX errors and the five §4.4 headings in order.
- `page.ts`: index page and section page (TOC buttons + `scrollIntoView`, D5).

### 9.5 Former Interrogazione extension point

Until v0.4.1 the shell lazy-loaded an optional quiz module (`src/quiz/`) on
`#/interrogazione`. The quiz, its route and the extension point were removed in v0.5.0
(D13); the sidebar has only **Teoria** and **Simulatori**.

## 10. Render foundation (`src/render/`, D14)

Shared Three.js layer for every 3D simulator (v0.6). Sims import from the barrel
**`src/render/index.ts`** (`import { createStage, createFieldLines, … } from '../../render';`).
The app shell imports only `src/render/quality.ts` (no Three.js in the initial bundle).
Dependency rule: `render` → `core`, `ui` (colors, controls), `physics`, `three`; sims → `render`.
Pure parts stay testable in Node: `quality.ts` (no Three), `trace.ts` (no Three/DOM),
`scale.ts` (1-2-5 ranges), `src/physics/fields.ts`, `src/physics/thermal.ts` and
`src/physics/powerline.ts` (pure physics, coverage ≥ 95 %). The barrel also re-exports the
studio helpers `radialFade` and `studioBackgroundColor`; sims never import `render/*` or
`physics/*` files by path (D15).
Reference implementations: `src/sims/faraday/scene.ts`, `src/sims/joule-transformer/scene.ts`
(a large diorama with instanced lattice towers) and `src/sims/rl-energy/scene.ts`.

### 10.1 Quality tiers (`quality.ts`)

`type QualityTier = 'alta' | 'bilanciata' | 'base'`. Active tier = `?quality=` URL override →
user choice (sidebar "Qualità grafica", `localStorage['kers-lab.quality']`) → auto-detection
(`classifyQuality`): software renderer (SwiftShader / llvmpipe / Microsoft Basic Render) or no
WebGL2 → `base`; Tauri desktop or discrete GPU → `alta`; integrated / unknown GPU → `bilanciata`.
API: `getQuality()`, `setQuality(t)` (persists, notifies), `onQualityChange(cb) → off`,
`tierSettings(t)` / `TIER_SETTINGS`, `detectQuality()`, `urlQuality()`, `qualitySource()`.

| | alta | bilanciata | base |
|---|---|---|---|
| post-processing | EffectComposer: Render → UnrealBloom → Output | Render → Bloom (lighter) → SMAA → Output | none (direct render) |
| anti-aliasing | MSAA ×4 composer target | SMAA | context `antialias` |
| shadows | PCFSoft 2048 | PCFSoft 1024 | none |
| IBL | RoomEnvironment → PMREM | yes | no (hemisphere light) |
| materials | PBR (clearcoat, normal maps) | PBR | Lambert |
| pixel-ratio cap | 2 | 1,5 | 1,25 |
| `lineDensity` / `particleDensity` / `tessellation` | 1 / 1 / 1 | 0,7 / 0,6 / 0,6 | 0,45 / 0,35 / 0,4 |
| fat lines (`LineSegments2`) | yes | yes | no (1-px GL lines) |

Tone mapping is ACES Filmic in every tier (`OutputPass` applies it after bloom). In the light
theme the bloom threshold is raised above 1, so only HDR emissives bloom, never the white
backdrop.

### 10.2 Stage (`stage.ts`)

```ts
const stage = createStage(layout.scene, ctx, {
  ariaLabel: 'Scena 3D: …',                                   // canvas role="img"
  camera: { position: [x, y, z], target: [x, y, z], fov?: 36 },
  controls?: { minDistance, maxDistance, maxPolarAngle, enablePan },
  floorY?: -2, shadowRadius?: 6, tier?: QualityTier /* force */, intro?: true,
  floor?: { visible?: boolean; radius?: 16 },  // hide the studio disc, or widen it (grid pitch kept)
});
stage.scene · camera · renderer · controls (damped OrbitControls) · canvas · materials (kit)
stage.tier · settings · theme · width · height
stage.onResize(cb) · onTierChange(cb) · onThemeChange(cb)       // each returns off()
stage.addUpdatable({ update(dt) })   // per-frame animation hook (dt = 0 while paused)
stage.castShadows(root) · stage.occluders.push(mesh) · stage.track(disposable)
stage.setView(pos, target, animate?) // new home view, eased unless reduced motion
stage.resetView() · stage.setTier(t) · stage.setTheme(t)
stage.render()                       // call from the sim's loop render()
stage.info()                         // tier, passes, shadows, ibl, renderer.info (debug hooks)
stage.dispose()                      // releases everything (§10.6), idempotent
```

The stage follows the global theme and quality by itself (it subscribes to `onThemeChange` /
`onQualityChange`); sims react through `stage.onThemeChange` / `stage.onTierChange`. While the
sim loop is paused, orbiting, resizing and tier/theme changes self-render (no need to resume
the loop). `createResetViewButton(stage)` returns the "Ripristina vista" toolbar button. A gentle
intro flight runs on mount, skipped with reduced motion. A hidden floor is never added to the
scene; a wider one keeps the grid pitch (the texture repeats) and fades into the scene fog — the
car scenes use `floor: { radius: 64 }` so no disc edge shows beside the track.

### 10.3 Materials and geometry (`materials.ts`, `textures.ts`, `geometry.ts`)

`stage.materials.assign(mesh, kind, key?)` / `.get(kind, key?)`: cached per (kind, key) and
tier, rebuilt and re-assigned on tier/theme change, disposed with the stage. Never dispose kit
materials yourself, and re-`get` a material you animate every frame (a tier/theme switch
replaces the instance). Kinds: `copper`, `enamel` (enamelled wire, clearcoat), `brass`, `iron`
(laminated: procedural normal map), `steel` (brushed), `darkSteel`, `magnet`, `magnetN` /
`magnetS` (engraved nameplate texture), `rubber`, `carbon` (procedural 2×2 twill), `glass`,
`ceramic`, `plastic`, `filament`, and the quantity glows `glowB`, `glowEmf`, `glowI`, `glowF`,
`glowEnergy` (emissive in the §4.5 colour; drive `emissiveIntensity`). Procedural canvases are
generated once per page (`textures.ts`), GPU textures once per stage. Geometry helpers:
`chamferBox(w, h, d, r)` (bevelled box, UVs box-projected to [0, 1] per face) and
`roundedRectPoints(a, b, rc)` (coil outlines; counter-clockwise about +x for (u, v) = (z, y)).

### 10.4 Field lines (`fieldLines.ts`, `trace.ts`, `physics/fields.ts`)

Field models (pure, SI, `@slide none`): `dipoleField(m, r)`, `loopField(R, I, p)` (exact,
complete elliptic integrals `ellipK` / `ellipE` by AGM), `solenoidField(R, L, N, I, p)` (sum of
loops), `createGapField(geom, B0)` / `gapField` (two facing pole faces: two-sheet magnetic
surface-charge model, uniform in the core, fringing at the edges).

```ts
const lines = createFieldLines(stage, { linewidth?, spacing?, speed?, base?, gain? });
await lines.setJob({
  field: { kind: 'gap', geometry, B0: 1 } | { kind: 'dipole', m, at } | { kind: 'loop', R, I, at, axis }
        | { kind: 'solenoid', … } | { kind: 'uniform', B } | { kind: 'sum', parts },
  seeds: seedRect(…) | seedDisc(…) | seedByFlux(field, candidates, normal, n),  // flux-proportional
  options: { bounds, stopBoxes?, stopSpheres?, maxAngle?, direction?: 1 | -1 | 0, … },
});
lines.setFlow(B / Bmax);   // global speed/brightness factor; 0 freezes, < 0 reverses (AC flux)
lines.setFraction(i / Iref); // draw only the first ⌈f·n⌉ lines (draw range, no rebuild)
lines.setLines(traced);      // show lines computed elsewhere (e.g. flux confined in a core)
lines.shown                  // lines drawn after the fraction
```

**Line count ∝ flux.** When the field SHAPE is fixed and only its magnitude changes (a
solenoid while its current grows), trace once with flux-proportional seeds reordered by
`spreadOrder(n)` (bit reversal: every prefix is an even thinning, not one side) and call
`setFraction(Φ/Φ_ref)`: each line carries the same flux, so the number on screen follows Φ.

Tracer: RK4 on dr/ds = B̂, step adaptive by curvature (halved when B̂ turns more than
`maxAngle`, grown on straight stretches); stops on bounds, closure, stop regions ("sources"),
field reversal (charged sheet / sink), weak field or budget. Put stop boxes slightly IN FRONT of
pole faces. Animation: per-vertex travel coordinate τ = ∫ ds·B_ref/|B|, so the pulses move with
speed ∝ |B|; colour = B-blue ramp by |B|. One draw call (`LineSegments2` with a patched
`LineMaterial`, or `LineSegments` in base). When a synchronous trace took more than 4 ms, later
traces run in the module worker `fieldTrace.worker.ts` (stale results dropped). Trace once per
geometry change, never per frame; if only the field magnitude changes keep the lines and call
`setFlow`.

### 10.5 Current, heat, energy, labels

- `createCurrentFlow(stage, { path, closed?, count?, radius?, speedPerAmp, vMax?, smooth? })` →
  `setCurrent(i)` (sign = direction along `path`; speed = min(|i|·speedPerAmp, vMax); still at
  0), `setPath`, `setVisible`, `object` (re-parent it into a moving group if the conductor
  moves). Count × `particleDensity`. State the visual speed scale in the sim's model note.
- Heat: `thermalStep(T, P, C, hA, Tamb, dt)` (exact exponential), `thermalStepLoss`,
  `thermalSteadyState`, `blackbodyRGB(T)` (Planck × CIE 1931 → linear sRGB, LUT 300–2500 K),
  `blackbodyLuminance(T)`; render side `createHeatBody({ C, hA, Tamb })` → `step(P, dt)` in the
  physics step, `apply(material)` in render (no glow below 700 K, log-luminance mapping above).
- Thermal false colour: `ironbow(x)` (thermal-camera palette, x ∈ [0, 1]) and
  `ironbowGradientCss()` for the °C legend bar. Use it for REALISTIC temperatures (an overhead
  line at 60 °C, a resistor at 40 °C) behind a labelled toggle with a °C scale; incandescence
  (`applyHeatGlow`) only from the computed temperature above 700 K — never fake a glow.
- `createEnergyRibbon(stage, { path, widthPerWatt, minRadius?, maxRadius?, pRef?, speed?,
  quantity?: 'energy', dim?: 1, opacity?: 0.9 })` → `setPower(P)`, `setDim(d)`, `setOpacity(o)`:
  tube with radius ∝ |P| (in the shader, no rebuild), chevrons flowing with sign(P), colour =
  palette colour of `quantity` × `dim`, re-applied on every theme change (e.g. losses that
  became heat: `dim: 0.42`). Never write the ribbon's shader uniforms from a sim.
- `createLabelLayer(stage, layout.sceneOverlay, { occlude?: true })` → `add({ text, anchor:
  Vector3, quantity?, priority?, offset?, occlude?, size? })` → `setText`, `setVisible`,
  `setOffset`. Labels are projected every frame, nudged vertically to avoid overlaps (higher
  priority placed first; items are kept sorted on `add`) and faded when hidden by
  `stage.occluders`; quantity colours via `.r-label--b|emf|i|f|energy|accent`. The update is
  allocation-free (pooled rectangles, style writes only on change); with `{ occlude: false }` on
  the layer, or when no label asks for occlusion, no ray is ever cast. Visible text uses Unicode
  sub/superscripts (τₑₘ, Φₘₐₓ, I₀), never `_` (KaTeX only in formula panels).

### 10.6 Disposal and performance rules

- Create resources through the stage, the kit and the helpers; call each helper's `dispose()`
  and finally `stage.dispose()` from the sim's `dispose()`. The stage disposes composer passes
  and render targets, the PMREM environment, the shadow map, kit materials/textures, studio
  floor/backdrop, controls and the renderer (+ `forceContextLoss`). `renderStats`
  (`window.__kersDebug.render()`) counts live stages, renderers, composers, render targets,
  PMREM, materials, textures, geometries and workers: all must be 0 after an unmount (e2e leak
  tests read them after leaving the sim).
- No per-frame allocations in `render`/`update` (reuse vectors); no geometry rebuild per frame
  (rebuild on a parameter change only, compare a key); instancing for repeated parts; one draw
  call per field-line set; shared kit materials.
- Read `stage.settings` for counts (`lineDensity`, `particleDensity`, `tessellation`) and rebuild
  them in `stage.onTierChange`. `base` must stay usable on SwiftShader (all e2e run there).
- The render layer only reads simulation state; physics stays in the fixed-step model.
- GLSL: clamp before `pow` (`pow(x, y)` is undefined for x < 0, and a single NaN pixel becomes
  a large blot after bloom); e.g. a Fresnel rim `pow(clamp(1.0 − |N·V|, 0.0, 1.0), k)`.
- Deterministic GPU counters: sims whose objects start hidden call a `prewarm()` after building
  the scene (make everything visible, `renderer.compile`, `initTexture` every texture, restore)
  and expose a `frames` counter; e2e leak tests sample only after a few frames (`settled()`).
