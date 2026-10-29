# QA report — A11 independent verification

> **Note (v0.5.0):** the Interrogazione mode (quiz) and the modules `field-biot-savart` /
> `pmsm-dq` (theory 15 and 16) were removed by design ([D13](./DECISIONS.md)), and slide
> references are no longer shown in the UI. Findings below about the quiz, those two modules
> or slide chips are historical and obsolete; the rest of the history is kept unchanged.

## Visual overhaul round (v0.6.0)

Date: 2026-10-29 · Base: `claude/new-session-u560qi` @ `9b01577` (V0–V3 on top of v0.5.1) ·
Branch: `qa/A11-visual`. Scope: the render foundation (`src/render/**`), the new physics
modules `src/physics/{fields,thermal,brake-thermal,powerline}.ts`, the redesigned scenes of all
7 simulators, ARCHITECTURE §10, DECISIONS D13–D15, PHYSICS §8. Read-only on source; scripts,
logs and screenshots in the scratchpad `a11vis/` (not committed). Real-GPU frame rates cannot be
measured here (headless Chromium on SwiftShader); the performance section uses proxies.

### V.1 Verdict

| Item                                                                 | Result | Notes                                                                                       |
| -------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| Physics `fields.ts` (K/E, loop, dipole, solenoid, gap)               | PASS   | re-derived numerically, see V.3                                                             |
| Physics `thermal.ts` (exact step, Planck → sRGB)                     | PASS   | exact step and LUT checked; nit QA-037                                                      |
| Physics `brake-thermal.ts`                                           | PASS   | 300 → 649 °C reproduced for the 2025 preset (doc: 647 °C)                                   |
| Physics `powerline.ts`                                               | PASS   | catenary, thermal sag, 4,44·f·N·Φ̂ checked; undocumented → QA-033                            |
| Physics coverage                                                     | PASS   | 100 % stmts/funcs/lines, 98,94 % branches                                                   |
| Render foundation (stage, tiers, lines, flow, heat, ribbons, labels) | PASS   | leaks 0, hidden tab 0 draw calls, tier switch live + persisted; nits QA-038, QA-041, QA-042 |
| Sim `faraday`                                                        | PASS   | mapping correct; minor QA-035 (bloom fakes a lit lamp in alta dark)                         |
| Sim `lenz`                                                           | FAIL   | **QA-031** (1280×720 unreadable); minor QA-032 (invisible canvas focus ring)                |
| Sim `alternator-motor`                                               | FAIL   | **QA-031** (6 label overlaps at 1280×720); forces, torques, ribbons correct                 |
| Sim `rl-energy`                                                      | FAIL   | **QA-031**; emf = E at 0⁺, E·e⁻¹ at τ, Joule + field = trunk: correct                       |
| Sim `joule-transformer`                                              | FAIL   | **QA-031**; minor QA-034 (speed cap hides N₁/N₂ at high P); nit QA-043                      |
| Sim `kers-braking`                                                   | PASS   | disc temperatures and ribbons from the model; nit QA-039                                    |
| Sim `car-dynamics`                                                   | FAIL   | **QA-031** (HUD, arrows, legend overlap at 1280×720); pitch/heave/patch signs correct       |
| Accessibility                                                        | PASS   | axe 0 violations on 36 own runs + e2e sweep; keyboard path PASS; minor QA-032               |
| Italian proofreading                                                 | PASS   | nits QA-040                                                                                 |
| Docs (ARCHITECTURE §10, D13–D15, PHYSICS, README, CHANGELOG)         | FAIL   | minor QA-033, QA-036                                                                        |
| Gate + full e2e                                                      | PASS   | gate exit 0, 523/523 unit, 113/113 e2e, tree clean afterwards                               |

**Overall: FAIL for v0.6.0** — one major defect (QA-031): at the 1280×720 minimum resolution the
scene box is 256 px high and the in-canvas legends, HUD and status badge cover 40–60 % of it, with
labels drawn on top of the legend in 5 of 7 sims. The physics behind every visual checked out;
everything else is minor or nit. After QA-031 (and ideally QA-032–QA-036) the release can be
re-marked PASS by re-taking the 1280×720 screenshots.

### V.2 Defects

