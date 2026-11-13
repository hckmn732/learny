import { runSchemaSuite } from '../../../test/suite';

runSchemaSuite('open_question', [
  { name: 'énoncé de 2 caractères', make: (p) => ({ ...p, stem: 'ok' }) },
  { name: 'énoncé de 601 caractères', make: (p) => ({ ...p, stem: 'x'.repeat(601) }) },
  { name: 'aucun élément attendu', make: (p) => ({ ...p, expectedElements: [] }) },
  {
    name: 'neuf éléments attendus',
    make: (p) => ({ ...p, expectedElements: Array.from({ length: 9 }, () => 'xx') }),
  },
  {
    name: 'élément attendu de 1 caractère',
    make: (p) => ({ ...p, expectedElements: ['x'] }),
  },
  { name: 'aucun critère', make: (p) => ({ ...p, criteria: [] }) },
  {
    name: 'sept critères',
    make: (p) => ({
      ...p,
      criteria: Array.from({ length: 7 }, (_, index) => ({
        key: `c${String(index)}`,
        label: 'Critère',
        points: 1,
        description: '',
      })),
    }),
  },
  {
    name: 'critère sans label',
    make: (p) => ({
      ...p,
      criteria: p.criteria.map((c, i) => (i === 0 ? { ...c, label: 'x' } : c)),
    }),
  },
  {
    name: 'critère à 11 points',
    make: (p) => ({
      ...p,
      criteria: p.criteria.map((c, i) => (i === 0 ? { ...c, points: 11 } : c)),
    }),
  },
  { name: 'réponse maximale de 49 caractères', make: (p) => ({ ...p, answerMaxChars: 49 }) },
  { name: 'réponse maximale de 4 001 caractères', make: (p) => ({ ...p, answerMaxChars: 4001 }) },
  { name: 'réponse modèle de 9 caractères', make: (p) => ({ ...p, modelAnswer: 'x'.repeat(9) }) },
  { name: 'explication de 9 caractères', make: (p) => ({ ...p, explanation: 'x'.repeat(9) }) },
  { name: 'objectif de 2 caractères', make: (p) => ({ ...p, objective: 'ok' }) },
]);
