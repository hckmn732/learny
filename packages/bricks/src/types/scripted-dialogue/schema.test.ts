import { runSchemaSuite } from '../../../test/suite';

runSchemaSuite('scripted_dialogue', [
  { name: 'rôle de 2 caractères', make: (p) => ({ ...p, role: 'ok' }) },
  { name: 'rôle de 121 caractères', make: (p) => ({ ...p, role: 'x'.repeat(121) }) },
  { name: 'contexte de 9 caractères', make: (p) => ({ ...p, context: 'x'.repeat(9) }) },
  { name: 'contexte de 1 501 caractères', make: (p) => ({ ...p, context: 'x'.repeat(1501) }) },
  { name: 'objectif de 9 caractères', make: (p) => ({ ...p, learnerGoal: 'x'.repeat(9) }) },
  {
    name: 'condition de fin de 9 caractères',
    make: (p) => ({ ...p, endCondition: 'x'.repeat(9) }),
  },
  { name: 'réplique d’ouverture vide', make: (p) => ({ ...p, openingLine: '' }) },
  { name: 'réplique de 601 caractères', make: (p) => ({ ...p, openingLine: 'x'.repeat(601) }) },
  { name: 'trois tours', make: (p) => ({ ...p, maxTurns: 3 }) },
  { name: 'trente et un tours', make: (p) => ({ ...p, maxTurns: 31 }) },
  { name: 'aucun critère', make: (p) => ({ ...p, criteria: [] }) },
  {
    name: 'critère à 0 point',
    make: (p) => ({
      ...p,
      criteria: p.criteria.map((c, i) => (i === 0 ? { ...c, points: 0 } : c)),
    }),
  },
]);
