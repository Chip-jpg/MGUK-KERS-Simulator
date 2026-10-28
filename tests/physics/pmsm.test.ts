import { describe, expect, it } from 'vitest';
import {
  clarke,
  dqToAbc,
  inverseClarke,
  inversePark,
  park,
  pmsmBaseSpeed,
  pmsmControllerVoltages,
  pmsmCopperLoss,
  pmsmCurrentControllerGains,
  pmsmCurrentDerivatives,
  pmsmDynamicsStep,
  pmsmEfficiency,
  pmsmElectricalPower,
  pmsmMaxTorque,
  pmsmMtpa,
  pmsmOperatingPoint,
  pmsmSteadyDynState,
  pmsmTorque,
  pmsmTorqueSpeedEnvelope,
  pmsmVoltageLimit,
  pmsmVoltages,
  rotatingLoop,
  type PmsmDynState,
  type PmsmParams,
} from '../../src/physics';
import { mulberry32, uniform } from './prng';

/** Illustrative salient machine (Ld < Lq), same as the sim's didactic preset. */
const IPM: PmsmParams = { Rs: 0.02, Ld: 0.2e-3, Lq: 0.35e-3, psiM: 0.08, p: 4 };
/** Illustrative non-salient machine (Ld = Lq). */
const SPM: PmsmParams = { Rs: 0.02, Ld: 0.25e-3, Lq: 0.25e-3, psiM: 0.1, p: 4 };
const IMAX = 400;
const VMAX = 600 / Math.sqrt(3);
const rpmToRad = (n: number): number => (n * Math.PI) / 30;

function randomMachine(rnd: () => number): PmsmParams {
  const Ld = uniform(rnd, 0.05e-3, 1e-3);
  return {
    Rs: uniform(rnd, 0, 0.1),
    Ld,
    Lq: Ld * uniform(rnd, 1, 3),
    psiM: uniform(rnd, 0.01, 0.2),
    p: 1 + Math.floor(rnd() * 6),
  };
}

describe('Clarke / Park (amplitude-invariant)', () => {
  it('balanced three-phase set → vector of length equal to the amplitude', () => {
    const X = 7.3;
    for (const th of [0, 0.4, 1.9, -2.2, 5]) {
      const r = clarke(
        X * Math.cos(th),
        X * Math.cos(th - (2 * Math.PI) / 3),
        X * Math.cos(th + (2 * Math.PI) / 3),
      );
      expect(r.alpha).toBeCloseTo(X * Math.cos(th), 12);
      expect(r.beta).toBeCloseTo(X * Math.sin(th), 12);
      expect(Math.abs(r.zero)).toBeLessThan(1e-12);
      // in the rotor frame aligned with the vector: pure d component
      const dq = park(r.alpha, r.beta, th);
      expect(dq.d).toBeCloseTo(X, 12);
      expect(Math.abs(dq.q)).toBeLessThan(1e-12);
    }
  });

  it('round trips abc → αβ0 → abc and αβ → dq → αβ', () => {
    const rnd = mulberry32(42);
    for (let k = 0; k < 200; k++) {
      const a = uniform(rnd, -100, 100);
      const b = uniform(rnd, -100, 100);
      const c = uniform(rnd, -100, 100);
      const ab = clarke(a, b, c);
      const back = inverseClarke(ab.alpha, ab.beta, ab.zero);
      expect(back.a).toBeCloseTo(a, 10);
      expect(back.b).toBeCloseTo(b, 10);
      expect(back.c).toBeCloseTo(c, 10);
      const th = uniform(rnd, -10, 10);
      const dq = park(ab.alpha, ab.beta, th);
      const ab2 = inversePark(dq.d, dq.q, th);
      expect(ab2.alpha).toBeCloseTo(ab.alpha, 10);
      expect(ab2.beta).toBeCloseTo(ab.beta, 10);
      // dqToAbc = inverse Park + inverse Clarke (zero sequence dropped)
      const abc = dqToAbc(dq.d, dq.q, th);
      expect(abc.a).toBeCloseTo(a - ab.zero, 10);
      expect(abc.b).toBeCloseTo(b - ab.zero, 10);
      expect(abc.c).toBeCloseTo(c - ab.zero, 10);
      expect(Math.abs(abc.a + abc.b + abc.c)).toBeLessThan(1e-9);
    }
  });

  it('inverseClarke default zero sequence is 0; −0 is normalised', () => {
    expect(inverseClarke(1, 0)).toEqual({ a: 1, b: -0.5, c: -0.5 });
    expect(Object.is(clarke(0, 0, 0).alpha, 0)).toBe(true);
    expect(Object.is(park(0, 0, 1).q, 0)).toBe(true);
  });

  it('rejects non-finite input', () => {
    expect(() => clarke(Number.NaN, 0, 0)).toThrow(RangeError);
    expect(() => inverseClarke(0, Infinity)).toThrow(RangeError);
    expect(() => park(0, 0, Number.NaN)).toThrow(RangeError);
    expect(() => inversePark(Number.NaN, 0, 0)).toThrow(RangeError);
  });
});

