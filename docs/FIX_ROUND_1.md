# Fix round 1 — v0.7.0

## Baseline (2026-11-01)

Clean `main`, package version 0.6.0. `npm ci`, lint, typecheck, 533 unit tests
and production build pass. esbuild/Node subprocesses require execution outside
the Windows sandbox. No dependencies are upgraded for this round.

## Existing simulators and impact

| ID                | Files under `src/sims/<id>/`                      | Existing behaviour                                    | Fixes         |
| ----------------- | ------------------------------------------------- | ----------------------------------------------------- | ------------- |
| faraday           | index, model, panel, scene, format                | Rotating coil and moving bar, flux/emf traces         | F4–F8         |
| lenz              | index, model, params, status, scene, lenz.css     | Moving magnet, induction and opposing force           | F4–F7         |
| alternator-motor  | index, model, panel, constants, scene, style      | Bidirectional rotor, decorative SoC without cutoff    | F1, F4–F7, F9 |
| kers-braking      | index, model, panel, scene, style                 | Constant-deceleration event, power-limited harvesting | F1, F2, F4–F7 |
| joule-transformer | index, model, panel, params, scene, visual, style | Ideal transformer, line loss comparison, thermal line | F4–F7, F10    |
| rl-energy         | index, model, panel, params, scene, visual, style | RL transient, magnetic energy, heat                   | F4–F7         |
| car-dynamics      | index, model, panel, forces, scene, style         | Pacejka braking, downforce, axle loads, disc heat     | F2, F4–F7     |

Extensions in this round: pure battery and longitudinal physics in `src/physics/`;
shared readouts/fullscreen/telemetry/ranges in `src/ui/`; frame scheduling in
`src/core/loop.ts`; `kers-drive` and final interactive `drive-sim`; registry,
router, Italian metadata, theory links, documentation and release versions.

## Plan and boundaries

1. Shared battery/vehicle physics and UI contracts with focused tests.
2. Migrate existing simulators; keep `car-dynamics` Pacejka physics unchanged.
3. Add drive simulation, theory updates, browser acceptance and release checks.

The user authorizes implementation choices and sets the target to **v0.7.0**.
Existing exported electromagnetic/vehicle helpers remain compatible. Old braking
analytical helpers remain available for comparison and existing consumers.

## Differences from the supplied document

The project uses vanilla TypeScript, Three.js and uPlot; seven simulators exist.
There is no DESIGN.md yet, no quiz content and no presentation mode (quiz was
intentionally removed in v0.5.0). Do not restore quiz. The extra car-dynamics
module also needs live telemetry. Styles live under `src/styles/`, not ui/tokens.
Faraday flux is explicitly **per turn**, so its amplitude is B·S, while emf is
N·B·S·ω; retain this distinction. F8 refers to the moving-bar experiment only.

## Initial defect evidence

- F4: `formulaPanel.ts` creates inline spans sized by changing formatted text;
  projected labels in `render/labels.ts` remeasure text and recalculate collisions.
- F6: the shared plot wrapper delegates all automatic ranges to uPlot, without
  a finite non-degenerate fallback; Faraday only recreates scales when SI display
  prefixes change. There is no analytical amplitude range contract.
- F9: alternator `physicsStep()` unconditionally calls `modelStep()` before
  clamping SoC; `instant('motor', ...)` is independent of SoC. Battery exhaustion
  cannot disable torque. Regression scenarios will exercise these public effects.

Live browser evidence and final check results belong in QA_REPORT_ROUND_1.md.

## Completion

F1–F10 functional acceptance and retained-core regressions are recorded in
[QA_REPORT_ROUND_1.md](QA_REPORT_ROUND_1.md): 550 unit tests, all 154 active
browser cases passing across the final run plus the focused navigation fix.
The opt-in benchmark was run separately for all eight modules and all caps.
Physical-monitor/GPU high-refresh throughput and native thermal behaviour
remain explicitly unmeasured; no claim of a measured ≥60 fps GPU floor is made.
