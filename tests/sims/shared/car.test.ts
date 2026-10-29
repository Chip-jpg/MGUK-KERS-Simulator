import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { G_STANDARD, PHYSICS_DT } from '../../../src/physics';
import {
  BRAKE_DISC_ILLUSTRATIVE,
  celsiusToKelvin,
  discHeatCapacity,
} from '../../../src/physics/brake-thermal';
import {
  CAR_DIMS,
  SUSPENSION_ILLUSTRATIVE,
  rideFromLoads,
  visualRide,
} from '../../../src/sims/shared/car/dims';
import { DISC_START_DEFAULT_C, createDiscPair } from '../../../src/sims/shared/car/discs';
import { loftGeometry, resampleStations, wingGeometry } from '../../../src/sims/shared/car/loft';
import * as kers from '../../../src/sims/kers-braking/model';
import * as cd from '../../../src/sims/car-dynamics/model';

describe('shared car dimensions and ride', () => {
  it('wheelbase matches the car-dynamics model', () => {
    expect(CAR_DIMS.frontAxleX - CAR_DIMS.rearAxleX).toBeCloseTo(cd.FIXED.L, 12);
    expect(CAR_DIMS.wheelbase).toBe(cd.FIXED.L);
  });

  it('pitch/heave from axle loads: transfer dives the nose, downforce lowers the car', () => {
    const r = rideFromLoads(13e3, 3e3, 8e3, 8e3);
    expect(r.dFront).toBeCloseTo(5e3 / SUSPENSION_ILLUSTRATIVE.kFront, 12);
    expect(r.dRear).toBeCloseTo(-5e3 / SUSPENSION_ILLUSTRATIVE.kRear, 12);
    expect(r.pitch).toBeGreaterThan(0);
    const aero = rideFromLoads(10e3, 10e3, 8e3, 8e3);
    expect(aero.heave).toBeGreaterThan(0);
    const still = rideFromLoads(8e3, 8e3, 8e3, 8e3);
    expect(still.pitch).toBe(0);
    expect(still.heave).toBe(0);
  });

  it('visual ride is exaggerated and limited so the floor never touches the ground', () => {
    const [p, h] = visualRide(0.005, 0.005);
    expect(p).toBeCloseTo(0.005 * SUSPENSION_ILLUSTRATIVE.exaggeration, 12);
    expect(h).toBeCloseTo(0.005 * SUSPENSION_ILLUSTRATIVE.exaggeration, 12);
    const [p2, h2] = visualRide(0.05, 0.05);
    expect(h2 + p2 * 1.3).toBeCloseTo(SUSPENSION_ILLUSTRATIVE.maxDrop, 12);
  });
});

describe('disc pair (lumped thermal model per axle)', () => {
  it('starts at the selected temperature and rises by ≈ E/C in a short stop', () => {
    const d = createDiscPair();
    expect(d.tFront).toBeCloseTo(celsiusToKelvin(DISC_START_DEFAULT_C), 12);
    const T0 = d.tFront;
    for (let k = 0; k < 120; k++) d.step(400e3, 200e3, 70, PHYSICS_DT); // 0,5 s
    const E = 200e3 * 0.5; // per front disc
    expect(d.eFront).toBeCloseTo(E, 6);
    const rise = E / discHeatCapacity(BRAKE_DISC_ILLUSTRATIVE.front);
    expect((d.tFront - T0) / rise).toBeGreaterThan(0.95);
    expect(d.tFront - T0).toBeLessThan(rise);
    // energy balance of each disc: C·ΔT + losses = energy in
    const C = discHeatCapacity(BRAKE_DISC_ILLUSTRATIVE.rear);
    expect(C * (d.tRear - T0) + d.lossRear).toBeCloseTo(d.eRear, 4);
    d.step(-5, -5, 0, PHYSICS_DT); // negative powers are clamped to 0
    d.reset(25);
    expect(d.tRear).toBeCloseTo(298.15, 12);
    expect(d.eRear).toBe(0);
    expect(d.lossFront).toBe(0);
  });
});