| ID     | Sev   | Owner                   | File:line                                                                                                                                                                   | Defect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Evidence                                                                                                                                                           | Suggested fix                                                                                                                                                                                                                                                                                          |
| ------ | ----- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| QA-031 | major | A3 layout / sim owners  | `src/styles/sim.css:72`; in-canvas legends (e.g. `src/sims/lenz/index.ts:119-131`, `src/sims/joule-transformer/index.ts:116-123`, `src/sims/car-dynamics/index.ts:338-346`) | At 1280×720 `.sim-scene` is clamped to 16rem = 256 px (`calc(100vh − 32rem)` < 16rem). The overlay legend (2–4 lines), the HUD (car sims) and the status badge (lenz) cover 40–60 % of the canvas; scene labels are drawn on top of the legend and of each other (alternator-motor: 6 overlapping label pairs, e.g. `τₑₘ …` ⟷ `avvolgimento … calore Joule`; lenz: `B̄` and `N = 200 spire` under the legend, galvanometer covered; joule-transformer: `Φₘₐₓ` and `freccia` over the legend; car-dynamics: arrow labels over the HUD). The 3D scene is not readable at the documented minimum resolution. Fine at 1920×1080.                               | `a11vis/shots/{lenz,alternator-motor,joule-transformer,rl-energy,car-dynamics}-{base,alta}-{dark,light}-1280x720.png`; overlap counts in `a11vis/results-*-7.json` | Below ≈ 400 px of scene height move the legend out of the canvas (collapsible block under the scene) and collapse the HUD; raise the scene minimum (≈ 20rem) and accept plots below the fold at 720 px; include legend/HUD rects in the label collision test; add a 1280×720 overlap assertion to e2e. |
| QA-032 | minor | lenz owner              | `src/sims/lenz/lenz.css:12-15`                                                                                                                                              | The focusable magnet canvas (`role="slider"`) gets `outline: none; box-shadow: inset var(--focus-ring)` on `:focus-visible`. An inset box-shadow on a replaced element is painted under the canvas pixels, so keyboard focus is invisible (WCAG 2.4.7). axe cannot detect it.                                                                                                                                                                                                                                                                                                                                                                             | `:focus-visible` matches, but `a11vis/shots/lenz-focused.png` shows no ring (identical framing to `lenz-unfocused.png`)                                            | `outline: 3px solid var(--color-focus); outline-offset: -3px;` or a ring on `.sim-scene:has(canvas:focus-visible)`.                                                                                                                                                                                    |
| QA-033 | minor | A1 docs                 | `docs/PHYSICS.md` §1, §8                                                                                                                                                    | PHYSICS.md documents only `brake-thermal.ts` (§8). No section or function-table rows for `fields.ts` (AGM K/E, exact loop field, finite solenoid, two-sheet gap model, divergence), `thermal.ts` (exact lumped step, energy-exact loss, Planck × CIE 1931 → linear sRGB, LUT 300–2500 K, luminance ratio) or `powerline.ts` (catenary sag/length/inverse, `thermalSag`, `coreFluxPeak`), although the document is "the reference for `src/physics/**`".                                                                                                                                                                                                   | `grep -n 'loopField\|thermalStep\|catenary' docs/PHYSICS.md` → nothing                                                                                             | Add sections for fields, thermal/black body and power line with formulas, units, limits (elastic stretch neglected; gap model ignores saturation; LUT clamp) and the numbers in V.3.                                                                                                                   |
| QA-034 | minor | joule-transformer owner | `src/sims/joule-transformer/visual.ts:85-86`; `src/sims/joule-transformer/scene.ts:833-835`                                                                                 | D15 claims "the HV line visibly carries N₁/N₂ of the generator current". Particle speed 0,003 units/s per A, capped at 3,2 ⇒ saturation at 1067 A peak (754 A RMS). With V₁ = 20 kV and P ≳ 16 MW the generator section is capped; at P = 100 MW (I₁ = 5000 A, I_line = 500 A) the peak speeds are 3,2 vs 2,1 (ratio 1,5, not 10). The wire-radius clamp (rMin 0,012) likewise hides ratios > ≈ 21. The cap is stated in the note, so it is not dishonest, but the visual stops showing the point of the sim.                                                                                                                                             | Code + hand computation; correct ratio (10) at the defaults                                                                                                        | Normalise the speeds to the largest section current (1-2-5 full scale, stated in the legend, as lenz/rl-energy do).                                                                                                                                                                                    |
| QA-035 | minor | render / faraday owner  | `src/render/quality.ts:58` (bloom threshold 0,82); faraday lamp materials                                                                                                   | In `alta` dark the white lamp base/glass crosses the bloom threshold, so the bulb looks lit while its label reads `P/Pₘₐₓ = 1 %` — a glow not driven by the model. Car body highlights in car-dynamics `alta` also approach blow-out.                                                                                                                                                                                                                                                                                                                                                                                                                     | `a11vis/shots/faraday-alta-dark-1920x1080.png` (halo at 1 %) vs `faraday-alta-light-1920x1080.png`, same instant (no halo)                                         | Bloom only HDR emissive (threshold ≥ 1 with emissive > 1) or a selective bloom layer; darker porcelain/glass albedo.                                                                                                                                                                                   |
| QA-036 | minor | release / docs          | `package.json:3`; `CHANGELOG.md:8`; `README.md`                                                                                                                             | Release bookkeeping for v0.6.0 missing: version still 0.5.1, `[Unreleased]` empty, README says nothing about the "Qualità grafica" tiers, auto-detection, the `?quality=` override or what `base` drops.                                                                                                                                                                                                                                                                                                                                                                                                                                                  | files                                                                                                                                                              | Bump, CHANGELOG entry (V0–V3), README paragraph.                                                                                                                                                                                                                                                       |
| QA-037 | nit   | render / sim owners     | `src/render/heat.ts:19-36`; `src/sims/shared/car/car.ts:760-762`; `src/sims/lenz/index.ts:45`                                                                               | Honesty of scales: (a) the glow brightness is a stylised log-luminance mapping (2,6·(L/L₂₅₀₀)^1,5) but the notes only say "colore del corpo nero"; (b) the MGU-K glow ∝ √(P/350 kW) and the battery emissive 0,6 + 1,2·carica in the car sims are not stated; (c) lenz note "il campo indotto reale è circa mille volte più debole": at the defaults (z = 0,10 m) B̄/B_ind ≈ 4·10² ("centinaia di volte").                                                                                                                                                                                                                                                 | Code reading; hand computation                                                                                                                                     | One sentence each in the model notes.                                                                                                                                                                                                                                                                  |
| QA-038 | nit   | sim owners / render     | `src/render/heat.ts:30-31`; sim plots                                                                                                                                       | Per-frame JS allocation in `base` (CDP sampling heap profiler, 5 s): faraday 233 KB/frame, alternator-motor 244 KB/frame, kers-braking 139 KB/frame — mostly uPlot `setData`/`toArrays` every frame, `rk4Step` arrays at 240 Hz and model traces; `glowIntensity` recomputes `blackbodyLuminance(700 K)` and `(2500 K)` (≈ 160 small arrays) on every cache miss while a disc heats. Not a 60 fps risk on the target (≈ 14 MB/s of young garbage), but contradicts the brief's "no per-frame allocations".                                                                                                                                                | `a11vis/alloc.mjs` (V.5)                                                                                                                                           | Hoist the two reference luminances; throttle plot updates to ≈ 20–30 Hz.                                                                                                                                                                                                                               |
| QA-039 | nit   | car sims owner          | `src/sims/shared/car/scene.ts` (labels vs HUD)                                                                                                                              | The "Punto di frenata" label overlaps the HUD box and hides its last line ("In batteria …") also at 1920×1080.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `a11vis/shots/car-dynamics-{base,alta}-*-1920x1080.png`                                                                                                            | Treat the HUD rect as a label occluder or move the HUD.                                                                                                                                                                                                                                                |
| QA-040 | nit   | sim owners / A2         | `src/core/format.ts` (negatives); faraday α label; joule-transformer model note; `src/sims/lenz/index.ts:121`; `content/theory/*.md`                                        | Typography: negative values with hyphen-minus in scene labels and readouts (`Φ = … = -2,8 mWb`, `τₑₘ = -1,38 N·m`, `B̄ = -61,62 µT`, `ε = -9,4 V`) — use U+2212 "−"; angle `α = 107 °` (no space before ° for angles); prime as straight apostrophe in `C'·dT/dt = R'·I²` (use ′); legend "1 linea = flusso uguale" → "ogni linea porta lo stesso flusso". Pre-existing: theory Markdown still uses straight apostrophes (`un'induttanza`, ≈ 60 lines in 01–14). Decimal commas, units, Unicode subscripts and the absence of slide references are correct; MGU-K machine wording is hedged ("generalmente descritta come sincrona a magneti permanenti"). | Screenshots; `a11vis/strings.txt`                                                                                                                                  | As stated.                                                                                                                                                                                                                                                                                             |
| QA-041 | nit   | render                  | `src/render/fieldLines.ts:219`                                                                                                                                              | The first trace of every `FieldLines` (and every retrace after a tier change) runs synchronously on the main thread; the worker is used only after a trace took > 4 ms. Measured first traces 4,6–25 ms (rl-energy solenoid 25 ms under load). Lenz can hold 3 workers (one per `FieldLines`; 2 alive in my run).                                                                                                                                                                                                                                                                                                                                         | `a11vis/perf.log` (`trace` entries, `liveWorkers`)                                                                                                                 | Start in the worker for `solenoid`/`sum` specs; share one worker per stage.                                                                                                                                                                                                                            |
| QA-042 | nit   | render                  | `src/render/trace.ts:461-472` (`seedByFlux`)                                                                                                                                | Stratified sampling may pick the same candidate for several seeds when one cell's weight exceeds total/n, producing coincident duplicate lines (wasted draws; the count no longer equals distinct flux tubes).                                                                                                                                                                                                                                                                                                                                                                                                                                            | Code reading                                                                                                                                                       | Skip duplicates or jitter within the cell.                                                                                                                                                                                                                                                             |
| QA-043 | nit   | joule-transformer owner | `src/sims/joule-transformer/scene.ts` (home camera)                                                                                                                         | The generator hall is cut by the left edge of the home view (stack and hall), both tiers, 1920×1080.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `a11vis/shots/joule-transformer-*-1920x1080.png`                                                                                                                   | Widen the FOV or move the target slightly left.                                                                                                                                                                                                                                                        |

