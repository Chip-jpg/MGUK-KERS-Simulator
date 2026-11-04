/** Parts of the teardown (button labels, braking-role captions) and the automatic tour. */
import type { PartId } from './stage';

/** Visit order of the tour: the energy path wheel → gears → stator/rotor → inverter → battery. */
export const PART_INFO: ReadonlyArray<{ id: PartId; labelIT: string; captionIT: string }> = [
  {
    id: 'wheel',
    labelIT: 'Ruota',
    captionIT:
      'Ruota: in frenata il suo moto è ciò che si vuole recuperare; la trasmissione la collega all’MGU-K, che la rallenta insieme ai freni.',
  },
  {
    id: 'gears',
    labelIT: 'Riduzione 18:60',
    captionIT:
      'Riduzione 18:60: il pignone da 18 denti gira 60/18 volte più veloce dell’ingranaggio da 60 e porta il rotore al regime elevato.',
  },
  {
    id: 'stator',
    labelIT: 'Statore',
    captionIT:
      'Statore: i magneti in rotazione inducono nei suoi avvolgimenti di rame una tensione (EMF) e una corrente trifase: è la frenata elettrica.',
  },
  {
    id: 'rotor',
    labelIT: 'Rotore',
    captionIT:
      'Rotore: i magneti permanenti ruotano nel campo dello statore; la coppia resistente che ne nasce frena la vettura.',
  },
  {
    id: 'inverter',
    labelIT: 'Inverter',
    captionIT:
      'Inverter: raddrizza la corrente alternata trifase dell’MGU-K in corrente continua ad alta tensione per la batteria.',
  },
  {
    id: 'battery',
    labelIT: 'Batteria',
    captionIT:
      'Batteria: immagazzina l’energia recuperata; il livello di carica sale finché dura la frenata (nastro viola acceso).',
  },
];

/** Time spent on each part during the tour [ms]. */
export const TOUR_STEP_MS = 4000;

export interface Tour {
  readonly running: boolean;
  start(): void;
  /** Stop on user input; leaves the current focus as it is. */
  stop(): void;
  dispose(): void;
}

/** Steps through the parts every `stepMs`, looping, until `stop()`. */
export function createTour(o: {
  onStep(id: PartId): void;
  onState(running: boolean): void;
  stepMs?: number;
}): Tour {
  let timer: ReturnType<typeof setInterval> | null = null;
  let i = 0;
  const step = (): void => o.onStep(PART_INFO[i++ % PART_INFO.length]!.id);
  const halt = (): void => {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
    o.onState(false);
  };
  return {
    get running() {
      return timer !== null;
    },
    start() {
      if (timer !== null) return;
      i = 0;
      o.onState(true);
      step();
      timer = setInterval(step, o.stepMs ?? TOUR_STEP_MS);
    },
    stop: halt,
    dispose() {
      if (timer !== null) clearInterval(timer);
      timer = null;
    },
  };
}
