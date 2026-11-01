import type { AppContext, Disposable } from '../../core/types';
import { registerDebugHook } from '../../core/debug';
import {
  createDriveState,
  DEFAULT_DRIVE,
  kersDriveStep,
  kineticEnergyDelta,
  kmhToMs,
  type DriveInput,
  type DriveResult,
  type DriveSpec,
} from '../../physics';
import {
  createButton,
  createFormulaPanel,
  createLoop,
  createSegmented,
  createSimLayout,
  createSimToolbar,
  createSlider,
  el,
  type Slider,
} from '../../ui';
import { createPedalButton } from '../../ui/pedal';
import { createReadoutGrid } from '../../ui/readout';
import { createCarTelemetryPlots } from '../../ui/telemetry';
import { isEditing } from '../../ui/fullscreen';
import { createDiscPair } from './car/discs';
import type { CarSceneCore } from './car/scene';
import { createResetViewButton } from '../../render/viewButton';
import { createDrivePresets } from './drive-presets';

const mounts = new WeakMap<HTMLElement, Disposable>();
export const DRIVE_NOTE_IT =
  'modello longitudinale 1D: massa puntiforme, resistenza aerodinamica e al rotolamento, propulsore a forza/potenza limitate, MGU-K reversibile e batteria finita; freno prioritario, nessuna simulazione di giro o aderenza laterale. Capacità 4 MJ illustrativa, rendimento macchina 90 %, batteria 95 %, parametri del veicolo illustrativi. Dischi: modello termico concentrato, ripartizione 60 % anteriore / 40 % posteriore.';

