/**
 * Numeric question generators (A9).
 *
 * Each generator samples "nice" parameters from a seeded PRNG (deterministic for
 * a given seed), writes the prompt with Italian-formatted values, and computes
 * the answer with `src/physics` ONLY (`solve`): no formula is re-implemented
 * here. Values are sampled on a grid so that the numbers printed in the prompt
 * are exactly the numbers used by `solve`.
 *
 * Content follows content/theory/** (same notation, same simplifications). The
 * KERS questions follow DECISIONS D8 (P_max = ELECTRICAL cap, efficiency η, all
 * numbers from `kersBrakingEvent`); 120 kW / 350 kW are the MGU-K limits cited
 * with sources in content/theory/10-kers-mguk.md.
 */
import {
  degToRad,
  emfFaraday,
  emfMotional,
  emfSelf,
  fluxUniform,
  inducedCurrent,
  jouleLoss,
  kersBrakingEvent,
  kersDissipationSplit,
  kineticEnergyDelta,
  kmhToMs,
  lineLoss,
  lorentzForce,
  magneticEnergy,
  rlCurrent,
  rlTimeConstant,
  rotatingLoop,
  solenoidInductance,
  transformerCurrent,
  transformerSecondary,
} from '../physics';
import { fmt, formatNumber, parseNumberIT, tex, texNumber, withinTolerance } from './numbers';
import { mulberry32, pickGrid, pickOne, type Rng } from './prng';
import type { NumericGenerator, NumericInstance, SolutionStep } from './types';

/** Default relative tolerance of numeric answers (2 %). */
export const DEFAULT_TOLERANCE = 0.02;
/** Significant digits of the canonical answer. */
export const ANSWER_SIG = 3;

const res = (answer: number, unit: string): string =>
  unit ? `${texNumber(answer, ANSWER_SIG)}\\ \\text{${unit}}` : texNumber(answer, ANSWER_SIG);

/** Define a generator with its parameter type inferred from `sample`. */
function gen<P>(g: NumericGenerator<P>): NumericGenerator<P> {
  return g;
}

// --- 01 flusso -------------------------------------------------------------------

const flux = gen({
  id: 'gen-flusso',
  section: '01-flusso-campo-magnetico',
  difficulty: 1,
  slideRefs: [7],
  unit: 'mWb',
  scale: 1e3,
  tolerance: DEFAULT_TOLERANCE,
  sample: (r: Rng) => ({
    B: pickGrid(r, 0.1, 1.5, 0.05),
    S: pickGrid(r, 0.005, 0.05, 0.005),
    alphaDeg: pickOne(r, [0, 30, 45, 60]),
  }),
  promptIT: (p) =>
    `Una spira piana di area $S = ${tex(p.S, 'm}^2\\text{')}$ è immersa in un campo magnetico uniforme $B = ${tex(p.B, 'T')}$. ` +
    `L'angolo tra $\\vec B$ e la normale alla spira è $\\alpha = ${p.alphaDeg}^\\circ$. Calcola il flusso $\\Phi_B$ attraverso la spira (in mWb).`,
  solve: (p) => fluxUniform(p.B, p.S, degToRad(p.alphaDeg)),
  solution: (p, a) => [
    {
      textIT: 'Il flusso di un campo uniforme attraverso una superficie piana è:',
      tex: '\\Phi_B = B\\,S\\cos\\alpha',
    },
    {
      textIT: 'Sostituisco i valori:',
      tex: `\\Phi_B = ${tex(p.B)} \\cdot ${tex(p.S)} \\cdot \\cos ${p.alphaDeg}^\\circ = ${res(a, 'mWb')}`,
    },
    { textIT: 'Ricorda: 1 Wb = 1 T·m², e 1 mWb = 10⁻³ Wb.' },
  ],
});

// --- 03 Faraday-Neumann ----------------------------------------------------------

const faradayCoil = gen({
  id: 'gen-faraday-bobina',
  section: '03-faraday-neumann',
  difficulty: 2,
  slideRefs: [8],
  unit: 'V',
  scale: 1,
  tolerance: DEFAULT_TOLERANCE,
  sample: (r: Rng) => {
    const B1 = pickGrid(r, 0.1, 0.4, 0.05);
    const dB = pickGrid(r, 0.1, 0.6, 0.05);
    const up = r() < 0.5;
    return {
      N: pickGrid(r, 50, 400, 50),
      S: pickGrid(r, 0.002, 0.02, 0.002),
      B1: up ? B1 : Number((B1 + dB).toFixed(2)),
      B2: up ? Number((B1 + dB).toFixed(2)) : B1,
      dt: pickGrid(r, 0.05, 0.5, 0.05),
    };
  },
  promptIT: (p) =>
    `Una bobina di $N = ${p.N}$ spire, ciascuna di area $S = ${tex(p.S, 'm}^2\\text{')}$, è perpendicolare a un campo uniforme ` +
    `che passa da $${tex(p.B1, 'T')}$ a $${tex(p.B2, 'T')}$ in $\\Delta t = ${tex(p.dt, 's')}$. ` +
    `Calcola il modulo della f.e.m. media indotta (in V).`,
  solve: (p) =>
    Math.abs(emfFaraday(fluxUniform(p.B2, p.S, 0) - fluxUniform(p.B1, p.S, 0), p.dt, p.N)),
  solution: (p, a) => [
    {
      textIT: 'Variazione del flusso attraverso una spira (campo perpendicolare, α = 0):',
      tex: `\\Delta\\Phi_B = S\\,(B_2 - B_1) = ${tex(p.S)} \\cdot (${tex(p.B2)} - ${tex(p.B1)})\\ \\text{Wb}`,
    },
    {
      textIT: 'Legge di Faraday-Neumann con N spire:',
      tex: `|\\text{f.e.m.}| = N\\,\\frac{|\\Delta\\Phi_B|}{\\Delta t} = ${res(a, 'V')}`,
    },
    {
      textIT:
        p.B2 > p.B1
          ? 'Il flusso aumenta: per la legge di Lenz la corrente indotta crea un campo opposto a quello esterno.'
          : 'Il flusso diminuisce: per la legge di Lenz il campo indotto è concorde con quello esterno.',
    },
  ],
});