### V.3 Physics behind the visuals (check 1, re-derived)

Independent script `a11vis/phys.ts` (bundled with esbuild, run in Node) against brute force:

- **K(m), E(m)** (AGM) vs Simpson quadrature (2·10⁵ panels), m = 0 … 0,99: |error| ≤ 4·10⁻¹⁴.
- **`loopField`** vs Biot–Savart sum over 20 000 segments at 5 points (centre, axis, off-axis, far,
  1 cm from the wire): relative error ≤ 4·10⁻¹³. Far field vs `dipoleField(m = I·πR²)` at
  r = 0,64 m (R = 1 cm): ≤ 2·10⁻⁴ (expected O((R/r)²)).
- **`solenoidField`** centre of R = 2 cm, L = 0,4 m, N = 200: 6,252 0038·10⁻⁴ T vs the finite-solenoid
  formula 6,252 0031·10⁻⁴ T.
- **Gap two-sheet model** vs a 300 × 300 numerical integration of the two charged rectangles at 5
  points (inside, edge, outside, behind the faces): identical to 4 decimals; ∇·B ≈ −5·10⁻⁶ T/m
  (B₀ = 0,5 T) at a fringing point.
- **`thermalStep`** equals the analytic exponential exactly; black body (linear sRGB, max = 1):
  800 K (1, 0, 0), 1000 K (1; 0,029; 0), 1500 K (1; 0,145; 0), 2500 K (1; 0,380; 0,068); LUT
  clamps above 2500 K (documented). Y(800 K)/Y(2500 K) = 1,45·10⁻⁹.
