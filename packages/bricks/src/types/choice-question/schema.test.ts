import { runSchemaSuite } from '../../../test/suite';

runSchemaSuite('choice_question', [
  { name: 'énoncé de 2 caractères', make: (p) => ({ ...p, stem: 'ok' }) },
  { name: 'énoncé de 601 caractères', make: (p) => ({ ...p, stem: 'x'.repeat(601) }) },
  { name: 'une seule option', make: (p) => ({ ...p, options: p.options.slice(0, 1) }) },
  {
    name: 'sept options',
    make: (p) => ({
      ...p,
      options: Array.from({ length: 7 }, (_, index) => ({
        id: `o${String(index)}`,
        text: `Option ${String(index)}`,
        correct: index === 0,
        notionId: null,
      })),
    }),
  },
  {
    name: 'texte d’option vide',
    make: (p) => ({ ...p, options: p.options.map((o, i) => (i === 0 ? { ...o, text: '' } : o)) }),
  },
  {
    name: 'justification de 301 caractères',
    make: (p) => ({
      ...p,
      options: p.options.map((o, i) => (i === 0 ? { ...o, rationale: 'x'.repeat(301) } : o)),
    }),
  },
  { name: 'explication de 9 caractères', make: (p) => ({ ...p, explanation: 'x'.repeat(9) }) },
  { name: 'objectif de 2 caractères', make: (p) => ({ ...p, objective: 'ok' }) },
  {
    name: 'identifiant d’option invalide',
    make: (p) => ({ ...p, options: p.options.map((o, i) => (i === 0 ? { ...o, id: 'A' } : o)) }),
  },
]);