const slide10 = gen({
  id: 'gen-corrente-slide10',
  section: '03-faraday-neumann',
  difficulty: 2,
  slideRefs: [9, 10],
  unit: 'mA',
  scale: 1e3,
  tolerance: DEFAULT_TOLERANCE,
  sample: (r: Rng) => {
    const B1mT = pickGrid(r, 1, 3, 0.1);
    const B2mT = Number((B1mT + pickGrid(r, 0.5, 3, 0.1)).toFixed(1));
    return {
      S: Number((pickGrid(r, 1, 9, 0.5) * 1e-2).toFixed(4)),
      B1: Number((B1mT * 1e-3).toFixed(5)),
      B2: Number((B2mT * 1e-3).toFixed(5)),
      dt: pickGrid(r, 0.2, 1, 0.02),
      R: Number((pickGrid(r, 2, 10, 0.5) * 1e-3).toFixed(5)),
    };
  },
  promptIT: (p) =>
    `Come nell'esempio della slide 10: una spira di area $S = ${tex(p.S, 'm}^2\\text{')}$ e resistenza $R = ${tex(p.R * 1e3, 'm}\\Omega\\text{')}$ ` +
    `è perpendicolare a un campo che passa da $${tex(p.B1 * 1e3, 'mT')}$ a $${tex(p.B2 * 1e3, 'mT')}$ in $\\Delta t = ${tex(p.dt, 's')}$. ` +
    `Calcola l'intensità della corrente indotta (in mA).`,
  solve: (p) =>
    Math.abs(
      inducedCurrent(emfFaraday(fluxUniform(p.B2, p.S, 0) - fluxUniform(p.B1, p.S, 0), p.dt), p.R),
    ),
  solution: (p, a) => {
    const dPhi = fluxUniform(p.B2, p.S, 0) - fluxUniform(p.B1, p.S, 0);
    const emf = Math.abs(emfFaraday(dPhi, p.dt));
    return [
      {
        textIT: 'Variazione del flusso:',
        tex: `\\Delta\\Phi_B = S\\,\\Delta B = ${tex(p.S)} \\cdot ${texNumber(p.B2 - p.B1, 4, true)} = ${texNumber(dPhi, 3)}\\ \\text{Wb}`,
      },
      {
        textIT: 'F.e.m. indotta (Faraday-Neumann, in modulo):',
        tex: `|\\text{f.e.m.}| = \\frac{\\Delta\\Phi_B}{\\Delta t} = \\frac{${texNumber(dPhi, 3)}}{${tex(p.dt)}} = ${texNumber(emf, 3)}\\ \\text{V}`,
      },
      {
        textIT: 'Corrente indotta (slide 9):',
        tex: `I = \\frac{|\\text{f.e.m.}|}{R} = \\frac{${texNumber(emf, 3)}}{${texNumber(p.R, 3, true)}} = ${res(a, 'mA')}`,
      },
    ];
  },
});

const motional = gen({
  id: 'gen-fem-movimento',
  section: '03-faraday-neumann',
  difficulty: 1,
  slideRefs: [8],
  unit: 'V',
  scale: 1,
  tolerance: DEFAULT_TOLERANCE,
  sample: (r: Rng) => ({
    B: pickGrid(r, 0.1, 1.5, 0.05),
    l: pickGrid(r, 0.1, 1, 0.05),
    v: pickGrid(r, 1, 20, 0.5),
  }),
  promptIT: (p) =>
    `Una sbarretta lunga $l = ${tex(p.l, 'm')}$ scorre su due binari con velocità $v = ${tex(p.v, 'm/s')}$, ` +
    `perpendicolare a un campo uniforme $B = ${tex(p.B, 'T')}$. Calcola la f.e.m. di movimento (in V).`,
  solve: (p) => emfMotional(p.B, p.l, p.v),
  solution: (p, a) => [
    {
      textIT: "In un tempo Δt l'area del circuito aumenta di l·v·Δt, quindi:",
      tex: '\\text{f.e.m.} = B\\,l\\,v',
    },
    { tex: `\\text{f.e.m.} = ${tex(p.B)} \\cdot ${tex(p.l)} \\cdot ${tex(p.v)} = ${res(a, 'V')}` },
  ],
});

