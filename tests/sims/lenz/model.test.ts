import { describe, expect, it } from 'vitest';
import { MU_0, PHYSICS_DT, lenzSign } from '../../../src/physics';
import {
  DWELL_END,
  DWELL_START,
  Z_FAR,
  Z_NEAR,
  autoStep,
  axialMoment,
  coilArea,
  dFluxDz,
  fluxPerTurn,
  followStep,
  forceOnMagnet,
  induction,
  initialAutoState,
  meanField,
  type CoilParams,
  type Direction,
  type Pole,
} from '../../../src/sims/lenz/model';
import { defaultParams, params } from '../../../src/sims/lenz/params';
import { describeStatus } from '../../../src/sims/lenz/status';

const base: Omit<CoilParams, 'pole'> = { m: 5, a: 0.04, N: 200, R: 10 };
const dt = PHYSICS_DT;

/**
 * GATE (§6 A5, slide 11). Convention: coil normal n̂ points toward the magnet,
 * so "seen from the tip of n̂" (lenzSign doc) = seen from the magnet.
 *
 * Derivation, N pole approaching: field lines leave the N pole and enter the
 * coil, so B at the coil points AWAY from the magnet (−n̂) and Φ < 0. Getting
 * closer, |Φ| grows: Φ becomes more negative, dΦ/dt < 0 ⇒ lenzSign = +1 ⇒
 * current counter-clockwise seen from the magnet, induced field along +n̂
 * (toward the magnet): the coil face toward the magnet is a N pole and repels
 * the magnet (slide 11 / theory 04-lenz). The other three cases follow by
 * flipping the pole (Φ changes sign) and/or the motion (dΦ/dt changes sign).
 */
const CASES: Array<{
  pole: Pole;
  motion: Direction;
  dir: 'antiorario' | 'orario';
  face: Pole;
  force: 'repulsiva' | 'attrattiva';
}> = [
  { pole: 'N', motion: 'avvicina', dir: 'antiorario', face: 'N', force: 'repulsiva' },
  { pole: 'N', motion: 'allontana', dir: 'orario', face: 'S', force: 'attrattiva' },
  { pole: 'S', motion: 'avvicina', dir: 'orario', face: 'S', force: 'repulsiva' },
  { pole: 'S', motion: 'allontana', dir: 'antiorario', face: 'N', force: 'attrattiva' },
];

describe('lenz gate: 4 cases (pole × approach/leave) match slide 11', () => {
  for (const c of CASES) {
    it(`polo ${c.pole}, ${c.motion} ⇒ corrente ${c.dir}, faccia ${c.face}, forza ${c.force}`, () => {
      const p = { ...base, pole: c.pole };
      const z0 = 0.15;
      const z1 = c.motion === 'avvicina' ? z0 - 0.3 * dt : z0 + 0.3 * dt;
      const ind = induction(p, z0, z1, dt);

      // The displayed direction is exactly lenzSign(ΔΦ/Δt).
      expect(ind.sign).toBe(lenzSign(ind.dPhi / dt));
      expect(ind.dir).toBe(c.dir);
      expect(ind.facePole).toBe(c.face);
      expect(ind.force).toBe(c.force);
      // Slide 11: the induced field opposes the variation of Φ.
      expect(Math.sign(ind.Bind) * Math.sign(ind.dPhi)).toBe(-1);
      // Current sign agrees with the Lenz sign; the force opposes the motion.
      expect(Math.sign(ind.i)).toBe(ind.sign);
      expect(Math.sign(ind.F) * Math.sign(ind.v)).toBe(-1);
      // Status text shown in the badge.
      const st = describeStatus(ind);
      expect(st.main).toBe(
        `Il polo affacciato della bobina è ${c.face} → si oppone ${
          c.motion === 'avvicina' ? 'all’avvicinamento' : 'all’allontanamento'
        }.`,
      );
      expect(st.sub).toContain(`verso ${c.dir}`);
    });
  }

  it('magnet at rest ⇒ no current, direction "nessuna"', () => {
    const ind = induction({ ...base, pole: 'N' }, 0.2, 0.2, dt);
    expect(ind.emf).toBe(0);
    expect(ind.i).toBe(0);
    expect(ind.dir).toBe('nessuna');
    expect(ind.facePole).toBeNull();
    expect(ind.force).toBe('nessuna');
    expect(describeStatus(ind).main).toMatch(/nessuna corrente/);
  });
});

