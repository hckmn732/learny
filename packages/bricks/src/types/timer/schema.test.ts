import { runSchemaSuite } from '../../../test/suite';

runSchemaSuite('timer', [
  { name: 'durée de 29 secondes', make: (p) => ({ ...p, durationSec: 29 }) },
  { name: 'durée de 14 401 secondes', make: (p) => ({ ...p, durationSec: 14401 }) },
  {
    name: '101 briques liées',
    make: (p) => ({
      ...p,
      itemBrickIds: Array.from({ length: 101 }, () => '11111111-1111-4111-8111-111111111111'),
    }),
  },
  { name: 'avertissement après la durée', make: (p) => ({ ...p, warnAtSec: 601 }) },
  { name: 'portée inconnue', make: (p) => ({ ...p, scope: 'module' }) },
  { name: 'identifiant de brique invalide', make: (p) => ({ ...p, itemBrickIds: ['x'] }) },
]);