const motionalCurrent = gen({
  id: 'gen-corrente-indotta',
  section: '03-faraday-neumann',
  difficulty: 2,
  slideRefs: [8, 9],
  unit: 'A',
  scale: 1,
  tolerance: DEFAULT_TOLERANCE,
  sample: (r: Rng) => ({
    B: pickGrid(r, 0.2, 1.2, 0.05),
    l: pickGrid(r, 0.2, 1, 0.05),
    v: pickGrid(r, 2, 15, 0.5),
    R: pickGrid(r, 0.5, 10, 0.5),
  }),
  promptIT: (p) =>
    `La sbarretta di un circuito a binari ($l = ${tex(p.l, 'm')}$) si muove a $v = ${tex(p.v, 'm/s')}$ ` +
    `in un campo $B = ${tex(p.B, 'T')}$ perpendicolare al circuito. La resistenza totale è $R = ${tex(p.R, '}\\Omega\\text{')}$. ` +
    `Calcola la corrente indotta (in A).`,
  solve: (p) => inducedCurrent(emfMotional(p.B, p.l, p.v), p.R),
  solution: (p, a) => {
    const emf = emfMotional(p.B, p.l, p.v);
    return [
      {
        textIT: 'F.e.m. di movimento:',
        tex: `\\text{f.e.m.} = B\\,l\\,v = ${tex(p.B)} \\cdot ${tex(p.l)} \\cdot ${tex(p.v)} = ${texNumber(emf, 3)}\\ \\text{V}`,
      },
      {
        textIT: 'Corrente indotta (slide 9):',
        tex: `i = \\frac{\\text{f.e.m.}}{R} = \\frac{${texNumber(emf, 3)}}{${tex(p.R)}} = ${res(a, 'A')}`,
      },
    ];
  },
});

// --- 04 Lenz -----------------------------------------------------------------------

const lenzPower = gen({
  id: 'gen-lenz-potenza',
  section: '04-lenz',
  difficulty: 2,
  slideRefs: [11],
  unit: 'mW',
  scale: 1e3,
  tolerance: DEFAULT_TOLERANCE,
  sample: (r: Rng) => ({
    emf: pickGrid(r, 0.05, 2, 0.05),
    R: pickGrid(r, 0.5, 10, 0.5),
  }),
  promptIT: (p) =>
    `Spingendo un magnete verso una bobina si induce una f.e.m. di $${tex(p.emf, 'V')}$; la bobina ha resistenza $R = ${tex(p.R, '}\\Omega\\text{')}$. ` +
    `Quanta potenza deve fornire la mano contro la forza di Lenz (potenza dissipata per effetto Joule, in mW)?`,
  solve: (p) => jouleLoss(p.R, inducedCurrent(p.emf, p.R)),
  solution: (p, a) => {
    const i = inducedCurrent(p.emf, p.R);
    return [
      {
        textIT: 'Corrente indotta:',
        tex: `i = \\frac{\\text{f.e.m.}}{R} = \\frac{${tex(p.emf)}}{${tex(p.R)}} = ${texNumber(i, 3)}\\ \\text{A}`,
      },
      {
        textIT: 'Potenza dissipata, uguale alla potenza meccanica spesa contro la forza di Lenz:',
        tex: `P = R\\,i^2 = ${tex(p.R)} \\cdot (${texNumber(i, 3)})^2 = ${res(a, 'mW')}`,
      },
    ];
  },
});

// --- 05 autoinduzione ----------------------------------------------------------------

const solenoid = gen({
  id: 'gen-solenoide',
  section: '05-autoinduzione-induttanza',
  difficulty: 2,
  slideRefs: [14],
  unit: 'mH',
  scale: 1e3,
  tolerance: DEFAULT_TOLERANCE,
  sample: (r: Rng) => ({
    N: pickGrid(r, 100, 1000, 50),
    S: Number((pickGrid(r, 0.5, 5, 0.5) * 1e-3).toFixed(5)),
    l: pickGrid(r, 0.1, 0.5, 0.05),
  }),
  promptIT: (p) =>
    `Un solenoide lungo $l = ${tex(p.l, 'm')}$, in aria, ha $N = ${p.N}$ spire e sezione $S = ${tex(p.S, 'm}^2\\text{')}$. ` +
    `Calcola la sua induttanza (in mH), con $\\mu_0 = 4\\pi \\cdot 10^{-7}\\ \\text{T}\\cdot\\text{m/A}$.`,
  solve: (p) => solenoidInductance(p.N, p.S, p.l),
  solution: (p, a) => [
    { textIT: 'Induttanza di un solenoide lungo (slide 14):', tex: 'L = \\frac{\\mu_0 N^2 S}{l}' },
    {
      tex: `L = \\frac{4\\pi\\cdot10^{-7} \\cdot ${p.N}^2 \\cdot ${tex(p.S)}}{${tex(p.l)}} = ${res(a, 'mH')}`,
    },
    { textIT: 'Raddoppiando le spire l’induttanza quadruplica (dipende da N²).' },
  ],
});

