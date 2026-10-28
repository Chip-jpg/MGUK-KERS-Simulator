/**
 * Theory sections the quiz is tagged with (ids = file stems in content/theory/;
 * `tests/quiz/bank.test.ts` checks that every id exists there).
 */
export const SECTIONS = [
  { id: '01-flusso-campo-magnetico', labelIT: '01 · Flusso del campo magnetico' },
  { id: '02-esperimenti-e-principio-induzione', labelIT: '02 · Esperimenti e principio' },
  { id: '03-faraday-neumann', labelIT: '03 · Legge di Faraday-Neumann' },
  { id: '04-lenz', labelIT: '04 · Legge di Lenz' },
  { id: '05-autoinduzione-induttanza', labelIT: '05 · Autoinduzione e induttanza' },
  { id: '06-circuito-rl-energia-campo', labelIT: '06 · Circuito RL ed energia' },
  { id: '07-alternatore-corrente-alternata', labelIT: '07 · Alternatore e corrente alternata' },
  { id: '08-trasformatore-trasporto-joule', labelIT: '08 · Trasformatore ed effetto Joule' },
  { id: '09-motore-elettrico-lorentz', labelIT: '09 · Motore elettrico e Lorentz' },
  { id: '10-kers-mguk', labelIT: '10 · KERS e MGU-K' },
  { id: '11-agenda-2030-goal-9', labelIT: '11 · Agenda 2030, Goal 9' },
  { id: '12-art-32-costituzione', labelIT: '12 · Art. 32 della Costituzione' },
  { id: '13-filo-logico-interrogazione', labelIT: '13 · Filo logico' },
  { id: '14-glossario', labelIT: '14 · Glossario' },
  { id: '16-pmsm-dq', labelIT: '16 · Modello d-q della PMSM' },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];

export function sectionLabel(id: string): string {
  return SECTIONS.find((s) => s.id === id)?.labelIT ?? id;
}