- **Brake disc**: front disc, 0,62 MJ in 3 s, v 83 → 22 m/s, from 300 °C: **649 °C**, 33 kJ lost
  (PHYSICS §8: 647 °C, 38 kJ — consistent within the speed-profile approximation). Starting
  temperatures and the 60/40 split are stated in the notes. On screen: kers-braking 2025 front
  616 °C at t = 2,44 s, 635 °C at 2,74 s.
- **Catenary** S = 300 m, a = 1000 m: sag 11,271 m (parabola 11,25 m); +50 K with α = 23·10⁻⁶:
  sag 12,893 m vs parabolic estimate 12,884 m. joule-transformer default sag 8,3 m = 300²/(8·1359 m) ✓.
  **Core flux** Φ̂(230 V, 50 Hz, 500) = 2,0707 mWb vs 4,44-rule 2,0721 mWb; default
  Φₘₐₓ = 0,90 Wb ✓.

Visual mapping (code reading, signs checked by hand):

- **Field lines** are traced from the models (`gap` faraday/alternator, 8-dipole chain lenz,
  solenoid rl-energy/lenz induced, closed core loops joule-transformer). Line count follows flux
  where claimed: rl-energy `setFraction(|i|/I_ref)` with bit-reversal order; joule-transformer
  `fluxFraction(Φ̂)`; lenz seeds equal-flux from the face. Faraday/alternator draw a fixed count
  and only the pulse speed follows B (as stated).
- **Current particles**: speed = sign(i)·min(|i|·k, vmax); paths oriented counter-clockwise about
  n̂ for i > 0 (faraday rails, lenz helix θ ↑ = CCW about +x, alternator coil `ccw = −s` checked
  against the side carrying s along +y); still at i = 0.
- **Lenz**: induced lines visible only while `sign ≠ 0` (dΦ = 0 at rest); N approaching ⇒ B̄ < 0
  growing in magnitude ⇒ i > 0 ⇒ B_ind along +x toward the magnet (repulsion) ✓ — opposes the
  change in every case.
- **Alternator**: F_A = i L ŷ × B x̂ = −s·B·L ẑ = arrow `dirA = −sign(F)` ✓; τ_y = (w/2) sin θ · F
  per side ✓; ribbons mech = elec + Joule (12,72 = 10,18 + 2,54 W on screen) ✓.
- **RL**: arrow ∝ |−L di/dt| = E − R i ⇒ E at 0⁺, E·e⁻¹ at τ ✓; ribbons gen = Joule + field
  (radii add) ✓.
- **Transformer**: section speeds ∝ I₁, I_line, I_out (ratio N₂/N₁ = 10 at the defaults) ✓ until
  the cap (QA-034).
- **Car**: pitch θ = atan((δ_f − δ_r)/L), `body.rotation.z = −pitch` lowers the nose (+x) ✓; heave
  down ✓; wheel spin −x/r ✓ (forward roll); patch glow 0,9·(κ/κ*)² ✓; arrows backward for D and
  Fx, downward for L ✓.
- **Honesty**: every scale is in a legend or note (log force arrows, ribbon radius, particle k,
  induced-line gain ×500, sag scale, AC ×200 slower, thermal ×300) except the items in QA-037.

### V.4 Gate and e2e (check 2)

```
npm run lint && npm run format:check && npm run typecheck && npm test && npm run build
  All matched files use Prettier code style!
  Test Files  54 passed (54) · Tests  523 passed (523)
  ✓ built in 5.48s                                   GATE_EXIT 0
physics coverage: All files 100 | 98.94 | 100 | 100 (fields.ts branch 175, vehicle-dynamics 381-382)
PW_PORT=4740 … npm run e2e -- --workers=2
  113 passed (8.5m)                                  E2E_EXIT 0
git status --short → (empty)
```

### V.5 Performance proxies (check 4)

Draw calls / triangles per frame (`renderer.info`, whole frame incl. shadow + post passes; GL
wrapper agrees), 1920×1080:

| Sim               | base calls / tris | alta calls / tris | alta passes           |
| ----------------- | ----------------- | ----------------- | --------------------- |
| faraday           | 41 / 19,7 k       | 89 / 182 k        | render, bloom, output |
| lenz              | 41 / 11,9 k       | 90 / 76 k         | idem                  |
| alternator-motor  | 79 / 29,3 k       | 166 / 221 k       | idem                  |
| rl-energy         | 34 / 56,0 k       | 75 / 180 k        | idem                  |
| joule-transformer | 82 / 40,2 k       | 170 / 171 k       | idem                  |
| kers-braking      | 90 (GL count)     | 183 (GL count)    | idem                  |
| car-dynamics      | 98 / 15,4 k       | 197 / 55 k        | idem                  |