describe('steady-state equations', () => {
  it('voltages follow v_d = Rs i_d − ωLq i_q, v_q = Rs i_q + ωLd i_d + ωψ', () => {
    const v = pmsmVoltages(-100, 200, 2000, IPM);
    expect(v.vd).toBeCloseTo(0.02 * -100 - 2000 * 0.35e-3 * 200, 12);
    expect(v.vq).toBeCloseTo(0.02 * 200 + 2000 * 0.2e-3 * -100 + 2000 * 0.08, 12);
  });

  it('torque = (3/2) p [ψ i_q + (Ld − Lq) i_d i_q]', () => {
    expect(pmsmTorque(-100, 200, IPM)).toBeCloseTo(
      1.5 * 4 * (0.08 * 200 + -0.15e-3 * -100 * 200),
      12,
    );
    expect(pmsmTorque(0, 0, IPM)).toBe(0);
    // reluctance torque vanishes for Ld = Lq: only i_q matters
    expect(pmsmTorque(-300, 100, SPM)).toBeCloseTo(pmsmTorque(0, 100, SPM), 12);
  });

  it('torque equals the energy method: T = ∂W′/∂θ_mech at constant stator currents', () => {
    // Magnetic co-energy (amplitude-invariant ⇒ factor 3/2):
    // W′(θ) = (3/2)[½ Ld i_d² + ½ Lq i_q² + ψ i_d] with (i_d, i_q) = Park(i_α, i_β, θ_e).
    const rnd = mulberry32(7);
    for (let k = 0; k < 50; k++) {
      const m = randomMachine(rnd);
      const ia = uniform(rnd, -300, 300);
      const ib = uniform(rnd, -300, 300);
      const thM = uniform(rnd, 0, 2 * Math.PI);
      const W = (thetaMech: number): number => {
        const dq = park(ia, ib, m.p * thetaMech);
        return 1.5 * (0.5 * m.Ld * dq.d ** 2 + 0.5 * m.Lq * dq.q ** 2 + m.psiM * dq.d);
      };
      const h = 1e-6;
      const tEnergy = (W(thM + h) - W(thM - h)) / (2 * h);
      const dq = park(ia, ib, m.p * thM);
      const t = pmsmTorque(dq.d, dq.q, m);
      expect(Math.abs(tEnergy - t)).toBeLessThan(1e-5 * Math.max(1, Math.abs(t)));
    }
  });

  it('power balance P_elec = P_mech + P_Cu to 1e-9 (motoring and generating)', () => {
    const rnd = mulberry32(2026);
    let motoring = 0;
    let generating = 0;
    for (let k = 0; k < 400; k++) {
      const m = randomMachine(rnd);
      const id = uniform(rnd, -400, 100);
      const iq = uniform(rnd, -400, 400);
      const w = uniform(rnd, 0, 2000);
      const op = pmsmOperatingPoint(id, iq, w, m);
      const scale = Math.max(1, Math.abs(op.pElec), Math.abs(op.pMech), op.pCu);
      expect(Math.abs(op.pElec - op.pMech - op.pCu) / scale).toBeLessThan(1e-9);
      expect(op.pMech).toBeCloseTo(op.torque * w, 6);
      expect(op.pCu).toBeCloseTo(pmsmCopperLoss(id, iq, m.Rs), 9);
      expect(op.pElec).toBeCloseTo(pmsmElectricalPower(op.vd, op.vq, id, iq), 9);
      expect(op.vMag).toBeCloseTo(Math.hypot(op.vd, op.vq), 9);
      expect(op.iMag).toBeCloseTo(Math.hypot(id, iq), 9);
      if (op.pMech > 0) motoring++;
      if (op.pMech < 0) generating++;
    }
    expect(motoring).toBeGreaterThan(50);
    expect(generating).toBeGreaterThan(50);
  });

  it('regeneration sign conventions: braking ⇒ T < 0, P_mech < 0, battery receives P_elec < 0', () => {
    const w = rpmToRad(4000);
    const gen = pmsmMtpa(300, IPM, 'generator');
    expect(gen.iq).toBeLessThan(0);
    const op = pmsmOperatingPoint(gen.id, gen.iq, w, IPM);
    expect(op.torque).toBeLessThan(0);
    expect(op.pMech).toBeLessThan(0);
    expect(op.pElec).toBeLessThan(0);
    expect(-op.pElec).toBeLessThan(-op.pMech); // copper loss: battery gets less than the shaft gives
    expect(op.efficiency).toBeCloseTo(op.pElec / op.pMech, 12);
    const mot = pmsmOperatingPoint(gen.id, -gen.iq, w, IPM);
    expect(mot.torque).toBeCloseTo(-op.torque, 9);
    expect(mot.efficiency).toBeCloseTo(mot.pMech / mot.pElec, 12);
    expect(mot.efficiency).toBeGreaterThan(0.9);
  });

  it('efficiency is NaN when undefined', () => {
    expect(pmsmEfficiency(0, 0)).toBeNaN();
    expect(pmsmEfficiency(100, 0)).toBeNaN(); // only losses
    expect(pmsmEfficiency(10, -50)).toBeNaN(); // braking at a loss (Cu > |P_mech|)
    expect(pmsmEfficiency(100, 90)).toBeCloseTo(0.9, 12);
    expect(pmsmEfficiency(-90, -100)).toBeCloseTo(0.9, 12);
  });

  it('link to slides 18–19: back-emf amplitude ωₑψₘ equals V₀ = NBSω when ψₘ = NBS', () => {
    const N = 50;
    const B = 0.8;
    const S = 2.5e-3;
    const omega = 314;
    const m: PmsmParams = { Rs: 0.1, Ld: 1e-3, Lq: 1e-3, psiM: N * B * S, p: 1 };
    const v = pmsmVoltages(0, 0, omega, m);
    expect(Math.hypot(v.vd, v.vq)).toBeCloseTo(rotatingLoop(B, S, N, omega, 0).V0, 12);
    // Phase a at zero current (motor convention v = dψ/dt) is minus the induced emf of the slides.
    for (const t of [0, 0.001, 0.0042, 0.013]) {
      const va = dqToAbc(v.vd, v.vq, omega * t).a;
      expect(va).toBeCloseTo(-rotatingLoop(B, S, N, omega, t).emf, 9);
    }
  });

  it('validates parameters', () => {
    expect(() => pmsmTorque(0, 0, { ...IPM, p: 1.5 })).toThrow(/integer/);
    expect(() => pmsmTorque(0, 0, { ...IPM, Ld: 0 })).toThrow(RangeError);
    expect(() => pmsmVoltages(0, 0, 1, { ...IPM, Rs: -1 })).toThrow(RangeError);
    expect(() => pmsmVoltages(0, 0, 1, { ...IPM, psiM: -0.1 })).toThrow(RangeError);
    expect(() => pmsmCopperLoss(1, 1, -1)).toThrow(RangeError);
    expect(() => pmsmElectricalPower(Number.NaN, 0, 0, 0)).toThrow(RangeError);
    expect(() => pmsmOperatingPoint(0, 0, Infinity, IPM)).toThrow(RangeError);
  });
});

