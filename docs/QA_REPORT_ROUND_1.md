# QA report — v0.7.0 / fix round 1

Date: 2026-11-01. Local checkout of Chip-jpg/MGUK-KERS-Simulator.

## Scope and interpretation

F1–F10 are implemented. The target version is 0.7.0, superseding the supplied
0.2.0 document. This report records automated tests and source review by the
implementation agent; it is not a claim of an independent human/agent review.
A separate GitHub CI runner verifies the submitted branch.

The original analytical braking UI remains a selectable comparison inside
kers-drive; its presets, equations and controls remain usable. The old URL
redirects. The Pacejka vehicle core, existing electromagnetic functions and
RL/thermal integrators remain unchanged. The optional car-dynamics module gains
telemetry and a link to longitudinal acceleration; its tyre/braking model is
preserved. Quiz features removed in v0.5.0 are not recreated.

F8 means only removal of the moving bar on rails from Faraday. B·l·v remains
in theory and in the reusable physics library. Flux is per turn (BS), as the
existing app specifies, rather than silently changing it to linkage (NBS).

## Acceptance evidence

| Fix | Functional result | Evidence                                                                                                                                                                                          |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | PASS              | kers-drive guided acceleration/braking, reverse energy ribbons, original comparison preserved; drive physics acceleration/harvest tests and legacy route e2e                                      |
| F2  | PASS              | Shared telemetry in guided drive, manual drive, analytical comparison and car-dynamics; signed a in m/s² and g, signed mechanical MGU-K power, discs, SoC, linked scrolling x axes                |
| F3  | PASS              | Keyboard ramp, mouse/touch range inputs, brake priority, released pedals on blur/hidden, guided scenario; e2e reaches 100 km/h and 2.4691358 MJ with <10 J total-ledger residual                  |
| F4  | PASS              | Five-second bounding-box recordings for all eight simulators with a parameter change; exactly 0 px movement/resize. Numeric scene sensors remain reserved when an arrow becomes inactive          |
| F5  | PASS              | Full-container enter/exit for every simulator, aria state and renderer aspect checked; F/P keyboard tests in both themes; ResizeObservers retained and no remount                                 |
| F6  | PASS              | Explicit labelled ticks, finite ranges, analytical Faraday bounds and zero B/ω cases; all sliders/all plots sweep; trace change marked and range interpolation 200 ms                             |
| F7  | PASS, functional  | 144 Hz injected clock renders every rAF; fixed-step physics and visibility/guard tests; 30 FPS rounded-timestamp regression and persisted browser cap. Real GPU ≥60 fps floor is UNVERIFIED       |
| F8  | PASS              | Rotating-only Faraday UI, removal of moving-bar geometry/sliders/formulas/model tests; reusable motional-emf physics retained                                                                     |
| F9  | PASS              | Finite battery energy, power/efficiency/Joule limits, cutoff, coast and 5 % hysteresis; model regression exhausts the store, browser 1 %-to-zero/restart/recharge check                           |
| F10 | PASS              | Exact log x domain 1–400 kV, linked loss/current/percentage views, selected R/P views, operating points, original bars/equation and chain references; three independently hand-derived sets below |

The analytical comparison and unchanged Pacejka model show an explicitly
illustrative virtual SoC (recovered energy / 4 MJ, initially empty), retaining
their imposed braking. The new drive models enforce the actual shared finite
battery constraints. Drive capacity 4 MJ and rotor capacity 5 kJ are illustrative,
not new regulation claims.

## Verification record

- Baseline: install, lint, typecheck, 533 unit tests and production build pass.
- Initial new acceptance run: 11/13 pass. It exposed a single zero-signal axis
  tick and disappearing force sensors; explicit tick generation and reserved
  inactive sensor slots fixed both, then the targeted tests passed.
- Expanded audit: all eight slider sweeps and 20 mount/unmount cycles per module
  pass; all foundation live-resource counters return to zero. After GC, retained
  JS heap change from cycle 5 to 20 was bounded below 0.9 MB (not a claim of zero
  VM cache variation). Existing GPU/resource regression tests remain enabled.
- Keyboard/theme harness was corrected to unmount between cases and switch the
  actual app theme; F/P and axe checks then passed in dark and light.
- First cap benchmark detected early rAF timestamp rounding causing duplicate
  draws near a cap deadline; advancing the deadline fixed the defect. The
  final numbers below come from the corrected scheduler.
- Final full unit/coverage, lint, typecheck, format and browser suite: recorded
  in the final verification section before publication.

## Measured FPS

Chromium 153, Playwright headless, base graphics, 1280×720, one worker/browser,
1 s warm-up and 3 s per cap per simulator. FPS is measured from actual simulation
render intervals; 1 % low is 1000 divided by the mean of the slowest 1 % intervals.
Raw samples: [measurement data](media/v0.7.0-performance.json).
These short default-scene samples are not a thermal-soak test or a measurement
on the physical monitor/GPU. They do not establish the ≥60 fps target floor.
Automatic mode removes the application cap; browsers remain constrained by the
display/browser refresh policy and GPU. High-refresh scheduling is additionally
verified with a deterministic 144 Hz injected clock. Native desktop/fullscreen
and laptop thermal throttling were not measured in this session.

