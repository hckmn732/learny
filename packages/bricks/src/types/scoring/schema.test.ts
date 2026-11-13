import { runSchemaSuite } from '../../../test/suite';

runSchemaSuite('scoring', [
  { name: 'total nul', make: (p) => ({ ...p, total: 0 }) },
  { name: 'total de 101', make: (p) => ({ ...p, total: 101 }) },
  { name: 'seuil au-dessus du total', make: (p) => ({ ...p, threshold: 21 }) },
  { name: 'seuil négatif', make: (p) => ({ ...p, threshold: -1 }) },
  {
    name: '101 poids',
    make: (p) => ({
      ...p,
      weights: Array.from({ length: 101 }, () => ({
        brickId: '11111111-1111-4111-8111-111111111111',
        points: 1,
      })),
    }),
  },
  {
    name: 'poids nul',
    make: (p) => ({ ...p, weights: p.weights.map((w, i) => (i === 0 ? { ...w, points: 0 } : w)) }),
  },
  { name: 'affichage inconnu', make: (p) => ({ ...p, display: 'bar' }) },
  { name: 'mode inconnu', make: (p) => ({ ...p, mode: 'custom' }) },
]);