describe('loft and wing geometry', () => {
  const st = [
    { x: 1, w: 0.2, h: 0.1, y: 0.2 },
    { x: 0, w: 0.6, h: 0.4, y: 0.3, n: 4, flat: 0.8 },
    { x: -1, w: 0.2, h: 0.2, y: 0.25, z: 0.1 },
  ];
  it('resamples smoothly through the stations', () => {
    const r = resampleStations(st, 4);
    expect(r.length).toBe(9);
    expect(r[4]?.x).toBeCloseTo(0, 12);
    expect(r[4]?.w).toBeCloseTo(0.6, 12);
    expect(resampleStations(st, 1).length).toBe(3);
  });
  it('builds a closed skin with outward normals and finite positions (both x orders)', () => {
    for (const order of [st, [...st].reverse()]) {
      const g = loftGeometry(order, 16, 3);
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.array.length; i++) expect(Number.isFinite(pos.array[i])).toBe(true);
      g.computeBoundingBox();
      const c = new THREE.Vector3();
      g.boundingBox?.getCenter(c);
      // signed volume > 0 ⇔ consistently outward-facing triangles
      const idx = g.getIndex() as THREE.BufferAttribute;
      let vol = 0;
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const d = new THREE.Vector3();
      for (let k = 0; k < idx.count; k += 3) {
        a.fromBufferAttribute(pos, idx.getX(k)).sub(c);
        b.fromBufferAttribute(pos, idx.getX(k + 1)).sub(c);
        d.fromBufferAttribute(pos, idx.getX(k + 2)).sub(c);
        vol += a.dot(b.clone().cross(d)) / 6;
      }
      expect(vol).toBeGreaterThan(0);
      g.dispose();
    }
  });
  it('wing section has the requested chord and span', () => {
    const g = wingGeometry(0.3, 1.8);
    g.computeBoundingBox();
    const s = new THREE.Vector3();
    g.boundingBox?.getSize(s);
    expect(s.x).toBeCloseTo(0.3, 6);
    expect(s.z).toBeCloseTo(1.8, 6);
    g.dispose();
  });
});

describe('instantaneous powers used by the scenes', () => {
  it('kers-braking: powersAt matches the event trace and splits P_b exactly', () => {
    const p = kers.defaultParams();
    const si = kers.toSI(p);
    const out: kers.InstantPowers = { v: 0, pBrake: 0, pMech: 0, pElec: 0, pLoss: 0, pDiscs: 0 };
    for (const t of [0, 0.7, 1.5, 2.9]) {
      kers.powersAt(si, t, out);
      const st = kers.stateAt(p, t);
      expect(out.pElec).toBeCloseTo(st.pKers, 6);
      expect(out.pElec + out.pLoss + out.pDiscs).toBeCloseTo(out.pBrake, 6);
      expect(out.pElec).toBeLessThanOrEqual(si.Pmax * (1 + 1e-12));
      expect(out.v).toBeCloseTo(st.v, 9);
    }
    // integral of the disc power = disc-brake heat of the summary
    let e = 0;
    const n = 3000;
    for (let k = 0; k < n; k++) e += kers.powersAt(si, ((k + 0.5) / n) * si.tBrake, out).pDiscs;
    e *= si.tBrake / n;
    expect(e / kers.summarize(p).brakes).toBeCloseTo(1, 5);
    expect(kers.powersAt(si, 5, out).pBrake).toBe(0);
    expect(out.v).toBeCloseTo(si.v2, 12);
    expect(kers.powersAt(si, -1, out).v).toBe(si.v1);
    expect(kers.powersAt({ ...si, eta: 0 }, 1, out).pDiscs).toBe(0);
    expect(kers.powersAt({ ...si, Pmax: 0 }, 1, out).pMech).toBe(0);
    expect(kers.FRONT_BRAKE_SHARE).toBe(0.6);
  });

  it('car-dynamics: axlePowersAt interpolates the RK4 trace without allocating', () => {
    const s = cd.summarize(cd.defaultParams(), true);
    const out: cd.AxlePowers = {
      v: 0,
      x: 0,
      pBrakesFront: 0,
      pBrakesRear: 0,
      pMech: 0,
      pElec: 0,
      pLoss: 0,
    };
    for (const t of [0, 0.37, 1.1, s.zone.tBrake * 0.999]) {
      cd.axlePowersAt(s.zone, s.si.eta, t, out);
      const smp = cd.sampleAt(s.zone, t);
      expect(out.pBrakesFront).toBeCloseTo(smp.pBrakesFront, 6);
      expect(out.pBrakesRear).toBeCloseTo(smp.pBrakesRear, 6);
      expect(out.pElec).toBeCloseTo(smp.pStored, 6);
      expect(out.pElec + out.pLoss).toBeCloseTo(smp.pMguk, 6);
      expect(out.v).toBeCloseTo(smp.v, 9);
    }
    cd.axlePowersAt(s.zone, s.si.eta, 99, out);
    expect(out.pBrakesFront).toBe(0);
    expect(out.v).toBeCloseTo(s.si.v2, 6);
    // static axle loads for the ride model
    expect(s.si.m * G_STANDARD).toBeGreaterThan(0);
  });
});
