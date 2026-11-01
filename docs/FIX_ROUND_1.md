# Fix round 1 (owner's testing feedback F1–F10)

Orchestrator baseline (task **B0**), 2026-11-01, on `claude/quirky-cray-0kg1gn` at `89b3af6`
(v0.6.0). Decisions taken where the brief and the repository disagree are in
[`DECISIONS.md`](./DECISIONS.md) **D16**.

## 1. Baseline (before any change)

| Gate | Result |
|---|---|
| `npm ci` | OK |
| `npm run lint` | OK, 0 problems |
| `npm run format:check` | OK |
| `npm run typecheck` | OK |
| `npm test` (Vitest) | **54 files, 533 tests passed** |
| `npm run build` | OK |
| `npm run e2e` (Playwright, Chromium 1243, SwiftShader) | **128 passed** (8,9 min) |

FPS recorded by the existing e2e on software GL (headless SwiftShader, not representative of
a real GPU): lenz 16,3 fps, rl-energy 14,3 fps (rAF rate). Real-GPU numbers must be measured
by QA with the cap on and off (F7).

## 2. What exists today per simulator

Every simulator is `src/sims/<id>/` with `index.ts` (SimModule + mount), `model.ts` (pure
sim logic over `src/physics`), `panel.ts` (formula items), `scene.ts` (Three.js on
`src/render/`). Registry order = `SIM_IDS` in `src/core/registry.ts` = sidebar order.

| Id | Files | What it shows | Has the car |
|---|---|---|---|
| `faraday` | index, model, panel, scene, format | Rotating coil in a uniform field (Φ(t), f.e.m.(t), lamp); **second mode "Moto traslatorio"** (bar on rails, B·l·v) with sliders `l`, `v` | no |
| `lenz` | index, model, panel-less (params, status), scene, lenz.css | Magnet approaching/leaving a coil, induced current, galvanometer, opposing force | no |
| `alternator-motor` | index, model, panel, scene, constants, style.css | One-coil machine in generator (braking) / motor (acceleration) mode, Lorentz forces, energy ribbons; **SoC shown but cosmetic** (`socStep`, 5 kJ, clamped) | no |
| `kers-braking` | index, model, panel, scene, style.css | Constant-deceleration braking event v₁ → v₂, ΔE_k, MGU-K limited by Pₘₐₓ and η, rest to discs (thermal), presets 120 / 350 kW | **yes** (shared car) |
| `joule-transformer` | index, model, panel, params, scene, visual, style.css | Ideal transformer + line losses, transport-chain diorama, "10× tensione → 100× meno perdite" | no |
| `rl-energy` | index, model, panel, params, scene, visual, style.css | RL transient, τ = L/R, ½LI², energy balance | no |
| `car-dynamics` | index, model, panel, forces, scene, style.css | Combined braking MGU-K + discs, Pacejka tyres, drag/downforce, rear-axle limit | **yes** (shared car) |

Shared: `src/sims/shared/car/**` (procedural single-seater, track, discs), `src/sims/shared/turns.ts`.
UI kit: `src/ui/` (`plot.ts` uPlot wrapper, `formulaPanel.ts` readouts, `simLayout.ts`,
`toolbar.ts`, `slider.ts`, `controls.ts`, `colors.ts`, `ringBuffer.ts`). Loop:
`src/core/loop.ts` (fixed step 1/240 s, **render capped at 60 fps**). Tokens:
`src/styles/tokens.css` (not `src/ui/tokens.css`). Physics: `src/physics/` (flux, rl,
transformer, machine, vehicle, vehicle-dynamics, brake-thermal, thermal, fields, powerline,
ode, constants). CI: `.github/workflows/ci.yml` (lint, format, typecheck, vitest+coverage,
build; Playwright job).

## 3. Reproduction of F4, F6, F9 (failing evidence)

Script: Playwright, 1280×720, `vite preview` of the baseline build.

**F4 — readouts move.** Bounding boxes of `.formula-row__number/.formula-row__value` sampled
every 0,5 s for 5 s while the first slider is moved (arrows, then `End`):

| Sim | Readouts | Samples that moved | Max shift |
|---|---|---|---|
| faraday | 12 | 21 | 18,1 px |
| alternator-motor | 16 | 128 | 587 px |
| kers-braking | 14 | 4 | 9 px |
| joule-transformer | 14 | 7 | 9,1 px |
| lenz | 14 | 10 | 9,1 px |
| rl-energy | 16 | 0 | 0 px |
| car-dynamics | 18 | 4 | 9,1 px |

Required after the fix: 0 px everywhere (scene HUD labels included where they are readouts).

**F6 — Faraday y-scale lost.** `docs/media/fix-round-1/F6-faraday-before.png` vs
`F6-faraday-after-slider-changes.png`: after moving B, S, N, ω to max and back to min, the plots
redraw the whole trace history (computed with the *old* parameters) multiplied by the *new*
display prefix: the axis reads "25.000 µWb" and "10.000.000 µV" while the current signal
(≈ 9,8 µWb, 5 µV) is a flat line at 0. Root causes seen in `src/sims/faraday/index.ts` and
`src/ui/plot.ts`: (1) the plot is destroyed and recreated when the display prefix changes, and
the history is re-scaled with the new prefix; (2) the y-scale is pure uPlot autoscale over all
buffered samples, so stale large samples dominate; (3) no analytic range, no rate limit, no
guard against zero-width ranges (B = 0 or ω = 0 gives a flat line → degenerate range).