const selfEmf = gen({
  id: 'gen-fem-autoindotta',
  section: '05-autoinduzione-induttanza',
  difficulty: 2,
  slideRefs: [13],
  unit: 'V',
  scale: 1,
  tolerance: DEFAULT_TOLERANCE,
  sample: (r: Rng) => ({
    L: Number((pickGrid(r, 10, 500, 10) * 1e-3).toFixed(4)),
    di: pickGrid(r, 0.5, 5, 0.5),
    dt: pickGrid(r, 0.005, 0.1, 0.005),
  }),
  promptIT: (p) =>
    `In una bobina di induttanza $L = ${tex(p.L * 1e3, 'mH')}$ la corrente aumenta di $${tex(p.di, 'A')}$ in $${tex(p.dt, 's')}$. ` +
    `Calcola il modulo della f.e.m. autoindotta (in V).`,
  solve: (p) => Math.abs(emfSelf(p.L, p.di / p.dt)),
  solution: (p, a) => [
    {
      textIT: 'F.e.m. autoindotta (slide 13):',
      tex: '\\text{f.e.m.} = -L\\,\\frac{\\Delta i}{\\Delta t}',
    },
    {
      tex: `|\\text{f.e.m.}| = ${tex(p.L)} \\cdot \\frac{${tex(p.di)}}{${tex(p.dt)}} = ${res(a, 'V')}`,
    },
    { textIT: 'Il segno meno (Lenz): la f.e.m. si oppone all’aumento della corrente.' },
  ],
});

// --- 06 circuito RL ----------------------------------------------------------------

const rlTau = gen({
  id: 'gen-rl-tau',
  section: '06-circuito-rl-energia-campo',
  difficulty: 1,
  slideRefs: [15],
  unit: 'ms',
  scale: 1e3,
  tolerance: DEFAULT_TOLERANCE,
  sample: (r: Rng) => ({
    L: pickGrid(r, 0.05, 1, 0.05),
    R: pickGrid(r, 1, 50, 1),
  }),
  promptIT: (p) =>
    `Un circuito RL ha $L = ${tex(p.L, 'H')}$ e $R = ${tex(p.R, '}\\Omega\\text{')}$. Calcola la costante di tempo $\\tau$ (in ms).`,
  solve: (p) => rlTimeConstant(p.R, p.L),
  solution: (p, a) => [
    { textIT: 'Costante di tempo del circuito RL:', tex: '\\tau = \\frac{L}{R}' },
    { tex: `\\tau = \\frac{${tex(p.L)}}{${tex(p.R)}} = ${res(a, 'ms')}` },
    { textIT: 'Dopo un tempo τ la corrente è al 63,2 % del valore finale.' },
  ],
});

const rlI = gen({
  id: 'gen-rl-corrente',
  section: '06-circuito-rl-energia-campo',
  difficulty: 3,
  slideRefs: [15],
  unit: 'A',
  scale: 1,
  tolerance: DEFAULT_TOLERANCE,
  sample: (r: Rng) => ({
    emf: pickGrid(r, 6, 24, 1),
    R: pickGrid(r, 2, 20, 1),
    L: pickGrid(r, 0.1, 1, 0.05),
    t: Number((pickGrid(r, 5, 200, 5) * 1e-3).toFixed(4)),
  }),
  promptIT: (p) =>
    `Un generatore con f.e.m. $${tex(p.emf, 'V')}$ alimenta un circuito con $R = ${tex(p.R, '}\\Omega\\text{')}$ e $L = ${tex(p.L, 'H')}$. ` +
    `L'interruttore si chiude all'istante $t = 0$. Calcola la corrente all'istante $t = ${tex(p.t * 1e3, 'ms')}$ (in A).`,
  solve: (p) => rlCurrent(p.emf, p.R, p.L, p.t),
  solution: (p, a) => {
    const I0 = inducedCurrent(p.emf, p.R);
    const tau = rlTimeConstant(p.R, p.L);
    return [
      {
        textIT: 'Corrente di regime e costante di tempo:',
        tex: `I_0 = \\frac{\\text{f.e.m.}}{R} = ${texNumber(I0, 3)}\\ \\text{A} \\qquad \\tau = \\frac{L}{R} = ${texNumber(tau * 1e3, 3)}\\ \\text{ms}`,
      },
      {
        textIT: 'Extracorrente di chiusura (slide 15):',
        tex: 'i(t) = I_0\\left(1 - e^{-t/\\tau}\\right)',
      },
      {
        tex: `i = ${texNumber(I0, 3)} \\cdot \\left(1 - e^{-${texNumber(p.t * 1e3, 4, true)}/${texNumber(tau * 1e3, 4)}}\\right) = ${res(a, 'A')}`,
      },
    ];
  },
});

const magEnergy = gen({
  id: 'gen-energia-magnetica',
  section: '06-circuito-rl-energia-campo',
  difficulty: 1,
  slideRefs: [17],
  unit: 'J',
  scale: 1,
  tolerance: DEFAULT_TOLERANCE,
  sample: (r: Rng) => ({
    L: pickGrid(r, 0.05, 2, 0.05),
    I: pickGrid(r, 0.5, 10, 0.5),
  }),
  promptIT: (p) =>
    `In un'induttanza $L = ${tex(p.L, 'H')}$ circola a regime una corrente $I_0 = ${tex(p.I, 'A')}$. ` +
    `Quanta energia è immagazzinata nel campo magnetico (in J)?`,
  solve: (p) => magneticEnergy(p.L, p.I),
  solution: (p, a) => [
    { textIT: 'Energia del campo magnetico (slide 17):', tex: 'U_M = \\tfrac12\\,L\\,I_0^2' },
    { tex: `U_M = \\tfrac12 \\cdot ${tex(p.L)} \\cdot (${tex(p.I)})^2 = ${res(a, 'J')}` },
  ],
});

// --- 07 alternatore ---------------------------------------------------------------