describe('operating limits', () => {
  it('V_max = V_DC/√3', () => {
    expect(pmsmVoltageLimit(600)).toBeCloseTo(346.41016, 4);
    expect(() => pmsmVoltageLimit(0)).toThrow(RangeError);
  });

  it('MTPA reduces to i_d = 0 for Ld = Lq', () => {
    for (const I of [0, 1, 50, 400]) {
      const r = pmsmMtpa(I, SPM);
      expect(r.id).toBe(0);
      expect(r.iq).toBeCloseTo(I, 12);
    }
  });

  it('MTPA closed form equals the brute-force maximum on the current circle', () => {
    const rnd = mulberry32(99);
    for (let k = 0; k < 40; k++) {
      const m = randomMachine(rnd);
      const I = uniform(rnd, 10, 500);
      const r = pmsmMtpa(I, m);
      expect(Math.hypot(r.id, r.iq)).toBeCloseTo(I, 9);
      let best = -Infinity;
      for (let j = 0; j <= 20000; j++) {
        const g = (Math.PI * j) / 20000;
        best = Math.max(best, pmsmTorque(I * Math.cos(g), I * Math.sin(g), m));
      }
      const t = pmsmTorque(r.id, r.iq, m);
      expect(t).toBeGreaterThanOrEqual(best - 1e-9 * Math.abs(best));
      expect(t - best).toBeLessThan(1e-6 * Math.abs(best));
      if (m.Lq > m.Ld) expect(r.id).toBeLessThan(0); // interior magnets: negative i_d
    }
  });

  it('MTPA: generator branch mirrors i_q; reverse saliency gives i_d > 0; ψ = 0 gives 45°', () => {
    const mot = pmsmMtpa(300, IPM);
    const gen = pmsmMtpa(300, IPM, 'generator');
    expect(gen.id).toBe(mot.id);
    expect(gen.iq).toBe(-mot.iq);
    expect(pmsmMtpa(100, { ...IPM, Ld: 0.5e-3 }).id).toBeGreaterThan(0);
    const rel = pmsmMtpa(100, { ...IPM, psiM: 0 });
    expect(rel.id).toBeCloseTo(-100 / Math.SQRT2, 9);
    expect(rel.iq).toBeCloseTo(100 / Math.SQRT2, 9);
    expect(() => pmsmMtpa(-1, IPM)).toThrow(RangeError);
  });

  it('MTPA: ψ = 0 and Ld = Lq (no torque at all) is defined, not NaN (QA-024)', () => {
    const m = { Rs: 0.02, Ld: 1e-4, Lq: 1e-4, psiM: 0, p: 4 };
    expect(pmsmMtpa(100, m)).toEqual({ id: 0, iq: 100 });
    expect(pmsmMtpa(100, m, 'generator')).toEqual({ id: 0, iq: -100 });
    expect(pmsmTorque(0, 100, m)).toBe(0);
    const vMax = pmsmVoltageLimit(600);
    const wb = pmsmBaseSpeed(m, 100, vMax);
    expect(Number.isFinite(wb)).toBe(true);
    expect(wb).toBeGreaterThan(0);
    const top = pmsmMaxTorque(wb / 2, m, 100, vMax);
    expect(top.torque).toBe(0);
    expect(Number.isNaN(top.id) || Number.isNaN(top.iq)).toBe(false);
  });

  it('base speed: the MTPA point at I_max sits exactly on the voltage limit', () => {
    const wb = pmsmBaseSpeed(IPM, IMAX, VMAX);
    const r = pmsmMtpa(IMAX, IPM);
    const v = pmsmVoltages(r.id, r.iq, IPM.p * wb, IPM);
    expect(Math.hypot(v.vd, v.vq)).toBeCloseTo(VMAX, 6);
    expect(wb * (30 / Math.PI)).toBeGreaterThan(5000);
    expect(wb * (30 / Math.PI)).toBeLessThan(7000);
    // R·I_max above V_max: no constant-torque region
    expect(pmsmBaseSpeed({ ...IPM, Rs: 2 }, IMAX, VMAX)).toBe(0);
    expect(() => pmsmBaseSpeed(IPM, 0, VMAX)).toThrow(RangeError);
  });

  it('envelope: constant torque below base speed, ≈ constant power above it', () => {
    const omegaMax = rpmToRad(20000);
    const env = pmsmTorqueSpeedEnvelope(IPM, IMAX, VMAX, omegaMax, 101);
    expect(env.points).toHaveLength(101);
    expect(env.points[0]?.omegaMech).toBe(0);
    expect(env.points[100]?.omegaMech).toBeCloseTo(omegaMax, 9);
    const tMax = pmsmTorque(pmsmMtpa(IMAX, IPM).id, pmsmMtpa(IMAX, IPM).iq, IPM);
    const wb = env.baseSpeed;
    const pRef = pmsmMaxTorque(2.5 * wb, IPM, IMAX, VMAX).power;
    for (const q of env.points) {
      if (q.omegaMech <= wb) {
        expect(q.regionMotor).toBe('mtpa');
        expect(q.tMotor).toBeCloseTo(tMax, 9);
        expect(q.tGen).toBeCloseTo(-tMax, 9);
      } else {
        expect(q.regionMotor).not.toBe('mtpa');
        expect(q.tMotor).toBeLessThan(tMax);
        // power never drops below the corner power in field weakening
        expect(q.pMotor).toBeGreaterThan(0.99 * tMax * wb);
      }
      if (q.omegaMech >= 2 * wb && q.omegaMech <= 3.2 * wb) {
        expect(Math.abs(q.pMotor / pRef - 1)).toBeLessThan(0.05);
      }
      expect(q.pMotor).toBeCloseTo(q.tMotor * q.omegaMech, 6);
      expect(q.pGen).toBeCloseTo(q.tGen * q.omegaMech, 6);
      expect(q.tGen).toBeLessThanOrEqual(0);
    }
    expect(() => pmsmTorqueSpeedEnvelope(IPM, IMAX, VMAX, omegaMax, 1)).toThrow(RangeError);
    expect(() => pmsmTorqueSpeedEnvelope(IPM, IMAX, VMAX, 0)).toThrow(RangeError);
  });

  it('field-weakening points lie on both limits; the result is the true constrained maximum', () => {
    const rnd = mulberry32(5);
    const cases: [PmsmParams, number, number, number][] = [
      [IPM, IMAX, VMAX, rpmToRad(9000)],
      [SPM, IMAX, VMAX, rpmToRad(12000)],
      [IPM, 500, VMAX, rpmToRad(20000)],
    ];
    for (let k = 0; k < 6; k++) {
      cases.push([
        randomMachine(rnd),
        uniform(rnd, 100, 500),
        uniform(rnd, 100, 400),
        uniform(rnd, 100, 3000),
      ]);
    }
    for (const [m, iMax, vMax, w] of cases) {
      for (const mode of ['motor', 'generator'] as const) {
        const r = pmsmMaxTorque(w, m, iMax, vMax, mode);
        const sgn = mode === 'motor' ? 1 : -1;
        const vOf = (id: number, iq: number): number => {
          const v = pmsmVoltages(id, iq, m.p * w, m);
          return Math.hypot(v.vd, v.vq);
        };
        if (r.region !== 'infeasible') {
          expect(Math.hypot(r.id, r.iq)).toBeLessThanOrEqual(iMax * (1 + 1e-9));
          expect(vOf(r.id, r.iq)).toBeLessThanOrEqual(vMax * (1 + 1e-9));
          expect(sgn * r.torque).toBeGreaterThan(0);
          expect(r.torque).toBeCloseTo(pmsmTorque(r.id, r.iq, m), 9);
        }
        if (r.region === 'field-weakening') {
          expect(Math.hypot(r.id, r.iq)).toBeCloseTo(iMax, 4);
          expect(vOf(r.id, r.iq) / vMax).toBeCloseTo(1, 6);
        }
        // brute force over two polar grids: the current disk and the voltage ellipse
        // (the feasible set can be a thin sliver of either at high speed)
        let best = 0;
        const tryPt = (id: number, iq: number): void => {
          if (vOf(id, iq) <= vMax && Math.hypot(id, iq) <= iMax) {
            best = Math.max(best, sgn * pmsmTorque(id, iq, m));
          }
        };
        const we = m.p * w;
        const det = m.Rs ** 2 + we ** 2 * m.Ld * m.Lq;
        for (let a = 1; a <= 200; a++) {
          for (let g = 0; g < 720; g++) {
            const c = Math.cos((g * Math.PI) / 360);
            const s = Math.sin((g * Math.PI) / 360);
            tryPt((iMax * a * c) / 200, (iMax * a * s) / 200);
            const x = (vMax * a * c) / 200;
            const y = (vMax * a * s) / 200 - we * m.psiM;
            tryPt((m.Rs * x + we * m.Lq * y) / det, (-we * m.Ld * x + m.Rs * y) / det);
          }
        }
        expect(sgn * r.torque).toBeGreaterThanOrEqual(best - 1e-9);
        // grid resolution 0,5 % of the radius: the refined optimum may exceed it slightly
        expect(sgn * r.torque - best).toBeLessThan(0.03 * Math.max(best, 1e-3) + 1e-6);
      }
    }
  });

  it('regeneration mirror: exact for Rs = 0, braking has more voltage margin for Rs > 0', () => {
    const lossless = { ...IPM, Rs: 0 };
    for (const n of [1000, 8000, 15000]) {
      const w = rpmToRad(n);
      const mot = pmsmMaxTorque(w, lossless, IMAX, VMAX, 'motor');
      const gen = pmsmMaxTorque(w, lossless, IMAX, VMAX, 'generator');
      expect(gen.torque).toBeCloseTo(-mot.torque, 6);
      expect(gen.id).toBeCloseTo(mot.id, 3);
      expect(gen.iq).toBeCloseTo(-mot.iq, 3);
      const genR = pmsmMaxTorque(w, IPM, IMAX, VMAX, 'generator');
      const motR = pmsmMaxTorque(w, IPM, IMAX, VMAX, 'motor');
      expect(-genR.torque).toBeGreaterThanOrEqual(motR.torque - 1e-9);
      expect(genR.power).toBeLessThanOrEqual(0);
    }
  });

  it('MTPV region when I_max > ψ/Ld, infeasible beyond the maximum speed when I_max < ψ/Ld', () => {
    // characteristic current ψ/Ld = 400 A
    const mtpv = pmsmMaxTorque(rpmToRad(30000), IPM, 600, VMAX);
    expect(mtpv.region).toBe('mtpv');
    expect(Math.hypot(mtpv.id, mtpv.iq)).toBeLessThan(600);
    const none = pmsmMaxTorque(rpmToRad(40000), IPM, 150, VMAX);
    expect(none).toEqual({ torque: 0, id: 0, iq: 0, power: 0, region: 'infeasible' });
    const noneGen = pmsmMaxTorque(rpmToRad(40000), IPM, 150, VMAX, 'generator');
    expect(noneGen.region).toBe('infeasible');
    // at standstill with Rs = 0 the voltage limit never binds
    expect(pmsmMaxTorque(0, { ...IPM, Rs: 0 }, IMAX, VMAX).region).toBe('mtpa');
    expect(() => pmsmMaxTorque(-1, IPM, IMAX, VMAX)).toThrow(RangeError);
    expect(() => pmsmMaxTorque(1, IPM, IMAX, 0)).toThrow(RangeError);
  });
});

