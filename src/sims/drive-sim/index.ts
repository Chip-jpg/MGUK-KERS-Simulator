import type { SimModule } from '../../core/types';
import { mountDrive } from '../shared/drive';
const sim: SimModule = {
  id: 'drive-sim',
  titleIT: 'Guida: acceleratore e freno',
  summaryIT:
    'Guida sul rettilineo con i pedali o ↑/W e ↓/S. Osserva la forza magnetica sui conduttori in accelerazione e Faraday-Lenz in frenata, poi prova lo scenario 300 → 100 km/h.',
  theoryId: '10-kers-mguk',
  mount: (host, ctx) => mountDrive(host, ctx, true),
};
export default sim;