const alternator = gen({
  id: 'gen-alternatore-v0',
  section: '07-alternatore-corrente-alternata',
  difficulty: 1,
  slideRefs: [18, 19],
  unit: 'V',
  scale: 1,
  tolerance: DEFAULT_TOLERANCE,
  sample: (r: Rng) => ({
    N: pickGrid(r, 50, 500, 50),
    B: pickGrid(r, 0.1, 1, 0.05),
    S: pickGrid(r, 0.005, 0.05, 0.005),
    omega: pickGrid(r, 100, 1000, 50),
  }),
  promptIT: (p) =>
    `Una bobina di $N = ${p.N}$ spire di area $S = ${tex(p.S, 'm}^2\\text{')}$ ruota con velocità angolare $\\omega = ${tex(p.omega, 'rad/s')}$ ` +
    `in un campo uniforme $B = ${tex(p.B, 'T')}$. Calcola il valore massimo $V_0$ della f.e.m. (in V).`,
  solve: (p) => rotatingLoop(p.B, p.S, p.N, p.omega, 0).V0,
  solution: (p, a) => [
    {
      textIT: 'Il flusso varia come un coseno, la f.e.m. come un seno (slide 18–19):',
      tex: '\\text{f.e.m.}(t) = N B S \\omega \\sin(\\omega t) = V_0 \\sin(\\omega t)',
    },
    {
      tex: `V_0 = N B S \\omega = ${p.N} \\cdot ${tex(p.B)} \\cdot ${tex(p.S)} \\cdot ${tex(p.omega)} = ${res(a, 'V')}`,
    },
  ],
});

// --- 08 trasformatore e linee -------------------------------------------------------

const transformerV = gen({
  id: 'gen-trasformatore-v2',
  section: '08-trasformatore-trasporto-joule',
  difficulty: 1,
  slideRefs: [20],
  unit: 'V',
  scale: 1,
  tolerance: DEFAULT_TOLERANCE,
  sample: (r: Rng) => ({
    V1: pickOne(r, [120, 230, 400, 1000, 6000]),
    N1: pickGrid(r, 100, 2000, 100),
    N2: pickGrid(r, 50, 5000, 50),
  }),
  promptIT: (p) =>
    `Un trasformatore ideale ha $N_1 = ${p.N1}$ spire nel primario e $N_2 = ${p.N2}$ nel secondario. ` +
    `Il primario è alimentato con una tensione alternata $\\Delta V_1 = ${tex(p.V1, 'V')}$. Calcola $\\Delta V_2$ (in V).`,
  solve: (p) => transformerSecondary(p.V1, p.N1, p.N2),
  solution: (p, a) => [
    {
      textIT: 'Rapporto di trasformazione (slide 20):',
      tex: '\\frac{\\Delta V_1}{\\Delta V_2} = \\frac{N_1}{N_2} \\;\\Rightarrow\\; \\Delta V_2 = \\Delta V_1\\,\\frac{N_2}{N_1}',
    },
    { tex: `\\Delta V_2 = ${tex(p.V1)} \\cdot \\frac{${p.N2}}{${p.N1}} = ${res(a, 'V')}` },
    {
      textIT:
        p.N2 > p.N1
          ? 'N₂ > N₁: trasformatore elevatore.'
          : p.N2 < p.N1
            ? 'N₂ < N₁: trasformatore abbassatore.'
            : 'N₂ = N₁: la tensione non cambia.',
    },
  ],
});

const transformerI = gen({
  id: 'gen-trasformatore-i2',
  section: '08-trasformatore-trasporto-joule',
  difficulty: 2,
  slideRefs: [20],
  unit: 'A',
  scale: 1,
  tolerance: DEFAULT_TOLERANCE,
  sample: (r: Rng) => ({
    I1: pickGrid(r, 1, 50, 1),
    N1: pickGrid(r, 100, 2000, 100),
    N2: pickGrid(r, 50, 5000, 50),
  }),
  promptIT: (p) =>
    `In un trasformatore ideale con $N_1 = ${p.N1}$ e $N_2 = ${p.N2}$ spire, la corrente nel primario è $i_1 = ${tex(p.I1, 'A')}$. ` +
    `Calcola la corrente nel secondario (in A), sapendo che la potenza si conserva.`,
  solve: (p) => transformerCurrent(p.I1, p.N1, p.N2),
  solution: (p, a) => [
    {
      textIT: 'Trasformatore ideale: ΔV₁·i₁ = ΔV₂·i₂, quindi:',
      tex: '\\frac{i_1}{i_2} = \\frac{N_2}{N_1} \\;\\Rightarrow\\; i_2 = i_1\\,\\frac{N_1}{N_2}',
    },
    { tex: `i_2 = ${tex(p.I1)} \\cdot \\frac{${p.N1}}{${p.N2}} = ${res(a, 'A')}` },
  ],
});

interface LineParams {
  P: number;
  V: number;
  R: number;
}

function sampleLine(r: Rng): LineParams {
  for (let k = 0; k < 50; k++) {
    const p = {
      P: pickGrid(r, 1, 50, 1) * 1e6,
      V: pickOne(r, [20, 50, 110, 132, 220, 380]) * 1e3,
      R: pickGrid(r, 1, 20, 0.5),
    };
    if (lineLoss(p.P, p.V, p.R).fraction <= 0.3) return p;
  }
  return { P: 10e6, V: 20e3, R: 5 }; // example of theory section 08
}

