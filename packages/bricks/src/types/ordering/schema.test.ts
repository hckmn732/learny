import { runSchemaSuite } from '../../../test/suite';

runSchemaSuite('ordering', [
  { name: 'consigne de 2 caractères', make: (p) => ({ ...p, instruction: 'ok' }) },
  { name: 'consigne de 301 caractères', make: (p) => ({ ...p, instruction: 'x'.repeat(301) }) },
  { name: 'deux items', make: (p) => ({ ...p, items: p.items.slice(0, 2) }) },
  {
    name: 'onze items',
    make: (p) => ({
      ...p,
      items: Array.from({ length: 11 }, (_, index) => ({
        id: `i${String(index)}`,
        text: `Item ${String(index)}`,
      })),
    }),
  },
  {
    name: 'texte vide',
    make: (p) => ({
      ...p,
      items: p.items.map((item, i) => (i === 0 ? { ...item, text: '' } : item)),
    }),
  },
  {
    name: 'texte de 161 caractères',
    make: (p) => ({
      ...p,
      items: p.items.map((item, i) => (i === 0 ? { ...item, text: 'x'.repeat(161) } : item)),
    }),
  },
  { name: 'explication de 9 caractères', make: (p) => ({ ...p, explanation: 'x'.repeat(9) }) },
]);
