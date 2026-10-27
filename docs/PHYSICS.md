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

`timeToRecoverAtPmax`: time the MGU-K, running continuously at its cap (mechanical
intake P_max/η), would need to absorb the whole ΔE_k (storing η·ΔE_k). When it is longer
than t_brake, part of ΔE_k must go to the discs — this is the "recovery is
power-limited" message. (For η = 1 it equals ΔE_k/P_max.)

`powerTrace`: `KERS_TRACE_SAMPLES = 201` uniform samples on [0, t_brake] (200 intervals).
`pKers` = **electrical** power stored, $\eta\min(P_b, P_{max}/\eta) \le P_{max}$;
`pBrakes` = $P_b - p_{Kers}$ = everything not stored (disc heat + MGU-K losses), so the
stacked plot pKers + pBrakes is the total braking power, $\int p_{Kers}\,dt$ =
`recovered` and $\int p_{Brakes}\,dt$ = `dissipated`. Tested: the trapezoid integrals
match the totals within 0.5 % on 60 random parameter sets, and an `rk4Step` integration
of pKers reproduces `recovered`.

Worked example (800 kg, 300 → 100 km/h, t_brake = 2.5 s, P_max = 120 kW, η = 0.9):
ΔE_k = 2.469 MJ; peak braking power ≈ 1.48 MW ≫ P_max/η = 133 kW, so the MGU-K is
saturated for the whole event: recovered = 120 kW × 2.5 s = 0.30 MJ, dissipated ≈ 2.17 MJ;
timeToRecoverAtPmax = 0.9 × 2.469 MJ / 120 kW ≈ 18.5 s.

## 5. Slide-10 check (I = 62.5 mA)

S = 5.0·10⁻² m², Δt = 0.46 s, B: 1.2·10⁻³ → 3.5·10⁻³ T, R = 4 mΩ, α = 0.

- ΔΦ = ΔB·S = 2.3·10⁻³ T × 5.0·10⁻² m² = 1.15·10⁻⁴ Wb
- |f.e.m.| = ΔΦ/Δt = 1.15·10⁻⁴ / 0.46 = 2.5·10⁻⁴ V (exact: 1.15/0.46 = 2.5)
- |I| = 2.5·10⁻⁴ V / 4·10⁻³ Ω = 6.25·10⁻² A = **62.5 mA**

The computation is exact — no rounding needed. With signs: f.e.m. = −2.5·10⁻⁴ V and
I = −62.5 mA (the induced current opposes the increase of Φ, Lenz). Asserted in
`tests/physics/targets.test.ts` to ±0.1 mA (actual agreement ~1e-15).

## 6. Global validity limits

- **Uniform B** over the circuit surface (no Biot-Savart geometry; Phase 4 extension).
- **Single-phase simplification**: the rotating loop is a simplified model of the real
  MGU-K, a three-phase permanent-magnet synchronous machine.
- **Ideal transformer** and **linear materials** (no saturation, no hysteresis, no eddy
  current losses in cores).
- **Lumped circuits**, quasi-static (no radiation, no skin effect).
- **KERS**: constant deceleration, constant η, no battery state-of-charge or per-lap
  energy limits, no aero/rolling losses (§4).