const line = gen({
  id: 'gen-perdita-linea',
  section: '08-trasformatore-trasporto-joule',
  difficulty: 2,
  slideRefs: [21, 22, 23],
  unit: 'kW',
  scale: 1e-3,
  tolerance: DEFAULT_TOLERANCE,
  sample: sampleLine,
  promptIT: (p) =>
    `Una linea di resistenza totale $R = ${tex(p.R, '}\\Omega\\text{')}$ trasporta una potenza $P = ${tex(p.P / 1e6, 'MW')}$ ` +
    `alla tensione $\\Delta V = ${tex(p.V / 1e3, 'kV')}$. Calcola la potenza persa per effetto Joule (in kW).`,
  solve: (p) => lineLoss(p.P, p.V, p.R).loss,
  solution: (p, a) => {
    const { I, fraction } = lineLoss(p.P, p.V, p.R);
    return [
      {
        textIT: 'Corrente nella linea:',
        tex: `i = \\frac{P}{\\Delta V} = \\frac{${texNumber(p.P, 3, true)}}{${texNumber(p.V, 3, true)}} = ${texNumber(I, 3)}\\ \\text{A}`,
      },
      {
        textIT: 'Perdita Joule:',
        tex: `P_J = R\\,i^2 = ${tex(p.R)} \\cdot (${texNumber(I, 3)})^2 = ${res(a, 'kW')}`,
      },
      { textIT: `È il ${fmt(fraction * 100, '%', 3)} della potenza trasportata.` },
    ];
  },
});

const lineRatio = gen({
  id: 'gen-perdita-tensione-k',
  section: '08-trasformatore-trasporto-joule',
  difficulty: 2,
  slideRefs: [21, 22, 23],
  unit: 'volte',
  scale: 1,
  tolerance: DEFAULT_TOLERANCE,
  sample: (r: Rng) => ({ ...sampleLine(r), k: pickOne(r, [2, 3, 5, 10]) }),
  promptIT: (p) =>
    `Una linea ($R = ${tex(p.R, '}\\Omega\\text{')}$) trasporta $${tex(p.P / 1e6, 'MW')}$ a $${tex(p.V / 1e3, 'kV')}$. ` +
    `Se, a parità di potenza e di resistenza, la tensione viene moltiplicata per ${p.k}, di quante volte diminuisce la perdita Joule?`,
  solve: (p) => lineLoss(p.P, p.V, p.R).loss / lineLoss(p.P, p.k * p.V, p.R).loss,
  solution: (p, a) => [
    {
      textIT: 'A parità di potenza la corrente è inversamente proporzionale alla tensione:',
      tex: `P_J = R\\,i^2 = R\\,\\frac{P^2}{\\Delta V^2}`,
    },
    {
      textIT: `Moltiplicando ΔV per ${p.k}, la corrente si divide per ${p.k} e la perdita per ${p.k}²:`,
      tex: `\\frac{P_J(\\Delta V)}{P_J(${p.k}\\,\\Delta V)} = ${p.k}^2 = ${texNumber(a, ANSWER_SIG)}`,
    },
    { textIT: 'Il risultato non dipende da P e da R: tensione ×10 ⇒ perdite ÷100.' },
  ],
});

// --- 09 Lorentz ---------------------------------------------------------------------

const lorentz = gen({
  id: 'gen-forza-lorentz',
  section: '09-motore-elettrico-lorentz',
  difficulty: 1,
  slideRefs: [18, 19],
  unit: 'N',
  scale: 1,
  tolerance: DEFAULT_TOLERANCE,
  sample: (r: Rng) => ({
    B: pickGrid(r, 0.1, 1.5, 0.05),
    I: pickGrid(r, 5, 300, 5),
    L: pickGrid(r, 0.05, 0.5, 0.05),
    thetaDeg: pickOne(r, [30, 45, 60, 90]),
  }),
  promptIT: (p) =>
    `Un filo rettilineo lungo $L = ${tex(p.L, 'm')}$, percorso da una corrente $I = ${tex(p.I, 'A')}$, è immerso in un campo $B = ${tex(p.B, 'T')}$. ` +
    `L'angolo tra filo e campo è $\\theta = ${p.thetaDeg}^\\circ$. Calcola il modulo della forza di Lorentz sul filo (in N).`,
  solve: (p) => lorentzForce(p.B, p.I, p.L, degToRad(p.thetaDeg)),
  solution: (p, a) => [
    {
      textIT: 'Forza su un filo percorso da corrente (principio inverso):',
      tex: 'F = B\\,I\\,L\\,\\sin\\theta',
    },
    {
      tex: `F = ${tex(p.B)} \\cdot ${tex(p.I)} \\cdot ${tex(p.L)} \\cdot \\sin ${p.thetaDeg}^\\circ = ${res(a, 'N')}`,
    },
  ],
});

// --- 10 KERS / MGU-K ----------------------------------------------------------------

