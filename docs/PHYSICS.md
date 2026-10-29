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

The visualisation-only modules have their own function tables: car dynamics §7, brake-disc
temperature §8, field models §9 (`fields.ts`), lumped thermal model and black-body colour §10
(`thermal.ts`), overhead line and core flux §11 (`powerline.ts`); §12 maps every visual to the
model quantity that drives it.

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

The KERS topic as a whole (sim `kers-braking` and theory `10-kers-mguk`) builds on
slides **16, 17, 18, 19** — energy balance and alternator (aligned in QA round 1, QA-013);
Faraday-Neumann (8) and Lenz (11) are reached through theories 03 and 04. Since v0.5.0 slide
numbers appear only in this document and in the `@slide` TSDoc tags, not in the app UI
(D13).

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

Worked example — the same numbers as theory 10 and the `kers-braking` defaults
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

- **Uniform B** over the circuit surface in the slide-based functions above (the field of real, finite coils is not modelled).
- **Single-phase simplification**: the rotating loop is a simplified model of the real
  MGU-K, a three-phase permanent-magnet synchronous machine.
- **Ideal transformer** and **linear materials** (no saturation, no hysteresis, no eddy
  current losses in cores).
- **Lumped circuits**, quasi-static (no radiation, no skin effect).
- **KERS**: constant deceleration, constant η, no battery state-of-charge or per-lap
  energy limits, no aero/rolling losses (§4).
- **Visualisation models** (§8–§11) shape what is drawn (field lines, glow, sag), never the
  numbers of the slide-based models: vacuum magnetostatics without saturation, one-node
  thermal models, an inextensible catenary.

## 7. Car dynamics (Phase 4)

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

## 8. Brake-disc temperature (visualisation, `src/physics/brake-thermal.ts`)

Extension used only by the 3D scenes of `kers-braking` and `car-dynamics` (`@slide none`):
the disc glow is the black-body colour (`blackbodyRGB`, §10; `applyHeatGlow`) of a temperature
**computed** from the friction-brake power, not an arbitrary "heat level".

One lumped node per disc, integrated in the sims' fixed physics step (dt = 1/240 s):

$$
C\,\frac{dT}{dt} = P_{in} - h(v)\,A\,(T - T_{amb}) - \varepsilon\sigma A\,(T^4 - T_{amb}^4),
\qquad h(v) = h_0 + h_{ref}\,(v/v_{ref})^{0{,}8}
$$

`discThermalStep` is a scalar RK4 step that integrates the heat lost with the same four
stage values, so $C\,\Delta T + Q_{loss} = P_{in}\,dt$ holds to rounding (tested), and with
no losses $\Delta T = E/C$ exactly (tested).

| Constant (`BRAKE_DISC_ILLUSTRATIVE`, illustrative) | Front             | Rear              |
| -------------------------------------------------- | ----------------- | ----------------- |
| Size (C/C, ventilated)                             | Ø 330 × 32 mm     | Ø 280 × 32 mm     |
| Mass m                                             | 1,2 kg            | 0,9 kg            |
| Specific heat c (mean 300–1000 °C)                 | 1400 J/(kg·K)     | 1400 J/(kg·K)     |
| C = m·c                                            | 1680 J/K          | 1260 J/K          |
| Area A (faces + vents)                             | 0,14 m²           | 0,10 m²           |
| h₀ / h_ref at v_ref = 80 m/s                       | 20 / 180 W/(m²·K) | 20 / 180 W/(m²·K) |
| Emissivity ε                                       | 0,85              | 0,85              |

Ambient 25 °C. Power into each disc: `kers-braking` — disc-brake power $P_b - P_{MGU-K,mech}$
split with a **fixed 60 % front / 40 % rear** (the constant-deceleration model has no axles),
half per disc; `car-dynamics` — half of each axle's friction-brake power of
`simulateBrakingZone`. All the friction heat goes into the disc (pads, calipers and hubs are
not modelled: an upper bound). Starting temperature selectable: 25 / 300 / 500 °C
(default 300 °C, "dischi in temperatura"); it is reset at every replay.

