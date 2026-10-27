import type { Induction } from './model';

/**
 * Italian status text for the current induction state (pure, testable).
 * "Vista dal magnete" = seen from the tip of the coil normal n̂ (see model.ts).
 */
export function describeStatus(ind: Pick<Induction, 'dir' | 'facePole' | 'force' | 'v'>): {
  main: string;
  sub: string;
} {
  if (ind.dir === 'nessuna' || ind.facePole === null) {
    return {
      main: 'Magnete fermo: il flusso non varia, nessuna corrente indotta.',
      sub: 'Nessuna forza sul magnete.',
    };
  }
  const opposes = ind.v < 0 ? 'all’avvicinamento' : 'all’allontanamento';
  return {
    main: `Il polo affacciato della bobina è ${ind.facePole} → si oppone ${opposes}.`,
    sub: `Corrente indotta in verso ${ind.dir} (vista dal magnete) · forza sul magnete ${ind.force}.`,
  };
}