≤ 200 calls and ≤ 0,23 M triangles per frame with 4× MSAA, bloom and a 2048 shadow map: well
inside an RTX 3060 Laptop budget at 1080p; nothing found that threatens 60 fps there. SwiftShader
rates (not representative): base 9–16 fps, alta 1,5–2 fps. Allocations: see QA-038 (139–244
KB/frame, sims' plots and ODE). Long tasks: on SwiftShader every frame is a long task, so the
proxy cannot isolate retraces; measured trace times 4,6–25 ms on the main thread (QA-041). Hidden
tab: 0 draw calls in 1 s for all 7 sims, resumes on visible.

### V.6 Leaks (check 5)

Route loops `#/sim/<id>` ↔ `#/teoria`: ×10 per sim in base (70 mounts), ×3 per sim in alta (21
mounts). After each sim: all foundation counters 0 (`liveStages, liveRenderers, liveComposers,
liveRenderTargets, livePmrem, liveMaterials, liveTextures, liveGeometries, liveWorkers`), 0
canvases, sim debug hooks unregistered, heap after GC 10–14 MB (no growth trend). e2e ×20 leak
tests also green.

### V.7 Visual review and interaction (checks 3, 6, 7)

56 sim screenshots (7 sims × alta/base × dark/light × 1920×1080/1280×720, alta after 10 s) plus
theory index, theory 06 and the sim index in both themes (`a11vis/shots/`), all read. No NaN
blots, no black/empty canvases, no z-fighting seen, no horizontal scroll anywhere, plots directly
under the scene at 1920×1080 (plots top 730–755 px, scene bottom 714–739 px). Problems: QA-031
(1280×720), QA-035 (bloom), QA-039 (HUD label), QA-043 (framing). Light "pale studio": readable;
field-line contrast is lowest in base light (1-px lines) but acceptable. Quality selector: keyboard
(arrows in the native radio group) switches base → alta live (no remount, 1 canvas), stored in
`localStorage` and kept after reload. "Ripristina vista" returns to the home view after an orbit
drag (visually identical). Orbit controls take no keyboard input (no focus trap; only the lenz
canvas is focusable by design and Tab leaves it after arrow keys). Reduced motion: every sim
starts paused ("Riprendi"), no intro flight, 0 draw calls while idle. axe (WCAG 2.0/2.1 A+AA):
0 violations on `#/teoria`, `#/sim` and the 7 sims × {base, alta} × {dark, light} at 1280×720;
the e2e sweep covers all 15 theory sections in both themes.

## Phase 4 round — v0.3.0 / v0.3.1 (Biot-Savart, PMSM d-q, car dynamics)

Date: 2026-10-28 · Base: `claude/new-session-u560qi` @ `8aa9aae` (v0.3.1) · Branch: `qa/A11-p4`.
Scope: everything changed since v0.2.0 (`a2e2fad..8aa9aae`): `src/physics/{biotSavart,pmsm,vehicle-dynamics}.ts`
and tests, the three new simulators, theory 15–17, the 9 new quiz questions and `src/quiz/{options,richText,sections}.ts`,
registry/i18n, plus a regression sweep of all 27 routes. Read-only on source; scripts, numbers and
screenshots in the scratchpad `a11p4/` (not committed).

### P4.1 Verdict

| Item                                                   | Result | Notes                                                                         |
| ------------------------------------------------------ | ------ | ----------------------------------------------------------------------------- |
| Physics `biotSavart.ts`                                | PASS   | formula, regularisation, Helmholtz, tracing re-derived; nit QA-023            |
| Physics `pmsm.ts`                                      | PASS   | Clarke/Park, torque, MTPA, ellipse, PI re-derived; nit QA-024                 |
| Physics `vehicle-dynamics.ts`                          | PASS   | Pacejka, load transfer, axle limits, D8 cap, energy re-derived; nit QA-029    |
| Physics coverage                                       | PASS   | 100 % stmts/funcs/lines, 99,2 % branches                                      |
| Sim `field-biot-savart`                                | PASS   | numbers match; worker terminated; nits QA-025, QA-030                         |
| Sim `pmsm-dq`                                          | PASS   | readouts recomputed by hand; axe 0                                            |
| Sim `car-dynamics`                                     | PASS   | 1,83 s / 93 m / 0,22 / 0,55 MJ reproduced independently; axe 0                |
| Theory 15 campo-biot-savart                            | PASS   | numbers, hedges, 6 headings, 4 Q&A                                            |
| Theory 16 pmsm-dq                                      | PASS   | numbers (180 N·m, 75,4 kW, 96,5 %, 5750 giri/min) verified                    |
| Theory 17 dinamica-frenata                             | FAIL   | **QA-020** axe serious violation at 1280×720; nit QA-026                      |
| Quiz additions (15–17)                                 | PASS   | 9 questions, answerable from theory, no duplicates, numbers consistent        |
| Registry / i18n / sim index                            | PASS   | 9 cards, sidebar and titles consistent                                        |
| Docs (PHYSICS §7–§9, OPEN_FACTS, CHANGELOG)            | PASS   | minor QA-022 (PHYSICS example numbers), nit QA-027                            |
| Regressions (6 Phase 1–3 sims, theory 01–14, quiz, CI) | PASS   | 0 axe / console / cross-origin findings; nit QA-028 (chunk-size warning back) |
| e2e coverage of the new pages                          | PASS   | 93/93 green, but gaps → minor QA-021                                          |

**Overall: FAIL** for v0.3.1 — one open major defect (QA-020: theory 17 fails the project's own
axe gate, D9 "zero violations", at the 1280×720 minimum resolution). It is a one-formula fix;
everything else passes. After QA-020 (and ideally QA-021/QA-022) the release can be re-marked PASS
without a full re-run (re-run the axe sweep of `#/teoria/17-dinamica-frenata` in both themes).

### P4.2 Defects

| ID     | Sev   | Owner           | File:line                                                                                                    | Defect                                                                                                                                                                                                                                                                                                                                                                                   | Evidence                                                                                                                                                                                                                                                                      | Suggested fix                                                                                                                                                                                                  |
| ------ | ----- | --------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| QA-020 | major | A2 (theory)     | `content/theory/17-dinamica-frenata.md:25`                                                                   | The third display formula (F_MGU-K = min(…) together with the energy balance on one line) is 673 px wide in a 672 px column at 1280×720: the `.math-display` becomes a horizontal scroll region that is not keyboard-focusable → axe **serious** `scrollable-region-focusable` (WCAG 2.1.1) in dark and light. The last term E_aero touches the column edge. Not caught by e2e (QA-021). | Own axe sweep: `serious scrollable-region-focusable x1 .math-display:nth-child(9)` on `#/teoria/17-dinamica-frenata`, both themes; `scrollWidth 673 > clientWidth 672` (none at 1440/1920; theory 01–16 clean). Screenshot `a11p4/shots/t-17-dinamica-frenata-dark-full.png`. | Split into two `$$…$$` (MGU-K force; energy balance). Optionally make the renderer give overflowing `.math-display` `tabindex="0"` + `role="region"`/`aria-label`, and add theory 15–17 to `e2e/a11y.spec.ts`. |
| QA-021 | minor | A3 / sim owners | `e2e/a11y.spec.ts:11-13`; `e2e/sims/pmsm-dq.spec.ts:253-256`; `e2e/sims/car-dynamics.spec.ts:228-243`        | e2e gaps: the route-level axe spec covers only `#/teoria`, theory 03 and 14 (so QA-020 slipped through); the `pmsm-dq` and `car-dynamics` axe tests fail only on serious/critical, weaker than the D9 gate (zero violations) used by every other sim.                                                                                                                                    | Code reading; e2e 93/93 green while QA-020 exists. (Today both sims have 0 violations in my sweep, so the gate is not currently masking anything.)                                                                                                                            | Add `#/teoria/15…17` (or all theory routes) to `a11y.spec.ts`; assert `violations` is `[]` in the two sim specs.                                                                                               |
| QA-022 | minor | A1 (docs)       | `docs/PHYSICS.md:303-304`                                                                                    | PMSM envelope example: "base speed ≈ 6130 giri/min (≈ 144 kW)" and "power ≈ 185–199 kW between 2 and 3,2 × base". With the code and by hand: 229,33 N·m × 641,73 rad/s = **147,2 kW** at base; 191,3 kW at 2× and 198,6 kW at 3,2×.                                                                                                                                                      | `a11p4/nums.ts`: base 641,734 rad/s = 6128 giri/min, T 229,33 N·m; 1,5×: 181,4 kW; 2×: 191,3; 2,5×: 195,7; 3×: 198,0; 3,2×: 198,6. Brute-force grid at 2,5× base: 121,85 N·m vs 122,0 (code).                                                                                 | "≈ 147 kW"; "≈ 191–199 kW".                                                                                                                                                                                    |
| QA-023 | nit   | A1 / sim owner  | `docs/PHYSICS.md:242`; `src/sims/field-biot-savart/model.ts:12`                                              | "Field lines are traced in the meridian plane x = 0": true for loop and Helmholtz (drift < 1e-16 m) but not for the solenoid — the helix carries a net current I along z, whose azimuthal field moves the lines out of the plane by up to 11,8 mm (0,39 R) at the defaults. The 3D drawing is correct (real 3D polylines); only the wording is inaccurate.                               | `a11p4/biot.ts`: max \|x\| of solenoid lines 0,01176 m; loop 1,3e-17, Helmholtz 5,6e-18.                                                                                                                                                                                      | Say "seeded in the plane x = 0 (the helix's axial current makes solenoid lines leave it slightly)".                                                                                                            |
| QA-024 | nit   | A1              | `src/physics/pmsm.ts:497-499` (`pmsmMtpa`)                                                                   | ψₘ = 0 is accepted (`nonNegative`) but with ψₘ = 0 and L_d = L_q the closed form is 0/0 → `{ id: NaN, iq: NaN }` (and `pmsmBaseSpeed`/`pmsmMaxTorque` inherit it). Not reachable from the sim presets.                                                                                                                                                                                   | `pmsmMtpa(100, {Rs:0.02, Ld:1e-4, Lq:1e-4, psiM:0, p:4})` → NaN.                                                                                                                                                                                                              | `if (dL === 0) return { id: 0, iq: ±I }` (any split gives T = 0), or require ψₘ > 0; add a test.                                                                                                               |
| QA-025 | nit   | sim owner       | `src/sims/field-biot-savart/params.ts:32`; `src/sims/kers-braking/model.ts:127` (also shown by car-dynamics) | Italian: slider scale reads "1 spire" (QA-016 fixed the same in faraday/lenz to "1 spira"); preset source label uses straight quotes `"7 things …"`.                                                                                                                                                                                                                                     | Rendered scale: `1 spire \| 80 spire`; screenshot `s-car-dynamics-light.png` (preset sources).                                                                                                                                                                                | Singular unit for value 1 as in faraday/lenz; « » or “ ” in the label.                                                                                                                                         |
| QA-026 | nit   | A2 / sim owner  | `content/theory/17-dinamica-frenata.md:25`; car-dynamics formula panel                                       | Word subscripts in math italic: `E_{freni}`, `E_{aero}`, `F_{x,post}`, `E_{batt}`, `P_{batt}` render as italic letter products; the rest of the project uses `\text{}` (e.g. `B_{\text{rif}}`, `P_{\text{Cu}}`). Inline `($\Delta F_z = F_x h/L$)` in Spiegazione wraps right after "(".                                                                                                 | Screenshot `t-17-dinamica-frenata-dark-full.png`, car-dynamics formula panel.                                                                                                                                                                                                 | `E_{\text{freni}}`, `F_{x,\text{post}}`, …; keep the parenthesis with the formula (non-breaking or rephrase).                                                                                                  |
| QA-027 | nit   | A2              | `docs/OPEN_FACTS.md:16, 20, 23`                                                                              | "Where used" not updated for Phase 4: #1 and #5 (120 / 350 kW) are now also used in theory 17 and the car-dynamics presets; #8 (MGU-K machine type) in 15, 16 and the pmsm-dq note.                                                                                                                                                                                                      | grep of content/ and src/sims/.                                                                                                                                                                                                                                               | Add 15/16/17 and the sims to the column.                                                                                                                                                                       |
| QA-028 | nit   | A10             | build output                                                                                                 | `npm run build` again prints Vite's "Some chunks are larger than 500 kB" warning: `three.module` 511,43 kB (496,51 kB without warning at v0.2.0), as the new scenes use more of Three.js. Lazy-loaded, so no first-load impact.                                                                                                                                                          | `a11p4/gate.log`.                                                                                                                                                                                                                                                             | Accept and set `build.chunkSizeWarningLimit` with a comment, or split via `manualChunks`.                                                                                                                      |
| QA-029 | nit   | sim owner       | `src/sims/car-dynamics/model.ts:76`                                                                          | η slider goes down to 0. With η = 0 the D8 cap Pₘₐₓ/η is infinite: the MGU-K takes the whole rear-axle force (0,94 MJ at the defaults), stores 0 and the bar shows it all as "Perdite MGU-K". Consistent with `kersBrakingEvent` (D8) but physically meaningless.                                                                                                                        | `simulateBrakingZone({…, eta: 0})`: eMguk 0,940 MJ, eStored 0, eBrakes 1,298 MJ.                                                                                                                                                                                              | Slider min 0,5 (or treat η = 0 as "MGU-K spenta") — also for kers-braking if wanted.                                                                                                                           |
| QA-030 | nit   | sim owner       | `src/sims/field-biot-savart/index.ts:198` (`mountBiot`)                                                      | No host-level idempotency guard (`mounted.get(host)?.dispose()`) unlike pmsm-dq, car-dynamics and alternator-motor: two `mount()` calls on the same host without `dispose()` would keep two Workers. The router always disposes, so no leak in practice.                                                                                                                                 | Browser: 11 route cycles → 22 worker `open`/`close` events balanced, 0 workers alive afterwards; e2e ×20 leak test green.                                                                                                                                                     | Same `WeakMap` guard as the other Phase 4 sims.                                                                                                                                                                |

### P4.3 Physics audit (check 1)

**Biot-Savart.** `addSegmentField`: with c = L × r₁ (\|c\| = \|L\|d) and t₁ − t₂ = \|L\|(cos θ₁ − cos θ₂),
B = K I (t₁ − t₂) c / (\|c\|² + \|L\|² r_c²) = μ₀I/(4π) · (cos θ₁ − cos θ₂) · d/(d² + r_c²) · ĉ — the
textbook segment formula with d² → d² + r_c², direction dl × r̂. Correct. Helmholtz: two N-turn rings at
∓s/2 (s = R), same sense, lead up + lead back cancel; `nearWire` uses ±R/2, consistent. Tracing:
RK4 on B/\|B\| with arc-length step, close/bounds/nearWire/null stops sensible. Independent check
(own 80 000-element midpoint helix sum, not the project code): **0,82149 mT** at the centre vs code
0,82141 mT; ideal μ₀NI/l = **0,83776 mT**; current-sheet 0,82149 mT; Δ = −1,95 %;
L = μ₀N²πR²/l = **18,950 µH**. Loop centre 4,1891 mT vs μ₀NI/2R 4,1888; Helmholtz 5,9940 vs
(4/5)^{3/2}μ₀NI/R 5,9945 mT. End of the solenoid: 0,417 mT = 51 % (theory 15 ✓).

**PMSM.** Amplitude-invariant Clarke + Park verified numerically (balanced set X = 10 at θ = 0,7 →
d = 10, q = 0). Voltage equations, torque ½·3·p[ψi_q + (L_d − L_q)i_di_q], power balance and the
current derivatives are mutually consistent (v = R i + L di/dt + ω×ψ). MTPA closed form equals the
standard i_d = [ψ − √(ψ² + 8ΔL²I²)]/(4ΔL) after rationalising (−179,361 A both ways; also valid for
L_d > L_q). Voltage ellipse with R_s: exact inverse of A = [[R_s, −ωL_q],[ωL_d, R_s]]. Envelope logic
(MTPA if feasible, else best of circle ∩ ellipse boundaries, region = on-circle → field-weakening,
else MTPV) is sound; brute-force grid at 2,5× base agrees within the grid step. PI k_p = Lω_c,
k_i = R_sω_c gives a first-order loop ω_c/(s + ω_c) with decoupling — correct. Base speed
641,73 rad/s = 6128 giri/min, T = 229,33 N·m (QA-022 for the kW). Theory 16 example: 180 N·m,
75,40 kW, 2,70 kW, 96,5 %, SPM base speed 5751 giri/min — all ✓. Sim readouts at defaults
(I = 300 A MTPA, 4000 giri/min): i_d −117,2 A, i_q 276,2 A, T 161,7 N·m, 67,73 kW, P_Cu 2,70 kW — ✓.

**Vehicle dynamics.** Pacejka peak φ(Bκ*) = tan(π/2C) and inverse branch correct (φ monotone for
E < 1). Axle limits: front βF ≤ μ(F_zf0 + Fh/L), rear (1 − β)F ≤ μ(F_zr0 − Fh/L) → the two
denominators in the code ✓; β_id = w_f + μh/L ✓; drag at CoG height gives no extra pitch moment
(inertial − drag = F_x at height h) ✓. MGU-K: min(F_x,rear, (Pₘₐₓ/η)/v), stored = η·E_MGU-K — D8
consistent; `kersBrakingEvent` cross-check reproduced (0,2196 MJ at 1,83 s, 120 kW). End of zone:
bisection on the last RK4 step, v set to v₂ ✓. Energy balance error −1,1·10⁻¹². Independent
explicit integration (dt = 10⁻⁵ s, own formulas): **1,8290 s, 93,41 m; 120 kW: 0,2195 MJ stored,
1,994 MJ brakes, 0,231 MJ aero; 350 kW: 0,5498 MJ**, rear-axle-limited below **167,4 km/h**; without
aero 3,562 s / 197,9 m — identical to the code and to PHYSICS §9 / theory 17. Peak deceleration
5,26 g at 300 km/h (ClA 3,5 m², μ 1,6) → 2,0 g at 100 km/h: plausible for a high-downforce single
seater (commonly reported 5–6 g) and labelled illustrative in the sim ("Dati fissi della vettura
(illustrativi)", preset note); no change needed.

### P4.4 Theory and quiz (checks 2, 4, 5)

- KaTeX checker: 17 files, 487 formulas, **0 errors**; 15/16/17: 526/431/449 words, 4 Q&A each, six
  headings in order. MGU-K machine type hedged with `[DA VERIFICARE]` in 15 and 16; 17 cites the
  120/350 kW values with the same FIA/formula1.com sources as theory 10; all other F1-like numbers
  are stated as illustrative. No unsourced regulation figures.
- Consistency theory ↔ sim ↔ PHYSICS: 0,8378 / 0,8214 mT, −1,95 %, 18,95 µH (15 = sim readouts);
  1,83 s, 93 m, 0,22 MJ (≈ 9 %), 1,99 / 0,23 / 0,02 MJ, 0,55 vs 0,64 MJ, 167 km/h (17 = sim table);
  notation C_x A / C_z A in theory 17 matches the sim labels (PHYSICS uses C_dA/C_lA, documented in
  `model.ts`).
- Italian: decimal commas, spaced units, typographic apostrophes and Unicode subscripts (Pₘₐₓ, v₁,
  ωₑψₘ) correct in theory 15–17, quiz additions and the three sims; only QA-025/QA-026.
- Quiz: 82 items (73 + 9: 3 per section 15/16/17), each answerable from its theory page, no
  duplicate ids or prompts, numbers (0,84 mT, −1,95 %, 51 %) consistent; options with formulas get a
  plain-text `aria-label` (`options.ts`) — axe 0 on the quiz page.

### P4.5 Runs (check 3)

```
npm ci                  → ok
npm run lint            → clean
npm run format:check    → All matched files use Prettier code style!
npm run typecheck       → clean
npm test                → Test Files 49 passed (49) · Tests 681 passed (681)
npm run build           → ✓ built in 4.48s (warning: three.module 511.43 kB > 500 kB, QA-028)
vitest tests/physics --coverage → 100 % stmts · 99.2 % branch · 100 % funcs · 100 % lines
                          (pmsm.ts branch 99.1 %, vehicle-dynamics.ts 97.93 %)
PW_PORT=4520 … npm run e2e -- --workers=2 → 93 passed (4.2m)
git status --short (after e2e) → empty
```

Own sweep on the production preview (1280×720, 27 routes × dark + light, 54 viewport + 16 full-page
screenshots in `a11p4/shots/`): horizontal page scroll 0 everywhere; axe WCAG 2.0/2.1 A+AA 0
violations on 52/54 (the 2 = QA-020); **0** cross-origin requests; **0** console errors/warnings and
page errors. Canvases non-empty on all 9 sims (scene 510×446 + plots). Web Worker: 22 `open`/`close`
events balanced over 11 visits to `field-biot-savart`, 0 workers alive after leaving. Render loop:
rAF calls per second visible / hidden / visible again = biot 55/0/57, pmsm 94/0/93, car 102/0/89.
JS heap after GC: 8,76 → 9,60 MB after 60 mounts of the new sims (no growth trend); e2e ×20 leak
tests: GPU geometries/programs constant (pmsm 8/1, car 23/4), biot worker count 1. Informative
headless fps (SwiftShader): biot 31, pmsm 30, car 47. Visual review (both themes) of the three sims,
theory 15–17, the sim index (9 cards) and the quiz: no overlaps, clipping or empty canvases; only
QA-020 (formula touching the edge) and the QA-025/026 typography nits.

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
