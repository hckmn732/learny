import { runSchemaSuite } from '../../../test/suite';

runSchemaSuite('matching', [
  { name: 'consigne de 2 caractères', make: (p) => ({ ...p, instruction: 'ok' }) },
  { name: 'consigne de 301 caractères', make: (p) => ({ ...p, instruction: 'x'.repeat(301) }) },
  { name: 'une seule paire', make: (p) => ({ ...p, pairs: p.pairs.slice(0, 1) }) },
  {
    name: 'neuf paires',
    make: (p) => ({
      ...p,
      pairs: Array.from({ length: 9 }, (_, index) => ({
        id: `p${String(index)}`,
        left: `Gauche ${String(index)}`,
        right: `Droite ${String(index)}`,
        notionId: '11111111-1111-4111-8111-111111111111',
      })),
    }),
  },
  {
    name: 'gauche vide',
    make: (p) => ({
      ...p,
      pairs: p.pairs.map((pair, i) => (i === 0 ? { ...pair, left: '' } : pair)),
    }),
  },
  {
    name: 'droite de 201 caractères',
    make: (p) => ({
      ...p,
      pairs: p.pairs.map((pair, i) => (i === 0 ? { ...pair, right: 'x'.repeat(201) } : pair)),
    }),
  },
  { name: 'quatre droits en trop', make: (p) => ({ ...p, extraRights: ['a', 'b', 'c', 'd'] }) },
  {
    name: 'droit en trop de 201 caractères',
    make: (p) => ({ ...p, extraRights: ['x'.repeat(201)] }),
  },
  { name: 'explication de 9 caractères', make: (p) => ({ ...p, explanation: 'x'.repeat(9) }) },
]);