describe('lenz model: field, flux, emf', () => {
  it('N facing ⇒ moment toward the coil (m_x < 0) and B at the coil along −n̂', () => {
    expect(axialMoment('N', 3)).toBe(-3);
    expect(axialMoment('S', 3)).toBe(3);
    expect(meanField(axialMoment('N', 3), 0.1, 0.04)).toBeLessThan(0);
  });

  it('mean field reduces to the point-dipole axial field μ0 m / (2π z³) for a ≪ z', () => {
    const z = 0.3;
    const B = meanField(2, z, 1e-5);
    expect(B).toBeCloseTo((MU_0 * 2) / (2 * Math.PI * z ** 3), 12);
  });

  it('flux = B̄·πa² = μ0 m a² / (2 (z²+a²)^{3/2}) (dipole–loop reciprocity)', () => {
    const [mx, z, a] = [4, 0.12, 0.05];
    expect(fluxPerTurn(mx, z, a)).toBeCloseTo(meanField(mx, z, a) * coilArea(a), 15);
    expect(fluxPerTurn(mx, z, a)).toBeCloseTo(
      (MU_0 * mx * a * a) / (2 * (z * z + a * a) ** 1.5),
      15,
    );
  });

  it('analytic dΦ/dz matches a central finite difference', () => {
    const [mx, z, a, h] = [-5, 0.1, 0.04, 1e-6];
    const fd = (fluxPerTurn(mx, z + h, a) - fluxPerTurn(mx, z - h, a)) / (2 * h);
    expect(dFluxDz(mx, z, a)).toBeCloseTo(fd, 10);
  });

  it('emf = −N ΔΦ/Δt and i = emf/R for the step', () => {
    const p = { ...base, pole: 'S' as Pole };
    const ind = induction(p, 0.2, 0.199, dt);
    const dPhi =
      fluxPerTurn(axialMoment('S', p.m), 0.199, p.a) - fluxPerTurn(axialMoment('S', p.m), 0.2, p.a);
    expect(ind.emf).toBeCloseTo((-p.N * dPhi) / dt, 12);
    expect(ind.i).toBeCloseTo(ind.emf / p.R, 12);
  });

  it('energy balance: mechanical power on the magnet = −R i² (Lenz ⇔ conservation of energy)', () => {
    for (const pole of ['N', 'S'] as const) {
      for (const v of [-0.6, 0.4]) {
        const p = { ...base, pole };
        const z0 = 0.12;
        const ind = induction(p, z0, z0 + v * 1e-6, 1e-6);
        const Pmech = ind.F * ind.v;
        expect(Pmech).toBeLessThan(0);
        expect(Pmech / (-p.R * ind.i * ind.i)).toBeCloseTo(1, 5);
      }
    }
  });

  it('force formula: N i ∂Φ/∂z', () => {
    expect(forceOnMagnet(10, 0.5, 2, 0.1, 0.03)).toBeCloseTo(10 * 0.5 * dFluxDz(2, 0.1, 0.03), 15);
  });
});

describe('lenz kinematics', () => {
  it('followStep moves at most v·dt and lands on the target', () => {
    expect(followStep(0.2, 0.1, 0.24, dt)).toBeCloseTo(0.199, 12);
    expect(followStep(0.2, 0.2005, 0.24, dt)).toBe(0.2005);
  });

  it('auto run: approach goes Z_FAR → Z_NEAR in (Z_FAR−Z_NEAR)/v, rests, then jumps back', () => {
    const v = 0.4;
    let s = initialAutoState('avvicina');
    expect(s.z).toBe(Z_FAR);
    let time = 0;
    let jumped = false;
    let arrivedAt = -1;
    while (time < 3 && !jumped) {
      const r = autoStep(s, 'avvicina', v, dt);
      s = r.state;
      time += dt;
      jumped = r.jumped;
      if (s.phase === 'dwellEnd' && arrivedAt < 0) arrivedAt = time;
    }
    expect(arrivedAt).toBeCloseTo(DWELL_START + (Z_FAR - Z_NEAR) / v, 1);
    expect(jumped).toBe(true);
    expect(time).toBeCloseTo(arrivedAt + DWELL_END, 1);
    expect(s.z).toBe(Z_FAR);
  });

  it('auto run: z is monotonic in the move phase (constant sign of the current)', () => {
    let s = initialAutoState('allontana');
    let prev = s.z;
    for (let k = 0; k < 400; k++) {
      const r = autoStep(s, 'allontana', 0.5, dt);
      s = r.state;
      if (!r.jumped) expect(s.z).toBeGreaterThanOrEqual(prev);
      prev = s.z;
    }
  });
});

describe('lenz params', () => {
  it('every param has a valid spec and defaults inside the range', () => {
    const d = defaultParams();
    for (const [k, spec] of Object.entries(params)) {
      expect(spec.min).toBeLessThan(spec.max);
      expect(spec.step).toBeGreaterThan(0);
      expect(spec.default).toBeGreaterThanOrEqual(spec.min);
      expect(spec.default).toBeLessThanOrEqual(spec.max);
      expect(spec.labelIT.length).toBeGreaterThan(0);
      expect(spec.unit.length).toBeGreaterThan(0);
      expect(d[k as keyof typeof d]).toBe(spec.default);
    }
  });
});