describe('dynamic model with PI current control', () => {
  const wc = 2 * Math.PI * 200;
  const ctl = pmsmCurrentControllerGains(IPM, wc);

  it('gains by pole-zero cancellation', () => {
    expect(ctl.kpd).toBeCloseTo(IPM.Ld * wc, 12);
    expect(ctl.kpq).toBeCloseTo(IPM.Lq * wc, 12);
    expect(ctl.kid).toBeCloseTo(IPM.Rs * wc, 12);
    expect(ctl.kiq).toBeCloseTo(IPM.Rs * wc, 12);
    expect(() => pmsmCurrentControllerGains(IPM, 0)).toThrow(RangeError);
  });

  it('current derivatives vanish at the steady-state voltages', () => {
    const w = 1500;
    const v = pmsmVoltages(-80, 150, w, IPM);
    const [a, b] = pmsmCurrentDerivatives(-80, 150, v.vd, v.vq, w, IPM);
    expect(Math.abs(a)).toBeLessThan(1e-9);
    expect(Math.abs(b)).toBeLessThan(1e-9);
    expect(() => pmsmCurrentDerivatives(0, 0, Number.NaN, 0, 0, IPM)).toThrow(RangeError);
  });

  it('steady state is an equilibrium; the controller outputs the steady-state voltages', () => {
    const inp = { idRef: -120, iqRef: 250, omegaE: IPM.p * rpmToRad(3000), vMax: VMAX };
    const s0 = pmsmSteadyDynState(inp.idRef, inp.iqRef, IPM, ctl);
    const v = pmsmControllerVoltages(s0, inp, IPM, ctl);
    const vs = pmsmVoltages(inp.idRef, inp.iqRef, inp.omegaE, IPM);
    expect(v.saturated).toBe(false);
    expect(v.vd).toBeCloseTo(vs.vd, 9);
    expect(v.vq).toBeCloseTo(vs.vq, 9);
    let s: PmsmDynState = s0;
    for (let k = 0; k < 100; k++) s = pmsmDynamicsStep(s, inp, IPM, ctl, 1e-4);
    expect(s.id).toBeCloseTo(inp.idRef, 6);
    expect(s.iq).toBeCloseTo(inp.iqRef, 6);
    expect(
      pmsmSteadyDynState(
        1,
        2,
        { ...IPM, Rs: 0 },
        pmsmCurrentControllerGains({ ...IPM, Rs: 0 }, wc),
      ),
    ).toEqual({
      id: 1,
      iq: 2,
      xd: 0,
      xq: 0,
    });
  });

  it('closed-loop step response is first order: i(1/ω_c) = 63,2 % of i* (like the RL circuit)', () => {
    const inp = { idRef: -100, iqRef: 200, omegaE: IPM.p * rpmToRad(2000), vMax: VMAX };
    let s: PmsmDynState = { id: 0, iq: 0, xd: 0, xq: 0 };
    const n = 400;
    for (let k = 0; k < n; k++) s = pmsmDynamicsStep(s, inp, IPM, ctl, 1 / wc / n);
    expect(s.id / inp.idRef).toBeCloseTo(1 - Math.exp(-1), 6);
    expect(s.iq / inp.iqRef).toBeCloseTo(1 - Math.exp(-1), 6);
  });

  it('voltage saturation: |v| ≤ V_max, integrators frozen, deterministic, sub-stepped large dt', () => {
    const inp = { idRef: 0, iqRef: 400, omegaE: IPM.p * rpmToRad(15000), vMax: VMAX };
    const s0: PmsmDynState = { id: 0, iq: 0, xd: 0, xq: 0 };
    const v0 = pmsmControllerVoltages(s0, inp, IPM, ctl);
    expect(v0.saturated).toBe(true);
    expect(Math.hypot(v0.vd, v0.vq)).toBeCloseTo(VMAX, 9);
    let s = s0;
    for (let k = 0; k < 200; k++) s = pmsmDynamicsStep(s, inp, IPM, ctl, 1e-4);
    let s2 = s0;
    for (let k = 0; k < 200; k++) s2 = pmsmDynamicsStep(s2, inp, IPM, ctl, 1e-4);
    expect(s2).toEqual(s); // deterministic
    expect(Number.isFinite(s.id) && Number.isFinite(s.iq)).toBe(true);
    const v = pmsmControllerVoltages(s, inp, IPM, ctl);
    expect(Math.hypot(v.vd, v.vq)).toBeLessThanOrEqual(VMAX * (1 + 1e-12));
    // the set-point is unreachable: the current settles below it
    expect(s.iq).toBeLessThan(inp.iqRef);
    // one big step equals many sub-steps (internal sub-stepping keeps RK4 stable)
    const big = pmsmDynamicsStep(
      s0,
      { ...inp, iqRef: 100, omegaE: IPM.p * rpmToRad(2000) },
      IPM,
      ctl,
      0.02,
    );
    expect(Number.isFinite(big.id)).toBe(true);
    expect(big.iq).toBeCloseTo(100, 3);
    expect(pmsmDynamicsStep(s0, inp, IPM, ctl, 0)).toEqual(s0);
    expect(() => pmsmDynamicsStep(s0, inp, IPM, ctl, -1)).toThrow(RangeError);
    expect(() => pmsmDynamicsStep({ ...s0, id: Number.NaN }, inp, IPM, ctl, 1e-3)).toThrow(
      RangeError,
    );
  });
});
