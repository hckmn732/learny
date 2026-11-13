import { runSchemaSuite } from '../../../test/suite';

runSchemaSuite('cloze', [
  { name: 'gabarit de 9 caractères', make: (p) => ({ ...p, template: '{{1}} xxx' }) },
  {
    name: 'gabarit de 1 001 caractères',
    make: (p) => ({ ...p, template: `${'x'.repeat(1001)} {{1}}` }),
  },
  { name: 'aucun trou', make: (p) => ({ ...p, gaps: [] }) },
  {
    name: 'onze trous',
    make: (p) => ({
      ...p,
      gaps: Array.from({ length: 11 }, (_, index) => ({
        id: index + 1,
        answers: ['x'],
      })),
    }),
  },
  {
    name: 'trou d’identifiant zéro',
    make: (p) => ({ ...p, gaps: p.gaps.map((g, i) => (i === 0 ? { ...g, id: 0 } : g)) }),
  },
  {
    name: 'aucune réponse',
    make: (p) => ({ ...p, gaps: p.gaps.map((g, i) => (i === 0 ? { ...g, answers: [] } : g)) }),
  },
  {
    name: 'réponse vide',
    make: (p) => ({ ...p, gaps: p.gaps.map((g, i) => (i === 0 ? { ...g, answers: [''] } : g)) }),
  },
  {
    name: 'réponse de 61 caractères',
    make: (p) => ({
      ...p,
      gaps: p.gaps.map((g, i) => (i === 0 ? { ...g, answers: ['x'.repeat(61)] } : g)),
    }),
  },
  {
    name: 'indice de 61 caractères',
    make: (p) => ({
      ...p,
      gaps: p.gaps.map((g, i) => (i === 0 ? { ...g, hint: 'x'.repeat(61) } : g)),
    }),
  },
  { name: 'explication de 9 caractères', make: (p) => ({ ...p, explanation: 'x'.repeat(9) }) },
]);
