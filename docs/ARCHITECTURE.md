# KERS Lab — Architecture

> **KERS Lab** — *"Dall'induzione di Faraday all'MGU-K"*. One static web app, three
> areas behind one sidebar: **Teoria** (Italian theory pages rendered from Markdown +
> KaTeX), **Simulatori** (interactive 3D scenes + live plots), **Interrogazione**
> (quiz / oral-exam trainer).
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
            │ quiz/    Interrogazione mode                               │
            │ sims/<id>/  one folder per simulator (Three.js + ui/)      │
            ├────────────────────────────────────────────────────────────┤
            │ physics/  PURE TypeScript, SI units, no DOM/Three/clock    │
            └────────────────────────────────────────────────────────────┘
```

Dependency rule (arrows point to allowed imports):

- `physics` → nothing (only its own files). **Enforced by ESLint**: in
  `src/physics/**` the imports `three`, `uplot`, `katex`, `marked` and any path into
  `core/ ui/ sims/ theory/ quiz/` are errors, and so are the globals `window`,
  `document`, `navigator`, `localStorage`, `sessionStorage`, `Date`, `performance`,
  `requestAnimationFrame`, `cancelAnimationFrame`, `setTimeout`, `setInterval`,
  `process`.
- `core` → `physics` (only `PHYSICS_DT`), browser APIs.
- `ui`, `theory`, `quiz` → `core`, `physics`.
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
  content/quiz/    # quiz.json
  src/
    core/          # app shell, router, i18n (it.ts), theme, module registry
    physics/       # PURE TS, no DOM/Three imports, SI units
    ui/            # components, plots wrapper, sliders
    sims/<id>/     # one folder per simulator: index.ts, scene.ts, panel.ts
    theory/        # markdown loader/renderer
  tests/ e2e/
  .github/workflows/
```

Additionally: `src/quiz/` (A9), root configs (`package.json`, `tsconfig.json`,
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
| **A2** Theory writer | `content/theory/**`, `docs/OPEN_FACTS.md` | 14 files, §4.4 format |
| **A3** UI shell & design system | `src/core/**` (extends A0), `src/ui/**`, `src/theory/**`, global CSS | sidebar, theory renderer, sim layout, tokens §4.5, `Slider`, `Plot`, `FormulaPanel` |
| **A4** Sim `faraday` | `src/sims/faraday/**` | |
| **A5** Sim `lenz` | `src/sims/lenz/**` | |
| **A6** Sim `alternator-motor` | `src/sims/alternator-motor/**` | |
| **A7** Sim `kers-braking` | `src/sims/kers-braking/**` | |
| **A8** Sims `joule-transformer`, `rl-energy` | `src/sims/joule-transformer/**`, `src/sims/rl-energy/**` | |
| **A9** Quiz / Interrogazione | `content/quiz/**`, `src/quiz/**` | |
| **A10** DevOps & repo hygiene | `.github/**`, `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `LICENSE` | extends `ci.yml`, Pages deploy |
| **A11** Independent QA | `docs/QA_REPORT.md`, issues list (read-only on source) | must not be an agent that built the code |

Tests for a sim live next to it or under `tests/sims/<id>/**` (owned by that sim's
agent); e2e specs under `e2e/<area>.spec.ts` (owned by the area's agent; A10 owns
the CI wiring).

Dependency graph: **A0 → (A1 ∥ A2 ∥ A3 ∥ A10) → (A4 ∥ A5 ∥ A6 ∥ A7 ∥ A8 ∥ A9) → A11
→ fix loop → release v0.1.0 → Phase 4.**

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
  slideRefs: number[]; theoryId: string;       // links to content/theory/<theoryId>.md
  mount(host: HTMLElement, ctx: AppContext): Disposable;   // must be idempotent & leak-free
}
export interface AppContext { theme: 'dark'|'light'; reducedMotion: boolean; formatIT(n:number, digits?:number, unit?:string): string; }
export interface Disposable { dispose(): void }   // stops RAF, removes listeners, disposes Three/uPlot resources
```
Each sim exposes parameters through one typed `params` object with `{min,max,step,default,unit,labelIT}` per field so UI, tests and the quiz can read them.

In code (`src/core/types.ts`):

```ts
export interface ParamSpec { min: number; max: number; step: number; default: number; unit: string; labelIT: string }
export type ParamsSchema<T> = Record<keyof T, ParamSpec>;
```

**4.4 Theory file format** (frontmatter + Markdown): `id, titleIT, slideRefs[], goal(optional), order, level("base"|"approfondimento")`. Math with `$…$` / `$$…$$`. Fixed sections in this order, using these exact Italian headings: `## In breve`, `## Formule`, `## Spiegazione`, `## Esempio numerico`, `## Collegamento con KERS / MGU-K`, `## Domande da interrogazione`.

Example skeleton:

```markdown
---
id: 03-faraday-neumann
titleIT: Legge di Faraday-Neumann
slideRefs: [8, 9, 10]
order: 3
level: base
---

## In breve
## Formule
## Spiegazione
## Esempio numerico
## Collegamento con KERS / MGU-K
## Domande da interrogazione
```

The six headings are also available in code as `t.theory.headings`
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
   `rl-energy`).
2. `export default` a `SimModule` whose `id` equals the folder name:

   ```ts
   import type { SimModule } from '../../core/types';
   const sim: SimModule = {
     id: 'faraday',
     titleIT: 'Flusso e legge di Faraday-Neumann',
     summaryIT: '…',
     slideRefs: [7, 8, 18, 19],
     theoryId: '03-faraday-neumann',
     mount(host, ctx) { /* build scene, createLoop, … */ return { dispose() { /* … */ } }; },
   };
   export default sim;
   ```
3. Export the typed parameter schema from the same folder:
   `export const params: ParamsSchema<FaradayParams> = { … }`.
4. Nothing else: `loadSimModules()` (called by the shell) discovers every
   `src/sims/*/index.ts` via `import.meta.glob` and registers it; the registry
   rejects unknown or duplicate ids and lists modules in `SIM_IDS` order. No shared
   file needs editing (DECISIONS D4).

`mount` must be idempotent and leak-free: `dispose()` stops the loop, removes every
listener, disposes all Three.js geometries/materials/textures/renderers and uPlot
instances, and empties `host`.

## 7. Routing

Hash-based (DECISIONS D5): `#/teoria` (default), `#/teoria/<theoryId>`, `#/sim`,
`#/sim/<simId>`, `#/interrogazione`. Ids match `/^[a-z0-9][a-z0-9-]*$/`; anything
else falls back to `#/teoria`. Build links with `formatRoute(route)`; never use
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
