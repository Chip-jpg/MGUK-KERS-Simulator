# PHYSICS — formula ↔ slide map

Reference for `src/physics/**` (task A1). Everything is SI internally (T, m, m², rad/s,
V, A, Ω, H, J, W, kg, m/s); degrees and km/h exist only at the UI boundary through
`degToRad` / `radToDeg` / `kmhToMs` / `msToKmh`. All functions are pure (no global
state, no clocks, no DOM — enforced by ESLint on `src/physics/**`).

Slide numbers refer to the teacher's deck _"L'induzione elettromagnetica"_ (23 slides).
`none (extension)` marks physics that the app needs but the deck does not contain.

**Error policy.** Invalid inputs throw `RangeError` with the function and parameter
name (non-finite numbers, negative lengths/areas/turns/resistances, zero
denominators). Results never return `−0` (normalised to `+0`).

## 1. Function table

| Function                                 | Formula                                                                       | Slide                                                                       | Units (in → out)              | Validity limits / notes                                                                                                                                                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fluxUniform(B, S, alphaRad)`            | $\Phi_B = B\,S\cos\alpha$                                                     | 7                                                                           | T, m², rad → Wb               | Uniform B, flat surface. α = angle between B and normal n̂. S ≥ 0.                                                                                                                                                |
| `emfFaraday(dPhi, dt, N = 1)`            | $\text{f.e.m.} = -N\,\Delta\Phi_B/\Delta t$                                   | 8                                                                           | Wb, s, – → V                  | Average emf over Δt. **Δt ≤ 0 ⇒ RangeError** (Δt = 0 included). N ≥ 0.                                                                                                                                           |
| `emfMotional(B, l, v)`                   | $\text{f.e.m.} = B\,l\,v$                                                     | 8                                                                           | T, m, m/s → V                 | B ⟂ l ⟂ v, uniform B. Signed with B·v. l ≥ 0.                                                                                                                                                                    |
| `rotatingLoop(B, S, N, omega, t)`        | $\Phi=BS\cos\omega t$, $\text{f.e.m.}=NBS\omega\sin\omega t$, $V_0=NBS\omega$ | 18, 19                                                                      | T, m², –, rad/s, s → Wb, V, V | Single-phase loop, uniform B, constant ω, α(0) = 0. `phi` is per turn; `emf` is the whole coil. `V0` is signed so that `emf = V0·sin ωt` always holds; peak = \|V0\|. Simplified model of the three-phase MGU-K. |
| `inducedCurrent(emf, R)`                 | $i = \text{f.e.m.}/R = -\frac{1}{R}\frac{\Delta\Phi}{\Delta t}$               | 9                                                                           | V, Ω → A                      | Ohm's law, self-inductance of the loop neglected. **R ≤ 0 ⇒ RangeError** (R = 0 included).                                                                                                                       |
| `lenzSign(dPhiDt)`                       | $\operatorname{sign}(i) = -\operatorname{sign}(d\Phi/dt)$                     | 11                                                                          | Wb/s → {−1, 0, 1}             | Orientation convention in §2. NaN ⇒ RangeError; ±∞ allowed.                                                                                                                                                      |
| `solenoidInductance(N, S, l, mu = MU_0)` | $L = \mu N^2 S / l$                                                           | 14                                                                          | –, m², m, H/m → H             | Long solenoid (l ≫ diameter), uniform internal field, no fringe field, linear core (no saturation, μ constant). l > 0, μ > 0.                                                                                    |
| `emfSelf(L, dIdt)`                       | $\text{f.e.m.} = -L\,di/dt$                                                   | 13                                                                          | H, A/s → V                    | Constant L. L ≥ 0.                                                                                                                                                                                               |
| `rlTimeConstant(R, L)` _(added)_         | $\tau = L/R$                                                                  | 15                                                                          | Ω, H → s                      | R > 0.                                                                                                                                                                                                           |
| `rlCurrent(emfDC, R, L, t)`              | $i(t) = I_0\,(1-e^{-Rt/L})$, $I_0 = \text{f.e.m.}/R$                          | 15                                                                          | V, Ω, H, s → A                | Switch closed at t = 0, i(0) = 0, ideal DC source. t < 0 ⇒ 0. **R = 0 ⇒ exact limit i = f.e.m.·t/L.** L > 0. Uses `expm1` for small Rt/L.                                                                        |
| `magneticEnergy(L, I)`                   | $U_M = \tfrac12 L I^2$                                                        | 17                                                                          | H, A → J                      | Linear inductor (no saturation). L ≥ 0.                                                                                                                                                                          |
| `transformerSecondary(V1, N1, N2)`       | $\Delta V_1/\Delta V_2 = N_1/N_2 \Rightarrow V_2 = V_1 N_2/N_1$               | 20                                                                          | V, –, – → V                   | **Ideal transformer**: no winding resistance, no leakage flux, no core losses, no saturation. N1, N2 > 0.                                                                                                        |
| `transformerCurrent(I1, N1, N2)`         | $I_2 = I_1 N_1/N_2$ (so $V_1I_1 = V_2I_2$)                                    | 20                                                                          | A, –, – → A                   | Ideal transformer; the current ratio follows from power conservation (not written on slide 20).                                                                                                                  |
| `jouleLoss(R, I)`                        | $P = R\,I^2$                                                                  | 16                                                                          | Ω, A → W                      | The $R i^2$ term of the slide-16 energy balance. R ≥ 0.                                                                                                                                                          |
| `lineLoss(P, V, Rline)`                  | $I = P/V$, $P_{loss} = R I^2$, $\text{fraction} = P_{loss}/P$                 | 23 (21–23)                                                                  | W, V, Ω → A, W, –             | Purely resistive line, power factor 1, single-phase equivalent. V > 0. P = 0 ⇒ fraction 0. fraction > 1 ⇒ outside model.                                                                                         |
| `lorentzForce(B, I, L, theta = π/2)`     | $F = B\,I\,L\sin\theta$                                                       | none (extension: inverse principle of induction, from the assignment sheet) | T, A, m, rad → N              | Straight wire, uniform B. Signed; direction by the right-hand rule on $\vec L\times\vec B$.                                                                                                                      |
| `kineticEnergyDelta(m, v1, v2)`          | $\Delta E_k = \tfrac12 m (v_1^2 - v_2^2)$                                     | none (extension: mechanics)                                                 | kg, m/s, m/s → J              | Point mass, translational KE only (wheel rotational inertia ignored). Negative if speeding up.                                                                                                                   |
| `kersBrakingEvent(p)`                    | see §4                                                                        | none (extension: KERS model; builds on 16–17 and 18–19)                     | see §4                        | see §4                                                                                                                                                                                                           |
| `kersDissipationSplit(r)` _(added)_      | brakes $= \Delta E_k - E_{rec}$, mguk $= E_{rec} - E_{el}$                    | none (extension)                                                            | J → J                         | Splits `dissipated` of a `kersBrakingEvent` result.                                                                                                                                                              |
| `rk4Step(f, t, y, dt)`                   | classical RK4 (see TSDoc)                                                     | none (extension: numerical method)                                          | –                             | Global error O(dt⁴). Pure; dt = 0 returns a copy; dt < 0 integrates backwards.                                                                                                                                   |

Constants and helpers: `PHYSICS_DT = 1/240 s`; `MU_0`; `MU_0_SI2019`; `KERS_TRACE_SAMPLES = 201`;
`kmhToMs`, `msToKmh`, `degToRad`, `radToDeg`.

### μ₀ choice

`MU_0 = 4π·10⁻⁷ H/m` — the value used in the slides (slide 14) and exact in the pre-2019
SI. Since the 2019 SI redefinition μ₀ is measured: `MU_0_SI2019 = 1.25663706212·10⁻⁶ H/m`
(CODATA 2018). Relative difference ≈ 5.5·10⁻¹⁰, invisible at any UI precision; the slide
value is kept so that numbers match the student's notebook exactly.

### Slide references vs. A0's D7 guesses

| Function             | A0 stub | A1 final                                                                           |
| -------------------- | ------- | ---------------------------------------------------------------------------------- |
| `jouleLoss`          | 16      | **16** (confirmed: $R i^2 \Delta t$ term of the energy balance)                    |
| `lineLoss`           | 22, 23  | **23** (transport chain, slides 21–23 group; 22 is plants renewable/non-renewable) |
| `transformerCurrent` | 20      | **20** (ratio from power conservation, not printed on the slide)                   |
| `lorentzForce`       | none    | **none (extension)** — confirmed                                                   |
| `kineticEnergyDelta` | none    | **none (extension)** — confirmed                                                   |
| `kersBrakingEvent`   | 16, 17  | **none (extension)**, builds on 16–17 (energy balance) and 18–19 (alternator)      |

The KERS topic as a whole (sim `kers-braking` and theory `10-kers-mguk`) shows the
slide chips **[16, 17, 18, 19]** — energy balance and alternator — aligned in QA round 1
(QA-013); Faraday-Neumann (8) and Lenz (11) are reached through theories 03 and 04.

Slide numbers were derived from the slide summary in the project brief, not from the
deck file itself (not in the repo). Exact numbering of slides 21–23 should be checked
against the deck by QA (A11).

## 2. Sign and orientation conventions

- Every circuit has a chosen unit normal **n̂**. Φ is measured along n̂ (α = angle
  between B and n̂).
- An emf / current is **positive** when it circulates counter-clockwise seen from the
  tip of n̂ (right-hand rule: a positive current produces a field along +n̂).
- With this convention Faraday-Neumann reads f.e.m. = −N dΦ/dt, and Lenz is
  `lenzSign(dΦ/dt) = −sign(dΦ/dt)`:
  - `−1` ⇒ induced current clockwise, its field points along −n̂ (Φ was increasing);
  - `+1` ⇒ counter-clockwise, field along +n̂ (Φ was decreasing);
  - `0` ⇒ no variation, no induced current.
- Magnet example (slide 11), n̂ chosen along the field a N pole produces at the coil:
  N approaching → −1 (coil face becomes N, repels); N leaving → +1 (attracts);
  S approaching → +1; S leaving → −1. Tested in `tests/physics/flux.test.ts`.
- `rotatingLoop`: α(t) = ωt, so Φ is maximum at t = 0 and the emf leads by a quarter
  period; `emf = −N·dΦ/dt` is verified numerically by a property test.
- `emfSelf` = −L di/dt opposes the current change (Lenz applied to self-induction).

## 3. Edge cases (defined and tested)

| Case                               | Behaviour                                                                                                                         |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `inducedCurrent` with R = 0        | `RangeError` — a zero-resistance loop is outside the Ohm's-law model (current limited by L).                                      |
| `emfFaraday` with Δt = 0 (or < 0)  | `RangeError`.                                                                                                                     |
| `rlCurrent` with R = 0             | exact limit i(t) = f.e.m.·t/L (continuous with R → 0⁺).                                                                           |
| `rlCurrent` with t < 0             | 0 (switch still open).                                                                                                            |
| `kersBrakingEvent` with v₁ < v₂    | not a braking event: `dEk` reported (negative), all energies, `timeToRecoverAtPmax` and the trace are 0.                          |
| `kersBrakingEvent` with v₁ = v₂    | everything 0.                                                                                                                     |
| `kersBrakingEvent` with P_max = 0  | recoverable = recovered = 0, dissipated = ΔE_k (all in the discs), `timeToRecoverAtPmax = +∞`.                                    |
| `kersBrakingEvent` with P_max = +∞ | uncapped MGU-K; `timeToRecoverAtPmax = 0`.                                                                                        |
| `kersBrakingEvent` with η = 0      | limit η → 0⁺: the MGU-K absorbs the braking power (cap P_max/η = ∞) but stores nothing: recovered = 0, `timeToRecoverAtPmax = 0`. |
| `kersBrakingEvent` invalid inputs  | `RangeError` for m ≤ 0, v < 0, P_max < 0 or NaN, η ∉ [0, 1], t_brake ≤ 0, non-finite values.                                      |
| `lineLoss` with P = 0              | I = loss = fraction = 0.                                                                                                          |
| `rk4Step` with dt = 0              | returns a copy of y.                                                                                                              |

## 4. KERS / MGU-K braking model (`kersBrakingEvent`)

Inputs: `m` [kg], `v1`, `v2` [m/s], `Pmax` [W], `eta` [–], `tBrake` [s].

Assumptions (stated in the simulator's "Modello semplificato" note):

1. Straight-line braking with **constant deceleration** $a = (v_1 - v_2)/t_{brake}$.
   Drag, rolling resistance, tyre slip and wheel rotational inertia are ignored, so the
   whole ΔE_k must be removed by MGU-K + disc brakes.
2. Total braking power $P_b(t) = m\,a\,v(t)$ with $v(t) = v_1 - a t$ — linear in time,
   from $P_0 = m a v_1$ to $P_1 = m a v_2$; $\int_0^{t_{brake}} P_b\,dt = \Delta E_k$.
3. **`Pmax` is the electrical power cap of the MGU-K** (power delivered to the energy
   store — the quantity limited by the regulations), **η** is its mechanical → electrical
   efficiency. So the MGU-K can take at most $P_{cap} = P_{max}/\eta$ of mechanical power.
4. The MGU-K takes $P_{mguk}(t) = \min(P_b(t), P_{max}/\eta)$; the discs take the rest.

Outputs:

$$
\begin{aligned}
\Delta E_k &= \tfrac12 m (v_1^2 - v_2^2) \\
\text{recoverable} &= \int_0^{t_{brake}} \min\!\big(P_b(t),\,P_{max}/\eta\big)\,dt \quad\text{(mechanical energy into the MGU-K, closed form)}\\
\text{recovered} &= \eta\cdot\text{recoverable} \quad\text{(electrical energy stored)}\\
\text{dissipated} &= \Delta E_k - \text{recovered}
  = \underbrace{(\Delta E_k - \text{recoverable})}_{\text{disc brakes}}
  + \underbrace{(1-\eta)\,\text{recoverable}}_{\text{MGU-K / converter losses}}\\
\text{timeToRecoverAtPmax} &= \eta\,\Delta E_k / P_{max}
\end{aligned}
$$

So **recovered + dissipated = ΔE_k exactly** (A7 gate), and `kersDissipationSplit`
gives the two heat terms separately.

Closed form of `recoverable` (P_b decreasing, cap C = P_max/η):
C ≥ P₀ ⇒ ΔE_k; C ≤ P₁ ⇒ C·t_brake; otherwise with $t^* = t_{brake}(P_0 - C)/(P_0 - P_1)$:
$C\,t^* + \tfrac12 (C + P_1)(t_{brake} - t^*)$.

`timeToRecoverAtPmax` (despite the name): time the MGU-K, running continuously at its
cap (mechanical intake P_max/η), would need to **absorb the whole ΔE_k at the maximum
power** — it stores only η·ΔE_k, not ΔE_k. When it is longer
than t_brake, part of ΔE_k must go to the discs — this is the "recovery is
power-limited" message. (For η = 1 it equals ΔE_k/P_max.)

`powerTrace`: `KERS_TRACE_SAMPLES = 201` uniform samples on [0, t_brake] (200 intervals).
`pKers` = **electrical** power stored, $\eta\min(P_b, P_{max}/\eta) \le P_{max}$;
`pBrakes` = $P_b - p_{Kers}$ = everything not stored (disc heat + MGU-K losses), so the
stacked plot pKers + pBrakes is the total braking power, $\int p_{Kers}\,dt$ =
`recovered` and $\int p_{Brakes}\,dt$ = `dissipated`. Tested: the trapezoid integrals
match the totals within 0.5 % on 60 random parameter sets, and an `rk4Step` integration
of pKers reproduces `recovered`.

Worked example — the same numbers as theory 10, the quiz and the `kers-braking` defaults
(800 kg, 300 → 100 km/h, t_brake = 3 s, P_max = 120 kW, η = 0.9), output of
`kersBrakingEvent` / `kersDissipationSplit`:

- ΔE_k = 2.469 MJ; braking power falls linearly from P₀ ≈ 1.235 MW to P₁ ≈ 0.412 MW,
  always above P_max/η ≈ 133 kW, so the MGU-K is saturated for the whole event;
- recoverable (mechanical, absorbed by the MGU-K) = 133.3 kW × 3 s = **0.40 MJ**;
- recovered (stored) = 120 kW × 3 s = **0.36 MJ** (≈ 14.6 % of ΔE_k);
- dissipated = 2.109 MJ = 2.069 MJ disc brakes + 0.040 MJ MGU-K / converter losses;
- timeToRecoverAtPmax = 0.9 × 2.469 MJ / 120 kW ≈ **18.5 s** (time to absorb the whole
  ΔE_k at the maximum power).

With P_max = 350 kW (2026): recoverable 1.167 MJ, recovered 1.05 MJ (≈ 42.5 %), discs
1.302 MJ, MGU-K losses 0.117 MJ, timeToRecoverAtPmax ≈ 6.3 s.

## 5. Slide-10 check (I = 62.5 mA)

S = 5.0·10⁻² m², Δt = 0.46 s, B: 1.2·10⁻³ → 3.5·10⁻³ T, R = 4 mΩ, α = 0.

- ΔΦ = ΔB·S = 2.3·10⁻³ T × 5.0·10⁻² m² = 1.15·10⁻⁴ Wb
- |f.e.m.| = ΔΦ/Δt = 1.15·10⁻⁴ / 0.46 = 2.5·10⁻⁴ V (exact: 1.15/0.46 = 2.5)
- |I| = 2.5·10⁻⁴ V / 4·10⁻³ Ω = 6.25·10⁻² A = **62.5 mA**

The computation is exact — no rounding needed. With signs: f.e.m. = −2.5·10⁻⁴ V and
I = −62.5 mA (the induced current opposes the increase of Φ, Lenz). Asserted in
`tests/physics/targets.test.ts` to ±0.1 mA (actual agreement ~1e-15).

## 6. Global validity limits

- **Uniform B** over the circuit surface in the slide-based functions above; the field of real, finite coils (Biot-Savart) is covered in §7.
- **Single-phase simplification**: the rotating loop is a simplified model of the real
  MGU-K, a three-phase permanent-magnet synchronous machine.
- **Ideal transformer** and **linear materials** (no saturation, no hysteresis, no eddy
  current losses in cores).
- **Lumped circuits**, quasi-static (no radiation, no skin effect).
- **KERS**: constant deceleration, constant η, no battery state-of-charge or per-lap
  energy limits, no aero/rolling losses (§4).

## 7. Biot-Savart (Phase 4)

Module `src/physics/biotSavart.ts` (re-exported from `src/physics/index.ts`), used by the
`field-biot-savart` simulator. It computes the field of a **real, finite coil** to show where the
uniform-B idealisation of the slides (Φ = BS cos α, slide 7; B = μ₀NI/l and L = μ₀N²S/l, slide 14)
holds and where it fails. Model: filamentary wire, steady current, vacuum (μ₀, no ferromagnetic
material), magnetostatics. Coordinates in m, B in T; coil axis = z, centre = origin; a positive
current circulates counter-clockwise seen from +z, so B points along +z inside the coil.
`Vec3 = readonly [x, y, z]`, `Polyline = readonly Vec3[]`. Constant:
`WIRE_CORE_RADIUS = 5·10⁻⁴ m` (0,5 mm, a typical magnet-wire radius).

| Function                                   | Formula / method                                                                                              | Slide            | Units (in → out)  | Validity limits / notes                                                                                                                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ---------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `biotSavartSegment(a, b, p, I, core?)`     | $\vec B = \frac{\mu_0 I}{4\pi d}(\cos\theta_1-\cos\theta_2)\,\hat e$, $\hat e \parallel \vec L\times\vec r_1$ | none (extension) | m, m, m, A, m → T | Exact closed form for a straight segment a→b ($\vec L = b-a$, $\vec r_1 = p-a$). Regularised $d^2 \to d^2 + r_c^2$ (below). Points on the segment's line give 0.                                                    |
| `coilPolyline(spec)`                       | vertices on the ideal curve (inscribed polygons)                                                              | none (extension) | m → m             | `loop`: circle traced N times; `solenoid`: helix of N turns, −l/2 → +l/2 (leads not modelled); `helmholtz`: two N-turn loops at ∓s/2 (s = R default) joined by a lead traversed up and back (contributions cancel). |
| `createFieldEvaluator(polyline, I, core?)` | same sum as `fieldAt`, no per-call allocation                                                                 | none (extension) | m, A → T          | For hot loops (field-line tracing in the Web Worker).                                                                                                                                                               |
| `fieldAt(polyline, I, p, core?)`           | $\vec B(p) = \sum_i \vec B_{\text{seg}}(P_i \to P_{i+1}, p)$                                                  | none (extension) | m, A, m → T       | ≥ 2 points. I = 0 ⇒ 0. Finite everywhere, also on the wire.                                                                                                                                                         |
| `fieldOnAxisLoop(R, I, z)`                 | $B_z = \frac{\mu_0 I R^2}{2(R^2+z^2)^{3/2}}$                                                                  | none (extension) | m, A, m → T       | Analytic reference, one thin loop (× N for N coincident turns).                                                                                                                                                     |
| `fieldInfiniteSolenoid(N, l, I)`           | $B = \mu_0 N I / l$                                                                                           | 14               | –, m, A → T       | Ideal solenoid; consistent with `solenoidInductance` ($N B S = L I$).                                                                                                                                               |
| `fieldOnAxisFiniteSolenoid(N, l, R, I, z)` | current-sheet formula (TSDoc)                                                                                 | 14               | –, m, m, A, m → T | Turns smeared over l. Centre → μ₀NI/l for l ≫ R; ends → half.                                                                                                                                                       |
| `distanceToPolyline(polyline, p)`          | min distance to the segments                                                                                  | none (extension) | m → m             | Helper for "near the wire" tests.                                                                                                                                                                                   |
| `traceFieldLine(fieldFn, seed, opts)`      | $d\vec r/ds = \pm\vec B/\lvert\vec B\rvert$ with `rk4Step`, s = arc length                                    | none (extension) | m → m, T          | Stops on `closed` (within 0,75·step of the seed after ≥ 4·tol + 4·step; seed appended), `bounds`, `nearWire`, `nullField` (\|B\| ≤ 10⁻¹⁵ T) or `maxSteps`. Returns points, \|B\| per point, length, stop reason.    |

**Regularisation (core radius r_c).** A filament has a 1/d singularity on the wire. Each segment
uses $d^2 + r_c^2$ instead of $d^2$, so the field is finite and smooth near the wire. For
$d \gg r_c$ the relative error is $r_c^2/d^2$ (10⁻⁴ at d = 5 cm with 0,5 mm). The profile
$d/(d^2+r_c^2)$ is only a smooth stand-in for the field inside a round wire (peak at $d = r_c$ with
half the true value): values within a few $r_c$ of the wire are not physical, and the simulator
stops field lines well before (0,06 R).

**Validation (`tests/physics/biotSavart.test.ts`).**

- Long straight segment → μ₀I/(2πd) (10⁻⁶); finite segment → μ₀I/(4πd)(cos θ₁ − cos θ₂) (10⁻¹²).
- Loop, 128 segments/turn, vs `fieldOnAxisLoop` at z/R ∈ {0; 0,2; 0,5; 1; 2; −1,5}: **< 0,5 %**
  (inscribed-polygon error O(1/n²)).
- Solenoid l/R = 20, N = 200, 32 segments/turn: centre vs μ₀NI/l **< 2 %** (the finite length alone
  gives −0,5 %), vs the current-sheet formula < 0,5 %; field at the ends ≈ ½ μ₀NI/l.
- Helmholtz (s = R): centre ≈ (4/5)^{3/2} μ₀NI/R (< 0,5 %); \|B\| varies **< 1 %** within ±0,1 R
  of the centre (axial, radial and diagonal probes).
- ∇·B by central differences (h = 10⁻⁵ m) at off-axis points of loop, solenoid and Helmholtz:
  \|∇·B\| / (\|B\| / 1 cm) < 10⁻⁵.
- Symmetry (loop B_z even, B_ρ odd in z; 90° rotation); N coincident turns = N × one turn; the
  Helmholtz lead pair cancels (field = sum of two separate loops to 10⁻⁹).
- Loop field lines close (forward and backward, same length within 2 %), stay in their meridian
  plane and encircle the wire; I = 0 ⇒ 0; point on the wire ⇒ finite; invalid input ⇒ RangeError.

**Simulator choices (`src/sims/field-biot-savart/model.ts`).** Loop and Helmholtz are computed as
one turn carrying N·I (exactly equivalent for coincident turns); the solenoid is the real helix (36
segments/turn), so its on-axis profile shows the small ripple of the discrete turns. Field lines are
traced in 3D in a Web Worker from seeds in the meridian plane x = 0, on the mid-plane inside the
coil. Loop and Helmholtz lines stay in that plane by symmetry; the helix's net axial current makes
the solenoid lines leave it slightly (up to ≈ 12 mm ≈ 0,4 R at the defaults; drawn as 3D curves). They
stop 0,06 R from the wire and at the edge of the view box. The dashes move with local speed ∝ \|B\|
(clamped to 0,15–4 × B_centre) using the flow coordinate φ(s) = ∫ ds / v(s).

**Validity limits.** μ = μ₀ everywhere (no ferromagnetic material), DC magnetostatics, thin wire
(no skin/proximity effect, no winding thickness); helix leads not modelled.

## 8. PMSM d-q (Phase 4)

`src/physics/pmsm.ts` — a **representative** three-phase permanent-magnet synchronous
machine (PMSM) used by the `pmsm-dq` simulator and theory 16. It extends the single-phase
rotating loop of slides 18–19: with zero current the peak phase voltage is $\omega_e\psi_m$,
the three-phase analogue of $V_0 = NBS\omega$ with $\psi_m = NBS$ (tested). The real MGU-K
type and data are not public (OPEN_FACTS #8): no parameter here is claimed to be the MGU-K's.

**Conventions.**

- **Amplitude-invariant** Clarke/Park transform: $\alpha = \tfrac23(a - \tfrac b2 - \tfrac c2)$,
  $\beta = (b-c)/\sqrt3$, zero $= (a+b+c)/3$; $d = \alpha\cos\theta_e + \beta\sin\theta_e$,
  $q = -\alpha\sin\theta_e + \beta\cos\theta_e$. A balanced set of amplitude $X$ gives a vector
  of length $X$, hence powers and torque carry the factor 3/2.
- **Motor (load) convention** $v = R_s i + d\psi/dt$. Positive torque/power = motoring.
  Braking (generating) at positive speed: $i_q < 0$, $T < 0$, $P_\text{mech} < 0$ and
  $P_\text{elec} < 0$ (power to the battery). With $i = 0$ the terminal voltage of phase a is
  $-\varepsilon$ of slides 18–19 (the slides use the generator sign $\varepsilon = -d\psi/dt$).
- $\theta_e = p\,\theta_\text{mech}$; d axis on the magnet flux, q leads by 90° electrical.
- Inverter limit $V_\max = V_{DC}/\sqrt3$: peak phase voltage in the linear range of
  space-vector PWM (or sine PWM with third-harmonic injection).

| Function                                                                            | Formula                                                                                                             | Slide                                               | Units               | Notes                                                                     |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------- | ------------------------------------------------------------------------- |
| `clarke(ia, ib, ic)` / `inverseClarke(alpha, beta, zero = 0)`                       | see conventions                                                                                                     | none (extension: d-q model)                         | A or V              | amplitude-invariant                                                       |
| `park(alpha, beta, thetaE)` / `inversePark(d, q, thetaE)` / `dqToAbc(d, q, thetaE)` | see conventions                                                                                                     | none (extension)                                    | –, rad              | round trip tested                                                         |
| `pmsmVoltages(id, iq, omegaE, m)`                                                   | $v_d = R_s i_d - \omega_e L_q i_q$, $v_q = R_s i_q + \omega_e L_d i_d + \omega_e\psi_m$                             | none (extension; $\omega_e\psi_m$ ↔ $V_0$ of 18–19) | A, rad/s → V        | steady state                                                              |
| `pmsmTorque(id, iq, m)`                                                             | $T = \tfrac32 p[\psi_m i_q + (L_d - L_q) i_d i_q]$                                                                  | none (extension)                                    | A → N·m             | equals $\partial W'/\partial\theta_\text{mech}$ of the co-energy (tested) |
| `pmsmCopperLoss(id, iq, Rs)`                                                        | $P_\text{Cu} = \tfrac32 R_s (i_d^2 + i_q^2)$                                                                        | 16                                                  | A, Ω → W            | Joule term, three phases                                                  |
| `pmsmElectricalPower(vd, vq, id, iq)`                                               | $P_\text{elec} = \tfrac32 (v_d i_d + v_q i_q)$                                                                      | none (extension)                                    | V, A → W            |                                                                           |
| `pmsmOperatingPoint(id, iq, omegaMech, m)`                                          | all of the above, $P_\text{mech} = T\omega_\text{mech}$                                                             | 16                                                  | → V, N·m, W         | $P_\text{elec} = P_\text{mech} + P_\text{Cu}$ exactly (tested to 1e-9)    |
| `pmsmEfficiency(pElec, pMech)`                                                      | motor $P_m/P_e$, generator $P_e/P_m$                                                                                | 16                                                  | –                   | NaN if undefined                                                          |
| `pmsmVoltageLimit(vdc)`                                                             | $V_\max = V_{DC}/\sqrt3$                                                                                            | none                                                | V                   |                                                                           |
| `pmsmMtpa(I, m, mode)`                                                              | $i_d = -2(L_q-L_d)I^2 / [\psi_m + \sqrt{\psi_m^2 + 8(L_q-L_d)^2I^2}]$, $i_q = \pm\sqrt{I^2 - i_d^2}$                | none                                                | A                   | closed form; $i_d = 0$ if $L_d = L_q$                                     |
| `pmsmBaseSpeed(m, Imax, Vmax)`                                                      | $\lvert v(i_\text{MTPA}(I_\max), p\omega_b)\rvert = V_\max$                                                         | none                                                | → rad/s             | bisection                                                                 |
| `pmsmMaxTorque(omegaMech, m, Imax, Vmax, mode)`                                     | max/min of $T$ on circle ∩ voltage ellipse                                                                          | none                                                | → N·m, A, W, region | regions `mtpa`, `field-weakening`, `mtpv`, `infeasible`                   |
| `pmsmTorqueSpeedEnvelope(m, Imax, Vmax, omegaMax, n)`                               | `pmsmMaxTorque` sampled for motor and generator                                                                     | none                                                | → N·m, W            | constant torque, then ≈ constant power                                    |
| `pmsmCurrentDerivatives(id, iq, vd, vq, omegaE, m)`                                 | $L_d\dot i_d = v_d - R_s i_d + \omega_e L_q i_q$, $L_q\dot i_q = v_q - R_s i_q - \omega_e L_d i_d - \omega_e\psi_m$ | 15 (RL per axis)                                    | → A/s               |                                                                           |
| `pmsmCurrentControllerGains(m, wc)`                                                 | $k_p = L\omega_c$, $k_i = R_s\omega_c$                                                                              | 15                                                  | → V/A, V/(A·s)      | first-order closed loop, $i(1/\omega_c) = 63{,}2\,\%$ (tested)            |
| `pmsmControllerVoltages(s, inp, m, c)`                                              | PI + decoupling feed-forward, clamped to $\lvert v\rvert \le V_\max$                                                | none                                                | → V                 | ideal inverter otherwise                                                  |
| `pmsmDynamicsStep(s, inp, m, c, dt)`                                                | RK4 (`rk4Step`) with sub-steps $h\lambda \le 0{,}25$                                                                | none                                                | s                   | deterministic; anti-windup while saturated                                |
| `pmsmSteadyDynState(idRef, iqRef, m, c)`                                            | integrators $x = R_s i^*/k_i$                                                                                       | none                                                |                     | start without transient                                                   |

**Voltage ellipse with $R_s$.** $v = A\,i + b$ with $A = [[R_s, -\omega_eL_q], [\omega_eL_d, R_s]]$
and $b = (0, \omega_e\psi_m)$, so $\lvert v\rvert \le V_\max$ is an exact (slightly tilted) ellipse in
the current plane; no $R_s = 0$ approximation is used. Since $T$ has no interior maximum, the
constrained optimum lies on the boundary of circle ∩ ellipse: `pmsmMaxTorque` samples both
boundary curves (720 points each) and refines the best feasible sample by bisection on the
constraint crossing or by golden-section search. Tests compare it with a brute-force grid
search of the feasible set. With $R_s = 0$ the braking envelope is the exact mirror of the
motoring one; with $R_s > 0$ braking has slightly more voltage margin ($R_s i_q$ lowers $v_q$).

**Envelope example** (illustrative machine of the sim, not the MGU-K: $R_s = 0{,}02\ \Omega$,
$L_d = 0{,}20$ mH, $L_q = 0{,}35$ mH, $\psi_m = 0{,}08$ Wb, $p = 4$, $I_\max = 400$ A,
$V_{DC} = 600$ V): MTPA torque 229,3 N·m up to the base speed 641,7 rad/s ≈ 6130 giri/min
(≈ 147 kW); in field weakening the power rises to ≈ 181 kW at 1,5 × and ≈ 191–199 kW between 2
and 3,2 × base speed (191,3 kW at 2 ×, 198,6 kW at 3,2 ×; within ±5 % of the value at 2,5 ×
base, tested). The characteristic current $\psi_m/L_d = 400$ A equals
$I_\max$, which is why the power stays nearly constant; with $I_\max > \psi_m/L_d$ an MTPV
region appears at high speed, with $I_\max < \psi_m/L_d$ the machine has a finite maximum
speed (`infeasible` beyond it).

**Validity limits.** Linear magnetics (constant $L_d$, $L_q$, $\psi_m$: no saturation, no
cross-coupling), sinusoidal back-emf (no harmonics, no cogging), iron and mechanical losses
neglected, ideal inverter (no switching ripple, dead time or losses), balanced three-wire
machine (zero sequence ignored), shaft speed imposed from outside in the dynamic model.

## 9. Car dynamics (Phase 4)

`src/physics/vehicle-dynamics.ts`, used by the `car-dynamics` simulator. It extends the
constant-deceleration KERS model of §4 to a braking zone with tyres, aerodynamics and
per-axle braking. Extension, not in the slides (`@slide none`); the energy bookkeeping is the
balance of slides 16–17 applied to the whole car.

**Assumptions.** Point-mass car on a flat straight, longitudinal motion only (no pitch or
heave dynamics, no wheel rotational inertia, no rolling resistance, no tyre temperature or
wear). Drag acts at the height of the centre of gravity (no pitch moment); downforce is split
between the axles like the weight ($w_f$, default 0,45). Ideal ABS: the axle that limits the
braking works at the peak slip $\kappa^*$; the other axle works at the smaller slip set by the
brake balance. The MGU-K brakes the **rear axle only**; following D8, `Pmax` is its
**electrical** cap, so it absorbs at most $P_{max}/\eta$ of mechanical power. Ideal
brake-by-wire blending: the rear friction brakes supply what the MGU-K does not take. No
low-speed torque limit of the MGU-K, no per-lap energy limit, no battery state of charge.
All parameters of the simulator (800 kg, $C_dA$, $C_lA$, $\mu$, $h$, $L$, tyre shape) are
illustrative, not data of a real car.

| Function                                      | Formula                                                                        | Units     | Notes                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------ | --------- | -------------------------------------------------------- |
| `pacejkaFx(kappa, Fz, {B, C, D, E})`          | $F_x = F_z D \sin\big(C\arctan(B\kappa - E(B\kappa - \arctan B\kappa))\big)$   | –, N → N  | odd in κ; $D = \mu$; $1 < C \le 2$, $E < 1$              |
| `pacejkaPeakSlip({B, C, E})`                  | $\varphi(B\kappa^*) = \tan\frac{\pi}{2C}$, $\varphi(u) = u - E(u - \arctan u)$ | –         | bisection; $E = 0$: $\kappa^* = \tan(\pi/2C)/B$ (tested) |
| `pacejkaSlipForRatio(r, {B, C, E})`           | $\varphi(B\kappa) = \tan(\arcsin(r)/C)$                                        | –         | inverse on the stable branch $[0, \kappa^*]$             |
| `aeroDrag(v, rho, CdA)`                       | $D = \tfrac12\rho C_dA v^2$                                                    | m/s → N   | magnitude, opposes the motion                            |
| `aeroDownforce(v, rho, ClA)`                  | $L = \tfrac12\rho C_lA v^2$                                                    | m/s → N   | no lift ($C_lA \ge 0$)                                   |
| `idealBrakeBalance(mu, h, L, wf)`             | $\beta_{id} = w_f + \mu h/L$                                                   | –         | both axles at $\kappa^*$ together                        |
| `carBrakingForces(v, model)`                  | see below                                                                      | → N, W    | loads, forces, slips, powers, limiting axle, MGU-K limit |
| `carBrakingStep(state, model, dt)`            | RK4 (`rk4Step`) of the ODE below                                               | s         | a stopped car stays at rest                              |
| `simulateBrakingZone({v1, v2, dt, ...model})` | integrate until $v = v_2$ (last step shortened by bisection)                   | → s, m, J | totals, residual, trace at every step                    |

**Forces at speed v** (β = front share of the total tyre braking force):

$$
\begin{aligned}
F_z &= m g + \tfrac12\rho C_lA v^2, \quad F_{z,f0} = w_f F_z, \quad F_{z,r0} = (1-w_f) F_z\\
F_x &= \min\Big(\frac{\mu F_{z,f0}}{\beta - \mu h/L},\ \frac{\mu F_{z,r0}}{1 - \beta + \mu h/L}\Big)
\quad\text{(front term only if } \beta > \mu h/L)\\
F_{z,f} &= F_{z,f0} + F_x h/L, \quad F_{z,r} = F_{z,r0} - F_x h/L, \quad F_{x,f} = \beta F_x, \quad F_{x,r} = (1-\beta) F_x\\
F_{MGU\text{-}K} &= \min\big(F_{x,r},\ (P_{max}/\eta)/v\big), \quad F_{brakes,r} = F_{x,r} - F_{MGU\text{-}K}\\
m\,\dot v &= -(F_x + \tfrac12\rho C_dA v^2)
\end{aligned}
$$

At $\beta = \beta_{id}$ both axles are at the limit and $F_x = \mu F_z$, the maximum. Inputs with
$\mu h/L \ge 1 - w_f$ are rejected (the rear wheels would lift at full braking).

**Energy bookkeeping.** The state integrates $E_{MGU\text{-}K} = \int F_{MGU\text{-}K} v\,dt$
(mechanical), $E_{brakes,f}$, $E_{brakes,r}$ and $E_{aero} = \int D v\,dt$. For the exact ODE
$\tfrac12 m(v_1^2 - v_2^2) = E_{MGU\text{-}K} + E_{brakes,f} + E_{brakes,r} + E_{aero}$; RK4 keeps
it within $10^{-6}$ relative (tested on 25 random cases, typically $10^{-12}$). Stored energy
$E_{stored} = \eta E_{MGU\text{-}K} \le P_{max} t$, losses $(1-\eta)E_{MGU\text{-}K}$.

**Cross-check with §4.** With $C_dA = C_lA = 0$ and $\beta = 0$ (all braking on the rear axle)
the deceleration is constant, $a = \mu(1-w_f)g$, and the energies equal `kersBrakingEvent` with
the same $t_{brake}$ within $10^{-6}$ (tested for $P_{max}$ from 0 to 1 MW). With $\beta > 0$ the
MGU-K can take at most the rear-axle force, so at low speed and high $P_{max}$ it recovers less
than the constant-deceleration model.

**Example** (simulator defaults: 800 kg, 300 → 100 km/h, $C_dA = 1{,}2$ m², $C_lA = 3{,}5$ m²,
ρ = 1,225 kg/m³, μ = 1,6, β = 0,58, h = 0,30 m, L = 3,6 m, η = 0,9, B = 12, C = 1,9, E = 0,5 ⇒
κ* ≈ 0,106): $t_{brake} \approx 1{,}83$ s, distance ≈ 93 m, deceleration from ≈ 5,3 g to ≈ 2,0 g;
ΔE_k = 2,469 MJ = 0,24 MJ into the MGU-K (0,22 MJ stored with 120 kW, ≈ 8,9 %: power-limited
for the whole zone) + 1,99 MJ friction brakes + 0,23 MJ drag. With 350 kW: 0,55 MJ stored
(≈ 22,3 %), and below ≈ 167 km/h the MGU-K is limited by the rear-axle force instead of by
$P_{max}$. Without aero the same zone takes ≈ 3,56 s and ≈ 198 m.

**Validity limits.** Educational model: no transient of the ABS, no tyre load sensitivity
(μ independent of $F_z$), constant η, aero coefficients independent of ride height and pitch,
no track slope or wind.