const kinetic = gen({
  id: 'gen-energia-cinetica-frenata',
  section: '10-kers-mguk',
  difficulty: 2,
  slideRefs: [],
  unit: 'MJ',
  scale: 1e-6,
  tolerance: DEFAULT_TOLERANCE,
  sample: (r: Rng) => ({
    m: pickGrid(r, 700, 1000, 10),
    v1: pickGrid(r, 200, 330, 10),
    v2: pickGrid(r, 50, 150, 10),
  }),
  promptIT: (p) =>
    `Un'auto di massa $m = ${p.m}\\ \\text{kg}$ (valore illustrativo) frena da $${p.v1}\\ \\text{km/h}$ a $${p.v2}\\ \\text{km/h}$. ` +
    `Calcola l'energia cinetica $\\Delta E_k$ da smaltire (in MJ).`,
  solve: (p) => kineticEnergyDelta(p.m, kmhToMs(p.v1), kmhToMs(p.v2)),
  solution: (p, a) => [
    {
      textIT: 'Converto le velocità in m/s (divido per 3,6):',
      tex: `v_1 = ${texNumber(kmhToMs(p.v1), 4)}\\ \\text{m/s} \\qquad v_2 = ${texNumber(kmhToMs(p.v2), 4)}\\ \\text{m/s}`,
    },
    {
      textIT: 'Energia cinetica da smaltire:',
      tex: '\\Delta E_k = \\tfrac12\\,m\\,(v_1^2 - v_2^2)',
    },
    {
      tex: `\\Delta E_k = \\tfrac12 \\cdot ${p.m} \\cdot (${texNumber(kmhToMs(p.v1), 4)}^2 - ${texNumber(kmhToMs(p.v2), 4)}^2) = ${res(a, 'MJ')}`,
    },
  ],
});

interface KersParams {
  m: number;
  v1: number;
  v2: number;
  tBrake: number;
  PmaxKW: number;
  eta: number;
}

/** Braking event via `kersBrakingEvent` (DECISIONS D8: P_max is the ELECTRICAL cap). */
const kersEvent = (p: KersParams) =>
  kersBrakingEvent({
    m: p.m,
    v1: kmhToMs(p.v1),
    v2: kmhToMs(p.v2),
    Pmax: p.PmaxKW * 1e3,
    eta: p.eta,
    tBrake: p.tBrake,
  });

/** Illustrative efficiencies (as η = 0,9 in theory section 10). */
const ETAS = [0.8, 0.85, 0.9, 0.95];

/**
 * Sample a braking event in which the MGU-K stays at its cap for the whole
 * braking (mechanical demand ≥ P_max/η throughout), so E_batt = P_max·t_f.
 */
function sampleSaturatedKers(r: Rng): KersParams {
  for (let k = 0; k < 100; k++) {
    const p: KersParams = {
      m: pickGrid(r, 700, 900, 10),
      v1: pickGrid(r, 250, 330, 10),
      v2: pickGrid(r, 80, 150, 10),
      tBrake: pickGrid(r, 2, 5, 0.5),
      PmaxKW: pickOne(r, [120, 350]),
      eta: pickOne(r, ETAS),
    };
    const capMech = (p.PmaxKW * 1e3) / p.eta;
    if (kersEvent(p).recoverable >= capMech * p.tBrake * (1 - 1e-9)) return p;
  }
  return { m: 800, v1: 300, v2: 100, tBrake: 3, PmaxKW: 120, eta: 0.9 }; // theory section 10
}

const pmaxNote = (kw: number): string =>
  kw === 120
    ? 'limite dell’MGU-K fino al 2025, fonte FIA citata nella sezione 10'
    : 'valore di circa 350 kW previsto dal 2026, fonte formula1.com citata nella sezione 10';

const kersRecovered = gen({
  id: 'gen-kers-energia-recuperata',
  section: '10-kers-mguk',
  difficulty: 3,
  slideRefs: [17, 18, 19],
  unit: 'MJ',
  scale: 1e-6,
  tolerance: DEFAULT_TOLERANCE,
  sample: sampleSaturatedKers,
  promptIT: (p) =>
    `Un'auto di massa $${p.m}\\ \\text{kg}$ (valore illustrativo) frena da $${p.v1}$ a $${p.v2}\\ \\text{km/h}$ in $t_f = ${tex(p.tBrake, 's')}$. ` +
    `L'MGU-K può inviare alla batteria al massimo $P_{\\max} = ${p.PmaxKW}\\ \\text{kW}$ di potenza elettrica (${pmaxNote(p.PmaxKW)}), ` +
    `con un rendimento illustrativo $\\eta = ${tex(p.eta)}$. Quanta energia arriva al massimo in batteria (in MJ)?`,
  solve: (p) => kersEvent(p).recovered,
  solution: (p, a) => {
    const ev = kersEvent(p);
    const split = kersDissipationSplit(ev);
    const capMech = (p.PmaxKW * 1e3) / p.eta;
    return [
      {
        textIT: 'Energia cinetica da smaltire:',
        tex: `\\Delta E_k = \\tfrac12\\,m\\,(v_1^2 - v_2^2) = ${texNumber(ev.dEk * 1e-6, 3)}\\ \\text{MJ}`,
      },
      {
        textIT:
          '$P_{\\max}$ limita la potenza elettrica: dall’asse l’MGU-K può assorbire al massimo $P_{\\max}/\\eta$ di potenza meccanica.',
        tex: `\\frac{P_{\\max}}{\\eta} = \\frac{${p.PmaxKW}\\ \\text{kW}}{${tex(p.eta)}} = ${texNumber(capMech / 1e3, 3)}\\ \\text{kW}`,
      },
      {
        textIT:
          'Con decelerazione costante la potenza frenante resta sopra questo valore per tutta la frenata (la potenza media è molto maggiore):',
        tex: `\\bar P = \\frac{\\Delta E_k}{t_f} = ${texNumber(ev.dEk / p.tBrake / 1e3, 3)}\\ \\text{kW}`,
      },
      {
        textIT: 'Quindi l’MGU-K lavora sempre al limite e in batteria arriva:',
        tex: `E_{\\text{batt}} = \\eta \\cdot \\frac{P_{\\max}}{\\eta}\\,t_f = P_{\\max}\\,t_f = ${p.PmaxKW}\\ \\text{kW} \\cdot ${tex(p.tBrake, 's')} = ${res(a, 'MJ')}`,
      },
      {
        textIT: `Il resto diventa calore: circa ${fmt(split.brakes * 1e-6, 'MJ', 3)} nei freni a disco e ${fmt(split.mguk * 1e-6, 'MJ', 3)} di perdite nell’MGU-K e nel convertitore.`,
      },
    ];
  },
});