**F9 — battery never stops the motor.** `src/sims/alternator-motor/model.ts:460` `socStep`
only clamps SoC to [0, 1]; `index.ts:330` stores it for the label. Nothing in the motor model
reads SoC, so at SoC = 0 % the motor keeps producing torque forever (energy from nowhere).
Screenshot `docs/media/fix-round-1/F9-alternator-motor-motor-mode.png`. There is no
"Batteria scarica" state, no hysteresis, no Joule loss of the battery, no capacity setting.

## 4. Fix → files map

| Fix | Task | Files (new **bold**) |
|---|---|---|
| F1 acceleration in braking sims | P1, S3, S2 | **`src/physics/battery.ts`**, **`src/physics/longitudinal.ts`** (vehicle + MGU-K controller + `kersDriveStep`); `src/sims/kers-braking/**` → **`src/sims/kers-drive/**`**; `src/core/registry.ts`, `src/core/router.ts` (redirect), `src/core/i18n/it.ts`; `src/sims/alternator-motor/**` |
| F2 live telemetry plots | U1, S3, S5 (car-dynamics), S6 | **`src/ui/carTelemetryPlots.ts`**, `src/ui/plot.ts`; `kers-drive`, `car-dynamics`, `drive-sim` |
| F3 drive-sim | S6 | **`src/sims/drive-sim/**`**, registry, it.ts, e2e |
| F4 fixed readouts | D1, U1, S1–S6 | **`src/ui/valueReadout.ts`**, `src/ui/formulaPanel.ts`, `src/styles/components.css`, every sim `index.ts`/`panel.ts`, scene HUD labels; **`e2e/readout-stability.spec.ts`** |
| F5 fullscreen | U1, S1–S6 | **`src/ui/fullscreen.ts`**, `src/ui/simLayout.ts`, `src/ui/toolbar.ts`, `src/render/stage.ts` resize (read-only contract: stage already uses ResizeObserver — U1 verifies), **`e2e/fullscreen.spec.ts`** |
| F6 plot scale | P1 (range helpers), U1 (`plot.ts`), S1 (faraday) , S5 | `src/physics/` range helpers, `src/ui/plot.ts`, `src/sims/faraday/index.ts`, **`e2e/plot-scale.spec.ts`** |
| F7 uncapped FPS | U1, all S | `src/core/loop.ts`, **`src/ui/fpsCounter.ts`**, **`src/core/settings.ts`** (FPS limit, localStorage), `src/core/app.ts` (settings switch), `docs/ARCHITECTURE.md` §5 |
| F8 remove moto traslatorio | S1, T1 | `src/sims/faraday/{index,model,panel,scene}.ts`, `tests/sims/faraday/**`, `e2e/sims/faraday.spec.ts`, README table, `content/theory/03-faraday-neumann.md` (text pointing to the control). `emfMotional` stays in `src/physics` (frozen API §4.2, theory). |
| F9 battery + cutoff | P1, S2 | `src/physics/battery.ts` (+ tests), `src/sims/alternator-motor/**` |
| F10 transformer plots | P1, S4 | `src/physics/transformer.ts`/`powerline.ts` helpers, `src/sims/joule-transformer/**` |

## 5. Where the repository differs from the brief

Recorded as D16 in `DECISIONS.md`; summary:

1. Current version is **v0.6.0**; `v0.2.0` already exists. This round releases **v0.7.0**.
2. **No quiz** (`content/quiz/**` removed in v0.5.0, D13): F8/T1 quiz parts are void.
3. **No `docs/DESIGN.md`, no `src/ui/tokens.css`/`components.css`**: tokens live in
   `src/styles/tokens.css` and `src/styles/components.css`; D1 owns those and creates `docs/DESIGN.md`.
4. **No presentation mode (`P`), no "recommended path", no home grid**: the sidebar/`SIM_IDS`
   order is the path and `#/sim` is the grid. `drive-sim` goes last in `SIM_IDS` (so last in
   sidebar and grid). Presentation mode is **not invented** in this round; the `F` and `` ` ``
   shortcuts must not take `P`, so a future presentation mode stays possible.
5. **Slide numbers are not shown in the UI** (D13): F10 markers show the values
   (10 kV, 220–380 kV, 20–132 kV, 380/220 V) without "slide 23".
6. A **seventh simulator with the car exists, `car-dynamics`**: F2 (and F4/F5/F6/F7) apply to it (task S5).
7. `car-dynamics/model.ts` imports presets from `kers-braking/model.ts` (cross-sim import);
   S3 updates that import path when renaming (granted exception, D16).
8. Merge target: the session may push only to `claude/quirky-cray-0kg1gn`; it plays the role
   of `main` for this round (squash-merge per task there). Pushing `main` and the tag is left
   to the owner (exact commands in the final report).