/** Shared engine for the guided model and final pedal demonstration. */
export function mountDrive(host: HTMLElement, ctx: AppContext, interactive: boolean): Disposable {
  mounts.get(host)?.dispose();
  const id = interactive ? 'drive-sim' : 'kers-drive';
  const p: DriveSpec = { ...DEFAULT_DRIVE, battery: { ...DEFAULT_DRIVE.battery } };
  const layout = createSimLayout(host, { modelNoteIT: DRIVE_NOTE_IT });
  layout.root.classList.add('drive-layout');
  layout.addSceneLegend(
    el('div', {
      class: 'drive-legend',
      text: 'Nastri viola: flusso di energia (verso invertito in modalità motore). Ruote ∝ distanza; carica ∝ energia; dischi: temperatura calcolata.',
    }),
  );
  let state = createDriveState(p, interactive ? 0 : kmhToMs(300));
  let input: DriveInput = { throttle: 0, brake: 0 };
  let q: DriveResult = {
    state,
    a: 0,
    v: state.v,
    pKers: 0,
    pBrakes: 0,
    soc: 0.5,
    pEngine: 0,
    pAero: 0,
    pRolling: 0,
    pLoss: 0,
  };
  let phase: 'manual' | 'accelerate' | 'brake' | 'done' = interactive ? 'manual' : 'brake';
  let profile: 'full' | 'braking' = 'braking';
  let brakingStart = interactive ? 0 : 0.5 * p.mass * state.v ** 2;
  let released = 0;
  let initialEnergy = 0.5 * p.mass * state.v ** 2 + state.battery.energy;
  let disposed = false;
  const off: (() => void)[] = [];
  const sliders: Slider[] = [];
  const discs = createDiscPair(25);
  const status = el('p', { class: 'drive-state', attrs: { role: 'status' } });
  const note = el('p', {
    class: 'drive-scenario-note',
    text: interactive
      ? '↑ / W: acceleratore · ↓ / S: freno. I pedali salgono e scendono gradualmente; il freno ha priorità. Seleziona Scenario per la dimostrazione 0 → 300 → 100 km/h.'
      : 'Profilo guidato della stessa auto e della stessa MGU-K. Seleziona accelerazione + frenata per osservare l’inversione del flusso di energia.',
  });
  const gauge = el('progress', {
    class: 'battery-gauge',
    attrs: { 'aria-label': 'Carica batteria', max: 1, value: 0.5 },
  });
  const summary = el('div', { class: 'drive-summary' }, [status, note, gauge]);
  const liveData = el('section', { class: 'drive-readouts' }, [
    el('h3', { text: 'Dati in tempo reale' }),
  ]);
  const readouts = createReadoutGrid(liveData, [
    { key: 'v', labelIT: 'Velocità', unit: 'km/h', digits: 1, scale: 3.6 },
    { key: 'a', labelIT: 'Accelerazione', unit: 'm/s²', digits: 2 },
    { key: 'g', labelIT: 'Accelerazione in g', unit: 'g', digits: 2 },
    {
      key: 'kers',
      labelIT: 'MGU-K (+ motore / − generatore)',
      unit: 'kW',
      digits: 1,
      scale: 0.001,
    },
    { key: 'brakes', labelIT: 'Freni a disco', unit: 'kW', digits: 1, scale: 0.001 },
    { key: 'soc', labelIT: 'Carica batteria', unit: '%', digits: 1, scale: 100 },
    { key: 'energy', labelIT: 'Energia in batteria', unit: 'MJ', digits: 3, scale: 1e-6 },
    {
      key: 'example',
      labelIT: 'ΔEₖ: esempio 800 kg, 300 → 100',
      unit: 'MJ',
      digits: 2,
      scale: 1e-6,
    },
    {
      key: 'released',
      labelIT: 'ΔEₖ dalla frenata dello scenario',
      unit: 'MJ',
      digits: 3,
      scale: 1e-6,
    },
    { key: 'harvested', labelIT: 'Energia recuperata netta', unit: 'MJ', digits: 3, scale: 1e-6 },
    { key: 'deployed', labelIT: 'Energia prelevata', unit: 'MJ', digits: 3, scale: 1e-6 },
  ]);
  const pedals = el('div', { class: 'drive-pedals' });
  const hud = el('div', { class: 'drive-hud' });
  layout.sceneOverlay.append(hud);
  const hudValues = createReadoutGrid(hud, [
    { key: 'v', labelIT: 'v', unit: 'km/h', digits: 1, scale: 3.6 },
    { key: 'a', labelIT: 'a', unit: 'm/s²', digits: 2 },
  ]);
  const heldPedals = { throttle: false, brake: false };
  const keys = new Set<string>();
  let throttleKey = 0,
    brakeKey = 0;
  const pedalButtons = (['throttle', 'brake'] as const).map((key) =>
    createPedalButton(key, (held) => {
      heldPedals[key] = held;
      if (held) phase = 'manual';
    }),
  );
  for (const button of pedalButtons) pedals.append(button.element);
  const preset = createSegmented<'full' | 'braking'>({
    labelIT: 'Profilo',
    value: 'braking',
    options: [
      { value: 'full', labelIT: 'Accelerazione + frenata' },
      { value: 'braking', labelIT: 'Frenata 300 → 100 km/h' },
    ],
    onChange: (value) => {
      profile = value;
      reset(false);
    },
  });
  const scenario = createButton({
    labelIT: 'Scenario: accelera a 300, frena a 100 km/h',
    icon: '▶',
    onClick: () => {
      profile = 'full';
      reset(true);
      loop.resume();
      toolbar.refresh();
    },
  });
  const mass = createSlider({
    id: `${id}-mass`,
    spec: {
      min: 500,
      max: 1200,
      step: 1,
      default: 800,
      unit: 'kg',
      labelIT: 'Massa del veicolo (illustrativa)',
    },
    onInput: (value) => {
      p.mass = value;
      reset(false);
    },
  });
  const power = createSlider({
    id: `${id}-power`,
    spec: {
      min: 0,
      max: 350,
      step: 1,
      default: 120,
      unit: 'kW',
      labelIT: 'Limite MGU-K (elettrico)',
    },
    onInput: (value) => {
      p.deployPower = p.harvestPower = value * 1000;
      p.battery.chargePower = p.battery.dischargePower = value * 1000;
      enginePresets?.updatePower(value);
    },
  });
  const enginePresets = interactive
    ? createDrivePresets((powerKw) => {
        power.set(powerKw, true);
        reset(false);
      })
    : null;
  enginePresets?.updatePower(power.value);
  sliders.push(mass, power);
  const soc = createSlider({
    id: `${id}-soc`,
    spec: {
      min: 0,
      max: 100,
      step: 1,
      default: 50,
      unit: '%',
      labelIT: 'Carica iniziale batteria',
    },
    onInput: (value) => {
      initialSoc = value / 100;
      reset(false);
    },
  });
  let initialSoc = 0.5;
  sliders.push(soc);
  layout.controls.append(
    summary,
    interactive ? pedals : preset.element,
    scenario.element,
    el('div', { class: 'drive-settings' }, [mass.element, power.element, soc.element]),
    liveData,
  );
  if (enginePresets) scenario.element.after(enginePresets.element);
  const formulas = createFormulaPanel(layout.formulas, [
    {
      key: 'force',
      tex: 'm a = F_{prop} + F_{MGU-K} - F_{freni} - \\frac12\\rho C_d A v^2 - F_{roll}',
      labelIT: 'Bilancio longitudinale',
      unit: 'm/s²',
      digits: 2,
    },
    {
      key: 'deploy',
      tex: 'F = B I l,\\quad P_{mecc} = \\tau\\omega = \\eta P_{batt}',
      labelIT: 'Lorentz: batteria → moto (erogazione)',
      unit: 'kW',
      scale: 0.001,
      digits: 1,
      quantity: 'f',
    },
    {
      key: 'harvest',
      tex: '\\varepsilon = -N\\frac{d\\Phi}{dt},\\quad P_{batt} = \\eta |P_{mecc}|',
      labelIT: 'Faraday-Lenz: moto → batteria (recupero)',
      unit: 'kW',
      scale: 0.001,
      digits: 1,
      quantity: 'emf',
    },
    {
      key: 'kinetic',
      tex: '\\Delta E_k = \\frac12 m(v_1^2-v_2^2)',
      labelIT: 'Energia cinetica rilasciata in frenata',
      unit: 'MJ',
      scale: 1e-6,
      digits: 2,
      quantity: 'energy',
    },
  ]);
  const telemetry = createCarTelemetryPlots(layout.plots);
  let scene: CarSceneCore | null = null;
  void import('./car/scene').then(({ createCarSceneCore }) => {
    if (disposed) return;
    try {
      scene = createCarSceneCore(
        layout.scene,
        layout.sceneOverlay,
        ctx,
        'Monoposto in accelerazione e frenata: MGU-K e batteria con flusso di energia reversibile.',
      );
      scene.stage.canvas.tabIndex = 0;
      const view = createResetViewButton(scene.stage);
      layout.toolbar.append(view.element);
      off.push(() => view.dispose());
      draw();
    } catch {
      layout.scene.append(
        el('p', {
          class: 'sim-placeholder',
          text: 'Grafica 3D non disponibile; comandi e grafici restano attivi.',
        }),
      );
    }
  });
  function reset(runScenario: boolean): void {
    keys.clear();
    pedalButtons.forEach((button) => button.release());
    throttleKey = brakeKey = 0;
    phase = interactive && !runScenario ? 'manual' : profile === 'full' ? 'accelerate' : 'brake';
    state = createDriveState(p, phase === 'brake' ? kmhToMs(300) : 0, initialSoc);
    initialEnergy = 0.5 * p.mass * state.v ** 2 + state.battery.energy;
    released = 0;
    brakingStart = phase === 'brake' ? 0.5 * p.mass * state.v ** 2 : 0;
    discs.reset(25);
    telemetry.clear();
    q = { ...q, state, v: state.v, a: 0, soc: initialSoc, pKers: 0, pBrakes: 0, pLoss: 0 };
    input = { throttle: 0, brake: 0 };
    draw();
  }
  function step(dt: number): void {
    if (phase === 'done') return;
    if (phase === 'accelerate' && state.v >= kmhToMs(300)) {
      phase = 'brake';
      brakingStart = 0.5 * p.mass * state.v ** 2;
    }
    const ramp = (value: number, pressed: boolean): number =>
      Math.min(1, Math.max(0, value + (pressed ? 1.5 : -2) * dt));
    throttleKey = ramp(throttleKey, heldPedals.throttle || keys.has('arrowup') || keys.has('w'));
    brakeKey = ramp(brakeKey, heldPedals.brake || keys.has('arrowdown') || keys.has('s'));
    input =
      phase === 'manual'
        ? {
            throttle: throttleKey,
            brake: brakeKey,
          }
        : phase === 'accelerate'
          ? { throttle: 1, brake: 0 }
          : { throttle: 0, brake: 0.7 };
    q = kersDriveStep(state, input, dt, p);
    // Locate the guided speed target within this fixed step, preserving its work ledger.
    const target = phase === 'accelerate' ? kmhToMs(300) : phase === 'brake' ? kmhToMs(100) : null;
    if (
      target !== null &&
      ((phase === 'accelerate' && q.state.v >= target) ||
        (phase === 'brake' && q.state.v <= target))
    ) {
      let lo = 0,
        hi = dt;
      for (let j = 0; j < 30; j++) {
        const mid = (lo + hi) / 2;
        const v = kersDriveStep(state, input, mid, p).state.v;
        if (phase === 'accelerate' ? v < target : v > target) lo = mid;
        else hi = mid;
      }
      q = kersDriveStep(state, input, hi, p);
      if (phase === 'accelerate') {
        phase = 'brake';
        brakingStart = 0.5 * p.mass * q.state.v ** 2;
      } else phase = 'done';
    }
    state = q.state;
    if (brakingStart > 0) released = brakingStart - 0.5 * p.mass * state.v ** 2;
    discs.step(q.pBrakes * 0.6, q.pBrakes * 0.4, state.v, dt);
    telemetry.push({ t: state.t, ...q, v: state.v });
  }
  function draw(): void {
    hudValues.update({ v: state.v, a: q.a });
    pedalButtons[0]?.setLevel(input.throttle);
    pedalButtons[1]?.setLevel(input.brake);
    gauge.value = state.battery.energy / p.battery.capacity;
    const text =
      phase === 'done'
        ? '✓ Scenario concluso a 100 km/h'
        : state.battery.depleted
          ? '⚠ Batteria scarica: MGU-K motrice disattivata'
          : q.pKers > 1
            ? '▶ Erogazione — motore (Lorentz)'
            : q.pKers < -1
              ? '↯ Recupero — generatore (Faraday-Lenz)'
              : '● MGU-K inattiva';
    if (status.textContent !== text) status.textContent = text;
    readouts.update({
      v: state.v,
      a: q.a,
      g: q.a / 9.80665,
      kers: q.pKers,
      brakes: q.pBrakes,
      soc: gauge.value,
      energy: state.battery.energy,
      example: kineticEnergyDelta(800, kmhToMs(300), kmhToMs(100)),
      released,
      harvested: state.harvested,
      deployed: state.deployed,
    });
    formulas.update({
      force: q.a,
      deploy: Math.max(0, q.pKers),
      harvest: Math.max(0, -q.pKers) * p.efficiency,
      kinetic: released,
    });
    scene?.frame({
      x: state.x,
      v: phase === 'done' ? 0 : state.v,
      distance: state.x + 500,
      timeScale: 1,
      pitch: Math.max(-0.025, Math.min(0.04, -q.a * 0.002)),
      heave: 0,
      tFront: discs.tFront,
      tRear: discs.tRear,
      batteryFill: gauge.value,
      pMech: -q.pKers,
      pElec: q.pKers > 0 ? -q.pKers / p.efficiency : -q.pKers * p.efficiency,
      pLoss: q.pLoss,
      texts: {
        mguk: `MGU-K ${ctx.formatIT(q.pKers / 1000, 1, 'kW')}`,
        battery: `Batteria ${ctx.formatIT(gauge.value * 100, 1, '%')}`,
        discFront: `Disco ant. ${ctx.formatIT(discs.tFront - 273.15, 1, '°C')}`,
        discRear: `Disco post. ${ctx.formatIT(discs.tRear - 273.15, 1, '°C')}`,
      },
    });
    scene?.stage.render();
  }
  const loop = createLoop({ step, render: draw }, { autoStart: !ctx.reducedMotion });
  const toolbar = createSimToolbar(layout.toolbar, { loop, onReset: () => reset(false) });
  const keydown = (e: KeyboardEvent): void => {
    if (!interactive || isEditing(e.target) || e.ctrlKey || e.altKey || e.metaKey) return;
    const key = e.key.toLowerCase();
    if (!['w', 's', 'arrowup', 'arrowdown'].includes(key)) return;
    e.preventDefault();
    keys.add(key);
    phase = 'manual';
  };
  const keyup = (e: KeyboardEvent): void => {
    keys.delete(e.key.toLowerCase());
  };
  const release = (): void => {
    keys.clear();
    throttleKey = brakeKey = 0;
    pedalButtons.forEach((button) => button.release());
  };
  document.addEventListener('keydown', keydown);
  document.addEventListener('keyup', keyup);
  window.addEventListener('blur', release);
  document.addEventListener('visibilitychange', release);
  const debug = registerDebugHook(id, () => ({
    t: state.t,
    v: state.v,
    a: q.a,
    input: { ...input },
    phase,
    soc: gauge.value,
    depleted: state.battery.depleted,
    pKers: q.pKers,
    released,
    residual:
      0.5 * p.mass * state.v ** 2 +
      state.battery.energy +
      state.dissipated -
      initialEnergy -
      state.engineWork,
    renderer: scene?.info() ?? null,
  }));
  draw();
  const handle = {
    dispose() {
      if (disposed) return;
      disposed = true;
      loop.dispose();
      toolbar.dispose();
      debug();
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', release);
      off.forEach((fn) => fn());
      pedalButtons.forEach((button) => button.dispose());
      sliders.forEach((s) => s.dispose());
      preset.dispose();
      enginePresets?.dispose();
      scenario.dispose();
      telemetry.dispose();
      formulas.dispose();
      readouts.dispose();
      hudValues.dispose();
      scene?.dispose();
      layout.dispose();
      if (mounts.get(host) === handle) mounts.delete(host);
    },
  };
  mounts.set(host, handle);
  return handle;
}
