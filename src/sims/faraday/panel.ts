/**
 * Formula panel definitions of the `faraday` simulator. The display unit/prefix
 * of Φ and f.e.m. follows their amplitude (B·S and V₀ span many decades), so the
 * item list is rebuilt only when the chosen prefixes change (see `chooseScale`).
 */
import type { FormulaItem } from '../../ui';
import { chooseScale, type DisplayScale } from './format';
import type { FaradayMode, FaradayParams } from './model';
import { emfMotional, rotatingLoop } from '../../physics';

export interface PanelScales {
  phi: DisplayScale;
  emf: DisplayScale;
}

/** Display scales for the current parameters: Φ referenced to its amplitude, emf to its peak. */
export function panelScales(mode: FaradayMode, p: FaradayParams): PanelScales {
  if (mode === 'rotating') {
    const V0 = rotatingLoop(p.B, p.S, p.N, p.omega, 0).V0;
    return { phi: chooseScale(p.B * p.S, 'Wb'), emf: chooseScale(V0, 'V') };
  }
  // Largest flux: bar at the far end of the rails (x = 1,1 m).
  return {
    phi: chooseScale(p.B * p.l * 1.1, 'Wb'),
    emf: chooseScale(emfMotional(p.B, p.l, p.v), 'V'),
  };
}

/** Stable identity of the scales (rebuild the panel only when this changes). */
export function scalesKey(mode: FaradayMode, s: PanelScales): string {
  return `${mode}|${s.phi.unit}|${s.phi.digits}|${s.emf.unit}|${s.emf.digits}`;
}

const FEM = '\\text{f.e.m.}';

export function formulaItems(mode: FaradayMode, s: PanelScales): FormulaItem[] {
  const phi = { unit: s.phi.unit, digits: s.phi.digits, scale: s.phi.scale };
  const emf = { unit: s.emf.unit, digits: s.emf.digits, scale: s.emf.scale };
  if (mode === 'rotating') {
    return [
      {
        key: 'alpha',
        tex: '\\alpha = \\omega t',
        labelIT: 'Angolo tra la normale n̂ e il campo B',
        unit: '°',
        digits: 0,
        symbolTex: '\\alpha',
      },
      {
        key: 'phi',
        tex: '\\Phi_B = B\\,S\\cos\\alpha',
        labelIT: 'Flusso attraverso una spira (1 Wb = 1 T·m²)',
        quantity: 'b',
        symbolTex: '\\Phi_B',
        ...phi,
      },
      {
        key: 'emf',
        tex: `${FEM}(t) = -N\\,\\dfrac{d\\Phi_B}{dt} = N B S \\omega \\sin(\\omega t)`,
        labelIT: 'F.e.m. indotta istantanea (Faraday-Neumann)',
        quantity: 'emf',
        symbolTex: FEM,
        ...emf,
      },
      {
        key: 'V0',
        tex: 'V_0 = N\\,B\\,S\\,\\omega',
        labelIT: 'Valore massimo teorico della f.e.m.',
        quantity: 'emf',
        symbolTex: 'V_0',
        ...emf,
      },
      {
        key: 'peak',
        tex: `\\max_{\\text{ultimo periodo}} |${FEM}|`,
        labelIT: 'Picco f.e.m. misurato sui campioni simulati (deve coincidere con V₀)',
        quantity: 'emf',
        symbolTex: '\\text{Picco}',
        ...emf,
      },
      {
        key: 'f',
        tex: 'f = \\dfrac{\\omega}{2\\pi} \\qquad T = \\dfrac{1}{f}',
        labelIT: 'Frequenza della corrente alternata',
        unit: 'Hz',
        digits: 2,
        symbolTex: 'f',
      },
    ];
  }
  return [
    {
      key: 'x',
      tex: 'x(t)',
      labelIT: 'Posizione della sbarretta lungo i binari',
      unit: 'm',
      digits: 2,
      symbolTex: 'x',
    },
    {
      key: 'phi',
      tex: '\\Phi_B = B\\,l\\,x',
      labelIT: 'Flusso attraverso il circuito (B perpendicolare al piano dei binari)',
      quantity: 'b',
      symbolTex: '\\Phi_B',
      ...phi,
    },
    {
      key: 'emfMot',
      tex: `|${FEM}| = B\\,l\\,v`,
      labelIT: 'F.e.m. di movimento',
      quantity: 'emf',
      symbolTex: `|${FEM}|`,
      ...emf,
    },
    {
      key: 'emfFlux',
      tex: `${FEM} = -\\dfrac{\\Delta\\Phi_B}{\\Delta t}`,
      labelIT: 'Calcolata dalla variazione di flusso nell’ultimo passo (Δt = 1/240 s)',
      quantity: 'emf',
      symbolTex: FEM,
      ...emf,
    },
    {
      key: 'peak',
      tex: `\\max_{\\text{andata e ritorno}} |${FEM}|`,
      labelIT: 'Picco f.e.m. misurato sui campioni simulati',
      quantity: 'emf',
      symbolTex: '\\text{Picco}',
      ...emf,
    },
  ];
}