const kersTime = gen({
  id: 'gen-kers-tempo-recupero',
  section: '10-kers-mguk',
  difficulty: 2,
  slideRefs: [],
  unit: 's',
  scale: 1,
  tolerance: DEFAULT_TOLERANCE,
  sample: (r: Rng): KersParams => ({
    m: pickGrid(r, 700, 900, 10),
    v1: pickGrid(r, 250, 330, 10),
    v2: pickGrid(r, 80, 150, 10),
    tBrake: 3,
    PmaxKW: pickOne(r, [120, 350]),
    eta: pickOne(r, ETAS),
  }),
  promptIT: (p) =>
    `Un'auto di massa $${p.m}\\ \\text{kg}$ (valore illustrativo) frena da $${p.v1}$ a $${p.v2}\\ \\text{km/h}$. ` +
    `L'MGU-K ha rendimento $\\eta = ${tex(p.eta)}$ e invia alla batteria al massimo $P_{\\max} = ${p.PmaxKW}\\ \\text{kW}$ (${pmaxNote(p.PmaxKW)}). ` +
    `Quanto vale il tempo per assorbire tutta $\\Delta E_k$ alla potenza massima (in s)? In batteria arriva $\\eta\\,\\Delta E_k$.`,
  solve: (p) => kersEvent(p).timeToRecoverAtPmax,
  solution: (p, a) => {
    const ev = kersEvent(p);
    return [
      {
        textIT: 'Energia cinetica da smaltire:',
        tex: `\\Delta E_k = \\tfrac12\\,m\\,(v_1^2 - v_2^2) = ${texNumber(ev.dEk * 1e-6, 3)}\\ \\text{MJ}`,
      },
      {
        textIT:
          'Tempo per assorbire tutta $\\Delta E_k$ alla potenza massima: in batteria arriva $\\eta\\,\\Delta E_k$, con una potenza elettrica di al massimo $P_{\\max}$:',
        tex: `t = \\frac{\\eta\\,\\Delta E_k}{P_{\\max}} = \\frac{${tex(p.eta)} \\cdot ${texNumber(ev.dEk, 3)}\\ \\text{J}}{${texNumber(p.PmaxKW * 1e3, 3, true)}\\ \\text{W}} = ${res(a, 's')}`,
      },
      {
        textIT:
          'Una frenata reale dura pochi secondi: per questo il recupero è limitato dalla potenza e il resto va ai freni.',
      },
    ];
  },
});

/** All generators (each counts as one question in the bank). */
export const GENERATORS: readonly NumericGenerator<never>[] = [
  flux,
  faradayCoil,
  slide10,
  motional,
  motionalCurrent,
  lenzPower,
  solenoid,
  selfEmf,
  rlTau,
  rlI,
  magEnergy,
  alternator,
  transformerV,
  transformerI,
  line,
  lineRatio,
  lorentz,
  kinetic,
  kersRecovered,
  kersTime,
] as unknown as readonly NumericGenerator<never>[];

/** Find a generator by id. */
export function findGenerator(id: string): NumericGenerator<never> | undefined {
  return GENERATORS.find((g) => g.id === id);
}

/** Build the concrete numeric question of generator `g` for `seed` (deterministic). */
export function instantiate(g: NumericGenerator<never>, seed: number): NumericInstance {
  const gg = g as unknown as NumericGenerator<Record<string, number>>;
  const p = gg.sample(mulberry32(seed));
  const expected = gg.solve(p) * gg.scale;
  const steps: SolutionStep[] = gg.solution(p, expected);
  return {
    id: gg.id,
    type: 'numerica',
    section: gg.section,
    difficulty: gg.difficulty,
    slideRefs: gg.slideRefs,
    promptIT: gg.promptIT(p),
    generatorId: gg.id,
    seed,
    expected,
    unit: gg.unit,
    tolerance: gg.tolerance,
    answerText: formatAnswer(expected),
    steps,
  };
}

/** Canonical answer text (3 significant digits, Italian). */
export function formatAnswer(x: number): string {
  return formatNumber(x, ANSWER_SIG);
}

/** Check a typed answer against a numeric instance. `null` = not a number. */
export function checkNumeric(
  q: Pick<NumericInstance, 'expected' | 'tolerance'>,
  input: string,
): boolean | null {
  const v = parseNumberIT(input);
  if (v === null) return null;
  return withinTolerance(v, q.expected, q.tolerance);
}