| Simulatore        | Automatico: media / 1 % min | Limite 60: media / 1 % min | Limite 30: media / 1 % min |
| ----------------- | --------------------------- | -------------------------- | -------------------------- |
| faraday           | 49,4 / 29,9                 | 47,7 / 29,9                | 30,2 / 29,9                |
| lenz              | 49,6 / 29,9                 | 50,1 / 29,9                | 30,2 / 29,9                |
| alternator-motor  | 36,9 / 20,0                 | 35,4 / 24,0                | 30,0 / 20,0                |
| kers-drive        | 34,2 / 20,0                 | 36,2 / 24,0                | 30,0 / 20,0                |
| joule-transformer | 39,6 / 24,0                 | 39,2 / 29,9                | 30,0 / 20,0                |
| rl-energy         | 38,1 / 29,9                 | 38,3 / 29,9                | 30,0 / 29,9                |
| car-dynamics      | 32,4 / 29,9                 | 31,6 / 20,0                | 29,8 / 20,0                |
| drive-sim         | 32,8 / 20,0                 | 35,1 / 24,0                | 30,0 / 20,0                |

## Transformer hand checks

V₂=V₁N₂/N₁, with V₁=20 kV and N₁=100 in all three sets:

| P     | R    | N₂   | V₂     | I=P/V₂ | Loss=RI² | Loss/P     |
| ----- | ---- | ---- | ------ | ------ | -------- | ---------- |
| 10 MW | 5 Ω  | 1000 | 200 kV | 50 A   | 12500 W  | 0.125 %    |
| 20 MW | 10 Ω | 500  | 100 kV | 200 A  | 400000 W | 2 %        |
| 1 MW  | 1 Ω  | 2000 | 400 kV | 2.5 A  | 6.25 W   | 0.000625 % |

At 10× voltage each current is divided by 10 and each nonzero loss by 100.
The 380 V / 220 V teaching-chain values lie below the plotted 1 kV endpoint and
are labelled as such. Values where the simplified line loss exceeds 100 % are
outside the model's validity.

## Visual evidence

- [Final drive, dark](media/v0.7.0-drive-sim-dark.png), [light](media/v0.7.0-drive-sim-light.png)
- [Transformer, dark](media/v0.7.0-joule-transformer-dark.png), [light](media/v0.7.0-joule-transformer-light.png)
- [Extended plots, dark](media/v0.7.0-transformer-plots-dark.png), [light](media/v0.7.0-transformer-plots-light.png)

Primary drive pedals and the scenario button are visible at 1280×720; the full
simulator and remaining plots/controls scroll in fullscreen. Presentation mode
increases plot axis typography and stroke widths as well as page text.

## Open facts and deliberate limits

No new unverified regulatory data were introduced. Existing OPEN_FACTS items
remain open: 2026 per-lap recovery figures, precise MGU-K machine topology,
Agenda 2030 quotation punctuation and the historical usable battery capacity.
The educational capacity in the new model is explicitly labelled illustrative.
Gamepad triggers were optional and are not implemented. This is a one-dimensional
educational drive, not a lap-time simulation. Presentation notes are untouched.

## Final verification

- `npm run lint`: PASS; `npm run typecheck`: PASS; `npm run format:check`: PASS.
- Production Vite build: PASS (also rebuilt by each Playwright webServer run).
- Unit/coverage suite: **550 tests, 57 files, all PASS**. Battery line coverage
  100 %; longitudinal drive line coverage 98.56 %.
- Browser regression: **154 active tests PASS, one opt-in benchmark skipped**.
  The full final run passed 153 tests and found one obsolete theory-only link
  assertion. That assertion now also validates simulator links against the
  actual sidebar; all nine shell tests passed on the follow-up run. No product
  source changed for this correction. The separate measured-FPS run also passed.
- The battery browser check was strengthened to drain from 1 % to cutoff;
  this follow-up passed, including restart and recharge.
- All eight five-second sensor recordings (including parameter edits), all
  eight 20-cycle resource audits, 16 scene-layout cases, dark/light axe checks,
  fullscreen and keyboard checks passed.
- `git diff --check`: PASS. Windows checkout CRLF was normalized to the existing
  Prettier LF convention without semantic edits to unrelated files.
- GitHub CI is required to pass on the submitted branch before merging/tagging;
  workflow status is available on the release PR and repository Actions page.

## Linux runner follow-up

The first GitHub run passed 153 browser tests and found one platform-sensitive
scene-coverage failure: the car-dynamics HUD/legend occupied 15.10 % of the
1920×1080 scene, exceeding the unchanged 15 % limit. Numeric HUD rows now
reserve 1.1 rem rather than 1.2 rem; text size, fixed width and all readout
positions remain stable. The five-second sensor/fullscreen case and both
car-dynamics scene-layout cases passed again locally.

The full browser job took 17.2 minutes on the Linux runner, close to its
20-minute limit. CI now runs four native Playwright shards with two workers
each and distinct failure artifacts. Test discovery confirms 39 + 39 + 39 + 38
= 155 cases (154 active plus the opt-in benchmark). No tests or thresholds
were removed or relaxed.
