import { runSchemaSuite } from '../../../test/suite';

runSchemaSuite('resource_excerpt', [
  { name: 'citation vide', make: (p) => ({ ...p, quote: '' }) },
  { name: 'citation de 1 001 caractères', make: (p) => ({ ...p, quote: 'x'.repeat(1001) }) },
  { name: 'libellé vide', make: (p) => ({ ...p, label: '' }) },
  { name: 'libellé de 81 caractères', make: (p) => ({ ...p, label: 'x'.repeat(81) }) },
  {
    name: 'ancre de 201 caractères',
    make: (p) => ({ ...p, location: { anchor: 'x'.repeat(201) } }),
  },
  { name: 'page zéro', make: (p) => ({ ...p, location: { page: 0 } }) },
  {
    name: 'fin avant début en secondes',
    make: (p) => ({ ...p, location: { startSec: 10, endSec: 9 } }),
  },
  {
    name: 'fin égale au début en caractères',
    make: (p) => ({ ...p, location: { charStart: 5, charEnd: 5 } }),
  },
  { name: 'localisation vide', make: (p) => ({ ...p, location: {} }) },
]);