Worked numbers (default 300 °C start, end of the braking): `kers-braking` 2025 preset,
front disc 0,62 MJ in 3 s → 647 °C (rear 608 °C), 38 kJ lost (6 %); 2026 preset 514 °C /
490 °C (less disc work because the MGU-K absorbs more). `car-dynamics` defaults: front 673 °C,
rear 565 °C (120 kW) / 422 °C (350 kW: the MGU-K takes more of the rear-axle force). The
glow starts above ≈ 700 K (427 °C).

**Scene scales** (stated in the sims' notes): energy-ribbon radius 0,12 m at 350 kW
(∝ power); `car-dynamics` force arrows $L = 0{,}9\ \text{m}\cdot\log_{10}(1 + F/1\ \text{kN})$;
pitch/heave from the axle loads with illustrative axle rates 350 / 300 kN/m, exaggerated
×2,5 and limited so the floor never touches the ground; contact-patch glow ∝ (κ/κ*)².

## 9. Static field models (visualisation, `src/physics/fields.ts`)

Extension used only to **trace the field lines** of the 3D scenes (`@slide none (extension:
field visualisation)`). None of these functions feeds the induction models of the simulators,
which keep their uniform-B assumptions (§6); they make the drawn lines the result of a
computation instead of a hand-drawn picture. Vectors are plain `[x, y, z]` tuples (`Vec3`);
every field function takes an optional `out` vector that is written in place and returned (no
allocation in the RK4 line tracer). `FieldFn = (p, out) => out` is the common signature.

| Function                                     | Formula                                                                                                   | Slide                                 | Units (in → out)      | Validity limits / notes                                                                                                                       |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `ellipK(m)`                                  | $K(m) = \int_0^{\pi/2}\frac{d\theta}{\sqrt{1-m\sin^2\theta}} = \frac{\pi}{2\,\mathrm{AGM}(1,\sqrt{1-m})}$ | none (extension: field visualisation) | – → –                 | Parameter convention m = k². 0 ≤ m ≤ 1, else RangeError. K(1) = +∞.                                                                           |
| `ellipE(m)`                                  | $E(m) = \int_0^{\pi/2}\sqrt{1-m\sin^2\theta}\,d\theta = K(m)\,(1 - \sum_n 2^{n-1}c_n^2)$                  | none (extension: field visualisation) | – → –                 | Same AGM run as K. 0 ≤ m ≤ 1. E(1) = 1.                                                                                                       |
| `dipoleField(m, r, out?)`                    | $\vec B = \frac{\mu_0}{4\pi}\,\frac{3(\vec m\cdot\hat r)\hat r - \vec m}{r^3}$                            | none (extension: field visualisation) | A·m², m → T           | Exact point dipole at the origin. **r = 0 ⇒ RangeError** (singular). Far-field model of a bar magnet (m = M·V) or a small loop (m = I·πR² n̂). |
| `loopField(R, I, p, out?)`                   | exact, complete elliptic integrals (below)                                                                | none (extension: field visualisation) | m, A, m → T           | Loop in z = 0, centred at the origin, I > 0 counter-clockwise seen from +z. **Point on the wire ⇒ RangeError.** R > 0.                        |
| `solenoidField(R, L, N, I, p, out?, loops?)` | sum of `loops` coaxial `loopField`s, each carrying $I N/\text{loops}$                                     | none (extension: field visualisation) | m, m, –, A, m → T     | Axis z, from −L/2 to +L/2. `loops` default min(⌈N⌉, `SOLENOID_MAX_LOOPS` = 200), integer ≥ 1. A point on one of the summed loops throws.      |
| `createGapField(g, B0)`                      | two-sheet magnetic-charge model (below), returns a `FieldFn`                                              | none (extension: field visualisation) | m, T → (m → T)        | Geometry validated once, no allocation per call. gap, width, depth > 0; B0 finite.                                                            |
| `gapField(g, B0, p, out?)`                   | same model, one point                                                                                     | none (extension: field visualisation) | m, T, m → T           | Convenience wrapper (builds the closure on every call: use `createGapField` in loops).                                                        |
| `norm3(v)`                                   | $\lvert\vec v\rvert$                                                                                      | none (extension: field visualisation) | same unit as v        | –                                                                                                                                             |
| `divergence(f, p, h)`                        | $\nabla\cdot\vec B \approx \sum_i \frac{B_i(p + h\hat e_i) - B_i(p - h\hat e_i)}{2h}$                     | none (extension: field visualisation) | `FieldFn`, m, m → T/m | Central differences, h > 0. Used by the tests as a physics check (∇·B = 0 away from sources).                                                 |

**Elliptic integrals (AGM).** a₀ = 1, b₀ = √(1 − m), c₀ = √m; aₙ₊₁ = (aₙ + bₙ)/2,
bₙ₊₁ = √(aₙbₙ), cₙ₊₁ = (aₙ − bₙ)/2; stop when |cₙ| ≤ 10⁻¹⁷·aₙ (at most 40 iterations,
quadratic convergence: ≤ 6 steps to 10⁻¹⁶ for m ≤ 1 − 10⁻¹⁵). K = π/(2a_∞), E from the
same run.

**Circular loop** (Simpson et al., NASA 2001). With ρ = √(x² + y²), α² = R² + ρ² + z² − 2Rρ,
β² = R² + ρ² + z² + 2Rρ, m = 1 − α²/β², C = μ₀I/π:

$$
B_z = \frac{C}{2\alpha^2\beta}\big[(R^2 - \rho^2 - z^2)E(m) + \alpha^2 K(m)\big],\qquad
B_\rho = \frac{C z}{2\alpha^2\beta\rho}\big[(R^2 + \rho^2 + z^2)E(m) - \alpha^2 K(m)\big]
$$

On the axis (ρ < 10⁻¹²·R) B_ρ is set to 0 and B_z reduces to μ₀IR²/(2(R² + z²)^{3/2}).
Singular points: the wire itself (α² ≤ 0 ⇒ RangeError). B points along +z at the centre for
I > 0 (right-hand rule, same convention as §2).

**Finite solenoid.** Loop k sits at z_k = −L/2 + (k + ½)·L/loops; the ampere-turns N·I are
exact for any `loops`. On the axis it matches
$B_z = \frac{\mu_0 N I}{2L}\Big[\frac{z + L/2}{\sqrt{(z+L/2)^2+R^2}} - \frac{z - L/2}{\sqrt{(z-L/2)^2+R^2}}\Big]$,
and inside a long solenoid it tends to μ₀NI/L.

**Gap between pole pieces (two-sheet model).** N face at x = −gap/2, S face at x = +gap/2,
both `width` (y) × `depth` (z), centred on the x axis; field along +x. Assumptions: the
high-permeability pole pieces are replaced by two uniformly charged rectangles of magnetic
surface charge ±σ; each rectangle has the closed-form field (u, v in-plane offsets from the
corners, n normal distance, R = √(u² + v² + n²))

$$
\vec F(p) = \frac{\sigma}{4\pi}\sum_{\text{corners}} \pm\big(\operatorname{atan}\tfrac{uv}{nR},\ -\ln(v + R),\ -\ln(u + R)\big)
\quad\text{(components along } \hat n = \hat x,\ \hat y,\ \hat z)
$$

(the logarithm is evaluated as ln(a²/(R − v)) for v < 0, no cancellation), and σ is fixed so
that B(0) = B0·x̂. For gap ≪ face size the field is uniform in the middle and bulges outwards
at the edges (fringing). **It ignores saturation, the yoke shape and the field inside the
iron**; it is meant only for the air region in front of the faces (a point exactly on a face
plane is nudged by 10⁻¹² m).

**Validation** (`tests/physics/fields.test.ts`):

- K(0.5) = 1.854074677301372, E(0.5) = 1.350643881047675 (13 digits), K(0.9) = 2.578092113348173,
  E(0.9) = 1.104774732704073 (12 digits) — A&S table 17.1 / DLMF; power series for m ≤ 0.05;
  Legendre relation EK′ + E′K − KK′ = π/2 to 12 digits for m = 0.01 … 0.99.
- `dipoleField`: on-axis 2·μ₀m/(4πr³) and equatorial −μ₀m/(4πr³); relative ∇·B < 10⁻⁶.
- `loopField` (R = 0.1 m, I = 5 A): on-axis formula to 15 digits; brute-force Biot–Savart
  (4000 segments) at 4 off-axis points < 10⁻⁵ relative; far field at (3, 1, 2) m vs
  `dipoleField(I·πR² ẑ)` < 2·10⁻³; relative ∇·B < 10⁻⁵; odd in I.
- `solenoidField` (R = 2 cm, L = 0.2 m, N = 400, I = 2 A): on-axis finite-solenoid formula to
  3 digits at z = 0 … 0.15 m; ≈ μ₀NI/L inside; 10 vs 200 loops agree to 3 digits at 1 m.
- Gap (gap 4 cm, 6 × 8 cm faces): B(0) = B0·x̂ to 12 digits; 300 × 300 brute-force
  integration of the two sheets at 4 points < 2·10⁻³; fringing B_y > 0 near the N face and
  < 0 near the S face at the edge; B_x < 0.2·B0 at y = 2·width; mirror symmetric;
  |∇·B|·gap < 10⁻⁵.
- QA re-derivation (`docs/QA_REPORT.md` V.3): K, E vs Simpson quadrature ≤ 4·10⁻¹⁴;
  `loopField` vs 20 000-segment Biot–Savart ≤ 4·10⁻¹³; `solenoidField` centre (R = 2 cm,
  L = 0,4 m, N = 200) 6,252 0038·10⁻⁴ T vs 6,252 0031·10⁻⁴ T; gap model identical to 4
  decimals, ∇·B ≈ −5·10⁻⁶ T/m at a fringing point with B₀ = 0,5 T.

**Validity limits.** Magnetostatics in vacuum (μ₀), thin filamentary loops (no wire
cross-section), no iron except as the equivalent surface charges of the gap model, no
saturation. These fields shape the drawn lines only; the numbers on screen come from the
simulators' own models.

## 10. Lumped thermal model and black-body colour (`src/physics/thermal.ts`)

Extension (`@slide none (extension: heat visualisation)`): hot parts are coloured from a
temperature that is itself **computed** from the dissipated power, not from an arbitrary glow
factor. The brake discs use their own RK4 model with radiation (§8); the other hot parts
(alternator winding, RL resistor, overhead line) use `thermalStep`.

| Function                                 | Formula                                                                                            | Slide                                | Units (in → out)         | Validity limits / notes                                                                                                                                                |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `thermalStep(T, P, C, hA, Tamb, dt)`     | $T_\infty + (T - T_\infty)\,e^{-hA\,dt/C}$, $T_\infty = T_{amb} + P/hA$; hA = 0: $T + P\,dt/C$     | none (extension: heat visualisation) | K, W, J/K, W/K, K, s → K | Exact solution of $C\,dT/dt = P - hA(T - T_{amb})$ with P constant over dt; stable for any dt. C > 0, hA ≥ 0, dt ≥ 0.                                                  |
| `thermalStepLoss(T, P, C, hA, Tamb, dt)` | $Q_{loss} = hA(T_\infty - T_{amb})\,dt + C(T - T_\infty)(1 - e^{-hA\,dt/C}) = P\,dt - C\,\Delta T$ | none (extension: heat visualisation) | same → J                 | Exact integral of the loss over the step, so $C\Delta T = P\,dt - Q_{loss}$ holds exactly.                                                                             |
| `thermalSteadyState(P, hA, Tamb)`        | $T_\infty = T_{amb} + P/hA$                                                                        | none (extension: heat visualisation) | W, W/K, K → K            | hA > 0.                                                                                                                                                                |
| `planckRadiance(lambda, T)`              | $B_\lambda = \frac{2hc^2}{\lambda^5}\,\frac{1}{e^{hc/(\lambda k_B T)} - 1}$                        | none (extension: heat visualisation) | m, K → W·sr⁻¹·m⁻³        | λ > 0, T > 0. h, c, k_B exact (SI 2019); `expm1` in the denominator.                                                                                                   |
| `cie1931(lambdaNm)`                      | multi-lobe Gaussian fit of x̄, ȳ, z̄ (Wyman, Sloan & Shirley, JCGT 2013)                             | none (extension: heat visualisation) | nm → –                   | ≈ 1 % of the tabulated CIE 1931 2° data in the visible range; least accurate in the deep-red tail.                                                                     |
| `blackbodyXYZ(T)`                        | $X = \int B_\lambda(\lambda, T)\,\bar x(\lambda)\,d\lambda$ (and Y, Z)                             | none (extension: heat visualisation) | K → W·sr⁻¹·m⁻²           | Trapezoidal rule on 380–780 nm, 5 nm steps. Y ∝ luminance.                                                                                                             |
| `xyzToLinearSRGB(xyz)`                   | IEC 61966-2-1 matrix (D65), no chromatic adaptation                                                | none (extension: heat visualisation) | – → linear RGB           | Channels may be negative (out of gamut).                                                                                                                               |
| `blackbodyRGB(T, out?)`                  | `xyzToLinearSRGB(blackbodyXYZ(T))`, negatives clipped to 0, divided by the largest channel         | none (extension: heat visualisation) | K → linear sRGB, max = 1 | **Chromaticity only** (brightness separate). LUT `BLACKBODY_LUT_MIN` … `BLACKBODY_LUT_MAX` = 300 … 2500 K, 10 K steps, linear interpolation; **T outside is clamped**. |
| `blackbodyLuminance(T, Tref = 2500 K)`   | $Y(T)/Y(T_{ref})$                                                                                  | none (extension: heat visualisation) | K, K → –                 | T, T_ref > 0. Exact integral (no LUT).                                                                                                                                 |

**Method and conventions.** `blackbodyRGB` returns **linear** sRGB (the renderer sets it with
`LinearSRGBColorSpace`), normalised so that max(r, g, b) = 1: hue only, brightness comes from
`blackbodyLuminance`. The LUT is built on first use from the exact computation. Below ≈ 850 K
the colour is pure red (green is clipped out of the sRGB gamut); the hue goes deep red
(≈ 800 K) → orange (≈ 1500 K) → warm white (2500 K); red is always the largest channel below
6500 K.

**Render-side policies** (`src/render/heat.ts`, ARCHITECTURE §10.5, DECISIONS D15):

- **Glow threshold.** `GLOW_ONSET_K = 700 K`: no emission below (nothing visible; Draper point
  ≈ 798 K). Above, the emissive intensity is a stylised log-luminance mapping:
  L = log₁₀(Y(T)/Y(700 K)) (≈ 11,6 decades up to 2500 K), intensity = 2,6·(L/L₂₅₀₀)^1,5 —
  ≈ 0,2 at 800 K, ≈ 1,7 at 1500 K, 2,6 at 2500 K (T clamped at 2500 K). The colour is
  physical; the brightness curve is a display choice (QA-037).
- **Ironbow false colour.** Realistic temperatures that do not glow (overhead line 20–120 °C,
  RL resistor 20–220 °C) are shown with the `ironbow(x)` thermal-camera palette, only behind a
  labelled toggle with a °C scale bar, never confused with incandescence. Black-body glow is
  reserved for a computed T > 700 K — never faked.

**Validation** (`tests/physics/thermal.test.ts`):

- C = 2000 J/K, hA = 15 W/K, T_amb = 300 K, P = 3000 W: T∞ = 500 K exactly; 10 000 steps of 1 s
  reach T∞ to 9 digits; after τ = C/hA the rise is 1 − e⁻¹ = 63,2 % (12 digits).
- Exactness: two steps of 0,37 s equal one of 0,74 s (12 digits).
- Energy: C·ΔT = P·dt − ∫hA(T − T_amb)dt against an independent Simpson quadrature (2000
  panels, T₀ = 420 K, P = 5 kW, dt = 30 s) to 10⁻³ J; `thermalStepLoss` equals the quadrature.
  Adiabatic: `thermalStep(300, 100, 50, 0, 300, 2)` = 304 K.
- Planck: maximum at Wien's λ = 2,897771955·10⁻³/T (T = 1500 K). CIE fit: ȳ(555 nm) ≈ 1.
- Chromaticity on the Planckian locus (CIE 1931 x, y): 1000 K (0,6528; 0,3444) ± 0,012,
  1500 K (0,5857; 0,3931) ± 0,006, 2000 K (0,5267; 0,4133) ± 0,004, 3000 K and 6500 K ± 0,002.
- D65 white (0,95047; 1; 1,08883) → linear sRGB (1, 1, 1) to 3 digits.
- `blackbodyRGB(800)` = (1, 0, 0); G(1000 K) < 0,08; G(2500 K) > 0,25, B(2500 K) > 0,03; G
  strictly increasing 900 → 2500 K. LUT vs exact at 905, 1234, 1777, 2391 K to 3 digits; 100 K
  and 9000 K clamp to the LUT ends.
- `blackbodyLuminance(700)` < 10⁻⁵; Y(1200 K) > 5·Y(1000 K).
- QA re-derivation (V.3): 800 K (1, 0, 0), 1000 K (1; 0,029; 0), 1500 K (1; 0,145; 0),
  2500 K (1; 0,380; 0,068); Y(800 K)/Y(2500 K) = 1,45·10⁻⁹.

**Validity limits.** One isothermal node (no gradients inside the body), constant C and hA,
P constant over each step, linear (convective) losses only — radiation is in the disc model of
§8, not here. Black body of emissivity 1 for the colour (real surfaces are greyer); the LUT
clamps above 2500 K, which none of the simulated parts reaches.

## 11. Overhead line and transformer core (`src/physics/powerline.ts`)

Extension used by the `joule-transformer` diorama (`@slide none (extension: visualisation)`).
The line-loss physics itself is `lineLoss` (§1, slide 23); these functions only drive the sag
of the drawn spans and the number of core flux loops.

| Function                                | Formula                                                                     | Slide                           | Units (in → out) | Validity limits / notes                                                                                                                                                      |
| --------------------------------------- | --------------------------------------------------------------------------- | ------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `catenarySag(S, a)`                     | $f = a\,(\cosh\frac{S}{2a} - 1)$                                            | none (extension: visualisation) | m, m → m         | Level span, a = H/w (horizontal tension / weight per metre). S, a > 0. Parabolic limit S²/(8a) for S ≪ a.                                                                    |
| `catenaryDrop(x, S, a)`                 | $d(x) = f - a\,(\cosh\frac{x - S/2}{a} - 1)$                                | none (extension: visualisation) | m, m, m → m      | Drop below the support line at x from the left support; d(0) = d(S) = 0, d(S/2) = f.                                                                                         |
| `catenaryLength(S, a)`                  | $\ell = 2a\sinh\frac{S}{2a}$                                                | none (extension: visualisation) | m, m → m         | ℓ ≥ S; ≈ S + 8f²/(3S).                                                                                                                                                       |
| `catenaryParameterForLength(S, length)` | inverse of `catenaryLength`                                                 | none (extension: visualisation) | m, m → m         | Bisection on ln a over [S·10⁻³, S·10⁹] to 10⁻¹⁴; ℓ(a) is monotonic (longer ⇒ smaller a ⇒ more sag). **length ≤ S ⇒ RangeError.**                                             |
| `thermalSag(S, a0, alpha, dT)`          | $\ell = \ell_0(1 + \alpha\,\Delta T)$, a from ℓ, f = `catenarySag(S, a)`    | none (extension: visualisation) | m, m, 1/K, K → m | Returns `{ a, sag, length }`. **Elastic stretch neglected** (inextensible apart from thermal strain) ⇒ the sag rise is an upper estimate. α ≥ 0; ΔT < 0 allowed while ℓ > S. |
| `coreFluxPeak(V, f, N)`                 | $V = 4{,}44\,f N\hat\Phi \Rightarrow \hat\Phi = \frac{\sqrt2\,V}{2\pi f N}$ | none (extension: visualisation) | V, Hz, – → Wb    | Ideal transformer, sinusoidal voltage of RMS value V. V ≥ 0, f > 0, N > 0. No saturation: the flux is not limited by the core material.                                      |

**Illustrative parameters of the `joule-transformer` scene** (`src/sims/joule-transformer/visual.ts`,
stated in the model note): span S = 300 m; aluminium conductor Ø 28 mm, 1,5 kg/m,
c = 900 J/(kg·K); horizontal tension H = 20 kN at 20 °C ⇒ a₀ = H/(m′g) = 1359,6 m; α = 23·10⁻⁶ /K;
natural convection h = 12 W/(m²·K); line 50 km (go + return ⇒ R′ = R/100 km). Lumped model per
metre C′·dT/dt = R′·I² − h·π·D·(T − T_amb) (C′ = 1350 J/(m·K), real τ ≈ 21 min, played 300×
faster). Sag drawn at 0,1 scene units per metre. Core flux: f = 50 Hz (played 200× slower, at
0,25 Hz); the number of flux loops (at most 12) is ∝ Φ̂/Φ_ref with
Φ_ref = `coreFluxPeak(25 kV, 50 Hz, 50)` = 2,25 Wb (the largest flux the sliders allow).

Worked numbers: default sag at 20 °C = 8,28 m (= 300²/(8·1359,6) to 0,3 %); +60 K (80 °C, the
legend's typical limit) → 10,74 m; +100 K → 12,11 m. Default core flux
Φ̂ = `coreFluxPeak(20 kV, 50 Hz, 100)` = 0,900 Wb (the same on the secondary, 200 kV / 1000
turns, as it must be for an ideal transformer).

**Validation** (`tests/physics/powerline.test.ts`):

- `catenarySag(300, 1360)` equals the formula to 12 digits; with a = 10⁶ m it equals
  S²/(8a) to 6 digits.
- `catenaryDrop`: 0 at both supports, f at mid-span, symmetric (12 digits).
- Length: ℓ > S, (ℓ − S)/(8f²/(3S)) = 1 to 2 digits; `catenaryParameterForLength` recovers
  a to 9 digits.
- `thermalSag(300, 1360, 23·10⁻⁶, ΔT)`: ΔT = 0 unchanged; +50 K lengthens by exactly α·ΔT
  (12 digits) and raises the sag by 1,5–2,6 m (≈ 8,3 → ≈ 10,3 m); α = 0 unchanged.
- `coreFluxPeak(20 kV, 50 Hz, 100)` = 20 000/(4,442882938·50·100) to 9 digits; scales as
  V/(N·f) (12 digits); V = 0 ⇒ 0.
- QA re-derivation (V.3): S = 300 m, a = 1000 m: sag 11,271 m (parabola 11,25 m); +50 K:
  12,893 m vs parabolic estimate 12,884 m; Φ̂(230 V, 50 Hz, 500) = 2,0707 mWb vs 4,44-rule
  2,0721 mWb.

**Validity limits.** Level span, uniform weight per metre, no wind or ice load, no elastic
stretch (upper estimate of the thermal sag), uniform conductor temperature; ideal transformer
core (no saturation, magnetising current or losses).

## 12. Visual mappings (honesty audit)

What drives each visual in the 3D scenes, with the scale stated to the user (model notes and
in-scene legends in `src/sims/*/`). "Computed" means the visual is the output of the model or
of §8–§11; anything else is an explicit display scale or gain.

| Simulator           | Visual                            | Driven by (model quantity)                                  | Scale / gain (as stated)                                                                                                  |
| ------------------- | --------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `faraday`           | B field lines                     | `createGapField` (§9)                                       | Computed shape, fixed count; only the pulse speed follows B.                                                              |
|                     | Current particles                 | f.e.m./V₀ (illustrative resistive load)                     | Speed ∝ f.e.m. (1,4 units/s at the peak); direction = sign of the f.e.m.                                                  |
|                     | Lamp brightness                   | (f.e.m./V₀)² = P/Pₘₐₓ                                       | Relative only (no absolute power); filament emissive 0,02 + 7·P/Pₘₐₓ. Bloom in `alta` dark can add a halo (QA-035).       |
| `lenz`              | Magnet field lines                | 8 point dipoles along the bar (`dipoleField`, §9)           | Same far field as the model's dipole; seeded at equal flux from the near face: lines through the coil grow with Φ.        |
|                     | Induced field (dashed)            | coil turns carrying i (`loopField`, §9)                     | **Visual gain ×500** (`INDUCED_VISUAL_GAIN`); labels show the true values. Drawn only while dΦ/dt ≠ 0.                    |
|                     | Force arrow F                     | dipole–loop interaction                                     | Length ∝ log₁₀\|F\|, 1 nN … 1 N.                                                                                          |
|                     | Galvanometer needle, particles    | i                                                           | 2nd-order meter (f₀ = 1,5 Hz, ζ = 0,6), auto-ranging 1-2-5 full scale; particle speed ∝ i (1,6 units/s at full scale).    |
| `alternator-motor`  | B field lines                     | `createGapField` (§9)                                       | Computed shape, fixed count.                                                                                              |
|                     | Lorentz force arrows, torque arcs | model F, τ                                                  | Length ∝ log₁₀\|F\|, 1 N … 1 kN.                                                                                          |
|                     | Current particles                 | i                                                           | 0,08 units/s per A, capped at 2,2 units/s.                                                                                |
|                     | Energy ribbons                    | mean power                                                  | Radius ∝ P; full thickness = auto-ranged P_ref shown in the legend.                                                       |
|                     | Winding temperature               | `thermalStep` (§10), C = 400 J/K, hA = 2 W/K                | Never reaches incandescence. Battery charge on an illustrative 5 kJ; flywheel radius ∝ J^¼.                               |
| `rl-energy`         | Cells                             | E                                                           | One cell per 1,5 V (max 16).                                                                                              |
|                     | B field lines                     | `solenoidField` (§9), flux-seeded                           | Number ∝ \|i\|/I\*, I\* = 1-2-5 full scale above I₀.                                                                      |
|                     | Purple glow                       | ½·L·i²                                                      | Full = ½·L·I₀² (lags the lines, ∝ i²).                                                                                    |
|                     | Amber arrow                       | L·\|di/dt\|                                                 | Equals E at t = 0⁺, then decays.                                                                                          |
|                     | Particles, ribbons                | i; E·i = R·i² + L·i·di/dt                                   | 0,4 units/s per A (max 3,0); ribbon radius ∝ P/(E·I\*), branch radii add up to the trunk.                                 |
|                     | Resistor wire                     | `thermalStep` (§10), C = 0,25 J/K, hA = 0,5 W/K (τ = 0,5 s) | Black-body glow only above 700 K; ironbow false colour 20–220 °C behind a toggle.                                         |
| `joule-transformer` | Turns, wire thickness             | N₁ : N₂; I per section                                      | Turns in proportion; wire radius ∝ √I (equal current density), clamped.                                                   |
|                     | Core flux loops                   | Φ̂ = `coreFluxPeak` (§11), pulsing as Φ̂·cos ωt               | Count ∝ Φ̂/2,25 Wb (max 12).                                                                                               |
|                     | Current particles                 | i(t) = √2·I·sin ωt per section                              | 0,003 units/s per A, capped at 3,2 units/s; 50 Hz shown 200× slower (the cap can hide the N₁/N₂ ratio at high P, QA-034). |
|                     | Span sag                          | `thermalSag` (§11) from the line temperature                | 0,1 units per metre; thermal time ×300.                                                                                   |
|                     | Line colour, haze                 | lumped line temperature; R′·I²                              | Ironbow 20–120 °C with the 80 °C mark, behind a toggle; haze (`alta`) full at 40 W/m.                                     |
|                     | Town windows                      | delivered power                                             | One lit window per 0,5 MW (max 200).                                                                                      |
| `kers-braking`      | Energy ribbons                    | MGU-K power                                                 | Radius 0,12 m at 350 kW (∝ P).                                                                                            |
|                     | Disc glow                         | `discThermalStep` (§8) → `blackbodyRGB` (§10)               | Black-body colour of the computed temperature; 60/40 front/rear split of the disc-brake power.                            |
| `car-dynamics`      | Force arrows                      | tyre, drag, MGU-K forces                                    | L = 0,9 m·log₁₀(1 + F/1 kN), max 2,2 m (1 kN → 0,27 m, 10 kN → 0,94 m, 40 kN → 1,45 m).                                   |
|                     | Pitch / heave                     | axle loads                                                  | Illustrative springs 350 / 300 kN/m, exaggerated ×2,5, limited.                                                           |
|                     | Ribbons, disc glow, contact patch | power; per-axle brake power; slip                           | 0,12 m at 350 kW; black-body colour as above; patch glow ∝ (κ/κ\*)².                                                      |
| car sims (shared)   | MGU-K / battery emissive          | P/350 kW; state of charge                                   | Stylised: MGU-K 0,08 + 3,2·√(P/350 kW), battery 0,6 + 1,2·charge (not stated in the notes at the time of QA-037).         |

Field lines are always traced from the §9 models; where their **number** carries meaning
(rl-energy, joule-transformer, lenz) each drawn line represents the same flux. Particle
velocities are signed with the current (counter-clockwise about n̂ for i > 0, §2) and still at
i = 0.
